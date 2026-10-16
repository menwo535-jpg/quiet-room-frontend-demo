// Independent order-intake fixture. It never contacts an external service.
const clone = value => structuredClone(value);
export const sampleOrder = () => ({ eventId: 'evt-demo-01', items: [{ sku: 'DEMO-A', quantity: 2 }] });
const result = (status, outcome, extra = {}) => ({ status, body: { outcome, ...extra } });

function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.eventId !== 'string' || !payload.eventId.trim()) return null;
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 100) return null;
  const items = [];
  for (const item of payload.items) {
    if (!item || typeof item.sku !== 'string' || !item.sku.trim() ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) return null;
    items.push({ sku: item.sku.trim(), quantity: item.quantity });
  }
  return { eventId: payload.eventId.trim(), items };
}

export function createFixture(mode = 'corrected') {
  if (!['corrected', 'defective'].includes(mode)) throw new Error('Unknown fixture mode');
  const completed = new Map();
  const effects = [];
  const trace = [];
  const log = (step, detail) => trace.push({ sequence: trace.length + 1, step, detail });
  function downstream(behavior, order) {
    log('downstream_attempt', { behavior });
    if (behavior === 'timeout') { log('downstream_timeout', {}); return { timeout: true }; }
    if (behavior === 'rate_limit') return { status: 429, body: { accepted: false }, retryAfter: 1 };
    if (behavior === 'unavailable') return { status: 503, body: { accepted: false } };
    if (behavior === 'declined') return { status: 200, body: { accepted: false, reason: 'fixture_decline' } };
    const effect = { orderId: `order-${effects.length + 1}`, eventId: order.eventId, items: clone(order.items) };
    effects.push(effect);
    log('order_created', effect);
    return { status: 200, body: { accepted: true, orderId: effect.orderId } };
  }
  async function receive(payload, behavior = 'success') {
    if (!['success', 'timeout', 'rate_limit', 'unavailable', 'declined'].includes(behavior)) throw new Error('Unknown fixture behavior');
    log('request_received', clone(payload));
    if (mode === 'defective') {
      // Three deliberate defects: incomplete validation, no replay tracking,
      // and converting every downstream response/failure into success.
      if (!payload || !Array.isArray(payload.items)) return result(400, 'invalid');
      const response = downstream(behavior, payload);
      log('responded', { status: 200, outcome: 'confirmed' });
      return result(200, 'confirmed', { orderId: response.body?.orderId ?? null });
    }
    const order = normalize(payload);
    if (!order) { log('validation_rejected', {}); return result(400, 'invalid'); }
    const fingerprint = JSON.stringify(order.items);
    const existing = completed.get(order.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        log('event_conflict', {});
        return result(409, 'conflict');
      }
      log('replay_returned', { orderId: existing.orderId });
      return result(200, 'confirmed', { orderId: existing.orderId, replay: true });
    }
    const response = downstream(behavior, order);
    if (response.timeout) return result(504, 'retryable_failure');
    if (response.status === 429) return result(429, 'deferred', { retryAfter: response.retryAfter });
    if (response.status >= 500) return result(502, 'retryable_failure');
    if (response.status !== 200 || response.body.accepted !== true) return result(422, 'declined');
    completed.set(order.eventId, { fingerprint, orderId: response.body.orderId });
    log('completion_recorded', { eventId: order.eventId });
    return result(200, 'confirmed', { orderId: response.body.orderId, replay: false });
  }
  return { receive, snapshot: () => ({ effects: clone(effects), trace: clone(trace), completedEvents: completed.size }) };
}

const step = (payload, status, outcome, effects, behavior = 'success', extra = {}) =>
  ({ payload, behavior, expect: { status, outcome, effects, ...extra } });
export function scenarios() {
  const order = sampleOrder;
  return [
    { id: 'C01', name: 'Valid event', category: 'Happy path', why: 'A valid order creates exactly one downstream record.', steps: [step(order(), 200, 'confirmed', 1)] },
    { id: 'C02', name: 'Missing event ID', category: 'Validation', why: 'A request without a stable event ID must stop before a downstream write.', steps: [step({ items: order().items }, 400, 'invalid', 0)] },
    { id: 'C03', name: 'Empty item list', category: 'Validation', why: 'An empty order should not be treated as a completed order.', steps: [step({ ...order(), items: [] }, 400, 'invalid', 0)] },
    { id: 'C04', name: 'Fractional quantity', category: 'Validation', why: 'The agreed fixture contract allows whole units only.', steps: [step({ ...order(), items: [{ sku: 'DEMO-A', quantity: 1.5 }] }, 400, 'invalid', 0)] },
    { id: 'C05', name: 'Zero quantity', category: 'Validation', why: 'A non-positive quantity is rejected before calling the destination.', steps: [step({ ...order(), items: [{ sku: 'DEMO-A', quantity: 0 }] }, 400, 'invalid', 0)] },
    { id: 'C06', name: 'Same event delivered twice', category: 'Replay', why: 'A retry returns the prior outcome and does not create a second order.', steps: [step(order(), 200, 'confirmed', 1), step(order(), 200, 'confirmed', 1, 'success', { replay: true })] },
    { id: 'C07', name: 'Same ID, changed payload', category: 'Replay', why: 'Reusing an ID for different content must surface a conflict.', steps: [step(order(), 200, 'confirmed', 1), step({ ...order(), items: [{ sku: 'DEMO-A', quantity: 3 }] }, 409, 'conflict', 1)] },
    { id: 'C08', name: 'Destination timeout', category: 'Failure handling', why: 'A known pre-write timeout is a retryable failure, not confirmation.', steps: [step(order(), 504, 'retryable_failure', 0, 'timeout')] },
    { id: 'C09', name: 'Retry after pre-write timeout', category: 'Failure handling', why: 'A failed attempt must not consume the event and block its safe retry.', steps: [step(order(), 504, 'retryable_failure', 0, 'timeout'), step(order(), 200, 'confirmed', 1)] },
    { id: 'C10', name: 'Destination rate limit', category: 'Failure handling', why: 'Expose the retry signal without inventing a successful order.', steps: [step(order(), 429, 'deferred', 0, 'rate_limit', { retryAfter: 1 })] },
    { id: 'C11', name: 'Destination unavailable', category: 'Failure handling', why: 'A destination failure must reach the caller or its agreed fallback.', steps: [step(order(), 502, 'retryable_failure', 0, 'unavailable')] },
    { id: 'C12', name: 'HTTP 200, business declined', category: 'Business outcome', why: 'Transport success alone does not prove the order was accepted.', steps: [step(order(), 422, 'declined', 0, 'declined')] },
  ];
}

export function compareStep(expected, response, snapshot) {
  const actual = { status: response.status, outcome: response.body?.outcome, effects: snapshot.effects.length };
  for (const key of ['replay', 'retryAfter']) if (key in expected) actual[key] = response.body?.[key];
  const differences = Object.entries(expected).filter(([key, value]) => actual[key] !== value)
    .map(([field, wanted]) => ({ field, expected: wanted, actual: actual[field] ?? null }));
  return { actual, differences, passed: differences.length === 0 };
}

export async function runSuite(mode, adapterFactory = createFixture) {
  const startedAt = new Date().toISOString();
  const cases = [];
  for (const scenario of scenarios()) {
    const fixture = await adapterFactory(mode);
    const observations = [];
    for (const instruction of scenario.steps) {
      const response = await fixture.receive(clone(instruction.payload), instruction.behavior);
      const snapshot = await fixture.snapshot();
      observations.push({ input: clone(instruction.payload), behavior: instruction.behavior,
        expected: instruction.expect, response, ...compareStep(instruction.expect, response, snapshot), trace: snapshot.trace });
    }
    cases.push({ ...scenario, passed: observations.every(x => x.passed), observations });
  }
  return { schemaVersion: 1, sample: 'Workflow Checkbook', mode, startedAt, finishedAt: new Date().toISOString(),
    provenance: 'Independent synthetic order-intake fixture. No client workflow, n8n runtime, voice platform or external service tested.',
    limits: ['Sequential, in-memory fixture only; no concurrent delivery or restart durability claim.',
      'Timeout is injected before any destination write; an unknown post-write outcome needs reconciliation and is not covered.',
      'No voice quality, live calls, production load, or LLM behavior tested.'],
    passed: cases.filter(x => x.passed).length, total: cases.length, cases };
}

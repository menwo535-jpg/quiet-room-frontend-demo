import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture, compareStep, runSuite, sampleOrder } from './core.mjs';

test('reference passes the agreed 12 functional scenarios', async () => {
  const report = await runSuite('corrected');
  assert.equal(report.total, 12);
  assert.equal(report.passed, 12);
});
test('same matrix detects every planted defect instead of blessing HTTP200', async () => {
  const report = await runSuite('defective');
  assert.deepEqual(report.cases.filter(x => x.passed).map(x => x.id), ['C01']);
  const decline = report.cases.find(x => x.id === 'C12').observations[0];
  assert.equal(decline.actual.status, 200);
  assert.equal(decline.expected.status, 422);
  assert.equal(decline.passed, false);
});
test('reports cannot pass if response matches but side effects do not', () => {
  const check = compareStep({ status: 200, outcome: 'confirmed', effects: 1 },
    { status: 200, body: { outcome: 'confirmed' } }, { effects: [{}, {}] });
  assert.equal(check.passed, false);
  assert.deepEqual(check.differences, [{ field: 'effects', expected: 1, actual: 2 }]);
});
test('quantity and shape boundaries stop before downstream writes', async () => {
  const bad = [null, [], {}, {eventId:'   ',items:sampleOrder().items},
    ...[0,-1,1.5,'2',true,null,NaN,Infinity,10001].map(quantity => ({...sampleOrder(),items:[{sku:'A',quantity}]})),
    {...sampleOrder(),items:[null]}, {...sampleOrder(),items:[{sku:' ',quantity:1}]}];
  for (const payload of bad) {
    const fixture = createFixture();
    assert.equal((await fixture.receive(payload)).status, 400);
    assert.equal(fixture.snapshot().trace.some(x => x.step === 'downstream_attempt'), false);
  }
});
test('payload and evidence snapshots cannot modify stored results', async () => {
  const fixture = createFixture();
  const payload = sampleOrder();
  await fixture.receive(payload);
  payload.items[0].quantity = 999;
  const evidence = fixture.snapshot();
  evidence.effects[0].items[0].quantity = 888;
  evidence.trace.length = 0;
  assert.equal(fixture.snapshot().effects[0].items[0].quantity, 2);
  assert.equal((await fixture.receive(sampleOrder())).body.replay, true);
  assert.ok(fixture.snapshot().trace.length > 0);
});
test('changed-content conflict cannot mutate prior destination order', async () => {
  const fixture = createFixture();
  const first = await fixture.receive(sampleOrder());
  const changed = {...sampleOrder(),items:[{sku:'OTHER',quantity:2}]};
  assert.equal((await fixture.receive(changed)).status,409);
  const replay = await fixture.receive(sampleOrder());
  assert.equal(replay.body.orderId,first.body.orderId);
  assert.equal(fixture.snapshot().effects.length,1);
  assert.equal(fixture.snapshot().effects[0].items[0].sku,'DEMO-A');
});

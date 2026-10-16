// Decimal arithmetic and CSV validation for the browser-only Draftdesk preview.
// No network, credentials, filesystem paths or external dependencies.
export const HEADERS = {
  request: ['code', 'description', 'quantity', 'unit'],
  catalogue: ['code', 'description', 'unit', 'unit_price', 'currency', 'price_version'],
};
export const SAMPLE_REQUEST = `code,description,quantity,unit
MCB-16,Circuit breaker 16A,2,EA
CABLE-25,Cable 2.5 mm2,12.5,M
UNKNOWN-9,Unlisted part,1,EA
MCB-32,Circuit breaker 32A,3,BOX
RELAY-12,Relay 12V,0,EA
CONTACT-1,Contactor,1,EA`;
export const SAMPLE_CATALOGUE = `code,description,unit,unit_price,currency,price_version
MCB-16,Circuit breaker 16A,EA,8.75,USD,DEMO-v1
CABLE-25,Cable 2.5 mm2,M,1.20,USD,DEMO-v1
MCB-32,Circuit breaker 32A,EA,12.00,USD,DEMO-v1
RELAY-12,Relay 12V,EA,4.30,USD,DEMO-v1
CONTACT-1,Contactor,EA,18.00,USD,DEMO-v1
CONTACT-1,Contactor,EA,19.00,USD,DEMO-v1`;
export const CLEAN_REQUEST = `code,description,quantity,unit
MCB-16,Circuit breaker 16A,2,EA
CABLE-25,Cable 2.5 mm2,12.5,M
MCB-32,Circuit breaker 32A,3,EA
RELAY-12,Relay 12V,1,EA
CONTACT-1,Contactor,1,EA`;
export const CLEAN_CATALOGUE = SAMPLE_CATALOGUE.split('\n').slice(0,-1).join('\n');
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
const currencies = new Set(['USD', 'EUR', 'GBP', 'CNY']);

export function parseCSV(text, kind) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 700000) throw new Error('Use a CSV file smaller than 700 KB.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  function pushField() { row.push(field); field = ''; closed = false; }
  function pushRow() { pushField(); if (row.some(v => v.trim())) rows.push(row); row = []; }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; pushRow(); }
    else if (c === '"') { if (field || closed) throw new Error('Invalid CSV: a quote must start a field.'); quoted = true; }
    else { if (closed) throw new Error('Invalid CSV: unexpected text after a closing quote.'); field += c; }
  }
  if (quoted) throw new Error('Invalid CSV: a quoted field is not closed.');
  if (field || row.length || closed) pushRow();
  if (!rows.length) throw new Error('The CSV is empty. Load a sample or add a header and at least one row.');
  const header = rows.shift().map(v => v.trim());
  const required = HEADERS[kind];
  if (!required || header.length !== required.length || new Set(header).size !== header.length || required.some(v => !header.includes(v))) {
    throw new Error(`Expected these columns: ${(required || []).join(', ')}. Column order may vary.`);
  }
  if (!rows.length) throw new Error('Add at least one data row below the CSV header.');
  if (rows.length > 1000) throw new Error('This preview supports up to 1,000 rows per file.');
  return rows.map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV record ${index + 2} has ${values.length} fields; expected ${header.length}.`);
    return Object.fromEntries(header.map((h,i) => [h, values[i].trim()]));
  });
}

// Scale all inputs by 10,000. Round each line half-up to cents, never binary floats.
export function decimal(value, positive = false) {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  return positive && units === 0n ? null : units;
}
export function money(cents) { return `${cents / 100n}.${String(cents % 100n).padStart(2,'0')}`; }
export function reconcile(requestText, catalogueText) {
  const requests = parseCSV(requestText, 'request');
  const catalogue = parseCSV(catalogueText, 'catalogue');
  const byCode = new Map(), repeat = new Map(), totals = new Map();
  for (const item of catalogue) { const values = byCode.get(item.code) || []; values.push(item); byCode.set(item.code, values); }
  for (const item of requests) { const key = JSON.stringify([item.code, normalized(item.unit)]); repeat.set(key, (repeat.get(key) || 0) + 1); }
  const rows = requests.map((item, index) => {
    const row = {...item, line:index + 1, status:'review', reason:'', currency:'', unit_price:'', line_total:'', price_version:''};
    const candidates = byCode.get(item.code) || [];
    const quantity = decimal(item.quantity, true);
    if (!item.code) row.reason = 'Missing product code';
    else if (repeat.get(JSON.stringify([item.code, normalized(item.unit)])) > 1) row.reason = 'Repeated request code and unit';
    else if (quantity === null) row.reason = 'Quantity must be positive, up to 9 integer and 4 decimal digits';
    else if (!candidates.length) row.reason = 'Code not in catalogue';
    else if (candidates.length > 1) row.reason = 'Duplicate catalogue code';
    else {
      const match = candidates[0], price = decimal(match.unit_price);
      if (!item.description || normalized(item.description) !== normalized(match.description)) row.reason = 'Description differs from catalogue';
      else if (!item.unit || normalized(item.unit) !== normalized(match.unit)) row.reason = 'Unit differs from catalogue';
      else if (price === null) row.reason = 'Invalid catalogue price';
      else if (!currencies.has(match.currency)) row.reason = 'Currency must be USD, EUR, GBP or CNY';
      else if (!match.price_version) row.reason = 'Missing price version';
      else {
        const cents = (quantity * price + 500000n) / 1000000n;
        row.status = 'matched'; row.reason = 'Matched · approval pending';
        row.currency = match.currency; row.unit_price = match.unit_price; row.line_total = money(cents); row.price_version = match.price_version;
        totals.set(match.currency, (totals.get(match.currency) || 0n) + cents);
      }
    }
    return row;
  });
  const reviewCount = rows.filter(r => r.status === 'review').length;
  return {rows, reviewCount, complete:reviewCount === 0, subtotals:Object.fromEntries([...totals].map(([c,n]) => [c,money(n)]))};
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
}
export function exportCSV(result) {
  const columns = ['line','code','description','quantity','unit','currency','unit_price','line_total','status','reason','price_version'];
  return '\uFEFF' + [columns.join(','), ...result.rows.map(row => columns.map(c => csvCell(row[c])).join(','))].join('\r\n') + '\r\n';
}

// Editing the source uses lossless CSV quoting; formula neutralisation belongs
// to spreadsheet exports, not the user's product identifiers or descriptions.
export function replaceRequestRow(source, line, replacement) {
  const records = parseCSV(source, 'request');
  if (!Number.isInteger(line) || line < 1 || line > records.length) throw new Error('This request line is no longer available. Compare the inputs again.');
  if (!replacement || HEADERS.request.some(key => typeof replacement[key] !== 'string' || replacement[key].length > 2000)) throw new Error('Enter text for each request field, with no more than 2,000 characters per field.');
  records[line - 1] = Object.fromEntries(HEADERS.request.map(key => [key, replacement[key].trim()]));
  const quote = value => /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  const updated = [HEADERS.request.join(','), ...records.map(row => HEADERS.request.map(key => quote(row[key])).join(','))].join('\r\n');
  // Apply the same size/shape boundary before replacing any visible input.
  parseCSV(updated, 'request');
  return updated;
}

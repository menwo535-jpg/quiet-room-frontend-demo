import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,reconcile,exportCSV,replaceRequestRow,decimal,money,SAMPLE_REQUEST,SAMPLE_CATALOGUE,CLEAN_REQUEST,CLEAN_CATALOGUE,csvCell} from './core.mjs';
const request=(line)=>'code,description,quantity,unit\n'+line;
const catalogue=(line)=>'code,description,unit,unit_price,currency,price_version\n'+line;
test('sample withholds complete total and leaves four exceptions visible',()=>{
 const r=reconcile(SAMPLE_REQUEST,SAMPLE_CATALOGUE);assert.equal(r.rows.length,6);assert.equal(r.reviewCount,4);assert.equal(r.complete,false);assert.deepEqual(r.subtotals,{USD:'32.50'});assert.equal(r.rows[3].reason,'Unit differs from catalogue');
});
test('corrected scenario totals 90.80 without silently changing source inputs',()=>{const r=reconcile(CLEAN_REQUEST,CLEAN_CATALOGUE);assert.equal(r.rows.length,5);assert.equal(r.reviewCount,0);assert.equal(r.complete,true);assert.deepEqual(r.subtotals,{USD:'90.80'});assert.equal(reconcile(SAMPLE_REQUEST,SAMPLE_CATALOGUE).reviewCount,4);});
test('quoted commas, newlines, CRLF, escaped quotes, reordered headers and BOM',()=>{
 const rows=parseCSV('\uFEFFunit,quantity,description,code\r\nEA,2,"Bolt, \"\"fine\"\"\nthread",A\r\n','request');assert.deepEqual(rows,[{unit:'EA',quantity:'2',description:'Bolt, "fine"\nthread',code:'A'}]);
});
test('reject malformed quotes, duplicate headers, extra fields, empty files and no data',()=>{
 for(const source of ['','code,description,quantity,unit','code,description,quantity,unit\nA,"bad,1,EA','code,description,quantity,unit\nA,a,1,EA,extra','code,code,quantity,unit\nA,a,1,EA','code,description,quantity,unit\nA,"x"bad,1,EA'])assert.throws(()=>parseCSV(source,'request'));
});
test('money is exact and rounds each line half up at a half cent',()=>{
 assert.deepEqual(reconcile(request('A,Part,3,EA'),catalogue('A,Part,EA,0.335,USD,v1')).subtotals,{USD:'1.01'});
 assert.deepEqual(reconcile(request('A,Part,0.1,EA'),catalogue('A,Part,EA,0.2,USD,v1')).subtotals,{USD:'0.02'});
 assert.equal(money(0n),'0.00');assert.equal(decimal('999999999.9999'),9999999999999n);
 for(const v of ['-1','1e2','NaN','Infinity','1.23456','1000000000','.5','01'])assert.equal(decimal(v),null);
});
test('zero prices valid; zero quantities and negative prices not accepted',()=>{
 const r=reconcile(request('A,Part,1,EA'),catalogue('A,Part,EA,0,USD,v1'));assert.equal(r.reviewCount,0);assert.equal(r.rows[0].line_total,'0.00');assert.equal(reconcile(request('A,Part,0,EA'),catalogue('A,Part,EA,1,USD,v1')).reviewCount,1);assert.equal(reconcile(request('A,Part,1,EA'),catalogue('A,Part,EA,-1,USD,v1')).reviewCount,1);
});
test('all duplicate requests and duplicate catalogue codes require review',()=>{
 const r=reconcile(request('A,Part,1,EA\nA,Part,2,ea'),catalogue('A,Part,EA,2,USD,v1'));assert.equal(r.reviewCount,2);assert.deepEqual(r.subtotals,{});
 assert.equal(reconcile(request('A,Part,1,EA'),catalogue('A,Part,EA,2,USD,v1\nA,Part,EA,2,USD,v1')).reviewCount,1);
});
test('currencies remain separate and incomplete output never has a total across currencies',()=>{
 const r=reconcile(request('A,Part,2,EA\nB,Other,3,EA'),catalogue('A,Part,EA,1,USD,v1\nB,Other,EA,2,EUR,v1'));assert.deepEqual(r.subtotals,{USD:'2.00',EUR:'6.00'});
 assert.equal(reconcile(request('A,Part,1,EA'),catalogue('A,Part,EA,1,BTC,v1')).reviewCount,1);
});
test('code case is significant but description whitespace and unit case normalize',()=>{
 assert.equal(reconcile(request('A,PART   name,1,ea'),catalogue('A,Part name,EA,1,USD,v1')).reviewCount,0);
 assert.equal(reconcile(request('a,Part,1,EA'),catalogue('A,Part,EA,1,USD,v1')).reviewCount,1);
 assert.equal(reconcile(request('A,Wrong part,1,EA'),catalogue('A,Part,EA,1,USD,v1')).reviewCount,1);
 assert.equal(reconcile(request('A,Part,1,EA'),catalogue('A,Part,EA,1,USD,')).reviewCount,1);
});
test('CSV export escapes formula prefixes and preserves all exception rows',()=>{
 for(const value of ['=1+1','+cmd','-2','@SUM(A1)',' =foo','\tvalue'])assert.ok(csvCell(value).startsWith("'")||csvCell(value).startsWith('"\''));
 const result=reconcile(SAMPLE_REQUEST,SAMPLE_CATALOGUE);const csv=exportCSV(result);assert.ok(csv.startsWith('\uFEFFline,code'));assert.equal(csv.trim().split('\r\n').length,7);assert.ok(csv.includes('UNKNOWN-9'));assert.ok(csv.includes('32.50')===false);assert.equal(csvCell('a,"b"'),'"a,""b"""');
});
test('size and row limits reject oversized inputs',()=>{assert.throws(()=>parseCSV('x'.repeat(700001),'request'));assert.throws(()=>parseCSV(request(Array(1001).fill('A,Part,1,EA').join('\n')),'request'));});

test('request correction rechecks every line and leaves the old source and catalogue intact',()=>{
 const records=parseCSV(SAMPLE_REQUEST,'request');
 const corrected=replaceRequestRow(SAMPLE_REQUEST,4,{...records[3],unit:'EA'});
 const result=reconcile(corrected,SAMPLE_CATALOGUE);
 assert.equal(result.reviewCount,3);assert.deepEqual(result.subtotals,{USD:'68.50'});
 assert.equal(result.rows[3].line_total,'36.00');assert.equal(result.rows[5].reason,'Duplicate catalogue code');
 assert.equal(reconcile(SAMPLE_REQUEST,SAMPLE_CATALOGUE).reviewCount,4);
 assert.deepEqual(parseCSV(corrected,'request').filter((_,i)=>i!==3),records.filter((_,i)=>i!==3));
});
test('editing reordered CSV preserves quoted text and identifiers instead of spreadsheet-escaping source data',()=>{
 const source='unit,quantity,description,code\nEA,1,"Bolt, \"\"fine\"\"\nthread",=PART\nM,2,Other,B';
 const old=parseCSV(source,'request');
 const next=replaceRequestRow(source,1,{...old[0],quantity:'3.25'});
 assert.deepEqual(parseCSV(next,'request'),[{...old[0],quantity:'3.25'},old[1]]);
 assert.ok(exportCSV(reconcile(next,catalogue('=PART,"Bolt, \"\"fine\"\"\nthread",EA,1,USD,v1\nB,Other,M,1,USD,v1'))).includes("'=PART"));
});
test('request editor rejects missing or stale rows and oversized fields without hiding invalid business values',()=>{
 const entry={code:'A',description:'Part',quantity:'0',unit:'EA'};
 for(const line of [0,-1,1.5,2])assert.throws(()=>replaceRequestRow(request('A,Part,1,EA'),line,entry));
 assert.throws(()=>replaceRequestRow(request('A,Part,1,EA'),1,{...entry,code:null}));
 assert.throws(()=>replaceRequestRow(request('A,Part,1,EA'),1,{...entry,description:'x'.repeat(2001)}));
 const edited=replaceRequestRow(request('A,Part,1,EA'),1,entry);
 assert.equal(reconcile(edited,catalogue('A,Part,EA,1,USD,v1')).reviewCount,1);
});

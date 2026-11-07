const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/index.html','utf8');
const core=source.match(/<script id="review-core">([\s\S]*?)<\/script>/)[1];
const C=vm.runInNewContext(core+'; Core;');let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('quoted CSV commas, embedded newlines and escaped quotes',()=>{const r=C.parseCSV('id,label,description\r\nn12345678,"Doe, Demo","Line 1\nHe said ""Hi"""\r\n');assert.equal(r[0].label,'Doe, Demo');assert.equal(r[0].description,'Line 1\nHe said "Hi"');});
check('reject truncated quotes',()=>assert.throws(()=>C.parseCSV('id,label\nn12345678,"missing'),/Unclosed/));
check('reject inconsistent rows',()=>assert.throws(()=>C.parseCSV('id,label\nn12345678'),/number of columns/));
check('reject duplicate headers',()=>assert.throws(()=>C.parseCSV('id,id\na,b'),/duplicate/));
check('BOM and unknown columns are handled without property injection',()=>{const r=C.parseCSV('\uFEFFid,label,__proto__\nn12345678,Demo,pollution');assert.equal(r[0].id,'n12345678');assert.equal(Object.prototype.pollution,undefined);assert.equal(Object.hasOwn(r[0],'__proto__'),false);});
check('normalization does not accept imported approval status',()=>{const r=C.normalize({id:'N 12345678',label:' Demo ',aliases:[' A ',''],decision:'approved'});assert.equal(r.id,'n12345678');assert.equal(r.label,'Demo');assert.equal(r.aliases.join('|'),'A');assert.equal(r.decision,'pending');});
check('approval requires format and label',()=>{assert.equal(C.errors(C.normalize({id:'bad',label:''})).length,2);assert.equal(C.errors(C.normalize({id:'nb12345678',label:'Demo'})).length,0);});
check('exports exclude pending, rejected and invalid approved records',()=>{const ok=C.normalize({id:'n12345678',label:'Demo'});ok.decision='approved';const bad=C.normalize({id:'bad',label:'Bad'});bad.decision='approved';const pending=C.normalize({id:'n87654321',label:'Pending'});const rejected=C.normalize({id:'n11223344',label:'Rejected'});rejected.decision='rejected';assert.equal(C.approved([ok,bad,pending,rejected]).length,1);});
check('CSV export protects spreadsheet formulas',()=>{const r=C.normalize({id:'n12345678',label:'=1+1',description:'@SUM(1)'});const text=C.toCSV([r]);assert.ok(text.includes('"\'=1+1"'));assert.ok(text.includes('"\'@SUM(1)"'));assert.equal(r.label,'=1+1');});
for(const s of source.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);
console.log('PASS script syntax; '+checks+' behavior checks');

// Manual-sequence policy controls. Actual exports are audited separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createV0DriveAssembly} from '../site/viewer/v0-drive-assembly.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)));
let positive=0,negative=0;
for(const[mid,spec]of Object.entries(catalog.machines)){
 const policy=createV0DriveAssembly(spec,mid),shown=new Set();
 for(const[index,s]of spec.stages.entries()){
  for(const key of s.part_keys)shown.add(key);
  const out=policy.filter(index,shown),row=policy.at(index);
  if(/^[ab]-drive-(prep|stack|motor|close)$/.test(s.id)){
   const letter=s.id[0],ids=['prep','stack','motor','close'],i=ids.indexOf(s.id.split('-').at(-1));
   const expected=spec.stages.filter(r=>ids.slice(0,i+1).some(op=>r.id===letter+'-drive-'+op)).flatMap(r=>r.part_keys);
   assert.deepEqual([...out].sort(),expected.sort());assert.equal(out.size,[6,21,29,38][i]);
   assert.equal(row.underside,i===1);assert.equal(row.keys.length,38);assert.equal(policy.focus(index).length,38);
   if(i===1)assert.match(policy.note(index),/18 mm/);
   if(i===2)assert.match(policy.note(index),letter==='a'?/8\.5 mm/:/17\.5 mm/);
  }else{assert.equal(out,shown);assert.equal(row,null)}
  if(s.id==='drives-install'){assert.equal(policy.focus(index).length,80);assert.match(policy.note(index),/B on the left and A on the right/)}
  positive++;
 }
 // Moving backward/jumping cannot retain the opposite drive's isolated state.
 const ai=spec.stages.findIndex(s=>s.id==='a-drive-close'),bi=spec.stages.findIndex(s=>s.id==='b-drive-close'),all=new Set(spec.stages.flatMap(s=>s.part_keys));
 const a=[...policy.filter(ai,all)],b=[...policy.filter(bi,all)];assert(!a.some(k=>b.includes(k)));assert.deepEqual([...policy.filter(ai,all)],a);assert.equal(all.size,spec.parts);positive++;
 const copy=policy.focus(ai);copy.length=0;assert.equal(policy.focus(ai).length,38);positive++;
 const mounted=spec.stages.find(r=>r.id==='drives-install').part_keys;assert.equal(mounted.length,4);assert(mounted.every(k=>!a.includes(k)&&!b.includes(k)),'Frame mounting screws must not be prepared as internal bearing/motor screws');positive++;
 for(const mutate of [
  s=>s.manual.sha256='0'.repeat(64),s=>s.model_sha256='0'.repeat(64),s=>s.manifest_sha256='0'.repeat(64),
  s=>s.stages.find(r=>r.id==='a-drive-stack').page_end=72,
  s=>s.stages.find(r=>r.id==='drives-install').page_start=80,
  s=>s.stages.find(r=>r.id==='a-drive-prep').part_keys[0]=s.stages.find(r=>r.id==='b-drive-prep').part_keys[0],
  s=>s.stages.find(r=>r.id==='b-drive-close').part_keys[0]=s.stages.find(r=>r.id==='b-drive-close').part_keys[1],
 ]){const s=structuredClone(spec);mutate(s);assert.throws(()=>createV0DriveAssembly(s,mid),/V0 drive assembly/);negative++}
 assert.throws(()=>policy.at(-1),/Unknown manual stage/);negative++;
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Both pinned V0 manual drive cohorts, eight preparation stages, upside-down inspection, distinct source pulley-height instructions, B/A mounting, isolation and reversed selection. Metadata policy only; actual models/manual diagrams/browser are separate evidence.'}));

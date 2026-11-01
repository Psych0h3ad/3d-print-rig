import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createV0BedAssembly} from '../site/viewer/v0-bed-assembly.mjs';
const document=JSON.parse(await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)));
let positive=0,negative=0;
for(const [machine,spec]of Object.entries(document.machines)){
 const policy=createV0BedAssembly(spec,machine),stage=id=>spec.stages.findIndex(s=>s.id===id),shown=i=>new Set(spec.stages.slice(0,i+1).flatMap(s=>s.part_keys));
 for(const[id,count]of [['bed-carrier-prep',7],['bed-carrier-frame',13],['bed-carrier-crossbar',14],['bed-carrier-preload',25],['bed-mounts',41],['bed-mount-flatness',41],['bed-mounts-separate',8],['leadnut',4]]){
  const i=stage(id),before=shown(i),out=policy.filter(i,before);assert.equal(out.size,count,id);assert([...out].every(k=>before.has(k)));assert(policy.at(i).isolated);assert(policy.focus(i).every(k=>before.has(k)));positive++;
 }
 const prefix=machine==='voron_v02r1_120'?'v02r1_':'v02_',offset=prefix==='v02_'?-9:0,key=n=>prefix+String(n+offset).padStart(5,'0');
 const remove=stage('bed-mounts-separate'),stored=policy.stored(remove,shown(remove));
 for(const n of [458,470,471,472,475,478,482,485,523,526,527,528])assert(stored.includes(key(n)));assert.equal(stored.length,33);positive++;
 const rail=stage('bed-mounts-rail'),input=shown(rail),visible=policy.filter(rail,input),bedKeys=new Set(spec.stages.filter(s=>s.id.startsWith('bed-carrier')||s.id.startsWith('bed-mount')||s.id.startsWith('leadnut')).flatMap(s=>s.part_keys));
 assert.equal([...visible].filter(k=>bedKeys.has(k)).length,16);assert([...input].filter(k=>!bedKeys.has(k)).every(k=>visible.has(k)));positive++;
 const refit=stage('bed-carrier-install'),rinput=shown(refit);assert.equal(policy.filter(refit,rinput),rinput);assert.equal([...rinput].filter(k=>bedKeys.has(k)).length,49);positive++;
 const attach=stage('leadnut-install'),all=shown(attach);assert.equal(policy.filter(attach,all),all);assert.equal([...all].filter(k=>bedKeys.has(k)).length,55);positive++;
 const untouched=stage('z-stops'),baseline=shown(untouched);assert.equal(policy.at(untouched),null);assert.equal(policy.filter(untouched,baseline),baseline);positive++;
 assert.deepEqual(Object.keys(policy.at(stage('bed-carrier-preload')).partNotes).sort(),[key(492),key(495)].sort());positive++;
 for(const change of [
  s=>s.model_sha256='0'.repeat(64),s=>s.manifest_sha256='0'.repeat(64),s=>s.manual.sha256='0'.repeat(64),
  s=>s.stages.splice(stage('bed-mounts-rail'),1),
  s=>s.stages[stage('bed-carrier-frame')].part_keys[0]=key(520),
  s=>s.stages[stage('bed-mounts')].page_end=43,
  s=>delete s.stages[stage('bed-mounts-separate')].operation_part_keys,
  s=>s.stages[stage('bed-carrier-preload')].operation_part_keys.push(key(518)),
 ]){const changed=structuredClone(spec);change(changed);assert.throws(()=>createV0BedAssembly(changed,machine));negative++}
 assert.throws(()=>policy.at(-1));assert.throws(()=>policy.at(NaN));assert.throws(()=>policy.at(spec.stages.length));negative+=3;
}
assert.throws(()=>createV0BedAssembly(document.machines.voron_v02_120,'unreviewed'));negative++;
console.log(JSON.stringify({passed:true,positive,negative,scope:'Exact stock manual/source operation masks and storage/reference negatives; no geometry transforms, native mating or browser qualification.'}));

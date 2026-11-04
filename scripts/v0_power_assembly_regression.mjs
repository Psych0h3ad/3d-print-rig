import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditPowerOwnership,applyReviewedPowerMask,reviewedPower,reviewedPowerSHA256} from './v0_power_reference_audit.mjs';
const viewer=new URL('../site/viewer/',import.meta.url),source=await fs.readFile(new URL('v0-power-assembly.mjs',viewer),'utf8');
const imports=[...source.matchAll(/from '(\.\/v0-power-references\.mjs[^']*)'/g)];assert.equal(imports.length,1);
const {loadV0PowerReferences,checkedV0PowerReferences,v0PowerReferenceDelivery:delivery}=await import(new URL(imports[0][1],viewer));
const {createV0PowerAssembly}=await import(new URL('v0-power-assembly.mjs',viewer));
assert(process.argv[2],'Exact generated delivery file required');
const raw=await fs.readFile(new URL('data/v0-power-references.source.json',viewer)),encoded=await fs.readFile(process.argv[2]);
const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(raw),reviewedPowerSHA256);assert.equal(sha(encoded),delivery.gzip.sha256);
let requests=0;const references=await loadV0PowerReferences({fetchImpl:async url=>{assert.equal(new URL(url).search,'?v='+delivery.gzip.sha256.slice(0,20));requests++;return new Response(encoded);}});assert.equal(requests,1);
assert.equal(checkedV0PowerReferences(references),references);assert(Object.isFrozen(references));assert.throws(()=>checkedV0PowerReferences(JSON.parse(raw)),/Exact received/);
assert.throws(()=>{references.voron_v02_120.operations[0].part_keys.push('forged');},TypeError);
const doc=JSON.parse(await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url))),rows=[];let negative=0;
for(const[id,spec]of Object.entries(doc.machines)){
 const r=reviewedPower(id),manifest={machine_id:id,parts:spec.stages.flatMap(s=>s.part_keys).map(key=>({key,...structuredClone(r.descriptors[key]||{})}))};
 const ownership=auditPowerOwnership({id,spec,manifest,references}),policy=createV0PowerAssembly({spec,manifest,references});
 assert.equal(ownership.referencedSourceKeys,757);
 const psu=r.operations[0].part_keys[0],inlet=r.operations[4].part_keys[0],at=n=>spec.stages.findIndex(s=>s.id===n);let operationCount=0;
 for(let index=0;index<spec.stages.length;index++){
  const accumulated=new Set(spec.stages.slice(0,index+1).flatMap(s=>s.part_keys)),expected=new Set(accumulated),row=r.operations.find(o=>o.id===spec.stages[index].id),result=row?{subassembly:['electronics-psu-voltage','electronics-mains-inlet-prewire'].includes(row.id),operation_part_keys:row.operation_part_keys,presentation_label:row.displayIntent.startsWith('prepare-')?'Prepared power component reference':'Power and wiring reference',underside:['electronics-psu','electronics-guard'].includes(row.id)}:{};
  applyReviewedPowerMask({id,index,spec,keys:expected,result});assert.deepEqual(policy.filter(index,accumulated),expected);
  assert.deepEqual(new Set(policy.stored(index,accumulated)),new Set([...accumulated].filter(k=>!expected.has(k))));
  if(row){operationCount++;assert.deepEqual(policy.focus(index),row.operation_part_keys);assert.equal(policy.at(index).isolated,result.subassembly);assert(Object.isFrozen(policy.at(index).keys));}
  else{assert.equal(policy.at(index),null);assert.deepEqual(policy.focus(index),[]);}
 }
 assert.equal(operationCount,13);assert.equal(policy.filter(at('electronics-psu-voltage'),new Set([psu,inlet])).size,1);
 const cases=[
  x=>x.spec.model_sha256='0'.repeat(64),x=>x.spec.manifest_sha256='0'.repeat(64),x=>x.spec.manual.sha256='0'.repeat(64),
  x=>x.spec.stages[at('electronics-mains')].page_start++,x=>x.spec.stages[at('electronics-dc')].operation_part_keys.pop(),
  x=>x.spec.stages[at('electronics-psu')].note+=' changed',x=>x.spec.stages[at('electronics-guard')].title_ja+='変更',
  x=>x.spec.stages.splice(at('electronics-fan'),1),x=>x.spec.stages.push(structuredClone(x.spec.stages[at('electronics-guard')])),
  x=>x.manifest.parts.find(p=>p.key===psu).source.commit='0'.repeat(40),
  x=>x.manifest.parts.find(p=>p.key===inlet).source.assembly_path.reverse(),x=>x.manifest.parts.find(p=>p.key===psu).name='Generic PSU',
  x=>x.manifest.parts.push(structuredClone(x.manifest.parts[0])),x=>{delete x.spec.stages[1];},x=>x.references=JSON.parse(raw)
 ];
 for(const mutate of cases){const x={spec:structuredClone(spec),manifest:structuredClone(manifest),references};mutate(x);assert.throws(()=>createV0PowerAssembly(x));negative++;}
 for(const index of [-1,NaN,Infinity,1.2,spec.stages.length]){assert.throws(()=>policy.at(index));negative++;}
 rows.push({id,operations:operationCount,stages:spec.stages.length,sourceReferences:ownership.referencedSourceKeys});
}
for(const make of [()=>new Response(encoded,{status:503}),()=>new Response(encoded.subarray(1)),()=>{const b=Buffer.from(encoded);b[b.length-12]^=1;return new Response(b);},()=>new Response(encoded,{headers:{'Content-Length':String(encoded.length+1)}})]){await assert.rejects(loadV0PowerReferences({fetchImpl:async()=>make()}));negative++;}
const prior=globalThis.fetch;let defaultRequests=0;globalThis.fetch=async()=>{defaultRequests++;return new Response(encoded,{status:defaultRequests===1?503:200});};
try{await assert.rejects(loadV0PowerReferences());const a=await loadV0PowerReferences(),b=await loadV0PowerReferences();assert.equal(a,b);assert.equal(defaultRequests,2);}finally{globalThis.fetch=prior;}
console.log(JSON.stringify({passed:true,machines:rows,negativeControls:negative,sourceOnly:true,physicalFitQualified:false,electricalQualified:false}));

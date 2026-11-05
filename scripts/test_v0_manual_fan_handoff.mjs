import assert from'node:assert/strict';import fs from'node:fs/promises';
import{receiveManualSourceFixture}from'./v0_manual_source_fixture.mjs';
import{createV0ElectronicsAssembly}from'../site/viewer/v0-electronics-assembly.mjs';
import{createV0FanAssembly}from'../site/viewer/v0-fan-assembly.mjs';
const{bundle}=await receiveManualSourceFixture(),review=JSON.parse(await fs.readFile(new URL('../docs/V0_ELECTRONICS_ASSEMBLY_REVIEW.json',import.meta.url)));let visits=0,negatives=0;
for(const[id,spec]of Object.entries(bundle.data['v0-assembly-stages'].machines)){
 const prefix=id==='voron_v02_120'?'v02_':'v02r1_',numbers=id==='voron_v02_120'?[889,884,885,886,887]:[914,909,910,911,912],prepared=numbers.map(n=>prefix+String(n).padStart(5,'0')),source=bundle.data['v0-fan-assembly'][id],parts=new Map(review.machines[id].source_rows.map(row=>[row.key,structuredClone(row)]));
 for(const[key,d]of Object.entries(source.descriptors))if(!parts.has(key))parts.set(key,{key,name:d.name,source:{repository:'VoronDesign/Voron-0',source_key:key.slice(-5),commit:spec.manual.revision.split('@').at(-1).trim(),assembly_path:d.path}});
 const manifest={machine_id:id,parts:[...parts.values()]},electronics=createV0ElectronicsAssembly({spec,manifest}),fan=createV0FanAssembly({spec,manifest}),index=name=>spec.stages.findIndex(s=>s.id===name);
 for(const[name,receiverVisible]of[['electronics-fan-upper',false],['electronics-fan-lower',true],['electronics-fan-m3x12',true],['electronics-fan-3010',true],['electronics-fan-m3x16',true],['electronics-fan',true]]){
  const i=index(name),introduced=new Set(spec.stages.slice(0,i+1).flatMap(s=>s.part_keys)),shown=fan.filter(i,electronics.filter(i,introduced));for(const key of prepared)assert.equal(shown.has(key),receiverVisible,'Original receiver cohort at '+name+'/'+key);if(receiverVisible)for(const key of spec.stages[i].operation_part_keys)assert(shown.has(key),'Required actual operation reference missing '+key);visits++;
 }
 for(const change of[s=>s.stages.splice(index('electronics-fan-lower'),1),s=>s.stages[index('electronics-fan-lower')].page_start++,s=>s.stages[index('electronics-fan-lower')].operation_part_keys.pop()]){const bad=structuredClone(spec);change(bad);assert.throws(()=>createV0ElectronicsAssembly({spec:bad,manifest}));negatives++;}
}
console.log(JSON.stringify({passed:true,sourceBackedOperationVisits:visits,negativeControls:negatives,originalReceiverPartsPerMachine:5,preparedReceiverHiddenBeforeLowerAndRejoinedDuringMount:true,scope:'Independent original source ID cohorts with synthetic manifest completion; actual full geometry and controller visibility require the release asset gate.',physicalFitQualified:false}));

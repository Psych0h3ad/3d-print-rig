import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {publishedStepBaselines,publishedStepBaseline} from '../site/viewer/step-download-admission.mjs';
import {assemblyDownloadEntries} from '../site/viewer/step-downloads.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../site/PUBLIC_CATALOG.json',import.meta.url),'utf8'));
const clone=structuredClone;
assert.equal(publishedStepBaselines.length,12,'Every published assembly has an explicit download binding.');
assert.deepEqual(catalog.defaults.map(item=>item.machine_id||item.id).sort(),publishedStepBaselines.map(item=>item.id).sort(),
 'A new download needs its own reviewed artifact binding; release_verified alone is insufficient.');
assert(Object.isFrozen(publishedStepBaselines)&&publishedStepBaselines.every(Object.isFrozen));
let negativeControls=0;
const reject=item=>{
 assert.equal(publishedStepBaseline(item),false);
 assert.equal(assemblyDownloadEntries({defaults:[item]}).length,0);
 negativeControls++;
};
for(const original of catalog.defaults){
 assert(publishedStepBaseline(original));
 const [entry]=assemblyDownloadEntries({defaults:[original]});
 assert.equal(entry.id,original.machine_id||original.id);
 assert.equal(entry.url,original.step_zip?.path||original.url);
 assert.equal(entry.scope,'published-baseline');
 assert.equal(entry.sha256,original.step_zip?.sha256??null);
 const mutations=[
  item=>item.release_verified=false,item=>item.release_verified='true',
  item=>item.configuration+=' / different head',item=>item.revision+=' changed',
  item=>item.url='https://example.invalid/unadmitted.step',
  item=>(item.step_zip??={}).path='https://example.invalid/unadmitted.zip',
  item=>(item.step_zip??={}).filename='unadmitted.zip',
  item=>(item.step_zip??={}).bytes=(item.step_zip.bytes||0)+1,
  item=>(item.step_zip??={}).sha256='0'.repeat(64),
  item=>item.license='different terms',item=>item.upstream_url='https://example.invalid/other-source',
  item=>item.part_count=(item.part_count||0)+1,item=>item.custom_reference=!item.custom_reference,
  item=>{item.id='unregistered';item.machine_id='unregistered'},
  item=>item.id='conflicting-source-id'
 ];
 for(const mutate of mutations){const item=clone(original);mutate(item);reject(item)}
 assert.equal(assemblyDownloadEntries({defaults:[original,clone(original)]}).length,1);
 const changed=clone(original);changed.configuration+=' unreviewed';
 for(const defaults of [[original,changed],[changed,original]]){
  assert.equal(assemblyDownloadEntries({defaults}).length,0,'Conflicting identity fails closed in both catalog orders.');negativeControls++;
 }
}
// An unreviewed native part cannot inherit a published assembly's release flag.
for(let i=1;i<=14;i++){
 const key='unreviewed_native_part_'+i;
 reject({...clone(catalog.defaults[0]),id:key,machine_id:key,url:'https://example.invalid/'+key+'.step',
  provenance:'native-source-body',releaseEligible:true,checks:{exactGeometry:true,finiteContexts:true},
  configuration:'Unreviewed assembly'});
}
// Web visualization permission does not establish a native STEP download binding.
for(let i=1;i<=6;i++){
 const key='microswiss_webmesh_'+i;
 reject({...clone(catalog.defaults[0]),id:key,machine_id:key,url:'https://example.invalid/'+key+'.step',sourcePermission:'webmesh-only'});
}
for(const value of [null,{},'not-a-catalog',{defaults:null},{defaults:{}}]){
 assert.deepEqual(assemblyDownloadEntries(value),[]);negativeControls++;
}
for(const item of [null,{},false,'unregistered'])reject(item);
const baseline=assemblyDownloadEntries(catalog);
assert.deepEqual(assemblyDownloadEntries({...catalog,machines:[...catalog.defaults],nativeRecipes:[{releaseEligible:true}]}),baseline);
const consumer=fs.readFileSync(new URL('../site/viewer/public-info.js',import.meta.url),'utf8');
const selector=fs.readFileSync(new URL('../site/viewer/step-downloads.mjs',import.meta.url),'utf8');
const bindingSource=fs.readFileSync(new URL('../site/viewer/step-download-admission.mjs',import.meta.url),'utf8');
assert.equal(selector.match(/step-download-admission\.mjs\?v=([a-f0-9]{20})/u)?.[1],createHash('sha256').update(bindingSource.replaceAll('\r\n','\n')).digest('hex').slice(0,20),
 'The published binding revision must propagate to the download selector and its consumers.');
assert(consumer.includes("from './step-downloads.mjs?"),'Exercise the download selector imported by the real public dialog.');
assert(consumer.includes('entries=assemblyDownloadEntries(catalog)'));
console.log(JSON.stringify({passed:true,productionConsumer:'public-info.js -> step-downloads.mjs',
 existingPublishedBaselines:baseline.length,negativeControls,newArtifactsAdmitted:0,nativeJobs:0,
 scope:'Exact published artifact/tuple selection. Published assembly download selection; archive contents and physical fit are reviewed separately.'}));

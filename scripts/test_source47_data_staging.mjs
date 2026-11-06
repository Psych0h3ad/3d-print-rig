import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSource47Data,checkedSource47Data,source47Delivery} from '../site/viewer/source47/source47-data.mjs';
import {source47TransportFixture} from './source47_transport_fixture.mjs';
const packets=await source47TransportFixture();
const app=await fs.readFile(new URL('../site/viewer/app.js',import.meta.url),'utf8'),begin=app.indexOf("if(machine==='siboor_trident_350'){const download="),end=app.indexOf('\n flexible=setupFlexible',begin);
assert(begin>=0&&end>begin);const body=app.slice(begin,end);assert(!body.includes('fetch('),'No raw source-table request or fallback in app');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const bind=new AsyncFunction('machine','scope','loadSource47Data','checkedSource47Data','createFullMachineSource47','model','allMeshes','manifest','installedHeads','setPose','$','previous',`let source47=previous,renderRequested=false;${body};return source47;`);
function fixture(bad){return async(url,{signal})=>{signal.throwIfAborted();const key=Object.keys(source47Delivery).find(k=>String(url).includes(source47Delivery[k].gzip.path.split('/').at(-1)));assert(key);if(key===bad)return new Response('',{status:503});return new Response(Buffer.from(packets[key],'base64'));}}
async function exercise(machine,bad,disposed=false){
 const old={tag:'old model reference'},model={tag:'original model'},meshes=[],manifest={tag:'original metadata'},cleanups=[];let calls=0,requests=0;
 const scope={disposed,cleanup:f=>cleanups.push(f)},fetchImpl=fixture(bad);
 const loader=opts=>{requests++;return loadSource47Data({...opts,fetchImpl})};
 const create=options=>{calls++;assert.equal(options.model,model);assert.equal(options.meshes,meshes);assert.equal(options.manifest,manifest);for(const k of ['input','reference','serviceInput'])assert(Object.isFrozen(options[k]));assert.equal(options.reference.binding.v14_bindings_sha256,source47Delivery.input.sha256);return {received:options}};
 const args=[machine,scope,loader,checkedSource47Data,create,model,meshes,manifest,null,()=>{},()=>({dataset:{}}),old];
 if(bad||disposed){await assert.rejects(bind(...args));assert.equal(calls,0);assert.deepEqual(old,{tag:'old model reference'});}
 else{const result=await bind(...args);if(machine==='siboor_trident_350'){assert.equal(calls,1);assert.notEqual(result,old);}else{assert.equal(calls,0);assert.equal(requests,0);assert.equal(result,old);}}
 for(const cleanup of cleanups)cleanup();return {calls,requests};
}
await exercise('siboor_trident_350');for(const bad of ['input','reference','serviceInput'])await exercise('siboor_trident_350',bad);await exercise('siboor_trident_350',null,true);await exercise('siboor_trident_300');await exercise('voron_trident_350');
console.log(JSON.stringify({passed:true,currentAppBranchUsed:true,cases:7,completeStagingBeforeSource47Constructor:true,threeDependencyFailuresBeforeConstruction:true,disposedScopeRejectedBeforeConstruction:true,otherMachinesDoNotFetch:true,previousReferenceUntouchedInFailureFixture:true,actualWholeSceneRollbackQualified:false,scope:'Exact current app source47 data initialization branch with controlled network and identity-preserving constructor fixture; separate actual-model/current controller and browser gates remain required.'}));

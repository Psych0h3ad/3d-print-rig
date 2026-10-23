import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {yavothCowlAssets,currentYavothCowl,currentYavothCorrection,yavothCarriageAsset} from '../site/viewer/yavoth-cowl-assets.mjs';
const root='https://fixture.test/rig/',base=root+'viewer/toolheads.html';
const sourceText=readFileSync(new URL('../site/viewer/yavoth-cowl-assets.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const sourceRevision=createHash('sha256').update(sourceText).digest('hex').slice(0,20);
assert(readFileSync(new URL('../site/viewer/model-loader.js',import.meta.url),'utf8').includes('./yavoth-cowl-assets.mjs?v='+sourceRevision),'Warm caches must receive the current correction module');
assert(readFileSync(new URL('./build_locales.mjs',import.meta.url),'utf8').includes("['yavoth-cowl-assets.mjs']"),'Correction revisions must propagate automatically');
assert.equal(Object.keys(yavothCowlAssets).length,3);
const names=['orbiter2','sherpa_mini','sherpa_micro'].map(extruder=>'modules/head_print_yavoth_'+extruder+'_rapido2_uhf_rear5.glb');
assert.deepEqual(Object.keys(yavothCowlAssets).sort(),names.sort());
for(const name of names){
 const pin=yavothCowlAssets[name];
 assert.equal(currentYavothCowl('../'+name,base,root),pin);
 assert.equal(currentYavothCowl(root+name+'?bundle=old',base,root),pin);
 assert.equal(currentYavothCowl('https://other.test/rig/'+name,base,root),null);
 assert.equal(currentYavothCowl(root+'sibling/'+name,base,root),null);
 for(const key of ['sha256','decoded_sha256'])assert.match(pin[key],/^[0-9a-f]{64}$/);
 assert(Object.isFrozen(pin));
}
for(const name of ['modules/head_print_yavoth_orbiter2_rapido2_hf_rear5.glb','modules/other.glb','model.glb','constructor','toString','__proto__'])assert.equal(currentYavothCowl('../'+name,base,root),null);
const carriage='modules/yavoth59_carriage_9.glb',correctedNames=[...names,carriage],pinFor=name=>yavothCowlAssets[name]||yavothCarriageAsset;
assert.equal(currentYavothCorrection('../'+carriage,base,root),yavothCarriageAsset);
for(const url of ['https://other.test/rig/'+carriage,root+'sibling/'+carriage,root+'modules/yavoth59_carriage_6.glb'])assert.equal(currentYavothCorrection(url,base,root),null);
// Resolve against the actual module root so the production loader is executed
// unchanged in Node. No CAD/GLB body fixture is blessed by this routing test.
globalThis.location=new URL('../site/viewer/toolheads.html',import.meta.url);
const {modelURL,loadModel}=await import('../site/viewer/model-loader.js');
let requests=[];
globalThis.fetch=async url=>{requests.push(String(url));throw Error('Unexpected baseline request');};
for(const name of correctedNames){
 const pin=pinFor(name),url=new URL(await modelURL('../'+name+'?bundle=old'));
 assert(url.pathname.endsWith('/'+name+'.gz'));
 assert.equal(url.searchParams.get('model'),pin.sha256.slice(0,20));
 assert.equal(url.searchParams.get('bundle'),'old');
}
assert.equal(requests.length,0,'Corrected cowl URLs must not reuse the baseline archive cache identity');
for(const name of correctedNames){
 const pin=pinFor(name);
 let parsed=false;
 requests=[];globalThis.fetch=async url=>{requests.push(String(url));return new Response(new Uint8Array(pin.decoded_bytes));};
 await assert.rejects(loadModel({parseAsync:async()=>{parsed=true;}},'../'+name),/hash mismatch/);
 assert.equal(parsed,false,'Stale/corrupt bodies must be rejected before model installation');
 assert.equal(requests.length,1);
 requests=[];globalThis.fetch=async url=>{requests.push(String(url));return new Response(null,{status:404});};
 await assert.rejects(loadModel({},'../'+name),/404/);
 assert.equal(requests.length,1,'A missing corrected cowl must not fall back to an obsolete raw model');
}
console.log(JSON.stringify({passed:true,cowls:names.length,carriages:1,scope:'Production routing, current module revision, warm-cache separation, corrupt body rejection before parse, missing-body fail-closed. Actual geometry is audited separately.'}));

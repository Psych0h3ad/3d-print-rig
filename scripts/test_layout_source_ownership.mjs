// Actual wrapper/disposer bodies with controlled asynchronous source boundary;
// actual Three materials exercise the shared printed/hardware alias defect.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const at=process.argv.indexOf('--site'),site=at>=0?path.resolve(process.argv[at+1]):fileURLToPath(new URL('../site/',import.meta.url));
const inputs={};const read=rel=>{const b=fs.readFileSync(path.join(site,rel));inputs[rel]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8')};
const wrapper=read('viewer/layout-custom-source.mjs'),provider=read('viewer/layout-machine-providers.mjs'),loader=read('viewer/custom-voron-loader.mjs');
read('viewer/layout-material-ownership.mjs');
const {isolateLayoutPaletteMaterials}=await import(pathToFileURL(path.join(site,'viewer/layout-material-ownership.mjs')));
const THREE=await import(pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')));
const checks=[];async function test(id,fn){await fn();checks.push({id,status:'PASS'})}
function replay(load,apply,admitted=true){
 const statements=[...wrapper.matchAll(/^import .+;$/gm)];assert.equal(statements.length,2);let text=wrapper;
 for(const m of statements)text=text.replace(m[0],'');
 text=text.replace('export async function loadLayoutCustomVoron','async function loadLayoutCustomVoron');
 return new Function('loadCustomVoron','hasLayoutZeroFaceAdmission','applyParsedLayoutZeroFaces',text+'\nreturn loadLayoutCustomVoron;')(load,()=>admitted,apply);
}
function fixture(){
 const root=new THREE.Group(),g=new THREE.BoxGeometry(1,2,3),m=new THREE.MeshStandardMaterial({color:0x537bcd,metalness:.37,roughness:.61}),t=new THREE.Texture();m.map=t;
 const a=new THREE.Mesh(g,m),b=new THREE.Mesh(g,m);root.add(a,b);a.position.set(1,2,3);b.position.set(4,5,6);root.updateMatrixWorld(true);
 const disposed={geometry:0,material:0,texture:0};g.addEventListener('dispose',()=>disposed.geometry++);m.addEventListener('dispose',()=>disposed.material++);t.addEventListener('dispose',()=>disposed.texture++);
 return {root,g,m,t,a,b,disposed,loaded:{root,layoutParsedSource:{gltf:{scene:root,parser:{original:true}},verifiedSource:{originalReceipt:true}}}};
}
await test('non-admitted-normal-return-with-false-opt-in-and-no-hook',async()=>{
 const f=fixture();delete f.loaded.layoutParsedSource;let options;
 const run=replay(async(_id,o)=>(options=o,f.loaded),()=>assert.fail('Unknown source reached cleanup'),false);
 assert.equal(await run('unknown-machine',{progressOptions:{x:1}}),f.loaded);assert.equal(options.layoutSourceIdentity,false);assert.deepEqual(options.progressOptions,{x:1});assert.deepEqual(f.disposed,{geometry:0,material:0,texture:0});
});
await test('await-before-return-and-parser-handle-removed-only-after-hook',async()=>{
 const f=fixture();let release,entered,returned=false,seen;
 const started=new Promise(r=>entered=r),lease={summary:{meshes:[1]},disposeDetachedSources(){}};
 const run=replay(async(_id,o)=>{assert.equal(o.layoutSourceIdentity,true);return f.loaded},async(parsed,context)=>{assert.equal(parsed,f.loaded.layoutParsedSource.gltf);seen=context;entered();await new Promise(r=>release=r);return lease});
 const pending=run('known-machine').then(v=>(returned=true,v));await started;assert.equal(returned,false);assert.ok(f.loaded.layoutParsedSource);release();
 assert.equal(await pending,f.loaded);assert.equal(seen.scope,'layout');assert.equal(seen.machineId,'known-machine');assert.equal(seen.verifiedSource.originalReceipt,true);assert.equal(f.loaded.layoutParsedSource,undefined);assert.equal(f.loaded.disposeLayoutSourceCleanup,lease.disposeDetachedSources);assert.equal(f.loaded.layoutSourceZeroFaces,lease.summary);
});
await test('async-rejection-cleans-unreturned-root-and-parser-once',async()=>{
 const f=fixture(),run=replay(async()=>f.loaded,async()=>{await Promise.resolve();throw Error('source-identity-negative')});
 await assert.rejects(run('known-machine'),/source-identity-negative/);assert.deepEqual(f.disposed,{geometry:1,material:1,texture:1});assert.equal(f.root.children.length,0);assert.equal(f.loaded.layoutParsedSource,undefined);
});
await test('abort-during-source-hook-propagates-with-cleanup-no-returned-root',async()=>{
 const f=fixture(),abort=new AbortController();let entered,release;
 const started=new Promise(r=>entered=r),run=replay(async()=>f.loaded,async(_p,{signal})=>{entered();await new Promise(r=>release=r);signal.throwIfAborted()});
 const pending=run('known-machine',{signal:abort.signal});await started;abort.abort();release();await assert.rejects(pending,e=>e.name==='AbortError');assert.deepEqual(f.disposed,{geometry:1,material:1,texture:1});assert.equal(f.loaded.layoutParsedSource,undefined);
});
const disposeText=provider.slice(provider.indexOf('function disposeRoot('),provider.indexOf('\nfunction finish('));
const prepareText=provider.slice(provider.indexOf('async function prepare('),provider.indexOf('\nexport async function loadLayoutRecipe('));
const release=new Function(disposeText+'\n'+prepareText+'\nreturn {disposeRoot,prepare};')();
await test('provider-error-cleans-detached-lease-and-current-root',async()=>{
 const f=fixture();let detached=0;f.loaded.disposeLayoutSourceCleanup=()=>detached++;
 await assert.rejects(release.prepare(async own=>{own(f.loaded);throw Error('adapter-negative')}),/adapter-negative/);
 assert.equal(detached,1);assert.deepEqual(f.disposed,{geometry:1,material:1,texture:1});
});
await test('provider-order-before-adapter-material-pose-and-normalization',()=>{
 const hook=provider.indexOf('loadLayoutCustomVoron:loadCustomVoron');assert.ok(hook>0);assert.ok(provider.indexOf('isolateLayoutPaletteMaterials',hook)>hook);assert.ok(provider.indexOf('createTridentMotion',hook)>hook);
 assert.match(provider,/disposeLayoutSourceCleanup\?\.\(\)/);assert.match(wrapper,/finally\{delete loaded\.layoutParsedSource;\}/);
 assert.match(loader,/layoutSourceIdentity=false/);assert.match(loader,/if\(layoutSourceIdentity===true\)/);assert.ok(loader.indexOf("checked('model.glb')")<loader.indexOf('layoutParsedSource='));
 assert.doesNotMatch(loader,/applyParsedLayoutZeroFaces|cloneAdmittedLayoutZeroFaces|layout-zero-face/);
});
await test('shared-real-material-alias-isolated-before-printed-ABA-hardware-protected',()=>{
 const f=fixture(),native=f.m.color.toArray(),poses=[f.a.matrixWorld.toArray(),f.b.matrixWorld.toArray()],p=f.g.attributes.position.array.slice();
 const result=isolateLayoutPaletteMaterials(f.root);assert.equal(result.ownedClonedMaterials,2);assert.equal(result.originalUniqueMaterials,1);assert.notEqual(f.a.material,f.b.material);
 assert.equal(f.disposed.material,1);assert.equal(f.disposed.texture,0);assert.equal(f.a.material.map,f.t);assert.equal(f.b.material.map,f.t);
 for(const color of ['#ffd400','#0757df','#ffd400']){f.a.material.color.set(color);assert.deepEqual(f.b.material.color.toArray(),native);assert.equal(f.b.material.metalness,.37);assert.equal(f.b.material.roughness,.61)}
 assert.deepEqual([f.a.matrixWorld.toArray(),f.b.matrixWorld.toArray()],poses);assert.deepEqual(f.g.attributes.position.array,p);assert.equal(f.a.geometry,f.b.geometry);
 release.disposeRoot(f.root);assert.equal(f.disposed.geometry,1);assert.equal(f.disposed.texture,1);
});
for(const [rel,h]of Object.entries(inputs))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,rel))).digest('hex'),h);
const result={schema:'layout-source-ownership-v2',passed:true,checks,sourceInputs:inputs,actualWrapperAndDisposerBodies:true,controlledAsyncBoundary:true,actualThreeMaterials:true,wholeScenesLoaded:0,native:false};
const report=process.argv.indexOf('--report');if(report>=0)fs.writeFileSync(process.argv[report+1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,checks:checks.length,wholeScenesLoaded:0,native:false,scope:'Source/async ownership and actual material regression; no full-scene fit claim'}));


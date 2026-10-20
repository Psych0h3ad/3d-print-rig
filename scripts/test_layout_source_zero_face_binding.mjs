import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import vm from 'node:vm';import {fileURLToPath,pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';
import {layoutZeroFaceSources} from '../site/layout/layout-zero-face-sources.mjs';
import {admitVerifiedLayoutSource,applyParsedLayoutZeroFaces} from '../site/layout/layout-zero-face-source-binding.mjs';
await import('./test_layout_source_zero_faces.mjs');
const threeArg=process.argv.indexOf('--three-module');
const THREE=await import(threeArg>0?process.argv[threeArg+1]:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href);
const here=path.dirname(fileURLToPath(import.meta.url));
const bundle=JSON.parse(fs.readFileSync(path.join(here,'fixtures/layout_source_zero_faces.json'))),rows=bundle.sourceProofs.rows;
function fixtureBytes(name){const r=bundle.arrays[name];assert.ok(r&&r.bytes<=2000000);const b=inflateSync(Buffer.from(r.deflateBase64,'base64'),{maxOutputLength:r.bytes});assert.equal(b.length,r.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),r.sha256);return b;}
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const constructors={Float32Array,Uint16Array,Uint32Array};let checks=0;const cases=[],byteProof=[];
async function check(name,run){await run();checks++;cases.push(name);}
function receipt(source){const url=new URL(source.sourceURL);return {verifiedBy:'checkedExtraAsset-v1',machineId:source.machineId,sourceURL:source.sourceURL,decodedBytes:source.decodedBytes,modelSpec:{encoding:'gzip',bytes:source.compressedBytes,sha256:source.compressedSha256,decoded_bytes:source.decodedBytes,decoded_sha256:source.decodedSha256,path:url.pathname.slice(url.pathname.indexOf(source.machineId==='voron_v24_500_custom'?'custom-voron-v3/':'trident-deck-v103/'))}};}
function sourceFixture(source){
 const scene=new THREE.Group(),json={meshes:[],nodes:[],accessors:[],bufferViews:[]},associations=new Map(),meshes=[];
 for(const row of rows.filter(row=>row.machineId===source.machineId)){
  const geometry=new THREE.BufferGeometry();
  for(const [name,a]of Object.entries(row.sourceAttributes)){
   const b=fixtureBytes(row.fixtures[name]);assert.equal(hash(b),a.sha256);
   const attribute=new THREE.BufferAttribute(new constructors[a.arrayType](b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),a.itemSize,a.normalized);
   if(name==='index')geometry.setIndex(attribute);else geometry.setAttribute(name,attribute);
   json.accessors[a.accessorIndex]=structuredClone(a.accessor);json.bufferViews[a.accessor.bufferView]=structuredClone(a.bufferView);
  }
  geometry.groups=structuredClone(row.sourceGroups);geometry.setDrawRange(0,Infinity);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),owner=new THREE.Group();owner.userData.part_key=row.sourceKey;owner.add(mesh);scene.add(owner);
  json.meshes[row.sourceMeshIndex]={name:row.sourceMeshName,primitives:[structuredClone(row.sourcePrimitive)]};json.nodes[row.sourceNodeIndex]={name:row.sourceNodeName,mesh:row.sourceMeshIndex,extras:{part_key:row.sourceKey}};
  associations.set(mesh,{meshes:row.sourceMeshIndex,primitives:row.sourcePrimitiveIndex});associations.set(owner,{nodes:row.sourceNodeIndex});meshes.push({mesh,row,geometry});
 }
 return {gltf:{scene,parser:{json,associations}},meshes};
}
for(const source of layoutZeroFaceSources){
 await check(source.machineId+' verified source receipt',()=>{assert.equal(admitVerifiedLayoutSource(source.machineId,receipt(source)).sourceModelSha256,source.decodedSha256);});
 for(const [name,mutate]of [
  ['missing receipt',()=>undefined],['missing decoded hash',r=>{delete r.modelSpec.decoded_sha256;return r;}],
  ['wrong decoded hash',r=>{r.modelSpec.decoded_sha256='0'.repeat(64);return r;}],
  ['wrong compressed hash',r=>{r.modelSpec.sha256='0'.repeat(64);return r;}],
  ['wrong decoded byte count',r=>{r.decodedBytes--;return r;}],
  ['wrong compressed byte count',r=>{r.modelSpec.bytes--;return r;}],
  ['wrong source URL',r=>{r.sourceURL=r.sourceURL.replace('model.glb.gz','other.glb.gz');return r;}],
  ['wrong transport path',r=>{r.modelSpec.path='other/model.glb.gz';return r;}],
  ['wrong machine receipt',r=>{r.machineId='other';return r;}],
  ['no verified transport',r=>{delete r.verifiedBy;return r;}]
 ])await check(source.machineId+' '+name+' rejects',()=>{assert.throws(()=>admitVerifiedLayoutSource(source.machineId,mutate(receipt(source))),/binding rejected/);});
 const f=sourceFixture(source),context={scope:'layout',machineId:source.machineId,verifiedSource:receipt(source)};
 await check(source.machineId+' ancestor identities and atomic install',async()=>{
  const lease=await applyParsedLayoutZeroFaces(f.gltf,context);assert.equal(lease.summary.meshes.length,f.meshes.length);
  for(const {mesh,row,geometry}of f.meshes){
   assert.notEqual(mesh.geometry,geometry);
   for(const [name,a]of Object.entries(row.expectedAfterAttributes))assert.equal(hash((name==='index'?mesh.geometry.index:mesh.geometry.attributes[name]).array),a.sha256);
   // Independent native-source byte proof: retained tuple bytes and winding/order.
   const oldIndex=geometry.index.array,newIndex=mesh.geometry.index.array,removed=new Set(row.removedTriangles),oldToNew=new Map();let nextFace=0;
   for(let face=0;face<oldIndex.length/3;face++){
    if(removed.has(face)){
     const positions=[0,1,2].map(c=>[...geometry.attributes.position.array.subarray(oldIndex[face*3+c]*3,oldIndex[face*3+c]*3+3)]);
     assert(positions.some((a,i)=>positions.some((b,j)=>i<j&&a.every((v,k)=>v===b[k]))));continue;
    }
    for(let c=0;c<3;c++){
     const old=oldIndex[face*3+c],now=newIndex[nextFace*3+c];if(oldToNew.has(old))assert.equal(oldToNew.get(old),now);else oldToNew.set(old,now);
     for(const [name,a]of Object.entries(geometry.attributes)){
      const tuple=a.itemSize*a.array.BYTES_PER_ELEMENT,input=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),b=mesh.geometry.attributes[name].array,output=Buffer.from(b.buffer,b.byteOffset,b.byteLength);
      assert.equal(input.compare(output,now*tuple,(now+1)*tuple,old*tuple,(old+1)*tuple),0);
     }
    }nextFace++;
   }
   assert.equal(nextFace,newIndex.length/3);byteProof.push({machineId:source.machineId,sourceKey:row.sourceKey,positiveTriangles:nextFace,removedFaces:row.removedTriangles.length,retainedSourceTupleBytesIdentical:true,windingAndOrderUnchanged:true,allRemovedHaveDuplicatePositionPair:true});
  }
  let disposed=0;for(const item of f.meshes)item.geometry.addEventListener('dispose',()=>disposed++);
  lease.disposeDetachedSources();lease.disposeDetachedSources();assert.equal(disposed,f.meshes.length);
 });
 await check(source.machineId+' missing source part rejects before assignment',async()=>{
  const x=sourceFixture(source);x.meshes[0].mesh.parent.removeFromParent();await assert.rejects(applyParsedLayoutZeroFaces(x.gltf,context),/missing admitted/);for(const a of x.meshes)assert.equal(a.mesh.geometry,a.geometry);
 });
 await check(source.machineId+' duplicate source part rejects before assignment',async()=>{
  const x=sourceFixture(source),duplicate=x.meshes[0].mesh.clone();x.meshes[0].mesh.parent.add(duplicate);await assert.rejects(applyParsedLayoutZeroFaces(x.gltf,context),/duplicate admitted/);for(const a of x.meshes)assert.equal(a.mesh.geometry,a.geometry);
 });
 await check(source.machineId+' parented source rejects',async()=>{const x=sourceFixture(source);new THREE.Group().add(x.gltf.scene);await assert.rejects(applyParsedLayoutZeroFaces(x.gltf,context),/normalization/);});
 await check(source.machineId+' aborted source does not assign',async()=>{const x=sourceFixture(source),abort=new AbortController();abort.abort();await assert.rejects(applyParsedLayoutZeroFaces(x.gltf,{...context,signal:abort.signal}));for(const a of x.meshes)assert.equal(a.mesh.geometry,a.geometry);});
 await check(source.machineId+' changed final mesh rolls back all staged clones',async()=>{
  const x=sourceFixture(source),last=x.meshes.at(-1),array=last.geometry.attributes.normal.array,old=array[0];array[0]=old===0?1:0;
  await assert.rejects(applyParsedLayoutZeroFaces(x.gltf,context),/normal SHA-256/);for(const a of x.meshes)assert.equal(a.mesh.geometry,a.geometry);array[0]=old;
 });
}
const loader=fs.readFileSync(path.resolve(here,'../site/viewer/custom-voron-loader.mjs'),'utf8'),provider=fs.readFileSync(path.resolve(here,'../site/viewer/layout-machine-providers.mjs'),'utf8'),wrapper=fs.readFileSync(path.resolve(here,'../site/viewer/layout-custom-source.mjs'),'utf8');
await check('optional loader normal path and verified transport order',()=>{
 assert(loader.includes('layoutSourceIdentity=false'));assert(loader.indexOf("checked('model.glb')")<loader.indexOf('layoutParsedSource='));assert(loader.includes('if(layoutSourceIdentity===true)'));assert(loader.includes('decodedBytes:bytes.byteLength'));
 for(const text of [loader,provider,wrapper])new vm.SourceTextModule(text);
});
await check('provider hook before motion/pose and material isolation retained',()=>{
 assert(provider.includes('loadLayoutCustomVoron:loadCustomVoron'));const hook=provider.indexOf('loadLayoutCustomVoron:loadCustomVoron');assert(hook<provider.indexOf('isolateLayoutPaletteMaterials',hook));assert(hook<provider.indexOf('createTridentMotion',hook));assert(provider.includes('disposeLayoutSourceCleanup?.()'));assert(wrapper.indexOf('await applyParsedLayoutZeroFaces')<wrapper.indexOf('return loaded;',wrapper.indexOf('await applyParsedLayoutZeroFaces')));
});
console.log(JSON.stringify({status:'PASS_SOURCE_BINDING_ATOMIC_INSTALL_AND_NEGATIVE_FIXTURES',checks,predecessorChecks:70,byteProof,cases,sourceGLBReads:0,fullModelScenes:0,nativeCAD:0}));

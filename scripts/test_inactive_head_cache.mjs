import assert from 'node:assert/strict';
import {createInactiveHeadCache,headResourceFootprint,canRestoreInactiveHeadIndices,INACTIVE_HEAD_LIMIT_BYTES} from '../site/viewer/inactive-head-cache.mjs';
import {THREE,MiB,assetFixture,disposalCounter,insert,activate} from './head-cache-test-fixtures.mjs';
const tests=[];
async function test(name,run){await run();globalThis.gc?.();tests.push(name);}

await test('real 64 MiB interleaved, indexed, morph, instanced and texture storage is deduplicated',()=>{
 const data=new ArrayBuffer(64*MiB),interleaved=new THREE.InterleavedBuffer(new Float32Array(data,0,24),6);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,0));
 geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(interleaved,3,3));
 geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(data,1024,3),1));
 geometry.morphAttributes.position=[new THREE.BufferAttribute(new Float32Array(data,2048,9),3)];
 const texture=new THREE.DataTexture(new Uint8Array(data,4096,16),2,2),material=new THREE.ShaderMaterial({uniforms:{layers:{value:[texture,texture]}}});
 const root=new THREE.Group(),mesh=new THREE.InstancedMesh(geometry,material,1);mesh.instanceMatrix=new THREE.InstancedBufferAttribute(new Float32Array(data,8192,16),16);root.add(mesh);
 const asset={root,entries:[{mesh,uhfSurface:{source:new Uint16Array(data,1024,3),kept:new Uint16Array(data,1024,3)}}]};
 const measured=headResourceFootprint([asset,asset]);assert.equal(measured.buffers.size,1);assert.equal([...measured.buffers][0].byteLength,64*MiB);
 assert(measured.resources.has(geometry)&&measured.resources.has(material)&&measured.resources.has(texture));
});
await test('production default 128 MiB evicts LRU only after real inactive buffers exceed it',async()=>{
 assert.equal(INACTIVE_HEAD_LIMIT_BYTES,128*MiB);const cache=new Map(),policy=createInactiveHeadCache(cache),counts=new Map();
 for(const id of ['A','B','C','D']){
  const asset=assetFixture(id);counts.set(id,disposalCounter(asset.geometry));await insert(cache,policy,id,asset);activate(cache,[id]);
  const result=policy.commit([id]);assert(result.withinLimit);assert.equal(result.inactiveBytes,(id==='A'?0:id==='B'?48:96)*MiB);
 }
 assert.deepEqual([...cache.keys()],['B','C','D']);assert.equal(counts.get('A')(),1);assert.equal(counts.get('D')(),0);
 const originalSource='test-source-A',reloaded=assetFixture('A');await insert(cache,policy,'A',reloaded);activate(cache,['A']);
 policy.commit(['A']);assert.equal(reloaded.meta.source,originalSource);assert.equal(reloaded.mesh.userData.part_key,'part');assert.equal(reloaded.geometry.attributes.position.getX(1),1);
 activate(cache,[]);policy.commit([],{purge:true});for(const count of counts.values())assert.equal(count(),1);
});
await test('parked clones protect shared geometry, material and texture until their final release',async()=>{
 const cache=new Map(),bank=new THREE.Group(),asset=assetFixture('bank',8*MiB);
 const texture=new THREE.DataTexture(new Uint8Array(16),2,2);asset.material.map=texture;
 const countG=disposalCounter(asset.geometry),countM=disposalCounter(asset.material),countT=disposalCounter(texture);
 const clone=asset.root.clone(true);clone.visible=true;bank.add(clone);
 const policy=createInactiveHeadCache(cache,{protectedRoots:()=>[bank]});await insert(cache,policy,'bank',asset);
 const result=policy.commit([],{purge:true});assert.equal(cache.size,0);assert(result.withinLimit);assert.equal(countG()+countM()+countT(),0);
 assert(result.deferredResources>=3);bank.remove(clone);policy.release([clone]);assert.equal(countG(),1);assert.equal(countM(),1);assert.equal(countT(),1);
 policy.commit([],{purge:true});asset.geometry.dispose();asset.material.dispose();texture.dispose();assert.equal(countG(),1);assert.equal(countM(),1);assert.equal(countT(),1);
});
await test('pending promises are never evicted, including prematurely attached loaded metadata',async()=>{
 const cache=new Map(),policy=createInactiveHeadCache(cache),asset=assetFixture('pending',8*MiB);let resolve;
 const promise=new Promise(done=>{resolve=done});promise.loaded=asset;cache.set('pending',promise);policy.track('pending',promise);
 const count=disposalCounter(asset.geometry),first=policy.commit([],{purge:true});assert.equal(cache.get('pending'),promise);assert.deepEqual(first.pending,['pending']);assert.equal(count(),0);
 resolve(asset);await promise;await Promise.resolve();assert.equal(cache.get('pending'),promise,'Resolution alone must not evict an incoming switch');
 policy.commit([],{purge:true});assert.equal(cache.size,0);assert.equal(count(),1);
});
await test('shared interleaved attribute handles defer geometry disposal until parked users leave',async()=>{
 const cache=new Map(),bank=new THREE.Group(),a=assetFixture('shared-attributes',8*MiB),second=new THREE.BufferGeometry();
 second.setAttribute('position',a.geometry.attributes.position);const clone=new THREE.Mesh(second,new THREE.MeshStandardMaterial());bank.add(clone);
 const policy=createInactiveHeadCache(cache,{protectedRoots:()=>[bank]}),count=disposalCounter(a.geometry);await insert(cache,policy,'A',a);
 policy.commit([],{purge:true});assert.equal(cache.size,0);assert.equal(count(),0);bank.remove(clone);policy.release([clone]);assert.equal(count(),1);
});
await test('unknown inactive texture storage cannot produce a fake bounded-capacity pass',async()=>{
 const cache=new Map(),asset=assetFixture('unknown',64),policy=createInactiveHeadCache(cache);asset.material.map=new THREE.Texture({});
 await insert(cache,policy,'unknown',asset);const result=policy.commit([]);assert.deepEqual(result.evicted,['unknown']);assert.equal(result.unmeasuredInactiveImages,0);assert(result.withinLimit);
});
await test('active IDs protect hidden selected modules and failed-switch caches until a successful commit',async()=>{
 const cache=new Map(),policy=createInactiveHeadCache(cache),current=assetFixture('current',80*MiB),incoming=assetFixture('incoming',80*MiB);
 await insert(cache,policy,'current',current);current.root.visible=false;policy.commit(['current']);await insert(cache,policy,'incoming',incoming);
 assert(cache.has('current')&&cache.has('incoming'));assert.equal(disposalCounter(current.geometry)(),0);
 const result=policy.commit(['current']);assert(cache.has('current'));assert(result.withinLimit);assert.equal(result.inactiveBytes,80*MiB);
});
await test('cleanup callback exceptions preserve the successful switch and retain honest capacity findings',async()=>{
 const cache=new Map(),asset=assetFixture('retire',8*MiB);let failDetach=true;
 const policy=createInactiveHeadCache(cache,{afterDetach(){if(failDetach)throw Error('lighting restore failed')}});
 await insert(cache,policy,'retire',asset);const count=disposalCounter(asset.geometry);
 let result=policy.commit([],{purge:true});assert.equal(count(),0);assert.equal(result.withinLimit,false);assert.equal(result.pendingCleanupRoots,1);assert.equal(result.cleanupErrorCount,1);
 failDetach=false;result=policy.commit([],{purge:true});assert(result.withinLimit);assert.equal(count(),1);assert.equal(result.pendingCleanupRoots,0);
 const broken=assetFixture('throwing-dispose',8*MiB);broken.geometry.addEventListener('dispose',()=>{throw Error('dispose listener failed')});
 await insert(cache,policy,'broken',broken);result=policy.commit([],{purge:true});assert(result.cleanupErrors.some(e=>e.stage==='dispose'));assert.equal(result.withinLimit,false);assert.equal(cache.size,0);
 assert.doesNotThrow(()=>broken.geometry.dispose());
});
console.log(JSON.stringify({passed:true,tests,capacity_bytes:INACTIVE_HEAD_LIMIT_BYTES,capacity_uses_real_allocated_backing_buffers:true,scope:'Resource lifetime and source-state fixtures; no model download, GPU/browser or native-fit audit.'}));

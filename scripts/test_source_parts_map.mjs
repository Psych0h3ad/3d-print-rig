import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createSourcePartsMap,sourceMapMachines} from '../site/viewer/source-parts-map.mjs';
import {createAssemblyProgress,validateAssemblyProgress,assemblyProgressStorageKey} from '../site/viewer/assembly-workbench-model.mjs';
const hash='a'.repeat(64);
function fixture(){const scene=new THREE.Scene(),root=new THREE.Group(),part=new THREE.Mesh(new THREE.BoxGeometry(.01,.02,.03),new THREE.MeshStandardMaterial());part.userData.part_key='one';root.add(part);scene.add(root);let active=true;const meta={parts:[{key:'one',name:'M3 source screw',group:'Frame'}]},component={path:'machines/test/assembly_manifest.json',root,meta,metadata:{sha256:hash,bytes:50},model:{sha256:hash,bytes:80}};return {scene,root,part,meta,component,loaded:{root,source:{machineId:'voron_trident_350'},inspection:{components:[component],active:()=>active}},retire:()=>{active=false}}}
const f=fixture(),map=await createSourcePartsMap(f.loaded,f.scene),key=map.parts(0)[0].key;
assert.equal(sourceMapMachines.length,9);assert.equal(map.partCount,1);assert.equal(map.entries()[0].node,f.part);assert.equal(map.search('M3 screw').length,1);assert.equal(map.owner(key).id,'Frame');
assert.equal(map.matchParts(0,'M3 screw').length,1);assert.equal(map.matchParts(0,'unmatched').length,0);
assert.equal(map.matchParts(0,'フレーム',v=>v==='Frame'?'フレーム':v).length,1,'A translated classification query must retain its actual source items');
const progress=createAssemblyProgress(map);progress.toggle('Frame');assert.equal(validateAssemblyProgress(map,JSON.parse(JSON.stringify(progress.snapshot()))).checked_stages.length,1);
const old=progress.snapshot(),bad=structuredClone(old);bad.identity.source_state_sha256='b'.repeat(64);assert.throws(()=>progress.restore(bad));assert.deepEqual(progress.snapshot(),old);
const copy=progress.snapshot();copy.identity.machine='fake';assert.equal(progress.snapshot().identity.machine,'voron_trident_350');
const other=fixture();other.component.model.sha256='c'.repeat(64);const otherMap=await createSourcePartsMap(other.loaded,other.scene);assert.notEqual(assemblyProgressStorageKey(map),assemblyProgressStorageKey(otherMap));
let negatives=0;
async function rejects(change){const x=fixture();change(x);await assert.rejects(()=>createSourcePartsMap(x.loaded,x.scene));negatives++}
await rejects(x=>x.scene.remove(x.root));await rejects(x=>x.retire());await rejects(x=>x.loaded.source.machineId='unregistered');await rejects(x=>x.component.model.sha256='bad');
await rejects(x=>x.part.userData.part_key='unknown');await rejects(x=>x.part.position.x=NaN);await rejects(x=>x.meta.parts.push({...x.meta.parts[0]}));await rejects(x=>x.meta.parts.push({key:'missing',name:'missing',group:'Frame'}));await rejects(x=>x.meta.parts[0].group='unreviewed');
// Independent live invalidations, preserving the positive fixture separately.
for(const change of [x=>x.root.removeFromParent(),x=>x.part.visible=false,x=>x.part.position.z=.1,x=>x.part.geometry=new THREE.BoxGeometry(),x=>x.part.geometry.setDrawRange(0,0),x=>x.part.geometry.getAttribute('position').needsUpdate=true,x=>{const parent=new THREE.Group();x.root.add(parent);parent.add(x.part)},x=>x.meta.parts[0].name='edited',x=>x.retire()]){const x=fixture(),m=await createSourcePartsMap(x.loaded,x.scene);change(x);assert.throws(()=>m.verifyLive());negatives++}
console.log(JSON.stringify({passed:true,negatives,scope:'Source-map index and progress software fixtures; no actual CAD or physical-fit claim'}));

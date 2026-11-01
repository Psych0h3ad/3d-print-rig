// Fail-closed source admission fixtures. Positive geometry, source-frame
// races and full-controller rollback run on real assets in the release audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {prepareV0M2Seating,createV0M2Seating} from '../site/viewer/v0-m2-seating.mjs';
const catalog=JSON.parse(await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url))),cases=[];
for(const id of ['voron_v02_120','voron_v02r1_120']){
 const spec=catalog.machines[id],keys=spec.stages.flatMap(s=>s.part_keys),nodes=new Map(keys.map(k=>[k,new THREE.Object3D()])),manifest={machine_id:id,parts:keys.map(key=>({key}))},receipts={'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256},options={nodes,manifest,spec,receipts};assert.equal(keys.length,spec.parts);
 await assert.rejects(prepareV0M2Seating({...options,receipts:{...receipts,'model.glb':'0'.repeat(64)}}),/Unverified source/);cases.push(id+':wrong-loaded-model');
 await assert.rejects(prepareV0M2Seating({...options,spec:{...spec,manual:{...spec.manual,sha256:'0'.repeat(64)}}}),/Unverified source/);cases.push(id+':wrong-manual');
 await assert.rejects(prepareV0M2Seating(options),/Changed original source leaf/);cases.push(id+':unverified-geometry');
 assert.throws(()=>createV0M2Seating({...options,receipt:Object.freeze({})}),/Missing exact received-source preflight/);cases.push(id+':unreceived-token');
 const scene=new THREE.Scene(),key=(id.includes('r1')?'v02r1_00056':'v02_00054'),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6034*3),3));geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(18912),1));const n=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());n.userData.part_key=key;nodes.set(key,n);scene.add(n);
 await assert.rejects(prepareV0M2Seating(options),/Actual source buffers differ/);cases.push(id+':same-count-different-complete-buffers');
 n.position.x=.001;await assert.rejects(prepareV0M2Seating(options),/reference frame must be restored/);cases.push(id+':foreign-frame');
 n.position.x=0;scene.remove(n);await assert.rejects(prepareV0M2Seating(options),/detached from renderer Scene/);cases.push(id+':detached');geometry.dispose();n.material.dispose();
}
console.log(JSON.stringify({passed:true,cases:cases.length,scope:'Synthetic source-admission rejection only; actual twelve-buffer acceptance, individual eight-source transforms and whole-controller restore are mandatory actual-asset release checks.'}));

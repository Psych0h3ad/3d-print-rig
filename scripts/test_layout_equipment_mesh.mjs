import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createEquipmentMeshCache} from '../site/layout/layout-equipment-mesh.mjs';
const cache=createEquipmentMeshCache(THREE),material=new THREE.MeshStandardMaterial();
const p={shape:'mesh',geometryId:'fixture',centerM:[12,34,56],sizeM:[2,3,4],
  positionsM:Object.freeze([1,2,3,2,2,3,1,3,3]),normals:Object.freeze([0,0,1,0,0,1,0,0,1]),indices:Object.freeze([0,1,2])};
const geometry=cache.get(p);assert(geometry.isBufferGeometry);
assert.deepEqual([...geometry.getAttribute('position').array],p.positionsM);
assert.deepEqual([...geometry.getAttribute('normal').array],p.normals);
assert.deepEqual([...geometry.index.array],p.indices);
assert.deepEqual(geometry.boundingBox.min.toArray(),[1,2,3]);
assert.equal(cache.get({...p}),geometry);
assert.throws(()=>cache.get({...p,positionsM:[...p.positionsM]}),/identity changed/);
assert.throws(()=>cache.get({geometryId:'not-ready'}),e=>e.code==='LAYOUT_EQUIPMENT_PREVIEW_NOT_READY');
assert.throws(()=>cache.get({...p,geometryId:'bad',indices:[0,1,30]}),/Invalid equipment mesh/);
const source=fs.readFileSync(new URL('../site/layout/layout-renderer.mjs',import.meta.url),'utf8');
const start=source.indexOf('  function previewPart('),end=source.indexOf('  function isPlan(',start);
assert(start>=0&&end>start);
const preview=new Function('THREE','material','equipmentMeshCache',source.slice(start,end)+';return previewPart;')(THREE,()=>material,cache);
const parent=new THREE.Group(),mesh=preview(parent,p);
assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
assert.deepEqual(mesh.position.toArray(),[0,0,0]);assert.deepEqual(mesh.scale.toArray(),[1,1,1]);
assert.deepEqual(new THREE.Box3().setFromObject(parent).min.toArray(),[1,2,3]);
const ghost=new THREE.MeshBasicMaterial(),copy=preview(parent,p,ghost);
assert.equal(copy.material,ghost);assert.equal(copy.geometry,geometry);
let disposed=0;geometry.addEventListener('dispose',()=>disposed++);cache.dispose();cache.dispose();assert.equal(disposed,1);
assert.throws(()=>cache.get(p),/disposed/);material.dispose();ghost.dispose();
assert.match(source,/equipmentMeshCache\.dispose\(\)/);
let actual=null;
if(process.argv.length>2){
  assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--prepared-json');
  const {installLayoutEquipmentPreviewGeometry,getLayoutEquipment,LAYOUT_EQUIPMENT_PREVIEW}=await import('../site/layout/layout-equipment.mjs');
  await installLayoutEquipmentPreviewGeometry(JSON.parse(fs.readFileSync(process.argv[3],'utf8')));
  const real=createEquipmentMeshCache(THREE),mat=new THREE.MeshStandardMaterial(),draw=new Function('THREE','material','equipmentMeshCache',source.slice(start,end)+';return previewPart;')(THREE,()=>mat,real);
  const seen=new Set();let parts=0;
  for(const [id,variants]of [['snapmaker_u1_layout_reference',['standalone','docked']],['biqu_pop_station_mini_layout_reference',['empty','loaded']]])
    for(const variant of variants)for(const part of getLayoutEquipment(id,variant).proxy.parts.filter(p=>p.shape==='mesh')){
      const node=draw(new THREE.Group(),part);assert.deepEqual(node.position.toArray(),[0,0,0]);assert.deepEqual(node.scale.toArray(),[1,1,1]);
      const pin=LAYOUT_EQUIPMENT_PREVIEW.geometry[part.geometryId];
      for(const [array,receipt]of [[node.geometry.attributes.position.array,pin.positionsF32],[node.geometry.attributes.normal.array,pin.normalsF32],[node.geometry.index.array,pin.indicesU32]]){
        const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);assert.equal(bytes.length,receipt.bytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
      }
      seen.add(part.geometryId);parts++;
    }
  assert.equal(seen.size,22);real.dispose();mat.dispose();actual={registeredVariants:4,meshedParts:parts,exactGeometries:seen.size};
}
console.log(JSON.stringify({passed:true,cases:10,actual,scope:'Actual BufferGeometry buffers and production previewPart closure; common datum, ghost ownership and cache disposal. Optional prepared source data checks exact 66 F32/U32 receipts. No GLB fit or browser claim.'}));

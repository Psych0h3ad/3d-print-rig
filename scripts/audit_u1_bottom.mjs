// Independent closure witnesses for the current prepared exterior only. This
// does not import the production triangulator or search for original sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

import {validateU1BottomGeometry,U1_CLOSURE_NAME} from './audit_layout_equipment_geometry.mjs';
const RIM='casing / lower casing perimeter rim';

export async function auditU1Bottom(opts){
 const {createAuditContext,inspectGLB,compareLoadedToGLB,sha,sourceHashes,limits}=await import('./audit_layout_equipment_geometry.mjs');
 const {register}=await import('node:module');
 const context=await createAuditContext(opts),{site}=context,prepared=await context.readPrepared();
 const THREE=await import(pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')));
 const threeURL=pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')).href;
 register('data:text/javascript,'+encodeURIComponent(`export function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c)}`),import.meta.url);
 const {createEquipmentMeshCache}=await import(pathToFileURL(path.join(site,'layout/layout-equipment-mesh.mjs')));
 const {createLayoutEquipmentLoader}=await import(pathToFileURL(path.join(site,'layout/layout-machine-loader.mjs')));
 await context.equipment.installLayoutEquipmentPreviewGeometry(prepared.data);
 const meshCache=createEquipmentMeshCache(THREE),loads=[],preview=[],sourceHashesByVariant=new Map();let bytes,row;
 const load=createLayoutEquipmentLoader({download:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 try{
  for(const variant of ['standalone','docked','standalone']){
   row=context.equipment.getLayoutEquipment('snapmaker_u1_layout_reference',variant);bytes=await context.readActual(row);
   const actual=inspectGLB(bytes,row),rawRim=actual.meshes.get(RIM),part=row.proxy.parts.find(p=>p.name===RIM);
   assert.ok(rawRim&&part);const previewGeometry=meshCache.get(part);
   preview.push({variant,...validateU1BottomGeometry(new Float32Array(part.positionsM),new Uint32Array(part.indices),previewGeometry,{merged:true})});
   const value=await load(row.id,{equipmentVariant:variant});
   try{
    assert.equal(compareLoadedToGLB(value.root,actual),actual.meshes.size);
    const caps=[],unchanged=[];let rim;
    value.root.traverse(n=>{if(n.name===U1_CLOSURE_NAME)caps.push(n);if((n.userData.name??n.name)===RIM)rim=n;
     if(n.isMesh&&!n.userData.layoutEquipmentDerivative)unchanged.push({name:n.userData.name??n.name,p:sha(Buffer.from(n.geometry.attributes.position.array.buffer)),n:sha(Buffer.from(n.geometry.attributes.normal.array.buffer)),i:n.geometry.index?sha(Buffer.from(n.geometry.index.array.buffer)):null});});
    assert.equal(caps.length,1);assert.equal(caps[0].parent,rim);assert.equal(caps[0].material,rim.material);
    assert.equal(value.source.derivatives.length,1);assert.equal(value.source.sha256,row.model.sha256);
    const closure=validateU1BottomGeometry(rawRim.positions,rawRim.indices,caps[0].geometry);
    const resetHash=sha(Buffer.from(JSON.stringify(unchanged)));
    if(sourceHashesByVariant.has(variant))assert.equal(resetHash,sourceHashesByVariant.get(variant),'A-B-A source geometry changed');sourceHashesByVariant.set(variant,resetHash);
    // A parent transform is used by docking/rotation and image/export scenes.
    // The cap remains a child of the authored rim through all these placements.
    const local=Array.from(caps[0].geometry.attributes.position.array),parent=new THREE.Group();parent.add(value.root);
    for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,0]){parent.position.set(.7,.855,-.3);parent.rotation.y=yaw;parent.updateMatrixWorld(true);
     assert.ok(caps[0].matrixWorld.equals(rim.matrixWorld),'Derived cap detaches from transformed exterior');assert.deepEqual(Array.from(caps[0].geometry.attributes.position.array),local);}
    value.root.removeFromParent();value.root.updateMatrixWorld(true);
    // Object3D serialization is also used by downstream geometry consumers;
    // reloading it must preserve the labeled derivative and its opaque PBR.
    const exported=new THREE.ObjectLoader().parse(value.root.toJSON());let exportedCap;exported.traverse(n=>{if(n.name===U1_CLOSURE_NAME)exportedCap=n;});assert.ok(exportedCap);
    validateU1BottomGeometry(rawRim.positions,rawRim.indices,exportedCap.geometry);
    assert.equal(exportedCap.material.transparent,false);assert.equal(exportedCap.material.opacity,1);
    const exportedG=new Set(),exportedM=new Set();exported.traverse(n=>{if(n.geometry)exportedG.add(n.geometry);if(n.material)exportedM.add(n.material);});for(const g of exportedG)g.dispose();for(const m of exportedM)m.dispose();
    const gs=new Set(),ms=new Set();value.root.traverse(n=>{if(n.geometry)gs.add(n.geometry);if(n.material)ms.add(n.material);});let disposed=0;for(const g of gs)g.addEventListener('dispose',()=>disposed++);
    value.dispose();value.dispose();assert.equal(disposed,gs.size);
    loads.push({variant,model:{...row.model},unchangedSourceMeshes:actual.meshes.size,sourceResetHash:resetHash,closure,transformedPlacements:5,serializedClosurePreserved:true,disposedGeometries:disposed});
   }finally{value.dispose();}
  }
  // Unrelated cabinet variants may not acquire a printer-floor derivative.
  for(const variant of ['empty','loaded'])for(const p of context.equipment.getLayoutEquipment('biqu_pop_station_mini_layout_reference',variant).proxy.parts.filter(p=>p.shape==='mesh'))assert.equal(meshCache.get(p).userData.layoutEquipmentDerivative,undefined);
 }finally{meshCache.dispose();}
 return {schema:'u1-measured-lower-shell-closure-audit-v1',passed:true,loads,preview,
  originalAssetsModified:false,sourcePreviewGeometries:prepared.arrays.size,sourcePreviewReceipts:prepared.arrayReceipts,
  auditInputFiles:context.auditInputFiles,sourceInputs:sourceHashes(site,['layout/layout-equipment.mjs','layout/layout-equipment-mesh.mjs','layout/layout-machine-loader.mjs']),
  auditScriptSHA256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  auditDependencies:{'scripts/audit_layout_equipment_geometry.mjs':sha(fs.readFileSync(new URL('./audit_layout_equipment_geometry.mjs',import.meta.url)))},...limits(),
  scope:'Prepared exterior lower-rim closure only: exact inner boundaries, horizontal planes, unit normals/winding, area conservation, sampled vertical rays, unchanged full source meshes/PBR, standalone-docked-standalone, transformed parent attachment, Object3D serialization and disposal. Raw GLBs and 22 preview source geometries remain unchanged. No interior mechanisms, original-source search, native solids, physical fit, GPU/browser or image-export claim.'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 // No top-level await: the existing gates import the independent witness above.
 async function main(){
  const {options,writeReport}=await import('./audit_layout_equipment_geometry.mjs');
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live fetch forbidden in U1 closure audit');};
  try{const opts=options(),report=await auditU1Bottom(opts);writeReport(opts,report);console.log(JSON.stringify({passed:report.passed,loads:report.loads.length,preview:report.preview,sourcePreviewGeometries:report.sourcePreviewGeometries}));}
  finally{globalThis.fetch=originalFetch;}
 }
 main().catch(error=>{console.error(error);process.exitCode=1;});
}

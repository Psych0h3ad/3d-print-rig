// Production loader counterpart to audit_layout_equipment_geometry.mjs.
// Same four-decoded-GLB map and optional --prepared-dir contract; all ten bodies
// stay outside site. Run this audit AFTER the geometry job, never concurrently.
// No CAD/WASM/native mesh work. GLTFLoader receives only authenticated GLBs;
// external images/buffers, extensions and nonidentity authored transforms fail.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DEFINITIONS,sha,options,sourceHashes,limits,createAuditContext,inspectGLB,
 compareRepresentations,auditPreviewRenderer,compareLoadedToGLB,validatePlateOccurrence,writeReport} from './audit_layout_equipment_geometry.mjs';
import {auditU1Bottom} from './audit_u1_bottom.mjs';

function commonSnapshot(root,kinds){
 const out=[];root.updateMatrixWorld(true);
 root.traverse(node=>{
  if(!node.isMesh)return;
  let owner=node;while(owner&&!owner.userData.groupKind)owner=owner.parent;
  if(!owner||!kinds.includes(owner.userData.groupKind))return;
  const p=node.geometry.attributes.position.array,n=node.geometry.attributes.normal.array,ix=node.geometry.index?.array,m=node.material;
  const hash=a=>a?sha(Buffer.from(a.buffer,a.byteOffset,a.byteLength)):null;
  out.push({name:node.name,group:owner.userData.groupId,positions:hash(p),normals:hash(n),indices:hash(ix),
   matrix:node.matrixWorld.toArray(),material:{color:m.color.toArray(),opacity:m.opacity,transparent:m.transparent,metalness:m.metalness,roughness:m.roughness}});
 });
 return out.sort((a,b)=>a.name.localeCompare(b.name));
}

export async function auditAssets(opts){
 const context=await createAuditContext(opts),prepared=await context.readPrepared();
 const {site,equipment}=context,threeURL=pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')).href;
 register('data:text/javascript,'+encodeURIComponent(`export function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c)}`),import.meta.url);
 const {createLayoutEquipmentLoader}=await import(pathToFileURL(path.join(site,'layout/layout-machine-loader.mjs')));
 const receipts={},reports=[],checks=[],snapshots=new Map(),used=new Set(),representationDifferences=[];
 let currentBytes=null,currentRow=null;
 const load=createLayoutEquipmentLoader({download:async row=>{
  assert.equal(row.id,currentRow.id);assert.equal(row.equipmentVariant,currentRow.equipmentVariant);
  assert.deepEqual(row.model,currentRow.model,'Production lease changed pinned identity');
  return currentBytes.buffer.slice(currentBytes.byteOffset,currentBytes.byteOffset+currentBytes.byteLength);
 }});
 for(const [id,variants,common]of [[DEFINITIONS[0][1],['standalone','docked','standalone'],['casing']],
  [DEFINITIONS[2][1],['empty','loaded','empty'],['cabinet','drawer']]]){
  let previousCommon=null;
  for(const variant of variants){
   const row=equipment.getLayoutEquipment(id,variant);currentRow=row;currentBytes=await context.readActual(row);
   const actual=inspectGLB(currentBytes,row),equivalence=compareRepresentations(row,actual,prepared),progress=[];
   actual.result.plateAttribution=validatePlateOccurrence(row,actual,prepared);
   for(const key of equivalence.used)used.add(key);if(!snapshots.has(id+'/'+variant))representationDifferences.push(...equivalence.findings);
   receipts[row.model.path]={bytes:currentBytes.length,sha256:sha(currentBytes),transfer:row.model.transfer};
   const value=await load(id,{equipmentVariant:variant,onProgress:event=>progress.push(event)});
   try{
    assert.equal(value.source.sha256,row.model.sha256);assert.equal(value.source.assetPath,row.model.path);
    assert.deepEqual(value.source.normalization.translation,[0,0,0]);
    assert.equal(value.source.normalization.individual_source_matrices_unchanged,true);
    assert.equal(value.source.normalization.shared_authored_variant_datum,true);
    assert.deepEqual(value.root.position.toArray(),[0,0,0]);assert.deepEqual(value.root.scale.toArray(),[1,1,1]);
    assert.deepEqual(row.fullScene.normalizationFrame.rootPivotM,[0,0,0]);
    const actualMeshes=compareLoadedToGLB(value.root,actual);
    const snapshot=commonSnapshot(value.root,common);assert.ok(snapshot.length>0);
    if(previousCommon)assert.deepEqual(snapshot,previousCommon,'Common arrays/matrices/materials changed during A-to-B-to-A');previousCommon=snapshot;
    const key=id+'/'+variant;if(snapshots.has(key))assert.deepEqual(snapshot,snapshots.get(key),'A-to-B-to-A did not restore original');snapshots.set(key,snapshot);
    assert.equal(progress.at(-1).phase,'ready');assert.ok(progress.some(e=>e.phase==='parse'));
    const geometries=new Set(),materials=new Set(),disposed={geometry:0,material:0};
    value.root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:node.material?[node.material]:[])materials.add(m);});
    for(const g of geometries)g.addEventListener('dispose',()=>disposed.geometry++);
    for(const m of materials)m.addEventListener('dispose',()=>disposed.material++);
    value.dispose();value.dispose();assert.equal(disposed.geometry,geometries.size);assert.equal(disposed.material,materials.size);assert.equal(value.root.children.length,0);
    reports.push({id,variant,asset:row.model.path,dimensionsM:value.dimensions,binary:actual.result,
     completeSourceEquivalentMeshes:actualMeshes,previewComparedMeshOccurrences:equivalence.occurrences,previewGLBBufferEquivalent:equivalence.equivalent,
     commonGeometrySnapshotMeshes:snapshot.length,disposed:{geometries:geometries.size,materials:materials.size}});
    checks.push(key+' complete GLB buffers/materials/hierarchy/datum/ABA/dispose');
   }finally{value.dispose();currentBytes=null;currentRow=null;}
  }
 }
 const rendererPreview=await auditPreviewRenderer(context,prepared);
 assert.deepEqual([...used].sort(),Object.keys(prepared.descriptor.geometry).sort(),'Unconsumed preview geometry');
 // All original production loads and the preview cache have been disposed.
 // Run the extra placement/serialization witnesses sequentially in this job.
 const u1Bottom=await auditU1Bottom(opts);assert.equal(u1Bottom.passed,true,'U1 bottom audit failed');
 const sourceInputs={...prepared.sourceInputs,...sourceHashes(site,['layout/layout-equipment.mjs','layout/layout-machine-loader.mjs',
  'layout/layout-equipment-transfer.mjs','layout/layout-equipment-mesh.mjs','layout/layout-renderer.mjs','viewer/vendor-r180/GLTFLoader.js','viewer/vendor-r180/three.module.js','viewer/vendor-r180/three.core.js'])};
 return {schema:'layout-equipment-actual-asset-audit-v2',passed:prepared.triangleFindings.length===0,findings:prepared.triangleFindings,checks,assets:receipts,sourceInputs,
  auditInputFiles:context.auditInputFiles,plateAttribution:prepared.plateAttribution,loads:reports,u1Bottom,preview:{model:equipment.LAYOUT_EQUIPMENT_PREVIEW_MODEL,geometries:used.size,arrayReceipts:prepared.arrayReceipts,triangles:prepared.previewTriangles,productionRenderer:rendererPreview,body:prepared.descriptor.body,gzip:prepared.descriptor.gzip},
  representationComparison:{basis:'Catalog-declared simplified exterior preview versus full GLB; distinct prepared representations',differences:representationDifferences},
  transportMode:'registered-exact-body',preparedDir:context.preparedDir,
  auditScriptSHA256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  auditDependencies:Object.fromEntries(['audit_layout_equipment_geometry.mjs','audit_u1_bottom.mjs'].map(name=>['scripts/'+name,sha(fs.readFileSync(new URL('./'+name,import.meta.url)))])),...limits(),
  scope:'Exact four GLB/gzip pairs and preview JSON/gzip, tracked metadata, source-backed plate contour receipt and full plate-specific license and all 66 preview-array receipts. Every source GLTFLoader mesh has complete position/normal/index and material equivalence to actual GLB; unchanged common matrices/geometry/materials through A-to-B-to-A, identity root and exact disposal. Every production preview source array remains independently pinned and unchanged. Separately labeled full/preview U1 lower-rim closures have exact source-boundary, winding, area and vertical-ray checks; full closures inherit the original rim PBR. Differences between full GLB and catalog-declared simplified previews are recorded without an equivalence claim. Other proxy primitives remain illustrative. No native solids or physical mounting/load/operating clearance certification; browser/GPU, state save/load and full machine coverage remain separate.'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network forbidden in equipment audit');};
 try{const opts=options(),report=await auditAssets(opts);writeReport(opts,report);console.log(JSON.stringify({passed:report.passed,actualAssets:Object.keys(report.assets).length,loads:report.loads.length,checks:report.checks.length,preview:report.preview,findings:report.findings.length}));if(!report.passed)process.exitCode=1;}
 finally{globalThis.fetch=originalFetch;}
}

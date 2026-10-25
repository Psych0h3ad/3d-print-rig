// Independent V6 intrinsic-plate witnesses; legacy triangulator fixtures remain
// in test_u1_bottom.mjs. Exact exported arrays are authenticated before use.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {U1_CLOSURE_NAME,U1_INTRINSIC_CLOSURE_NAME} from './audit_layout_equipment_geometry.mjs';
const RIM='casing / lower casing perimeter rim';
const sourceName=node=>node.userData.name??node.name;

const INTRINSIC_TOLERANCES=Object.freeze({topologyWeldM:1e-7,planeM:1e-7,areaM2:1e-8,rayEdgeM2:1e-12,normal:2e-5,triangleCrossM2:1e-14});
const rawPoint=(p,i)=>[p[i*3],p[i*3+1],p[i*3+2]];
const rawArea=points=>points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[2]-b[0]*a[2];},0)/2;
const topologyEdge=(a,b)=>a<b?a+'|'+b:b+'|'+a;
function topologyIds(positions){
 const ids=new Uint32Array(positions.length/3),keys=new Map();
 for(let i=0;i<ids.length;i++){
  const k=rawPoint(positions,i).map(v=>Math.round(v/INTRINSIC_TOLERANCES.topologyWeldM)).join(',');
  if(!keys.has(k))keys.set(k,keys.size);ids[i]=keys.get(k);
 }
 return ids;
}
function rawBoundary(positions,indices,y,ids){
 const edges=new Map();let area=0,triangles=0;
 for(let i=0;i<indices.length;i+=3){
  const vertexIds=[indices[i],indices[i+1],indices[i+2]],t=vertexIds.map(j=>rawPoint(positions,j));
  if(!t.every(q=>Math.abs(q[1]-y)<INTRINSIC_TOLERANCES.planeM))continue;
  area+=Math.abs(rawArea(t));triangles++;
  for(let j=0;j<3;j++){
   const a=t[j],b=t[(j+1)%3],from=ids?String(ids[vertexIds[j]]):a.join(','),to=ids?String(ids[vertexIds[(j+1)%3]]):b.join(','),key=topologyEdge(from,to),old=edges.get(key);
   assert.notEqual(from,to,'Collapsed horizontal topology edge');
   if(old){assert.equal(old.count,1,'Nonmanifold horizontal edge');assert.equal(old.from,to,'Horizontal shared-edge winding');old.count++;}
   else edges.set(key,{a,b,from,to,count:1});
  }
 }
 return {edges:new Map([...edges].filter(([,e])=>e.count===1)),area,triangles};
}
function rawLoops(edges){
 const remaining=new Map(edges),loops=[];
 while(remaining.size){
  const next=new Map();for(const [key,e]of remaining){assert.ok(!next.has(e.from),'Branching boundary');next.set(e.from,{...e,key});}
  const start=next.keys().next().value,points=[];let current=start;
  do{const e=next.get(current);assert.ok(e,'Broken boundary');points.push(e.a);next.delete(current);remaining.delete(e.key);current=e.to;}while(current!==start);
  assert.ok(points.length>=3,'Short boundary');loops.push(points);
 }
 return loops;
}
function rawContains(p,polygon){
 let count=0;
 for(let j=polygon.length-1,i=0;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];
  if((a[2]>p[2])!==(b[2]>p[2])&&p[0]<(b[0]-a[0])*(p[2]-a[2])/(b[2]-a[2])+a[0])count++;
 }
 return count%2===1;
}
function rawCrossing(a,b,c,d){
 const turn=(p,q,r)=>(q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0]);
 const on=(p,q,r)=>Math.abs(turn(p,q,r))<1e-14&&r[0]>=Math.min(p[0],q[0])-1e-12&&r[0]<=Math.max(p[0],q[0])+1e-12&&r[2]>=Math.min(p[2],q[2])-1e-12&&r[2]<=Math.max(p[2],q[2])+1e-12;
 const u=turn(a,b,c),v=turn(a,b,d),w=turn(c,d,a),x=turn(c,d,b);
 return (u*v<0&&w*x<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function rawVerticalHit(q,t,y){
 const turn=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
 const [a,b,c]=t,denominator=turn(a,b,c),edge=[turn(a,b,q),turn(b,c,q),turn(c,a,q)];
 if(!(edge.every(n=>n>=-INTRINSIC_TOLERANCES.rayEdgeM2)||edge.every(n=>n<=INTRINSIC_TOLERANCES.rayEdgeM2))||denominator===0)return false;
 // Interpolate the ACTUAL raw triangle's Y. No welded/flattened ray surface.
 const u=turn(q,b,c)/denominator,v=turn(a,q,c)/denominator,w=1-u-v,hitY=u*a[1]+v*b[1]+w*c[1];
 return Number.isFinite(hitY)&&Math.abs(hitY-y)<INTRINSIC_TOLERANCES.planeM;
}

/** Seam IDs are welded only for connectivity. Every geometric operation uses
 * the authenticated source vertices/indices without moving or healing them.
 * Sampled exterior evidence, not native-solid/physical enclosure clearance.
 */
export function validateU1IntrinsicBottomGeometry(sourcePositions,sourceIndices,geometry){
 const p=geometry.attributes?.position?.array,n=geometry.attributes?.normal?.array,ix=geometry.index?.array;
 assert.ok(p?.length&&p.length%3===0&&n?.length===p.length&&ix?.length&&ix.length%3===0,'Missing intrinsic plate arrays');
 assert.ok(Array.from(p).every(Number.isFinite)&&Array.from(n).every(Number.isFinite),'Nonfinite intrinsic plate');
 assert.ok(Array.from(ix).every(i=>Number.isSafeInteger(i)&&i>=0&&i<p.length/3),'Intrinsic plate index out of range');
 assert.equal(geometry.userData?.layoutEquipmentDerivative,undefined,'Intrinsic plate is a runtime derivative');
 const ids=topologyIds(p),edges=new Map();let low=Infinity,high=-Infinity,volume=0;
 for(let i=0;i<p.length;i+=3){
  assert.ok(Math.abs(Math.hypot(n[i],n[i+1],n[i+2])-1)<INTRINSIC_TOLERANCES.normal,'Intrinsic plate unit normal');
  low=Math.min(low,p[i+1]);high=Math.max(high,p[i+1]);
 }
 assert.ok(high-low>1e-6&&high-low<.02,'Intrinsic plate thickness');
 let rimLow=Infinity,rimHigh=-Infinity;
 for(let i=1;i<sourcePositions.length;i+=3){assert.ok(Number.isFinite(sourcePositions[i]));rimLow=Math.min(rimLow,sourcePositions[i]);rimHigh=Math.max(rimHigh,sourcePositions[i]);}
 assert.ok(low>=rimLow-INTRINSIC_TOLERANCES.planeM&&high<=rimHigh+INTRINSIC_TOLERANCES.planeM,'Intrinsic plate leaves measured lower-rim height');
 const horizontal=[];
 for(let i=0;i<ix.length;i+=3){
  const vertexIds=[ix[i],ix[i+1],ix[i+2]],t=vertexIds.map(j=>rawPoint(p,j)),[a,b,c]=t;
  const u=b.map((v,j)=>v-a[j]),v=c.map((q,j)=>q-a[j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  assert.ok(Math.hypot(...cross)>INTRINSIC_TOLERANCES.triangleCrossM2,'Intrinsic plate degenerate triangle');
  assert.ok(cross.reduce((s,q,j)=>s+q*vertexIds.reduce((sum,id)=>sum+n[id*3+j],0),0)>0,'Intrinsic plate winding/normal orientation');
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  for(let j=0;j<3;j++){
   const from=ids[vertexIds[j]],to=ids[vertexIds[(j+1)%3]],key=topologyEdge(from,to),old=edges.get(key);
   assert.notEqual(from,to,'Intrinsic plate collapsed topology edge');
   if(old){assert.equal(old.count,1,'Intrinsic plate nonmanifold edge');assert.equal(old.from,to,'Intrinsic plate shared-edge winding');old.count++;}
   else edges.set(key,{from,to,count:1});
  }
  if(t.every(q=>Math.abs(q[1]-low)<INTRINSIC_TOLERANCES.planeM)||t.every(q=>Math.abs(q[1]-high)<INTRINSIC_TOLERANCES.planeM)){
   const y=t.every(q=>Math.abs(q[1]-low)<INTRINSIC_TOLERANCES.planeM)?low:high,sign=y===low?1:-1;
   assert.ok(rawArea(t)*sign>INTRINSIC_TOLERANCES.triangleCrossM2,'Intrinsic plate horizontal winding');horizontal.push({y,t,triangle:i/3});
  }
 }
 assert.ok([...edges.values()].every(e=>e.count===2),'Intrinsic plate open boundary');assert.ok(volume>0,'Intrinsic plate signed volume');
 const openings=[];
 for(const y of [rimLow,rimHigh]){
  const face=rawBoundary(sourcePositions,sourceIndices,y),loops=rawLoops(face.edges).sort((a,b)=>Math.abs(rawArea(b))-Math.abs(rawArea(a)));
  assert.equal(loops.length,2,'Source rim must have one measured opening');const [outer,hole]=loops;
  assert.ok(Math.abs(face.area-(Math.abs(rawArea(outer))-Math.abs(rawArea(hole))))<INTRINSIC_TOLERANCES.areaM2,'Measured rim annulus area');
  assert.ok(hole.every(q=>rawContains(q,outer)),'Source hole is outside rim');openings.push({outer,hole});
 }
 const planes=[];let rays=0;
 for(const y of [low,high]){
  const face=rawBoundary(p,ix,y,ids),loops=rawLoops(face.edges);assert.equal(loops.length,1,'Multiple horizontal boundary loops');const outline=loops[0];
  assert.ok(Math.abs(face.area-Math.abs(rawArea(outline)))<INTRINSIC_TOLERANCES.areaM2,'Intrinsic plate complete horizontal area');
  for(let i=0;i<outline.length;i++)for(let j=i+1;j<outline.length;j++)if(j!==i+1&&!(i===0&&j===outline.length-1))assert.ok(!rawCrossing(outline[i],outline[(i+1)%outline.length],outline[j],outline[(j+1)%outline.length]),'Intrinsic plate self-intersecting boundary');
  let samples=0;
  for(const {outer,hole}of openings){
   assert.ok(outline.every(q=>rawContains(q,outer)),'Intrinsic plate extends outside measured rim');assert.ok(hole.every(q=>rawContains(q,outline)),'Intrinsic plate does not enclose measured opening');
   for(let i=0;i<hole.length;i++)for(let j=0;j<outline.length;j++)assert.ok(!rawCrossing(hole[i],hole[(i+1)%hole.length],outline[j],outline[(j+1)%outline.length]),'Intrinsic plate boundary crosses opening');
   const witnesses=[];
   for(let i=0;i<hole.length;i++)for(const f of [0,.25,.5,.75]){const a=hole[i],b=hole[(i+1)%hole.length];witnesses.push([a[0]+(b[0]-a[0])*f,y,a[2]+(b[2]-a[2])*f]);}
   const xs=hole.map(q=>q[0]),zs=hole.map(q=>q[2]),lx=Math.min(...xs),hx=Math.max(...xs),lz=Math.min(...zs),hz=Math.max(...zs);
   for(let x=0;x<21;x++)for(let z=0;z<21;z++){const q=[lx+(hx-lx)*(x+.37)/21,y,lz+(hz-lz)*(z+.61)/21];if(rawContains(q,hole))witnesses.push(q);}
   for(const q of witnesses){assert.ok(horizontal.some(face=>face.y===y&&rawVerticalHit(q,face.t,y)),'Intrinsic bottom vertical ray escapes actual raw plate');samples++;}
  }
  assert.ok(samples>0,'Missing intrinsic plate rays');rays+=samples;planes.push({yM:y,areaM2:face.area,boundaryVertices:outline.length,triangles:face.triangles,verticalRayChecks:samples});
 }
 return {kind:'intrinsic-bottom-closure',vertices:p.length/3,triangles:ix.length/3,closedManifoldEdges:edges.size,signedVolumeM3:volume,
  rimPlanesM:[rimLow,rimHigh],planes,verticalRayChecks:rays,measuredOpeningContained:true,sourceArraysUnchanged:true,
  topologyWeldToleranceM:INTRINSIC_TOLERANCES.topologyWeldM,topologyUsesWeldedIdsOnly:true,geometryUsesRawSourceVertices:true,
  tolerances:{...INTRINSIC_TOLERANCES},rayMethod:'Raw triangle XZ barycentric vertical intersection, including interpolated raw Y; no welded/flattened triangle coordinates'};
}

export async function auditU1Bottom(opts){
 const {createAuditContext,inspectGLB,compareLoadedToGLB,sha,sourceHashes,limits,arrayReceipt}=await import('./audit_layout_equipment_geometry.mjs');
 const {register}=await import('node:module');
 const context=await createAuditContext(opts),{site}=context,prepared=await context.readPrepared();
 assert.equal(prepared.triangleFindings.length,0,'Prepared preview triangle findings');
 const THREE=await import(pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')));
 const threeURL=pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')).href;
 register('data:text/javascript,'+encodeURIComponent(`export function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c)}`),import.meta.url);
 const {createEquipmentMeshCache}=await import(pathToFileURL(path.join(site,'layout/layout-equipment-mesh.mjs')));
 const {createLayoutEquipmentLoader}=await import(pathToFileURL(path.join(site,'layout/layout-machine-loader.mjs')));
 await context.equipment.installLayoutEquipmentPreviewGeometry(prepared.data);
 const meshCache=createEquipmentMeshCache(THREE),loads=[],preview=[],sourceHashesByVariant=new Map();let bytes;
 const load=createLayoutEquipmentLoader({download:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 try{
  for(const variant of ['standalone','docked','standalone']){
   const row=context.equipment.getLayoutEquipment('snapmaker_u1_layout_reference',variant);bytes=await context.readActual(row);
   const actual=inspectGLB(bytes,row),rawRim=actual.meshes.get(RIM),rawBottom=actual.meshes.get(U1_INTRINSIC_CLOSURE_NAME);
   assert.ok(rawRim&&rawBottom,'Exact intrinsic bottom/rim missing');assert.equal(actual.kinds.get('bottom_closure')?.size,1);
   const rims=row.proxy.parts.filter(p=>p.name===RIM),parts=row.proxy.parts.filter(p=>p.groupKind==='bottom_closure');
   assert.equal(rims.length,1);assert.equal(parts.length,1);assert.equal(parts[0].name,U1_INTRINSIC_CLOSURE_NAME);
   const rim=rims[0],part=parts[0],previewRim=meshCache.get(rim),previewPlate=meshCache.get(part);
   assert.deepEqual(arrayReceipt(previewRim.attributes.position.array),prepared.descriptor.geometry[rim.geometryId].positionsF32,'Preview rim gained a duplicate cap');
   assert.deepEqual(arrayReceipt(previewRim.index.array),prepared.descriptor.geometry[rim.geometryId].indicesU32,'Preview rim indices gained a duplicate cap');
   assert.equal(previewRim.userData.layoutEquipmentDerivative,undefined);assert.equal(previewPlate.userData.layoutEquipmentDerivative,undefined);
   const sourceRim=prepared.arrays.get(rim.geometryId);
   preview.push({variant,...validateU1IntrinsicBottomGeometry(sourceRim.positions,sourceRim.indices,previewPlate),runtimeDerivedCaps:0});
   const value=await load(row.id,{equipmentVariant:variant});
   try{
    assert.equal(compareLoadedToGLB(value.root,actual),actual.meshes.size);
    const plates=[],unchanged=[];let derivatives=0;
    value.root.traverse(n=>{
     if(!n.isMesh)return;
     if(n.userData.groupKind==='bottom_closure'||n.userData.groupId==='bottom_closure'||sourceName(n)===U1_INTRINSIC_CLOSURE_NAME)plates.push(n);
     if(n.name===U1_CLOSURE_NAME||n.userData.layoutEquipmentDerivative||n.geometry.userData.layoutEquipmentDerivative)derivatives++;
     unchanged.push({name:sourceName(n),p:arrayReceipt(n.geometry.attributes.position.array),n:arrayReceipt(n.geometry.attributes.normal.array),i:n.geometry.index?arrayReceipt(new Uint32Array(n.geometry.index.array)):null});
    });
    assert.equal(plates.length,1);assert.equal(derivatives,0);assert.equal(value.source.derivatives,undefined);
    assert.equal(value.root.userData.layoutEquipment.derivatives,undefined);assert.equal(value.source.sha256,row.model.sha256);
    const plate=plates[0],closure=validateU1IntrinsicBottomGeometry(rawRim.positions,rawRim.indices,plate.geometry);
    assert.equal(plate.material.transparent,false);assert.equal(plate.material.opacity,1);
    const resetHash=sha(Buffer.from(JSON.stringify(unchanged)));
    if(sourceHashesByVariant.has(variant))assert.equal(resetHash,sourceHashesByVariant.get(variant),'A-B-A source geometry changed');sourceHashesByVariant.set(variant,resetHash);
    const local=Array.from(plate.geometry.attributes.position.array),parent=new THREE.Group();parent.add(value.root);
    for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,0]){
     parent.position.set(.7,.855,-.3);parent.rotation.y=yaw;parent.updateMatrixWorld(true);
     assert.ok(plate.matrixWorld.equals(value.root.matrixWorld),'Intrinsic plate detaches from common authored datum');assert.deepEqual(Array.from(plate.geometry.attributes.position.array),local);
    }
    value.root.removeFromParent();value.root.updateMatrixWorld(true);
    const exported=new THREE.ObjectLoader().parse(value.root.toJSON()),exportedPlates=[];
    exported.traverse(n=>{if(n.isMesh&&sourceName(n)===U1_INTRINSIC_CLOSURE_NAME)exportedPlates.push(n);assert.equal(n.userData.layoutEquipmentDerivative,undefined);});
    assert.equal(exportedPlates.length,1);validateU1IntrinsicBottomGeometry(rawRim.positions,rawRim.indices,exportedPlates[0].geometry);
    assert.equal(exportedPlates[0].material.transparent,false);assert.equal(exportedPlates[0].material.opacity,1);
    const exportedG=new Set(),exportedM=new Set();exported.traverse(n=>{if(n.geometry)exportedG.add(n.geometry);if(n.material)exportedM.add(n.material);});for(const g of exportedG)g.dispose();for(const m of exportedM)m.dispose();
    const gs=new Set();value.root.traverse(n=>{if(n.geometry)gs.add(n.geometry);});let disposed=0;for(const g of gs)g.addEventListener('dispose',()=>disposed++);
    value.dispose();value.dispose();assert.equal(disposed,gs.size);
    loads.push({variant,model:{...row.model},unchangedSourceMeshes:actual.meshes.size,sourceResetHash:resetHash,closure,runtimeDerivedCaps:0,transformedPlacements:5,serializedClosurePreserved:true,disposedGeometries:disposed});
   }finally{value.dispose();}
  }
  for(const variant of ['empty','loaded'])for(const p of context.equipment.getLayoutEquipment('biqu_pop_station_mini_layout_reference',variant).proxy.parts.filter(p=>p.shape==='mesh'))assert.equal(meshCache.get(p).userData.layoutEquipmentDerivative,undefined);
 }finally{meshCache.dispose();}
 return {schema:'u1-measured-lower-shell-closure-audit-v1',closureMode:'intrinsic-v6',passed:true,loads,preview,
  originalAssetsModified:false,sourcePreviewGeometries:prepared.arrays.size,sourcePreviewReceipts:prepared.arrayReceipts,
  auditInputFiles:context.auditInputFiles,sourceInputs:sourceHashes(site,['layout/layout-equipment.mjs','layout/layout-equipment-mesh.mjs','layout/layout-machine-loader.mjs']),
  auditScriptSHA256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  auditDependencies:{'scripts/audit_layout_equipment_geometry.mjs':sha(fs.readFileSync(new URL('./audit_layout_equipment_geometry.mjs',import.meta.url)))},...limits(),
  scope:'Exact prepared intrinsic full/preview plate: closed manifold and positive volume, winding/normals, horizontal-face area, measured rim-opening containment and actual triangle vertical rays. No duplicate runtime caps, unchanged source arrays/PBR, standalone-docked-standalone, parent attachment, serialization and disposal. Legacy derived-cap fixtures are separate. No original/native solids, physical fit, GPU/browser or image-export claim.'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 async function main(){
  const {options,writeReport}=await import('./audit_layout_equipment_geometry.mjs');
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live fetch forbidden in U1 closure audit');};
  try{const opts=options(),report=await auditU1Bottom(opts);writeReport(opts,report);console.log(JSON.stringify({passed:report.passed,loads:report.loads.length,preview:report.preview,sourcePreviewGeometries:report.sourcePreviewGeometries}));}
  finally{globalThis.fetch=originalFetch;}
 }
 main().catch(error=>{console.error(error);process.exitCode=1;});
}

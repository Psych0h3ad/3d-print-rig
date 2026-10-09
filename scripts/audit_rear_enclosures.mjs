// Actual exported rear/floor/deck/Z-cover checks. Mesh evidence is not native fit.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {machineChoices} from '../site/viewer/machines.js';
import {nativeWitnessBundle} from './trident-deck-evidence.mjs';

const sourceSite = new URL('../site/', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Export tolerances only; these do not waive native body interference.
// Source exporters module_cad.py and build_custom_voron_80.py tessellate at
// 0.18 mm linear deflection. This is a mesh contour check at that resolution.
export const meshToleranceMM = .18;
export const applicableMachines = (choices=machineChoices) => choices.filter(m=>m.available!==false&&['trident','v24'].includes(m.family));
export function requireCompleteCoverage(choices, rows) {
 assert.equal(new Set(rows.map(r=>r.machine_id)).size,rows.length,'Duplicate enclosure coverage');
 assert.deepEqual(rows.map(r=>r.machine_id).sort(),applicableMachines(choices).map(m=>m.id).sort(),'Missing/unregistered enclosure machine');
}
export function requiredLeaves(machine) {
 if(machine.vendor==='siboor'&&machine.family==='trident')return ['638','679','1337','1338'];
 if(machine.vendor==='fysetc')return ['1159','1178','1179','1332','1335','1338','1341'];
 return machine.family==='trident'?['1169','1188','1189','1219','723','738','741']:
  ['01206','01207','01208','01227','01376','01379','01382','01385'];
}
export const sourceLeaf = row => String(row.source_leaf??row.source?.source_key??row.source_key??row.source_id??row.key.replace(/^.*_/,''));
export function requiredParts(machine,manifest) {
 return requiredLeaves(machine).map(leaf=>{
  const rows=manifest.parts.filter(p=>sourceLeaf(p)===leaf&&
   (machine.vendor==='siboor'&&machine.family==='trident'?p.key===leaf:machine.vendor==='fysetc'?p.key===machine.id+'_'+leaf:
    machine.family==='v24'?p.key==='v24_'+leaf:p.key.startsWith('voron_trident_')&&p.key.endsWith('_base_'+leaf)));
  assert.equal(rows.length,1,`${machine.id}: missing/duplicate source leaf ${leaf}`);
  assert.equal(rows[0].motion,'fixed',`${machine.id}: enclosure ${leaf} is moving`);return rows[0];
 });
}
export function boundsOf(points) {
 const b=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
 for(const p of points)for(let i=0;i<3;i++){assert(Number.isFinite(p[i]));b[0][i]=Math.min(b[0][i],p[i]);b[1][i]=Math.max(b[1][i],p[i]);}return b;
}
export function checkBounds(mesh,row) {
 const error=Math.max(...mesh.bounds.flatMap((b,i)=>b.map((v,j)=>Math.abs(v-row.bounds_mm[i][j]))));
 assert(error<.15,`${row.key}: exported/native metadata bounds diverge ${error} mm`);return error;
}

// Consume indexed positions and all scene transforms, never accessor min/max.
export function decodePanelAsset(raw,wantedKeys) {
 assert.equal(raw.readUInt32LE(0),0x46546c67,'Not GLB');assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
 const n=raw.readUInt32LE(12);assert.equal(raw.readUInt32LE(16),0x4e4f534a);
 const data=JSON.parse(raw.subarray(20,20+n));assert.equal(raw.readUInt32LE(24+n),0x004e4942);
 const binary=raw.subarray(28+n,28+n+raw.readUInt32LE(20+n));
 const accessor=index=>{
  const a=data.accessors[index],v=data.bufferViews[a?.bufferView];assert(a&&v&&!a.sparse&&(v.buffer??0)===0,'Unsupported GLB accessor');
  const components={SCALAR:1,VEC3:3}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType];assert(components&&bytes&&!a.normalized);
  const offset=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??bytes*components;
  assert(a.count>0&&stride>=bytes*components);
  assert((a.byteOffset??0)+(a.count-1)*stride+bytes*components<=v.byteLength);
  assert(offset+(a.count-1)*stride+bytes*components<=binary.length);
  const read=at=>a.componentType===5126?binary.readFloatLE(at):a.componentType===5125?binary.readUInt32LE(at):a.componentType===5123?binary.readUInt16LE(at):binary.readUInt8(at);
  return {a,values:Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>read(offset+i*stride+j*bytes)))};
 };
 const parts=new Map(),visited=new Set();
 const visit=(index,parent,inherited)=>{
  assert(!visited.has(index),'Repeated/cyclic GLB scene node');visited.add(index);const node=data.nodes[index];assert(node);
  const local=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation??[0,0,0])),new THREE.Quaternion(...(node.rotation??[0,0,0,1])),new THREE.Vector3(...(node.scale??[1,1,1])));
  const world=parent.clone().multiply(local);assert(world.elements.every(Number.isFinite));const mesh=data.meshes?.[node.mesh];
  const key=node.extras?.part_key??mesh?.extras?.part_key??inherited??node.name;
  if(mesh&&wantedKeys.has(key)){
   assert(!parts.has(key),`${key}: duplicate exported part`);const vertices=[],triangles=[];
   for(const p of mesh.primitives){
    assert.equal(p.mode??4,4,`${key}: non-triangle geometry`);const positions=accessor(p.attributes.POSITION);assert.equal(positions.a.componentType,5126);const offset=vertices.length;
    for(const xyz of positions.values){assert(xyz.every(Number.isFinite),`${key}: non-finite vertex`);const v=new THREE.Vector3(...xyz).applyMatrix4(world);vertices.push([v.x*1000,-v.z*1000,v.y*1000]);}
    const indices=p.indices===undefined?positions.values.map((_,i)=>[i]):accessor(p.indices).values;assert.equal(indices.length%3,0);
    for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3).map(v=>v[0]);assert(ids.every(k=>Number.isInteger(k)&&k>=0&&k<positions.values.length));triangles.push(ids.map(k=>k+offset));}
   }
   assert(vertices.length&&triangles.length,`${key}: empty exported part`);parts.set(key,{vertices,triangles,bounds:boundsOf(vertices)});
  }
  for(const child of node.children??[])visit(child,world,key);
 };
 const scene=data.scenes[data.scene??0];assert(scene?.nodes?.length);for(const index of scene.nodes)visit(index,new THREE.Matrix4(),undefined);
 for(const key of wantedKeys)assert(parts.has(key),`${key}: missing actual exported plate/cover`);return parts;
}

// Complete planar sheet-face contours, including inner holes and OEM notches.
// Welding suppresses face triangulation seams without flattening real openings.
export function sheetBoundary(mesh,axis) {
 const plane=mesh.bounds[1][axis],vertices=new Map(),edges=new Map(),key=p=>p.map(v=>Math.round(v/.001)).join(',');
 for(const t of mesh.triangles){const points=t.map(i=>mesh.vertices[i]);if(!points.every(p=>Math.abs(p[axis]-plane)<.002))continue;
  for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3],ka=key(a),kb=key(b);if(ka===kb)continue;vertices.set(ka,a);vertices.set(kb,b);
   const id=[ka,kb].sort().join('|'),e=edges.get(id)??{a:ka,b:kb,count:0};e.count++;edges.set(id,e);}
 }
 const boundary=[...edges.values()].filter(e=>e.count===1).map(e=>[vertices.get(e.a),vertices.get(e.b)]);
 assert(boundary.length>=4,'Missing complete planar sheet face boundary');return boundary;
}
const segmentDistance=(p,a,b)=>{
 const d=b.map((v,i)=>v-a[i]),den=d.reduce((s,v)=>s+v*v,0),t=den?Math.max(0,Math.min(1,p.reduce((s,v,i)=>s+(v-a[i])*d[i],0)/den)):0;
 return Math.hypot(...p.map((v,i)=>v-a[i]-t*d[i]));
};
export function compareBoundaries(expected,actual,tolerance=meshToleranceMM) {
 assert(expected.length&&actual.length,'Missing source/actual contours');let error=0;
 for(const[from,to]of [[expected,actual],[actual,expected]])for(const[a,b]of from)for(const t of [0,.25,.5,.75,1]){
  const p=a.map((v,i)=>v+t*(b[i]-v));error=Math.max(error,Math.min(...to.map(([c,d])=>segmentDistance(p,c,d))));
 }
 assert(error<=tolerance,`Full source cutout boundary changed: ${error} mm`);return error;
}
export function compareRigidVertices(source,actual,delta,tolerance=meshToleranceMM) {
 const expected={vertices:source.vertices.map(p=>p.map((v,i)=>v+delta[i])),triangles:source.triangles};let error=0;
 // Remeshing changes vertex phase on curves. Compare to complete triangle
 // surfaces in both directions, including face centroids, instead of equating
 // tessellation vertices with native shape identity.
 for(const[from,to]of [[expected,actual],[actual,expected]]){
  const cells=new Map(),cellSize=5;
  for(const ids of to.triangles){const v=ids.map(i=>to.vertices[i]),b=boundsOf(v),tri=new THREE.Triangle(...v.map(p=>new THREE.Vector3(...p)));
   const lo=b[0].map(v=>Math.floor((v-tolerance)/cellSize)),hi=b[1].map(v=>Math.floor((v+tolerance)/cellSize));
   for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){const id=[x,y,z].join(',');if(!cells.has(id))cells.set(id,[]);cells.get(id).push(tri);}
  }
  const samples=[...from.vertices,...from.triangles.flatMap(t=>[
   [0,1,2].map(i=>t.reduce((s,k)=>s+from.vertices[k][i],0)/3),
   ...[[0,1],[1,2],[2,0]].map(([a,b])=>from.vertices[t[a]].map((v,i)=>(v+from.vertices[t[b]][i])/2))])];
  for(const p of samples){const point=new THREE.Vector3(...p),out=new THREE.Vector3(),id=p.map(v=>Math.floor(v/cellSize)).join(',');let nearest=Infinity;
   for(const tri of cells.get(id)??[])nearest=Math.min(nearest,tri.closestPointToPoint(point,out).distanceTo(point));
   assert(nearest<=tolerance,`Source Z-cover surface changed near [${p.join(',')}]`);error=Math.max(error,nearest);
  }
 }
 assert(error<=tolerance,`Source Z-cover vertices changed: ${error} mm`);return error;
}
export function measureFloorGaps(panel,frame) {
 const horizontal=frame.filter(p=>p.bounds[1][2]-p.bounds[0][2]<25&&p.bounds[0][2]<1&&p.bounds[1][2]>0),gaps=[];
 for(let axis=0;axis<2;axis++)for(const side of [-1,1]){
  const bars=horizontal.filter(p=>p.bounds[1][axis]-p.bounds[0][axis]<25&&side*(p.bounds[0][axis]+p.bounds[1][axis])/2>50&&p.bounds[1][1-axis]-p.bounds[0][1-axis]>250);
  assert(bars.length,'Missing measured floor perimeter frame');
  const plane=side<0?Math.min(...bars.map(p=>p.bounds[1][axis])):Math.max(...bars.map(p=>p.bounds[0][axis]));
  const gap=side<0?panel.bounds[0][axis]-plane:plane-panel.bounds[1][axis];
  gaps.push(gap);
 }return gaps;
}
export function checkFloorGap(panel,frame,expected=[.5,.5,.5,.5],tolerance=.05) {
 const gaps=measureFloorGaps(panel,frame);
 for(let i=0;i<4;i++)assert(Math.abs(gaps[i]-expected[i])<=tolerance,`Floor/frame gap differs from source ${expected[i]} mm: ${gaps[i]} mm`);
 return gaps;
}
export function checkDownloadBinding(entry,parts,witness) {
 assert(entry?.step_zip?.sha256,'Missing exact default STEP download');assert.equal(witness?.zip_sha256,entry.step_zip.sha256,'Default download ZIP/native proof divergence');
 assert(/^[a-f0-9]{64}$/.test(witness.step_sha256),'Missing packaged STEP hash');assert.equal(witness.native_readback_performed,true,'Download has no native readback');
 for(const p of parts){const found=witness.parts.filter(r=>r.key===p.key);assert.equal(found.length,1,`${p.key}: missing/duplicate download native binding`);
  assert(p.native_sha256,`${p.key}: missing actual native identity`);assert.equal(found[0].native_sha256,p.native_sha256,`${p.key}: viewer/download native divergence`);}
 return true;
}

// Existing release job entry point; callers must await it and retain its report.
export async function auditRearEnclosures(root,outputPath=null,{assetRoots=[],downloadProof,requireNativeDownloads=false}={}) {
 root=path.resolve(root);const roots=[root,...assetRoots.map(r=>path.resolve(r))],read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8')),inputs={};
 for(const name of ['REAR_ENCLOSURE_QA.json','TRIDENT_DECK_REPAIR_103.json','ASSET_BUNDLE.json','CUSTOM_VORON_ASSETS.json','SIBOOR_TRIDENT_ASSETS.json','PUBLIC_CATALOG.json']){
  const b=await fs.readFile(path.join(root,name)),source=await fs.readFile(new URL(name,sourceSite));inputs[name]={actual_sha256:sha256(b),source_sha256:sha256(source)};
  // Catalog serialization may differ after a normal Git checkout/build. Check
  // all semantic fields; immutable native witness byte pins are checked below.
  assert.deepEqual(JSON.parse(b),JSON.parse(source),`${name}: audit root/current source divergence`);
 }
 const proof=await read('REAR_ENCLOSURE_QA.json'),bundle=await read('ASSET_BUNDLE.json'),deck=await read('TRIDENT_DECK_REPAIR_103.json'),skirts=await read('STOCK_SKIRT_RETENTION_QA_92.json');
 assert.equal(proof.model_bundle_sha256,nativeWitnessBundle(pathToFileURL(root+path.sep),bundle,'REAR_ENCLOSURE_QA.json'));
 const custom=await read('CUSTOM_VORON_ASSETS.json'),siboor=await read('SIBOOR_TRIDENT_ASSETS.json'),downloads=await read('PUBLIC_CATALOG.json');
 const nativeDownloads=downloadProof?JSON.parse(await fs.readFile(downloadProof,'utf8')):{machines:[]};if(downloadProof)inputs.download_proof_sha256=sha256(await fs.readFile(downloadProof));
 const findBytes=async(relative,directories=[])=>{
  for(const base of roots)for(const dir of ['',...directories])try{return {bytes:await fs.readFile(path.join(base,dir,relative)),file:path.join(base,dir,relative)}}catch(e){if(e.code!=='ENOENT')throw e;}
  throw Error(`Missing actual enclosure asset ${relative}`);
 };
 const load=async machine=>{
  const c=custom.machines.find(m=>m.id===machine.id),s=siboor.machines[machine.id],spec=c??s;
  const directory=c?c.local_directory??custom.local_directory:s?siboor.local_directory:'',folders=c?[directory,'large-voron-models-assets','community-machines-assets']:s?[directory,'community-machines-assets']:[],files={};
  for(const name of ['assembly_manifest.json','model.glb']){
   let actual;if(spec){actual=await findBytes(spec.files[name].path,folders);const pin=spec.files[name];assert.equal(actual.bytes.length,pin.bytes);assert.equal(sha256(actual.bytes),pin.sha256,`${machine.id}: ${name} current catalog hash`);}
   else{const relative=machine.id==='siboor_trident_350'?name==='model.glb'?'SIBOOR_Trident_350.glb':name:`machines/${machine.id}/${name}`;
    try{actual=await findBytes(relative);}catch(e){if(name!=='model.glb')throw e;actual=await findBytes(relative+'.gz');}}
   const raw=name==='model.glb'&&actual.bytes[0]===0x1f&&actual.bytes[1]===0x8b?gunzipSync(actual.bytes):actual.bytes;
   files[name]={...actual,decoded:raw,sha256:sha256(actual.bytes),decoded_sha256:sha256(raw)};
   if(spec?.files[name].decoded_sha256)assert.equal(sha256(raw),spec.files[name].decoded_sha256);
  }
  const manifest=JSON.parse(files['assembly_manifest.json'].decoded),rows=requiredParts(machine,manifest),frame=manifest.parts.filter(p=>p.appearance_role==='frame'&&p.motion==='fixed');
  const meshes=decodePanelAsset(files['model.glb'].decoded,new Set([...rows,...frame].map(p=>p.key)));for(const row of [...rows,...frame])checkBounds(meshes.get(row.key),row);
  const legacy=[...proof.trident.machines,...proof.v24.machines].find(p=>p.machine_id===machine.id),changed=deck.machines.find(p=>p.machine_id===machine.id);
  if(skirts.changed_keys[machine.id]){
   assert.equal(skirts.all_GLb_topology_materials_and_binary_unchanged,true);
   assert(rows.every(p=>!skirts.changed_keys[machine.id].includes(p.key)),'Skirt delta changed audited panel leaves');
   for(const name of ['model.glb','assembly_manifest.json'])assert.equal(files[name].sha256,skirts.input_sha256[`machines/${machine.id}/${name==='model.glb'?'model.glb.gz':name}`],`${machine.id}: exact skirt delta current asset`);
  }else if(legacy)assert.equal(files['model.glb'].decoded_sha256,changed?.after_files['model.glb'].decoded_sha256??legacy.model_sha256,`${machine.id}: current model proof identity`);
  for(const p of legacy?.native_parts??[]){const row=rows.find(r=>r.key===p.key);assert(row);if(row.native_sha256)assert.equal(row.native_sha256,p.brep_sha256??p.native_brep_sha256,`${p.key}: native rear identity`);}
  if(changed)assert.equal(rows.find(p=>p.key===changed.part_key)?.native_sha256,changed.after_native_sha256,`${machine.id}: current deck identity`);
  return {machine,manifest,rows,meshes,frame,files};
 };
 const machines=applicableMachines(),loaded=new Map(),results=[],findings=[],open=[];
 for(const id of ['voron_trident_250','voron_v24_250_printed','voron_v24_300_printed','voron_v24_350_printed'])loaded.set(id,await load(machines.find(m=>m.id===id)));
 for(const machine of machines){const result={machine_id:machine.id,passed:false,parts:[]};results.push(result);
  try{
   const state=loaded.get(machine.id)??await load(machine),{rows,meshes,frame,files}=state;
   result.model_sha256=files['model.glb'].decoded_sha256;result.model_stored_sha256=files['model.glb'].sha256;result.manifest_sha256=files['assembly_manifest.json'].sha256;
   const vendorSource=machine.vendor==='siboor'&&machine.family==='trident'||machine.vendor==='fysetc',base=loaded.get(machine.family==='trident'?'voron_trident_250':`voron_v24_${Math.min(machine.size,350)}_printed`),h=(machine.size-base.machine.size)/2;
   for(const row of rows){const mesh=meshes.get(row.key),leaf=sourceLeaf(row),part={key:row.key,source_leaf:leaf,bounds_mm:mesh.bounds,native_sha256:row.native_sha256??null,max_bounds_error_mm:checkBounds(mesh,row)};result.parts.push(part);
    if(vendorSource)continue;const src=base.rows.find(r=>sourceLeaf(r)===leaf),reference=base.meshes.get(src.key);
    const cover=machine.family==='trident'?['723','738','741'].includes(leaf):['01376','01379','01382','01385'].includes(leaf);
    if(cover){const center=reference.bounds[0].map((v,i)=>(v+reference.bounds[1][i])/2),delta=[Math.abs(center[0])>100?Math.sign(center[0])*h:0,Math.sign(center[1])*h,0];part.source_vertex_error_mm=compareRigidVertices(reference,mesh,delta);continue;}
    const rear=machine.family==='trident'?['1189','1219'].includes(leaf):['01206','01207'].includes(leaf),axis=rear?1:2;
    if(rear){const thickness=mesh.bounds[1][1]-mesh.bounds[0][1],expectedThickness=leaf==='01206'?1:3;assert(Math.abs(thickness-expectedThickness)<.002,`${row.key}: native sheet thickness changed`);part.thickness_mm=thickness;
     if(['1219','01207'].includes(leaf)){const edge=mesh.vertices.filter(p=>Math.abs(p[0])<100&&p[2]>mesh.bounds[1][2]-40);assert(edge.length);const width=Math.max(...edge.map(p=>p[0]))-Math.min(...edge.map(p=>p[0]));assert(Math.abs(width-151)<.2,`${row.key}: native exhaust notch stretched`);part.exhaust_notch_width_mm=width;}}
    const expected=sheetBoundary(reference,axis).map(edge=>edge.map(p=>{const q=[...p];
     if(rear){const limit=machine.size>350?170:120;q[0]+=Math.abs(q[0])>limit?Math.sign(q[0])*h:0;q[1]+=h;if(q[2]>350)q[2]+=mesh.bounds[1][2]-reference.bounds[1][2];}
     else{const fixedCentral=machine.family==='trident'&&leaf==='1188'&&Math.abs(q[0])<27||machine.family==='v24'&&leaf==='01208'&&Math.abs(q[0])<100||machine.family==='v24'&&leaf==='01227'&&Math.abs(q[0])<120;
      q[0]+=fixedCentral?0:Math.sign(q[0])*h;q[1]+=machine.family==='v24'&&leaf==='01227'&&Math.abs(q[1])<120?0:Math.sign(q[1])*h;}return q;}));
    part.complete_source_boundary_error_mm=compareBoundaries(expected,sheetBoundary(mesh,axis));if(!rear){part.source_frame_perimeter_gaps_mm=measureFloorGaps(reference,base.frame.map(p=>base.meshes.get(p.key)));part.frame_perimeter_gaps_mm=checkFloorGap(mesh,frame.map(p=>meshes.get(p.key)),part.source_frame_perimeter_gaps_mm);}
   }
   if(vendorSource)open.push({machine_id:machine.id,code:'EXACT_OEM_CONTOUR_PROOF_REQUIRED',missing_proof:'Exact OEM revision rear/floor/deck/Z-cover contours and frame-interface metadata. Actual source leaves and exported bounds checked; Voron cutouts are not substituted.'});
   const entry=downloads.defaults.find(r=>r.machine_id===machine.id&&r.step_zip);if(entry){result.default_download_zip_sha256=entry.step_zip.sha256;const witness=nativeDownloads.machines.find(r=>r.machine_id===machine.id);
    if(witness)checkDownloadBinding(entry,rows,witness);else open.push({machine_id:machine.id,code:'DEFAULT_DOWNLOAD_NATIVE_BINDING_REQUIRED',missing_proof:'Current packaged ZIP/STEP hashes and native readback source identities for every audited rear/floor/deck/Z-cover leaf, tied to current exported native_sha256. Catalog selection or coincident Boolean is insufficient.'});}
   result.passed=true;
  }catch(e){result.failure=e.message;findings.push({machine_id:machine.id,code:'ACTUAL_ENCLOSURE_FAILURE',message:e.message});}
 }
 requireCompleteCoverage(machines,results);const meshPassed=results.every(r=>r.passed),downloadsComplete=!open.some(f=>f.code==='DEFAULT_DOWNLOAD_NATIVE_BINDING_REQUIRED');
 const report={schema:'rear-floor-deck-source-mesh-audit-105',all_passed:meshPassed&&(!requireNativeDownloads||downloadsComplete),actual_mesh_checks_passed:meshPassed,publication_ready:meshPassed&&open.length===0,inputs,
  auditor_sha256:sha256(await fs.readFile(fileURLToPath(import.meta.url))),registration_sha256:sha256(await fs.readFile(new URL('../site/viewer/machines.js',import.meta.url))),machines:results,findings,open_findings:open,
  native_solid_checks_executed:false,visual_review_executed:false,occupied_set_identity_certified:false,whole_machine_certified:false,
  scope:'Current exported identities, placed vertices, full planar face cutout boundaries, rigid Z-cover vertices and measured source-relative floor gaps. Boundary sampling is not native occupied-set equality or continuous clearance. Download native bindings and OEM contour requirements are separate explicit gates.'};
 if(outputPath)await fs.writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
 assert(report.all_passed,`Rear/floor/deck actual audit failed: ${findings.map(f=>f.machine_id+': '+f.message).join('; ')}${requireNativeDownloads&&!downloadsComplete?'; missing current default-download native bindings':''}`);return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),root=args.shift();assert(root,'Usage: audit_rear_enclosures.mjs <assembled-site> [report.json] [--asset-root path] [--download-proof json] [--require-native-downloads]');
 const output=args[0]&&!args[0].startsWith('--')?args.shift():null,options={assetRoots:[]};
 while(args.length){const flag=args.shift();if(flag==='--asset-root')options.assetRoots.push(args.shift());else if(flag==='--download-proof')options.downloadProof=args.shift();else if(flag==='--require-native-downloads')options.requireNativeDownloads=true;else throw Error('Unknown argument '+flag);}
 console.log(JSON.stringify(await auditRearEnclosures(root,output,options)));
}

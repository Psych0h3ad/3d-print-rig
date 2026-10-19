// Actual source export and installed controller; no browser/GPU/native claim.
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import{Matrix4,Vector3}from '../site/viewer/vendor-r180/three.module.js';
import {assertMayRolePacket,mayRole} from './virtu-may-role-contract.mjs';
import{selectedGeometry,assertSelectedGeometryRig,assertSelectedVisibility}from'./virtu-selected-geometry-contract.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.slice(2),all[i+1]]],[]));
assert(args.site&&args.report,'--site and --report required');
const site=path.resolve(args.site),repo=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const contract=JSON.parse(fs.readFileSync(path.join(site,'APPROVED_DELIVERY.json')));
const expected=new Map(contract.files.map(r=>[r.path,r]));
const requests=[],sourcePins={};
for(const dir of ['site/viewer/source-assembly-runtime','site/viewer/vendor-r180'])
 for(const name of fs.readdirSync(path.join(repo,dir)))if(/\.(?:js|mjs)$/.test(name)){
  const rel=dir+'/'+name;sourcePins[rel]=sha(fs.readFileSync(path.join(repo,rel)));
 }
for(const rel of ['site/viewer/source-assembly-loader.mjs','site/viewer/source-operating-bounds6.mjs','scripts/virtu-may-role-contract.mjs','scripts/audit_virtu_may_role.mjs','scripts/virtu-selected-geometry-contract.mjs','scripts/virtu-selected-geometry-contract.json'])sourcePins[rel]=sha(fs.readFileSync(path.join(repo,rel)));
globalThis.location={href:pathToFileURL(path.join(site,'viewer/community.html')).href};
globalThis.self=globalThis;
globalThis.ProgressEvent??=class{constructor(type,values){Object.assign(this,{type},values)}};
globalThis.fetch=async input=>{
 const url=new URL(String(input instanceof Request?input.url:input),location.href);
 assert.equal(url.protocol,'file:','Unregistered remote resource');url.search='';
 const requested=fileURLToPath(url),sourceSite=path.join(repo,'site');
 const rel=path.relative(requested.startsWith(sourceSite+path.sep)?sourceSite:site,requested).replaceAll('\\','/');
 assert(!rel.startsWith('../')&&!path.isAbsolute(rel),'Outside exact site');
 const file=path.join(site,rel);
 const bytes=fs.readFileSync(file),pin=expected.get(rel);
 if(pin){assert.equal(bytes.length,pin.bytes,rel);assert.equal(sha(bytes),pin.sha256,rel);}
 else assert.equal(rel,'SOURCE_ASSEMBLIES.json');
 requests.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});
 return new Response(Readable.toWeb(fs.createReadStream(file)),{headers:{'content-length':String(bytes.length)}});
};
const report={schema:'actual-VIRTU-May-source-role-v1',passed:false,requests,source_code_sha256:sourcePins,
 native_solid_fit_claim:false,browser_GPU_claim:false,scope:'Exact full exported source assembly/controller and selected May shaft eligibility, reversible palettes, source-relative attachment, reset and state roundtrip. Existing source mates remain separately scoped.'};
let rig;
try{
 const L=await import('../site/viewer/source-assembly-loader.mjs');
 const S=await import('../site/viewer/source-assembly-runtime/state.mjs');
 const {sourceOperatingBounds}=await import('../site/viewer/source-operating-bounds6.mjs');
 const signal=new AbortController().signal,index=await L.loadSourceIndex(signal);
 const entry=index.models.find(r=>r.id==='rh3d_virtu_may_230');assert(entry);
 const packet=await L.loadSourcePacket(entry,signal);assertMayRolePacket(packet);
 rig=await L.loadSourceAssembly(packet,{signal});
 assert.equal(rig.parts.size,selectedGeometry.owners);
 const selectedSourceGeometry=assertSelectedGeometryRig(rig,packet);
 const canonical=rig.parts.get(mayRole.canonical),foreign=rig.parts.get(mayRole.excluded);
 assert(canonical&&foreign,'Original source inventory retained');
 const effective=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
 const receiver=rig.parts.get('vion_source__v-ion_th-tensioner_m-1');assert(receiver);
 const native=rig.snapshot();rig.root.updateMatrixWorld(true);
 const nozzle=rig.parts.get(packet.nozzle_origin.part_key),bed=rig.parts.get('bed-stock235');assert(nozzle&&bed);
 const nozzleLocal=new Vector3(...packet.nozzle_origin.point_world_mm).multiplyScalar(.001).applyMatrix4(new Matrix4().fromArray(nozzle.record.matrix).invert());
 const bedPlaneLocal=new Vector3(0,packet.private_source_motion172.reference_print_surface_world_mm*.001,0).applyMatrix4(new Matrix4().fromArray(bed.record.matrix).invert());
 function extreme(entries,maximum){let found=null;for(const [key,{node,record}]of entries)node.traverse(mesh=>{
  if(!mesh.isMesh||!effective(mesh))return;const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let i=0;i<(index?.count??position.count);i++){const vertex=index?index.getX(i):i,local=new Vector3().fromBufferAttribute(position,vertex),world=local.clone().applyMatrix4(mesh.matrixWorld);
   if(!found||(maximum?world.y>found.world.y:world.y<found.world.y))found={key,source_id:record.source_id,mesh,local,world,vertex};}
 });assert(found);return found;}
 const probeKeys=[...rig.parts].filter(([key])=>key.startsWith('vion_source__cartographer-standard-original-solid-'));
 const probeLow=extreme(probeKeys,false),bedTop=extreme([['bed-stock235',bed]],true),clearance=[];
 const sourcePoint=(point,node)=>point.clone().applyMatrix4(node.matrixWorld).multiplyScalar(1000).toArray();
 function measure(){const s=rig.snapshot();if(s.variant!==native.variant)return;
  const nozzlePoint=sourcePoint(nozzleLocal,nozzle.node),bedPlane=sourcePoint(bedPlaneLocal,bed.node),probePoint=sourcePoint(probeLow.local,probeLow.mesh);
  const measured=nozzlePoint[1]-bedPlane[1],guard=S.reviewSeparation(packet,s.review_axes);
  assert(Math.abs(measured-guard)<1e-9,'Actual source nozzle/bed relative plane changed');
  clearance.push({variant:s.variant,review_axes:s.review_axes,nozzle_world_mm:nozzlePoint,source_print_plane_world_Y_mm:bedPlane[1],nozzle_to_source_print_plane_mm:measured,controller_plane_guard_mm:guard,lowest_drawn_Cartographer_vertex_to_plane_mm:probePoint[1]-bedPlane[1],Cartographer_vertex_world_mm:probePoint});
 }
 const relative=()=>receiver.node.matrixWorld.clone().invert().multiply(canonical.node.matrixWorld).elements;
 const originalRelative=[...relative()],hardware=new Map(),sourceArrays=new Map();
 let meshCount=0;
 rig.root.traverse(n=>{if(!n.isMesh)return;meshCount++;
  for(const a of [...Object.values(n.geometry.attributes),n.geometry.index].filter(Boolean)){
   const array=a.isInterleavedBufferAttribute?a.data.array:a.array;
   if(!sourceArrays.has(array))sourceArrays.set(array,sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength)));
  }
 });
 for(const m of rig.materials)if(m.role==='native')hardware.set(m.material,[m.material.color?.getHex(),m.material.metalness,m.material.roughness,m.material.opacity]);
 let poses=0,palettes=0,attachments=0;
 function check(){rig.root.updateMatrixWorld(true);assert(!effective(foreign.node),'Foreign hinge effective-visible');
  const expectedKeys=S.visibleKeys(packet,rig.snapshot());assertSelectedVisibility(rig,packet,expectedKeys);assert.equal(effective(canonical.node),expectedKeys.has(mayRole.canonical));
  rig.root.traverse(n=>assert(n.matrixWorld.elements.every(Number.isFinite),'Nonfinite source matrix'));
  if(expectedKeys.has(mayRole.canonical)){
   const now=relative();for(let i=0;i<16;i++)assert(Math.abs(now[i]-originalRelative[i])<1e-12,'Source relative shaft/receiver changed');attachments++;
  }
  for(const [m,values]of hardware)assert.deepEqual([m.color?.getHex(),m.metalness,m.roughness,m.opacity],values,'Hardware material changed');
  measure();
  poses++;
 }
 for(const variant of packet.variants){const s=structuredClone(native);s.variant=variant.id;rig.apply(s);check();}
 rig.reset();check();
 for(const palette of [{M:'#47c9ff',A:'#ffc234'},{M:'#ffc234',A:'#47c9ff'},{M:'#47c9ff',A:'#ffc234'}]){
  const s=rig.snapshot();s.palette=palette;rig.apply(s);check();palettes++;
 }
 rig.reset();
 for(const [axis,lo,hi]of [['x',-109,116],['y',-112,147],['z',-122,106]])
  for(const value of [lo,(lo+hi)/2,hi,lo,0]){const s=structuredClone(native);s.review_axes[axis]=value;rig.apply(s);check();}
// Y travel is conditional on X: at native X, Y=152 meets a retained source
// body. Preserve rejection and state, then reach the maximum with X first.
rig.reset();const rejectedBefore=rig.snapshot(),rejectedState=structuredClone(rejectedBefore);rejectedState.review_axes.y=152;
assert.equal(sourceOperatingBounds(packet,{x:0,y:0,z:0},'y').max,147,'Native X conditional Y maximum');
assert.equal(sourceOperatingBounds(packet,{x:116,y:0,z:0},'y').max,152,'Outer X conditional Y maximum');
assert.throws(()=>rig.apply(rejectedState),/Retained source body contact: vion_source__cartographer-standard-original-solid-97 \/ virtu_public_dbid_1818/);
assert.deepEqual(rig.snapshot(),rejectedBefore,'Rejected source contact changed assembly state');check();
const compositePaths=[{pose:{x:-109,y:-112,z:-122},order:['y','x','z']},{pose:{x:116,y:152,z:106},order:['x','y','z']},{pose:{x:20,y:-30,z:40},order:['y','x','z']},{pose:{x:-109,y:-112,z:-122},order:['y','x','z']}];
for(const {pose,order}of compositePaths){rig.reset();check();for(const axis of order){const s=rig.snapshot();s.review_axes[axis]=pose[axis];rig.apply(s);check();}}
 const saved=JSON.parse(JSON.stringify(rig.snapshot()));rig.reset();rig.apply(saved);check();rig.reset();check();
 assert.deepEqual(rig.snapshot(),native,'Exact reset state');
 assertSelectedGeometryRig(rig,packet);
 for(const [array,pin]of sourceArrays)assert.equal(sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength)),pin,'Source array/index changed');
 for(const [rel,pin]of Object.entries(sourcePins))assert.equal(sha(fs.readFileSync(path.join(repo,rel))),pin,'Source changed during audit');
 assert(requests.some(r=>r.path.endsWith('.bin.gz')),'Actual compressed geometry not requested');
 assert(!requests.some(r=>/\.(?:bin|glb)$/.test(r.path)),'Unexpected raw geometry fallback');
 report.passed=true;Object.assign(report,{registered_source_parts:rig.parts.size,selected_source_geometry_contract:selectedSourceGeometry,actual_meshes:meshCount,
  controller_pose_cases:poses,contrasting_palette_cases:palettes,source_relative_attachment_checks:attachments,
  all_variants:packet.variants.length,foreign_hinge_effective_visible:false,original_DDG_preserved:true,
  composite_source_paths:compositePaths,rejected_source_contact_state_unchanged:true,
  original_geometry_and_index_arrays_unchanged:sourceArrays.size,reset_and_save_ID_roundtrip:true,
  model_sha256:packet.model.sha256,inventory_sha256:packet.inventory.sha256,
  default_May_source_clearance:{nozzle_source:packet.nozzle_origin,bed_part_key:bed.record.key,bed_source_id:bed.record.source_id,
   source_print_plane_evidence:packet.private_source_motion172.guard_evidence,actual_native_bed_highest_vertex_world_mm:bedTop.world.clone().multiplyScalar(1000).toArray(),
   source_plane_minus_actual_bed_top_mm:packet.private_source_motion172.reference_print_surface_world_mm-bedTop.world.y*1000,
   Cartographer_lowest_drawn_vertex:{part_key:probeLow.key,source_id:probeLow.source_id,mesh_name:probeLow.mesh.name,vertex:probeLow.vertex},
   rows:clearance,source_probe_state303_available:!!packet.source_probe_state303,
   scope:'Actual indexed source mesh/body support and source-backed virtual nozzle exit to the moving source print plane. Cartographer body minimum is not its sensing/trigger datum. No finite whole-body collision, operational clearance or manufacturing certificate.'},
  independent_source_mate_proof_sha256:mayRole.finiteMateProof});
}catch(error){report.error=error.message;report.stack=error.stack;}
fs.mkdirSync(path.dirname(args.report),{recursive:true});fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,poses:report.controller_pose_cases,error:report.error}));
process.exitCode=report.passed?0:1;

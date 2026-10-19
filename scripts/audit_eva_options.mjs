// Actual installed EVA lifecycle. Native solids, continuous clearance and
// printer firmware behavior require separate source/physical review.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {register} from 'node:module';
import {spawnSync} from 'node:child_process';

const repo=fileURLToPath(new URL('../',import.meta.url));
const threeUrl=new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(specifier,context,next){if(specifier==='three')return {url:${JSON.stringify(threeUrl)},shortCircuit:true};return next(specifier,context)}`),import.meta.url);
const THREE=await import('../site/viewer/vendor-r180/three.module.js');
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
const {loadCommunity}=await import('../site/viewer/community-loader.mjs');
const {evaCommunityIndex}=await import('../site/viewer/eva-installations.mjs');
const {validateEvaMetadata,bindEvaMeshIdentities}=await import('../site/viewer/eva-heads.mjs');
const {loadExternalComponent}=await import('../site/viewer/component-assets.mjs');
const {loadEvaFrontSurfaces,applyEvaFrontSurfaces}=await import('../site/viewer/eva-front-surfaces.mjs');
const {validateEvaOptionsRegistry,validateEvaFlexEndpoints,applyEvaOptionsProfile,createEvaOptionsController}=await import('../site/viewer/eva-options.mjs');
const {displayMotion,nativeMotion,validateCommunityState,communitySchema}=await import('../site/viewer/community-state.mjs');

const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=/^[a-f0-9]{64}$/;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const structuredSha=v=>sha(JSON.stringify(canonical(v)));
const normalizeUrl=value=>{const u=new URL(value);u.search='';u.hash='';return u.href};
const modelHash=spec=>spec.files['model.glb'].decoded_sha256||spec.files['model.glb'].sha256;
const hardwareRoles=new Set(['base','accent','frame','cnc']);
const href='https://psych0h3ad.github.io/3d-print-rig/viewer/community.html';

export function evaOptionsCodeClosure(){
 const roots=['scripts/audit_eva_options.mjs','scripts/test_eva_options.mjs','scripts/check_machine_coverage.mjs','site/viewer/eva-options.mjs','site/viewer/community.js',
  'site/viewer/community-loader.mjs','site/viewer/community-adapter.mjs','site/viewer/eva-heads.mjs',
  'site/viewer/eva-front-surfaces.mjs','site/viewer/palette-controller.mjs','site/viewer/component-assets.mjs',
  'site/viewer/vendor/GLTFLoader.js','site/viewer/vendor-r180/GLTFLoader.js',
  'site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js'];
 const source=`import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
 const repo=process.argv[1],todo=JSON.parse(fs.readFileSync(0,'utf8')),pins={};
 while(todo.length){const relative=todo.pop(),file=path.resolve(repo,relative),key=path.relative(repo,file).replaceAll('\\\\','/');
  if(key.startsWith('../')||path.isAbsolute(key))throw Error('Production dependency escaped checkout');if(pins[key])continue;
  const raw=fs.readFileSync(file);pins[key]=crypto.createHash('sha256').update(raw).digest('hex');
  for(const spec of new vm.SourceTextModule(raw.toString('utf8')).dependencySpecifiers){
   if(spec.startsWith('node:'))continue;if(spec==='three'){todo.push('site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js');continue;}
   if(!spec.startsWith('.'))throw Error('Unpinned production dependency '+spec);
   todo.push(path.relative(repo,path.resolve(path.dirname(file),spec.split(/[?#]/)[0])));
  }
 }console.log(JSON.stringify(pins));`;
 const run=spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--input-type=module','-e',source,repo],
  {input:JSON.stringify(roots),encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(run.status,0,'Production code closure incomplete: '+(run.stderr||run.error?.message||''));
 return JSON.parse(run.stdout);
}

async function checkedLocal(record){
 assert(record&&hash.test(record.sha256)&&typeof record.path==='string','Missing explicit pinned local input');
 const raw=await fs.readFile(record.path);assert.equal(sha(raw),record.sha256,'Local input checksum changed');
 if(record.bytes!==undefined)assert.equal(raw.length,record.bytes,'Local input size changed');return raw;
}
export async function checkedEvaOptionArtifact(record,descriptor=null){
 const spec=descriptor||record?.descriptor;
 assert(spec&&hash.test(spec.sha256)&&Number.isSafeInteger(spec.bytes)&&spec.bytes>0&&spec.bytes<=180_000_000,'Missing actual artifact descriptor');
 assert(['gzip','identity',undefined].includes(spec.encoding),'Unsupported artifact encoding');
 assert.equal(record.descriptor?.sha256,spec.sha256,'Artifact descriptor differs from pinned catalog');
 assert.deepEqual(record.descriptor,spec,'Artifact fields differ from pinned catalog');
 assert(typeof record.url==='string'&&new URL(record.url).protocol==='https:'&&new URL(record.url).hostname==='psych0h3ad.github.io','Unexpected public artifact origin');
 const raw=await fs.readFile(record.path);assert.equal(raw.length,spec.bytes,'Public artifact bytes changed');assert.equal(sha(raw),spec.sha256,'Public artifact SHA changed');
 const decoded=spec.encoding==='gzip'?gunzipSync(raw):raw;
 assert.equal(decoded.length,spec.decoded_bytes??spec.bytes,'Decoded artifact bytes changed');assert.equal(sha(decoded),spec.decoded_sha256??spec.sha256,'Decoded artifact SHA changed');
 return {raw,decoded};
}
const checkedArtifact=checkedEvaOptionArtifact;
export function evaOptionIdentityBridgeDescriptor(part){
 const bridge=part?.source_brep_identity_bridge;
 assert(bridge&&hash.test(part.brep_sha256)&&hash.test(part.source_brep_sha256)
  &&part.brep_sha256!==part.source_brep_sha256,'Invalid EVA BRep identity bridge');
 assert.equal(bridge.baseline_brep_sha256,part.brep_sha256,'Bridge rendering BRep differs from actual metadata');
 assert.equal(bridge.host_brep_sha256,part.source_brep_sha256,'Bridge host BRep differs from actual metadata');
 assert(hash.test(bridge.native_definition_brep_sha256),'Missing bridge source definition pin');
 assert(['identity',undefined].includes(bridge.encoding),'Unsupported identity bridge encoding');
 const url=new URL(bridge.url);
 assert(url.protocol==='https:'&&url.hostname==='psych0h3ad.github.io'&&!url.username&&!url.password&&!url.hash&&!url.search,'Unexpected identity bridge origin');
 const filename=url.pathname.split('/').at(-1);
 assert(filename&&hash.test(bridge.sha256)&&Number.isSafeInteger(bridge.bytes)&&bridge.bytes>0&&bridge.bytes<=180_000_000,'Unpinned identity bridge receipt');
 return {path:filename,bytes:bridge.bytes,sha256:bridge.sha256};
}
export function evaOptionIdentityBridgeParts(metadata){
 assert(Array.isArray(metadata?.parts)&&metadata.parts.length,'Missing bridge source metadata');
 assert(metadata.parts.every(p=>typeof p.key==='string'&&p.key)&&new Set(metadata.parts.map(p=>p.key)).size===metadata.parts.length,'Duplicate/unknown bridge source key');
 return metadata.parts.filter(part=>{
  const mismatch=part.brep_sha256&&part.source_brep_sha256&&part.brep_sha256!==part.source_brep_sha256;
  assert(!mismatch||part.source_brep_identity_bridge,'Unproved EVA BRep serialization namespace mismatch');
  if(part.source_brep_identity_bridge!==undefined){evaOptionIdentityBridgeDescriptor(part);return true}
  return false;
 });
}
export function checkEvaOptionIdentityBridge(proof,part,{metadata,variant,host,manifest,profile,approvedMountSha256}){
 const descriptor=evaOptionIdentityBridgeDescriptor(part),declared=part.source_brep_identity_bridge;
 assert(proof?.schema==='3d-print-rig-native-brep-serialization-identity-v1','Wrong native identity bridge schema');
 assert(variant.eva.companions.carriage.includes(part.key),'Identity bridge is not a registered carriage companion');
 assert.equal(variant.machine_id,host.machine_id,'Identity bridge source host changed');
 assert.deepEqual(part.source_path,host.native_mount.carriage_source_identity.source_path,'Bridge carriage occurrence changed');
 assert.deepEqual(proof.source_path,part.source_path,'Bridge source path changed');
 assert.equal(proof.host_brep_sha256,host.native_mount.carriage_source_identity.source_brep_sha256,'Bridge native host identity changed');
 assert.equal(variant.installation.same_carriage_source_identity.source_brep_sha256,proof.host_brep_sha256,'Bridge installation identity changed');
 assert.deepEqual(variant.installation.same_carriage_source_identity.source_path,proof.source_path);
 assert.equal(proof.baseline_brep_sha256,declared.baseline_brep_sha256,'Stale bridge rendering identity');
 assert.equal(proof.host_brep_sha256,declared.host_brep_sha256,'Stale bridge host identity');
 const source=part.source_sha256||part.source_assembly_sha256||metadata.source_sha256,revision=part.source_revision||metadata.source_revision;
 assert(hash.test(source)&&typeof revision==='string'&&revision,'Missing actual carriage source identity');
 assert.equal(proof.source_sha256,source,'Bridge public source SHA changed');
 assert.equal(proof.source_sha256,profile.source.source_step_sha256,'Bridge native host source changed');
 assert.equal(proof.source_revision,revision,'Bridge source revision changed');assert.equal(revision,profile.source.revision,'Bridge source-host revision changed');
 const sourceUrl=new URL(proof.source_url);assert(sourceUrl.protocol==='https:'&&!sourceUrl.username&&!sourceUrl.password,'Invalid bridge public CAD source');
 assert.equal(proof.source_url,part.source_url||metadata.source_url,'Bridge actual public CAD URL changed');
 const composed=metadata.eva_composition?.part_sources?.[part.key];
 if(metadata.eva_composition){assert(composed,'Missing composed carriage source');assert.equal(composed.source_sha256,source);assert.equal(composed.source_revision,revision);assert.deepEqual(composed.source_path,part.source_path)}
 const native=manifest.parts.filter(p=>host.stock_head_keys.includes(p.key)&&same(p.source_path,proof.source_path));
 assert.equal(native.length,1,'Missing/duplicate actual native host carriage');const nativePart=native[0];
 assert.equal(nativePart.brep_sha256,proof.host_brep_sha256,'Actual rendered host carriage BRep changed');
 assert.equal(nativePart.source_brep_sha256||nativePart.brep_sha256,proof.host_brep_sha256,'Actual host carriage BRep changed');
 assert.deepEqual(proof.baseline_label_namespace?.source_label_path,part.source_label_path,'Bridge rendering source label changed');
 assert.equal(proof.baseline_label_namespace?.definition_label,part.definition_label,'Bridge rendering definition changed');
 assert.deepEqual(proof.source_label_path,nativePart.source_label_path,'Bridge host source label changed');
 assert.equal(proof.definition_label,nativePart.definition_label,'Bridge host definition changed');
 assert.deepEqual(proof.native_transform,part.native_transform,'Bridge authored rendering transform changed');
 assert.deepEqual(proof.native_transform,nativePart.native_transform,'Bridge authored host transform changed');
 assert(Array.isArray(proof.native_transform)&&proof.native_transform.length===3&&proof.native_transform.every(r=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)),'Invalid authored bridge transform');
 assert(hash.test(approvedMountSha256)&&proof.approved_mount_receipt_sha256===approvedMountSha256,'Bridge approved native mounting receipt changed');
 for(const key of ['regenerated_breps_byte_exact','source_definition_tshape_identical'])assert.equal(proof[key],true,'Unproved native byte identity '+key);
 for(const key of ['source_geometry_changed','render_geometry_changed','full_physical_fit_certified'])assert.equal(proof[key],false,'Unsupported bridge geometry/fit claim '+key);
 assert(typeof proof.baseline_brep_namespace==='string'&&proof.baseline_brep_namespace&&typeof proof.host_brep_namespace==='string'&&proof.host_brep_namespace&&proof.baseline_brep_namespace!==proof.host_brep_namespace,'Missing native serialization namespaces');
 const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8;
 assert(Number.isSafeInteger(proof.faces)&&proof.faces>0&&proof.faces===part.faces&&proof.faces===nativePart.faces,'Bridge actual native face count changed');
 assert(proof.solids===5&&proof.solids===part.solids&&proof.solids===nativePart.solids,'Bridge source solids changed');
 assert(proof.volume_mm3>0&&near(proof.volume_mm3,part.volume_mm3)&&near(proof.volume_mm3,nativePart.volume_mm3)&&proof.volume_error_mm3===0,'Bridge actual source volume changed');
 assert.deepEqual(proof.baseline_bounds_mm,proof.host_bounds_mm,'Bridge authored bounds differ');assert.deepEqual(proof.baseline_bounds_mm,part.bounds_mm);assert.deepEqual(proof.host_bounds_mm,nativePart.bounds_mm);
 assert(Array.isArray(proof.native_face_witnesses)&&proof.native_face_witnesses.length===proof.faces,'Missing complete native face witnesses');
 const faces=new Set();for(const face of proof.native_face_witnesses){
  assert(Number.isSafeInteger(face.face_ordinal)&&face.face_ordinal>=0&&face.face_ordinal<proof.faces&&!faces.has(face.face_ordinal),'Invalid/repeated native face witness');faces.add(face.face_ordinal);
  assert(face.center_error_mm===0&&face.area_error_mm2===0&&Number.isFinite(face.source_area_mm2)&&face.source_area_mm2>0,'Native carriage face identity failed');
 }
 const inverse=proof.inverse_placement_solid_comparison;
 assert(inverse?.native_definition_breps_byte_identical===true&&inverse.all_five_source_solids_retained===true,'Unproved inverse-placement native identity');
 assert.equal(inverse.native_definition_brep_sha256,declared.native_definition_brep_sha256,'Stale native definition BRep pin');
 assert(typeof inverse.method==='string'&&inverse.method.startsWith('BRepAlgoAPI_Cut/Common'),'Missing native solid identity method');
 assert(inverse.baseline_minus_host_total_volume_mm3===0&&inverse.host_minus_baseline_total_volume_mm3===0,'Native solid difference remains');
 assert(Array.isArray(inverse.witnesses)&&inverse.witnesses.length===proof.solids,'Missing complete native solid witnesses');
 const solids=new Set();let volume=0;
 for(const solid of inverse.witnesses){
  assert(Number.isSafeInteger(solid.solid_ordinal)&&solid.solid_ordinal>=0&&solid.solid_ordinal<proof.solids&&!solids.has(solid.solid_ordinal),'Invalid/repeated native solid witness');solids.add(solid.solid_ordinal);
  assert(solid.baseline_volume_mm3>0&&near(solid.baseline_volume_mm3,solid.host_volume_mm3)&&near(solid.common?.volume_mm3,solid.baseline_volume_mm3)&&solid.common.solids===1&&Number.isSafeInteger(solid.common.faces)&&solid.common.faces>0,'Native common solid differs');
  for(const key of ['baseline_minus_host','host_minus_baseline'])assert(solid[key]?.volume_mm3===0&&solid[key].solids===0&&solid[key].faces===0,'Native solid subtraction differs');volume+=solid.baseline_volume_mm3;
 }
 // These integrals belong to different recorded frames: per-solid inverse
 // definitions versus the authored occurrence compound. Identity is proved
 // by exact definition bytes and each same-frame solid pair, not their sum.
 const triple=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),unit=p=>triple(p)&&Math.abs(Math.hypot(...p)-1)<1e-8;
 const sameVector=(a,b,tolerance)=>triple(a)&&triple(b)&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
 const plane=proof.carriage_mating_plane;
 assert(plane?.separation_mm===0&&faces.has(plane.face_ordinal)&&plane.baseline?.face===plane.face_ordinal&&plane.host?.face===plane.face_ordinal,'Native carriage mating proof changed');
 assert(triple(plane.baseline.point)&&unit(plane.baseline.normal)&&near(plane.baseline.area,plane.host.area)&&plane.baseline.area>0,'Invalid native carriage mating plane');
 assert(sameVector(plane.baseline.point,plane.host.point,1e-9)&&sameVector(plane.baseline.normal,plane.host.normal,1e-12),'Native mating plane pair differs');
 assert(Array.isArray(proof.native_fastener_bores)&&proof.native_fastener_bores.length===host.native_mount.fastener_keys.length&&proof.native_fastener_bores.length===host.native_mount.axes.length,'Missing native carriage bore witnesses');
 const bores=new Set(),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 for(const bore of proof.native_fastener_bores){
  const i=host.native_mount.fastener_keys.indexOf(bore.fastener_key),axis=host.native_mount.axes[i];
  assert(i>=0&&!bores.has(bore.fastener_key)&&faces.has(bore.face_ordinal)&&bore.axis_error_mm===0,'Invalid/repeated native fastener bore');bores.add(bore.fastener_key);
  assert(bore.baseline?.face===bore.face_ordinal&&bore.host?.face===bore.face_ordinal&&Number.isFinite(bore.radius_mm)&&bore.radius_mm>0&&bore.baseline.radius===bore.radius_mm&&bore.host.radius===bore.radius_mm,'Native bore radius/face changed');
  assert(triple(bore.baseline.point)&&unit(bore.baseline.direction)&&unit(axis.direction)&&triple(axis.point_mm),'Invalid native bore axis');
  assert(sameVector(bore.baseline.point,bore.host.point,1e-9)&&sameVector(bore.baseline.direction,bore.host.direction,1e-12),'Native bore pair differs');
  assert(Math.hypot(...cross(bore.baseline.direction,axis.direction))<=1e-8&&Math.hypot(...cross(bore.baseline.point.map((v,i)=>v-axis.point_mm[i]),axis.direction))<=1e-5,'Bore differs from approved host fastener axis');
 }
 return {part_key:part.key,url:declared.url,sha256:descriptor.sha256,source_sha256:source,source_revision:revision,source_path:part.source_path,
  baseline_brep_sha256:proof.baseline_brep_sha256,host_brep_sha256:proof.host_brep_sha256,native_definition_brep_sha256:inverse.native_definition_brep_sha256,
  approved_mount_receipt_sha256:approvedMountSha256,native_face_witnesses:faces.size,native_solid_witnesses:solids.size,
  native_occurrence_volume_mm3:proof.volume_mm3,inverse_definition_total_volume_mm3:volume,
  native_bore_witnesses:bores.size,source_geometry_changed:false,render_geometry_changed:false,full_physical_fit_certified:false};
}
function publicFile(record){return {url:record.url,...record.descriptor};}
function meshRows(root){const rows=[];root.traverse(n=>{if(n.isMesh)rows.push(n)});return rows;}
function geometryDigest(geometry){
 const result=createHash('sha256');
 for(const [name,attribute]of Object.entries(geometry.attributes).sort()){
  result.update(name);const a=attribute.array||attribute.data?.array;assert(a,'Missing mesh attribute array');
  result.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
 }
 if(geometry.index){const a=geometry.index.array;result.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}
 result.update(JSON.stringify([geometry.drawRange,geometry.groups]));return result.digest('hex');
}
function snapshot(current,{nonhead=true}={}){
 current.root.updateMatrixWorld(true);const result=[];
 for(const[key,node]of current.adapter.nodes){
  if(nonhead&&current.adapter.records.get(key).group==='head')continue;
  result.push({key,node,parent:node.parent,visible:node.visible,matrix:[...node.matrix.elements],world:[...node.matrixWorld.elements],
   meshes:meshRows(node).map(m=>({mesh:m,geometry:m.geometry,digest:geometryDigest(m.geometry),material:m.material,
    colors:[].concat(m.material).map(mat=>[mat.color.toArray(),mat.opacity,mat.roughness,mat.metalness,mat.transparent,mat.depthWrite])}))});
 }return result;
}
function unchanged(current,before){
 current.root.updateMatrixWorld(true);
 for(const row of before){
  const node=current.adapter.nodes.get(row.key);assert.equal(node,row.node,'Native node replaced '+row.key);assert.equal(node.parent,row.parent,'Native parent changed '+row.key);
  assert.equal(node.visible,row.visible,'Native visibility changed '+row.key);assert.deepEqual(node.matrix.elements,row.matrix,'Native placement changed '+row.key);assert.deepEqual(node.matrixWorld.elements,row.world,'Native world frame changed '+row.key);
  const meshes=meshRows(node);assert.equal(meshes.length,row.meshes.length,'Native primitive count changed '+row.key);
  for(let i=0;i<meshes.length;i++){const mesh=meshes[i],old=row.meshes[i];assert.equal(mesh,old.mesh);assert.equal(mesh.geometry,old.geometry,'Native geometry replaced '+row.key);
   assert.equal(geometryDigest(mesh.geometry),old.digest,'Native geometry modified '+row.key);assert.equal(mesh.material,old.material,'Native material replaced '+row.key);
   assert.deepEqual([].concat(mesh.material).map(m=>[m.color.toArray(),m.opacity,m.roughness,m.metalness,m.transparent,m.depthWrite]),old.colors,'Native material changed '+row.key);
  }
 }
}
function finiteAssembly(current,controller){
 current.root.updateMatrixWorld(true);
 for(const[key,node]of current.adapter.nodes){
  let parent=node;while(parent&&parent!==current.root)parent=parent.parent;assert.equal(parent,current.root,'Native leaf detached '+key);
  assert(node.matrixWorld.elements.every(Number.isFinite),'Nonfinite native placement '+key);
  const group=current.adapter.records.get(key).group;
  if(group!=='head'&&group!=='reference')assert(node.visible,'Native nonhead leaf disappeared '+key);
  const meshes=meshRows(node);assert(meshes.length,'Native empty leaf '+key);
  for(const mesh of meshes){const p=mesh.geometry.getAttribute('position');assert(p&&p.count&&p.itemSize===3,'Empty native geometry '+key);
   for(let i=0;i<p.count;i++)assert(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)),'Nonfinite native geometry '+key);
  }
 }
 if(controller.current){
  const row=controller.current;assert.equal(row.root.parent,current.root,'Overlay detached');assert.equal(row.nodes.size,row.manifest.parts.length,'Orphan head companion');
  const delta=displayMotion(nativeMotion('head',current.adapter.getAxes(),current.profile),current.profile);
  for(let i=0;i<3;i++)assert(Math.abs(row.root.matrix.elements[12+i]-delta[i])<1e-10,'Overlay has guessed installation offset');
  for(const node of row.nodes.values()){assert(node.visible,'Overlay companion hidden');assert(node.matrixWorld.elements.every(Number.isFinite),'Nonfinite companion placement')}
 }
 const box=controller.bounds();assert(!box.isEmpty()&&box.min.toArray().every(Number.isFinite)&&box.max.toArray().every(Number.isFinite),'Invalid active head bounds');
}
const routeWitnesses=new WeakMap();
export function nativeRoutePoints(current,axes){
 const observations=[];
 let witnesses=routeWitnesses.get(current);if(!witnesses){witnesses=new Map();routeWitnesses.set(current,witnesses)}
 const configuration=current.adapter.getConfiguration?.()||'stock';
 const overrides=current.profile.configurations?.[configuration]?.flex_endpoints_mm||{};
 validateEvaFlexEndpoints(overrides,current.profile,current.manifest.parts);
 for(const[key,spec]of Object.entries(current.profile.motion_registration?.flex||{})){
  if(spec.type!=='endpoint_route')continue;
  const node=current.adapter.nodes.get(key);assert(node?.visible,'Native route missing '+key);
  const points=[['moving',overrides[key]?.moving_mm||spec.moving_mm,spec.moving_group,spec.moving_mm],['fixed',spec.fixed_mm,spec.fixed_group||'fixed',spec.fixed_mm]];
  for(const[end,native,group,original]of points){
   assert(Array.isArray(native)&&native.length===3&&native.every(Number.isFinite),'Invalid native endpoint witness');
   const rest=current.profile.motion_registration?.rest_offsets_mm?.[group]||[0,0,0];
   const shift=nativeMotion(group,axes,current.profile),point=native.map((v,i)=>v-current.profile.origin_mm[i]+shift[i]+rest[i]);
   const expected=new THREE.Vector3(...displayMotion(point,current.profile));let distance=Infinity;
   const witnessKey=key+'/'+end;
   if(!witnesses.has(witnessKey)){
    const sourceExpected=new THREE.Vector3(...displayMotion(original.map((v,i)=>v-current.profile.origin_mm[i]+rest[i]),current.profile)),candidates=[];
    for(const entry of current.adapter.flex.filter(e=>e.key===key)){
     const v=new THREE.Vector3();for(let i=0;i<entry.weights.length;i++){
      if((entry.weights[i][group]||0)<.999)continue;
      v.fromArray(entry.source,3*i).applyMatrix4(entry.mesh.matrixWorld);
      candidates.push({mesh:entry.mesh,index:i,distance:v.distanceTo(sourceExpected)});
     }
    }
    assert(candidates.length,'Missing native weighted endpoint vertices '+witnessKey);
    const nearest=candidates.reduce((n,p)=>Math.min(n,p.distance),Infinity);
    witnesses.set(witnessKey,candidates.filter(p=>p.distance<=nearest+.00002));
   }
   const selected=witnesses.get(witnessKey);
   for(const {mesh,index}of selected){const p=mesh.geometry.attributes.position,v=new THREE.Vector3().fromBufferAttribute(p,index).applyMatrix4(mesh.matrixWorld);distance=Math.min(distance,v.distanceTo(expected))}
   assert(Number.isFinite(distance),'No native route endpoint geometry');observations.push({key,end,configuration,
    source_endpoint_mm:[...original],target_mm:[...native],moving_override:end==='moving'&&Object.hasOwn(overrides,key),
    witness_vertices:selected.length,witness_method:'original native endpoint surface vertices',distance_mm:distance*1000});
  }
 }return observations;
}
function attachedNativeRoutes(current,axes,baseline){
 const endpoints=nativeRoutePoints(current,axes);
 for(const endpoint of endpoints){const zero=baseline.find(r=>r.key===endpoint.key&&r.end===endpoint.end);
  assert(zero&&endpoint.distance_mm<=zero.distance_mm+.05,'Native route endpoint detached '+endpoint.key+'/'+endpoint.end);
 }
 return endpoints;
}
function selectNativeConfiguration(current,id,baseline){
 const before=snapshot(current),oldId=current.adapter.getConfiguration(),oldAxes=current.adapter.getAxes();
 const profilePin=structuredSha(current.profile.motion_registration||null);
 const changed=new Set([...Object.keys(current.profile.configurations[oldId]?.flex_endpoints_mm||{}),...Object.keys(current.profile.configurations[id]?.flex_endpoints_mm||{})]);
 current.adapter.setConfiguration(id);
 assert.equal(structuredSha(current.profile.motion_registration||null),profilePin,'Native source route registration changed');
 // A configuration clamp may legitimately move other native groups. Preserve
 // every resource identity; when axes stay equal only measured routes may move.
 for(const row of before){const node=current.adapter.nodes.get(row.key);assert.equal(node,row.node);assert.equal(node.parent,row.parent);assert.equal(node.visible,row.visible);
  const meshes=meshRows(node);assert.equal(meshes.length,row.meshes.length);
  for(let i=0;i<meshes.length;i++){assert.equal(meshes[i],row.meshes[i].mesh);assert.equal(meshes[i].geometry,row.meshes[i].geometry);assert.equal(meshes[i].material,row.meshes[i].material)}
 }
 if(same(oldAxes,current.adapter.getAxes()))unchanged(current,before.filter(r=>!changed.has(r.key)));
 return attachedNativeRoutes(current,current.adapter.getAxes(),baseline);
}
function effectiveRanges(profile,id){return {...profile.axes,...profile.configurations[id].axes};}
function poses(profile,id){
 const ranges=effectiveRanges(profile,id),keys=Object.keys(ranges),zero=Object.fromEntries(keys.map(k=>[k,Math.max(ranges[k][0],Math.min(0,ranges[k][1]))]));
 const rows=[{name:'native-or-clamped-zero',axes:zero}];
 for(const axis of keys){const[lo,hi]=ranges[axis];for(const[name,n]of [['minimum',lo],['maximum',hi],['intermediate',(lo+hi)/2],['reversed-quarter',lo+(hi-lo)*.25],['reversed-maximum',hi],['reset',zero[axis]]])rows.push({name:axis+'-'+name,axes:{...zero,[axis]:n}})}
 rows.push(...[0,1,.5,0].map((u,i)=>({name:'combined-'+i,axes:Object.fromEntries(keys.map(k=>[k,ranges[k][0]+u*(ranges[k][1]-ranges[k][0])]))})));
 return rows;
}
function purchasedSnapshot(root,records){
 return [...records].filter(([,p])=>!hardwareRoles.has(p.appearance_role)).map(([key,p])=>({key,
  materials:meshRows(root.nodes?root.nodes.get(key):root.adapter.nodes.get(key)).flatMap(m=>[].concat(m.material).map(mat=>({mat,color:mat.color.toArray(),roughness:mat.roughness,metalness:mat.metalness,opacity:mat.opacity}))) }));
}
function unchangedHardware(rows){for(const row of rows)for(const m of row.materials){assert.deepEqual(m.mat.color.toArray(),m.color,'Purchased recolored '+row.key);assert.equal(m.mat.roughness,m.roughness);assert.equal(m.mat.metalness,m.metalness);assert.equal(m.mat.opacity,m.opacity)}}
function assertPrinted(root,records,palette){
 for(const[key,p]of records)if(['base','accent','frame'].includes(p.appearance_role)&&palette[p.appearance_role])
  for(const mesh of meshRows(root.nodes?root.nodes.get(key):root.adapter.nodes.get(key)))for(const mat of [].concat(mesh.material))assert.equal(mat.color.getHexString(),palette[p.appearance_role].slice(1),'Printed color not applied '+key);
}
function disposeRoot(root){const geometries=new Set(),materials=new Set();for(const m of meshRows(root)){geometries.add(m.geometry);for(const mat of [].concat(m.material))materials.add(mat)}for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.removeFromParent()}
export function checkEvaOptionNativeReview(review,v,host,manifest,profile,sourceRecipe,headMetadata){
 assert(review&&typeof review==='object','Invalid native review JSON');
 const source=review.machine_id??review.host_machine_id;
 assert.equal(source,v.machine_id,'Native review source host changed');
 if(review.eva_generation!==undefined)assert.equal(review.eva_generation,v.eva.generation,'Native review generation changed');
 if(review.source_revision!==undefined)assert.equal(review.source_revision,v.id===host.default_configuration?
  sourceRecipe?.native_bounds?.source_revision||sourceRecipe?.source_revision||profile.source.revision:v.eva.source_revision,'Native review source revision changed');
 if(review.source_step_sha256!==undefined)assert.equal(review.source_step_sha256,profile.source.source_step_sha256,'Native review host source STEP changed');
 if(review.configuration!==undefined)assert.equal(review.configuration,v.id,'Native review recipe changed');
 const proof=review.mount_review;assert(proof?.mount_verified===true,'Missing source mating proof');
 assert.equal(proof.full_physical_fit_certified,false,'Unsupported full physical-fit claim');
 assert(Number.isFinite(proof.axis_error_mm)&&proof.axis_error_mm>=0&&proof.axis_error_mm<=.05,'Invalid native axis proof');
 assert(Math.abs(proof.axis_error_mm-v.installation.mount_axis_error_mm)<1e-9,'Native axis review differs from registry');
 assert.deepEqual(proof.rail_keys,host.native_mount.rail_keys,'Native rail proof changed');
 const keys=new Set(manifest.parts.map(p=>p.key));assert(proof.fastener_keys?.length&&proof.fastener_keys.every(k=>keys.has(k)||v.eva.companions.fasteners.includes(k)),'Missing native fastener proof');
 if(v.id===host.default_configuration){
  assert.deepEqual(proof.fastener_keys,host.native_mount.fastener_keys,'Native stock fasteners changed');
  assert.equal(review.native_fastener_hole_axes?.length,host.native_mount.axes.length,'Native fastener datum count changed');
  for(let i=0;i<host.native_mount.axes.length;i++){assert.deepEqual(review.native_fastener_hole_axes[i].source_shaft.origin_mm,host.native_mount.axes[i].point_mm);assert.deepEqual(review.native_fastener_hole_axes[i].source_shaft.axis,host.native_mount.axes[i].direction)}
  const carriage=manifest.parts.find(p=>p.key===review.carriage_key);assert(carriage&&same(carriage.source_path,host.native_mount.carriage_source_identity.source_path),'Native carriage occurrence proof changed');
  const witness=review.source_leaf_witnesses?.find(p=>p.key===review.carriage_key);
  assert(witness?.valid===true&&same(witness.source_identity?.path,host.native_mount.carriage_source_identity.source_path),'Native carriage witness changed');
  assert.equal(witness.brep_sha256,host.native_mount.carriage_source_identity.source_brep_sha256,'Native carriage BRep proof changed');
  assert(Number.isFinite(review.native_mating_planes?.gap_mm)&&Math.abs(review.native_mating_planes.gap_mm)<.05,'Native mating plane gap changed');
 }
 const overrides=v.installation.flex_endpoints_mm||{},endpointProof=review.flex_endpoints_mm||{};
 validateEvaFlexEndpoints(overrides,profile,manifest.parts);
 assert.deepEqual(Object.keys(endpointProof).sort(),Object.keys(overrides).sort(),'Native socket review keys differ from installation');
 const sockets=[];
 for(const[key,target]of Object.entries(overrides)){
  const route=profile.motion_registration.flex[key],row=endpointProof[key],socket=row?.socket,measurement=row?.measurement;
  assert.deepEqual(row?.moving_mm,target.moving_mm,'Measured socket target differs from installation');
  assert.deepEqual(row?.source_moving_mm,route.moving_mm,'Original moving cap changed');
  assert.deepEqual(row?.fixed_mm,route.fixed_mm,'Native fixed cap changed');
  assert.equal(measurement?.frame,'native_host_mm','Socket measurement is not in native host frame');
  assert.equal(measurement?.method,'native_cad_socket_axis','Missing native socket feature measurement');
  assert.deepEqual(measurement?.center_mm,target.moving_mm,'Native socket center differs from installation');
  const part=headMetadata?.parts?.find(p=>p.key===socket?.part_key);
  assert(part&&Object.values(v.eva.companions).some(keys=>keys.includes(part.key)),'Measured socket is not an actual complete-head companion');
  assert.deepEqual(socket.source_path,part.source_path,'Socket occurrence path changed');
  assert.equal(socket.source_brep_sha256,part.source_brep_sha256||part.brep_sha256,'Socket BRep identity changed');
  assert(/^[a-f0-9]{64}$/.test(socket.source_brep_sha256),'Missing exact socket BRep pin');
  assert.equal(socket.source_sha256,part.source_sha256||headMetadata.source_sha256,'Socket public source pin changed');
  assert(/^[a-f0-9]{64}$/.test(socket.source_sha256),'Missing socket source checksum');
  assert.equal(socket.source_revision,part.source_revision||headMetadata.source_revision,'Socket source revision changed');
  assert(typeof socket.source_revision==='string'&&socket.source_revision.length,'Missing socket source revision');
  sockets.push({key,moving_mm:target.moving_mm,source_moving_mm:route.moving_mm,fixed_mm:route.fixed_mm,socket,measurement});
 }
 return {sha256:v.installation.native_review_sha256,native_scope:proof.native_scope||v.installation.native_scope,
  flex_endpoint_socket_reviews:sockets,
  mount_axis_error_mm:proof.axis_error_mm,full_physical_fit_certified:false};
}
const checkNativeReview=checkEvaOptionNativeReview;

export function evaAuditHostSelection(registry,hostIds){
 const all=Object.keys(registry.hosts);assert(all.length,'Missing registered hosts');
 const selected=hostIds??all;assert(Array.isArray(selected)&&selected.length&&new Set(selected).size===selected.length,'Empty/duplicate host shard');
 assert(selected.every(id=>all.includes(id)),'Unregistered host shard');return selected;
}
export async function auditEvaOptions(inputs,{onProgress=()=>{},hostIds}={}){
 assert.equal(inputs.schema,'3d-print-rig-eva-options-audit-inputs-v1');
 const closure=evaOptionsCodeClosure();
 for(const name of ['scripts/check_eva_options_release.py','scripts/build_site.py'])closure[name]=sha(await fs.readFile(path.join(repo,name)));
 const local={},inputPins={};for(const key of ['registry','heads','community','installations','front']){const bytes=await checkedLocal(inputs[key]);local[key]=JSON.parse(bytes);inputPins[key]=inputs[key].sha256}
 const {registry,heads,community,installations,front}=local;validateEvaOptionsRegistry(registry,heads);
 const selectedHosts=evaAuditHostSelection(registry,hostIds),expectedVariants=registry.variants.filter(v=>selectedHosts.includes(v.machine_id)).map(v=>v.id);
 const index=evaCommunityIndex(community,installations),routes=new Map(),artifacts=[];
 function addRoute(record,raw){const url=normalizeUrl(record.url);const old=routes.get(url);if(old)assert.equal(old.sha256,record.descriptor.sha256,'Conflicting cached artifact URL');routes.set(url,{bytes:raw,sha256:record.descriptor.sha256});artifacts.push(record)}
 for(const[id,host]of Object.entries(registry.hosts)){
  const spec=index.machines[id];assert(spec,'Unregistered actual source host');const supplied=inputs.hosts[id];assert(supplied,'Missing actual source host input');
  assert.deepEqual(Object.keys(supplied).sort(),Object.keys(spec.files).sort(),'Incomplete host resource pins');
  for(const[name,descriptor]of Object.entries(spec.files)){const record=supplied[name];assert.equal(record.url,new URL(descriptor.path,spec.base_url||index.base_url).href,'Host URL differs from pinned catalog');const {raw}=await checkedArtifact(record,descriptor);addRoute(record,raw)}
  assert.equal(modelHash(spec),host.model_sha256);assert.equal(spec.files['assembly_manifest.json'].sha256,host.manifest_sha256);assert.equal(spec.files['machine_profile.json'].sha256,host.profile_sha256);
 }
 assert.deepEqual(Object.keys(inputs.hosts).sort(),Object.keys(registry.hosts).sort(),'Unknown/missing host audit entry');
 const assetMetadata={};
 for(const[id,spec]of Object.entries(registry.assets)){
  assert(inputs.assets[id],'Missing complete source head');assert.deepEqual(Object.keys(inputs.assets[id]).sort(),Object.keys(spec.files).sort(),'Missing complete source head evidence');
  for(const[name,descriptor]of Object.entries(spec.files)){const record=inputs.assets[id][name];assert.equal(record.url,new URL(descriptor.path,spec.external.base_url).href,'Source head URL changed');const {raw,decoded}=await checkedArtifact(record,descriptor);addRoute(record,raw);if(name==='parts.json')assetMetadata[id]=JSON.parse(decoded)}
 }
 assert.deepEqual(Object.keys(inputs.assets).sort(),Object.keys(registry.assets).sort(),'Unknown/missing source head');
 assert(inputs.identity_bridges&&typeof inputs.identity_bridges==='object','Missing actual native identity bridge input coverage');
 assert.deepEqual(Object.keys(inputs.identity_bridges).sort(),Object.keys(registry.assets).sort(),'Unknown/missing identity bridge asset');
 const identityBridges={};
 for(const[id,metadata]of Object.entries(assetMetadata)){
  assert.equal(metadata.id,registry.assets[id].component_id,'Bridge source metadata owner changed');
  const parts=evaOptionIdentityBridgeParts(metadata),supplied=inputs.identity_bridges[id];
  assert(supplied&&typeof supplied==='object','Missing actual identity bridge asset entry');
  assert.deepEqual(Object.keys(supplied).sort(),parts.map(p=>p.key).sort(),'Unknown/missing declared carriage identity bridge');
  identityBridges[id]={};
  for(const part of parts){
   const descriptor=evaOptionIdentityBridgeDescriptor(part),record=supplied[part.key];
   assert(record&&record.url===part.source_brep_identity_bridge.url,'Identity bridge artifact URL changed');
   const {raw,decoded}=await checkedArtifact(record,descriptor);addRoute(record,raw);identityBridges[id][part.key]=JSON.parse(decoded);
  }
 }
 const reviews={};for(const v of registry.variants){const descriptor=v.installation.native_review;assert(descriptor&&descriptor.sha256===v.installation.native_review_sha256,'Native review artifact missing');
  const record=inputs.native_reviews[v.id];assert(record&&record.url===descriptor.url,'Native review URL changed');assert.equal(record.descriptor.bytes,descriptor.bytes);assert.equal(record.descriptor.sha256,descriptor.sha256);
  const {raw,decoded}=await checkedArtifact(record);addRoute(record,raw);reviews[v.id]=JSON.parse(decoded);
 }
 assert.deepEqual(Object.keys(inputs.native_reviews).sort(),registry.variants.map(v=>v.id).sort(),'Incomplete native review coverage');
 for(const[name,descriptor]of Object.entries(front.asset.files)){const record=inputs.patch[name];assert(record,'Missing production front patch resource');assert.equal(record.url,new URL(descriptor.path,front.asset.external.base_url).href);const {raw}=await checkedArtifact(record,descriptor);addRoute(record,raw)}
 for(const url of [new URL('../site/EVA_FRONT_SURFACES.json',import.meta.url).href,new URL('./EVA_FRONT_SURFACES.json',href.replace('/viewer/community.html','/viewer/')).href,new URL('../EVA_FRONT_SURFACES.json',href).href])routes.set(normalizeUrl(url),{bytes:await fs.readFile(inputs.front.path),sha256:inputs.front.sha256});
 const nativeFetch=globalThis.fetch;let corruptUrl=null,fetches=0;
 globalThis.fetch=async (value,options={})=>{if(options.signal?.aborted)throw options.signal.reason;const key=normalizeUrl(value.url??value),row=routes.get(key);assert(row,'Unpinned network dependency '+key);fetches++;
  let bytes=row.bytes;if(key===corruptUrl){bytes=Buffer.from(bytes);bytes[0]^=255}return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}})};
 const output={schema:'3d-print-rig-eva-options-actual-review-v1',passed:false,input_sha256:inputPins,production_code_sha256:closure,
  source_artifacts:artifacts.map(publicFile),hosts:[],coverage:{registered_hosts:Object.keys(registry.hosts),registered_variants:registry.variants.map(v=>v.id),selected_hosts:selectedHosts,expected_shard_variants:expectedVariants,reviewed_variants:[]},
  scope:'Checksum-pinned real source-host and complete-head glTF assets using the production r180 loader, native adapter, surface patch and installed-option controller. Finite sampled movement, registered endpoint witnesses where present, unchanged native resources, companion inventory, palettes, selection/reset and save/load. Separate source-head/front/native-solid reviews remain required.',
  native_solids_audited:false,continuous_clearance_certified:false,full_physical_fit_certified:false};
 try{
  assert.equal(THREE.REVISION,'180','Wrong production Three runtime');
  for(const[machine,host]of Object.entries(registry.hosts)){
   if(!selectedHosts.includes(machine))continue;
   onProgress('Reviewing '+machine+' native host and '+host.configurations.length+' configurations');
   const current=await loadCommunity(index,machine),baselineProfile=structuredSha(current.profile),loaderReceipt=structuredSha(current.replay_asset_identity),nativeParts=current.manifest.parts;
   applyEvaOptionsProfile(current,registry,heads);assert.equal(current.manifest.parts,nativeParts);assert.equal(structuredSha(current.replay_asset_identity),loaderReceipt,'Loader receipt modified by profile options');
   const loader=new GLTFLoader(),controller=createEvaOptionsController(current,{registry,heads,loader,href});
   const initial=snapshot(current,{nonhead:false}),initialAxes=current.adapter.getAxes(),zeroRoutes=nativeRoutePoints(current,initialAxes),nativeDisposed=new Set();
   for(const m of meshRows(current.root)){m.geometry.addEventListener('dispose',()=>nativeDisposed.add(m.geometry));for(const mat of [].concat(m.material))mat.addEventListener('dispose',()=>nativeDisposed.add(mat))}
   const result={machine_id:machine,model_sha256:host.model_sha256,manifest_sha256:host.manifest_sha256,profile_sha256:host.profile_sha256,
    effective_initial_profile_sha256:baselineProfile,loader_receipt_sha256:loaderReceipt,native_parts:current.manifest.parts.length,stock_head_parts:host.stock_head_keys.length,
    origin_mm:host.origin_mm,configurations:[],route_endpoint_native_baseline:zeroRoutes,nonhead_unchanged:true,native_resources_disposed:false,full_physical_fit_certified:false};
   let priorOverlay=null;
   for(const id of host.configurations){
    const v=registry.variants.find(v=>v.id===id),source=await loadExternalComponent(loader,registry.assets[v.base_asset],href);
    validateEvaMetadata(v,source.meta);bindEvaMeshIdentities(source.meta,source.gltf.scene);
    const patch=await loadEvaFrontSurfaces(loader,href);applyEvaFrontSurfaces(source.gltf.scene,source.meta,modelHash(registry.assets[v.base_asset]),{...patch,sourceOriginMm:host.origin_mm});
    const keys=new Set();source.gltf.scene.traverse(n=>{if(n.userData.part_key)keys.add(n.userData.part_key)});assert.equal(keys.size,source.meta.parts.length,'Incomplete parsed complete head');assert.equal(keys.size,registry.assets[v.base_asset].parts);
    const sourceRecipeInput=inputs.assets[v.base_asset]['SOURCE_RECIPE.json'];
    const sourceRecipe=sourceRecipeInput?JSON.parse((await checkedArtifact(sourceRecipeInput)).decoded):null;
    const approvedMountSha256=registry.variants.find(row=>row.id===host.default_configuration).installation.native_review_sha256;
    const nativeIdentityBridges=evaOptionIdentityBridgeParts(source.meta).map(part=>checkEvaOptionIdentityBridge(identityBridges[v.base_asset][part.key],part,
     {metadata:source.meta,variant:v,host,manifest:current.manifest,profile:current.profile,approvedMountSha256}));
    const proof=checkNativeReview(reviews[id],v,host,current.manifest,current.profile,sourceRecipe,source.meta);disposeRoot(source.gltf.scene);
    const before=snapshot(current);await controller.install(id);unchanged(current,before);
    if(priorOverlay)assert.equal(priorOverlay.parent,null,'Previous successful head retained in scene');
    const selectionEndpoints=selectNativeConfiguration(current,id,zeroRoutes);controller.update(current.adapter.getAxes());
    const row={id,source_head_model_sha256:modelHash(registry.assets[v.base_asset]),source_metadata_sha256:registry.assets[v.base_asset].files['parts.json'].sha256,
     source_generation:v.eva.generation,source_version:v.eva.version,source_revision:v.eva.source_revision,complete_head_parts:registry.assets[v.base_asset].parts,
     native_mount_review:proof,native_identity_bridges:nativeIdentityBridges,flex_endpoints_mm:structuredClone(v.installation.flex_endpoints_mm||{}),selection_endpoints:selectionEndpoints,uses_native_stock:id===host.default_configuration,poses:[],palette_reversed:true,save_load:true};
    for(const pose of poses(current.profile,id)){
     current.adapter.setAxes(pose.axes);const preserved=snapshot(current);controller.update(current.adapter.getAxes());unchanged(current,preserved);finiteAssembly(current,controller);
     const endpoints=attachedNativeRoutes(current,pose.axes,zeroRoutes);
     row.poses.push({...pose,route_endpoints:endpoints});
    }
    const nativeHardware=purchasedSnapshot(current,current.adapter.records),overlayHardware=controller.current?purchasedSnapshot(controller.current,controller.current.records):[];
    const palettes=[{base:'#18de45',accent:'#b119ed',frame:'#a9c1ef'},{base:'#ee9830',accent:'#10bdde',frame:'#283542'},{base:'#18de45',accent:'#b119ed',frame:'#a9c1ef'}];
    for(const palette of palettes){current.adapter.setPalette(palette);controller.setPalette(palette);unchangedHardware(nativeHardware);unchangedHardware(overlayHardware);assertPrinted(current,current.adapter.records,palette);if(controller.current)assertPrinted(controller.current,controller.current.records,palette)}
    const state={schema:communitySchema,machine,configuration:id,axes:current.adapter.getAxes(),palette:palettes[2],night:false,grid:false,references:false,camera:{position:[1,1,1],target:[0,0,0],up:[0,1,0]}},saved=JSON.parse(JSON.stringify(state));validateCommunityState(saved,current.profile);
    await controller.reset();selectNativeConfiguration(current,host.default_configuration,zeroRoutes);controller.update(current.adapter.getAxes());
    await controller.install(saved.configuration);selectNativeConfiguration(current,saved.configuration,zeroRoutes);current.adapter.setAxes(saved.axes);controller.update(saved.axes);current.adapter.setPalette(saved.palette);controller.setPalette(saved.palette);
    row.save_load_endpoints=attachedNativeRoutes(current,saved.axes,zeroRoutes);
    assert.equal(controller.active,id);assert.deepEqual(current.adapter.getAxes(),saved.axes);finiteAssembly(current,controller);
    priorOverlay=controller.current?.root||null;result.configurations.push(row);output.coverage.reviewed_variants.push(id);
   }
   const alternatives=host.configurations.filter(id=>id!==host.default_configuration);
   result.transitions=[];
   for(const a of alternatives){const b=alternatives.find(id=>id!==a)||host.default_configuration;
    for(const id of [a,b,a,host.default_configuration]){const before=snapshot(current);const old=controller.current?.root;let oldDisposed=0;for(const m of old?meshRows(old):[])m.geometry.addEventListener('dispose',()=>oldDisposed++);
     await controller.install(id);unchanged(current,before);const endpoints=selectNativeConfiguration(current,id,zeroRoutes);controller.update(current.adapter.getAxes());finiteAssembly(current,controller);
     if(old&&old!==controller.current?.root){assert.equal(old.parent,null);assert(oldDisposed>0,'Old successful geometry not disposed')}
     result.transitions.push({id,route_endpoints:endpoints,old_overlay_released:!old||old===controller.current?.root||old.parent===null});
    }
   }
   // Corrupt the real selected asset bytes. Even defaults get a checksum-loader
   // negative; a default-only registry has no overlay lifecycle to claim.
   const badId=alternatives[1]||alternatives[0]||host.default_configuration,badVariant=registry.variants.find(v=>v.id===badId),badSpec=registry.assets[badVariant.base_asset];
   await controller.reset();selectNativeConfiguration(current,host.default_configuration,zeroRoutes);controller.update(current.adapter.getAxes());
   if(alternatives.length>1){await controller.install(alternatives[0]);selectNativeConfiguration(current,alternatives[0],zeroRoutes);controller.update(current.adapter.getAxes())}
   const rollback=snapshot(current,{nonhead:false}),oldActive=controller.active,oldOverlay=controller.current?.root||null;
   corruptUrl=normalizeUrl(new URL(badSpec.files['model.glb'].path,badSpec.external.base_url).href);
   try{await assert.rejects(alternatives.length?()=>controller.install(badId):()=>loadExternalComponent(loader,badSpec,href),/checksum/i)}finally{corruptUrl=null}
   assert.equal(controller.active,oldActive);assert.equal(controller.current?.root||null,oldOverlay);unchanged(current,rollback);result.bad_file_rollback=true;
   result.bad_file_rollback_previous_configuration=oldActive;
   if(alternatives.length){
    const a=alternatives[0],b=alternatives[1]||host.default_configuration;
    const requests=[controller.install(a),controller.install(b),controller.install(a)];const switches=await Promise.all(requests);assert.equal(controller.active,a);assert(switches.slice(0,2).every(s=>s.stale||s.stock),'Stale rapid change committed');
    const pending=controller.install(alternatives[1]||a);await controller.reset();await pending;assert.equal(controller.active,host.default_configuration);assert.equal(controller.current,null);result.rapid_switch_rollback=true;
   }else result.rapid_switch_rollback='not_applicable_default_only';
   await controller.reset();
   selectNativeConfiguration(current,host.default_configuration,zeroRoutes);current.adapter.setAxes(initialAxes);controller.update(current.adapter.getAxes());
   result.native_reset_axes=initialAxes;result.native_reset_endpoints=attachedNativeRoutes(current,initialAxes,zeroRoutes);
   // Palette restores are tested through the production palette entry point.
   // The original source hardware must retain its pre-palette colors throughout.
   current.adapter.setPalette(current.profile.palette_defaults);controller.setPalette(current.profile.palette_defaults);
   const nativeGeometryInitial=initial.map(row=>({key:row.key,digests:row.meshes.map(m=>m.digest),matrix:row.matrix,visible:row.visible}));
   const restored=snapshot(current,{nonhead:false});for(const row of nativeGeometryInitial){const actual=restored.find(r=>r.key===row.key);assert.deepEqual(actual.matrix,row.matrix,'Native reset placement changed '+row.key);assert.deepEqual(actual.meshes.map(m=>m.digest),row.digests,'Native reset geometry changed '+row.key);assert.equal(actual.visible,row.visible,'Native reset visibility changed '+row.key)}
   assert.equal(nativeDisposed.size,0,'Controller disposed native stock resources');controller.dispose();assert.equal(nativeDisposed.size,0);result.default_restored=true;result.overlay_lifecycle_applicable=alternatives.length>0;
   output.hosts.push(result);disposeRoot(current.root);
  }
 }finally{globalThis.fetch=nativeFetch}
 assert.deepEqual(output.coverage.reviewed_variants.slice().sort(),expectedVariants.slice().sort(),'Missing actual installed option shard coverage');
 for(const[key,pin]of Object.entries(closure))assert.equal(sha(await fs.readFile(path.join(repo,key))),pin,'Production code changed during actual audit '+key);
 for(const key of Object.keys(inputPins))await checkedLocal(inputs[key]);for(const record of artifacts)await checkedArtifact(record);
 output.network_requests=fetches;output.passed=true;return output;
}

async function cli(){
 const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);assert(i>=0&&args[i+1],'Missing '+name);return args[i+1]};
 const inputFile=value('--inputs'),reportFile=value('--report'),inputRaw=await fs.readFile(inputFile),inputs=JSON.parse(inputRaw);
 const hostIndex=args.indexOf('--host'),hostIds=hostIndex<0?undefined:[value('--host')];
 let report;try{report=await auditEvaOptions(inputs,{hostIds,onProgress:message=>process.stdout.write(message+'\n')});assert.equal(sha(await fs.readFile(inputFile)),sha(inputRaw),'Actual input manifest changed during audit')}
 catch(error){const message=String(error.message).replaceAll(repo,'[checkout]/').replaceAll(path.resolve(repo),'[checkout]');report={schema:'3d-print-rig-eva-options-actual-review-v1',passed:false,failure:message,full_physical_fit_certified:false};process.exitCode=1}
 await fs.mkdir(path.dirname(path.resolve(reportFile)),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({passed:report.passed,hosts:report.hosts?.length,variants:report.coverage?.reviewed_variants.length,failure:report.failure})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await cli();

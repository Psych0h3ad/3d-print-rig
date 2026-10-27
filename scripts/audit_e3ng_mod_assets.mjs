import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
const {e3ngModAsset,e3ngPanelAsset,e3ngModParts,e3ngModModel}=await import('../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs');
const {attachE3NGMods}=await import('../site/viewer/source-assembly-runtime/e3ng-mods.mjs');
const THREE=await import('three');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function loadAsset(pin,flag,cap){
 let bytes;if(arg(flag))bytes=await fs.readFile(arg(flag));
 else {const r=await fetch(pin.url,{signal:AbortSignal.timeout(30000)});assert(r.ok,'E3NG mod asset unavailable');const blocks=[];let size=0;for await(const block of r.body){size+=block.byteLength;assert(size<=pin.bytes&&size<=cap,'E3NG mod transfer exceeds pin');blocks.push(block);}bytes=Buffer.concat(blocks,size);}
 assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256);assert(bytes.length<=cap,'E3NG overlay exceeds cap');
 const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
 const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=bytes.subarray(20+jsonLength+8);parsed.raw={doc,bin};return parsed;
}
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/e3ng-mod-source.json',import.meta.url),'utf8'));
const panelFixture=JSON.parse(await fs.readFile(new URL('./fixtures/e3ng-panel-source.json',import.meta.url),'utf8'));
assert.equal(panelFixture.model_sha256,e3ngModModel);assert.equal(panelFixture.asset_sha256,e3ngPanelAsset.sha256);
const packet=JSON.parse(await fs.readFile(new URL('../site/source-assembly-assets/packet-rh3d_e3ng_v12_235.json',import.meta.url),'utf8'));
assert.equal(packet.model.sha256,e3ngModModel);const baseline=JSON.stringify(packet);
const model=await loadAsset(e3ngModAsset,'--asset',2*1024*1024),panelModel=await loadAsset(e3ngPanelAsset,'--panel-asset',8*1024*1024);
for(const child of [...panelModel.scene.children])model.scene.add(child);
const records=new Map(packet.parts.map(r=>[r.key,r]));
const rows=[];
for(const spec of e3ngModParts){
 const record=records.get(spec.host);assert(record&&record.source_id===spec.host_source_sha256);assert.deepEqual(record.matrix,spec.host_world);
 const mesh=model.scene.children.find(n=>n.userData.e3ng_mod===spec.id);assert(mesh);const pos=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index;assert.equal(index.count,spec.triangles*3);
 assert.equal(mesh.userData.source_sha256,spec.source_sha256);assert.equal(mesh.userData.source_license,'CC-BY-NC-SA-4.0');
 for(let i=0;i<pos.count;i++){assert([pos.getX(i),pos.getY(i),pos.getZ(i)].every(Number.isFinite));assert(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-5);}
 const panel=spec.scope==='full',expected=(panel?panelFixture:fixture).parts.find(r=>r.id===spec.id);assert(expected);assert.equal(expected.source_sha256,spec.source_sha256);assert.equal(expected.triangles,spec.triangles);
 if(panel){assert.equal(spec.host,expected.original_host);assert.deepEqual(spec.geometry_transform,expected.geometry_transform);}
 const local=new THREE.Matrix4().fromArray(spec.geometry_transform??new THREE.Matrix4().elements);
 assert(mesh.matrix.elements.every((v,i)=>Number.isFinite(v)&&Math.abs(v-local.elements[i])<1e-10));
 const worldPos=pos.clone(),q=new THREE.Vector3();for(let i=0;i<pos.count;i++){q.fromBufferAttribute(pos,i).applyMatrix4(local);worldPos.setXYZ(i,q.x,q.y,q.z);}
 const box=new THREE.Box3().setFromBufferAttribute(worldPos),bounds=[box.min.toArray(),box.max.toArray()],expectedBounds=panel?expected.host_bounds_mm:expected.local_bounds_mm;
 for(let j=0;j<2;j++)for(let k=0;k<3;k++)assert(Math.abs(bounds[j][k]-expectedBounds[j][k])<.0002,'Actual mod geometry/source coordinate binding differs');
 if(panel){
  const canonical=(attribute,zeroSign=false)=>{const b=Buffer.alloc(index.count*12);for(let i=0;i<index.count;i++){const v=index.getX(i);for(let k=0;k<3;k++){const n=attribute.array[v*3+k];b.writeFloatLE(zeroSign&&n===0?0:n,i*12+k*4);}}return hash(b);};
  const {doc,bin}=panelModel.raw,rawNode=doc.nodes.find(n=>n.extras?.e3ng_mod===spec.id),primitive=doc.meshes[rawNode.mesh].primitives[0];
  const rawAttribute=name=>{const accessor=doc.accessors[primitive.attributes[name]],view=doc.bufferViews[accessor.bufferView];assert.equal(accessor.componentType,5126);assert.equal(accessor.count,pos.count);const values=new Float32Array(accessor.count*3),off=(view.byteOffset??0)+(accessor.byteOffset??0),stride=view.byteStride??12;for(let i=0;i<accessor.count;i++)for(let k=0;k<3;k++)values[i*3+k]=bin.readFloatLE(off+i*stride+k*4);return new THREE.BufferAttribute(values,3);};
  const rawPos=rawAttribute('POSITION'),rawNormal=rawAttribute('NORMAL');
  assert(expected.canonical_normal_zero_sign_normalized);assert.equal(canonical(rawPos),expected.canonical_position_sha256);assert.equal(canonical(rawNormal,true),expected.canonical_normal_sha256);assert.equal(canonical(pos),expected.canonical_position_sha256);
  // Compare loaded directions with normalized raw source normals separately
  // from exact on-disk numerical identity; this makes no loader-normalization claim.
  for(let i=0;i<normal.count;i++){const expectedNormal=new THREE.Vector3().fromBufferAttribute(rawNormal,i).normalize(),actual=new THREE.Vector3().fromBufferAttribute(normal,i);assert(actual.distanceTo(expectedNormal)<1e-6);}
  assert.deepEqual(expected.supports_omitted,[]);assert.equal(record.material_role,'M');assert.equal(mesh.userData.source_faces_deleted,0);
 }
 const bores=[];
 for(const bore of panel?expected.source_circular_mates:expected.mounting_bores){
  if(!panel)assert(bore.axis_classified_void&&Number.isInteger(bore.native_face));
  const center=new THREE.Vector3(...(panel?bore.centre_host_local_mm:bore.center_local_mm)),axis=new THREE.Vector3(...(panel?bore.axis:bore.axis_local)),[v0,v1]=panel?bore.finite_axial_interval_host_mm:bore.finite_axial_interval_mm;assert(Math.abs(axis.length()-1)<1e-10);
  let matched=0,lo=Infinity,hi=-Infinity;const q=new THREE.Vector3();for(let i=0;i<worldPos.count;i++){q.fromBufferAttribute(worldPos,i).sub(center);const t=q.dot(axis),radial=q.clone().addScaledVector(axis,-t).length();if(Math.abs(radial-bore.radius_mm)<.002&&t>=v0-.002&&t<=v1+.002){matched++;lo=Math.min(lo,t);hi=Math.max(hi,t);}}
  assert(matched>=12&&hi-lo>=(v1-v0)*.99,'Export lost native mounting bore wall');
  const edgeTolerance=.0002,start=v0+edgeTolerance,end=v1-edgeTolerance;assert(end>start);
  const origin=center.clone().addScaledVector(axis,start),ray=new THREE.Ray(origin,axis),length=end-start,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
  const blocked=(a,b,c)=>!!ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceTo(origin)<=length;
  if(!panel||bore.source_fitted_void){
   for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(worldPos,index.getX(i));b.fromBufferAttribute(worldPos,index.getX(i+1));c.fromBufferAttribute(worldPos,index.getX(i+2));assert(!blocked(a,b,c),'Export capped a mounting void inside its finite wall interval');}
   // Source-backed negative witnesses near both ends catch regressions to a
   // central-only ray interval. These triangles are never added to the model.
   const u=new THREE.Vector3(1,0,0);if(Math.abs(u.dot(axis))>.9)u.set(0,1,0);u.cross(axis).normalize();const v=new THREE.Vector3().crossVectors(axis,u);
   for(const fraction of [.05,.5,.95]){const cap=center.clone().addScaledVector(axis,v0+(v1-v0)*fraction),r=bore.radius_mm;assert(blocked(cap.clone().addScaledVector(u,-r).addScaledVector(v,-r),cap.clone().addScaledVector(u,r).addScaledVector(v,-r),cap.clone().addScaledVector(v,r)),'Void-ray oracle missed an interior cap');}
  }
  bores.push({...(panel?{source_fitted_void:bore.source_fitted_void}:{native_face:bore.native_face}),radius_mm:bore.radius_mm,wall_vertices:matched,axis_interior_clear:!panel||bore.source_fitted_void,checked_interval_mm:!panel||bore.source_fitted_void?[start,end]:null,end_tolerance_mm:edgeTolerance});
 }
 rows.push({id:spec.id,sha256:spec.source_sha256,triangles:spec.triangles,local_bounds_mm:bounds,finite_positions:true,unit_normals:true,material_role:record.material_role,mounting_bores:bores});
}
let transactions=0;const poses=[{x:0,y:0,z:0}];
for(const axis of ['x','y','z']){const a=packet.private_source_motion172.axes[axis],min=a.preview_support_displacement_min_mm,max=a.preview_support_displacement_max_mm;assert([min,max].every(Number.isFinite));for(const v of [min,max,(min+max)/2,min,0])poses.push({x:0,y:0,z:0,[axis]:v});}
for(const mode of ['full','head']){
const specs=e3ngModParts.filter(s=>mode==='full'||s.scope!=='full');
const root=new THREE.Group(),parts=new Map(),rest=new Map(),materials=[],ownedGeometries=new Set();root.position.set(.11,.22,-.33);
for(const spec of specs){const record=records.get(spec.host),node=new THREE.Group();node.matrixAutoUpdate=false;node.matrix.fromArray(record.matrix);root.add(node);parts.set(spec.host,{record,node});rest.set(spec.host,{world:node.matrix.clone()});const material=new THREE.MeshStandardMaterial({color:record.material_role==='A'?'#dd2200':'#222222'});materials.push({key:spec.host,material,color:material.color.clone(),role:record.material_role});}
const purchased=new THREE.MeshStandardMaterial({color:'#778899',metalness:1}),purchasedRGB=purchased.color.clone();
let state={palette:{M:'#1155dd',A:'#ee8822'},review_axes:{x:0,y:0,z:0},hidden:false};
const inner={root,packet,parts,rest,materials,ownedGeometries,snapshot:()=>structuredClone(state),apply(next){state=structuredClone(next);for(const spec of e3ngModParts){const host=parts.get(spec.host);host.node.matrix.fromArray(spec.host_world);host.node.matrix.elements[12]+=next.review_axes.x/1000;host.node.matrix.elements[14]+=next.review_axes.y/1000;host.node.visible=!next.hidden;}for(const r of materials)r.material.color.set(next.palette[r.role]);root.updateMatrixWorld(true);},reset(){this.apply({palette:{M:'#1155dd',A:'#ee8822'},review_axes:{x:0,y:0,z:0},hidden:false});},dispose(){}};
inner.packet=mode==='head'?{...packet,head_only_subset:true,scope:'source-head-subset'}:packet;
inner.apply=function(next){state=structuredClone(next);for(const spec of specs){const host=parts.get(spec.host);host.node.matrix.fromArray(spec.host_world);if(spec.scope!=='full'){host.node.matrix.elements[12]+=next.review_axes.x/1000;host.node.matrix.elements[14]-=next.review_axes.y/1000;host.node.matrix.elements[13]-=next.review_axes.z/1000;}host.node.visible=!next.hidden;}for(const r of materials)r.material.color.set(next.palette[r.role]);root.updateMatrixWorld(true);};
const scene=new THREE.Group();for(const spec of specs){const source=model.scene.children.find(n=>n.userData.e3ng_mod===spec.id),mesh=source.clone();mesh.material=source.material.clone();scene.add(mesh);}
inner.apply(state);const adapter=attachE3NGMods(inner,{scene},{mode});assert.equal(adapter.e3ngMods.fullAssembly,mode==='full');
for(const base of ['stock','reinforced'])for(const cable of ['stock','cable-hole'])for(const panels of ['stock','hex'])for(const pose of poses)for(const palette of [{M:'#1155dd',A:'#ee8822'},{M:'#ee8822',A:'#1155dd'}]){
 const choice={schema:'e3ng-mods-v1',base,cable,panels};adapter.apply({...adapter.snapshot(),palette,review_axes:pose,e3ng_mods:choice});
 for(const {spec,mesh,host}of adapter.e3ngMods.entries){
  const selected=choice[spec.control]===spec.choice;assert.equal(mesh.visible,selected);assert.equal(host.node.visible,!selected);
  const panel=spec.scope==='full',source=panel?panelFixture.parts.find(r=>r.id===spec.id):null;
  const native=new THREE.Matrix4().fromArray(records.get(source?.original_host??spec.host).matrix);
  if(!panel){native.elements[12]+=pose.x/1000;native.elements[14]-=pose.y/1000;native.elements[13]-=pose.z/1000;}
  const sourceTransform=new THREE.Matrix4().fromArray(source?.geometry_transform??new THREE.Matrix4().elements),expected=root.matrixWorld.clone().multiply(native).multiply(sourceTransform);
  const agrees=m=>m.elements.every((v,i)=>Number.isFinite(v)&&Math.abs(v-expected.elements[i])<1e-12);
  assert(agrees(mesh.matrixWorld),'Actual placement differs from independent source fixture');
  if(panel)assert(!agrees(root.matrixWorld.clone().multiply(native)),'Placement oracle must reject a missing source rebase transform');
  assert(mesh.material.color.equals(new THREE.Color(palette[spec.control==='base'?'A':'M'])));
 }
 assert(purchased.color.equals(purchasedRGB));
 const saved=JSON.parse(JSON.stringify(adapter.snapshot()));adapter.reset();adapter.apply(saved);assert.deepEqual(adapter.snapshot(),saved);transactions++;
}
adapter.reset();assert(adapter.e3ngMods.entries.every(r=>!r.mesh.visible&&r.host.node.visible));
}
assert.equal(JSON.stringify(packet),baseline);
const report={passed:true,model_sha256:e3ngModModel,asset_sha256:e3ngModAsset.sha256,panel_asset_sha256:e3ngPanelAsset.sha256,parts:rows,combinations:8,transactions,source_packet_unchanged:true,source_count:packet.parts.length,whole_machine_physical_fit_certified:false,native_whole_fit_qualified:false,scope:'Exact exported replacement position and numerical-normal identity, finite source mounting walls and independent host/rebase bindings; void centerlines checked within 0.0002mm of each finite wall end with negative cap witnesses at 5/50/95 percent. Palette, full/head relative-motion, reset and save/load use owner fixtures at sampled axis poses. Baseline whole-model asset audit and browser inspection are separate. Panel circles are fitted public STL features, not native CAD cylinders. This does not certify whole-machine clearance or continuous motion.'};
if(arg('--out'))await fs.writeFile(arg('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,parts:rows.length,combinations:8,transactions,panel_circular_walls:rows.filter(r=>r.id.startsWith('hex-panel')).reduce((n,r)=>n+r.mounting_bores.length,0)}));

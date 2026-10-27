import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
const {e3ngModAsset,e3ngModParts,e3ngModModel}=await import('../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs');
const {attachE3NGMods}=await import('../site/viewer/source-assembly-runtime/e3ng-mods.mjs');
const THREE=await import('three');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const hash=b=>createHash('sha256').update(b).digest('hex');
let bytes;
if(arg('--asset'))bytes=await fs.readFile(arg('--asset'));
else {const r=await fetch(e3ngModAsset.url,{signal:AbortSignal.timeout(30000)});assert(r.ok,'E3NG mod asset unavailable');const blocks=[];let size=0;for await(const block of r.body){size+=block.byteLength;assert(size<=e3ngModAsset.bytes&&size<2*1024*1024,'E3NG mod transfer exceeds pin');blocks.push(block);}bytes=Buffer.concat(blocks,size);}
assert.equal(bytes.length,e3ngModAsset.bytes);assert.equal(hash(bytes),e3ngModAsset.sha256);
assert(bytes.length<2*1024*1024,'E3NG modifications must remain a small overlay');
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/e3ng-mod-source.json',import.meta.url),'utf8'));
const packet=JSON.parse(await fs.readFile(new URL('../site/source-assembly-assets/packet-rh3d_e3ng_v12_235.json',import.meta.url),'utf8'));
assert.equal(packet.model.sha256,e3ngModModel);const baseline=JSON.stringify(packet);
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const root=new THREE.Group(),parts=new Map(),rest=new Map(),materials=[],ownedGeometries=new Set(),records=new Map(packet.parts.map(r=>[r.key,r]));
const rows=[];
for(const spec of e3ngModParts){
 const record=records.get(spec.host);assert(record&&record.source_id===spec.host_source_sha256);assert.deepEqual(record.matrix,spec.host_world);
 const node=new THREE.Group();node.matrixAutoUpdate=false;node.matrix.fromArray(record.matrix);root.add(node);parts.set(spec.host,{record,node});rest.set(spec.host,{world:node.matrix.clone()});
 const material=new THREE.MeshStandardMaterial({color:record.material_role==='A'?'#dd2200':'#222222'});materials.push({key:spec.host,material,color:material.color.clone(),role:record.material_role});
 const mesh=model.scene.children.find(n=>n.userData.e3ng_mod===spec.id);assert(mesh);const pos=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index;assert.equal(index.count,spec.triangles*3);
 assert.equal(mesh.userData.source_sha256,spec.source_sha256);assert.equal(mesh.userData.source_license,'CC-BY-NC-SA-4.0');
 for(let i=0;i<pos.count;i++){assert([pos.getX(i),pos.getY(i),pos.getZ(i)].every(Number.isFinite));assert(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-5);}
 mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,bounds=[box.min.toArray(),box.max.toArray()],expected=fixture.parts.find(r=>r.id===spec.id);assert(expected);assert.equal(expected.source_sha256,spec.source_sha256);assert.equal(expected.triangles,spec.triangles);
 for(let j=0;j<2;j++)for(let k=0;k<3;k++)assert(Math.abs(bounds[j][k]-expected.local_bounds_mm[j][k])<.0001,'Actual mod geometry/source coordinate binding differs');
 const bores=[];
 for(const bore of expected.mounting_bores){
  assert(bore.axis_classified_void&&Number.isInteger(bore.native_face));const center=new THREE.Vector3(...bore.center_local_mm),axis=new THREE.Vector3(...bore.axis_local),[v0,v1]=bore.finite_axial_interval_mm;assert(Math.abs(axis.length()-1)<1e-10);
  let matched=0,lo=Infinity,hi=-Infinity;const q=new THREE.Vector3();for(let i=0;i<pos.count;i++){q.fromBufferAttribute(pos,i).sub(center);const t=q.dot(axis),radial=q.clone().addScaledVector(axis,-t).length();if(Math.abs(radial-bore.radius_mm)<.002&&t>=v0-.002&&t<=v1+.002){matched++;lo=Math.min(lo,t);hi=Math.max(hi,t);}}
  assert(matched>=12&&hi-lo>=(v1-v0)*.99,'Export lost native mounting bore wall');
  const origin=center.clone().addScaledVector(axis,v0+(v1-v0)*.1),ray=new THREE.Ray(origin,axis),length=(v1-v0)*.8,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(pos,index.getX(i));b.fromBufferAttribute(pos,index.getX(i+1));c.fromBufferAttribute(pos,index.getX(i+2));if(ray.intersectTriangle(a,b,c,false,hit))assert(hit.distanceTo(origin)>length,'Export capped a native bore inside its finite wall interval');}
  bores.push({native_face:bore.native_face,radius_mm:bore.radius_mm,wall_vertices:matched,finite_axis_clear:true});
 }
 rows.push({id:spec.id,sha256:spec.source_sha256,triangles:spec.triangles,local_bounds_mm:bounds,finite_positions:true,unit_normals:true,material_role:record.material_role,mounting_bores:bores});
}
let state={palette:{M:'#1155dd',A:'#ee8822'},review_axes:{x:0,y:0,z:0},hidden:false};
const inner={root,packet,parts,rest,materials,ownedGeometries,snapshot:()=>structuredClone(state),apply(next){state=structuredClone(next);for(const spec of e3ngModParts){const host=parts.get(spec.host);host.node.matrix.fromArray(spec.host_world);host.node.matrix.elements[12]+=next.review_axes.x/1000;host.node.matrix.elements[14]+=next.review_axes.y/1000;host.node.visible=!next.hidden;}for(const r of materials)r.material.color.set(next.palette[r.role]);root.updateMatrixWorld(true);},reset(){this.apply({palette:{M:'#1155dd',A:'#ee8822'},review_axes:{x:0,y:0,z:0},hidden:false});},dispose(){}};
inner.apply(state);const adapter=attachE3NGMods(inner,model);let transactions=0;
for(const base of ['stock','reinforced'])for(const cable of ['stock','cable-hole'])for(const [x,y]of [[0,0],[40,0],[-40,40],[20,-40],[0,0]]){
 adapter.apply({...adapter.snapshot(),review_axes:{x,y,z:0},e3ng_mods:{schema:'e3ng-mods-v1',base,cable}});
 for(const {spec,mesh,host}of adapter.e3ngMods.entries){assert.equal(mesh.visible,({base,cable})[spec.control]===spec.choice);assert(mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-host.node.matrixWorld.elements[i])<1e-12));}
 const saved=JSON.parse(JSON.stringify(adapter.snapshot()));adapter.reset();adapter.apply(saved);assert.deepEqual(adapter.snapshot(),saved);transactions++;
}
adapter.reset();assert(adapter.e3ngMods.entries.every(r=>!r.mesh.visible&&r.host.node.visible));assert.equal(JSON.stringify(packet),baseline);
const report={passed:true,model_sha256:e3ngModModel,asset_sha256:e3ngModAsset.sha256,parts:rows,combinations:4,transactions,source_packet_unchanged:true,source_count:packet.parts.length,scope:'Actual exported replacement meshes, source host bindings, unit normals, palette and relative-motion/reset/save-load checks. Existing companion source owners remain unchanged. Source mounting-datum/native-face review and browser evidence are separate; no whole-machine physical-fit certification.'};
if(arg('--out'))await fs.writeFile(arg('--out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

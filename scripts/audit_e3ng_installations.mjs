// Actual release bytes: bounded manifested chunks, only changed-owner POSITION/index views.
// No CAD input, GLTFLoader, whole GLB download, source reshaping or generic hardware.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Matrix4,Vector3,Quaternion} from 'three';
import {correctedE3NGSourceWorlds,e3ngInstallationCorrections,e3ngInstallationModel} from '../site/viewer/source-assembly-runtime/e3ng-installation-corrections.mjs';
import {auditE3NGSkirtFasteners} from './audit_e3ng_skirt_fasteners.mjs';

const MiB=1024*1024, MAX_CHUNK=16*MiB, MAX_CACHE=32*MiB, MAX_JSON=8*MiB;
const hash=b=>createHash('sha256').update(b).digest('hex');
const matrix=a=>new Matrix4().fromArray(a);
const close=(a,b,e=1e-12)=>a.length===b.length&&a.every((x,i)=>Number.isFinite(x)&&Math.abs(x-b[i])<=e);
const scalarClose=(a,b,e)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=e,`Finite source datum differs: ${a} / ${b}`);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sourcePoint=(m,p)=>{const q=new Vector3(...p).applyMatrix4(m);return [q.x*1000,-q.z*1000,q.y*1000];};

export function assertInstallationGeometry(fixture,key,points,triangle,installedWorld){
 const tol=fixture.tolerance_mm;
 if(key===fixture.skirt.owner){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of points())for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]);hi[j]=Math.max(hi[j],p[j]);}
  scalarClose(lo[1],fixture.skirt.front_mm,tol);scalarClose(lo[2],0,tol);scalarClose(hi[2],fixture.skirt.underside_mm,tol);
  for(const id of fixture.skirt.source_mount_triangle_ids)for(const p of triangle(id))scalarClose(p[2],fixture.skirt.underside_mm,tol);
  for(const id of fixture.skirt.source_reference_triangle_ids??fixture.skirt.source_front_triangle_ids)for(const p of triangle(id))scalarClose(p[1],fixture.skirt.source_reference_plane_mm??fixture.skirt.front_mm,tol);
  if(fixture.skirt.expected_bounds_mm)for(let j=0;j<3;j++){scalarClose(lo[j],fixture.skirt.expected_bounds_mm[0][j],tol);scalarClose(hi[j],fixture.skirt.expected_bounds_mm[1][j],tol);}
  return {kind:'skirt',source_mount_faces:fixture.skirt.source_mount_triangle_ids.length,bounds_mm:[lo,hi]};
 }
 for(const [side,c]of Object.entries(fixture.clamps)){
  if(key===c.cover){
   let lo=Infinity,hi=-Infinity;for(const p of points()){const s=dot(p,c.outward);lo=Math.min(lo,s);hi=Math.max(hi,s);}
   scalarClose(lo,c.slit[0],tol);assert(hi<=c.slit[1]+tol,'Cover exceeds source snap-in split');scalarClose(hi-lo,5.5,tol);
   assert(c.slit[1]-hi>.49&&c.slit[1]-hi<.51,'Source cover/slit clearance changed');
   return {kind:'cover',side,axis_interval_mm:[lo,hi],opposing_jaw_gap_mm:c.slit[1]-hi};
  }
  if(key.startsWith(`E3NG-bed287-M3x20-${side}-cover-`)){
   const s=fixture.screw;
   for(let i=s.head_seat_triangle_first;i<s.head_seat_triangle_first+s.head_seat_triangle_count;i++)for(const p of triangle(i))scalarClose(dot(p,c.outward),c.head_floor,tol);
   const seat=sourcePoint(installedWorld,s.head_seat_axis_local_mm),tip=sourcePoint(installedWorld,s.tip_axis_local_mm);
   scalarClose(dot(seat,c.outward),c.head_floor,tol);scalarClose(Math.hypot(...tip.map((x,i)=>x-seat[i])),20,tol);
   assert(dot(tip.map((x,i)=>x-seat[i]),c.outward)<-19.99,'Original screw shaft faces away from nut');
   assert(s.head_radius_mm<s.counterbore_radius_mm&&s.counterbore_depth_mm<s.head_height_mm,'Source head/counterbore contract changed');
   return {kind:'M3x20',side,original_native_head_face:0,head_face_triangles:s.head_seat_triangle_count,head_seat_mm:seat,partly_proud_head_mm:s.head_height_mm-s.counterbore_depth_mm};
  }
 }
 throw Error('Unexpected changed installation owner');
}

export async function auditE3NGInstallations(packetInput,{localMap={},origin,fixturePath=new URL('./fixtures/e3ng-installations-source.json',import.meta.url),inspectSource}={}){
 const fixture=JSON.parse(await fs.readFile(fixturePath,'utf8'));
 let packetOrigin=/^https?:/.test(packetInput)?new URL(packetInput).origin:origin;
 const counters={chunk_fetches:0,chunk_cache_peak_bytes:0,selected_accessor_bytes:0};
 const resolve=ref=>{try{return new URL(ref,origin||packetOrigin).href;}catch{return ref;}};
 async function bytes(ref,max,expected){
  const resolved=resolve(ref),mapped=localMap[ref]??localMap[resolved];let b;
  if(mapped){const p=typeof mapped==='string'?mapped:mapped.path;const st=await fs.stat(p);assert(st.size<=max,'Local mapped resource exceeds bound');b=await fs.readFile(p);}
  else{
   assert(/^https?:/.test(resolved),'Relative asset needs --origin or an explicit --local-map');
   const r=await fetch(resolved,{signal:AbortSignal.timeout(30000)});assert(r.ok,`Asset HTTP ${r.status}`);const declared=Number(r.headers.get('content-length'));if(declared)assert(declared<=max,'Declared response exceeds bound');
   const blocks=[];let n=0;for await(const value of r.body){n+=value.byteLength;assert(n<=max,'Stream exceeded resource bound');blocks.push(value);}b=Buffer.concat(blocks,n);
  }
  assert(b.byteLength<=max,'Resource exceeded bound');if(expected)assert.equal(hash(b),expected,'Exact resource SHA256 mismatch');return b;
 }
 let packet;
 if(/^https?:/.test(packetInput))packet=JSON.parse((await bytes(packetInput,MAX_JSON)).toString('utf8'));
 else{const st=await fs.stat(packetInput);assert(st.size<=MAX_JSON);packet=JSON.parse(await fs.readFile(packetInput,'utf8'));}
 assert(!packet.head_only_subset,'Actual full E3NG installation audit requires full packet');
 assert.equal(packet.model?.sha256,fixture.model_sha256);assert.equal(e3ngInstallationModel,fixture.model_sha256);
 if(!origin&&/^https?:/.test(packet.model.url))origin=new URL(packet.model.url).origin;
 const ref=packet.chunk_delivery?.manifest;assert(ref?.url&&/^[0-9a-f]{64}$/.test(ref.sha256),'Missing pinned chunk manifest');
 const manifest=JSON.parse((await bytes(ref.url,MAX_JSON,ref.sha256)).toString('utf8'));
 assert.equal(manifest.model_sha256,fixture.model_sha256);assert.equal(manifest.source_inventory_sha256,packet.inventory.sha256);
 const doc=manifest.document;assert(doc?.nodes&&doc?.accessors&&doc?.bufferViews,'Manifest lacks exact GLB document');
 const recordMap=new Map();for(const r of packet.parts){assert(!recordMap.has(r.key),'Duplicate source owner');recordMap.set(r.key,r);}
 const parent=new Map();doc.nodes.forEach((n,i)=>{for(const c of n.children||[]){assert(!parent.has(c),'Duplicate node parent');parent.set(c,i);}});
 const rawWorlds=new Map();function rawWorld(i){
  if(rawWorlds.has(i))return rawWorlds.get(i);
  const n=doc.nodes[i];assert(n,'Missing exact source node');const m=n.matrix?matrix(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));
  if(parent.has(i))m.premultiply(rawWorld(parent.get(i)));rawWorlds.set(i,m);return m;
 }
 const corrected=correctedE3NGSourceWorlds(packet);assert.equal(corrected.size,7);assert.equal(fixture.corrections.length,7);assert.equal(e3ngInstallationCorrections.length,7);
 for(const g of fixture.unchanged_guards){const r=recordMap.get(g.key);assert(r&&r.source_id===g.source_id,'Changed host/nut source identity');assert(close(r.matrix,g.expected_world_m),'Changed host/nut packet pose');assert(close(rawWorld(g.node).elements,g.expected_world_m),'Changed host/nut actual source pose');assert(!corrected.has(g.key),'Nut/host incorrectly receives installation correction');}
 const cache=new Map();let cacheBytes=0;const chunks=new Map(manifest.chunks.map(c=>[c.ordinal,c]));
 async function chunk(ordinal){
  if(cache.has(ordinal)){const b=cache.get(ordinal);cache.delete(ordinal);cache.set(ordinal,b);return b;}
  const c=chunks.get(ordinal);assert(c&&c.bytes>0&&c.bytes<=MAX_CHUNK,'Manifested inflated chunk exceeds 16 MiB');
  while(cacheBytes+c.bytes>MAX_CACHE){const oldest=cache.keys().next().value;assert(oldest!==undefined);cacheBytes-=cache.get(oldest).byteLength;cache.delete(oldest);}
  let b;
  if(c.gzip?.url){assert(c.gzip.bytes<=MAX_CHUNK);const compressed=await bytes(c.gzip.url,MAX_CHUNK,c.gzip.sha256);b=gunzipSync(compressed,{maxOutputLength:MAX_CHUNK});}
  else b=await bytes(c.url,MAX_CHUNK,c.sha256);
  assert.equal(b.byteLength,c.bytes);assert.equal(hash(b),c.sha256,'Inflated manifested chunk SHA mismatch');cache.set(ordinal,b);cacheBytes+=b.byteLength;counters.chunk_fetches++;counters.chunk_cache_peak_bytes=Math.max(counters.chunk_cache_peak_bytes,cacheBytes);return b;
 }
 async function accessor(id,requireFixture=true){
  const pin=fixture.accessors[id],a=doc.accessors[id];assert((pin||!requireFixture)&&a&&!a.sparse&&!a.normalized,'Unpinned/unsupported source accessor');
  const widths={5123:2,5125:4,5126:4},dims={SCALAR:1,VEC3:3},width=widths[a.componentType],dim=dims[a.type];assert(width&&dim);
  const v=doc.bufferViews[a.bufferView],mapping=manifest.buffer_view_chunks[a.bufferView];assert(v&&mapping&&v.buffer===0,'Missing manifested selected view');
  const c=chunks.get(mapping.chunk);assert(c.buffer_views.includes(a.bufferView),'Manifest chunk/view mapping differs');const b=await chunk(mapping.chunk);
  const stride=v.byteStride||width*dim,length=(a.count-1)*stride+width*dim;assert(length>0&&length<=MAX_CHUNK,'Selected accessor exceeds bound');if(pin){assert.equal(length,pin.bytes);assert.equal(a.count,pin.count);}
  const offset=mapping.offset+(a.byteOffset||0);assert(offset>=mapping.offset&&offset+length<=mapping.offset+v.byteLength&&offset+length<=b.byteLength,'Selected accessor escapes manifested view');
  const raw=Buffer.from(b.subarray(offset,offset+length));if(pin)assert.equal(hash(raw),pin.sha256,'Original selected part bytes changed');counters.selected_accessor_bytes+=length;
  return {id,sha256:hash(raw),bytes:length,count:a.count,read:(i,j=0)=>{assert(Number.isInteger(i)&&i>=0&&i<a.count&&Number.isInteger(j)&&j>=0&&j<dim);const p=i*stride+j*width;return a.componentType===5126?raw.readFloatLE(p):a.componentType===5125?raw.readUInt32LE(p):raw.readUInt16LE(p);}};
 }
 const results=[];
 for(const expected of fixture.corrections){
  const r=recordMap.get(expected.key),binding=e3ngInstallationCorrections.find(c=>c.key===expected.key);assert(r&&r.source_id===expected.source_id&&binding,'Missing/changed installation owner');
  assert(close(r.matrix,expected.expected_world_m)&&close(rawWorld(expected.node).elements,expected.expected_world_m),'Changed raw source pose');
  assert(close(binding.expected_world_m,expected.expected_world_m)&&close(binding.installed_world_m,expected.installed_world_m),'Adapter differs from finite source correction');
  assert(close(corrected.get(expected.key).elements,expected.installed_world_m),'Corrected runtime world differs');
  assert.equal(expected.leaves.length,1,'Fresh source leaf binding required');const leaf=expected.leaves[0],node=doc.nodes[leaf.node];assert.equal(node.mesh,leaf.mesh);
  const mesh=doc.meshes[node.mesh];assert.equal(mesh.primitives.length,1);const primitive=mesh.primitives[0];assert.equal(primitive.mode??4,4);
  const p=await accessor(primitive.attributes.POSITION),ix=await accessor(primitive.indices);assert.equal(ix.count,leaf.triangles*3);
  const installedLeaf=corrected.get(expected.key).clone().multiply(rawWorld(expected.node).clone().invert()).multiply(rawWorld(leaf.node));
  const point=i=>{const local=[p.read(i,0),p.read(i,1),p.read(i,2)];assert(local.every(Number.isFinite));return sourcePoint(installedLeaf,local);};
  const points=function*(){for(let i=0;i<p.count;i++)yield point(i);};let triangle=i=>{assert(Number.isInteger(i)&&i>=0&&i<leaf.triangles);return [0,1,2].map(k=>point(ix.read(3*i+k)));};
  if(expected.key===fixture.skirt.owner&&fixture.skirt.source_plane_ids_kind==='original-source-facet-id'){
   assert.equal(primitive.attributes._SOURCE_FACET_ID,fixture.skirt.source_facet_accessor,'Missing exact skirt original-facet binding');
   const sourceIds=await accessor(fixture.skirt.source_facet_accessor,false);assert.equal(sourceIds.count,p.count);
   const wanted=new Set([...fixture.skirt.source_mount_triangle_ids,...fixture.skirt.source_reference_triangle_ids]),mapped=new Map(),exportedTriangle=triangle;
   for(let i=0;i<leaf.triangles;i++){const ids=[0,1,2].map(k=>sourceIds.read(ix.read(3*i+k)));assert(ids.every(Number.isInteger)&&ids.every(id=>id===ids[0]),'Mixed original skirt plane facet');if(wanted.has(ids[0])){assert(!mapped.has(ids[0]),'Duplicate skirt plane facet');mapped.set(ids[0],i);}}
   for(const id of wanted)assert(mapped.has(id),'Missing original mounting/reference plane facet: '+id);
   triangle=id=>{assert(mapped.has(id),'Unbound original source plane facet');return exportedTriangle(mapped.get(id));};
  }
  results.push({owner:expected.key,triangles:leaf.triangles,geometry_bytes_unchanged:true,...assertInstallationGeometry(fixture,expected.key,points,triangle,corrected.get(expected.key))});
 }
 const actualSource={packet,manifest,doc,recordMap,rawWorld,accessor,corrected};
 // Mandatory for every caller, including the standalone CLI and route release
 // main. A custom source callback cannot bypass the eight-instance gate.
 const skirt_fasteners=await auditE3NGSkirtFasteners(actualSource);
 assert(skirt_fasteners.passed&&skirt_fasteners.instances===8,'Required eight-fastener source gate failed');
 const additional=inspectSource?await inspectSource({...actualSource,skirt_fasteners}):null;
 return {passed:true,model_sha256:fixture.model_sha256,changed_owners:7,nuts_and_hosts_unchanged:true,...counters,results,skirt_fasteners,additional,
  source_companion_finding:'Required four source screws and four source nuts checked against exported geometry and pinned final native pose evidence.',
  scope:'Actual selected exported geometry, seven corrected worlds and eight source fastener instances. Limited native-pose certificate linkage; whole-machine native-solid fit, printed flexure and physical thread-flank engagement are not certified.'};
}

async function main(){
 const args=process.argv.slice(2),input=args.shift();assert(input,'Usage: audit_e3ng_installations.mjs PACKET [--origin URL] [--local-map JSON] [--out JSON]');const options={};let out;
 while(args.length){const flag=args.shift(),value=args.shift();assert(value);if(flag==='--origin')options.origin=value;else if(flag==='--local-map'){const map=JSON.parse(await fs.readFile(value,'utf8'));options.localMap=map.files||map;}else if(flag==='--out')out=value;else throw Error('Unknown argument');}
 const result=await auditE3NGInstallations(input,options);if(out)await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,changed_owners:7,chunk_fetches:result.chunk_fetches,chunk_cache_peak_bytes:result.chunk_cache_peak_bytes,scope:result.scope}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});

// Exact source/actual mesh regression. Inputs are caller-listed public assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import zlib from 'node:zlib';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const fixture=JSON.parse(fs.readFileSync(path.join(root,'docs/TRINITY_BEACON_HELPER_REGRESSION.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function assertEmbeddedTriangleDocument(doc,binBytes){
 assert.equal(doc.buffers.length,1);assert.equal(doc.buffers[0].uri,undefined,'External buffer is not the inspected BIN');
 const bytes=doc.buffers[0].byteLength;assert(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=binBytes&&binBytes-bytes<=3);
 for(const mesh of doc.meshes)for(const primitive of mesh.primitives)assert.equal(primitive.mode??4,4,'Actual geometry must be triangles');
}
const defaultScene=doc=>{const i=doc.scene??0;assert(Number.isSafeInteger(i)&&i>=0&&i<doc.scenes.length,'Invalid default scene');return i;};
export function assertRetainedScenes(before,after){
 assert.equal(defaultScene(before),defaultScene(after),'Changed default scene selection');
 assert.deepEqual(before.scenes,after.scenes);assert.deepEqual(before.materials,after.materials);assert.deepEqual(before.nodes,after.nodes);
}
export function assertHelperDescriptor(catalog){
 const spec=catalog.assets[fixture.asset];
 assert.equal(spec.component_id,fixture.asset);assert.equal(spec.parts,fixture.parts);
 for(const name of Object.keys(fixture.current_files))assert.deepEqual(spec.files[name],fixture.current_files[name],'Beacon helper removal asset identity: '+name);
 return spec;
}
function exact(file,pin){const stat=fs.statSync(file);assert(stat.isFile()&&stat.size===pin.bytes&&stat.size<80_000_000,'Asset size differs');const b=fs.readFileSync(file);assert.equal(sha(b),pin.sha256,'Asset checksum differs');return b;}
function model(file,pin){
 const stored=exact(file,pin),raw=zlib.gunzipSync(stored,{maxOutputLength:pin.decoded_bytes});assert.equal(raw.length,pin.decoded_bytes);assert.equal(sha(raw),pin.decoded_sha256);
 assert.equal(raw.readUInt32LE(0),0x46546c67);assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);const n=raw.readUInt32LE(12);assert.equal(raw.readUInt32LE(16),0x4e4f534a);assert.equal(raw.readUInt32LE(n+24),0x004e4942);
 const doc=JSON.parse(raw.subarray(20,20+n).toString());assert(!doc.images?.length&&!doc.skins?.length&&!doc.animations?.length);const bin=raw.subarray(28+n);assertEmbeddedTriangleDocument(doc,bin.length);
 return {doc,bin};
}
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},elements={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(g,index){
 const a=g.doc.accessors[index],v=g.doc.bufferViews[a.bufferView];assert(!a.sparse&&v.buffer===0);const width=sizes[a.componentType]*elements[a.type],stride=v.byteStride||width;assert(width>0&&stride>=width);const start=(v.byteOffset||0)+(a.byteOffset||0),out=Buffer.alloc(a.count*width);
 assert(start>=0&&start+(a.count-1)*stride+width<=g.bin.length);
 assert((a.byteOffset||0)+(a.count-1)*stride+width<=v.byteLength,'Accessor escapes its declared view');
 for(let i=0;i<a.count;i++)g.bin.copy(out,i*width,start+i*stride,start+i*stride+width);
 return {bytes:out,layout:{type:a.type,componentType:a.componentType,count:a.count,normalized:a.normalized||false}};
}
function owners(g){
 const m=new Map(),seen=new Set();
 function visit(i){assert(Number.isSafeInteger(i)&&i>=0&&i<g.doc.nodes.length&&!seen.has(i),'Invalid/reused scene node');seen.add(i);const n=g.doc.nodes[i];if(n.mesh!==undefined){const key=n.extras?.part_key||n.extras?.key;assert(key&&!m.has(key),'Missing/duplicate actual part');m.set(key,n);}for(const child of n.children||[])visit(child);}
 for(const i of g.doc.scenes[defaultScene(g.doc)].nodes)visit(i);
 assert.equal(seen.size,g.doc.nodes.length,'Unselected node hides unreviewed geometry');assert.equal(m.size,g.doc.meshes.length,'Unselected mesh definition');return m;
}
function samePrimitive(before,after,a,b){
 const plain=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['indices','attributes'].includes(k)));
 assert.deepEqual(plain(a),plain(b));assert.deepEqual(Object.keys(a.attributes).sort(),Object.keys(b.attributes).sort());
 for(const k of Object.keys(a.attributes)){const x=accessor(before,a.attributes[k]),y=accessor(after,b.attributes[k]);assert.deepEqual(x.layout,y.layout);for(const bound of ['min','max'])assert.deepEqual(before.doc.accessors[a.attributes[k]][bound],after.doc.accessors[b.attributes[k]][bound],'Changed retained accessor bounds');assert.equal(sha(x.bytes),sha(y.bytes),'Changed retained actual attribute: '+k);}
 assert.equal(a.indices===undefined,b.indices===undefined);
 if(a.indices!==undefined){const x=accessor(before,a.indices),y=accessor(after,b.indices);assert.deepEqual(x.layout,y.layout);assert.equal(sha(x.bytes),sha(y.bytes));}
}
export function auditActual({catalog,sourceMetadata,sourceModel,metadata,model:replacement}){
 assertHelperDescriptor(catalog);
 const originalMeta=JSON.parse(exact(sourceMetadata,fixture.original_files['parts.json'])),meta=JSON.parse(exact(metadata,fixture.current_files['parts.json']));
 assert.equal(meta.id,fixture.asset);assert.equal(meta.parts.length,fixture.parts);assert.deepEqual(meta.parts.map(p=>p.key),originalMeta.parts.map(p=>p.key));
 const before=model(sourceModel,fixture.original_files['model.glb']),after=model(replacement,fixture.current_files['model.glb']),a=owners(before),b=owners(after);assert.equal(a.size,fixture.parts);assert.equal(b.size,fixture.parts);
 assertRetainedScenes(before.doc,after.doc);
 let retained=0;
 for(const row of originalMeta.parts){
  const x=a.get(row.key),y=b.get(row.key);assert(x&&y,'Missing actual part');const mx=before.doc.meshes[x.mesh],my=after.doc.meshes[y.mesh];assert.equal(mx.primitives.length,my.primitives.length);
  if(row.key===fixture.sensor_part)continue;
  assert.deepEqual(meta.parts.find(p=>p.key===row.key),row,'Changed retained metadata');
  for(let i=0;i<mx.primitives.length;i++)samePrimitive(before,after,mx.primitives[i],my.primitives[i]);retained++;
 }
 assert.equal(retained,fixture.preserved_parts);
 const sensor=meta.parts.find(r=>r.key===fixture.sensor_part);assert.equal(sensor.original_source_brep_sha256,fixture.source_sensor_brep_sha256);assert.equal(sensor.source_brep_sha256,fixture.physical_sensor_brep_sha256);assert.deepEqual(sensor.source_geometry_operation.removed_helpers,fixture.removed_helpers);assert.equal(sensor.triangles,fixture.sensor_triangles);
 assert(meta.omitted.some(r=>r.key===fixture.sensor_part+':coil-CAD-helpers'&&r.reason.includes('physical coil PCB')),'Missing model notice for omitted helpers');
 const ps=after.doc.meshes[b.get(fixture.sensor_part).mesh].primitives;assert.equal(ps.length,1);assert.equal(ps[0].indices,undefined);assert.equal(ps[0].material,before.doc.meshes[a.get(fixture.sensor_part).mesh].primitives[0].material);
 const p=accessor(after,ps[0].attributes.POSITION),n=accessor(after,ps[0].attributes.NORMAL);assert.deepEqual(p.layout,{type:'VEC3',componentType:5126,count:fixture.sensor_triangles*3,normalized:false});assert.deepEqual(n.layout,p.layout);
 const native=Buffer.alloc(8+p.layout.count*24);native.write('BCLEAN01');let minDot=Infinity,maxNormalError=0;
 for(let i=0;i<p.layout.count;i++){
  const xyz=[0,1,2].map(k=>p.bytes.readFloatLE(i*12+k*4)),normal=[0,1,2].map(k=>n.bytes.readFloatLE(i*12+k*4));assert([...xyz,...normal].every(Number.isFinite));const e=Math.abs(Math.hypot(...normal)-1);assert(e<1e-5);maxNormalError=Math.max(maxNormalError,e);p.bytes.copy(native,8+i*24,i*12,i*12+12);n.bytes.copy(native,20+i*24,i*12,i*12+12);
  if(i%3===0){const v=k=>[0,1,2].map(j=>p.bytes.readFloatLE((i+k)*12+j*4)),a=v(0),b=v(1),c=v(2),ab=b.map((x,j)=>x-a[j]),ac=c.map((x,j)=>x-a[j]),cr=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...cr);assert(length>1e-20,'Collapsed actual sensor triangle');const dot=cr.reduce((s,x,j)=>s+x*normal[j],0)/length;assert(dot>0,'Reversed actual sensor triangle');minDot=Math.min(minDot,dot);}
 }
 assert.equal(sha(native),fixture.sensor_native_triangle_stream_sha256,'Actual sensor differs from the source-derived native mesh');
 return {passed:true,parts:fixture.parts,preserved_actual_parts:retained,sensor_triangles:fixture.sensor_triangles,minimum_normal_dot:minDot,maximum_normal_length_error:maxNormalError,scope:fixture.scope,native_solid_clearance:false,all_combinations_verified:false};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const [site,sourceMetadata,sourceModel,metadata,replacement,destination]=process.argv.slice(2);assert(site&&sourceMetadata&&sourceModel&&metadata&&replacement&&destination,'Usage: audit_trinity_beacon_helpers.mjs SITE OLD_META OLD_MODEL NEW_META NEW_MODEL REPORT');
 const report=auditActual({catalog:JSON.parse(fs.readFileSync(path.join(site,'HEAD_ADDITIONS.json'))),sourceMetadata,sourceModel,metadata,model:replacement});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}

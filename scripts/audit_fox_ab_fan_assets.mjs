// Actual exported FOX v30 geometry. Source witnesses are public, repository-relative.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const FOX_ID='fox491404_v1_voron4010_reference_closed_v30';
export const FOX_MODEL_SHA='cc1922bd8657130f5bbe7fbed20e7d371c40a6cfb6b7f80728354b42feba228e';
export const FOX_METADATA_SHA='2cf7ea666773365ecc44ce17023526c8cf7252de8493cf3c4ef34dd731276087';
export const ORIGINAL_MODEL_SHA='982c7895f6a431c33a947e46c813c5b8975cba4f51c98bf75cd7bb887423f901';
export const WITNESS_SHA='a7ace85a0cb9784e5f274bc2a7ea2d3856be0440c65bf3808bb48c89f74c1777';
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export function assertPinned(bytes,hash,label){assert.equal(sha(bytes),hash,`${label}: source pin changed`)}
export const FOX_DELIVERY_PINS=Object.freeze({
 model:Object.freeze({decodedBytes:6244352,decodedSha256:FOX_MODEL_SHA,gzipBytes:1537188,gzipSha256:'fa0f84eec94ccdead1d43daf25e85c8ca4943a616fada8f8f1828682da7c0fa4'}),
 metadata:Object.freeze({decodedBytes:389200,decodedSha256:FOX_METADATA_SHA,gzipBytes:56783,gzipSha256:'3940cb19bbeea06976a2858f26174c1dbb09dba838cdfcc3fb1ab5a1d24d34b0'})
});
// The delivery pin is checked before inflation; the exact decoded size is also
// the decompressor allocation limit. This is transport validation, not remeshing.
function validateDeliveryPins(pins){
 for(const key of ['decodedBytes','gzipBytes'])assert.ok(Number.isSafeInteger(pins[key])&&pins[key]>0&&pins[key]<=32*1024*1024,'Invalid bounded delivery size');
 for(const key of ['decodedSha256','gzipSha256'])assert.match(pins[key],/^[a-f0-9]{64}$/,'Invalid delivery digest');
}
export function decodeDeliveryBytes(encoded,pins,encoding,label='FOX delivery'){
 validateDeliveryPins(pins);assert.ok(Buffer.isBuffer(encoded));assert.ok(encoding==='identity'||encoding==='gzip','Unexpected delivery encoding');
 const compressed=encoding==='gzip';assert.equal(encoded.length,compressed?pins.gzipBytes:pins.decodedBytes,`${label}: encoded size changed`);
 assertPinned(encoded,compressed?pins.gzipSha256:pins.decodedSha256,label+' encoded '+encoding);
 const decoded=compressed?gunzipSync(encoded,{maxOutputLength:pins.decodedBytes}):encoded;
 assert.equal(decoded.length,pins.decodedBytes,`${label}: decoded size changed`);assertPinned(decoded,pins.decodedSha256,label+' decoded');return decoded;
}
function readExactFile(file,expectedBytes){
 const fd=fs.openSync(file,'r');try{
  const stat=fs.fstatSync(fd);assert.ok(stat.isFile(),'Expected a regular delivery file');assert.equal(stat.size,expectedBytes,'Delivery file size changed before read');
  const bytes=Buffer.allocUnsafe(expectedBytes);let offset=0;
  while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);assert.ok(n>0,'Truncated delivery file');offset+=n}
  assert.equal(fs.readSync(fd,Buffer.alloc(1),0,1,null),0,'Delivery file grew during read');return bytes;
 }finally{fs.closeSync(fd)}
}
export function readDeliveryAsset(site,relative,pins,observations=[]){
 validateDeliveryPins(pins);let chosen=null;const representations=[];
 // Validate every present representation; a stale raw file cannot be hidden by
 // a good gzip file. Prefer gzip when both exist, matching compressed delivery.
 for(const encoding of ['identity','gzip']){
  const name=relative+(encoding==='gzip'?'.gz':''),file=path.join(site,name);if(!fs.existsSync(file))continue;
  const encoded=readExactFile(file,encoding==='gzip'?pins.gzipBytes:pins.decodedBytes);
  const input={path:name.replaceAll('\\','/'),encoding,bytes:encoded.length,sha256:sha(encoded)};observations.push(input);
  const bytes=decodeDeliveryBytes(encoded,pins,encoding,name);Object.assign(input,{decodedBytes:bytes.length,decodedSha256:sha(bytes),encodedAndDecodedPinsVerified:true});
  representations.push(input);chosen={bytes,selectedPath:input.path,encoding};
 }
 assert.ok(chosen,relative+': missing raw and gzip delivery');return {...chosen,representations};
}
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const finite=a=>Array.isArray(a)&&a.every(Number.isFinite);
function multiply(a,b){return Array.from({length:16},(_,i)=>{const row=i%4,col=i>>2;let n=0;for(let k=0;k<4;k++)n+=a[row+4*k]*b[k+4*col];return n})}
function rigidMatrix(node){
 assert.ok(!node.translation&&!node.rotation&&!node.scale,'FOX exact source nodes use explicit matrices, not new TRS');
 const m=node.matrix??IDENTITY;assert.ok(m.length===16&&finite(m),'Nonfinite source matrix');
 assert.deepEqual([m[3],m[7],m[11],m[15]],[0,0,0,1]);
 for(let a=0;a<3;a++)for(let b=0;b<3;b++){let d=0;for(let i=0;i<3;i++)d+=m[i+4*a]*m[i+4*b];assert.ok(Math.abs(d-(a===b?1:0))<=1e-10,'Non-rigid source transform')}
 const det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);assert.ok(Math.abs(det-1)<=1e-10,'Reflected source transform');return m;
}
export function parseGLB(bytes){
 assert.ok(bytes.length>=28&&bytes.length<=32*1024*1024,'FOX GLB size limit');
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 let offset=12,json,bin;while(offset<bytes.length){assert.ok(offset+8<=bytes.length);const n=bytes.readUInt32LE(offset),kind=bytes.readUInt32LE(offset+4);offset+=8;assert.ok(n%4===0&&offset+n<=bytes.length,'Malformed GLB chunk');
  if(kind===0x4e4f534a){assert.equal(json,undefined);json=JSON.parse(bytes.subarray(offset,offset+n).toString('utf8'))}
  else if(kind===0x004e4942){assert.equal(bin,undefined);bin=bytes.subarray(offset,offset+n)}else assert.fail('Unexpected FOX GLB chunk');offset+=n;
 }
 assert.equal(json?.asset?.version,'2.0');assert.ok(bin);assert.equal(json.buffers?.length,1);assert.equal(json.buffers[0].uri,undefined);assert.ok(json.buffers[0].byteLength<=bin.length&&bin.length-json.buffers[0].byteLength<=3);
 assert.ok(!json.images?.length&&!json.textures?.length&&!json.skins?.length&&!json.animations?.length,'New external/render resources are outside this fixed source');
 return {json,bin};
}
const COMPONENTS={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']},WIDTH={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(g,index){
 const a=g.json.accessors?.[index];assert.ok(a&&!a.sparse&&!a.normalized,'Unsupported sparse/normalized source accessor');
 const v=g.json.bufferViews?.[a.bufferView],c=COMPONENTS[a.componentType],w=WIDTH[a.type];assert.ok(v&&v.buffer===0&&c&&w);
 assert.ok(Number.isSafeInteger(a.count)&&a.count>0&&a.count<=3000000);const size=c[0]*w,stride=v.byteStride??size,start=(v.byteOffset??0)+(a.byteOffset??0),end=start+(a.count-1)*stride+size;
 assert.ok(Number.isSafeInteger(start)&&start>=0&&stride>=size&&stride<=256&&end<=g.bin.length&&end<=(v.byteOffset??0)+v.byteLength,'Source accessor out of bounds');
 const packed=Buffer.allocUnsafe(a.count*size),values=new (a.componentType===5126?Float32Array:Uint32Array)(a.count*w);
 for(let i=0;i<a.count;i++){g.bin.copy(packed,i*size,start+i*stride,start+i*stride+size);for(let k=0;k<w;k++)values[i*w+k]=g.bin[c[1]](start+i*stride+k*c[0])}
 return {values,descriptor:{componentType:a.componentType,type:a.type,count:a.count,bytes:packed.length,sha256:sha(packed)}};
}
export function physicalParts(g,metadata){
 assert.ok(Array.isArray(metadata.parts)&&metadata.parts.length===28);const records=new Map(metadata.parts.map(p=>[p.key,p]));assert.equal(records.size,28);
 const parts=new Map([...records].map(([k,record])=>[k,{key:k,record,primitives:[]}])),seenNodes=new Set(),seenMeshes=new Set();
 function visit(i,parent=IDENTITY,parentKey=null){
  assert.ok(Number.isInteger(i)&&!seenNodes.has(i),'Duplicate/cyclic source node');seenNodes.add(i);const n=g.json.nodes?.[i];assert.ok(n);
  const key=n.extras?.part_key??(records.has(n.name)?n.name:parentKey);if(key!==null)assert.ok(records.has(key),'Unknown literal part ID: '+key);
  const matrix=multiply(parent,rigidMatrix(n));
  if(n.mesh!==undefined){assert.ok(key,'Unowned draw primitive');assert.ok(!seenMeshes.has(n.mesh),'Unexpected reused FOX mesh');seenMeshes.add(n.mesh);const mesh=g.json.meshes[n.mesh];assert.ok(mesh?.primitives?.length);
   for(const q of mesh.primitives){assert.equal(q.mode??4,4);assert.ok(!q.targets);assert.deepEqual(Object.keys(q.attributes).sort(),['NORMAL','POSITION']);
    const p=accessor(g,q.attributes.POSITION),normal=accessor(g,q.attributes.NORMAL);assert.equal(p.descriptor.componentType,5126);assert.equal(p.descriptor.type,'VEC3');assert.equal(normal.descriptor.componentType,5126);assert.equal(normal.descriptor.type,'VEC3');assert.equal(p.values.length,normal.values.length);
    const idx=q.indices===undefined?null:accessor(g,q.indices);if(idx){assert.equal(idx.descriptor.type,'SCALAR');assert.ok([5121,5123,5125].includes(idx.descriptor.componentType))}
    const indices=idx?.values??Uint32Array.from({length:p.descriptor.count},(_,i)=>i);assert.equal(indices.length%3,0);for(const v of indices)assert.ok(v<p.descriptor.count,'Triangle index out of bounds');
    const material=g.json.materials?.[q.material];assert.ok(material&&material.doubleSided===false,'Missing/orientation-masking source material');
    parts.get(key).primitives.push({node:i,mesh:n.mesh,positions:p.values,normals:normal.values,indices,matrix,material,
     signature:{position:p.descriptor,normal:normal.descriptor,indices:idx?.descriptor??null,materialSha256:sha(Buffer.from(canonical(material))),matrix}});
   }
  }
  for(const child of n.children??[])visit(child,matrix,key);
 }
 const roots=g.json.scenes?.[g.json.scene??0]?.nodes;assert.ok(Array.isArray(roots)&&roots.length);for(const i of roots)visit(i);
 assert.equal(seenNodes.size,g.json.nodes.length,'Unreachable source nodes');assert.equal(seenMeshes.size,g.json.meshes.length,'Unowned source mesh');
 for(const part of parts.values()){assert.ok(part.primitives.length,part.key+': missing part');const first=part.primitives[0].matrix;for(const q of part.primitives)assert.equal(canonical(q.matrix),canonical(first),'Physical part fragments do not share the exact source frame')}
 return parts;
}
const f32=new Float32Array(1),u32=new Uint32Array(f32.buffer);
function word(x){f32[0]=x;return x===0?0:u32[0]}
function exactInteger(x){const w=word(x),sign=w>>>31?-1n:1n,e=(w>>>23)&255,m=w&0x7fffff;assert.ok(e<255);return sign*(e===0?BigInt(m):BigInt(m|0x800000)<<BigInt(e-1))}
function exactCross(a,b,c){const d=b.map((v,i)=>exactInteger(v)-exactInteger(a[i])),e=c.map((v,i)=>exactInteger(v)-exactInteger(a[i]));return [d[1]*e[2]-d[2]*e[1],d[2]*e[0]-d[0]*e[2],d[0]*e[1]-d[1]*e[0]]}
export function inspectPhysicalPart(part){
 const vertices=new Map(),edges=new Map(),links=[],triangles=[];let normalCount=0,maxUnitError=0,minFacingDot=Infinity,fallbacks=0,volume=0,compensation=0;
 const id=p=>{const key=p.map(word).join(',');if(!vertices.has(key)){vertices.set(key,vertices.size);links.push([])}return vertices.get(key)};
 for(const q of part.primitives){
  for(let i=0;i<q.positions.length;i++)assert.ok(Number.isFinite(q.positions[i]),part.key+': nonfinite position');
  for(let i=0;i<q.normals.length;i+=3){const err=Math.abs(Math.hypot(...q.normals.subarray(i,i+3))-1);assert.ok(Number.isFinite(err)&&err<=1e-6,part.key+': nonunit normal');maxUnitError=Math.max(maxUnitError,err);normalCount++}
  for(let i=0;i<q.indices.length;i+=3){const points=[0,1,2].map(j=>Array.from(q.positions.subarray(q.indices[i+j]*3,q.indices[i+j]*3+3))),[a,b,c]=points;
   const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]),cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
   let exact=null;if(cross.every(v=>v===0)){exact=exactCross(a,b,c);fallbacks++;assert.ok(exact.some(v=>v!==0n),part.key+': zero-area triangle '+i/3)}
   for(let j=0;j<3;j++){const n=Array.from(q.normals.subarray(q.indices[i+j]*3,q.indices[i+j]*3+3)),d=cross.reduce((s,v,k)=>s+v*n[k],0);minFacingDot=Math.min(minFacingDot,d);if(!(d>0)){exact??=exactCross(a,b,c);assert.ok(exact.reduce((s,v,k)=>s+v*exactInteger(n[k]),0n)>0n,part.key+': reversed normal '+i/3)}}
   const vi=points.map(id);assert.equal(new Set(vi).size,3,part.key+': collapsed coordinate triangle');triangles.push(vi);
   for(let j=0;j<3;j++){const v=vi[j],w=vi[(j+1)%3],edge=v<w?v+':'+w:w+':'+v;let e=edges.get(edge);if(!e)edges.set(edge,e={count:0,balance:0});e.count++;e.balance+=v<w?1:-1;links[v].push([w,vi[(j+2)%3]])}
   const term=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]),y=term-compensation,t=volume+y;compensation=(t-volume)-y;volume=t;
  }
 }
 assert.ok(triangles.length);for(const e of edges.values()){assert.equal(e.count,2,part.key+': open/nonmanifold edge');assert.equal(e.balance,0,part.key+': same-directed edge')}
 for(const pairs of links){const graph=new Map();for(const[a,b]of pairs){if(!graph.has(a))graph.set(a,[]);if(!graph.has(b))graph.set(b,[]);graph.get(a).push(b);graph.get(b).push(a)}for(const n of graph.values())assert.equal(n.length,2,part.key+': nonmanifold vertex link');const visited=new Set(),todo=[graph.keys().next().value];while(todo.length){const a=todo.pop();if(visited.has(a))continue;visited.add(a);todo.push(...graph.get(a))}assert.equal(visited.size,graph.size,part.key+': pinched/disconnected vertex link')}
 assert.ok(Number.isFinite(volume)&&volume>0,part.key+': nonpositive oriented enclosed-volume diagnostic');
 return {key:part.key,drawPrimitives:part.primitives.length,triangles:triangles.length,coordinateVertices:vertices.size,edges:edges.size,euler:vertices.size-edges.size+triangles.length,boundaryEdges:0,nonTwoEdges:0,sameDirectedEdges:0,badVertexLinks:0,normalCount,maxUnitError,minFacingDot,exactCrossFallbacks:fallbacks,signedVolumeM3:volume/6};
}
const metaPose=p=>({source:p.source,rigid_rotation:p.rigid_rotation,rigid_translation_mm:p.rigid_translation_mm,motion:p.motion,color:p.color,appearance_role:p.appearance_role??null});
export function sourceWitness(glbBytes,metaBytes){
 assertPinned(glbBytes,ORIGINAL_MODEL_SHA,'Original public reference GLB');const metadata=JSON.parse(metaBytes),parts=physicalParts(parseGLB(glbBytes),metadata);
 const hardware=[],printed=[];
 for(const p of parts.values()){const record={key:p.key,metadata:metaPose(p.record),primitives:p.primitives.map(q=>q.signature)};if(p.record.appearance_role==='base')printed.push({key:p.key,metadata:record.metadata,matrix:p.primitives[0].matrix});else hardware.push(record)}
 assert.equal(hardware.length,26);assert.equal(printed.length,2);
 return {schema:'fox-ab-fan-original-public-source-witness-v1',originalReferenceModelSha256:ORIGINAL_MODEL_SHA,originalReferenceMetadataSha256:sha(metaBytes),originalAuthor3MFSha256:'34ad0f68b8acef21254ffa81183200d9dede73164953ba0adbce2fb27322d6e3',hardware,printed,scope:'Original FOX V1 public3MF and separately credited Voron reference hardware. Exact exported array/material/pose witnesses; not original analytic bracket CAD, manufacturer SKU or native-solid fit evidence.'};
}
export function compareHardware(parts,witness){
 assert.equal(witness.hardware.length,26);assert.equal(witness.printed.length,2);assert.equal(new Set([...witness.hardware,...witness.printed].map(p=>p.key)).size,28);assert.equal(parts.size,28);
 for(const p of witness.hardware){const actual=parts.get(p.key);assert.ok(actual,'Missing source hardware '+p.key);assert.equal(canonical(metaPose(actual.record)),canonical(p.metadata),p.key+': hardware source/pose/role changed');assert.equal(canonical(actual.primitives.map(q=>q.signature)),canonical(p.primitives),p.key+': hardware arrays/indices/normals/materials/pose changed')}
 for(const p of witness.printed){const actual=parts.get(p.key);assert.ok(actual);assert.equal(actual.record.appearance_role,'base');assert.equal(canonical(metaPose(actual.record)),canonical(p.metadata),p.key+': printed source/pose/role changed');for(const q of actual.primitives)assert.equal(canonical(q.matrix),canonical(p.matrix),p.key+': printed source pose changed')}
}
export function auditFoxBytes(modelBytes,metaBytes,witnessBytes){
 assertPinned(modelBytes,FOX_MODEL_SHA,'Current v30 GLB');assertPinned(metaBytes,FOX_METADATA_SHA,'Current v30 metadata');assertPinned(witnessBytes,WITNESS_SHA,'Original source witness');
 const metadata=JSON.parse(metaBytes),witness=JSON.parse(witnessBytes);assert.equal(metadata.id,FOX_ID);assert.equal(metadata.physical_parts,28);assert.equal(metadata.draw_meshes,30);assert.equal(metadata.native_solid_fit,false);assert.equal(metadata.whole_machine_fit,false);
 const parts=physicalParts(parseGLB(modelBytes),metadata);compareHardware(parts,witness);const topology=[...parts.values()].map(inspectPhysicalPart);
 const printed=[...parts.values()].filter(p=>p.record.appearance_role==='base'),hardware=[...parts.values()].filter(p=>p.record.appearance_role===null||p.record.appearance_role===undefined);assert.equal(printed.length,2);assert.equal(hardware.length,26);
 for(const p of hardware)for(const q of p.primitives)assert.equal(q.material.name,'purchased');for(const p of printed)for(const q of p.primitives)assert.equal(q.material.name,'base');
 assert.equal(topology.reduce((n,p)=>n+p.drawPrimitives,0),30);
 return {status:'PASS_ACTUAL_FOX_V30_28_CLOSED_ORIENTED_PARTS_AND26_SOURCE_HARDWARE',modelSha256:sha(modelBytes),metadataSha256:sha(metaBytes),witnessSha256:sha(witnessBytes),physicalParts:28,printedParts:2,unchangedSourceHardware:26,drawPrimitives:30,topology,paletteInventory:{printedRole:'base',printedPartKeys:printed.map(p=>p.key),printedDrawPrimitives:printed.reduce((n,p)=>n+p.primitives.length,0),purchasedParts:26,hardwareMaterialsAndOriginalColorsExact:true},scope:'Actual exact v30 GLB/metadata, local Float32 finite positive triangles, unit/facing normals, literal physical IDs, exact coordinate directed-edge closure and vertex links, source hardware packed arrays/indices/materials/rigid transforms. No geometry edits, approximate welding, native-solid/thermal/electrical/whole-machine clearance certificate.',controllerABAMotion:'Separate production-controller gate; not simulated or relabeled by this mesh auditor.',native:0};
}
async function main(){
 const [siteArg,reportArg]=process.argv.slice(2);assert.ok(siteArg&&reportArg,'Usage: audit_fox_ab_fan_assets.mjs <assembled-site> <report>');const site=path.resolve(siteArg),reportPath=path.resolve(reportArg);assert.ok(!fs.existsSync(reportPath),'Preserve prior report');
 const witness=fileURLToPath(new URL('../docs/FOX_AB_FAN_SOURCE_WITNESSES_V30.json',import.meta.url));
 const result={schema:'actual-fox-ab-fan-export-audit-v2',status:'RUNNING',inputs:[],findings:[]};
 try{
  const model=readDeliveryAsset(site,'modules/'+FOX_ID+'.glb',FOX_DELIVERY_PINS.model,result.inputs),metadata=readDeliveryAsset(site,'modules/'+FOX_ID+'.json',FOX_DELIVERY_PINS.metadata,result.inputs),witnessBytes=readExactFile(witness,58300);
  result.inputs.push({path:'../docs/FOX_AB_FAN_SOURCE_WITNESSES_V30.json',bytes:witnessBytes.length,sha256:sha(witnessBytes)});
  Object.assign(result,auditFoxBytes(model.bytes,metadata.bytes,witnessBytes),{delivery:{model:{selectedPath:model.selectedPath,encoding:model.encoding,representations:model.representations},metadata:{selectedPath:metadata.selectedPath,encoding:metadata.encoding,representations:metadata.representations},allPresentRepresentationsPinned:true,boundedInflation:true}});
 }
 catch(e){result.status='FAIL_ACTUAL_FOX_AB_FAN_EXPORT';result.findings.push({message:String(e.message),stack:e.stack});process.exitCode=1}
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,physicalParts:result.physicalParts,unchangedSourceHardware:result.unchangedSourceHardware,report:reportPath,sha256:sha(fs.readFileSync(reportPath)),findings:result.findings}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();

// Offline V4 actual-asset gate. Build contract: pass the exact four-decoded-GLB
// --equipment-inputs map produced by prepare_layout_equipment_inputs.mjs. Gzip
// siblings MUST be in the same cache as each mapped GLB. Preview JSON/gzip come
// from that common prepared directory, or explicit --prepared-dir for offline
// review. Public metadata, plate source receipt and full license ALWAYS come
// from --site; the plate-specific AGPL attribution does not cover all exteriors.
// No body is copied into site, no source/original search, and no live fetch.
// Run sequentially with --max-old-space-size=384 --max-semi-space-size=4
// --v8-pool-size=1, UV_THREADPOOL_SIZE=1, <=2 CPU affinity and an external timeout.
// Pure JS/Three buffer inspection only: no OCP, native CAD, WASM or mesh decoder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PREFIX='layout/assets/equipment/u1-exterior/';
export const DEFINITIONS=Object.freeze([
 ['u1Standalone','snapmaker_u1_layout_reference','standalone','U1_exterior_standalone_loaded.glb',4,4,2],
 ['u1Docked','snapmaker_u1_layout_reference','docked','U1_exterior_docked.glb',0,0,0],
 ['stationEmpty','biqu_pop_station_mini_layout_reference','empty','PopStationMini_empty.glb',0,0,0],
 ['stationLoaded','biqu_pop_station_mini_layout_reference','loaded','PopStationMini_loaded.glb',4,4,2]
].map(Object.freeze));
const METADATA=['MOUNT_SPEC.json','POPSTATION_PUBLIC_MANUAL_RECEIPTS.json',
 'POPSTATION_PUBLIC_MOUNT_RECEIPTS.json','U1_BED_OUTLINE.json',
 'U1_exterior_notices.json','U1_preview_geometry_index.json','U1_BED_SOURCE_RECEIPT.json'];
const LICENSE='Snapmaker_OrcaSlicer_LICENSE.txt';
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const close=(a,b,label,tolerance=1e-7)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} versus ${b}`);
export const arrayBytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
export const arrayReceipt=a=>({bytes:a.byteLength,sha256:sha(arrayBytes(a))});
// Canonical pins cover only the preserved source/contour contract. Removed
// internal notes, render references and unrelated SVG metadata are not evidence.
const BED_FIELD_PINS=Object.freeze({
 contours:'4dc76012a0a2355b67415249dc53b76431833a373eab62ecaa5f446dd8e4d8e1',
 mesh:'0839e94694519bc3220310facced8972e1cdf86a1c25b7e7cac3bf2241c2bb86',
 coordinate_contract:'a335e46c729e12e8b07d060a0790b0a28fd7e30495466fbc337deb2df25e2a2b',
 hole_bounds:'e56508a86a68da8a0d673991f9ece225f71a398299866c9560cdf21ebfbaa69f',
 source_asset:'429b9c888cf75b169c5c22b374958031d5f1545e451e69a76578a0e96e385fea',
 repository_license:'4081d03120932c0470c7044be968830128fcf93ca3569527012360817874d2d5'
});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function validateBedOutline(bed){
 assert.equal(bed.schema,'snapmaker-u1-official-slicer-bed-outline-v1');
 assert.equal(bed.source_repository,'https://github.com/Snapmaker/OrcaSlicer');
 assert.equal(bed.source_commit,'229efa64b8ed6093aa2d99ab1fb422182a05a63e');
 assert.equal(bed.source_asset.path,'resources/profiles/Snapmaker/Snapmaker U1_bed.stl');
 assert.equal(bed.source_asset.bytes,17284);
 assert.equal(bed.source_asset.sha256,'954c6d156ce3b08ff5b1cddcdf37596c3e8121cabeb18a450a206cdfb61dda68');
 assert.equal(bed.repository_license.spdx,'AGPL-3.0');
 for(const field of ['notes','render_reference','svg_interpretation','source_svg'])
  assert.equal(Object.hasOwn(bed,field),false,'Internal/non-geometric field in public bed outline: '+field);
 const fieldHashes={};
 for(const [field,pin]of Object.entries(BED_FIELD_PINS)){
  // Pin geometric coordinate fields, not removed front_status review prose.
  const value=field==='coordinate_contract'?Object.fromEntries(['up','front_by_tab_visual_match','back_geometry','units'].map(key=>[key,bed[field][key]])):bed[field];
  fieldHashes[field]=sha(Buffer.from(JSON.stringify(canonical(value))));
  assert.equal(fieldHashes[field],pin,'Prepared source-backed bed field changed: '+field);
 }
 return fieldHashes;
}

export function validateBedAttribution({bed,receipt,license,notices,fieldHashes,rows}){
 assert.equal(bed.source_attribution,'U1_BED_SOURCE_RECEIPT.json');assert.equal(bed.license_file,LICENSE);
 assert.equal(receipt.schema,'3dprig-u1-bed-reference-attribution-v1');
 assert.equal(receipt.component,'Fixed PEI build plate');assert.equal(receipt.manufacturerCAD,false);
 assert.equal(receipt.sourceRepository,bed.source_repository);assert.equal(receipt.sourceCommit,bed.source_commit);
 assert.deepEqual(receipt.sourceAsset,bed.source_asset,'Plate receipt/outline source identity');
 assert.equal(receipt.repositoryLicense.recordedSpdx,bed.repository_license.spdx);
 assert.equal(receipt.repositoryLicense.file,LICENSE);assert.equal(receipt.repositoryLicense.bytes,34520);
 assert.equal(receipt.repositoryLicense.sha256,bed.repository_license.sha256);
 assert.equal(receipt.repositoryLicense.sha256,'57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6');
 assert.equal(license.length,receipt.repositoryLicense.bytes,'Complete public plate license length');
 assert.equal(sha(license),receipt.repositoryLicense.sha256,'Complete public plate license SHA256');
 assert.equal(receipt.repositoryLicense.scope,bed.repository_license.interpretation);
 assert.equal(receipt.scope,'This record identifies the upstream input used for the fixed plate component and preserves its repository-level notice. It does not assign that licence to all unrelated authored model parts or determine combined-work licensing obligations.','Plate-specific attribution scope');
 assert.equal(notices.notices.length,1);const notice=notices.notices[0];
 assert.equal(notice.name,LICENSE);assert.equal(notice.sha256,receipt.repositoryLicense.sha256);
 assert.deepEqual(Buffer.from(notice.text,'utf8'),license,'Embedded notice and full public plate license');
 assert.equal(receipt.models.length,2);const variants=new Set();
 for(const model of receipt.models){
  assert.ok(!variants.has(model.variant),'Duplicate plate attribution variant');variants.add(model.variant);
  const row=rows.find(row=>row.id===DEFINITIONS[0][1]&&row.equipmentVariant===model.variant);assert.ok(row,'Unregistered plate attribution consumer');
  assert.deepEqual({path:model.path,bytes:model.bytes,sha256:model.sha256},{path:row.model.path,bytes:row.model.bytes,sha256:row.model.sha256},'Plate receipt/model identity');
  assert.deepEqual(model.referencedComponent,{nodeIndex:28,nodeName:'fixed_bed / PEI build plate - build plate',meshIndex:28},'Plate source occurrence identity');
 }
 assert.deepEqual([...variants].sort(),['docked','standalone']);
 return {component:receipt.component,scope:receipt.scope,manufacturerCAD:false,
  source:{repository:receipt.sourceRepository,commit:receipt.sourceCommit,...receipt.sourceAsset},
  license:{path:PREFIX+LICENSE,spdx:receipt.repositoryLicense.recordedSpdx,bytes:license.length,sha256:sha(license)},
  receiptPath:PREFIX+'U1_BED_SOURCE_RECEIPT.json',outlineFieldHashes:fieldHashes,
  consumers:receipt.models.map(model=>({variant:model.variant,path:model.path,sha256:model.sha256,...model.referencedComponent}))};
}
export function validatePlateOccurrence(row,actual,prepared){
 if(row.id!==DEFINITIONS[0][1])return null;
 const model=prepared.metadata['U1_BED_SOURCE_RECEIPT.json'].models.find(model=>model.variant===row.equipmentVariant);
 assert.ok(model,'Plate attribution consumer missing');const {nodeIndex,nodeName,meshIndex}=model.referencedComponent;
 const node=actual.doc.nodes[nodeIndex];assert.ok(node,'Referenced plate node missing');
 assert.equal(node.name,nodeName,'Referenced plate node identity');assert.equal(node.mesh,meshIndex,'Referenced plate mesh identity');
 assert.equal(node.extras.groupId,'fixed_bed');assert.equal(node.extras.groupKind,'fixed_bed');
 const mesh=actual.meshes.get(nodeName);assert.ok(mesh,'Referenced plate geometry missing');
 assert.equal(actual.doc.meshes[meshIndex].primitives.length,1);
 assert.equal(mesh.indices.length/3,prepared.metadata['U1_BED_OUTLINE.json'].mesh.triangles,'Source-backed fixed plate triangle count');
 return {nodeIndex,nodeName,meshIndex,triangles:mesh.indices.length/3,positionHash:mesh.positionHash,normalHash:mesh.normalHash,indexHash:mesh.indexHash,
  sourceContourSHA256:prepared.plateAttribution.outlineFieldHashes.contours,scope:'Pinned prepared fixed-plate occurrence and source contour receipt; no original STL or native-solid inspection'};
}

export function options(argv=process.argv.slice(2)) {
 const out={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  assert.ok(['--site','--equipment-inputs','--prepared-dir','--report'].includes(key),'Unknown audit option: '+key);
  assert.ok(value&&!value.startsWith('--'),'Missing '+key+' value');
  assert.ok(!Object.hasOwn(out,key),'Duplicate audit option: '+key);out[key]=value;
 }
 return out;
}
export function sourceHashes(site,names) {
 return Object.fromEntries(names.map(name=>[name,sha(fs.readFileSync(path.join(site,name)))]));
}
export function limits() {
 return {workerCount:1,nativeJobs:0,wasmJobs:0,liveNetworkRequests:0,
  heapLimitBytes:v8.getHeapStatistics().heap_size_limit,memoryUsage:process.memoryUsage()};
}
function regularFile(file,bytes) {
 assert.ok(fs.existsSync(file),'Actual equipment body missing: '+file);
 const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Equipment cache input is not a regular file: '+file);
 assert.equal(stat.size,bytes,'Actual body size: '+file);return stat;
}

/** Shared strict transport boundary for BOTH executable gates. No I/O on import. */
export async function createAuditContext(opts) {
 const site=path.resolve(opts['--site']||fileURLToPath(new URL('../site/',import.meta.url)));
 const equipment=await import(pathToFileURL(path.join(site,'layout/layout-equipment.mjs')));
 const transport=await import(pathToFileURL(path.join(site,'layout/layout-equipment-transfer.mjs')));
 const inputMapPath=opts['--equipment-inputs'];
 const inputMap=inputMapPath?JSON.parse(fs.readFileSync(path.resolve(inputMapPath),'utf8')):{files:{}};
 assert.ok(inputMap&&typeof inputMap==='object'&&!Array.isArray(inputMap)&&
  Object.keys(inputMap).length===1&&inputMap.files&&typeof inputMap.files==='object'&&!Array.isArray(inputMap.files),
  'Equipment inputs must be an exact {files:{modelPath:absoluteCachePath}} map');
 const inputFiles=inputMap.files,auditInputFiles={},rows=DEFINITIONS.map(([,id,variant])=>{
  const row=equipment.getLayoutEquipment(id,variant);assert.ok(row,'Equipment registration missing: '+id+'/'+variant);return row;
 });
 const registeredPaths=new Set(rows.map(row=>row.model.path));
 assert.equal(registeredPaths.size,4,'Expected four distinct equipment registrations');
 for(const [name,file]of Object.entries(inputFiles)){
  assert.ok(registeredPaths.has(name),'Unregistered equipment audit input: '+name);
  assert.ok(typeof file==='string'&&path.isAbsolute(file),'Equipment cache path must be absolute: '+name);
 }
 for(const name of registeredPaths)assert.ok(Object.hasOwn(inputFiles,name),'Hosted equipment requires an exact input mapping: '+name);
 assert.equal(Object.keys(inputFiles).length,4,'Equipment inputs require exactly four decoded GLBs');
 const directories=new Set(rows.map(row=>path.dirname(path.resolve(inputFiles[row.model.path]))));
 assert.equal(directories.size,1,'Decoded equipment GLBs must share one deterministic prepared cache directory');
 const modelDir=[...directories][0];
 for(const [i,row]of rows.entries()){
  assert.equal(row.model.path,PREFIX+DEFINITIONS[i][3],'Unexpected final equipment registration');
  assert.equal(path.basename(inputFiles[row.model.path]),path.basename(row.model.path),'Mapped decoded GLB must retain its prepared basename');
  const wire=transport.equipmentTransferIdentity(row.model);
  assert.equal(wire.encoding,'gzip');assert.equal(wire.path,row.model.path+'.gz');
  assert.equal(wire.baseURL,transport.LAYOUT_EQUIPMENT_TRANSFER_BASE);
 }
 assert.ok(!opts['--prepared-dir']||path.isAbsolute(opts['--prepared-dir']),'prepared-dir must be absolute');
 const preparedDir=opts['--prepared-dir']?path.resolve(opts['--prepared-dir']):modelDir;
 async function readPair(pin,{preview=false}={}) {
  const transfer=preview?transport.equipmentPreviewGeometryTransferIdentity(pin):transport.equipmentTransferIdentity(pin);
  const decodedFile=preview?path.join(preparedDir,path.basename(pin.path)):path.resolve(inputFiles[pin.path]);
  const encodedFile=preview?path.join(preparedDir,path.basename(transfer.path)):decodedFile+'.gz';
  regularFile(decodedFile,pin.bytes);regularFile(encodedFile,transfer.bytes);
  const raw=fs.readFileSync(decodedFile);await transport.verifyEquipmentModelBytes(raw,pin);
  const fetchImpl=async(url,request)=>{
   assert.equal(url.href,new URL(transfer.path,transfer.baseURL).href,'Unexpected equipment audit request');
   assert.equal(request.redirect,'error');assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');
   return {ok:true,status:200,url:url.href,redirected:false,
    headers:new Headers({'content-length':String(transfer.bytes)}),
    body:Readable.toWeb(fs.createReadStream(encodedFile,{highWaterMark:65536}))};
  };
  // Authenticate exact wire bytes, bounded inflation and decoded bytes through
  // production transport. Compare saved raw independently; neither is a fallback.
  const decoded=preview?await transport.downloadEquipmentPreviewGeometry(pin,{fetchImpl}):Buffer.from(await transport.downloadEquipmentModel(pin,{fetchImpl}));
  if(preview)assert.deepEqual(decoded,JSON.parse(raw.toString('utf8')),'Prepared preview differs from decoded transport');
  else assert.deepEqual(decoded,raw,'Raw cache differs from decoded transport');
  auditInputFiles[pin.path]={file:decodedFile,bytes:pin.bytes,sha256:pin.sha256};
  auditInputFiles[transfer.path]={file:encodedFile,bytes:transfer.bytes,sha256:transfer.sha256};
  return preview?decoded:raw;
 }
 return {site,equipment,transport,rows,auditInputFiles,modelDir,preparedDir,
  readActual:row=>readPair(row.model),
  async readPrepared(){
   const metadata=Object.fromEntries(METADATA.map(name=>[name,JSON.parse(fs.readFileSync(path.join(site,PREFIX,name),'utf8'))]));
   const descriptor=metadata['U1_preview_geometry_index.json'];
   assert.deepEqual(descriptor,equipment.LAYOUT_EQUIPMENT_PREVIEW,'Tracked geometry index differs from production catalog');
   assert.deepEqual([descriptor.kind,descriptor.units,descriptor.up,descriptor.front,descriptor.rootPivotM],['layout-preview-geometry','m','+Y','+Z',[0,0,0]]);
   const pin=equipment.LAYOUT_EQUIPMENT_PREVIEW_MODEL;
   assert.equal(pin.path,PREFIX+'U1_preview_geometry.json');
   assert.deepEqual({bytes:pin.bytes,sha256:pin.sha256},descriptor.body);
   assert.deepEqual({bytes:pin.transfer.bytes,sha256:pin.transfer.sha256},descriptor.gzip);
   const data=await readPair(pin,{preview:true});
   const cache=equipment.createLayoutEquipmentPreviewCache();await cache.install(data);
   assert.deepEqual(Object.keys(data).sort(),Object.keys(descriptor.geometry).sort());
   assert.equal(Object.keys(data).length,22,'Final prepared geometry count');
   const arrays=new Map(),triangleFindings=[];let previewTriangles=0;
   for(const [id,pin]of Object.entries(descriptor.geometry)){
    const d=cache.getGeometry(id),positions=new Float32Array(d.positionsM),normals=new Float32Array(d.normals),indices=new Uint32Array(d.indices);
    assert.deepEqual(arrayReceipt(positions),pin.positionsF32,id+' complete positions');
    assert.deepEqual(arrayReceipt(normals),pin.normalsF32,id+' complete normals');
    assert.deepEqual(arrayReceipt(indices),pin.indicesU32,id+' complete indices');
    arrays.set(id,{positions,normals,indices});
    let degenerate=0,opposedNormals=0,firstDegenerate=null,firstOpposed=null;
    for(let i=0;i<indices.length;i+=3){
     const x=indices[i]*3,y=indices[i+1]*3,z=indices[i+2]*3,
      bx=positions[y]-positions[x],by=positions[y+1]-positions[x+1],bz=positions[y+2]-positions[x+2],
      cx=positions[z]-positions[x],cy=positions[z+1]-positions[x+1],cz=positions[z+2]-positions[x+2],cross=[by*cz-bz*cy,bz*cx-bx*cz,bx*cy-by*cx];
     if(Math.hypot(...cross)===0){degenerate++;firstDegenerate??=i/3;}
     if(cross.reduce((sum,v,k)=>sum+v*(normals[x+k]+normals[y+k]+normals[z+k]),0)<=0){opposedNormals++;firstOpposed??=i/3;}
    }
    previewTriangles+=indices.length/3;
    if(degenerate||opposedNormals)triangleFindings.push({code:'PREPARED_PREVIEW_TRIANGLES',geometryId:id,degenerate,opposedNormals,firstDegenerate,firstOpposed});
   }
   const mount=metadata['MOUNT_SPEC.json'];
   for(const row of rows.filter(row=>row.id===DEFINITIONS[2][1]))assert.deepEqual(row.mount,mount,'Tracked mount differs from production catalog');
   assert.deepEqual([mount.units,mount.frame.up,mount.frame.front,mount.frame.normal],['m','+Y','+Z',[0,1,0]]);
   assert.deepEqual(mount.mountPose.printerTranslationM,[0,mount.support.topYM,0]);
   assert.equal(mount.mountPose.recenterPrinterOnVariantChange,false);
   const bed=metadata['U1_BED_OUTLINE.json'],notices=metadata['U1_exterior_notices.json'];
   const fieldHashes=validateBedOutline(bed),receipt=metadata['U1_BED_SOURCE_RECEIPT.json'];
   const license=fs.readFileSync(path.join(site,PREFIX,LICENSE));
   const plateAttribution=validateBedAttribution({bed,receipt,license,notices,fieldHashes,rows});
   for(const name of ['POPSTATION_PUBLIC_MOUNT_RECEIPTS.json','POPSTATION_PUBLIC_MANUAL_RECEIPTS.json']){
    assert.ok(Array.isArray(metadata[name])&&metadata[name].length>0,'Missing public source receipts');
    for(const receipt of metadata[name]){assert.match(receipt.sha256,/^[a-f0-9]{64}$/);assert.ok(receipt.bytes>0);assert.equal(receipt.sourcePage??receipt.source_page,mount.sources[0]);}
   }
   return {metadata,descriptor,arrays,data,mount,plateAttribution,triangleFindings,previewTriangles,sourceInputs:sourceHashes(site,[...METADATA,LICENSE].map(name=>PREFIX+name)),arrayReceipts:arrays.size*3};
  }};
}

function readAccessor(doc,binary,index,integer=false) {
 assert.ok(Number.isSafeInteger(index),'Missing accessor');const a=doc.accessors[index];assert.ok(a);
 const v=doc.bufferViews[a.bufferView],size=integer?1:3;
 assert.ok(v);assert.equal(v.buffer,0);assert.equal(a.sparse,undefined);assert.notEqual(a.normalized,true);
 const componentBytes=integer?({5121:1,5123:2,5125:4})[a.componentType]:4;
 assert.equal(a.type,integer?'SCALAR':'VEC3');
 if(integer)assert.ok(componentBytes,'Unsigned index accessor required');else assert.equal(a.componentType,5126);
 assert.ok(Number.isSafeInteger(a.count)&&a.count>0);
 const offset=a.byteOffset??0,start=(v.byteOffset??0)+offset,stride=v.byteStride??size*componentBytes;
 assert.ok([start,stride,v.byteLength,offset].every(Number.isSafeInteger)&&start>=0&&offset>=0);
 assert.ok(stride>=size*componentBytes&&stride%componentBytes===0);
 assert.ok(start+(a.count-1)*stride+size*componentBytes<=binary.length);
 assert.ok(offset+(a.count-1)*stride+size*componentBytes<=v.byteLength);
 const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),values=integer?new Uint32Array(a.count):new Float32Array(a.count*3);
 for(let n=0;n<a.count;n++)for(let c=0;c<size;c++){
  const at=start+n*stride+c*componentBytes;
  values[n*size+c]=integer?(componentBytes===1?data.getUint8(at):componentBytes===2?data.getUint16(at,true):data.getUint32(at,true)):data.getFloat32(at,true);
 }
 return values;
}
export function inspectGLB(bytes,row) {
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const jsonLength=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);assert.equal(jsonLength%4,0);
 const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binStart=28+jsonLength,binary=bytes.subarray(binStart);
 assert.equal(bytes.readUInt32LE(20+jsonLength),binary.length);assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942);
 assert.equal(doc.asset.version,'2.0');assert.equal(doc.buffers.length,1);assert.equal(doc.buffers[0].uri,undefined);
 assert.ok(doc.buffers[0].byteLength<=binary.length&&binary.length-doc.buffers[0].byteLength<=3);
 assert.equal(doc.images?.length||0,0,'Reference photographs must not be model textures');assert.equal(doc.textures?.length||0,0);
 assert.equal(doc.extensionsRequired?.length||0,0,'No native/WASM or compressed-geometry decoder allowed');
 assert.equal(doc.extensionsUsed?.length||0,0,'Unreviewed GLB extension');
 const isU1=row.id===DEFINITIONS[0][1],extras=doc.asset.extras;
 assert.deepEqual([extras.units,extras.up,extras.front],['m','+Y','+Z']);assert.equal(extras.manufacturerCAD??false,false);
 assert.equal(row.manufacturerCAD,false);
 if(isU1){
  assert.equal(extras.kind,'layout-exterior-reference');
  for(const flag of ['publicSourcesOnly','privateSourceDerived','purchasedSourceDerived']){
   assert.equal(Object.hasOwn(row,flag),false,'Obsolete U1 catalog provenance flag');assert.equal(Object.hasOwn(extras,flag),false,'Obsolete U1 GLB provenance flag');
  }
 }else{assert.equal(row.publicSourcesOnly,true);assert.equal(row.purchasedSourceDerived,false);assert.equal(extras.publicSourcesOnly,true);assert.equal(extras.purchasedSourceDerived,false);}
 assert.ok(doc.materials.length>0);
 for(const m of doc.materials){
  const p=m.pbrMetallicRoughness;assert.ok(p);
  for(const v of [...p.baseColorFactor,p.metallicFactor,p.roughnessFactor])assert.ok(Number.isFinite(v)&&v>=0&&v<=1,'Invalid actual material');
  assert.ok(['OPAQUE','BLEND'].includes(m.alphaMode??'OPAQUE'));
 }
 assert.ok(doc.materials.some(m=>m.alphaMode==='BLEND'&&m.pbrMetallicRoughness.baseColorFactor[3]>0&&m.pbrMetallicRoughness.baseColorFactor[3]<1),'Transparent panel missing');
 const reached=new Set(),meshRefs=new Map();
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 function visit(i){
  assert.ok(Number.isInteger(i)&&doc.nodes[i]);assert.ok(!reached.has(i),'Duplicate scene occurrence or cycle');reached.add(i);
  const node=doc.nodes[i];assert.deepEqual(node.matrix??identity,identity,'Authored matrix moved common datum');
  assert.deepEqual(node.translation??[0,0,0],[0,0,0]);assert.deepEqual(node.rotation??[0,0,0,1],[0,0,0,1]);assert.deepEqual(node.scale??[1,1,1],[1,1,1]);
  if(node.mesh!==undefined){assert.ok(doc.meshes[node.mesh]);meshRefs.set(node.mesh,(meshRefs.get(node.mesh)||0)+1);}
  for(const child of node.children??[])visit(child);
 }
 assert.equal(doc.scenes.length,1);for(const i of doc.scenes[doc.scene??0].nodes)visit(i);
 assert.equal(reached.size,doc.nodes.length,'Orphan actual GLB nodes');assert.equal(meshRefs.size,doc.meshes.length,'Orphan actual GLB meshes');
 for(const n of meshRefs.values())assert.equal(n,1,'Duplicate actual mesh occurrence');
 const kinds=new Map(),meshes=new Map(),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 let triangles=0,maxNormalError=0,indexedPrimitives=0,nonindexedPrimitives=0;
 for(const node of doc.nodes){
  if(node.mesh===undefined)continue;
  assert.ok(node.extras.groupId&&node.extras.groupKind);
  if(isU1){for(const flag of ['publicSourcesOnly','privateSourceDerived','purchasedSourceDerived'])assert.equal(Object.hasOwn(node.extras,flag),false,'Obsolete U1 leaf provenance');}
  else assert.equal(node.extras.publicSourcesOnly,true);
  assert.ok(!/parked[_ ]tool|moving[_ ]tool|nozzle|gantry|PTFE|upper[_ ]guides/i.test(isU1?node.name:''),'Undeclared U1 internal mechanism: '+node.name);
  const kind=node.extras.groupKind;if(!kinds.has(kind))kinds.set(kind,new Set());kinds.get(kind).add(node.extras.groupId);
  for(const [pi,primitive]of doc.meshes[node.mesh].primitives.entries()){
   assert.equal(primitive.mode??4,4);assert.equal(primitive.targets,undefined);assert.equal(primitive.extensions,undefined);
   assert.deepEqual(Object.keys(primitive.attributes).sort(),['NORMAL','POSITION'],'Uninspected GLB attributes');
   assert.ok(Number.isInteger(primitive.material)&&doc.materials[primitive.material]);
   const positions=readAccessor(doc,binary,primitive.attributes.POSITION),normals=readAccessor(doc,binary,primitive.attributes.NORMAL);
   assert.equal(positions.length,normals.length);
   const indexed=primitive.indices!==undefined,indices=indexed?readAccessor(doc,binary,primitive.indices,true):Uint32Array.from({length:positions.length/3},(_,i)=>i);
   indexed?indexedPrimitives++:nonindexedPrimitives++;assert.equal(indices.length%3,0);
   for(const i of indices)assert.ok(i<positions.length/3,'Index outside vertex buffer');
   const l=[Infinity,Infinity,Infinity],h=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<positions.length;i+=3){
    for(let j=0;j<3;j++){const v=positions[i+j];assert.ok(Number.isFinite(v));lo[j]=Math.min(lo[j],v);hi[j]=Math.max(hi[j],v);l[j]=Math.min(l[j],v);h[j]=Math.max(h[j],v);}
    const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);assert.ok(Number.isFinite(length));maxNormalError=Math.max(maxNormalError,Math.abs(length-1));
   }
   for(let i=0;i<indices.length;i+=3){
    const x=indices[i]*3,y=indices[i+1]*3,z=indices[i+2]*3,a=positions,
     bx=a[y]-a[x],by=a[y+1]-a[x+1],bz=a[y+2]-a[x+2],cx=a[z]-a[x],cy=a[z+1]-a[x+1],cz=a[z+2]-a[x+2],cross=[by*cz-bz*cy,bz*cx-bx*cz,bx*cy-by*cx];
    assert.ok(Math.hypot(...cross)>0,node.name+' zero-area triangle');
    assert.ok(cross.reduce((sum,v,k)=>sum+v*(normals[x+k]+normals[y+k]+normals[z+k]),0)>0,node.name+' triangle/normal orientation');
   }
   const name=pi?node.name+'#'+pi:node.name;assert.ok(!meshes.has(name),'Duplicate mesh name: '+name);
   triangles+=indices.length/3;meshes.set(name,{name,groupId:node.extras.groupId,kind,positions,normals,indices,indexed,
    positionHash:sha(arrayBytes(positions)),normalHash:sha(arrayBytes(normals)),indexHash:sha(arrayBytes(indices)),bounds:[l,h],material:doc.materials[primitive.material]});
  }
 }
 assert.ok(maxNormalError<2e-5,'Non-unit actual GLB normals');close(lo[1],0,'Actual GLB floor');
 const dimensions={width:(hi[0]-lo[0])*1000,height:(hi[1]-lo[1])*1000,depth:(hi[2]-lo[2])*1000};
 for(const axis of ['width','height','depth'])close(dimensions[axis],row.dimensionsMm[axis],row.id+'/'+row.equipmentVariant+' '+axis,.05);
 const definition=DEFINITIONS.find(([,id,variant])=>id===row.id&&variant===row.equipmentVariant);assert.ok(definition);
 for(const [kind,count]of [['spool',definition[4]],['holder',definition[5]],['feeder',definition[6]]])assert.equal(kinds.get(kind)?.size||0,count,definition[0]+' '+kind+' count');
 return {doc,meshes,kinds,result:{id:row.id,variant:row.equipmentVariant,path:row.model.path,sha256:sha(bytes),bytes:bytes.length,
  transfer:row.model.transfer,boundsM:[lo,hi],dimensionsMm:dimensions,triangles,indexedPrimitives,nonindexedPrimitives,
  meshCount:meshes.size,maxNormalError,groups:Object.fromEntries([...kinds].map(([k,v])=>[k,[...v].sort()]))}};
}

export function compareRepresentations(row,actual,prepared) {
 let occurrences=0;const used=new Set(),findings=[];
 for(const part of row.proxy.parts){
  assert.ok(part.centerM.length===3&&part.centerM.every(Number.isFinite));assert.ok(part.sizeM.length===3&&part.sizeM.every(v=>Number.isFinite(v)&&v>0));
  if(part.shape!=='mesh')continue;
  const mesh=actual.meshes.get(part.name),arrays=prepared.arrays.get(part.geometryId);assert.ok(mesh,'Preview source mesh missing: '+part.name);assert.ok(arrays,'Unregistered preview geometry: '+part.geometryId);
  assert.equal(mesh.groupId,part.groupId);assert.equal(mesh.kind,part.groupKind);
  for(const key of ['positions','normals','indices']){
   const actualReceipt=arrayReceipt(mesh[key]),previewReceipt=arrayReceipt(arrays[key]);
   if(actualReceipt.bytes!==previewReceipt.bytes||actualReceipt.sha256!==previewReceipt.sha256)
    findings.push({code:'PREVIEW_GLB_BUFFER_MISMATCH',id:row.id,variant:row.equipmentVariant,mesh:part.name,geometryId:part.geometryId,
     attribute:key,actualGLB:actualReceipt,preparedPreview:previewReceipt,
     actualVertices:mesh.positions.length/3,previewVertices:arrays.positions.length/3,
     actualTriangles:mesh.indices.length/3,previewTriangles:arrays.indices.length/3});
  }
  for(let i=0;i<3;i++)for(const [field,actualValue,previewValue]of [['centerM',(mesh.bounds[0][i]+mesh.bounds[1][i])/2,part.centerM[i]],['sizeM',mesh.bounds[1][i]-mesh.bounds[0][i],part.sizeM[i]]])
   if(Math.abs(actualValue-previewValue)>1e-7)findings.push({code:'PREVIEW_GLB_METADATA_MISMATCH',id:row.id,variant:row.equipmentVariant,
    mesh:part.name,geometryId:part.geometryId,field,axis:i,actualGLB:actualValue,preparedPreview:previewValue});
  used.add(part.geometryId);occurrences++;
 }
 return {occurrences,used,findings,equivalent:findings.length===0};
}
/** Execute the actual production mesh drawing closure without a GPU/DOM. The
 * preview is a declared simplified representation; exact source equivalence is
 * to its independently pinned prepared arrays, never an invented full-GLB LOD.
 */
export async function auditPreviewRenderer(context,prepared){
 const THREE=await import(pathToFileURL(path.join(context.site,'viewer/vendor-r180/three.module.js')));
 const {createEquipmentMeshCache}=await import(pathToFileURL(path.join(context.site,'layout/layout-equipment-mesh.mjs')));
 await context.equipment.installLayoutEquipmentPreviewGeometry(prepared.data);
 const source=fs.readFileSync(path.join(context.site,'layout/layout-renderer.mjs'),'utf8');
 const start=source.indexOf('  function previewPart('),end=source.indexOf('  function isPlan(',start);
 assert.ok(start>=0&&end>start,'Production preview drawing closure missing');
 const cache=createEquipmentMeshCache(THREE),materials=new Map(),ghost=new THREE.MeshBasicMaterial();
 const material=(color,opacity=1)=>{
  const key=color+':'+opacity;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,opacity,transparent:opacity<1}));return materials.get(key);
 };
 const draw=new Function('THREE','material','equipmentMeshCache',source.slice(start,end)+';return previewPart;')(THREE,material,cache);
 const geometries=new Set(),used=new Set();let occurrences=0,disposed=0;
 try{
  for(const [,id,variant]of DEFINITIONS){
   const row=context.equipment.getLayoutEquipment(id,variant);
   assert.equal(row.proxy.kind,id===DEFINITIONS[0][1]?'simplified-exterior-reference':'documented-exterior-planning-approximation');
   for(const part of row.proxy.parts.filter(p=>p.shape==='mesh')){
    const root=new THREE.Group(),mesh=draw(root,part),pin=prepared.descriptor.geometry[part.geometryId];assert.ok(pin);
    mesh.updateMatrixWorld(true);
    assert.deepEqual(mesh.matrixWorld.toArray(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],part.name+' preview common datum applied twice');
    assert.deepEqual(arrayReceipt(mesh.geometry.attributes.position.array),pin.positionsF32,part.name+' complete production preview positions');
    assert.deepEqual(arrayReceipt(mesh.geometry.attributes.normal.array),pin.normalsF32,part.name+' complete production preview normals');
    assert.deepEqual(arrayReceipt(mesh.geometry.index.array),pin.indicesU32,part.name+' complete production preview indices');
    assert.equal(mesh.material,material(part.color||'#465258',part.opacity??1));
    const ghostMesh=draw(root,part,ghost);assert.equal(ghostMesh.material,ghost);assert.equal(ghostMesh.geometry,mesh.geometry);
    assert.equal(mesh.geometry,cache.get(part));geometries.add(mesh.geometry);used.add(part.geometryId);occurrences++;
    root.clear();
   }
  }
  assert.deepEqual([...used].sort(),Object.keys(prepared.descriptor.geometry).sort());
  for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposed++);
  cache.dispose();cache.dispose();assert.equal(disposed,geometries.size);
  return {meshOccurrences:occurrences,geometries:used.size,arrayReceipts:used.size*3,rootPivotM:[0,0,0],exactSourceArrays:true,
   ghostMaterialOwnership:true,disposedGeometries:disposed,scope:'Production previewPart mesh branch and geometry cache without browser/GPU'};
 }finally{cache.dispose();for(const m of materials.values())m.dispose();ghost.dispose();}
}

export function compareLoadedToGLB(root,actual) {
 root.updateMatrixWorld(true);const found=new Set();
 root.traverse(node=>{
  if(!node.isMesh)return;
  // GLTFLoader sanitizes Object3D names; its retained source name identifies
  // the exact authored occurrence without lossy name matching.
  const sourceName=node.userData.name??node.name;
  assert.ok(!found.has(sourceName),'Duplicate production mesh: '+sourceName);found.add(sourceName);
  const source=actual.meshes.get(sourceName);assert.ok(source,'Unexpected production mesh: '+sourceName);
  const p=node.geometry.attributes.position,n=node.geometry.attributes.normal,ix=node.geometry.index;
  assert.ok(p&&n&&!p.isInterleavedBufferAttribute&&!n.isInterleavedBufferAttribute);
  assert.equal(p.itemSize,3);assert.equal(n.itemSize,3);
  assert.deepEqual(arrayReceipt(p.array),arrayReceipt(source.positions),node.name+' production complete positions');
  assert.deepEqual(arrayReceipt(n.array),arrayReceipt(source.normals),node.name+' production complete normals');
  assert.equal(Boolean(ix),source.indexed,node.name+' index presence');
  if(ix)assert.deepEqual(arrayReceipt(new Uint32Array(ix.array)),arrayReceipt(source.indices),node.name+' production complete indices');
  assert.deepEqual(node.matrixWorld.toArray(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],node.name+' production root datum');
  let owner=node;while(owner&&!owner.userData.groupId)owner=owner.parent;
  assert.equal(owner?.userData.groupId,source.groupId);assert.equal(owner?.userData.groupKind,source.kind);
  const material=node.material,pbr=source.material.pbrMetallicRoughness;
  assert.ok(!Array.isArray(material));
  for(const [a,b]of [[material.color.r,pbr.baseColorFactor[0]],[material.color.g,pbr.baseColorFactor[1]],[material.color.b,pbr.baseColorFactor[2]],
   [material.opacity,pbr.baseColorFactor[3]],[material.metalness,pbr.metallicFactor],[material.roughness,pbr.roughnessFactor]])close(a,b,node.name+' production material',1e-7);
  assert.equal(material.transparent,source.material.alphaMode==='BLEND');
 });
 assert.equal(found.size,actual.meshes.size,'Production loader lost actual meshes');return found.size;
}

export async function auditGeometry(opts) {
 const context=await createAuditContext(opts),prepared=await context.readPrepared(),rendererPreview=await auditPreviewRenderer(context,prepared),audited=new Map(),used=new Set(),representationDifferences=[];let previewOccurrences=0;
 const {polygonContains}=await import(pathToFileURL(path.join(context.site,'layout/layout-geometry.mjs')));
 for(const [i,row]of context.rows.entries()){
  const actual=inspectGLB(await context.readActual(row),row),equivalence=compareRepresentations(row,actual,prepared);
  actual.result.plateAttribution=validatePlateOccurrence(row,actual,prepared);
  previewOccurrences+=equivalence.occurrences;for(const id of equivalence.used)used.add(id);representationDifferences.push(...equivalence.findings);
  if(row.layoutVariants){
   const profile=row.layoutVariants[row.equipmentVariant];assert.ok(profile);
   for(const axis of ['width','height','depth'])close(actual.result.dimensionsMm[axis],profile[axis+'Mm'],'Current variant profile '+axis,.05);
   const xs=profile.footprintMm.map(p=>p[0]),zs=profile.footprintMm.map(p=>p[1]),[lo,hi]=actual.result.boundsM;
   for(const [a,b]of [[Math.min(...xs),lo[0]*1000],[Math.max(...xs),hi[0]*1000],[Math.min(...zs),lo[2]*1000],[Math.max(...zs),hi[2]*1000]])close(a,b,'Shared-origin numerical footprint',.05);
  }
  audited.set(DEFINITIONS[i][0],{...actual,row});
 }
 assert.deepEqual([...used].sort(),Object.keys(prepared.descriptor.geometry).sort(),'Unconsumed prepared geometry');
 const a=audited.get('u1Standalone'),b=audited.get('u1Docked'),station=audited.get('stationLoaded'),empty=audited.get('stationEmpty');
 function unchanged(from,to){let count=0;for(const [name,mesh]of to.meshes){const original=from.meshes.get(name);assert.ok(original,'Retained mesh disappeared: '+name);assert.equal(mesh.groupId,original.groupId);for(const field of ['positionHash','normalHash','indexHash'])assert.equal(mesh[field],original[field],'Variant changed retained '+field+': '+name);assert.deepEqual(mesh.material,original.material);count++;}return count;}
 const commonMeshes=unchanged(a,b),commonStationMeshes=unchanged(station,empty);
 for(const [kind,total]of [['spool',4],['holder',4],['feeder',2]]){
  const standalone=[...(a.kinds.get(kind)||[]),...(empty.kinds.get(kind)||[])],mounted=[...(b.kinds.get(kind)||[]),...(station.kinds.get(kind)||[])];
  assert.equal(standalone.length,total);assert.equal(mounted.length,total);assert.deepEqual(standalone.sort(),mounted.sort(),kind+' inventory transfer');
 }
 const deck=station.meshes.get('inset top support surface'),top=prepared.mount.support.topYM,patch=prepared.mount.support.contactPatch;
 assert.ok(deck,'Actual inset support surface missing');close(deck.bounds[1][1],top,'Actual support top');
 assert.deepEqual(patch.sizeM,[.394,0,.430]);assert.deepEqual(patch.centerM,[0,top,0]);close(patch.cornerRadiusM,.012,'Authored rounded corner radius');
 for(const [a,b]of [[deck.bounds[0][0],patch.boundsXZ_M[0][0]],[deck.bounds[1][0],patch.boundsXZ_M[1][0]],
  [deck.bounds[0][2],patch.boundsXZ_M[0][1]],[deck.bounds[1][2],patch.boundsXZ_M[1][1]]])close(a,b,'Actual deck contact bounds');
 const topTriangles=[];
 for(let i=0;i<deck.indices.length;i+=3){const points=[deck.indices[i],deck.indices[i+1],deck.indices[i+2]].map(j=>Array.from(deck.positions.subarray(j*3,j*3+3)));if(points.every(v=>Math.abs(v[1]-top)<1e-7))topTriangles.push(points.map(v=>[v[0],v[2]]));}
 assert.ok(topTriangles.length>0,'Actual deck has no top triangles');
 const onDeck=(x,z)=>topTriangles.some(t=>{const signs=t.map((a,i)=>{const b=t[(i+1)%3];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);});return signs.every(v=>v>=-1e-12)||signs.every(v=>v<=1e-12);});
 const feet=[...b.meshes.values()].filter(m=>/casing foot/.test(m.name));assert.equal(feet.length,4);
 const footChecks=[];let footContactSamples=0,minRoundedPatchMarginM=Infinity;
 for(const foot of feet){
  // Current prepared foot outline: the full bottom-ring vertices, bound to the
  // exact GLB body. No obsolete source-fit contract, generic replacement or
  // assertion about true physical contact/manufacturer mounting dimensions.
  const low=foot.bounds[0][1],outline=[];
  for(let i=0;i<foot.positions.length;i+=3)if(Math.abs(foot.positions[i+1]-low)<1e-7)outline.push([foot.positions[i],foot.positions[i+2]]);
  assert.ok(outline.length>=16,foot.name+' missing prepared foot bottom ring');
  const proxy=b.row.proxy.parts.find(p=>p.name===foot.name);assert.ok(proxy&&proxy.shape==='cylinder'&&proxy.axis==='y');
  for(let i=0;i<3;i++){close(proxy.centerM[i],(foot.bounds[0][i]+foot.bounds[1][i])/2,foot.name+' prepared foot fit centre',.0001);close(proxy.sizeM[i],foot.bounds[1][i]-foot.bounds[0][i],foot.name+' prepared foot fit extent',.0001);}
  const radius=Math.max(proxy.sizeM[0],proxy.sizeM[2])/2,samples=[...outline,...Array.from({length:512},(_,i)=>{const angle=i*2*Math.PI/512;return [proxy.centerM[0]+radius*Math.cos(angle),proxy.centerM[2]+radius*Math.sin(angle)];})];
  assert.ok(polygonContains(b.row.supportFootprintMm,samples.map(p=>p.map(x=>x*1000))),'Current numerical support footprint excludes '+foot.name);
  let margin=Infinity;
  for(const [x,z]of samples){
   const r=patch.cornerRadiusM,dx=Math.max(Math.abs(x-patch.centerM[0])-(patch.sizeM[0]/2-r),0),dz=Math.max(Math.abs(z-patch.centerM[2])-(patch.sizeM[2]/2-r),0),m=r-Math.hypot(dx,dz);
   assert.ok(m>=-1e-8,'Prepared foot outline leaves authored rounded support: '+foot.name);assert.ok(onDeck(x,z),'Prepared foot outline is outside actual deck top triangles: '+foot.name);margin=Math.min(margin,m);footContactSamples++;
  }
  minRoundedPatchMarginM=Math.min(minRoundedPatchMarginM,margin);
  footChecks.push({mesh:foot.name,positionHash:foot.positionHash,indexHash:foot.indexHash,bottomAboveLowestFootM:low,primitiveFitToleranceM:.0001,primitiveCenterDeviationM:proxy.centerM.map((v,i)=>v-(foot.bounds[0][i]+foot.bounds[1][i])/2),actualBottomRingVertices:outline.length,conservativeCircleSamples:512,roundedSupportMarginM:margin});
 }
 const sourceInputs={...prepared.sourceInputs,...sourceHashes(context.site,['layout/layout-equipment.mjs','layout/layout-equipment-transfer.mjs','layout/layout-geometry.mjs','layout/layout-equipment-mesh.mjs','layout/layout-renderer.mjs','viewer/vendor-r180/three.module.js','viewer/vendor-r180/three.core.js'])};
 return {schema:'layout-equipment-geometry-audit-v2',status:prepared.triangleFindings.length?'FAIL':'PASS',passed:prepared.triangleFindings.length===0,findings:prepared.triangleFindings,assets:[...audited.values()].map(a=>a.result),sourceInputs,
  auditInputFiles:context.auditInputFiles,auditScriptSHA256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  source:{basis:'Current exact V4 prepared bodies and tracked metadata; no original sources read',plateAttribution:prepared.plateAttribution,rootPivotM:[0,0,0],uniformScale:1,feet:footChecks},
  preview:{model:context.equipment.LAYOUT_EQUIPMENT_PREVIEW_MODEL,geometries:used.size,arrayReceipts:prepared.arrayReceipts,triangles:prepared.previewTriangles,comparedMeshOccurrences:previewOccurrences,productionRenderer:rendererPreview,body:prepared.descriptor.body,gzip:prepared.descriptor.gzip},
  representationComparison:{basis:'Catalog-declared simplified exterior preview versus full GLB; these are distinct prepared representations, not an exact-equivalence claim',differences:representationDifferences},
  composition:{standaloneSpools:4,mountedSpools:4,duplicatedSpools:0,transferredHolders:4,transferredFeeders:2,
   retainedU1MeshesAtIdenticalDatum:commonMeshes,retainedStationMeshesAtIdenticalDatum:commonStationMeshes,
   authoredSupportTopYM:top,footContactSamples,actualDeckTopTriangles:topTriangles.length,minRoundedPatchMarginM},
  transportMode:'registered-exact-body',preparedDir:context.preparedDir,...limits(),
  scope:'All actual GLB position/normal/index buffers, triangle winding, materials and hierarchy; exact four raw/gzip pairs and preview JSON/gzip; all 66 tracked preview-array receipts; complete production preview mesh buffers equal their prepared arrays; full GLB/preview differences are recorded for the declared simplified representation; shared datum, inventory and current prepared foot outlines against actual authored deck triangles. Other proxy primitives remain illustrative. No original/native solids read; physical mounting/load/operating clearance, browser/GPU and full machine coverage are separate.'};
}
export function writeReport(opts,report){if(opts['--report'])fs.writeFileSync(path.resolve(opts['--report']),JSON.stringify(report,null,2)+'\n');}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network forbidden in equipment audit');};
 try{const opts=options(),report=await auditGeometry(opts);writeReport(opts,report);console.log(JSON.stringify({status:report.status,assets:report.assets.length,preview:report.preview,composition:report.composition,findings:report.findings.length}));if(!report.passed)process.exitCode=1;}
 finally{globalThis.fetch=originalFetch;}
}

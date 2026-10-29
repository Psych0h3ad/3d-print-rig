// Actual exported-byte audit. One sequential JS math worker; no native jobs.
// Default downloads all five immutable public files. --offline requires exact
// local copies in --cache-dir; it never substitutes fixtures or another source.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
export const sha=value=>createHash('sha256').update(value).digest('hex');
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{
  let sum=0;for(let k=0;k<4;k++)sum+=a[k*4+i%4]*b[Math.floor(i/4)*4+k];return sum;
});
const transform=(m,x,y,z,w)=>[0,1,2].map(r=>m[r]*x+m[4+r]*y+m[8+r]*z+m[12+r]*w);
function rigid(m){
  assert.equal(m.length,16);assert(m.every(Number.isFinite));
  assert.deepEqual([m[3],m[7],m[11],m[15]],[0,0,0,1]);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    let dot=0;for(let k=0;k<3;k++)dot+=m[i*4+k]*m[j*4+k];
    assert(Math.abs(dot-(i===j?1:0))<1e-8,'Non-rigid source matrix');
  }
  const det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
  assert(Math.abs(det-1)<1e-8,'Reflected/scaled source occurrence');
}
function publicStrings(value){
  if(typeof value==='string'){
    assert(!/(?:https?:\/\/[^\s"']+\.(?:stp|step)(?:[?#]|$)|file:|[A-Z]:[\\/]|\\\\|\.private\b)/i.test(value),'Private path or CAD download link');
  }else if(value&&typeof value==='object')for(const child of Object.values(value))publicStrings(child);
}

export function inspectBiquGLB(bytes,model,sourceSHA256){
  assert.equal(bytes.length,model.bytes);assert.equal(sha(bytes),model.sha256);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);const length=bytes.readUInt32LE(12);
  assert(length>0&&length%4===0&&length+28<bytes.length);
  assert.equal(bytes.readUInt32LE(24+length),0x004e4942);
  assert.equal(bytes.readUInt32LE(20+length)+length+28,bytes.length);
  const g=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(20,20+length))),bin=bytes.subarray(28+length);
  publicStrings(g);
  assert.equal(g.asset.version,'2.0');assert(!g.extensionsUsed&&!g.extensionsRequired&&!g.images&&!g.textures&&!g.animations&&!g.skins);
  assert.equal(g.buffers.length,1);assert(!g.buffers[0].uri);assert(g.buffers[0].byteLength<=bin.length&&bin.length-g.buffers[0].byteLength<4);
  assert.equal(g.nodes.length,71);assert.equal(g.meshes.length,30);assert.equal(g.materials.length,1);
  assert.equal(g.scene,0);assert.equal(g.scenes.length,1);assert.deepEqual(g.scenes[0].nodes,[0]);
  assert.deepEqual(g.nodes[0].children,Array.from({length:70},(_,i)=>i+1));assert.equal(g.nodes[0].mesh,undefined);
  assert.equal(g.nodes[0].extras.source_sha256,sourceSHA256);assert.equal(g.nodes[0].extras.removed_source_parts,0);
  assert.equal(g.nodes[0].extras.source_original_private,true);assert.equal(g.nodes[0].extras.source_color_present,false);
  const material=g.materials[0];assert.equal(material.doubleSided,true);assert.equal(material.extras.authored_color,false);
  assert.deepEqual(material.pbrMetallicRoughness,{baseColorFactor:[.42,.42,.42,1],metallicFactor:0,roughnessFactor:.64});
  const data=new Map();
  const accessor=(id,kind)=>{
    const key=id+'/'+kind;if(data.has(key))return data.get(key);
    const a=g.accessors[id];assert(a&&!a.sparse&&!a.normalized);
    assert.equal(a.type,kind==='indices'?'SCALAR':'VEC3');
    assert((kind==='indices'?[5123,5125]:[5126]).includes(a.componentType));
    const v=g.bufferViews[a.bufferView];assert(v&&v.buffer===0);assert(Number.isSafeInteger(a.count)&&a.count>0&&a.count<250000);
    const components=kind==='indices'?1:3,size=a.componentType===5123?2:4,stride=v.byteStride??components*size;
    const base=(v.byteOffset??0)+(a.byteOffset??0);
    assert(Number.isSafeInteger(base)&&base>=0&&Number.isSafeInteger(stride)&&stride>=size*components);
    assert(base+(a.count-1)*stride+components*size<=(v.byteOffset??0)+v.byteLength&&
      (v.byteOffset??0)+v.byteLength<=g.buffers[0].byteLength);
    const values=[];
    for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){
      const offset=base+i*stride+j*size;
      values.push(a.componentType===5126?bin.readFloatLE(offset):size===2?bin.readUInt16LE(offset):bin.readUInt32LE(offset));
    }
    assert(values.every(Number.isFinite));data.set(key,values);return values;
  };
  const meshes=g.meshes.map(mesh=>{
    assert.equal(mesh.primitives.length,1);const p=mesh.primitives[0];assert.equal(p.mode,4);assert.equal(p.material,0);
    assert.deepEqual(Object.keys(p.attributes).sort(),['NORMAL','POSITION']);assert(!p.extensions&&!p.targets);
    const positions=accessor(p.attributes.POSITION,'positions'),normals=accessor(p.attributes.NORMAL,'normals'),indices=accessor(p.indices,'indices');
    assert.equal(normals.length,positions.length);assert.equal(indices.length%3,0);
    assert(indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<positions.length/3));
    for(let k=0;k<normals.length;k+=3)assert(Math.abs(Math.hypot(normals[k],normals[k+1],normals[k+2])-1)<1e-5);
    return {positions,normals,indices};
  });
  assert.equal(meshes.reduce((sum,m)=>sum+m.indices.length/3,0),43280);
  rigid(g.nodes[0].matrix);const definitions=new Set(),instances=new Set();
  const leaves=g.nodes.slice(1).map((node,i)=>{
    assert.equal(node.extras.source_instance_index,i);assert(!node.children&&!node.translation&&!node.rotation&&!node.scale);
    assert(Number.isInteger(node.mesh)&&node.mesh>=0&&node.mesh<30);assert(!instances.has(node.extras.source_instance_label));
    instances.add(node.extras.source_instance_label);definitions.add(node.extras.source_definition_label);rigid(node.matrix);
    return {node,nodeIndex:i+1,matrix:multiply(g.nodes[0].matrix??IDENTITY,node.matrix),...meshes[node.mesh]};
  });
  assert.equal(definitions.size,30);assert.equal(instances.size,70);assert.equal(new Set(leaves.map(l=>l.node.mesh)).size,30);
  return {g,leaves};
}

/** Every indexed preview triangle maps to an original full-mesh occurrence.
 * This compares every vertex, normal and index after the exact rigid matrices,
 * with only Float32 storage and normal renormalization; no tolerance grid. */
export function compareBiquPreview(actual,part,dimensionsMm){
  let vertexOffset=0,indexOffset=0,minNormalDot=1,minimumArea=Infinity;
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},rows=[];
  for(let i=0;i<actual.leaves.length;i++){
    const {node,nodeIndex,matrix,positions,normals,indices}=actual.leaves[i],mapping=part.sourceLeaves[i];
    assert.deepEqual(mapping,{nodeIndex,meshIndex:node.mesh,sourceInstanceIndex:i,
      sourceInstanceLabel:node.extras.source_instance_label,sourceDefinitionLabel:node.extras.source_definition_label,
      vertexOffset,vertexCount:positions.length/3,indexOffset,indexCount:indices.length});
    for(let j=0;j<positions.length;j+=3){
      const p=transform(matrix,positions[j],positions[j+1],positions[j+2],1).map(Math.fround);
      const n=transform(matrix,normals[j],normals[j+1],normals[j+2],0),norm=Math.hypot(...n);
      for(let a=0;a<3;a++){
        assert.equal(part.positionsM[vertexOffset*3+j+a],p[a],'Preview changed source position');
        assert.equal(part.normals[vertexOffset*3+j+a],Math.fround(n[a]/norm)||0,'Preview changed source normal');
        bounds.min[a]=Math.min(bounds.min[a],p[a]);bounds.max[a]=Math.max(bounds.max[a],p[a]);
      }
    }
    for(let j=0;j<indices.length;j++)assert.equal(part.indices[indexOffset+j],indices[j]+vertexOffset,'Preview changed source triangle');
    rows.push({sourceInstanceIndex:i,sourceDefinition:node.extras.source_definition_label,triangles:indices.length/3});
    vertexOffset+=positions.length/3;indexOffset+=indices.length;
  }
  assert.equal(vertexOffset,79824);assert.equal(indexOffset,82048*3);assert.equal(part.positionsM.length,vertexOffset*3);assert.equal(part.indices.length,indexOffset);
  for(let i=0;i<part.indices.length;i+=3){
    const [ia,ib,ic]=part.indices.slice(i,i+3).map(v=>v*3),p=part.positionsM;
    const u=[0,1,2].map(a=>p[ib+a]-p[ia+a]),v=[0,1,2].map(a=>p[ic+a]-p[ia+a]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross);
    assert(length>0&&Number.isFinite(length),'Collapsed transformed source triangle');minimumArea=Math.min(minimumArea,length/2);
    const n=[0,1,2].map(a=>part.normals[ia+a]+part.normals[ib+a]+part.normals[ic+a]);
    const dot=cross.reduce((s,c,a)=>s+c*n[a],0)/(length*Math.hypot(...n));
    assert(Number.isFinite(dot)&&dot>=-1e-5,'Reversed preview winding');minNormalDot=Math.min(minNormalDot,dot);
  }
  assert(Math.abs(bounds.min[1])<1e-6,'Floor datum');
  for(const [key,a]of [['width',0],['height',1],['depth',2]])
    assert(Math.abs((bounds.max[a]-bounds.min[a])*1000-dimensionsMm[key])<.001,'Full/source dimensions differ');
  return {leaves:70,definitions:30,vertices:vertexOffset,triangles:indexOffset/3,draws:1,boundsM:bounds,
    exactFloat32Positions:true,exactTransformedNormals:true,exactOrientedSourceTriangles:true,minNormalDot,minimumTriangleAreaM2:minimumArea,sourceLeaves:rows};
}

async function remoteFile(url,receipt,signal){
  const response=await fetch(url,{signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
  let complete=false;const reader=response.body?.getReader();
  try{
    assert(response.ok&&!response.redirected&&response.url===url.href,'Asset HTTP response');
    const encoding=response.headers.get('content-encoding');
    // Pages may compress a raw .glb/.json response. Fetch decodes that HTTP
    // layer; authenticate its bounded decoded bytes. Explicit .gz files are
    // independently pinned wire bodies and MUST have no HTTP auto-decoding.
    const identity=encoding===null||encoding==='identity';
    assert(identity||!receipt.path.endsWith('.gz')&&['gzip','br','deflate'].includes(encoding),'Unexpected HTTP encoding');
    const length=response.headers.get('content-length');
    if(length!==null){assert(/^[0-9]+$/.test(length));if(identity)assert.equal(Number(length),receipt.bytes);
      else assert(Number(length)>0&&Number(length)<=16*1024*1024,'Raw HTTP encoding byte cap');}
    assert(reader);const bytes=Buffer.alloc(receipt.bytes);let offset=0;
    for(;;){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;
      assert(value.length<=bytes.length-offset,'Asset byte cap exceeded');bytes.set(value,offset);offset+=value.length;}
    assert.equal(offset,receipt.bytes);assert.equal(sha(bytes),receipt.sha256);complete=true;return {bytes,httpContentEncoding:encoding};
  }finally{if(!complete)try{await reader?.cancel()}catch{}reader?.releaseLock()}
}

export async function auditBiquAssets({site=fileURLToPath(new URL('../site/',import.meta.url)),cacheDir,offline=false,
  signal=AbortSignal.timeout(120000)}={}){
  const started=performance.now(),modulePath=path.resolve(site,'layout/layout-biqu-popstation.mjs');
  const m=await import(pathToFileURL(modulePath)),t=await import(pathToFileURL(path.resolve(site,'layout/layout-equipment-transfer.mjs')));
  const row=m.getBiquPopStation(),preview=m.BIQU_POPSTATION_PREVIEW;
  const notice={path:row.model.path.replace(/[^/]+$/,'NOTICE.txt'),bytes:943,sha256:'b434c5ff93adf1a55e465b5a3ac379bc0fa3bca3897c99a648f7d588887cf49c'};
  const refs=[row.model,row.model.transfer,preview,preview.transfer,notice],bodies=new Map(),files=[];
  if(offline)assert(cacheDir,'Offline actual audit requires --cache-dir');
  for(const ref of refs){
    signal.throwIfAborted();const name=path.posix.basename(ref.path),url=new URL(ref.path,t.BIQU_POPSTATION_TRANSFER_BASE);
    let bytes,httpContentEncoding;
    if(offline){
      const local=path.resolve(cacheDir,name),stat=fs.lstatSync(local);
      assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.size,ref.bytes);bytes=fs.readFileSync(local);
      assert.equal(sha(bytes),ref.sha256,'Actual cached asset identity');
    }else{
      ({bytes,httpContentEncoding}=await remoteFile(url,ref,signal));
      if(cacheDir){fs.mkdirSync(cacheDir,{recursive:true});const local=path.resolve(cacheDir,name);
        if(fs.existsSync(local))assert.equal(sha(fs.readFileSync(local)),ref.sha256,'Refuse cache overwrite');else fs.writeFileSync(local,bytes,{flag:'wx'});}
    }
    bodies.set(url.href,bytes);files.push({name,path:ref.path,bytes:bytes.length,sha256:sha(bytes),url:url.href,
      ...(!offline?{httpContentEncoding,identityScope:ref.path.endsWith('.gz')?'exact explicit-gzip wire body':'exact raw file after HTTP decoding'}:{}),
      ...(cacheDir?{localPath:path.resolve(cacheDir,name)}:{})});
  }
  const pinnedFetch=async url=>{
    assert(bodies.has(url.href),'Unregistered audit request');const b=bodies.get(url.href);
    const response=new Response(b,{headers:{'content-length':String(b.length)}});Object.defineProperty(response,'url',{value:url.href});return response;
  };
  const full=Buffer.from(await t.downloadEquipmentModel(row.model,{signal,fetchImpl:pinnedFetch}));
  assert(full.equals(bodies.get(new URL(row.model.path,t.BIQU_POPSTATION_TRANSFER_BASE).href)));
  const input=await t.downloadEquipmentPreviewGeometry(preview,{signal,fetchImpl:pinnedFetch});
  assert.deepEqual(input,JSON.parse(bodies.get(new URL(preview.path,t.BIQU_POPSTATION_TRANSFER_BASE).href)));
  publicStrings(input);publicStrings(bodies.get(new URL(notice.path,t.BIQU_POPSTATION_TRANSFER_BASE).href).toString('utf8'));
  const part=await m.validateBiquPreview(input,{signal}),actual=inspectBiquGLB(full,row.model,m.BIQU_POPSTATION_SOURCE_SHA256);
  const comparison=compareBiquPreview(actual,part,row.dimensionsMm);
  assert(Array.isArray(part.positionsM)&&Object.isFrozen(part.positionsM)&&Object.isFrozen(part.normals)&&Object.isFrozen(part.indices));
  assert.equal(part.doubleSided,true);assert.equal(part.shape,'mesh');
  const sourceFiles=[modulePath,path.resolve(site,'layout/layout-equipment-transfer.mjs'),fileURLToPath(import.meta.url)];
  const rss=process.resourceUsage().maxRSS*1024;assert(rss<=512*1024*1024,'512 MiB audit memory cap');
  assert(performance.now()-started<120000,'120-second audit wall cap');
  return {status:'PASS',schema:'biqu-popstation-actual-assets-v1',mode:offline?'pinned-local-actual-assets':'downloaded-public-actual-assets',
    sourceSha256:m.BIQU_POPSTATION_SOURCE_SHA256,modelSha256:row.model.sha256,files,
    gates:{exactDecodedAndWireIdentities:true,all70FullLeaves:true,finiteNormalsIndicesBoundsFloor:true,
      allSourceTrianglesRetained:true,singleSharedPreviewGeometry:true,noSourceCADDownloadLinks:true},
    comparison,inputs:sourceFiles.map(p=>({path:p,sha256:sha(fs.readFileSync(p))})),
    resources:{nativeJobs:0,mathWorkers:1,peakRSSBytes:rss,memoryCapBytes:536870912,wallCapSeconds:120,elapsedSeconds:(performance.now()-started)/1000},
    scope:'Exact full/preview mesh bytes and rigid source correspondence. Production behavior, machine coverage and browser review require separate release evidence.',
    openFindings:['Physical finish/transparency absent from source','Installed feet/floor, finite-deck foot contact, mounting hardware, load and operating clearance unverified'],
    nativeRecomputed:false,browserReviewed:false,physicalMountingVerified:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const opts={};let report;
    for(let i=2;i<process.argv.length;i++){
      const arg=process.argv[i];
      if(arg==='--offline')opts.offline=true;
      else if(['--site','--cache-dir','--prepared-dir','--report'].includes(arg)){
        const value=process.argv[++i];assert(value&&!value.startsWith('--'),'Missing audit option');
        if(arg==='--report')report=value;else opts[arg==='--site'?'site':'cacheDir']=value;
      }else throw Error('Unknown BIQU audit argument: '+arg);
    }
    const result=await auditBiquAssets(opts),text=JSON.stringify(result,null,2)+'\n';
    if(report){fs.mkdirSync(path.dirname(path.resolve(report)),{recursive:true});fs.writeFileSync(report,text);}
    process.stdout.write(text);
  }catch(error){process.stderr.write(JSON.stringify({status:'FAIL',error:error.message,code:error.code??null})+'\n');process.exitCode=1;}
}

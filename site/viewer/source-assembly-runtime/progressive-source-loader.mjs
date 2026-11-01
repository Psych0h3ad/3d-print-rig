import * as T from 'three';
import {validateChunkManifest} from './chunk_loader.mjs?v=09086d898457b88d7281';
import {fetchPinned,createChunkProgress} from './loading.mjs?v=27f532177fad63efad05';
import {fetchExactChunk} from './exact_gzip_transport.mjs?v=e2841a828f7106242706';
import {releaseRoot} from './resources.mjs?v=53e0f29aff2fcb720ede';

const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const semantics={POSITION:'position',NORMAL:'normal',COLOR_0:'color',TEXCOORD_0:'uv',TEXCOORD_1:'uv1'};
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError')};

// This path accepts the exact, untextured E3NG source bundle only. Other source
// families continue through their existing GLTF loader. Ordinary rigid buffers
// are released after upload; route, source-weight and morph arrays stay on CPU.
// Renderer-less Layout loads retain all copied arrays until disposal.
export async function loadProgressiveSource(packet,{signal,onProgress=()=>{},fetchAsset=fetchPinned,upload,retainCPU=false,onChunk=()=>{},displayProfile,maxAccountedBytes=512*1024*1024}={}){
 assert(packet.machine==='e3ng'&&typeof retainCPU==='boolean'&&(retainCPU?upload===undefined:typeof upload==='function'),'Progressive E3NG requires a real uploader or explicit CPU retention');
 assert(Number.isSafeInteger(maxAccountedBytes)&&maxAccountedBytes>0,'Invalid progressive source memory budget');
 cancelled(signal);onProgress({phase:'manifest',percent:null,downloadPercent:null});
 let raw=await fetchAsset(packet.chunk_delivery.manifest.url,packet.chunk_delivery.manifest,signal);
 const manifest=validateChunkManifest(JSON.parse(new TextDecoder().decode(raw)),packet);raw=null;
 const d=manifest.document;
 assert(!d.extensionsUsed?.length&&!d.extensionsRequired?.length&&!d.nodes.some(n=>n.extensions||n.skin!==undefined||n.camera!==undefined),'Unsupported source scene extension');
 assert(!packet.source_GT2_189&&!packet.source_flex181,'Unsupported dynamic source family');
 const root=new T.Group(),objects=[],meshes=[],geometries=new Set(),materialCache=new Map();
 const stats={model_sha256:packet.model.sha256,chunks:0,owners:packet.parts.length,mesh_occurrences:0,geometries:0,cpu_retained_bytes:0,gpu_attribute_bytes:0,peak_pending_bytes:0,peak_accounted_bytes:0,source_arrays_released:0,physical_memory_measured:false,cpu_retention:retainCPU?'until-dispose':'routes-and-morphs',upload_performed:false};
 root.userData.progressiveSource=stats;
 const pending=new Map(),needs=new Map(),tasks=new Map(),retained=new Set((packet.routes||[]).map(r=>r.part_key));
 const runtimeAttributes=new Set((packet.routes||[]).flatMap(r=>Object.values(r.deformation?.attributes||{})).map(x=>x.toLowerCase()));
 for(const key of [packet.source_loom306?.route?.key,packet.source_drive304?.companions?.PTFE?.key,packet.source_drive304?.companions?.loom?.key])if(key)retained.add(key);
 const ownersByIndex=new Map(packet.parts.map(p=>[p.actual_export.node,p]));
 const parents=new Map();d.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>{assert(!parents.has(c),'Multiple parents in source scene');parents.set(c,i)}));
 const ownerOf=i=>{const seen=new Set();while(i!==undefined){assert(!seen.has(i),'Source scene cycle');seen.add(i);if(ownersByIndex.has(i))return ownersByIndex.get(i);i=parents.get(i)}return null};
 const live=new Set();function visit(i){assert(!live.has(i),'Duplicate reachable source node');live.add(i);for(const c of d.nodes[i].children||[])visit(c)}
 for(const i of d.scenes[d.scene||0].nodes)visit(i);
 const morphOwners=new Set();
 function material(index,colored){
  const key=index+':'+colored;if(materialCache.has(key))return materialCache.get(key);
  const def=d.materials[index]||{},p=def.pbrMetallicRoughness||{},c=p.baseColorFactor||[1,1,1,1];
  assert(!def.extensions&&!Object.keys(p).some(k=>k.endsWith('Texture')),'Unsupported source material');
  const m=new T.MeshStandardMaterial({color:new T.Color().setRGB(c[0],c[1],c[2],T.LinearSRGBColorSpace),metalness:p.metallicFactor??1,roughness:p.roughnessFactor??1,opacity:c[3],transparent:def.alphaMode==='BLEND',side:def.doubleSided?T.DoubleSide:T.FrontSide,vertexColors:colored});
  if(def.alphaMode==='MASK')m.alphaTest=def.alphaCutoff??.5;if(def.emissiveFactor)m.emissive.fromArray(def.emissiveFactor);materialCache.set(key,m);return m;
 }
 function sourceMesh(primitive){
  const mesh=new T.Mesh(new T.BufferGeometry(),material(primitive.material,primitive.attributes.COLOR_0!==undefined));mesh.frustumCulled=false;meshes.push(mesh);return mesh;
 }
 try{
  // Match GLTFLoader's single-primitive node shape so custom belt metadata stays
  // on its actual mesh, and part_key identifies exactly one occurrence.
  for(const [i,n]of d.nodes.entries()){
   const primitives=n.mesh===undefined||!live.has(i)?[]:d.meshes[n.mesh].primitives;
   const o=primitives.length===1?sourceMesh(primitives[0]):new T.Group();
   if(primitives.length>1)for(const primitive of primitives)o.add(sourceMesh(primitive));
   o.name=T.PropertyBinding.sanitizeNodeName(n.name||'');o.userData=structuredClone({...d.meshes?.[n.mesh]?.extras,...n.extras});
   if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale)}else{o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]);o.scale.fromArray(n.scale||[1,1,1]);o.updateMatrix()}
   o.matrixAutoUpdate=false;objects[i]=o;
  }
  for(const [i,n]of d.nodes.entries())for(const c of n.children||[])objects[i].add(objects[c]);
  for(const i of d.scenes[d.scene||0].nodes)root.add(objects[i]);root.updateMatrixWorld(true);
  for(const [i,p]of ownersByIndex){assert(live.has(i)&&objects[i].userData.part_key===p.key,'Missing declared source owner '+p.key);assert(objects[i].matrixWorld.elements.every((v,j)=>Math.abs(v-p.matrix[j])<=1e-7),'Changed native source matrix '+p.key)}
  for(const [ni,node]of d.nodes.entries()){
   if(node.mesh===undefined||!live.has(ni))continue;const owner=ownerOf(ni);assert(owner,'Unowned source geometry');
   for(const [pi,primitive]of d.meshes[node.mesh].primitives.entries()){
    assert((primitive.mode??4)===4&&primitive.attributes.NORMAL!==undefined,'Source requires triangles and original normals');
    const morph=!!primitive.targets?.length;
    if(morph){assert(displayProfile?.model_sha256===packet.model.sha256&&displayProfile.physical_simulation===false&&displayProfile.owner_keys.includes(owner.key)&&owner.kind==='printed'&&primitive.targets.length===1,'Unregistered illustrative morph');morphOwners.add(owner.key)}
    const keep=retainCPU||morph||retained.has(owner.key)||objects[ni].userData.belt_component==='backing';
    const key=node.mesh+':'+pi;
    if(!tasks.has(key)){
     // Provenance face IDs stay in the immutable source bundle and audit files;
     // they are not vertex shader inputs. Keep every actual rendering attribute
     // and every explicitly declared motion-weight attribute.
     const attributes=Object.fromEntries(Object.entries(primitive.attributes).filter(([name])=>semantics[name]||runtimeAttributes.has(name.toLowerCase())));
     const accessors=[...Object.values(attributes),...(primitive.indices===undefined?[]:[primitive.indices]),...(primitive.targets||[]).flatMap(t=>Object.values(t))];
     const chunks=[...new Set(accessors.map(i=>manifest.buffer_view_chunks[d.accessors[i].bufferView].chunk))];
     tasks.set(key,{primitive,attributes,chunks,users:[],keep:false,done:false});for(const c of chunks)needs.set(c,(needs.get(c)||0)+1);
    }
    const mesh=d.meshes[node.mesh].primitives.length===1?objects[ni]:objects[ni].children[pi];
    tasks.get(key).keep ||= keep;tasks.get(key).users.push({mesh,node,owner});
   }
  }
  if(displayProfile)assert(morphOwners.size===6&&displayProfile.owner_keys.every(k=>morphOwners.has(k)),'Incomplete fitted latch coverage');
  function attribute(index,keep){
   const a=d.accessors[index],map=manifest.buffer_view_chunks[a.bufferView],bytes=pending.get(map.chunk),Type=types[a.componentType];
   let array=new Type(bytes.buffer,bytes.byteOffset+map.offset+(a.byteOffset||0),a.count*sizes[a.type]);if(keep)array=array.slice();
   for(const value of array)assert(Number.isFinite(value),'Nonfinite source attribute');
   const result=new T.BufferAttribute(array,sizes[a.type],a.normalized===true),size=array.byteLength;stats.gpu_attribute_bytes+=size;
   if(keep)stats.cpu_retained_bytes+=size;
   else result.onUpload(()=>{if(result.array){result.array=null;stats.source_arrays_released++}});
   return result;
  }
  const progress=createChunkProgress(manifest.chunks,onProgress,{signal});
  for(const chunk of manifest.chunks){
   cancelled(signal);let bytes=new Uint8Array(await fetchExactChunk(chunk,{fetchPinned:fetchAsset,signal,onProgress:progress.begin(chunk.ordinal)}));cancelled(signal);
   pending.set(chunk.ordinal,bytes);bytes=null;progress.finish(chunk.ordinal);stats.chunks++;
   const pendingBytes=[...pending.values()].reduce((sum,b)=>sum+b.byteLength,0);stats.peak_pending_bytes=Math.max(stats.peak_pending_bytes,pendingBytes);
   for(const task of tasks.values()){
    if(task.done||!task.chunks.every(c=>pending.has(c)))continue;
    const {primitive}=task,g=new T.BufferGeometry();geometries.add(g);
    for(const [semantic,index]of Object.entries(task.attributes))g.setAttribute(semantics[semantic]||semantic.toLowerCase(),attribute(index,task.keep));
    if(primitive.indices!==undefined){const index=attribute(primitive.indices,task.keep);for(const value of index.array)assert(value<g.attributes.position.count,'Index outside source vertex range');g.setIndex(index)}
    const a=d.accessors[primitive.attributes.POSITION];assert(a.min?.every(Number.isFinite)&&a.max?.every(Number.isFinite),'Missing source bounds');g.boundingBox=new T.Box3(new T.Vector3(...a.min),new T.Vector3(...a.max));
    if(primitive.targets){g.morphTargetsRelative=true;for(const target of primitive.targets)for(const [semantic,index]of Object.entries(target)){assert(['POSITION','NORMAL'].includes(semantic)&&d.accessors[index].count===a.count,'Invalid source morph');(g.morphAttributes[semantics[semantic]]??=[]).push(attribute(index,true))}g.computeBoundingBox();stats.gpu_attribute_bytes+=a.count*4*4*(g.morphAttributes.normal?2:1)}
    g.boundingSphere=g.boundingBox.getBoundingSphere(new T.Sphere());
    for(const {mesh,node}of task.users){mesh.geometry.dispose();mesh.geometry=g;mesh.updateMorphTargets();if(primitive.targets){const weights=node.weights||d.meshes[node.mesh].weights;assert(weights?.length===1&&weights[0]===1,'Changed assembled display default');mesh.morphTargetInfluences[0]=1}mesh.visible=true;stats.mesh_occurrences++}
    stats.geometries++;task.done=true;for(const c of task.chunks)needs.set(c,needs.get(c)-1);
   }
   const accounted=pendingBytes+stats.cpu_retained_bytes+stats.gpu_attribute_bytes+2*chunk.bytes;stats.peak_accounted_bytes=Math.max(stats.peak_accounted_bytes,accounted);assert(accounted<=maxAccountedBytes,'Progressive source asset allocation exceeds budget: '+JSON.stringify(stats));
   // With a renderer, upload before dropping chunk views. Without one, every
   // attribute was copied above and remains valid for Layout clones, later GPU
   // uploads and context rebuilds. GPU bytes stay in the conservative budget.
   if(!retainCPU){await upload(root);stats.upload_performed=true;}cancelled(signal);
   for(const [c]of pending)if(!needs.get(c))pending.delete(c);
   onChunk({...stats});
  }
  assert([...tasks.values()].every(t=>t.done)&&pending.size===0,'Incomplete progressive source');progress.assembly();root.updateMatrixWorld(true);
  return {scene:root,progressiveSource:stats};
 }catch(error){releaseRoot(root);for(const g of geometries)g.dispose();for(const m of materialCache.values())m.dispose();throw error}
 finally{pending.clear()}
}

export function createProgressiveUploader(renderer){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.001,10),target=new T.WebGLRenderTarget(1,1,{depthBuffer:false});
 camera.position.set(0,0,2);
 return {
  upload(root){const old=renderer.getRenderTarget();scene.add(root);try{renderer.setRenderTarget(target);renderer.render(scene,camera)}finally{scene.remove(root);renderer.setRenderTarget(old)}},
  dispose(){target.dispose()}
 };
}

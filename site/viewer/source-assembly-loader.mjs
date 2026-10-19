import{GLTFLoader}from'./vendor-r180/GLTFLoader.js';
import{fetchPinned,assertLoadingBudget}from'./source-assembly-runtime/loading.mjs?v=7f950e2f016d179c957f';
import{loadChunkedModel,validateChunkManifest}from'./source-assembly-runtime/chunk_loader.mjs?v=69631ef1e30f2b9b2565';
import{headSubsetPlan,headSubsetPacket}from'./source-assembly-runtime/head_subset.mjs?v=e42678a5314a2d6c0676';
import{createAssembly}from'./source-assembly-runtime/assembly.mjs?v=e42678a5314a2d6c0676';
import{releaseRoot}from'./source-assembly-runtime/resources.mjs?v=e42678a5314a2d6c0676';
import{sourceAssemblyMachines}from'./source-assembly-registry.mjs';
const indexURL=new URL('../SOURCE_ASSEMBLIES.json',import.meta.url);
export async function loadSourceIndex(signal){const r=await fetch(indexURL,{signal,cache:'no-store'});if(!r.ok)throw Error('Source index unavailable');const text=await r.text();if(text.length>128*1024)throw Error('Source index exceeds limit');const x=JSON.parse(text),expected=new Set(sourceAssemblyMachines.map(r=>r.id));if(x.schema!=='public-source-assembly-index-v1'||!Array.isArray(x.models)||!expected.size||x.models.length!==expected.size||new Set(x.models.map(r=>r.id)).size!==expected.size||x.models.some(r=>!expected.has(r.id)))throw Error('Source index identity changed');return x;}
export async function loadSourcePacket(record,signal){const p=JSON.parse(new TextDecoder().decode(await fetchPinned(record.packet.url,record.packet,signal)));if(p.id!==record.assembly_id||p.model.sha256!==record.model_sha256||p.default_variant!==record.configuration)throw Error('Source assembly binding changed');return p;}
export async function sourceHeadPlan(packet,signal){const m=validateChunkManifest(JSON.parse(new TextDecoder().decode(await fetchPinned(packet.chunk_delivery.manifest.url,packet.chunk_delivery.manifest,signal))),packet);return headSubsetPlan(packet,m,packet.public_head_keys);}
export function selectedSourcePacket(packet,plan){const p=headSubsetPacket(packet,plan);for(const k of['source_drive304','source_loom306'])delete p[k];return p;}
export async function loadSourceAssembly(packet,{signal,mode='full',headPlan=null,onProgress=()=>{},fetchAsset}={}){
 if(!['full','head'].includes(mode))throw Error('Unknown assembly view');
 if(mode==='head'&&!headPlan)throw Error('Head plan missing');
 const p=mode==='head'?selectedSourcePacket(packet,headPlan):packet;
 assertLoadingBudget(p,0,{largeModelConfirmed:true});
 const gltf=await loadChunkedModel(new GLTFLoader(),packet,{signal,onProgress,fetchAsset,selectedPartKeys:mode==='head'?packet.public_head_keys:null});
 try{if(signal?.aborted)throw new DOMException('Canceled','AbortError');return createAssembly(gltf,p);}catch(error){releaseRoot(gltf.scene);throw error;}
}

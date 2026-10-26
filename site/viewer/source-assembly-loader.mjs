import {attachSourceMaterialDisplay} from './source-assembly-runtime/source-material-display.mjs?v=5d773caa9598cb098acb';
import {loadProgressiveSource,createProgressiveUploader} from './source-assembly-runtime/progressive-source-loader.mjs?v=021b0c77b5e0df5a2a87';
import {attachIllustrativeLatchDisplay} from './source-assembly-runtime/illustrative-latch-adapter.mjs?v=99ad800d6fe1e947f0cf';
import{GLTFLoader}from'./vendor-r180/GLTFLoader.js?v=adbbafe8ce40416525b6';
import{fetchPinned,assertLoadingBudget}from'./source-assembly-runtime/loading.mjs?v=c803b3642a0d2339782e';
import{loadChunkedModel,validateChunkManifest}from'./source-assembly-runtime/chunk_loader.mjs?v=249538000d01b5f846a8';
import{headSubsetPlan,headSubsetPacket}from'./source-assembly-runtime/head_subset.mjs?v=9d559758a3aaa9114976';
import{createAssembly}from'./source-assembly-runtime/assembly.mjs?v=184e8963c12cd2734592';
import{releaseRoot}from'./source-assembly-runtime/resources.mjs?v=53e0f29aff2fcb720ede';
import{sourceAssemblyMachines}from'./source-assembly-registry.mjs?v=626a5779c846d77e1ee8';
const indexURL=new URL('../SOURCE_ASSEMBLIES.json',import.meta.url);
export async function loadSourceIndex(signal){const r=await fetch(indexURL,{signal,cache:'no-store'});if(!r.ok)throw Error('Source index unavailable');const text=await r.text();if(text.length>128*1024)throw Error('Source index exceeds limit');const x=JSON.parse(text),expected=new Set(sourceAssemblyMachines.map(r=>r.id));if(x.schema!=='public-source-assembly-index-v1'||!Array.isArray(x.models)||!expected.size||x.models.length!==expected.size||new Set(x.models.map(r=>r.id)).size!==expected.size||x.models.some(r=>!expected.has(r.id)))throw Error('Source index identity changed');return x;}
export async function loadSourcePacket(record,signal){const p=JSON.parse(new TextDecoder().decode(await fetchPinned(record.packet.url,record.packet,signal)));if(p.id!==record.assembly_id||p.model.sha256!==record.model_sha256||p.default_variant!==record.configuration)throw Error('Source assembly binding changed');return p;}
export async function sourceHeadPlan(packet,signal){const m=validateChunkManifest(JSON.parse(new TextDecoder().decode(await fetchPinned(packet.chunk_delivery.manifest.url,packet.chunk_delivery.manifest,signal))),packet);return headSubsetPlan(packet,m,packet.public_head_keys);}
export function selectedSourcePacket(packet,plan){const p=headSubsetPacket(packet,plan);for(const k of['source_drive304','source_loom306'])delete p[k];return p;}
export async function loadSourceAssembly(packet,{signal,mode='full',headPlan=null,onProgress=()=>{},fetchAsset,renderer}={}){
 if(!['full','head'].includes(mode))throw Error('Unknown assembly view');
 if(mode==='head'&&!headPlan)throw Error('Head plan missing');
 const p=mode==='head'?selectedSourcePacket(packet,headPlan):packet;
 assertLoadingBudget(p,0,{largeModelConfirmed:true});
 const progress=q=>{if(!signal?.aborted)onProgress(q);};
 let gltf;const progressive=mode==='full'&&packet.machine==='e3ng'&&packet.illustrative_latch_display;
 if(progressive){
  if(renderer){const uploader=createProgressiveUploader(renderer);try{gltf=await loadProgressiveSource(packet,{signal,onProgress:progress,fetchAsset,upload:uploader.upload,displayProfile:packet.illustrative_latch_display});}finally{uploader.dispose();}}
  else gltf=await loadProgressiveSource(packet,{signal,onProgress:progress,fetchAsset,retainCPU:true,displayProfile:packet.illustrative_latch_display,maxAccountedBytes:packet.loading_budget.single_load_peak_bytes});
 }
 else gltf=await loadChunkedModel(new GLTFLoader(),packet,{signal,onProgress:progress,fetchAsset,selectedPartKeys:mode==='head'?packet.public_head_keys:null});
 try{if(signal?.aborted)throw new DOMException('Canceled','AbortError');progress({phase:'assembly',percent:null,downloadPercent:100});let assembly=createAssembly(gltf,p);if(progressive)assembly=attachIllustrativeLatchDisplay(assembly,packet.illustrative_latch_display);if(packet.machine==='e3ng')assembly=attachSourceMaterialDisplay(assembly);progress({phase:'ready',percent:null,downloadPercent:100});return assembly;}catch(error){releaseRoot(gltf.scene);throw error;}
}

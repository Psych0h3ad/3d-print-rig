import * as THREE from './vendor-r180/three.module.js';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {modelURL} from './model-loader.js?v=319442cce47f582793a9';
import {readModelBytes} from './model-progress.mjs?v=beaef781095b6f56b290';
import {externalModelDelivery} from './model-delivery.mjs';
import {registeredModelDelivery,verifyDeliveredModel} from './model-delivery-policy.mjs';
import {alphaNativeHostModelOptions} from './trinity-alpha-host-extensions.mjs?v=b7564f97e46dc8904224';
import {createV24Adapter} from './v24_matrix_adapter.mjs?v=c71e052633de09bc592d';
const siteRoot=new URL('../',import.meta.url);
const ids=new Set([250,300,350].flatMap(n=>['printed','ldo_cnc'].map(s=>`voron_v24_${n}_${s}`)));
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
function dispose(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?[].concat(o.material):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const o of [...geometries,...materials,...textures])o.dispose();root.removeFromParent();root.clear();}

// The default setupV24MachineHeads baseline keeps the native SB/CW2/Revo and
// Panasonic probe. It loads no replacement head, gantry or parked tools. Keep
// that exact recipe here without mounting the interactive DOM controls.
export async function loadV24ReferenceLayout(machineId,{signal,onProgress=()=>{}}={}){
  if(!ids.has(machineId))throw Error('Unknown V2.4 reference machine');
  const base=new URL(`machines/${machineId}/`,siteRoot),pins={};let root;
  const json=async name=>{const r=await fetch(new URL(name,base),{signal,cache:'no-cache'});if(!r.ok)throw Error('V2.4 layout metadata unavailable');const bytes=new Uint8Array(await r.arrayBuffer());pins[name]={sha256:await hash(bytes),bytes:bytes.byteLength};return JSON.parse(new TextDecoder().decode(bytes));};
  try{
    const manifest=await json('assembly_manifest.json'),profile=await json('machine_profile.json');
    if(manifest.machine_id!==machineId||profile.machine_id!==machineId)throw Error('V2.4 layout source identity mismatch');
    const path=new URL('model.glb',base).href,pin=registeredModelDelivery(path,siteRoot.href,siteRoot,externalModelDelivery),resolved=await modelURL(path);
    const response=await fetch(resolved,{signal});if(!response.ok)throw Error('V2.4 layout model unavailable');
    const bytes=await readModelBytes(response,{onProgress:event=>{signal?.throwIfAborted();onProgress({...event,ratio:event.total?event.loaded/event.total:0,phase:'download'});}});
    signal?.throwIfAborted();const compressed=bytes[0]===0x1f&&bytes[1]===0x8b;
    if(pin&&compressed)await verifyDeliveredModel(bytes,pin);
    const buffer=compressed?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(pin)await verifyDeliveredModel(buffer,pin,true);
    const modelHash=await hash(buffer),expected=alphaNativeHostModelOptions(machineId).verifySha256;
    if(expected&&modelHash!==expected)throw Error('V2.4 layout native model mismatch');
    pins['model.glb']={sha256:modelHash,bytes:buffer.byteLength};
    signal?.throwIfAborted();root=(await new GLTFLoader().parseAsync(buffer,base.href)).scene;signal?.throwIfAborted();
    const adapter=createV24Adapter(root,manifest,profile);
    for(const node of adapter.nodes.values())node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();for(const m of [].concat(mesh.material))if(m.transparent)m.depthWrite=false;});
    adapter.setEnclosureVisible(true);adapter.setFlexibleVisible(true);adapter.setPalette(profile.appearance.palette_defaults);
    const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
    if(!pose.atReference)throw Error('V2.4 layout native reset mismatch');
    root.updateMatrixWorld(true);
    return {root,manifest,profile,source:{machineId,source:manifest.source??profile.source,assets:pins,recipe:'native SB/CW2/Revo/Panasonic, fixed native gantry, exact CAD reference, panels/flexible visible, native default palette',defaultConfiguration:profile.available_configurations?.[0]?.id,scope:'Default displayed assembly, no native-solid fit claim'},dispose:()=>dispose(root)};
  }catch(error){if(root)dispose(root);throw error;}
}

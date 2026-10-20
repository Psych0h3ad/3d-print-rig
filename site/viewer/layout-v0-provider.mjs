import * as THREE from './vendor-r180/three.module.js';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {modelURL} from './model-loader.js?v=3a71971c97a749c16228';
import {readModelBytes} from './model-progress.mjs?v=beaef781095b6f56b290';
import {externalModelDelivery} from './model-delivery.mjs';
import {registeredModelDelivery,verifyDeliveredModel} from './model-delivery-policy.mjs';
import {createV0Adapter} from './v0_adapter.mjs?v=4ee2ec34955631397cf3';
import {createV0Installations} from './v0-installations.mjs?v=055c471ab6122e9cb3fe';
import {stockV0Mods} from './v0-state.mjs?v=d07ccd54c3039984cc57';
import {v0NativeModelHash,v0NativeDependencyHash,v0NativeByteHash,guardV0NativeInstallations,guardV0NativeAdapter} from './v0-native-installed-gate.mjs?v=2801ee4ab692384c0d13';

const siteRoot=new URL('../',import.meta.url),ids=new Set(['voron_v02r1_120','voron_v02_120']);
const materials=node=>[].concat(node.material||[]);

// Same stock recipe as v0-app.js; no DOM, storage, shared-link or playback setup.
// Caller owns final whole-model centering/minY normalization, once, after assembly.
export async function loadV0DefaultLayout(machineId,{signal,onProgress=()=>{}}={}){
  if(!ids.has(machineId))throw Object.assign(Error('Unknown V0 layout machine'),{code:'LAYOUT_UNKNOWN_MACHINE'});
  signal?.throwIfAborted();
  const assets={},receipts={},owned=new Set(),root=new THREE.Group();
  root.name=`Layout default ${machineId}`;let installations,disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;
    const geometries=new Set(),mats=new Set(),textures=new Set(),installationMats=new Set();
    for(const rows of installations?.roots.values()||[])for(const r of rows)r.model.traverse(n=>{for(const m of materials(n))installationMats.add(m)});
    for(const r of [root,...owned])r.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of materials(n)){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});
    installations?.dispose();
    for(const g of geometries)g.dispose();
    for(const m of mats)if(!installationMats.has(m))m.dispose();
    for(const t of textures)t.dispose();
    for(const r of [root,...owned]){r.removeFromParent();r.clear()}owned.clear();
  }
  async function json(path){
    signal?.throwIfAborted();const url=new URL(path,siteRoot),r=await fetch(url,{signal,cache:'no-cache'});
    if(!r.ok)throw Error(`V0 layout metadata unavailable: ${path}`);
    const bytes=await r.arrayBuffer(),sha256=await v0NativeByteHash(bytes);assets[path]={sha256,bytes:bytes.byteLength};
    return {value:JSON.parse(new TextDecoder().decode(bytes)),sha256};
  }
  async function model(path,expectedHash){
    signal?.throwIfAborted();if(!expectedHash)throw Error('Missing V0 stock model source hash');
    const url=new URL(path,siteRoot).href,delivery=registeredModelDelivery(url,siteRoot.href,siteRoot,externalModelDelivery),resolved=await modelURL(url);
    const r=await fetch(resolved,{signal});if(!r.ok)throw Error(`V0 layout model unavailable: ${path}`);
    const bytes=await readModelBytes(r,{onProgress:event=>{signal?.throwIfAborted();onProgress({...event,path,ratio:event.total?event.loaded/event.total:0,phase:'download'})}});
    const gzip=bytes[0]===0x1f&&bytes[1]===0x8b;
    if(delivery&&gzip)await verifyDeliveredModel(bytes,delivery);
    const buffer=gzip?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(delivery)await verifyDeliveredModel(buffer,delivery,true);
    signal?.throwIfAborted();const sha256=await v0NativeByteHash(buffer);
    if(sha256!==expectedHash)throw Error(`V0 stock source model hash mismatch: ${path}`);
    assets[path]={sha256,bytes:buffer.byteLength};
    const gltf=await new GLTFLoader().parseAsync(buffer,new URL('.',url).href);owned.add(gltf.scene);signal?.throwIfAborted();return gltf;
  }
  try{
    // Sequential source preparation keeps only this selected printer's full scene live.
    const mf=await json(`machines/${machineId}/assembly_manifest.json`),pf=await json(`machines/${machineId}/machine_profile.json`);
    const manifest=mf.value,profile=pf.value,stockProfile=structuredClone(profile);
    if(manifest.machine_id!==machineId||profile.machine_id!==machineId)throw Error('V0 layout source identity mismatch');
    receipts['assembly_manifest.json']=mf.sha256;receipts['machine_profile.json']=pf.sha256;
    profile.stock_display_limits_mm=structuredClone(stockProfile.display_limits_mm);
    const registration=(await json('V0_INSTALLATIONS.json')).value,registry=registration.machines?.[machineId];
    if(!registry||registry.native_alternatives?.manifest_sha256!==mf.sha256||registry.native_alternatives?.model_sha256!==v0NativeModelHash(machineId))throw Error('V0 layout source registration mismatch');
    const gltf=await model(`machines/${machineId}/model.glb`,v0NativeModelHash(machineId));root.add(gltf.scene);receipts['model.glb']=v0NativeModelHash(machineId);
    const adapter=createV0Adapter(gltf.scene,manifest,profile);
    for(const node of adapter.nodes.values())node.traverse(mesh=>{
      if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
      for(const m of materials(mesh))if(m.transparent)m.depthWrite=false;
    });
    installations=await createV0Installations({scene:root,adapter,profile,registry,loadModule:async module=>{
      // Only modules genuinely requested by stock createV0Installations are loaded.
      const source=registration.sources?.[module];
      if(!source||source.external)throw Error('V0 stock source module is missing or changed');
      const metadata=await json(source.metadata||`modules/${module}/module.json`);
      if(metadata.sha256!==source.metadata_sha256)throw Error('V0 stock source module metadata hash mismatch');
      const hash=v0NativeDependencyHash(module),loaded=await model(source.glb||`modules/${module}/module.glb`,hash);
      receipts[`module:${module}`]=hash;return loaded;
    }});
    guardV0NativeInstallations(installations,{registry:{...installations.registry,sources:registration.sources},manifest,stockProfile,receipts});
    guardV0NativeAdapter(adapter,installations);
    if(!await installations.setState(stockV0Mods()))throw Error('V0 stock installation did not commit');
    // In the clean regular app, absent saved palettes means native materials.
    // Do not recolor purchased descendants or apply a local user's saved state.
    const palette={base:null,accent:null,frame:null};adapter.setPalette(palette);installations.setPalette(palette);
    adapter.setFlexibleVisible(true);adapter.setEnclosureVisible(true);installations.setEnclosureVisible(true);
    adapter.setDoorAngle(0);installations.setTophatAngle(0);
    const pose=adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
    installations.setPose(adapter.getPose());
    if(!pose.atReference||!pose.chain_visible||!pose.belts_visible)throw Error('V0 default route/reference state mismatch');
    signal?.throwIfAborted();root.updateMatrixWorld(true);
    return {root,manifest,profile,adapter,installations,source:{machineId,
      normalSourceRevision:'182cf109acf3fa867927bb017b9705e8b7dac68143e322197a4e3cf517d42391',
      recipe:'v0-app clean stock default: native MiniSB/BMG/Revo; source stock carriage display correction; exclusive native alternatives; source reference pose; door0/tophat0; panels/belts/chain visible; native hardware palette',
      mods:installations.getState(),referenceXYZ:adapter.getPose(),doorAngleDeg:adapter.door.getAngle(),tophatAngleDeg:adapter.tophat.getAngle(),
      assets,profileSource:profile.source,manifestSource:manifest.source,notices:installations.getNotes(),
      excludedNativeAlternativeKeys:[...registry.native_alternatives.excluded_keys],
      scope:'Complete selected displayed stock recipe, not raw GLB. No nonstock configuration, continuous clearance, native-solid fit or load-bearing certification.'},dispose};
  }catch(error){dispose();throw error}
}

export const loadV0Layout=loadV0DefaultLayout;

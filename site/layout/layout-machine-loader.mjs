import * as THREE from '../viewer/vendor-r180/three.module.js';
import {getLayoutEquipment} from './layout-equipment.mjs?v=6046ce679bd80e50ee2d';
import {downloadEquipmentModel,verifyEquipmentModelBytes,equipmentTransferIdentity} from './layout-equipment-transfer.mjs?v=6a62cba60f932d4aa468';
import {addU1BottomClosure} from './layout-equipment-mesh.mjs?v=dea73c8f212949571cf6';
export {layoutMachineRecipes} from '../viewer/layout-machine-recipes.mjs';

const abort = signal => signal?.throwIfAborted();
const fail = (message,code) => Object.assign(new Error(message),{code});

function disposeRoot(root) {
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(node=>{
    if(node.isInstancedMesh)node.dispose();
    if(node.geometry)geometries.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  root.removeFromParent();
  for(const geometry of geometries)geometry.dispose();
  for(const texture of textures)texture.dispose();
  for(const material of materials)material.dispose();
  root.clear();
}

async function downloadAsset(row,{signal,onProgress}) {
  return downloadEquipmentModel(row.model,{signal,onProgress});
}

async function parseAsset(bytes,row) {
  const {GLTFLoader}=await import('../viewer/vendor-r180/GLTFLoader.js');
  const url=new URL('../'+row.model.path,import.meta.url);
  return new GLTFLoader().parseAsync(bytes,new URL('.',url).href);
}

async function delegateMachine(id,options) {
  const module=await import('../viewer/layout-machine-loader.mjs?v=66846f9e2a49156dc384');
  return module.loadLayoutMachine(id,options);
}

function actualDimensions(root,row) {
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  if(box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite))
    throw fail('Empty or nonfinite equipment model','LAYOUT_EQUIPMENT_GEOMETRY');
  for(const [key,value]of [['width',size.x],['height',size.y],['depth',size.z]])
    if(Math.abs(value*1000-row.dimensionsMm[key])>.05)
      throw fail('Equipment model bounds differ from source receipt','LAYOUT_EQUIPMENT_GEOMETRY');
  if(Math.abs(box.min.y)>1e-6)throw fail('Equipment floor datum differs from source receipt','LAYOUT_EQUIPMENT_GEOMETRY');
  return {width:size.x,height:size.y,depth:size.z,xyz:size.toArray(),unit:'m',
    basis:'layout-equipment-world-bounds',min:box.min.toArray(),max:box.max.toArray()};
}

/** Injectable async boundaries keep abort/integrity/ownership tests independent. */
export function createLayoutEquipmentLoader({getEquipment=getLayoutEquipment,
  download=downloadAsset,parse=parseAsset,delegate=delegateMachine}={}) {
  let owned=null;
  return async function loadLayoutMachine(id,options={}) {
    const selected=getEquipment(id,options.equipmentVariant);
    // Existing families keep their original provider, options and disposer.
    if(!selected)return delegate(id,options);
    const transfer=equipmentTransferIdentity(selected.model);
    // Keep the validated transport base in the lease snapshot, independently
    // of the decoded model path/hash used by parsing and source identity.
    const row={...selected,model:{...selected.model,
      ...(transfer.encoding?{transfer:{...transfer}}: {})}};
    const {signal,onProgress=()=>{}}=options;
    abort(signal);
    if(owned)throw fail('Dispose the previous equipment model before loading another','LAYOUT_MODEL_STILL_OWNED');
    const lease={};owned=lease;let root=null,disposed=false;
    const emit=event=>{if(!disposed&&!signal?.aborted)onProgress(event)};
    const dispose=()=>{
      if(disposed)return;disposed=true;
      try{disposeRoot(root)}finally{root=null;if(owned===lease)owned=null}
    };
    try{
      emit({phase:'download',loaded:0,total:transfer.bytes,percent:0});
      const bytes=await download(row,{signal,onProgress:emit});
      abort(signal);
      // Injected downloads continue to return raw GLB bytes, as before.
      await verifyEquipmentModelBytes(bytes,row.model,{signal});
      const hash=row.model.sha256;
      abort(signal);emit({phase:'parse',percent:92});
      const gltf=await parse(bytes,row);root=gltf?.scene;
      if(!root?.isObject3D)throw fail('Equipment model has no scene','LAYOUT_EQUIPMENT_GEOMETRY');
      abort(signal);
      const dimensions=actualDimensions(root,row);
      const closure=addU1BottomClosure(THREE,root,row);
      const provenance={};
      for(const key of ['publicSourcesOnly','manufacturerCAD','privateSourceDerived','purchasedSourceDerived'])
        if(typeof row[key]==='boolean')provenance[key]=row[key];
      root.userData.layoutEquipment={id,equipmentVariant:row.equipmentVariant,...provenance,...(closure?{derivatives:[closure]}:{})};
      // Geometry already has the common variant/floor datum. Do not normalize,
      // recenter, rescale, reorient or replace any component matrix here.
      const source={machineId:id,category:row.privateSourceDerived?'scan-derived-layout-equipment':'public-layout-equipment',equipmentVariant:row.equipmentVariant,
        assetPath:row.model.path,sha256:hash,...provenance,...(closure?{derivatives:[closure]}:{}),
        normalization:{unit:'m',up:'+Y',front:'+Z',translation:[0,0,0],
          individual_source_matrices_unchanged:true,shared_authored_variant_datum:true}};
      emit({phase:'ready',percent:100});
      return {root,dimensions,source,manifest:row,profile:null,dispose};
    } catch(error){dispose();throw error}
  };
}

// No model, DOM, network or storage work occurs on module import.
export const loadLayoutMachine=createLayoutEquipmentLoader();

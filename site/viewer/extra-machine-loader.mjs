import {GLTFLoader} from './vendor/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs';
export async function loadExtraMachine(id){
 const response=await fetch('../EXTRA_MACHINE_ASSETS.json?v=extra-machines-55');if(!response.ok)throw Error('Machine catalog unavailable');
 const index=await response.json(),row=index.machines.find(r=>r.id===id);if(!row)throw Error('Machine unavailable');
 const base=extraAssetBase(index,import.meta.url);
 const read=async name=>JSON.parse(new TextDecoder().decode(await checkedExtraAsset(base,row.files[name])));
 const [manifest,profile,bytes,bindings]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checkedExtraAsset(base,row.files['model.glb']),row.files['belt_bindings.json']?read('belt_bindings.json'):null]);
 if(manifest.machine_id!==id||profile.machine_id!==id)throw Error('Machine identity mismatch');
 const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 return {row,root,manifest,profile,bindings};
}

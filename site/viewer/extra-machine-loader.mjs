import {GLTFLoader} from './vendor/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
export async function loadExtraMachine(id){
 const response=await fetch('../EXTRA_MACHINE_ASSETS.json?v=extra-machines-55');if(!response.ok)throw Error('Machine catalog unavailable');
 const index=await response.json(),row=index.machines.find(r=>r.id===id);if(!row)throw Error('Machine unavailable');
 const names=['assembly_manifest.json','machine_profile.json','model.glb',...(row.files['belt_bindings.json']?['belt_bindings.json']:[])],progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,row.files[n]])));
 try{
 const base=extraAssetBase(index,import.meta.url),checked=name=>checkedExtraAsset(base,row.files[name],{onProgress:e=>progress.update(name,e)});
 const read=async name=>JSON.parse(new TextDecoder().decode(await checked(name)));
 const [manifest,profile,bytes,bindings]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checked('model.glb'),row.files['belt_bindings.json']?read('belt_bindings.json'):null]);
 if(manifest.machine_id!==id||profile.machine_id!==id)throw Error('Machine identity mismatch');
 progress.assembling();const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 return {row,root,manifest,profile,bindings};
 }finally{progress.finish()}
}

import {GLTFLoader} from './vendor/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=737f5dc17ca78791c0d8';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
export async function loadCustomVoron(id){
 const response=await fetch('../CUSTOM_VORON_ASSETS.json?v=983b32b69b795444525b',{cache:'no-cache'});if(!response.ok)throw Error('Custom VORON catalog unavailable');
 const index=await response.json(),row=index.machines.find(r=>r.id===id);if(!row)throw Error('Unknown custom VORON');
 const progress=beginModelLoading(row.files),base=extraAssetBase({...index,base_url:row.base_url??index.base_url,local_directory:row.local_directory??index.local_directory},import.meta.url);
 const checked=name=>checkedExtraAsset(base,row.files[name],{onProgress:e=>progress.update(name,e)});
 try{
  const [m,p,bytes]=await Promise.all([checked('assembly_manifest.json'),checked('machine_profile.json'),checked('model.glb')]);
  const manifest=JSON.parse(new TextDecoder().decode(m)),profile=JSON.parse(new TextDecoder().decode(p));
  if(manifest.machine_id!==id||profile.machine_id!==id||profile.size_mm!==row.size||profile.display_limits_mm.Z[1]!==row.z)throw Error('Custom VORON identity mismatch');
  progress.assembling();const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;return {root,manifest,profile,row};
 }finally{progress.finish()}
}

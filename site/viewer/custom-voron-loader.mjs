import {GLTFLoader} from './vendor/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
export async function loadCustomVoron(id){
 const response=await fetch('../CUSTOM_VORON_ASSETS.json',{cache:'no-cache'});if(!response.ok)throw Error('Custom VORON catalog unavailable');
 const index=await response.json(),row=index.machines.find(r=>r.id===id);if(!row)throw Error('Unknown custom VORON');
 const progress=beginModelLoading(row.files),base=extraAssetBase(index,import.meta.url);
 const checked=name=>checkedExtraAsset(base,row.files[name],{onProgress:e=>progress.update(name,e)});
 try{
  const [m,p,bytes]=await Promise.all([checked('assembly_manifest.json'),checked('machine_profile.json'),checked('model.glb')]);
  const manifest=JSON.parse(new TextDecoder().decode(m)),profile=JSON.parse(new TextDecoder().decode(p));
  if(manifest.machine_id!==id||profile.machine_id!==id||profile.size_mm!==row.size||profile.display_limits_mm.Z[1]!==row.z)throw Error('Custom VORON identity mismatch');
  progress.assembling();const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;return {root,manifest,profile,row};
 }finally{progress.finish()}
}

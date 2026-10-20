import {GLTFLoader} from './vendor/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=7483c3e6dfe211e4d6b5';
import {beginModelLoading} from './model-progress.mjs?v=beaef781095b6f56b290';
export async function loadCustomVoron(id,{signal,progressOptions,layoutSourceIdentity=false}={}){
 const response=await fetch('../CUSTOM_VORON_ASSETS.json?v=4e8e0be172901980fd35',{cache:'no-cache',signal});if(!response.ok)throw Error('Custom VORON catalog unavailable');
 const index=await response.json(),row=index.machines.find(r=>r.id===id);if(!row)throw Error('Unknown custom VORON');
 const progress=beginModelLoading(row.files,progressOptions),base=extraAssetBase({...index,base_url:row.base_url??index.base_url,local_directory:row.local_directory??index.local_directory},import.meta.url,{publicOnly:progressOptions?.preferPublicAssets===true});
 const checked=name=>checkedExtraAsset(base,row.files[name],{signal,onProgress:e=>progress.update(name,e)});
 try{
  const [m,p,bytes]=await Promise.all([checked('assembly_manifest.json'),checked('machine_profile.json'),checked('model.glb')]);
  const manifest=JSON.parse(new TextDecoder().decode(m)),profile=JSON.parse(new TextDecoder().decode(p));
  if(manifest.machine_id!==id||profile.machine_id!==id||profile.size_mm!==row.size||profile.display_limits_mm.Z[1]!==row.z)throw Error('Custom VORON identity mismatch');
  progress.assembling();const gltf=await new GLTFLoader().parseAsync(bytes.buffer,base.href),root=gltf.scene;
  const loaded={root,manifest,profile,row};
  if(layoutSourceIdentity===true){
   const modelSpec={...row.files['model.glb']},sourceURL=new URL(modelSpec.path,base);sourceURL.searchParams.set('sha',modelSpec.sha256.slice(0,16));
   loaded.layoutParsedSource={gltf,verifiedSource:{verifiedBy:'checkedExtraAsset-v1',machineId:id,sourceURL:sourceURL.href,modelSpec,decodedBytes:bytes.byteLength}};
  }
  return loaded;
 }finally{progress.finish()}
}

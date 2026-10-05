import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
import {createCommunityAdapter} from './community-adapter.mjs?v=40219681064134f2c249';
export async function loadCommunity(index,machine,{signal}={}){
 const spec=index.machines[machine];if(!spec||spec.machine_id!==machine)throw Error('Unknown community printer');
 const names=['assembly_manifest.json','machine_profile.json','model.glb'],progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,spec.files[n]])));
 try{
 const base=extraAssetBase(index,import.meta.url),checked=name=>checkedExtraAsset(base,spec.files[name],{signal,onProgress:e=>progress.update(name,e)}),read=async name=>JSON.parse(new TextDecoder().decode(await checked(name)));
 const [manifest,profile,bytes]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checked('model.glb')]);
 if(manifest.machine_id!==machine||profile.machine_id!==machine||manifest.native_leaf_count!==spec.parts)throw Error('Native identity mismatch');
 progress.assembling();const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 return {root,manifest,profile,adapter:createCommunityAdapter(root,manifest,profile)};
 }finally{progress.finish()}
}

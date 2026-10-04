import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs';
import {createCommunityAdapter} from './community-adapter.mjs?v=420fdb82805ba6940d9f';
export async function loadCommunity(index,machine,{signal}={}){
 const spec=index.machines[machine];if(!spec||spec.machine_id!==machine)throw Error('Unknown community printer');
 const base=extraAssetBase(index,import.meta.url),read=async name=>JSON.parse(new TextDecoder().decode(await checkedExtraAsset(base,spec.files[name],{signal})));
 const [manifest,profile,bytes]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checkedExtraAsset(base,spec.files['model.glb'],{signal})]);
 if(manifest.machine_id!==machine||profile.machine_id!==machine||manifest.native_leaf_count!==spec.parts)throw Error('Native identity mismatch');
 const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 return {root,manifest,profile,adapter:createCommunityAdapter(root,manifest,profile)};
}

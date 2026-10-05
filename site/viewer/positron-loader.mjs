import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs';
import {createPositronAdapter} from './positron-fold.mjs?v=04edc193d74fda9ebab3';
export async function loadPositron(index,{signal}={}){
 if(index.machine_id!=='positron_v322'||index.parts!==1314)throw Error('Invalid Positron catalog');
 const base=extraAssetBase(index,import.meta.url),read=async name=>JSON.parse(new TextDecoder().decode(await checkedExtraAsset(base,index.files[name],{signal})));
 const [manifest,profile,bytes]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checkedExtraAsset(base,index.files['model.glb'],{signal})]);
 if(manifest.machine_id!==index.machine_id||profile.machine_id!==index.machine_id)throw Error('Positron identity mismatch');
 const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 root.traverse(n=>{if(n.isMesh){n.frustumCulled=false;n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of [].concat(n.material))if(m.transparent)m.depthWrite=false}});
 return {root,manifest,profile,adapter:createPositronAdapter(root,manifest,profile)};
}

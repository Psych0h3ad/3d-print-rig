import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
import {createPositronAdapter} from './positron-fold.mjs?v=7368d3dd6e38e237f6ff';
export async function loadPositron(index,{signal}={}){
 if(index.machine_id!=='positron_v322'||index.parts!==1314)throw Error('Invalid Positron catalog');
 const names=['assembly_manifest.json','machine_profile.json','model.glb'],progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,index.files[n]])));
 try{
 const base=extraAssetBase(index,import.meta.url),checked=name=>checkedExtraAsset(base,index.files[name],{signal,onProgress:e=>progress.update(name,e)}),read=async name=>JSON.parse(new TextDecoder().decode(await checked(name)));
 const [manifest,profile,bytes]=await Promise.all([read('assembly_manifest.json'),read('machine_profile.json'),checked('model.glb')]);
 if(manifest.machine_id!==index.machine_id||profile.machine_id!==index.machine_id)throw Error('Positron identity mismatch');
 progress.assembling();const root=(await new GLTFLoader().parseAsync(bytes.buffer,base.href)).scene;
 root.traverse(n=>{if(n.isMesh){n.frustumCulled=false;n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of [].concat(n.material))if(m.transparent)m.depthWrite=false}});
 return {root,manifest,profile,adapter:createPositronAdapter(root,manifest,profile)};
 }finally{progress.finish()}
}

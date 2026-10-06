import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=8bb3ff6d2cd5d181cc98';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=cb20fe4599d236ba43b3';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
import {loadSiboorRegistration} from './siboor-catalog.mjs?v=c59d93be54e1c7637a63';
export {siboorMachine,loadSiboorRegistration} from './siboor-catalog.mjs?v=c59d93be54e1c7637a63';
export async function loadSiboorAssembly(machine){
 const loader=new GLTFLoader();
 if(machine==='siboor_trident_350'){
  const read=async file=>{const r=await fetch('../'+file,{cache:'no-cache'});if(!r.ok)throw Error(file);return r.json()};
  return Promise.all([read('assembly_manifest.json'),read('flexible_routes.json'),loadModel(loader,'../SIBOOR_Trident_350.glb'),loadModel(loader,'../Endstop_Mechanisms.glb'),read('COLOR_OPTIONS.json'),read('ASSEMBLY_CONFIGURATIONS.json'),read('R2_ENDSTOP_REGISTRATION.json')]);
 }
 if(machine!=='siboor_trident_300')throw Error('Unknown SIBOOR Trident');
 const index=await loadSiboorRegistration(),row=index.machines[machine];if(!row||row.machine_id!==machine)throw Error('Missing native 300 mm assembly');
 const names=['assembly_manifest.json','flexible_routes.json','model.glb','endstops.glb','COLOR_OPTIONS.json','configurations.json','R2_ENDSTOP_REGISTRATION.json'];
 const progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,row.files[n]])));
 try{
 const base=extraAssetBase(index,import.meta.url),checked=name=>checkedExtraAsset(base,row.files[name],{onProgress:e=>progress.update(name,e)});
 const data=await Promise.all(names.map(checked)),decode=bytes=>JSON.parse(new TextDecoder().decode(bytes));
 const manifest=decode(data[0]),config=decode(data[5]);
 if(manifest.machine_id!==machine||manifest.size_mm!==300||config.machine_id!==machine||manifest.parts.length!==row.parts)throw Error('SIBOOR 300 CAD identity mismatch');
 progress.assembling();
 return [manifest,decode(data[1]),await loader.parseAsync(data[2].buffer,base.href),await loader.parseAsync(data[3].buffer,base.href),decode(data[4]),config,decode(data[6])];
 }finally{progress.finish()}
}

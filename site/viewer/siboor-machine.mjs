import {siboorAlphaModelOptions,assertSiboorRawInput} from './trinity-alpha-siboor-r2.mjs?v=7377fc89cd34dfec5f0f';
import {contentSHA256} from './mount-validation.mjs';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=3a71971c97a749c16228';
import {extraAssetBase,checkedExtraAsset} from './extra-asset-integrity.mjs?v=7483c3e6dfe211e4d6b5';
import {beginModelLoading} from './model-progress.mjs?v=beaef781095b6f56b290';
import {loadSiboorRegistration} from './siboor-catalog.mjs?v=dafca8864d4061d9dc21';
export {siboorMachine,loadSiboorRegistration} from './siboor-catalog.mjs?v=dafca8864d4061d9dc21';
export async function loadSiboorAssembly(machine,{signal,progressOptions,onProgress}={}){
 const loader=new GLTFLoader();
 if(machine==='siboor_trident_350'){
  const read=async file=>{const r=await fetch('../'+file,{cache:'no-cache',signal});if(!r.ok)throw Error(file);const text=await r.text();assertSiboorRawInput(machine,file,await contentSHA256(text));return JSON.parse(text)};
  return Promise.all([read('assembly_manifest.json'),read('flexible_routes.json'),loadModel(loader,'../SIBOOR_Trident_350.glb',undefined,{...siboorAlphaModelOptions(machine),signal,progressOptions}),loadModel(loader,'../Endstop_Mechanisms.glb',onProgress,{signal,progressOptions}),read('COLOR_OPTIONS.json'),read('ASSEMBLY_CONFIGURATIONS.json'),read('R2_ENDSTOP_REGISTRATION.json')]);
 }
 if(machine!=='siboor_trident_300')throw Error('Unknown SIBOOR Trident');
 const index=await loadSiboorRegistration(),row=index.machines[machine];if(!row||row.machine_id!==machine)throw Error('Missing native 300 mm assembly');
 const names=['assembly_manifest.json','flexible_routes.json','model.glb','endstops.glb','COLOR_OPTIONS.json','configurations.json','R2_ENDSTOP_REGISTRATION.json'];
 const progress=beginModelLoading(Object.fromEntries(names.map(n=>[n,row.files[n]])),progressOptions);
 try{
 const base=extraAssetBase(index,import.meta.url,{publicOnly:progressOptions?.preferPublicAssets===true}),checked=name=>checkedExtraAsset(base,row.files[name],{signal,onProgress:e=>progress.update(name,e)});
 const data=await Promise.all(names.map(checked)),decode=bytes=>JSON.parse(new TextDecoder().decode(bytes));
 if(row.files['model.glb'].decoded_sha256!==siboorAlphaModelOptions(machine).verifySha256)throw Error('Trinity SIBOOR actual decoded host model identity mismatch');
 assertSiboorRawInput(machine,'assembly_manifest.json',await contentSHA256(new TextDecoder().decode(data[0])));assertSiboorRawInput(machine,'configurations.json',await contentSHA256(new TextDecoder().decode(data[5])));
 const manifest=decode(data[0]),config=decode(data[5]);
 if(manifest.machine_id!==machine||manifest.size_mm!==300||config.machine_id!==machine||manifest.parts.length!==row.parts)throw Error('SIBOOR 300 CAD identity mismatch');
 progress.assembling();
 return [manifest,decode(data[1]),await loader.parseAsync(data[2].buffer,base.href),await loader.parseAsync(data[3].buffer,base.href),decode(data[4]),config,decode(data[6])];
 }finally{progress.finish()}
}

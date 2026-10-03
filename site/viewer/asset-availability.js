import {setupPublicInfo} from './public-info.js?v=standard-step-42';
import {modelURL} from './model-loader.js?v=trident-clearance-35';

const files={
  siboor_trident_350:['../assembly_manifest.json?v=trident-clearance-35','../ASSEMBLY_CONFIGURATIONS.json?v=trident-clearance-35','../SIBOOR_Trident_350.glb'],
  siboor_v24_350:['../machines/siboor_v24_350/assembly_manifest.json','../machines/siboor_v24_350/machine_profile.json','../machines/siboor_v24_350/model.glb'],
};
export async function machineAssetsAvailable(machine){
  const results=await Promise.all(files[machine].map(async path=>{
    try{const url=path.endsWith('.glb')?await modelURL(path):path;const response=await fetch(url,{method:'HEAD',cache:'no-cache'});return response.ok||url!==path&&(await fetch(path,{method:'HEAD',cache:'no-cache'})).ok;}catch{return false;}
  }));
  return results.every(Boolean);
}
export async function showMissingAssets(){
  document.body.dataset.assetStatus='missing';
  for(const id of ['loading','status']){const status=document.getElementById(id);if(status)status.remove();}
  const stage=document.querySelector('#stage'),panel=document.createElement('div');panel.className='missing-assets';panel.setAttribute('role','status');
  const title=document.createElement('h2');title.textContent='モデルデータを追加すると表示できます';
  const description=document.createElement('p');description.textContent='このソース配布には3Dモデルを同梱していません。手元の開発出力を取り込んでから、ページを再読み込みしてください。';
  const link=document.createElement('a');link.href='https://github.com/Psych0h3ad/3d-print-rig/blob/main/scripts/import_local_assets.py';link.textContent='モデルのインポートスクリプト';
  panel.append(title,description,link);stage.append(panel);
  for(const button of stage.querySelectorAll('.view-tools button'))button.disabled=true;
  for(const id of ['saveConfiguration','night','enclosure','belts']){const control=document.getElementById(id);if(control)control.disabled=true;}
  for(const id of ['configStatus','appearanceStatus','headStatus','headNotes','lightStatus','paletteStatus']){
    const control=document.getElementById(id);if(control)control.textContent='';
  }
  const badge=document.getElementById('badge');if(badge)badge.textContent='SOURCE PREVIEW';
  await setupPublicInfo();
}

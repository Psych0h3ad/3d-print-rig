import * as THREE from 'three';

export function setupAppearance(stockMeshes,optionalScene,spec){
 const $=s=>document.querySelector(s),roles=['base','accent','frame'];
 const storageKey='siboor-trident-350-appearance-v1';
 const targets={base:[],accent:[],frame:[]},protectedMeshes=[],cncMeshes=[];
 const cncKeys=new Set(spec.cnc_keys||[]);
 const membership=new Map(roles.flatMap(role=>spec.groups[role].map(key=>[key,role])));
 function registerMeshes(meshes){for(const mesh of meshes){
  if(originals.has(mesh))continue;
  const role=mesh.userData.appearance_role||membership.get(mesh.userData.partKey);
  if(role)targets[role].push(mesh);else if(cncKeys.has(mesh.userData.partKey))cncMeshes.push(mesh);else protectedMeshes.push(mesh);
  originals.set(mesh,{color:mesh.material.color.clone(),metallic:mesh.material.metalness,roughness:mesh.material.roughness,opacity:mesh.material.opacity});
 }apply()}
 optionalScene?.traverse(mesh=>{if(mesh.isMesh){if(spec.optional_printed_roles.includes(mesh.userData.led_role))targets.base.push(mesh);else protectedMeshes.push(mesh)}});
 const originals=new Map([...roles.flatMap(role=>targets[role]),...protectedMeshes].map(mesh=>[mesh,{color:mesh.material.color.clone(),metallic:mesh.material.metalness,roughness:mesh.material.roughness,opacity:mesh.material.opacity}]));
 const defaults={base:'#24272c',accent:'#e32636',frame:'#25282d'};
 let state={...defaults},cncFinish='black',storageAvailable=true;
 const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(saved?.schema==='siboor-appearance-v1'&&saved.model===spec.model){for(const role of roles)if(validColor(saved.colors?.[role]))state[role]=saved.colors[role].toLowerCase();if(['black','silver'].includes(saved.cnc_finish))cncFinish=saved.cnc_finish}
 }catch{storageAvailable=false}
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({schema:'siboor-appearance-v1',model:spec.model,colors:state,cnc_finish:cncFinish}));storageAvailable=true}catch{storageAvailable=false}}
 function apply(){
  for(const role of roles){
   for(const mesh of targets[role]){
    const original=originals.get(mesh);
    if(state[role])mesh.material.color.set(state[role]);else mesh.material.color.copy(original.color);
   }
   $('#'+role+'Color').value=state[role]||spec.default_inputs[role];
   $('#'+role+'Hex').value=state[role]||spec.default_inputs[role];
   $('#'+role+'Hex').removeAttribute('aria-invalid');
  }
  for(const mesh of cncMeshes){mesh.material.color.set(cncFinish==='silver'?'#b9bec4':'#24272c');mesh.material.metalness=.75;mesh.material.roughness=.32}
  $('#cncFinish').value=cncFinish;$('#cncFinish').disabled=false;
  $('#frameFinish').value=state.frame==='#b9bec4'?'silver':state.frame==='#25282d'?'black':'custom';
  $('#frameFinish').disabled=false;
  const matchedPreset=spec.presets.find(p=>roles.every(role=>p[role]?.toLowerCase()===state[role]));
  $('#colorPreset').value=roles.every(role=>state[role]===defaults[role])?'original':matchedPreset?.id||'custom';
  $('#appearanceStatus').textContent=storageAvailable?'配色を自動保存':'この画面に適用中';
  let changedProtected=0;
  for(const mesh of protectedMeshes)if(!mesh.material.color.equals(originals.get(mesh).color))changedProtected++;
  const status=$('#appearanceStatus');
  for(const role of roles){status.dataset[role+'Color']=state[role]||'original';status.dataset[role+'Meshes']=targets[role].length}
  status.dataset.protectedChanges=changedProtected;
  status.dataset.cncFinish=cncFinish;status.dataset.cncMeshes=cncMeshes.length;
  status.dataset.cncColor=cncMeshes.length?'#'+cncMeshes[0].material.color.getHexString():'';
  status.dataset.stockSbBaseColors=JSON.stringify([...new Set(targets.base.filter(m=>m.userData.stockGroup==='03_Stock_Stealthburner_CW2_Rapido2_UHF').map(m=>'#'+m.material.color.getHexString()))]);
  status.dataset.storage=storageAvailable?'available':'unavailable';
 }
 const presetSelect=$('#colorPreset');
 for(const preset of spec.presets){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;presetSelect.appendChild(option)}
 for(const role of roles){
  $('#'+role+'Color').disabled=false;$('#'+role+'Hex').disabled=false;
  $('#'+role+'Color').addEventListener('input',event=>{state[role]=event.target.value;presetSelect.value='custom';save();apply()});
  const hex=$('#'+role+'Hex');
  hex.addEventListener('input',()=>{
   if(!validColor(hex.value)){hex.setAttribute('aria-invalid','true');$('#appearanceStatus').textContent='色は #RRGGBB の6桁で入力してください';return}
   state[role]=hex.value.toLowerCase();presetSelect.value='custom';save();apply();
  });
  hex.addEventListener('change',()=>{if(!validColor(hex.value))apply()});
 }
 presetSelect.disabled=false;
 presetSelect.addEventListener('change',()=>{
  if(presetSelect.value==='original')state={...defaults};
  else{const preset=spec.presets.find(p=>p.id===presetSelect.value);if(!preset)return;for(const role of roles)state[role]=preset[role]}
  save();apply();
 });
 $('#resetColors').disabled=false;$('#exportColors').disabled=false;
 $('#resetColors').onclick=()=>{state={...defaults};cncFinish='black';presetSelect.value='original';save();apply()};
 $('#cncFinish').onchange=e=>{cncFinish=e.target.value;save();apply()};
 $('#frameFinish').onchange=e=>{if(e.target.value==='custom')return;state.frame=e.target.value==='silver'?'#b9bec4':'#25282d';presetSelect.value='custom';save();apply()};
 $('#exportColors').onclick=()=>{
  const data={schema:'siboor-appearance-v1',model:spec.model,colors:{...state},cnc_finish:cncFinish,groups:spec.groups,optional_printed_roles:spec.optional_printed_roles,scope:'Viewer appearance only. Stock STEP is unchanged.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='SIBOOR_350_Palette.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('#appearanceScope').textContent=`印刷部品：ベース${spec.groups.base.length}点・アクセント${spec.groups.accent.length}点。フレーム${spec.groups.frame.length}本（ドア・ベッド支持材を含む）。Discoの印刷ブラケットとXolの印刷部品も配色に連動します。`;
 registerMeshes(stockMeshes);
 return {registerMeshes,colors:()=>({...state})};
}

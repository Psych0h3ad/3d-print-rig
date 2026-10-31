import{restoreCamera,validateSavedView}from './source-assembly-view-state.mjs?v=fd9ad51b6102c745bc55';

export function selectSourceCameraPreset(tools,id=null){
 for(const button of tools.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.id===id));
}

export function bindSourceConfigurationLoad({file,machine,load,camera,controls,tools,render,messages,status,task}){
 file.onchange=()=>task(async()=>{
  const selected=file.files?.[0];
  if(!selected)return;
  try{
   if(selected.size>2*1024*1024)throw Error('Configuration too large');
   const saved=validateSavedView(JSON.parse(await selected.text()),machine);
   const result=await load(saved.view,saved.settings);
   if(!result)throw Error('Rejected');
   restoreCamera(saved.settings.camera,camera,controls);
   // A saved camera can be any orbit, target or zoom. Do not infer a preset
   // from its up vector or retain the preset used before loading the file.
   selectSourceCameraPreset(tools);
   messages.set(status,result.migrated?'migrated':'loaded');
   render();
  }catch{
   messages.set(status,'unsafe');
  }finally{
   file.value='';
  }
 });
}

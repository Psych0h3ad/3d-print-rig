// UI state follows a completed source-controller transition. Drawing is postcommit.
export function createSourceStageNavigation({index,assemblyMode,controls,getWorkbench,manualText,previewText,fit,viewNodes,render,onFailure,onSuccess,isActive=()=>true}){
 let active=true,last=null;
 const enabled=()=>active&&isActive();
 const copy=s=>({...s,visible_keys:[...s.visible_keys]});
 function sync(state){
  const stage=index.stage(state.index),{select,previous,next,manual,position,positionValue,preview,body}=controls;
  select.value=String(stage.index);previous.disabled=stage.index===0;next.disabled=stage.index===index.stages.length-1;manual.href=index.manual.url+'#page='+stage.page_start;
  if(assemblyMode){position.value=String(stage.index);positionValue.textContent=(stage.index+1)+' / '+index.stages.length;preview.setAttribute('aria-pressed',String(Boolean(state.preview)));preview.textContent=previewText(Boolean(state.preview));body.dataset.assemblyStage=stage.id}
 }
 function reject(error){
  if(!enabled())return false;const errors=[error];if(last)try{sync(last)}catch(e){errors.push(e)}
  try{render()}catch(e){errors.push(e)}if(enabled())onFailure?.(errors.length===1?error:new AggregateError(errors,'Source controls could not be restored'),{committed:false});return false;
 }
 function finish(state){
  last=copy(state);const errors=[],run=fn=>{if(!enabled())return;try{fn()}catch(e){errors.push(e)}};
  run(()=>{last.manual_text=manualText(index.stage(last.index))});run(()=>sync(last));run(()=>getWorkbench().update(copy(last)));
  run(()=>{if(state.presentation_frame_changed){const nodes=state.preview?viewNodes():index.parts(state.index).flatMap(p=>index.getPartNodes(p.key));fit(nodes.length?nodes:viewNodes())}});run(render);
  if(!enabled())return true;
  if(errors.length)onFailure?.(new AggregateError(errors,'Source view display update failed'),{committed:true});else onSuccess?.();
  return true;
 }
 function show(value){if(!enabled())return false;let state;try{const stage=index.stage(value);state=assemblyMode?index.setStage(stage.index):index.state(stage.index)}catch(error){return reject(error)}return finish(state)}
 function togglePreview(){if(!enabled()||!assemblyMode)return false;if(last?.preview)return show(last.index);let state;try{state=index.previewComplete()}catch(error){return reject(error)}return finish(state)}
 return Object.freeze({show,togglePreview,refresh(){if(!enabled()||!last)return false;return finish({...last,presentation_frame_changed:false})},snapshot:()=>last?copy(last):null,dispose(){active=false}});
}

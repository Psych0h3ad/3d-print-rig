import {formatMessage} from './i18n.mjs?v=628c8b0455eaed91f60d';
import {snapshotHeadSurfaces,planSurfaceSelection} from './step-surface-selection.mjs?v=99fdb3edc79bb961c411';
import {writeSurfaceStep} from './step-surface-writer.mjs?v=4d714d06ec9ba241a3a9';
import {packageSurfaceStep} from './step-surface-package.mjs?v=c2c0efb2bf37c85bb3f7';
import {boundedSha256} from './bounded-sha256.mjs?v=61cd1fa2895a71447920';
export function setupSurfaceStep({button,scope,getSnapshot,isBusy}){
 button.disabled=false;
 const dialog=document.createElement('dialog');dialog.className='step-surface-dialog';dialog.setAttribute('aria-labelledby','surfaceStepTitle');
 const key=id=>id==='close'?'text.1234':id==='cancel'?'source_assembly.cancel':'surface.'+id;
 const t=(id,v={})=>formatMessage(key(id),v,document.documentElement.lang||'en');
 const el=(tag,id)=>{const n=document.createElement(tag);if(id){n.dataset.i18nId=key(id);n.textContent=t(id)}return n};
 const header=el('div');header.className='dialog-head';const title=el('h2','title');title.id='surfaceStepTitle';const close=el('button','close');header.append(title,close);
 const body=el('div');body.className='dialog-body';const note=el('p','scope'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const lists=el('div'),progress=el('progress');progress.max=100;progress.value=0;progress.hidden=true;
 const download=el('button','download'),cancel=el('button','cancel'),actions=el('div');actions.className='buttons surface-step-actions';actions.append(download,cancel);body.append(note,status,progress,lists);dialog.append(header,body,actions);document.body.append(dialog);
 let abortController,plan,context,policy,license,url,disposed=false;
 const abort=()=>abortController?.abort();const revoke=()=>{if(url){URL.revokeObjectURL(url);url=null}};
 const stop=()=>{abort();dialog.close()};close.onclick=stop;cancel.onclick=stop;dialog.addEventListener('cancel',abort);dialog.addEventListener('close',()=>{abort();revoke();plan=null;context=null;download.disabled=true});
  scope.cleanup(()=>{disposed=true;abort();revoke();plan=null;context=null;button.disabled=true;button.onclick=null;dialog.remove()});
 const load=async(signal)=>{
  const [r,l]=await Promise.all([fetch(new URL('./step-surface-sources.json',import.meta.url),{signal,cache:'no-cache'}),fetch(new URL('../licenses/step-surface-gpl-3.0.txt',import.meta.url),{signal,cache:'no-cache'})]);
  if(!r.ok||!l.ok)throw Error('Export sources unavailable');return [await r.json(),await l.text()];
 };
 const active=(controller)=>!disposed&&abortController===controller&&!controller.signal.aborted&&dialog.open;
 button.onclick=async()=>{
  if(isBusy()||disposed)return;
  abort();revoke();plan=null;lists.replaceChildren();download.disabled=true;progress.hidden=true;status.textContent=t('checking');dialog.showModal();
  const controller=new AbortController();abortController=controller;
  try{
   const [nextPolicy,nextLicense]=await load(controller.signal);if(!active(controller))return;if(isBusy())throw Error('Selection is changing');policy=nextPolicy;license=nextLicense;
   context=getSnapshot(policy);
   if(context.bankEnabled)throw Error('Tool banks are not included in this export');
   const nextPlan=await planSurfaceSelection(snapshotHeadSurfaces({...context,policy}),policy,{signal:controller.signal});if(!active(controller))return;plan=nextPlan;
   status.textContent=t('counts',[plan.counts.included,plan.counts.selected,plan.counts.omitted]);const zeros=plan.included.reduce((n,p)=>n+p.zeroAreaTriangles.length,0);if(zeros)status.textContent+=' '+t('zero_area',[zeros]);download.disabled=!plan.included.length;
   for(const [id,rows]of [['included',plan.included],['omissions',plan.omitted]]){
    const heading=el(id==='included'?'h3':'summary',id),list=el('ul');if(id==='included')list.className='step-surface-parts';
    for(const p of rows){const item=el('li'),name=el('span');name.dataset.i18n='off';name.textContent=p.name.replaceAll('_',' ');name.title=p.id;item.append(name);
     if(id==='omissions'){item.append(' ',el('span',p.sourceStatus==='component-origin-unresolved'?'unresolved_origin':p.reason==='source-geometry-changed'?'changed_geometry':'unsupported_geometry'));const href=p.sourceURL||p.referenceURL;if(href){const a=el('a',p.sourceURL?'source':'reference');a.href=href;a.target='_blank';a.rel='noopener';item.append(' ',a)}}
     list.append(item);
    }
    if(id==='omissions'){const details=el('details');details.append(heading,list);lists.append(details)}else lists.append(heading,list);
   }
   if(!plan.included.length)status.textContent=t('no_parts');
  }catch(error){if(active(controller))status.textContent=t('error');if(error.name!=='AbortError')console.warn('STEP preview',error)}
 };
 download.onclick=async()=>{
  if(!plan?.included.length||download.disabled)return;
  const controller=abortController,exportPlan=plan,exportContext=context,exportPolicy=policy,exportLicense=license;download.disabled=true;progress.hidden=false;progress.value=0;status.textContent=t('working');
  try{
   const output=await writeSurfaceStep(exportPlan.included,{signal:controller.signal,onProgress:p=>{if(active(controller))progress.value=100*p.emittedTriangles/(p.triangles||1)}});
   if(!active(controller))return;
   const codeFiles=[];
   for(const row of exportPolicy.generator){const r=await fetch(new URL(row.path,import.meta.url),{signal:controller.signal,cache:'no-cache'});if(!r.ok)throw Error('Generator source unavailable');const bytes=new Uint8Array(await r.arrayBuffer());if(await boundedSha256(bytes)!==row.sha256)throw Error('Generator source changed');codeFiles.push({name:row.name,blob:new Blob([bytes])})}
   const result=await packageSurfaceStep(exportPlan,output,{configuration:exportContext.configuration,policy:exportPolicy,license:exportLicense,codeFiles,signal:controller.signal});if(!active(controller))return;
   revoke();url=URL.createObjectURL(result.blob);const a=el('a');a.href=url;a.download='3D_Print_Rig_Selected_Surfaces.zip';a.click();progress.value=100;status.textContent=t('saved');
   dialog.dataset.exportIncluded=String(exportPlan.counts.included);dialog.dataset.exportTriangles=String(output.triangles);dialog.dataset.exportConfiguration=exportContext.configuration;
  }catch(error){if(active(controller))status.textContent=t('error');if(error.name!=='AbortError')console.warn('STEP export',error)}
  finally{if(active(controller))download.disabled=!plan?.included.length}
 };
 return {dialog};
}

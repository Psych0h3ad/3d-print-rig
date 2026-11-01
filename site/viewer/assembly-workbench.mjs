import {createAssemblyProgress,assemblyProgressStorageKey,legacyAssemblyProgressStorageKey,validateAssemblyProgress} from './assembly-workbench-model.mjs?v=3d7847235f8ba9eef043';
import {assemblyWorkbenchMessages as messages} from './assembly-workbench-messages.mjs?v=7e07287f50f81274d235';

import {assemblyPartRows} from './assembly-part-review.mjs';
import {assemblyProgressNeedsMigration,previousAssemblyProgressStorageKeys} from './assembly-progress-migrations.mjs';

// UI state describes the reader's checklist, never a mechanical validation.
// Native visibility and camera changes stay with the viewer's stage controller.
export function createAssemblyWorkbench({container,index,legacy,bannerHost,onStage,onFocusPart,onReveal,format,translate,storage,download}={}){
 const doc=container.ownerDocument,win=doc.defaultView,root=doc.createElement('section');root.className='assembly-workbench';root.setAttribute('data-i18n','off');
 const oldStageLabel=container.querySelector('label[for="assemblyStage"]');if(oldStageLabel)oldStageLabel.hidden=true;
 const listeners=[],listen=(n,event,fn)=>{n.addEventListener(event,fn);listeners.push(()=>n.removeEventListener(event,fn))};
 const element=(tag,cls,parent=root)=>{const n=doc.createElement(tag);if(cls)n.className=cls;parent.append(n);return n};
 const bindings=[],msg=(n,key,values=[])=>{bindings.push({n,key,values});return n},button=(key,fn,parent=root)=>{const n=msg(element('button','',parent),key);n.type='button';listen(n,'click',fn);return n};
 const say=(key,values=[])=>format(messages[key],values),key=assemblyProgressStorageKey(index);let sessionOnly=false,notice='',progress=createAssemblyProgress(index),resumed=false,manualUpdated=false,active=false,state=null,selected=null,limit=40,undo=null,resultSignature='',hardwareOnly=false,remainingOnly=false;
 try{const saved=[key,legacyAssemblyProgressStorageKey(index),...previousAssemblyProgressStorageKeys(index)].map(k=>storage?.getItem(k)).find(Boolean);if(saved){const value=JSON.parse(saved);progress=createAssemblyProgress(index,value);manualUpdated=assemblyProgressNeedsMigration(index,value.identity);resumed=true}}catch{sessionOnly=true}
 const heading=element('div','assembly-workbench-heading'),number=element('span','assembly-stage-number',heading),title=element('h2','',heading);
 const meter=element('progress','assembly-progress');meter.max=index.stages.length;
 const summary=element('div','assembly-progress-summary'),progressText=element('span','',summary),checkLabel=element('label','assembly-check'),check=element('input','',checkLabel);check.type='checkbox';const checkText=msg(element('span','',checkLabel),'mark_done');
 const nav=element('div','assembly-stage-nav');nav.append(legacy.previous,legacy.next,legacy.focus);
 root.append(legacy.note,legacy.manual);
 const sourceCount=element('p','assembly-source-count');
 const searchLabel=msg(element('label','assembly-search-label'),'search'),search=element('input','assembly-search');search.id='assemblyWorkbenchSearch';searchLabel.setAttribute('for',search.id);search.type='search';search.autocomplete='off';
 const results=element('div','assembly-stage-results');results.setAttribute('aria-label',say('search'));const empty=element('p','assembly-search-empty');empty.hidden=true;
 const outline=element('details','assembly-outline'),outlineLabel=msg(element('summary','',outline),'all_steps',[index.stages.length]);outline.append(legacy.select);
 const partTitle=msg(element('h3'),'items'),partSummary=element('p','assembly-part-summary'),partTools=element('div','assembly-part-tools'),hardware=button('hardware_filter',()=>{hardwareOnly=!hardwareOnly;limit=40;renderParts()},partTools),remaining=button('remaining_filter',()=>{remainingOnly=!remainingOnly;limit=40;renderParts()},partTools),nextPart=button('next_part',()=>{const rows=assemblyPartRows(index,state.index),done=new Set(progress.snapshot().checked_parts),visible=new Set(state.visible_keys),pending=rows.filter(r=>visible.has(r.key)&&!done.has(r.key)&&(!hardwareOnly||r.fastener));const i=pending.findIndex(r=>r.key===selected),row=pending[(i+1)%pending.length];if(row){select(row.key,{reveal:true});onFocusPart(row.key)}},partTools),partNote=msg(element('p','assembly-part-note'),'part_note'),items=element('div','assembly-parts'),more=button('more',()=>{limit+=40;renderParts()},root);
 const selection=element('section','assembly-selection'),selectionTitle=msg(element('h3','',selection),'selected'),selectedName=element('p','assembly-part-name',selection),selectedPath=element('p','assembly-part-path',selection),jump=button('part_step',()=>{if(selected)onStage(index.owner(selected).index)},selection),focus=button('focus_part',()=>{if(selected)onFocusPart(selected)},selection);selection.hidden=true;const partCheck=button('check_part',()=>{if(active&&selected){progress.togglePart(selected);undo=null;notice='';persist();refresh()}},selection);
 const related=element('label','assembly-related-stage',selection),relatedLabel=msg(element('span','',related),'related_stages'),relatedSelect=element('select','',related);related.hidden=true;listen(relatedSelect,'change',()=>{if(active){const key=selected;onStage(index.stage(relatedSelect.value).index);if(key)select(key)}});
 const hint=msg(element('p','assembly-pick-hint'),'pick_hint');
 const actions=element('details','assembly-progress-actions'),actionsLabel=msg(element('summary','',actions),'progress',[0,index.stages.length]),actionRow=element('div','assembly-action-row',actions);
 const save=button('save',()=>download(`${index.identity.machine}-assembly-progress.json`,JSON.stringify(progress.snapshot(),null,2)+'\n'),actionRow),load=button('load',()=>file.click(),actionRow),file=element('input','',actions);file.type='file';file.accept='.json,application/json';file.hidden=true;
 const clear=button('clear',()=>{undo=progress.clearChecks();notice='clear_note';persist();refresh()},actions),undoButton=button('undo',()=>{if(undo){progress.restore({...undo,current_stage:progress.snapshot().current_stage});undo=null;notice='';persist();refresh()}},actions);
 const storageNote=element('p','assembly-storage-note',actions),status=element('p','assembly-progress-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(legacy.finish);container.append(root);
 const searchRegion=element('div','assembly-search-region');searchRegion.append(searchLabel,search);
 root.replaceChildren(searchRegion,results,empty,heading,meter,summary,checkLabel,nav,legacy.note,legacy.manual,sourceCount,selection,partTitle,partSummary,partTools,partNote,items,more,hint,outline,actions,status,legacy.finish);
 const banner=doc.createElement('div');banner.className='assembly-active-banner';banner.setAttribute('data-i18n','off');banner.hidden=true;const bannerText=element('span','',banner),reveal=button('view',()=>onReveal?.(),banner),exit=element('button','',banner);exit.type='button';listen(exit,'click',()=>legacy.finish.click());bannerHost?.append(banner);
 function persist(){try{if(!storage)sessionOnly=true;else storage.setItem(key,JSON.stringify(progress.snapshot()))}catch{sessionOnly=true}}
 function renderResults(){
  const found=search.value.trim()?index.search(search.value,translate):[],signature=found.map(s=>s.id).join('|');
  if(signature!==resultSignature){results.replaceChildren(...found.map(s=>{const n=doc.createElement('button');n.type='button';n.dataset.stage=s.id;n.addEventListener('click',()=>{if(active)onStage(s.index)});return n}));resultSignature=signature}
  const saved=progress.snapshot();for(const n of results.children){const s=index.stage(n.dataset.stage);n.textContent=`${String(s.index+1).padStart(2,'0')}  ${translate(s.title)}`;n.setAttribute('aria-current',String(s.id===saved.current_stage));n.dataset.checked=String(saved.checked_stages.includes(s.id))}
  results.hidden=!search.value.trim();empty.hidden=!search.value.trim()||found.length>0;empty.textContent=say('no_results');
 }
 function renderParts(){
  if(!state)return;
  const focused=doc.activeElement?.dataset?.partCheck,visible=new Set(state.visible_keys),checked=new Set(progress.snapshot().checked_parts),all=assemblyPartRows(index,state.index),shown=all.filter(r=>visible.has(r.key)),tokens=search.value.normalize('NFKD').toLowerCase().split(/\s+/).filter(Boolean);
  const parts=all.filter(r=>(!hardwareOnly||r.fastener)&&(!remainingOnly||!checked.has(r.key))&&tokens.every(t=>[r.part.name,r.part.key,...r.part.path].join(' ').normalize('NFKD').toLowerCase().includes(t))),rows=parts.slice(0,limit);items.replaceChildren();
  partSummary.textContent=say('part_progress',[shown.filter(r=>checked.has(r.key)).length,shown.length,shown.filter(r=>r.fastener).length]);
  hardware.setAttribute('aria-pressed',String(hardwareOnly));remaining.setAttribute('aria-pressed',String(remainingOnly));nextPart.disabled=!all.some(r=>visible.has(r.key)&&!checked.has(r.key)&&(!hardwareOnly||r.fastener));
  if(!parts.length){const p=doc.createElement('p');p.textContent=say('no_items');items.append(p)}
  for(const r of rows){const p=r.part,row=doc.createElement('div');row.className='assembly-part-row';
   const review=doc.createElement('input');review.type='checkbox';review.dataset.partCheck=p.key;review.checked=checked.has(p.key);review.disabled=!visible.has(p.key);review.setAttribute('aria-label',say('part_check_label',[p.name,p.key]));review.addEventListener('change',()=>{if(!active)return;progress.togglePart(p.key);undo=null;notice='';persist();refresh()});row.append(review);
   const n=doc.createElement('button');n.type='button';n.dataset.part=p.key;n.setAttribute('data-i18n','off');n.setAttribute('aria-pressed',String(selected===p.key));n.textContent=p.name;
   const ordinal=doc.createElement('span');ordinal.className='assembly-part-ordinal';ordinal.textContent=say('source_quantity',[r.ordinal,r.total]);n.append(ordinal);
   const small=doc.createElement('small'),stored=state.stored_keys?.includes(p.key);small.textContent=visible.has(p.key)?p.key:stored?p.key+' · '+say('stored'):say('not_displayed');row.dataset.stored=String(Boolean(stored));n.append(small);n.addEventListener('click',()=>{select(p.key);if(visible.has(p.key))onFocusPart(p.key)});row.append(n);
   if(state.part_notes?.[p.key]){const note=doc.createElement('p');note.className='assembly-part-source-note';note.textContent=translate(state.part_notes[p.key]);row.append(note)}items.append(row)}
  more.hidden=parts.length<=limit;more.textContent=say('more',[Math.max(0,parts.length-limit)]);
  if(focused){const target=Array.from(items.querySelectorAll('[data-part-check]')).find(n=>n.dataset.partCheck===focused);(target||remaining).focus?.()}
 }
 function renderSelection(){selection.hidden=!selected;if(!selected)return;const p=index.part(selected),s=index.owner(selected);selectedName.textContent=p.name;selectedPath.textContent=p.path.join(' / ')||p.key;jump.textContent=say('part_step',[s.index+1]);focus.disabled=!state?.visible_keys.includes(selected);const done=progress.snapshot().checked_parts.includes(selected);partCheck.textContent=say(done?'uncheck_part':'check_part');partCheck.setAttribute('aria-pressed',String(done));partCheck.disabled=focus.disabled;
  const operations=index.operations?.(selected)||[s];related.hidden=operations.length<2;jump.hidden=operations.length>1;relatedSelect.setAttribute('aria-label',say('related_stages'));relatedSelect.disabled=!active;
  relatedSelect.replaceChildren(...operations.map(stage=>{const option=doc.createElement('option');option.value=stage.id;option.textContent=String(stage.index+1).padStart(2,'0')+' '+translate(stage.title);return option}));relatedSelect.value=operations.some(stage=>stage.index===state?.index)?index.stage(state.index).id:s.id;
 }
 function refresh(){
  for(const b of bindings)b.n.textContent=say(b.key,b.values);const saved=progress.snapshot(),s=index.stage(saved.current_stage);
  number.textContent=say('current_step',[s.index+1,index.stages.length]);title.textContent=translate(s.title);check.checked=saved.checked_stages.includes(s.id);meter.value=saved.checked_stages.length;meter.setAttribute('aria-label',say('progress',[meter.value,index.stages.length]));progressText.textContent=say('progress',[saved.checked_stages.length,index.stages.length]);actionsLabel.textContent=progressText.textContent;
  search.placeholder=say('search_hint');results.setAttribute('aria-label',say('search'));storageNote.textContent=say(sessionOnly?'session_only':'local');status.textContent=notice?say(notice):'';undoButton.hidden=!undo;
  bannerText.textContent=say('active',[s.index+1,index.stages.length]);
  exit.textContent=translate('閉じる');exit.title=translate('Return to previous configuration');
  for(const n of legacy.select.options)n.textContent=translate(index.stage(Number(n.value)).title);
  for(const [n,raw]of [[legacy.previous,'Previous stage'],[legacy.next,'Next stage'],[legacy.focus,'Focus added parts'],[legacy.finish,'Return to previous configuration']])n.textContent=translate(raw);
  if(state){legacy.note.textContent=[state.manual_note||s.note,...(state.presentation_notes||[state.presentation_note])].filter(Boolean).map(translate).join(' ');legacy.manual.textContent=translate(state.manual_text);sourceCount.textContent=say('counts',[state.added,state.visible_count])}
  renderResults();renderParts();renderSelection();
 }
 function select(part,{reveal=false}={}){if(!active)return;index.part(part);selected=part;renderSelection();for(const n of items.querySelectorAll('[data-part]'))n.setAttribute('aria-pressed',String(n.dataset.part===part));if(reveal){onReveal?.();selection.scrollIntoView?.({block:'nearest'})}}
 function importProgress(value){if(!active)throw Error('Inactive assembly view');const checked=validateAssemblyProgress(index,value),updated=assemblyProgressNeedsMigration(index,value.identity);onStage(index.stage(checked.current_stage).index);progress.restore(checked);undo=null;notice=updated?'updated_manual':'loaded';persist();refresh()}
 listen(check,'change',()=>{progress.toggle(progress.snapshot().current_stage);undo=null;notice='';persist();refresh()});listen(search,'input',()=>{limit=40;renderResults();if(typeof index.matchParts==='function')renderParts();if(search.value.trim())results.scrollIntoView?.({block:'nearest'})});
 let fileEpoch=0;listen(file,'change',async()=>{const epoch=++fileEpoch,input=file.files?.[0];file.value='';if(!input||!active)return;try{if(input.size>524288)throw Error('size');const text=await input.text();if(!active||epoch!==fileEpoch)return;importProgress(JSON.parse(text))}catch(e){if(!active||epoch!==fileEpoch)return;notice=String(e.message).includes('another model')?'wrong_version':'invalid';refresh()}});
 if(win)listen(win,'rig-language-change',refresh);
 refresh();
 return Object.freeze({resumeIndex:()=>index.stage(progress.snapshot().current_stage).index,
  update(next){const changed=state?.index!==next.index;state={...next,visible_keys:[...next.visible_keys]};if(changed){limit=40;selected=null}progress.setStage(next.index);persist();refresh()},
  activate(){active=true;banner.hidden=false;notice=manualUpdated?'updated_manual':resumed?'resumed':'';refresh()},deactivate(){active=false;fileEpoch++;banner.hidden=true;selected=null},select,importProgress,
  ownsCommand:n=>banner.contains(n),snapshot:()=>progress.snapshot(),
  dispose(){active=false;fileEpoch++;for(const remove of listeners)remove();root.remove();banner.remove()},
 });
}

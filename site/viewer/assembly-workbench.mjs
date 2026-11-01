import {createAssemblyProgress,assemblyProgressStorageKey,validateAssemblyProgress} from './assembly-workbench-model.mjs?v=1f84694a73b5a14deb74';
import {assemblyWorkbenchMessages as messages} from './assembly-workbench-messages.mjs?v=8325cd86583d044b5d13';

// UI state describes the reader's checklist, never a mechanical validation.
// Native visibility and camera changes stay with the viewer's stage controller.
export function createAssemblyWorkbench({container,index,legacy,bannerHost,onStage,onFocusPart,onReveal,format,translate,storage,download}={}){
 const doc=container.ownerDocument,win=doc.defaultView,root=doc.createElement('section');root.className='assembly-workbench';root.setAttribute('data-i18n','off');
 const oldStageLabel=container.querySelector('label[for="assemblyStage"]');if(oldStageLabel)oldStageLabel.hidden=true;
 const listeners=[],listen=(n,event,fn)=>{n.addEventListener(event,fn);listeners.push(()=>n.removeEventListener(event,fn))};
 const element=(tag,cls,parent=root)=>{const n=doc.createElement(tag);if(cls)n.className=cls;parent.append(n);return n};
 const bindings=[],msg=(n,key,values=[])=>{bindings.push({n,key,values});return n},button=(key,fn,parent=root)=>{const n=msg(element('button','',parent),key);n.type='button';listen(n,'click',fn);return n};
 const say=(key,values=[])=>format(messages[key],values),key=assemblyProgressStorageKey(index);let sessionOnly=false,notice='',progress=createAssemblyProgress(index),resumed=false,active=false,state=null,selected=null,limit=40,undo=null,resultSignature='';
 try{const saved=storage?.getItem(key);if(saved){progress=createAssemblyProgress(index,JSON.parse(saved));resumed=true}}catch{sessionOnly=true}
 const heading=element('div','assembly-workbench-heading'),number=element('span','assembly-stage-number',heading),title=element('h2','',heading);
 const meter=element('progress','assembly-progress');meter.max=index.stages.length;
 const summary=element('div','assembly-progress-summary'),progressText=element('span','',summary),checkLabel=element('label','assembly-check'),check=element('input','',checkLabel);check.type='checkbox';const checkText=msg(element('span','',checkLabel),'mark_done');
 const nav=element('div','assembly-stage-nav');nav.append(legacy.previous,legacy.next,legacy.focus);
 root.append(legacy.note,legacy.manual);
 const sourceCount=element('p','assembly-source-count');
 const searchLabel=msg(element('label','assembly-search-label'),'search'),search=element('input','assembly-search');search.id='assemblyWorkbenchSearch';searchLabel.setAttribute('for',search.id);search.type='search';search.autocomplete='off';
 const results=element('div','assembly-stage-results');results.setAttribute('aria-label',say('search'));const empty=element('p','assembly-search-empty');empty.hidden=true;
 const outline=element('details','assembly-outline'),outlineLabel=msg(element('summary','',outline),'all_steps',[index.stages.length]);outline.append(legacy.select);
 const partTitle=msg(element('h3'),'items'),items=element('div','assembly-parts'),more=button('more',()=>{limit+=40;renderParts()},root);
 const selection=element('section','assembly-selection'),selectionTitle=msg(element('h3','',selection),'selected'),selectedName=element('p','assembly-part-name',selection),selectedPath=element('p','assembly-part-path',selection),jump=button('part_step',()=>{if(selected)onStage(index.owner(selected).index)},selection),focus=button('focus_part',()=>{if(selected)onFocusPart(selected)},selection);selection.hidden=true;
 const hint=msg(element('p','assembly-pick-hint'),'pick_hint');
 const actions=element('details','assembly-progress-actions'),actionsLabel=msg(element('summary','',actions),'progress',[0,index.stages.length]),actionRow=element('div','assembly-action-row',actions);
 const save=button('save',()=>download(`${index.identity.machine}-assembly-progress.json`,JSON.stringify(progress.snapshot(),null,2)+'\n'),actionRow),load=button('load',()=>file.click(),actionRow),file=element('input','',actions);file.type='file';file.accept='.json,application/json';file.hidden=true;
 const clear=button('clear',()=>{undo=progress.clearChecks();notice='clear_note';persist();refresh()},actions),undoButton=button('undo',()=>{if(undo){progress.restore({...undo,current_stage:progress.snapshot().current_stage});undo=null;notice='';persist();refresh()}},actions);
 const storageNote=element('p','assembly-storage-note',actions),status=element('p','assembly-progress-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(legacy.finish);container.append(root);
 const searchRegion=element('div','assembly-search-region');searchRegion.append(searchLabel,search);
 root.replaceChildren(searchRegion,results,empty,heading,meter,summary,checkLabel,nav,legacy.note,legacy.manual,sourceCount,selection,partTitle,items,more,hint,outline,actions,status,legacy.finish);
 const banner=doc.createElement('div');banner.className='assembly-active-banner';banner.setAttribute('data-i18n','off');banner.hidden=true;const bannerText=element('span','',banner),reveal=button('view',()=>onReveal?.(),banner),exit=element('button','',banner);exit.type='button';listen(exit,'click',()=>legacy.finish.click());bannerHost?.append(banner);
 function persist(){try{if(!storage)sessionOnly=true;else storage.setItem(key,JSON.stringify(progress.snapshot()))}catch{sessionOnly=true}}
 function renderResults(){
  const found=search.value.trim()?index.search(search.value,translate):[],signature=found.map(s=>s.id).join('|');
  if(signature!==resultSignature){results.replaceChildren(...found.map(s=>{const n=doc.createElement('button');n.type='button';n.dataset.stage=s.id;n.addEventListener('click',()=>{if(active)onStage(s.index)});return n}));resultSignature=signature}
  const saved=progress.snapshot();for(const n of results.children){const s=index.stage(n.dataset.stage);n.textContent=`${String(s.index+1).padStart(2,'0')}  ${translate(s.title)}`;n.setAttribute('aria-current',String(s.id===saved.current_stage));n.dataset.checked=String(saved.checked_stages.includes(s.id))}
  results.hidden=!search.value.trim();empty.hidden=!search.value.trim()||found.length>0;empty.textContent=say('no_results');
 }
 function renderParts(){
  if(!state)return;const visible=new Set(state.visible_keys),parts=typeof index.matchParts==='function'&&search.value.trim()?index.matchParts(state.index,search.value,translate):index.parts(state.index),rows=parts.slice(0,limit);items.replaceChildren();
  if(!parts.length){const p=doc.createElement('p');p.textContent=say('no_items');items.append(p)}
  for(const p of rows){const n=doc.createElement('button');n.type='button';n.dataset.part=p.key;n.setAttribute('data-i18n','off');n.setAttribute('aria-pressed',String(selected===p.key));n.textContent=p.name;
   const small=doc.createElement('small');small.textContent=visible.has(p.key)?p.key:say('not_displayed');n.append(small);n.addEventListener('click',()=>{select(p.key);if(visible.has(p.key))onFocusPart(p.key)});items.append(n)}
  more.hidden=parts.length<=limit;more.textContent=say('more',[Math.max(0,parts.length-limit)]);
 }
 function renderSelection(){selection.hidden=!selected;if(!selected)return;const p=index.part(selected),s=index.owner(selected);selectedName.textContent=p.name;selectedPath.textContent=p.path.join(' / ')||p.key;jump.textContent=say('part_step',[s.index+1]);focus.disabled=!state?.visible_keys.includes(selected)}
 function refresh(){
  for(const b of bindings)b.n.textContent=say(b.key,b.values);const saved=progress.snapshot(),s=index.stage(saved.current_stage);
  number.textContent=say('current_step',[s.index+1,index.stages.length]);title.textContent=translate(s.title);check.checked=saved.checked_stages.includes(s.id);meter.value=saved.checked_stages.length;meter.setAttribute('aria-label',say('progress',[meter.value,index.stages.length]));progressText.textContent=say('progress',[saved.checked_stages.length,index.stages.length]);actionsLabel.textContent=progressText.textContent;
  search.placeholder=say('search_hint');results.setAttribute('aria-label',say('search'));storageNote.textContent=say(sessionOnly?'session_only':'local');status.textContent=notice?say(notice):'';undoButton.hidden=!undo;
  bannerText.textContent=say('active',[s.index+1,index.stages.length]);
  exit.textContent=translate('閉じる');exit.title=translate('Return to previous configuration');
  for(const n of legacy.select.options)n.textContent=translate(index.stage(Number(n.value)).title);
  for(const [n,raw]of [[legacy.previous,'Previous stage'],[legacy.next,'Next stage'],[legacy.focus,'Focus added parts'],[legacy.finish,'Return to previous configuration']])n.textContent=translate(raw);
  if(state){legacy.note.textContent=translate(s.note);legacy.manual.textContent=translate(state.manual_text);sourceCount.textContent=say('counts',[state.added,state.visible_count])}
  renderResults();renderParts();renderSelection();
 }
 function select(part,{reveal=false}={}){if(!active)return;index.part(part);selected=part;renderSelection();for(const n of items.children)if(n.dataset.part)n.setAttribute('aria-pressed',String(n.dataset.part===part));if(reveal){onReveal?.();selection.scrollIntoView?.({block:'nearest'})}}
 function importProgress(value){if(!active)throw Error('Inactive assembly view');const checked=validateAssemblyProgress(index,value);onStage(index.stage(checked.current_stage).index);progress.restore(checked);undo=null;notice='loaded';persist();refresh()}
 listen(check,'change',()=>{progress.toggle(progress.snapshot().current_stage);undo=null;notice='';persist();refresh()});listen(search,'input',()=>{limit=40;renderResults();if(typeof index.matchParts==='function')renderParts();if(search.value.trim())results.scrollIntoView?.({block:'nearest'})});
 let fileEpoch=0;listen(file,'change',async()=>{const epoch=++fileEpoch,input=file.files?.[0];file.value='';if(!input||!active)return;try{if(input.size>65536)throw Error('size');const text=await input.text();if(!active||epoch!==fileEpoch)return;importProgress(JSON.parse(text))}catch(e){if(!active||epoch!==fileEpoch)return;notice=String(e.message).includes('another model')?'wrong_version':'invalid';refresh()}});
 if(win)listen(win,'rig-language-change',refresh);
 refresh();
 return Object.freeze({resumeIndex:()=>index.stage(progress.snapshot().current_stage).index,
  update(next){const changed=state?.index!==next.index;state={...next,visible_keys:[...next.visible_keys]};if(changed){limit=40;selected=null}progress.setStage(next.index);persist();refresh()},
  activate(){active=true;banner.hidden=false;notice=resumed?'resumed':'';refresh()},deactivate(){active=false;fileEpoch++;banner.hidden=true;selected=null},select,importProgress,
  ownsCommand:n=>banner.contains(n),snapshot:()=>progress.snapshot(),
  dispose(){active=false;fileEpoch++;for(const remove of listeners)remove();root.remove();banner.remove()},
 });
}

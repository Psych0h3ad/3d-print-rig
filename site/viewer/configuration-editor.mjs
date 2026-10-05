import {configurationLabel} from './configuration-draft.mjs?v=40f3194bb0e1c5a35cf8';
import {workspaceListen} from './workspace-lifecycle.mjs';
import {translate} from './i18n.mjs?v=bf6af5624d58ebfea9ec';

export function setupConfigurationEditor(catalog,{ids,apply,discard,undo}){
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n};
 const status=$('configStatus');
 const root=$('configurationControls')||$('toolheadConfig').closest('fieldset');
 const overview=make('div','','configuration-overview');overview.id='configurationOverview';
 const caption=make('span','3Dに表示中','configuration-caption'),shown=make('strong');
 const undoButton=make('button','前の構成に戻す','configuration-undo');undoButton.type='button';undoButton.onclick=undo;
 overview.append(caption,shown,undoButton);root.prepend(overview);
 const hint=make('p','部品を選び、変更内容を確認してから3Dに反映します。','configuration-hint');overview.after(hint);
 if(root.tagName==='FIELDSET'){root.before(overview,hint);root.classList.add('configuration-head-fields')}
 const tray=make('section','','configuration-draft');tray.id='configurationDraft';tray.hidden=true;tray.setAttribute('aria-label','構成の変更');
 const changes=make('details','','configuration-diff'),summary=make('summary'),title=make('span'),list=make('ul');
 summary.append(title);changes.append(summary,list);
 const note=make('p','まだ3Dには反映されていません。','foot');note.setAttribute('role','status');
 const actions=make('div','','configuration-actions'),cancel=make('button','取り消す'),submit=make('button','変更を3Dに反映','primary');
 submit.id='applyConfiguration';cancel.id='discardConfiguration';submit.type=cancel.type='button';submit.onclick=apply;cancel.onclick=discard;
 actions.append(cancel,submit);tray.append(changes,note,actions);
 // The shared shell can initialize before or after the CAD controller.
 // Put the draft above Save/Load inside the same persistent footer.
 const footer=$('saveConfiguration').parentElement;footer.prepend(tray);
 const helpers=new Map();
 for(const id of ids){const select=$(id+'Config'),helper=make('p','','configuration-choice-help');helper.id=id+'ChoiceHelp';select.after(helper);select.setAttribute('aria-describedby',helper.id);helpers.set(id,helper)}
 const groups=[];
 if(root.id==='configurationControls'){
  for(const [label,keys,open] of [['ガントリーと取付',['gantry','mount'],false],['ヘッドと駆動系',['toolhead','extruder','hotend'],true],['プローブ・冷却・基板',['probe','cooling','carriage','board'],false]]){
   const fields=keys.filter(id=>ids.includes(id));if(!fields.length)continue;
   const group=make('details','','configuration-group'),heading=make('summary'),name=make('span',label),value=make('small');
   const text=make('span','','configuration-group-heading');text.append(name,value);heading.append(text);group.append(heading);group.open=open;
   for(const id of fields){const select=$(id+'Config'),caption=document.querySelector('label[for="'+select.id+'"]');if(caption)group.append(caption);group.append(select,helpers.get(id))}
   status.before(group);groups.push({group,value,fields});
  }
  const advanced=$('advancedConfiguration');if(advanced&&!advanced.querySelector('select'))advanced.remove();
 }
 let state;
 const t=text=>translate(text,document.documentElement.lang);
 function update(next){
  state=next;const {actual,draft,busy,canUndo}=next;
  shown.textContent=actual?['toolhead','extruder','hotend'].filter(id=>actual[id]).map(id=>t(configurationLabel(catalog,id,actual[id]))).join(' / '):t('読み込み中…');
  undoButton.hidden=!canUndo||draft.pending;undoButton.disabled=busy;
  tray.hidden=!draft.pending;tray.setAttribute('aria-busy',String(busy));
  title.textContent=actual?t('{0}項目の変更を確認').replace('{0}',draft.changes.length):t('CADを再読み込み');
  list.replaceChildren(...draft.changes.map(row=>{const item=make('li'),label=make('strong',t(row.label));if(row.automatic)label.append(make('span',t('連動変更'),'configuration-auto'));const before=make('span',t(row.from),'configuration-before'),after=make('span',t(row.to),'configuration-after');item.append(label,before,make('span','→','configuration-arrow'),after);return item}));
  submit.disabled=busy;cancel.disabled=busy||!actual;submit.textContent=t(busy?'反映中…':actual?'変更を3Dに反映':'CADを再読み込み');
  note.textContent=t(busy?'選択したCADを読み込み中…':'まだ3Dには反映されていません。');
  for(const id of ids){const select=$(id+'Config'),rows=[...select.options],helper=helpers.get(id),change=draft.changes.find(row=>row.key===id);
   select.classList.toggle('configuration-changed',!!change);
   helper.textContent=change?.automatic?t('他の選択に合わせて変更されます'):rows.length===1?t('この組み合わせでは、この仕様で固定です。'):'';
   helper.hidden=!helper.textContent;
  }
  for(const {group,value,fields} of groups){value.textContent=fields.map(id=>t(configurationLabel(catalog,id,draft.current?.[id]))).join(' / ');group.classList.toggle('has-changes',draft.changes.some(row=>fields.includes(row.key)))}
  $('saveConfiguration').disabled=busy||!actual||draft.pending;
  $('saveConfiguration').title=draft.pending?t('変更を3Dに反映してから保存できます。'):'';
  status.dataset.pending=String(draft.pending);
 }
 workspaceListen(window,'rig-language-change',()=>{if(state)update(state)});
 return {update};
}

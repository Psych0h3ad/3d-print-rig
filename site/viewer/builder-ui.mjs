import {workspaceTask} from './workspace-lifecycle.mjs';
import {builderGroups,builderManifest,builderURL} from './toolhead-builder.mjs?v=13a9f1e6e782da01d1ab';
import {monolithCompanion} from './monolith-head-model.mjs?v=f01febfc759348d89fa7';

export function setupHeadBuilder(catalog,{getVariant,getMetadata,getExtras,pins,selectVariant,isBusy}){
 const $=id=>document.getElementById(id);
 function filter(){return {extruder:$('buildExtruder').value,hotend:$('buildHotend').value}}
 for(const [id,rows] of [['buildExtruder',catalog.extruders],['buildHotend',catalog.hotends]]){
  $(id).replaceChildren(...[{id:'',label:'指定しない'},...rows.filter(r=>catalog.variants.some(v=>v[id==='buildExtruder'?'extruder':'hotend']===r.id))].map(row=>{const o=document.createElement('option');o.value=row.id;o.textContent=row.label;return o}));
 }
 function results(){
  const groups=builderGroups(catalog,filter(),getVariant()?.id),selected=$('buildResult').value;
  $('buildResult').replaceChildren(...groups.map(g=>{const o=document.createElement('option');o.value=g.variant.id;o.textContent=`${g.label} · ${g.count}構成`;return o}));
  if(groups.some(g=>g.variant.id===selected))$('buildResult').value=selected;
  $('buildMatchCount').textContent=groups.length?`${groups.length}種類のヘッド · ${groups.reduce((n,g)=>n+g.count,0)}構成を3Dで比較可能`:'この条件の組立CADはまだ登録されていません。';
  $('buildShow').disabled=!groups.length||isBusy();
 }
 for(const id of ['buildExtruder','buildHotend'])$(id).onchange=results;
 $('buildShow').onclick=async()=>{return workspaceTask(async()=>{if(isBusy())return;const id=$('buildResult').value;if(!id)return;$('buildShow').disabled=true;try{await selectVariant(id)}finally{results()}});};
 let manifest;
 function update(){
  const v=getVariant();if(!v)return;
  const b=getExtras().head_builder;
  manifest=builderManifest(catalog,v,getMetadata(),{dock:b.dock,rail:b.rail,pins});
  $('buildSelection').replaceChildren(...manifest.selection.flatMap(r=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=r.label;dd.textContent=r.value;return [dt,dd]}));
  $('buildPartCount').textContent=`表示中 ${manifest.displayed_instances}点 · 印刷部品 ${manifest.printed_instances}点`;
  const companion=monolithCompanion(catalog,v);$('buildMonolith').hidden=!companion;
  if(companion){const u=new URL('./gantries.html',location.href);u.searchParams.set('head_configuration',companion.id);const back=new URL(location.href).searchParams.get('return_gantry');if(back&&/^monolith_(vt|v2)_(printed|sheet_metal)_(6|9)_(2wd|awd)_(250|350)$/.test(back)){const width=companion.mount==='fixed'?back:back.replace(/_(6|9)_(2wd|awd)_/,'_'+companion.belt_width_mm+'_$2_');u.searchParams.set('gantry',width)}$('buildMonolith').href=u.href}
  $('buildModules').replaceChildren(...manifest.modules.map(m=>{
   const d=document.createElement('details'),s=document.createElement('summary');s.textContent=`${m.id} · ${m.parts.length}点`;d.append(s);
   for(const source of m.sources){const p=document.createElement('p'),a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener';a.className='source-link';a.className='source-link';a.textContent='原本・取付説明';p.append(a);if(source.commit){const code=document.createElement('code');code.textContent=source.commit.slice(0,12);code.title=source.commit;p.append(' · ',code)}if(source.license)p.append(document.createElement('br'),source.license);d.append(p)}
   const list=document.createElement('ul');list.className='build-parts';
   for(const part of m.parts.filter(p=>['base','accent'].includes(p.role))){const li=document.createElement('li');li.textContent=part.name;li.dataset.part=part.key;list.append(li)}
   if(list.childElementCount)d.append(list);else{const p=document.createElement('p');p.textContent='このモジュールに印刷部品はありません。';d.append(p)}
   return d;
  }));
  $('buildShareURL').hidden=true;results();
 }
 $('buildPartsExport').onclick=()=>{
  if(!manifest||isBusy())return;
  const data={...manifest,...getExtras()},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=manifest.configuration+'-parts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('buildShare').onclick=async()=>{return workspaceTask(async()=>{
  if(!getVariant()||isBusy())return;
  const input=$('buildShareURL');input.value=builderURL(location.href,getVariant(),getExtras().head_builder);input.hidden=false;input.select();
  try{await navigator.clipboard.writeText(input.value);$('buildShareStatus').textContent='構成と配色のリンクをコピーしました。'}catch{$('buildShareStatus').textContent='表示されたリンクをコピーしてください。'}
 });};
 results();update();return {update};
}

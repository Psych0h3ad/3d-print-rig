import {alphaProductNotice} from './trinity-alpha-installation.mjs?v=28eb7bab02b87e9f3de1';
import {createConfigurationDraft,configurationLabels,configurationLabel} from './configuration-draft.mjs?v=29f78465c65e0f1d8563';
import {setupConfigurationEditor} from './configuration-editor.mjs?v=b9f9a339841baf5f0ed7';
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {workspaceTask,workspaceListen} from './workspace-lifecycle.mjs?v=823ad76bd9034ec8d6ff';
import {translate} from './i18n.mjs?v=4cc63d15a7b73bcd1e81';
import {monolithConfigurationRequest} from './monolith-machine-model.mjs?v=1aba13fb2b945eb4bb3d';
import {catalogDimensions,collections,resolveVariant,choicesFor,choiceChanges,importedVariant,configurationById} from './configuration-model.js?v=922298bc5433b90fa3af';
import {probeCheck,probeOptionSuffix,headBodyCollisionNotes} from './probe-checks.js?v=ea1aef3e30bf7d11d3cb';
import {renderProductLinks} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {headWitnessCheck}from './head-validation.mjs?v=bba39d88e1b5b7f848c0';
import {createHeadInspection}from './head-validation-ui.mjs?v=ae9dcf09c303efbdce96';

export async function setupConfigurations(catalog,install,{presentation='printer',getExtras=()=>({}),applyExtras=async()=>{},validateExtras=()=>{},onSettled=()=>{},inspectPose,createEditor=setupConfigurationEditor,onDraft=()=>{}}={}){return workspaceTask(async()=>{
 const $=s=>document.querySelector(s);
 const inspection=createHeadInspection($('#configStatus'),{setPose:inspectPose});
 let productTarget=$('#headProductLinks');if(!productTarget){productTarget=document.createElement('div');productTarget.id='configurationProductLinks';$('#configStatus').after(productTarget)}
 const ids=catalogDimensions(catalog).filter(id=>catalog[collections[id]]&&$('#'+id+'Config'));
 let actual,busy=false,undoState,editor;
 const query=new URLSearchParams(location.search);
 const requestedId=query.get('configuration'),matched=configurationById(catalog,requestedId);
 const gantryRequest=monolithConfigurationRequest(catalog,location.search),requested=matched||gantryRequest||catalog.variants[0];
 if(query.get('embed')==='1' && requestedId && !matched && !gantryRequest){document.documentElement.dataset.embedError='configuration';throw Error('指定された構成は現在利用できません。元のサイトで確認してください。');}
 const initial=query.get('mount')?resolveVariant(catalog,{...requested,mount:query.get('mount')},'mount'):requested;
 if(!initial)throw Error('構成のCADが登録されていません。');
 const draft=createConfigurationDraft(catalog,initial);
 const updateEditor=()=>{editor?.update({actual,draft,busy,canUndo:!!undoState});onDraft(draft.current)};
 const t=text=>translate(text,document.documentElement?.lang||'ja');
 function menus(v){
  for(const id of ids){
   const select=$('#'+id+'Config'),direct=document.createElement('optgroup'),linked=document.createElement('optgroup');
   direct.label=t('他の部品を維持');linked.label=t('関連部品も変更');
   for(const row of choicesFor(catalog,v,id)){
    const option=document.createElement('option'),candidate=resolveVariant(catalog,{...v,[id]:row.id},id),changes=choiceChanges(catalog,v,id,row.id);
    option.value=row.id;option.textContent=configurationLabel(catalog,id,row.id)+(id==='probe'?probeOptionSuffix(candidate):'');
    option.dataset.changes=JSON.stringify(changes);
    option.title=changes.map(k=>t(configurationLabels[k]||k)+': '+t(configurationLabel(catalog,k,candidate[k]))).join(' ／ ');
    (changes.length?linked:direct).append(option);
   }
   select.replaceChildren(...[direct,linked].filter(group=>group.children.length));select.value=v[id];
  }
 }
 function commit(v){
  actual=v;draft.reset(v);menus(v);
  const headLabel=$('#machineHeadLabel');if(headLabel)headLabel.textContent=['toolhead','extruder','hotend'].map(id=>catalog[collections[id]].find(row=>row.id===v[id])?.label||v[id]).join(' / ');
  renderProductLinks(productTarget,{hotend:v.hotend,toolhead:v.toolhead,extruder:v.extruder});
  const url=new URL(location.href);url.searchParams.delete('mount');if(catalog.machine_id!=='monolith_workbench'){url.searchParams.delete('gantry');url.searchParams.delete('head_configuration')}url.searchParams.set('configuration',v.id);replaceWorkspaceURL(null,'',url);
  $('#configSummary').textContent=ids.map(id=>catalog[collections[id]].find(row=>row.id===v[id]).label).join(' ／ ');
  $('#configRequirements').replaceChildren(...v.notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li}));
  const rows=[`専用マウント：${v.fit?.mount||'登録済みCAD'}`,`選択可能な構成：${catalog.variants.length}通り`];
  if(presentation==='printer'&&v.fit?.nozzle_mm)rows.push(`基準姿勢のノズル位置：X ${v.fit.nozzle_mm[0].toFixed(2)} / Y ${v.fit.nozzle_mm[1].toFixed(2)} / Z ${v.fit.nozzle_mm[2].toFixed(2)} mm`);
  if(presentation==='printer'&&v.fit?.bed_reference_drop_mm)rows.push(`基準ベッド位置を ${v.fit.bed_reference_drop_mm.toFixed(2)} mm下げて表示（ノズル先端と0.2 mmの間隔）`);
  if(v.fit?.mount_hotend_overlap_mm3!=null)rows.push(`マウント／ホットエンドの交差体積：${v.fit.mount_hotend_overlap_mm3.toFixed(3)} mm³`);
  if(v.fit?.machine_mount){const m=v.fit.machine_mount;rows.push(`機体取付：${m.kind}。取付穴の軸ずれ ${m.axis_error_mm.toFixed(4)} mm。`);rows.push('機体側ドック・ホーミング接点・全可動域は未検証。');if(v.toolhead==='indx')rows.push('INDX：受動ツールとドックを選択可能。ベルト固定具・交換経路は未検証。')}
  if(v.fit?.probe){const p=v.fit.probe;rows.push(Number.isFinite(p.coil_nozzle_gap_mm)?`${p.label||'プローブ'}のコイル底面：ノズルより ${p.coil_nozzle_gap_mm.toFixed(2)} mm上`:`${p.label||'プローブ'}のコイル底面：未計測`);if(p.offset_xy_mm)rows.push(`ノズルからのオフセット：X ${p.offset_xy_mm[0].toFixed(2)} / Y ${p.offset_xy_mm[1].toFixed(2)} mm`);if(p.spacer_mm)rows.push(`取付に必要な絶縁スペーサー：${p.spacer_mm.toFixed(1)} mm × 2`)}
  const check=probeCheck(v);rows.push(...check.lines);if(v.fit?.probe?.minimum_probe_bed_clearance_at_nozzle_contact_mm!=null)rows.push(`ノズル接触時のプローブ最下部／ベッド間隔：${v.fit.probe.minimum_probe_bed_clearance_at_nozzle_contact_mm.toFixed(3)} mm`);
  rows.push(presentation==='toolhead'?'マウントと部品配置のCADプレビュー。プリンター全域の干渉判定は含みません。':'全可動域の衝突、熱・流量・電気特性は未検証。');
  $('#mountInfo')?.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row;return li}));
  $('#configStatus').textContent=presentation==='toolhead'?`3D切替済み · ${v.belt_width_mm} mmキャリッジ`:`3D切替済み · ${v.xy_motors}モーター · ${v.belt_width_mm} mmベルト`;
  if(check.warning)$('#configStatus').textContent+=' ／ '+check.label;$('#configStatus').classList.toggle('notice',check.warning);
  if(v.fit?.carriage_native_body_passed===false){$('#configStatus').textContent='比較用の試着 · 本体干渉あり · 6 mm';$('#configStatus').classList.add('notice')}
  const native=v.fit?.complete_head_native;
  if(v.display_scope){$('#configStatus').textContent='参照CADの切替済み'+(check.warning?' ／ '+check.label:'');rows.push(v.display_scope);$('#configStatus').classList.add('notice')}
  if(native){
   const label=native.state==='reference'&&native.unresolved_pairs?.length?'一部の交差判定が未確定':{collision:'CAD干渉あり · 比較用',contact:'CADに微小な交差あり','attachment-contact':'取付部に交差あり · 比較用',clear:'検査姿勢の本体交差なし',reference:'原本組立 · 接続未検証'}[native.state];
   $('#configStatus').textContent+=' ／ '+label;$('#configStatus').classList.toggle('notice',check.warning||native.state!=='clear');
   rows.push(label,...(native.notes||[]),...headBodyCollisionNotes(native.interface_contacts));$('#mountInfo')?.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row;return li}));
  }
  const body=headWitnessCheck(v);if(body){$('#configStatus').textContent+=' ／ '+body.label;$('#configStatus').classList.add('notice');rows.push(...body.lines);$('#mountInfo')?.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row;return li}))}inspection.update(v);
  $('#configStatus').dataset.variant=v.id;alphaProductNotice(v);
  const headLink=$('#toolheadLink');if(presentation==='printer'&&headLink&&catalog.machine_id){const u=new URL(headLink.href,location.href);u.searchParams.set('return_machine',catalog.machine_id);u.searchParams.set('return_configuration',v.id);u.searchParams.set('return_head',u.searchParams.get('configuration'));headLink.href=u.href}
 }
 async function refresh(v,extraData,adjustment){return workspaceTask(async()=>{
  if(busy||!v)return false;busy=true;updateEditor();const previousExtras=getExtras();let success=false;
  for(const k of ids)$('#'+k+'Config').disabled=true;
  for(const id of ['loadConfiguration','saveConfiguration'])$('#'+id).disabled=true;
  $('#configStatus').textContent='選択したCADを読み込み中…';
  try{await install(v);if(extraData)await applyExtras(extraData);commit(v);success=true;if(adjustment){$('#configStatus').textContent+=' ／ 登録済みの組み合わせに合わせて変更：'+adjustment;$('#configStatus').classList.add('notice')}}catch(e){
   let restored=false;if(actual){try{await install(actual);await applyExtras(previousExtras);restored=true}catch(restore){console.error(restore)}menus(draft.current||actual)}
   if(!restored){actual=null;draft.invalidateApplied();delete $('#configStatus').dataset.variant}
   $('#configStatus').textContent=restored?'切替に失敗しました。直前の構成を表示中。':'CADの読み込みに失敗しました。構成を選び直して再試行してください。';$('#configStatus').classList.add('notice');console.error(e);
  }finally{busy=false;for(const k of ids)$('#'+k+'Config').disabled=false;$('#loadConfiguration').disabled=false;$('#saveConfiguration').disabled=!actual;updateEditor();onSettled(actual)}
  return success;
 });}
 async function applyDraft(){
  if(busy||!draft.pending)return false;
  const previous=actual?{variant:actual,extras:structuredClone(getExtras())}:null;
  const success=await refresh(draft.current);
  if(success)undoState=previous;updateEditor();return success;
 }
 function discardDraft(){if(busy||!actual)return;draft.reset(actual);menus(draft.current);updateEditor()}
 async function undo(){
  if(busy||!undoState)return;
  const previous=undoState;
  if(await refresh(previous.variant,previous.extras))undoState=null;
  updateEditor();
 }
 function stageChoice(key,value){if(busy||!catalogDimensions(catalog).includes(key)||!draft.choose(key,value))return false;menus(draft.current);updateEditor();return true}
 for(const k of ids)$('#'+k+'Config').onchange=()=>stageChoice(k,$('#'+k+'Config').value);
 editor=createEditor(catalog,{ids,apply:applyDraft,discard:discardDraft,undo});
 if(typeof window!=='undefined')workspaceListen(window,'rig-language-change',()=>{menus(draft.current);updateEditor();alphaProductNotice(actual)});
 for(const row of catalog.sources){
  const a=document.createElement('a'),url=new URL(row.url),repository=url.pathname.split('/').filter(Boolean).slice(0,2);
  a.textContent=row.label||row.name||(url.hostname==='github.com'?repository.join('/'):url.hostname);
  if(!row.label&&url.hostname==='github.com'&&repository.length===2&&/^[a-f0-9]{40}$/i.test(row.commit||''))url.pathname='/'+repository.join('/')+'/tree/'+row.commit;
  a.href=url.href;if(row.commit)a.title=row.commit;a.target='_blank';a.rel='noopener';$('#modSources').append(a,document.createTextNode('　'));
 }
 $('#saveConfiguration').onclick=()=>{
  if(!actual||busy||draft.pending)return;
  const data={schema:'3d-print-rig-configuration-v1',machine:catalog.machine_id||'siboor_trident_350',configuration:actual.id,selection:Object.fromEntries(ids.map(k=>[k,actual[k]])),...getExtras()};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=actual.id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const input=$('#configurationFile');$('#loadConfiguration').onclick=()=>input.click();
 input.onchange=async()=>{return workspaceTask(async()=>{
  const file=input.files[0];input.value='';if(!file||busy)return;
  try{if(file.size>64*1024)throw Error('構成JSONは64 KB以下で指定してください。');const data=JSON.parse(await file.text()),variant=importedVariant(catalog,data);validateExtras(data);if(await refresh(variant,data))undoState=null;updateEditor()}
  catch(e){$('#configStatus').textContent=e.message}
 });};
 menus(initial);await refresh(initial);
 if(actual&&catalog.machine_id!=='monolith_workbench'&&query.get('gantry')&&!requestedId&&!gantryRequest){$('#configStatus').textContent='指定されたガントリーはこの機体に未登録です。現在の表示：'+$('#configSummary').textContent;$('#configStatus').classList.add('notice')}
 if(actual&&requestedId&&!matched){$('#configStatus').textContent='指定された構成はこの機種に未登録です。現在の表示：'+$('#configSummary').textContent;$('#configStatus').classList.add('notice')}
 return {selectVariant:async(id,extras)=>{return workspaceTask(async()=>{const v=configurationById(catalog,id);if(!v)throw Error('構成のCADが未登録です。');if(extras)validateExtras({...extras,configuration:v.id});const success=await refresh(v,extras);if(success)undoState=null;updateEditor();return success});},applyDraft,discardDraft,undo,stageChoice,get draft(){return draft},get current(){return actual},get busy(){return busy}};
});}

import {catalogDimensions,collections,resolveVariant,choicesFor,importedVariant} from './configuration-model.js?v=public-v16';
import {probeCheck,probeOptionSuffix} from './probe-checks.js?v=public-v16';
import {renderProductLinks} from './product-links.js?v=public-v16-products-3';

export async function setupConfigurations(catalog,install,{presentation='printer',getExtras=()=>({}),applyExtras=async()=>{},validateExtras=()=>{},onSettled=()=>{}}={}){
 const $=s=>document.querySelector(s);
 let productTarget=$('#headProductLinks');if(!productTarget){productTarget=document.createElement('div');productTarget.id='configurationProductLinks';$('#configStatus').after(productTarget)}
 const ids=catalogDimensions(catalog).filter(id=>catalog[collections[id]]&&$('#'+id+'Config'));
 const selection=()=>Object.fromEntries(ids.map(k=>[k,$('#'+k+'Config').value]));
 let actual,busy=false;
 const query=new URLSearchParams(location.search);
 const requested=catalog.variants.find(v=>v.id===query.get('configuration'))||catalog.variants[0];
 const initial=query.get('mount')?resolveVariant(catalog,{...requested,mount:query.get('mount')},'mount'):requested;
 if(!initial)throw Error('構成のCADが登録されていません。');
 function menus(v){
  for(const id of ids){
   const select=$('#'+id+'Config');select.replaceChildren(...choicesFor(catalog,v,id).map(row=>{const option=document.createElement('option');option.value=row.id;const candidate=id==='probe'?catalog.variants.find(c=>ids.filter(k=>k!=='probe').every(k=>c[k]===v[k])&&c.probe===row.id):null;option.textContent=row.label+probeOptionSuffix(candidate);return option}));select.value=v[id];
  }
 }
 function commit(v){
  actual=v;menus(v);
  renderProductLinks(productTarget,{hotend:v.hotend,toolhead:v.toolhead,extruder:v.extruder});
  const url=new URL(location.href);url.searchParams.delete('mount');url.searchParams.set('configuration',v.id);history.replaceState(null,'',url);
  $('#configSummary').textContent=ids.map(id=>catalog[collections[id]].find(row=>row.id===v[id]).label).join(' ／ ');
  $('#configRequirements').replaceChildren(...v.notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li}));
  const rows=[`専用マウント：${v.fit?.mount||'登録済みCAD'}`,`選択可能な構成：${catalog.variants.length}通り`];
  if(presentation==='printer'&&v.fit?.nozzle_mm)rows.push(`基準姿勢のノズル位置：X ${v.fit.nozzle_mm[0].toFixed(2)} / Y ${v.fit.nozzle_mm[1].toFixed(2)} / Z ${v.fit.nozzle_mm[2].toFixed(2)} mm`);
  if(presentation==='printer'&&v.fit?.bed_reference_drop_mm)rows.push(`基準ベッド位置を ${v.fit.bed_reference_drop_mm.toFixed(2)} mm下げて表示（ノズル先端と0.2 mmの間隔）`);
  if(v.fit?.mount_hotend_overlap_mm3!=null)rows.push(`マウント／ホットエンドの交差体積：${v.fit.mount_hotend_overlap_mm3.toFixed(3)} mm³`);
  if(v.fit?.machine_mount){const m=v.fit.machine_mount;rows.push(`機体取付：${m.kind}。取付穴の軸ずれ ${m.axis_error_mm.toFixed(4)} mm。`);rows.push('機体側ドック・ホーミング接点・全可動域は未検証。');if(v.toolhead==='indx')rows.push('INDX：ベルト固定具とドックが未登録。レール取付の比較表示。')}
  if(v.fit?.probe){const p=v.fit.probe;rows.push(`${p.label||'プローブ'}のコイル底面：ノズルより ${p.coil_nozzle_gap_mm.toFixed(2)} mm上`);if(p.offset_xy_mm)rows.push(`ノズルからのオフセット：X ${p.offset_xy_mm[0].toFixed(2)} / Y ${p.offset_xy_mm[1].toFixed(2)} mm`);if(p.spacer_mm)rows.push(`取付に必要な絶縁スペーサー：${p.spacer_mm.toFixed(1)} mm × 2`)}
  const check=probeCheck(v);rows.push(...check.lines);if(v.fit?.probe?.minimum_probe_bed_clearance_at_nozzle_contact_mm!=null)rows.push(`ノズル接触時のプローブ最下部／ベッド間隔：${v.fit.probe.minimum_probe_bed_clearance_at_nozzle_contact_mm.toFixed(3)} mm`);
  rows.push(presentation==='toolhead'?'マウントと部品配置のCADプレビュー。プリンター全域の干渉判定は含みません。':'全可動域の衝突、熱・流量・電気特性は未検証。');
  $('#mountInfo')?.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row;return li}));
  $('#configStatus').textContent=presentation==='toolhead'?`3D切替済み · ${v.belt_width_mm} mmキャリッジ`:`3D切替済み · ${v.xy_motors}モーター · ${v.belt_width_mm} mmベルト`;
  if(check.warning)$('#configStatus').textContent+=' ／ '+check.label;$('#configStatus').classList.toggle('notice',check.warning);
  if(v.fit?.carriage_native_body_passed===false){$('#configStatus').textContent='比較用の試着 · 本体干渉あり · 6 mm';$('#configStatus').classList.add('notice')}
  const native=v.fit?.complete_head_native;
  if(v.display_scope){$('#configStatus').textContent='参照CADの切替済み';rows.push(v.display_scope);$('#configStatus').classList.add('notice')}
  if(native){
   const label=native.state==='reference'&&native.unresolved_pairs?.length?'一部の交差判定が未確定':{collision:'CAD干渉あり · 比較用',contact:'CADに微小な交差あり',clear:'検査姿勢の本体交差なし',reference:'原本組立 · 接続未検証'}[native.state];
   $('#configStatus').textContent+=' ／ '+label;$('#configStatus').classList.toggle('notice',check.warning||native.state!=='clear');
   rows.push(label,...native.notes);$('#mountInfo')?.replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.textContent=row;return li}));
  }
  $('#configStatus').dataset.variant=v.id;
 }
 async function refresh(v,extraData){
  if(busy||!v)return;busy=true;const previousExtras=getExtras();
  for(const k of ids)$('#'+k+'Config').disabled=true;
  for(const id of ['loadConfiguration','saveConfiguration'])$('#'+id).disabled=true;
  $('#configStatus').textContent='選択したCADを読み込み中…';
  try{await install(v);if(extraData)await applyExtras(extraData);commit(v)}catch(e){
   if(actual){try{await install(actual);if(extraData)await applyExtras(previousExtras)}catch(restore){console.error(restore)}menus(actual)}
   $('#configStatus').textContent='切替に失敗しました。直前の構成を表示中。';console.error(e);
  }finally{busy=false;for(const k of ids)$('#'+k+'Config').disabled=false;for(const id of ['loadConfiguration','saveConfiguration'])$('#'+id).disabled=false;onSettled(actual)}
 }
 for(const k of ids)$('#'+k+'Config').onchange=()=>refresh(resolveVariant(catalog,selection(),k));
 for(const row of catalog.sources){const a=document.createElement('a');a.href=row.url;a.textContent=row.label;a.target='_blank';a.rel='noopener';$('#modSources').append(a,document.createTextNode('　'))}
 $('#saveConfiguration').onclick=()=>{
  if(!actual||busy)return;
  const data={schema:'3d-print-rig-configuration-v1',machine:catalog.machine_id||'siboor_trident_350',configuration:actual.id,selection:Object.fromEntries(ids.map(k=>[k,actual[k]])),...getExtras()};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=actual.id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const input=$('#configurationFile');$('#loadConfiguration').onclick=()=>input.click();
 input.onchange=async()=>{
  const file=input.files[0];input.value='';if(!file||busy)return;
  try{if(file.size>64*1024)throw Error('構成JSONは64 KB以下で指定してください。');const data=JSON.parse(await file.text()),variant=importedVariant(catalog,data);validateExtras(data);await refresh(variant,data)}
  catch(e){$('#configStatus').textContent=e.message}
 };
 menus(initial);await refresh(initial);
 return {selectVariant:async id=>{const v=catalog.variants.find(row=>row.id===id);if(!v)throw Error('構成のCADが未登録です。');await refresh(v)},get current(){return actual},get busy(){return busy}};
}

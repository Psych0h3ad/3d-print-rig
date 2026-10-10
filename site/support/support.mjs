import {setupLanguage,translate,formatMessage} from '../viewer/i18n.mjs?v=d6d7a630d8514cd1463d';
import {setupHeaderThemeToggle} from '../viewer/display-preferences.mjs?v=3b735c3e32640589ed26';
import {matchingRows,supportURL} from './model.mjs?v=4ddcd0ed4a4aee9387d0';

const $=id=>document.getElementById(id),el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n};
const statusLabels={supported:'組み合わせ対応済み',stock:'標準構成のみ',missing:'CAD未登録',standalone:'単体での組み合わせ'};
const dimensions={zdrive:'Z drive',gantry:'ガントリー',toolhead:'ツールヘッド',mount:'取付方式',extruder:'押出機',hotend:'ホットエンド',carriage:'キャリッジ',probe:'プローブ',board:'基板',cooling:'冷却',bed:'ベッド支持機構',accelerometer:'加速度センサー',strain_relief:'配線マウント',handles:'ハンドル',tophat:'トップハット'};
const language=setupLanguage();setupHeaderThemeToggle(document.querySelector('.header-actions'));
const t=text=>translate(text,language.language),cache=new Map();let index,target,catalog,selection={},limit=12,request=0;
const badge=(text,status)=>el('span',text,'badge '+status);
async function json(file){const r=await fetch(file,{cache:'no-cache'});if(!r.ok)throw Error('Could not load '+file);return r.json()}
function setURL(){const q=new URLSearchParams({lang:language.language,machine:target.id,...selection});history.replaceState(null,'','?'+q)}
function error(){ $('error').hidden=false;$('error').replaceChildren(el('p','対応状況を読み込めませんでした。ページを再読み込みしてください。'));}
function renderHeads(){
 $('heads').replaceChildren();$('headCoverage').hidden=target.kind==='standalone'||target.kind==='community'||target.kind==='v0'||target.status==='missing';
 if($('headCoverage').hidden)return;
 for(const h of index.head_families){const ok=target.heads?.includes(h.id),card=el('div',undefined,'coverage-item');card.append(el('strong',h.label),badge(ok?'機体への組込対応済み':'この機体への組込は未対応',ok?'supported':'standalone'));if(!ok&&h.configuration){const a=el('a','単体ビュワーで確認');a.href='../viewer/toolheads.html?configuration='+encodeURIComponent(h.configuration)+'&lang='+language.language;card.append(a)}$('heads').append(card)}
}
function extraRow(title,detail){const row=el('div',undefined,'extras-row');row.append(el('strong',title));if(detail)row.append(el('p',detail));$('extraBody').append(row);return row}
function renderExtras(){
 $('extraBody').replaceChildren();
 for(const a of catalog.accessories||[])extraRow(a.label_id?formatMessage(a.label_id,{},language.language):a.label,[a.notice_id?formatMessage(a.notice_id,{},language.language):a.notes,...(a.exclusive_group?['同じグループの追加Modは同時に選べません。']:[])].flat().filter(Boolean).join(' '));
 for(const b of catalog.banks||[]){if(selection.gantry&&selection.gantry!==b.gantry)continue;const g=catalog.options.gantry?.find(g=>g.id===b.gantry)?.label||b.gantry;extraRow(g+' / '+({stealthchanger:'StealthChanger',indx:'INDX',madmax:'MadMax'}[b.system]),b.permitted&&b.capacity>0&&b.choices>0?'ドック配置対応済み。自動交換動作は未検証。':'機体側ドックは未対応。ヘッドの装着表示と対応範囲が異なります。')}
 for(const mod of catalog.mods||[]){const row=extraRow(mod.label);row.append(badge(mod.options.length?'機体への組込対応済み':'単体表示のみ・機体組込は未対応',mod.options.length?'supported':'standalone'));for(const o of mod.options){row.append(el('p',o.label));for(const [key,value]of Object.entries(o.requires))row.append(el('p',(dimensions[key]||key)+' → '+(catalog.options[key]?.find(o=>o.id===value)?.label||value)))}const a=el('a','部品CADを確認');a.href='../viewer/components.html?component='+encodeURIComponent(mod.id);row.append(a)}
 $('extras').hidden=!$('extraBody').childElementCount;
}
function renderFilters(){
 $('filters').replaceChildren();
 for(const d of catalog.dimensions){const label=el('label',dimensions[d]||d),select=el('select');select.id='filter-'+d;label.htmlFor=select.id;select.dataset.i18n='off';select.setAttribute('aria-label',t(dimensions[d]||d));select.append(new Option(t('すべて'),''));
  const candidates=matchingRows(catalog,selection,d),at=catalog.dimensions.indexOf(d)+1,counts=new Map();for(const row of candidates)counts.set(row[at],(counts.get(row[at])||0)+1);
  for(const [i,o]of catalog.options[d].entries())select.append(new Option(t(o.label)+' · '+(counts.get(i)||0),o.id));
  select.value=selection[d]||'';select.classList.toggle('active',!!selection[d]);
  select.onchange=()=>{if(select.value)selection[d]=select.value;else delete selection[d];limit=12;setURL();renderFilters();renderResults();renderExtras()};label.append(select);$('filters').append(label);
 }
}
function renderResults(){
 const rows=matchingRows(catalog,selection);$('resultCount').textContent=t('登録構成数')+' · '+rows.length.toLocaleString();$('empty').hidden=rows.length>0;$('results').replaceChildren();
 for(const row of rows.slice(0,limit)){const card=el('article',undefined,'result'),values=catalog.dimensions.map((d,i)=>[d,catalog.options[d][row[i+1]].label]);card.append(el('h4',values.find(([d])=>d==='toolhead')?.[1]||target.label));const dl=el('dl');for(const [d,value]of values)dl.append(el('dt',dimensions[d]||d),el('dd',value));card.append(dl);
  const notes=catalog.notes[row.at(-1)];if(notes.length){const detail=el('details'),list=el('ul');detail.append(el('summary','取付条件・確認範囲'));for(const note of notes)list.append(el('li',note));detail.append(list);card.append(detail)}
  const link=el('a','この構成を3Dで開く');link.href=supportURL(target,catalog,row,location.href,language.language);card.append(link);$('results').append(card);
 }
 $('more').hidden=rows.length<=limit;
}
async function choose(id,{restore=false}={}){
 const n=++request;target=index.targets.find(x=>x.id===id)||index.targets.find(x=>x.id==='voron_trident_350');$('target').value=target.id;catalog=null;limit=12;selection={};$('catalog').hidden=true;$('error').hidden=true;
 $('targetSummary').replaceChildren(badge(statusLabels[target.status],target.status));if(target.status==='stock')$('targetSummary').append(el('p','元CADの標準構成を表示。部品の交換・組み合わせは未対応です。'));if(target.status==='missing')$('targetSummary').append(el('p',target.reason||'この仕様の組立CADは未登録です。'));renderHeads();
 if(!target.file){if(target.page){const a=el('a','ビュワーを開く');a.href=supportURL(target,null,null,location.href,language.language);$('targetSummary').append(a)}setURL();return}
 try{if(!cache.has(target.id))cache.set(target.id,await json('./data/'+target.file));if(n!==request)return;catalog=cache.get(target.id);if(restore){const q=new URLSearchParams(location.search);for(const d of catalog.dimensions){const value=q.get(d);if(catalog.options[d].some(o=>o.id===value))selection[d]=value}}
  setURL();$('catalog').hidden=false;$('download').href='./data/'+target.file;renderFilters();renderResults();renderExtras();
 }catch(e){if(n===request)error();console.error(e)}
}
$('target').onchange=()=>choose($('target').value);$('reset').onclick=()=>{selection={};limit=12;setURL();renderFilters();renderResults();renderExtras()};$('more').onclick=()=>{limit+=12;renderResults()};
window.addEventListener('rig-language-change',()=>{if(catalog){setURL();renderFilters();renderResults()}if(index)renderHeads()});
try{
 index=await json('./data/index.json');$('target').replaceChildren();
 for(const [status,label]of [['supported','組み合わせ対応済み'],['stock','標準構成のみ'],['missing','CAD未登録'],['standalone','単体での組み合わせ']]){const group=el('optgroup');group.label=label;for(const m of index.targets.filter(m=>m.status===status))group.append(new Option(m.label,m.id));$('target').append(group)}$('target').disabled=false;
 for(const [count,label]of [[index.targets.filter(m=>m.status==='supported').length,'組み合わせ対応済み'],[index.targets.filter(m=>m.status==='stock').length,'標準構成のみ'],[index.targets.filter(m=>m.status==='missing').length,'CAD未登録']]){const stat=el('div',undefined,'stat');stat.append(el('strong',count),el('span',label));$('stats').append(stat)}
 $('release').textContent=index.model_bundle.url.split('/').at(-2);
 for(const m of index.targets.filter(m=>m.kind!=='standalone')){const row=el('tr'),name=el('td'),button=el('button',m.label);button.onclick=()=>{choose(m.id);$('chooseTitle').scrollIntoView()};name.append(button);const status=el('td');status.append(badge(statusLabels[m.status],m.status));row.append(name,status,el('td',m.count?m.count.toLocaleString():'—'));$('machineRows').append(row)}
 await choose(new URLSearchParams(location.search).get('machine'),{restore:true});
}catch(e){error();console.error(e)}

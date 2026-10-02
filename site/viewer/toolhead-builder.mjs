import {collections,catalogDimensions} from './configuration-model.js?v=public-v24';
import {headPlan} from './head-assembly.js?v=public-v24';
import {appearanceRole} from './appearance-role.mjs?v=public-v24';
import {probeHasConflict} from './probe-checks.js?v=public-v24';

const labels={toolhead:'ヘッド',extruder:'押出機',hotend:'ホットエンド',cooling:'冷却',mount:'取付・交換機構',gantry:'キャリッジ / ベルト幅',carriage:'キャリッジ本体',probe:'プローブ',board:'基板'};
export function builderCandidates(catalog,filters={}){
 return catalog.variants.filter(v=>Object.entries(filters).every(([key,value])=>!value||v[key]===value));
}
export function builderGroups(catalog,filters={},currentId){
 const groups=new Map();
 for(const v of builderCandidates(catalog,filters)){
  if(!groups.has(v.toolhead))groups.set(v.toolhead,{id:v.toolhead,label:catalog.toolheads.find(t=>t.id===v.toolhead).label,variants:[]});
  groups.get(v.toolhead).variants.push(v);
 }
 return [...groups.values()].map(g=>({...g,count:g.variants.length,variant:g.variants.find(v=>v.id===currentId)||g.variants.find(v=>!probeHasConflict(v))||g.variants[0]}));
}
function https(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
function sources(meta,pins){
 const rows=[{source_url:meta.source_url||meta.source_repository,commit:meta.source_commit,license:meta.license},...(meta.source_records||[]),...(meta.component_source_url?[{source_url:meta.component_source_url,sha256:meta.component_source_sha256,license:'メーカー原本の利用条件を確認'}]:[])];
 const result=new Map();
 for(const r of rows){const url=https(r.source_url||r.url);if(!url)continue;
  const pin=pins.find(p=>p.repository&&(url==='https://github.com/'+p.repository||url.startsWith('https://github.com/'+p.repository+'/')));
  result.set(url,{url,commit:r.commit||pin?.commit||null,sha256:r.sha256||null,license:r.license||pin?.license||null,author:pin?.author||null});
 }
 return [...result.values()];
}
// Counts refer to visible CAD instances, never purchasing quantities.
export function builderManifest(catalog,variant,metadata,{dock=false,rail=false,pins=[]}={}){
 const plan=headPlan(variant),entries=[{id:plan.base,hidden_keys:[...plan.hidden],role:'tool'},...plan.modules];
 const modules=[];
 for(const entry of entries){
  if(entry.role==='dock'&&!dock)continue;
  const meta=metadata.get(entry.id);if(!meta)throw Error('部品表が未読込です: '+entry.id);
  const hidden=new Set(entry.hidden_keys||[]);
  const parts=meta.parts.filter(p=>!hidden.has(p.key)&&(!(p.component==='dock')||dock)&&(!['rail_reference','shuttle_reference'].includes(p.component)||rail)).map(p=>({key:p.key,name:p.name,role:appearanceRole(p)||'hardware',component:p.component||entry.role||'tool'}));
  if(!parts.length)continue;
  modules.push({id:entry.id,parts,sources:sources(meta,pins)});
 }
 return {schema:'3d-print-rig-head-parts-v1',configuration:variant.id,selection:catalogDimensions(catalog).map(k=>({dimension:k,label:labels[k]||k,id:variant[k],value:catalog[collections[k]]?.find(r=>r.id===variant[k])?.label||variant[k]})),modules,displayed_instances:modules.reduce((n,m)=>n+m.parts.length,0),printed_instances:modules.reduce((n,m)=>n+m.parts.filter(p=>['base','accent'].includes(p.role)).length,0),fit:variant.fit||{},notes:variant.notes||[],scope:'Visible CAD instances and module source references. Not a purchasing BOM or certification of physical compatibility.'};
}
export function validateBuilderExtras(data){
 const b=data.head_builder;if(b===undefined)return;
 if(!b||typeof b!=='object'||!b.palette||!['base','accent'].every(k=>typeof b.palette[k]==='string'&&/^#[0-9a-f]{6}$/iu.test(b.palette[k]))||!['see_inside','dock','rail'].every(k=>typeof b[k]==='boolean'))throw Error('配色・参照表示の保存データが不正です。');
}
export function builderURL(href,variant,extras){
 const u=new URL(href);u.searchParams.delete('mount');u.searchParams.set('configuration',variant.id);
 for(const key of ['base','accent'])if(/^#[0-9a-f]{6}$/iu.test(extras.palette[key]))u.searchParams.set(key,extras.palette[key].slice(1));
 return u.href;
}

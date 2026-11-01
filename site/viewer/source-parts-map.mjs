import {assemblySourceMaterial} from './assembly-stage-emphasis.mjs?v=31de7db3c02f47abdc16';
const sha=b=>crypto.subtle.digest('SHA-256',b).then(a=>[...new Uint8Array(a)].map(v=>v.toString(16).padStart(2,'0')).join(''));
const digest=v=>sha(new TextEncoder().encode(JSON.stringify(v)));
const fail=s=>{throw Error('Source part map: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const normalize=s=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[_\-]+/g,' ');
const manuals={
 v24:{revision:'2.4r2 / 2023-07-04',pages:263,sha256:'5deae644239870a7d265b15bd0158bf05d7cb416680959b386f19498afcfa888',url:'https://raw.githubusercontent.com/VoronDesign/Voron-2/a192410e27ea345644ae5c4b29b4c9c40cbe1a73/Manual/Assembly_Manual_2.4r2.pdf'},
 trident:{revision:'Trident / 2026-06-24',pages:321,sha256:'e85cecd14df3b892d84bc51496943b3c70c7f78539a2e5149404f17401444319',url:'https://raw.githubusercontent.com/VoronDesign/Voron-Trident/a8628f48546948ce1fc15511b7765b7f31f80722/Manual/Assembly_Manual_Trident.pdf'}
};
export const sourceMapMachines=Object.freeze([...[250,300,350].map(n=>`voron_trident_${n}`),...[250,300,350].flatMap(n=>['printed','ldo_cnc'].map(t=>`voron_v24_${n}_${t}`))]);
const chapters={v24:{V24_Frame:[12,21],V24_Z_Drives:[22,61],V24_Bed:[52,61],V24_Gantry:[62,145],V24_CNC_Drives:[62,107],V24_X_Beam:[82,123],V24_Toolhead:[146,147],V24_Reference_Belts:[124,145],V24_Electronics:[148,211],V24_Skirts:[212,239],V24_Enclosure:[240,259],V24_Exhaust:[240,259],V24_Spool:[240,259]},trident:{Frame:[12,23],'Z Assembly':[77,187],Electronics:[190,268],Skirt:[269,290],Panels:[291,320],Filament_Path:[291,320],gantry:[24,163],head:[188,189]}};
const visible=n=>{for(let p=n;p;p=p.parent)if(!p.visible)return false;return true};
const under=(n,p)=>{for(let q=n;q;q=q.parent)if(q===p)return true;return false};
const matrix=n=>{const a=n.matrixWorld?.elements;if(!a||a.length!==16||!Array.from(a).every(Number.isFinite))fail('Nonfinite source matrix');return Array.from(a)};

// A source occurrence may own several render primitives. No mesh is moved,
// recolored or hidden by this index. Hierarchy is not an insertion sequence.
export async function createSourcePartsMap(loaded,scene,{allowVisibilityStages=false}={}){
 const id=loaded?.source?.machineId;if(!sourceMapMachines.includes(id))fail('Unregistered machine');
 const root=loaded.root;if(root?.parent!==scene||!scene?.isScene||loaded.inspection?.active()!==true)fail('Inactive or detached assembly');
 const family=id.startsWith('voron_v24_')?'v24':'trident',manual=Object.freeze({...manuals[family]}),components=loaded.inspection.components;
 if(!dense(components)||!components.length)fail('Missing received components');
 const rows=new Map(),nodes=new Map(),groups=new Map(),assets=[],snapshots=[],claimed=new Set(),paths=new Set();root.updateMatrixWorld(true);
 for(const c of components){
  if(!c||typeof c.path!=='string'||paths.has(c.path)||!under(c.root,root)||!dense(c.meta?.parts)||!c.meta.parts.length)fail('Invalid component ownership');paths.add(c.path);
  if(!validHash(c.metadata?.sha256)||!validHash(c.model?.sha256)||!Number.isSafeInteger(c.metadata.bytes)||c.metadata.bytes<=0||!Number.isSafeInteger(c.model.bytes)||c.model.bytes<=0)fail('Missing actual receipts');
  assets.push([c.path,c.metadata.sha256,c.metadata.bytes,c.model.sha256,c.model.bytes]);
  const local=new Map();
  for(const p of c.meta.parts){
   const raw=String(p.key??'');if(!raw||local.has(raw)||typeof p.name!=='string'||!p.name)fail('Invalid source occurrence');
   const key=c.path+'#'+raw,sourceGroup=typeof p.group==='string'&&p.group?p.group:(c.path.includes('gantry')?'gantry':'head');
   if(!chapters[family][sourceGroup])fail('Unreviewed source classification: '+sourceGroup);
   const path=Array.isArray(p.source_path)?p.source_path.map(String):[p.source_component??p.name];
   const row=Object.freeze({key,name:p.name,group:sourceGroup,role:p.appearance_role??'',path:Object.freeze([c.path,...path])});
   rows.set(key,row);local.set(raw,key);nodes.set(key,[]);if(!groups.has(sourceGroup))groups.set(sourceGroup,[]);groups.get(sourceGroup).push(key);
  }
  c.root.traverse(n=>{
   if(!n.isMesh)return;if(claimed.has(n))fail('Mesh has multiple source components');claimed.add(n);
   const raw=String(n.userData.layoutMaterialAudit?.key??n.userData.part_key??n.userData.partKey??n.name.match(/^P(.+?)__/)?.[1]??n.name),key=local.get(raw);
   if(!key)fail('Unowned rendered mesh: '+n.name);const g=n.geometry,p=g?.getAttribute('position');
   if(!p||p.itemSize!==3||!p.count||!n.material)fail('Missing source geometry/material');
   nodes.get(key).push(n);snapshots.push({n,key,g,p,index:g.index,material:n.material,parent:n.parent,drawStart:g.drawRange.start,drawCount:g.drawRange.count,positionVersion:p.version,matrix:matrix(n),visible:n.visible});
  });
  for(const key of local.values())if(!nodes.get(key).length)fail('Missing source model: '+key);
 }
 root.traverse(n=>{if(n.isMesh&&!claimed.has(n))fail('Unregistered rendered companion')});
 const nativeVisibility=new Map(snapshots.map(s=>[s,s.visible]));
 const metadataSnapshot=JSON.stringify(components.map(c=>c.meta)),state=snapshots.map(s=>[s.key,s.n.name,s.matrix,s.visible,s.p.count,s.index?.count??0]);
 const sourceDocuments=await digest(assets),sourceState=await digest([metadataSnapshot,state,loaded.source.configuration??loaded.source.defaultConfiguration??null]);
 const stages=Array.from(groups,([group,keys],i)=>Object.freeze({id:group,index:i,title:group.replace(/^V24_/,'').replaceAll('_',' ').replace(/^head$/,'Head').replace(/^gantry$/,'Gantry'),note:'The complete default assembly stays visible. Classifications are not an insertion order. Manual links are related references; CNC and companion details require their original instructions.',page_start:chapters[family][group][0],page_end:chapters[family][group][1],part_keys:Object.freeze(keys)}));
 const stagesHash=await digest([assets,sourceState,stages,manual]),identity=Object.freeze({machine:id,view_kind:'source-classifications-v1',source_documents_sha256:sourceDocuments,source_state_sha256:sourceState,stages_sha256:stagesHash,manual_sha256:manual.sha256,manual_revision:manual.revision});
 const stage=v=>{const s=typeof v==='string'?stages.find(s=>s.id===v):stages[v];if(!s)fail('Unknown classification');return s};
 const owners=new Map(stages.flatMap(s=>s.part_keys.map(k=>[k,s]))),search=stages.map(s=>normalize([s.title,...s.part_keys.flatMap(k=>{const p=rows.get(k);return[p.key,p.name,...p.path]})].join(' ')));
 function verifyLive(){
  if(root.parent!==scene||loaded.inspection.active()!==true||JSON.stringify(components.map(c=>c.meta))!==metadataSnapshot)fail('Source assembly retired or metadata changed');root.updateMatrixWorld(true);
  for(const s of snapshots){if(!under(s.n,root)||s.n.parent!==s.parent||s.n.geometry!==s.g||s.g.drawRange.start!==s.drawStart||s.g.drawRange.count!==s.drawCount||s.p.version!==s.positionVersion||s.g.getAttribute('position')!==s.p||s.g.index!==s.index||assemblySourceMaterial(s.n)!==s.material||s.n.visible!==s.visible||matrix(s.n).some((n,i)=>n!==s.matrix[i]))fail('Source assembly changed')}
 }
 function setVisibilityKeys(keys){
  if(!allowVisibilityStages)fail('Visibility stages require explicit opt-in');verifyLive();
  if(keys!==null&&(!dense(keys)||new Set(keys).size!==keys.length||keys.some(k=>!rows.has(k))))fail('Invalid visibility stage');
  const shown=keys===null?null:new Set(keys);
  for(const s of snapshots){const d=Object.getOwnPropertyDescriptor(s.n,'visible');if(!d||!('value'in d)||!d.writable)fail('Unwritable source visibility')}
  for(const s of snapshots){s.n.visible=nativeVisibility.get(s)&&(shown===null||shown.has(s.key));s.visible=s.n.visible}
  return snapshots.filter(s=>visible(s.n)).map(s=>({key:s.key,node:s.n}));
 }
 return Object.freeze({identity,manual,setVisibilityKeys,stages:Object.freeze(stages),partCount:rows.size,renderCount:snapshots.length,stage,
  part(k){const p=rows.get(k);if(!p)fail('Unknown source part');return p},owner(k){const s=owners.get(k);if(!s)fail('Unknown source part');return s},parts(v){return Object.freeze(stage(v).part_keys.map(k=>rows.get(k)))},
  matchParts(value,query,translate=v=>v){const s=stage(value),tokens=normalize(query).split(/\s+/).filter(Boolean);return s.part_keys.map(k=>rows.get(k)).filter(p=>tokens.every(t=>normalize([translate(s.title),p.key,p.name,p.group,...p.path].join(' ')).includes(t)))},
  search(query,translate=v=>v){const tokens=normalize(query).split(/\s+/).filter(Boolean);return stages.filter(s=>tokens.every(t=>(search[s.index]+' '+normalize(translate(s.title))).includes(t)))},
  entries(){verifyLive();return snapshots.filter(s=>visible(s.n)).map(s=>({key:s.key,node:s.n}))},
  getPartNodes(k){verifyLive();if(!nodes.has(k))fail('Unknown source part');return [...nodes.get(k)].filter(visible)},
  state(v){verifyLive();const s=stage(v),visibleKeys=Array.from(nodes,([key,ns])=>ns.some(visible)?key:null).filter(Boolean);return {index:s.index,visible_keys:visibleKeys,visible_count:visibleKeys.length,added:s.part_keys.length,manual_text:`Official manual ${s.page_start}–${s.page_end}`}},verifyLive
 });
}

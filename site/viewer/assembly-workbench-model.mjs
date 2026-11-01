import {assemblyProgressNeedsMigration,assemblyProgressStageCorrection} from './assembly-progress-migrations.mjs?v=c1a32fd13ba2aa1ccb36';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const fail=message=>{throw Error('Assembly workbench: '+message)};
const plain=v=>JSON.parse(JSON.stringify(v));
const normalize=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
export const assemblyProgressSchema='assembly-workbench-progress-v2';

export async function readAssemblyStageDocument(response,hashBytes){
 if(!response?.ok||typeof hashBytes!=='function')fail('Stage document unavailable');
 const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)fail('Stage document too large');
 const sha256=await hashBytes(bytes);if(!hash(sha256))fail('Stage receipt missing');
 return {data:JSON.parse(new TextDecoder().decode(bytes)),sha256};
}

// This index describes source occurrences, not a purchasing BOM or an insertion
// path. The caller supplies actual loader receipts, including the stage document.
export function createAssemblyIndex({manifest,machine,receipts}={}){
 if(!record(manifest)||!text(manifest.machine_id)||!Array.isArray(manifest.parts)||!manifest.parts.length||!record(machine)||!Array.isArray(machine.stages)||!machine.stages.length)fail('Missing source data');
 if(!record(receipts)||!hash(receipts['model.glb'])||!hash(receipts['assembly_manifest.json'])||!hash(receipts['assembly_stages.json'])||
   receipts['model.glb']!==machine.model_sha256||receipts['assembly_manifest.json']!==machine.manifest_sha256)fail('Source receipts do not match');
 if(!record(machine.manual)||!hash(machine.manual.sha256)||!text(machine.manual.revision)||!Number.isSafeInteger(machine.manual.pages)||!text(machine.manual.url)||!machine.manual.url.startsWith('https://'))fail('Missing pinned manual');
 const parts=new Map(),owners=new Map(),ids=new Map();
 for(let i=0;i<manifest.parts.length;i++){
  if(!Object.hasOwn(manifest.parts,i))fail('Sparse source parts');const p=manifest.parts[i];
  if(!record(p)||!text(p.key)||parts.has(p.key)||!text(p.name))fail('Missing or duplicate source part');
  parts.set(p.key,Object.freeze({key:p.key,name:p.name,group:text(p.group)?p.group:'',role:text(p.appearance_role)?p.appearance_role:'',path:Object.freeze(Array.isArray(p.source?.assembly_path)?p.source.assembly_path.filter(text):[])}));
 }
 if(!Number.isSafeInteger(machine.parts)||machine.parts!==parts.size)fail('Source part count changed');
 for(let i=0;i<machine.stages.length;i++)if(!Object.hasOwn(machine.stages,i))fail('Sparse stages');
 const stages=machine.stages.map((s,index)=>{
  if(!Object.hasOwn(machine.stages,index)||!record(s)||!text(s.id)||ids.has(s.id)||!text(s.title)||!Array.isArray(s.part_keys))fail('Missing or duplicate stage');
  if(!Number.isSafeInteger(s.page_start)||!Number.isSafeInteger(s.page_end)||s.page_start<1||s.page_end<s.page_start||s.page_end>machine.manual.pages)fail('Stage outside pinned manual');
  if(s.note!==undefined&&typeof s.note!=='string')fail('Invalid stage note');
  const keys=[];
  for(let i=0;i<s.part_keys.length;i++){
   if(!Object.hasOwn(s.part_keys,i)||!parts.has(s.part_keys[i])||owners.has(s.part_keys[i]))fail('Unknown or multiply assigned source part');
   const key=s.part_keys[i];owners.set(key,index);keys.push(key);
  }
  ids.set(s.id,index);
  const copy={id:s.id,index,title:s.title,note:s.note||'',page_start:s.page_start,page_end:s.page_end,part_keys:Object.freeze(keys)};
  if(Object.hasOwn(s,'operation_part_keys')){
   if(!Array.isArray(s.operation_part_keys))fail('Invalid operation source references');
   const refs=[],seen=new Set();
   for(let i=0;i<s.operation_part_keys.length;i++){
    if(!Object.hasOwn(s.operation_part_keys,i))fail('Sparse operation references');
    const key=s.operation_part_keys[i];if(!text(key)||!parts.has(key)||seen.has(key))fail('Unknown or duplicate operation reference');seen.add(key);refs.push(key);
   }
   if(keys.some(key=>!seen.has(key)))fail('New source part missing from operation');
   copy.operation_part_keys=Object.freeze(refs);
  }
  return Object.freeze(copy);
 });
 if(owners.size!==parts.size)fail('Unassigned source parts');
 const refs=s=>s.operation_part_keys||s.part_keys;
 const operations=new Map([...parts.keys()].map(k=>[k,[]]));
 for(const s of stages)for(const key of refs(s)){
  if(owners.get(key)>s.index)fail('Operation references a future source part');
  operations.get(key).push(s);
 }
 for(const rows of operations.values())Object.freeze(rows);
 const searchBase=stages.map(s=>normalize([s.title,s.note,s.id,...refs(s).flatMap(key=>{const p=parts.get(key);return [p.key,p.name,p.group,...p.path]})].join(' ')));
 const identity=Object.freeze({machine:manifest.machine_id,model_sha256:receipts['model.glb'],manifest_sha256:receipts['assembly_manifest.json'],stages_sha256:receipts['assembly_stages.json'],manual_sha256:machine.manual.sha256,manual_revision:machine.manual.revision});
 const stage=value=>{const index=typeof value==='string'?ids.get(value):value;if(!Number.isSafeInteger(index)||!stages[index])fail('Unknown stage');return stages[index];};
 return Object.freeze({identity,stages:Object.freeze(stages),partCount:parts.size,
  stage,part(key){if(!parts.has(key))fail('Unknown source part');return parts.get(key);},
  owner(key){if(!owners.has(key))fail('Unknown source part');return stages[owners.get(key)];},
  parts(value){return Object.freeze(refs(stage(value)).map(key=>parts.get(key)));},
  operations(key){if(!operations.has(key))fail('Unknown source part');return operations.get(key);},
  search(query,translate=v=>v){
   const tokens=normalize(query).split(' ').filter(Boolean);
   return Object.freeze(stages.filter(s=>{
    const words=searchBase[s.index]+' '+normalize(translate(s.title)+' '+translate(s.note));
    return tokens.every(token=>words.includes(token));
   }));
  },
 });
}

export function validateAssemblyProgress(index,value){
 if(!record(value)||!['assembly-workbench-progress-v1',assemblyProgressSchema].includes(value.schema)||!record(value.identity)||!text(value.current_stage)||!Array.isArray(value.checked_stages))fail('Invalid progress file');
 const legacy=value.schema==='assembly-workbench-progress-v1',fields=legacy?['checked_stages','current_stage','identity','schema']:['checked_parts','checked_stages','current_stage','identity','schema'];
 if(Object.keys(value).sort().join('|')!==fields.join('|')||!legacy&&!Array.isArray(value.checked_parts))fail('Unknown progress fields');
 const expected=index.identity;
 if(Object.keys(value.identity).sort().join('|')!==Object.keys(expected).sort().join('|')||Object.keys(expected).some(k=>value.identity[k]!==expected[k])&&!assemblyProgressNeedsMigration(index,value.identity))fail('Progress belongs to another model or manual revision');
 index.stage(value.current_stage);const checked=new Set();
 for(let i=0;i<value.checked_stages.length;i++){
  if(!Object.hasOwn(value.checked_stages,i)||!text(value.checked_stages[i])||checked.has(value.checked_stages[i]))fail('Invalid checked stage');
  index.stage(value.checked_stages[i]);checked.add(value.checked_stages[i]);
 }
 const parts=new Set(),order=index.stages.flatMap(s=>s.part_keys),input=legacy?[]:value.checked_parts;
 for(let i=0;i<input.length;i++){
  if(!Object.hasOwn(input,i)||!text(input[i])||parts.has(input[i]))fail('Invalid checked part');
  index.part(input[i]);parts.add(input[i]);
 }
 const correction=assemblyProgressStageCorrection(index,value.identity),current_stage=correction?.current[value.current_stage]||value.current_stage;
 index.stage(current_stage);if(correction)for(const id of correction.recheck)checked.delete(id);
 return {schema:assemblyProgressSchema,identity:plain(expected),current_stage,checked_stages:index.stages.filter(s=>checked.has(s.id)).map(s=>s.id),checked_parts:order.filter(k=>parts.has(k))};
}

export function createAssemblyProgress(index,saved){
 const partOrder=index.stages.flatMap(s=>s.part_keys);
 let current=saved===undefined?{schema:assemblyProgressSchema,identity:plain(index.identity),current_stage:index.stages[0].id,checked_stages:[],checked_parts:[]}:validateAssemblyProgress(index,saved);
 const snapshot=()=>plain(current);
 return Object.freeze({snapshot,
  setStage(value){const s=index.stage(value);current={...current,current_stage:s.id};return snapshot();},
  toggle(value){const s=index.stage(value),checked=new Set(current.checked_stages);if(checked.has(s.id))checked.delete(s.id);else checked.add(s.id);current={...current,checked_stages:index.stages.filter(r=>checked.has(r.id)).map(r=>r.id)};return snapshot();},
  togglePart(key){index.part(key);const checked=new Set(current.checked_parts);if(checked.has(key))checked.delete(key);else checked.add(key);current={...current,checked_parts:partOrder.filter(k=>checked.has(k))};return snapshot();},
  clearChecks(){const before=snapshot();current={...current,checked_stages:[],checked_parts:[]};return before;},
  restore(value){const next=validateAssemblyProgress(index,value);current=next;return snapshot();},
 });
}

export function assemblyProgressStorageKey(index){return '3d-print-rig-assembly-progress-v2:'+index.identity.machine+':'+index.identity.stages_sha256;}

export function legacyAssemblyProgressStorageKey(index){return '3d-print-rig-assembly-progress-v1:'+index.identity.machine+':'+index.identity.stages_sha256;}

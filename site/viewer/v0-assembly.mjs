import {prepareV0M2Seating,createV0M2Seating} from './v0-m2-seating.mjs?v=d15ba41d0be2c9a7b68b';
// Manual stages with an optional, source-pinned rail preparation presentation.
// Preparation poses are temporary rigid layouts, not insertion or clearance.
import {createV0RailPreparation} from './v0-rail-preparation.mjs?v=74bbc70d05eb89bed68a';
import {createV0DriveAssembly} from './v0-drive-assembly.mjs?v=87761f3c0ebfce5998a9';
import {createV0BedAssembly} from './v0-bed-assembly.mjs?v=3163b8e34404795e6717';
import {createV0FeetAssembly} from './v0-feet-assembly.mjs?v=ee39e640a1ba4e93eac0';
import {createV0IdlerAssembly} from './v0-idler-assembly.mjs?v=0847fa8bd4d517597689';
import {createV0XYPreparation} from './v0-xy-preparation.mjs?v=0127d6a73db5ed16ccff';
import {createV0HeadAssembly} from './v0-head-assembly.mjs?v=aa602b0240cf8b746e12';
export const v0AssemblySchema='v0-assembly-stages-v1';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const fail=message=>{throw Error('V0 assembly: '+message)};

// `machine` accepts the complete schema document (selected by manifest.machine_id)
// or its already selected machines[machine_id] entry. Receipts are verified byte
// digests from the loader: model.glb is the decoded GLB, not its gzip container.
export function validateV0AssemblyStages({nodes,manifest,machine,receipts,companions=[]}={}){
 if(!record(manifest)||!text(manifest.machine_id)||!Array.isArray(manifest.parts))fail('Invalid native manifest');
 if(!record(machine))fail('Missing machine stage specification');
 if('schema' in machine||'machines' in machine){
  if(machine.schema!==v0AssemblySchema||!record(machine.machines))fail('Unknown stage schema');
  if(!Object.hasOwn(machine.machines,manifest.machine_id))fail('Unregistered machine: '+manifest.machine_id);
  machine=machine.machines[manifest.machine_id];
 }
 if(!record(machine))fail('Invalid machine stage specification');
 if(machine.machine_id!==undefined&&machine.machine_id!==manifest.machine_id)fail('Machine identity mismatch');
 if(!hash(machine.model_sha256)||!hash(machine.manifest_sha256))fail('Missing native source hashes');
 if(!record(receipts)||!hash(receipts['model.glb'])||!hash(receipts['assembly_manifest.json'])||
    machine.model_sha256.toLowerCase()!==receipts['model.glb'].toLowerCase()||
    machine.manifest_sha256.toLowerCase()!==receipts['assembly_manifest.json'].toLowerCase())fail('Stale or unverified model/manifest bytes');
 if(!Number.isSafeInteger(machine.parts)||machine.parts<1||machine.parts!==manifest.parts.length)fail('Native part count mismatch');
 if(!(nodes instanceof Map)||nodes.size!==machine.parts)fail('Native node count mismatch');
 const keys=new Set(),objects=new Set();
 for(const row of manifest.parts){
  if(!record(row)||!text(row.key)||keys.has(row.key))fail('Missing or duplicate manifest part');
  keys.add(row.key);
  const node=nodes.get(row.key);
  if(!record(node)||typeof node.visible!=='boolean'||objects.has(node))fail('Missing or duplicate native node: '+row.key);
  if(node.userData?.part_key!==undefined&&node.userData.part_key!==row.key)fail('Native node identity mismatch: '+row.key);
  const visible=Object.getOwnPropertyDescriptor(node,'visible');
  if(!visible||!('value' in visible)||!visible.writable)fail('Native visibility is not a writable data property: '+row.key);
  objects.add(node);
 }
 for(const key of nodes.keys())if(!keys.has(key))fail('Unknown native node: '+key);
 // Stock display companions replace exact source leaves, for example the
 // carriage with its manufacturing support removed. Never re-show the hidden
 // source leaves to make a stage or focus target visible.
 if(!Array.isArray(companions))fail('Invalid stock display companions');
 const companionObjects=new Set(),companionKeys=new Set();
 const companionRows=companions.map(row=>{
  if(!record(row)||!record(row.node)||objects.has(row.node)||companionObjects.has(row.node))fail('Missing or duplicate stock companion node');
  const descriptor=Object.getOwnPropertyDescriptor(row.node,'visible');
  if(!descriptor||!('value' in descriptor)||!descriptor.writable||typeof row.node.visible!=='boolean')fail('Stock companion visibility is not writable');
  if(!Array.isArray(row.part_keys)||!row.part_keys.length)fail('Missing stock companion source keys');
  for(const key of row.part_keys){
   if(!keys.has(key))fail('Unknown stock companion source key: '+key);
   if(companionKeys.has(key))fail('Duplicate stock companion source key: '+key);
   if(nodes.get(key).visible)fail('Stock companion native replacement is still visible: '+key);
   companionKeys.add(key);
  }
  // A companion is an external display wrapper, never a native root/parent.
  for(const node of objects){const seen=new Set();for(let parent=node;parent;parent=parent.parent){
   if(seen.has(parent))fail('Cycle in native parent graph');seen.add(parent);
   if(parent===row.node)fail('Stock companion contains a native node');
  }}
  companionObjects.add(row.node);return {node:row.node,part_keys:[...row.part_keys]};
 });
 for(const {node}of companionRows){const seen=new Set([node]);for(let parent=node.parent;parent;parent=parent.parent){
  if(seen.has(parent))fail('Cycle in stock companion parent graph');seen.add(parent);
  if(companionObjects.has(parent)||objects.has(parent))fail('Stock companion wrappers overlap native or companion roots');
 }}
 const manual=machine.manual;
 if(!record(manual)||!text(manual.url)||!hash(manual.sha256)||!Number.isSafeInteger(manual.pages)||manual.pages<1||!text(manual.revision))fail('Invalid pinned manual');
 let url;try{url=new URL(manual.url)}catch{fail('Invalid manual URL')}
 if(url.protocol!=='https:'||url.username||url.password)fail('Manual must have a public HTTPS URL');
 if(!Array.isArray(machine.stages)||!machine.stages.length)fail('Missing manual stages');
 const ids=new Set(),assigned=new Set();
 const stages=machine.stages.map(stage=>{
  if(!record(stage)||!text(stage.id)||ids.has(stage.id)||!text(stage.title))fail('Missing or duplicate stage identity/title');
  ids.add(stage.id);
  if(!Number.isSafeInteger(stage.page_start)||!Number.isSafeInteger(stage.page_end)||stage.page_start<1||stage.page_end<stage.page_start||stage.page_end>manual.pages)fail('Manual page range outside pinned document: '+stage.id);
  for(const field of ['title_ja','note','note_ja'])if(stage[field]!==undefined&&typeof stage[field]!=='string')fail('Invalid stage copy: '+stage.id);
  if(stage.title_ja!==undefined&&!text(stage.title_ja))fail('Empty Japanese stage title: '+stage.id);
  if(!Array.isArray(stage.part_keys))fail('Missing stage part keys: '+stage.id);
  for(const key of stage.part_keys){
   if(!text(key)||!keys.has(key))fail('Unknown stage part: '+key);
   if(assigned.has(key))fail('Part assigned more than once: '+key);
   assigned.add(key);
  }
  const copy={id:stage.id,title:stage.title,page_start:stage.page_start,page_end:stage.page_end,part_keys:[...stage.part_keys]};
  for(const field of ['title_ja','note','note_ja'])if(stage[field]!==undefined)copy[field]=stage[field];
  if(Object.hasOwn(stage,'operation_part_keys')){
   if(!Array.isArray(stage.operation_part_keys))fail('Invalid operation references');
   const refs=[],seen=new Set();
   for(let i=0;i<stage.operation_part_keys.length;i++){
    if(!Object.hasOwn(stage.operation_part_keys,i))fail('Sparse operation references');
    const key=stage.operation_part_keys[i];if(!text(key)||!keys.has(key)||seen.has(key))fail('Unknown or duplicate operation reference');seen.add(key);refs.push(key);
   }
   if(copy.part_keys.some(key=>!seen.has(key)))fail('New source part missing from operation');
   copy.operation_part_keys=refs;
  }
  return copy;
 });
 if(assigned.size!==keys.size)fail('Unassigned native parts: '+[...keys].filter(key=>!assigned.has(key)).join(', '));
 const stageIndex=new Map(stages.flatMap((stage,index)=>stage.part_keys.map(key=>[key,index])));
 const stageIds=new Map(stages.map((stage,index)=>[stage.id,index]));
 for(const [index,stage]of stages.entries())for(const key of stage.operation_part_keys||stage.part_keys)if(stageIndex.get(key)>index)fail('Operation references a future source part');
 const seatDependencies=machine.seat_display_dependencies===undefined?[]:machine.seat_display_dependencies;
 if(!Array.isArray(seatDependencies))fail('Invalid seat display dependencies');
 const seats=new Map();
 for(const row of seatDependencies){
  if(!record(row)||!keys.has(row.part_key)||!keys.has(row.carrier_key)||row.part_key===row.carrier_key||seats.has(row.part_key))fail('Invalid or duplicate seat dependency');
  if(!stageIds.has(row.preload_stage_id)||stageIds.get(row.preload_stage_id)>stageIndex.get(row.part_key))fail('Invalid seat preload stage');
  if(stageIndex.get(row.part_key)<stageIndex.get(row.carrier_key))fail('Fastener displayed before its receiving part: '+row.part_key);
  seats.set(row.part_key,{part_key:row.part_key,carrier_key:row.carrier_key,preload_stage_id:row.preload_stage_id});
 }
 for(const key of seats.keys()){
  const seen=new Set();for(let current=key;seats.has(current);current=seats.get(current).carrier_key){
   if(seen.has(current))fail('Cycle in seat display dependencies');seen.add(current);
  }
 }
 return {machine_id:manifest.machine_id,model_sha256:machine.model_sha256,manifest_sha256:machine.manifest_sha256,parts:machine.parts,
  manual:{url:manual.url,sha256:manual.sha256,pages:manual.pages,revision:manual.revision},stages,companions:companionRows,seat_display_dependencies:[...seats.values()]};
}


const m2Preflights=new WeakMap();
const stageSignature=s=>JSON.stringify([s.machine_id,s.model_sha256,s.manifest_sha256,s.parts,s.manual,s.stages,s.seat_display_dependencies]);
export async function prepareV0AssemblyM2Seating(options){
 const spec=validateV0AssemblyStages(options),signature=stageSignature(spec);
 const receipt=await prepareV0M2Seating({nodes:options.nodes,manifest:options.manifest,spec,receipts:options.receipts});
 const token=Object.freeze({});m2Preflights.set(token,{spec,signature,receipt,nodes:options.nodes,manifest:options.manifest,machine:options.machine,receipts:options.receipts,companions:options.companions,used:false});return token;
}

export function createV0AssemblyStages(options){
 const validated=validateV0AssemblyStages(options),received=options.manualPreparation&&options.sourceDerivedFastenerSeating?m2Preflights.get(options.m2SeatingReceipt):null;
 if(options.sourceDerivedFastenerSeating&&(!received||received.used||received.nodes!==options.nodes||received.manifest!==options.manifest||received.machine!==options.machine||received.receipts!==options.receipts||received.companions!==options.companions||received.signature!==stageSignature(validated)||received.signature!==stageSignature(received.spec)))fail('Missing current exact source-derived fastener preflight');
 const spec=received?received.spec:validated,nodes=options.nodes,bindings=new Map(nodes);
 const m2=received?createV0M2Seating({nodes,manifest:options.manifest,spec,receipts:options.receipts,receipt:received.receipt}):null;
 if(received)received.used=true;
 const companionBindings=spec.companions,companionForKey=new Map();
 const preparation=options.manualPreparation?createV0RailPreparation({nodes,manifest:options.manifest,spec}):null;
 const drive=options.manualPreparation?createV0DriveAssembly(spec,options.manifest.machine_id):null;
 const bed=options.manualPreparation?createV0BedAssembly(spec,options.manifest.machine_id):null;
 const feet=options.manualPreparation?createV0FeetAssembly(spec,options.manifest.machine_id):null;
 const idler=options.manualPreparation?createV0IdlerAssembly({nodes,manifest:options.manifest,spec}):null;
 const xy=options.manualPreparation?createV0XYPreparation({nodes,manifest:options.manifest,spec}):null;
 const head=options.manualPreparation?createV0HeadAssembly({spec,manifest:options.manifest}):null;
 for(const row of companionBindings)for(const key of row.part_keys)companionForKey.set(key,row.node);
 let active=null;
 function checkBindings(){
  if(nodes.size!==bindings.size)fail('Native node graph changed');
  for(const [key,node]of bindings)if(nodes.get(key)!==node||node.userData?.part_key!==undefined&&node.userData.part_key!==key)fail('Native node graph changed: '+key);
 }
 function snapshot(){
  const graph=new Map(),ancestors=new Map(),visibilities=new Map(),companionVisibilities=new Map();
  function walk(node,ancestors){
   if(ancestors.has(node))fail('Cycle in native node graph');
   if(graph.has(node))return;
   if(node.children!==undefined&&!Array.isArray(node.children))fail('Invalid native children');
   const children=node.children?[...node.children]:null;
   graph.set(node,{parent:node.parent,childrenRef:node.children,children,part_key:node.userData?.part_key,visible:node.visible});
   if(children){const next=new Set(ancestors);next.add(node);for(const child of children){if(!record(child))fail('Invalid native child');walk(child,next)}}
  }
  for(const [key,node]of bindings)visibilities.set(key,node.visible);
  for(const {node}of companionBindings)companionVisibilities.set(node,node.visible);
  for(const node of [...bindings.values(),...companionVisibilities.keys()]){
   walk(node,new Set());
   const seen=new Set([node]);
   for(let parent=node.parent;parent;parent=parent.parent){
    if(!record(parent)||seen.has(parent))fail('Cycle or invalid native parent graph');
    seen.add(parent);ancestors.set(parent,{parent:parent.parent,visible:parent.visible});
   }
  }
  return {graph,ancestors,visibilities,companionVisibilities,index:null,part_keys:[]};
 }
 function checkActive(){
  checkBindings();
  preparation?.check();
  idler?.check();
  xy?.check();
  m2?.check();
  if(!active)return;
  for(const [node,row]of active.graph){
   if(node.parent!==row.parent||node.children!==row.childrenRef||node.userData?.part_key!==row.part_key||
      row.children&&(node.children.length!==row.children.length||row.children.some((child,i)=>node.children[i]!==child)))fail('Native node graph changed during assembly');
   if(node.visible!==row.visible)fail('Native visibility changed outside assembly controller');
  }
  for(const [node,row]of active.ancestors){
   if(node.parent!==row.parent)fail('Native parent graph changed during assembly');
   if(!active.graph.has(node)&&node.visible!==row.visible)fail('Native parent visibility changed outside assembly controller');
  }
 }
 function visibleNode(node){
  if(!node)return false;
  for(;node;node=node.parent)if(node.visible===false)return false;
  return true;
 }
 function visibleKeys(keys=active.part_keys){
  return keys.filter(key=>visibleNode(nodes.get(key))||visibleNode(companionForKey.get(key)));
 }
 function result(){
  if(!active)return null;
  const stage=spec.stages[active.index];
  const value={index:active.index,total:spec.stages.length,id:stage.id,title:stage.title,pages:[stage.page_start,stage.page_end],
   added:stage.part_keys.length,visible_count:visibleKeys().length,part_keys:[...stage.part_keys],cumulative_part_keys:[...active.part_keys]};
  for(const field of ['title_ja','note','note_ja'])if(stage[field]!==undefined)value[field]=stage[field];
  if(stage.operation_part_keys)value.operation_part_keys=[...stage.operation_part_keys];
  if(preparation){value.preparation=preparation.prepared(active.index);value.stored_count=preparation.deferred(active.index).length;
   value.presentation_note=value.preparation?'The five prepared carriers are laid out together. This arrangement is for inspection; it does not show installation positions or insertion paths.':value.stored_count?'Prepared carriers for later rails are set aside. Each appears with its receiving rail at the installation stage.':'';
  }
  const bedWork=bed?.at(active.index),feetWork=feet?.at(active.index),idlerWork=idler?.at(active.index),xyWork=xy?.at(active.index),headWork=head?.at(active.index),manualWork=headWork||xyWork||idlerWork||feetWork||bedWork,work=manualWork||drive?.at(active.index);
  value.presentation_id=work?.id||(value.preparation?'rail-preparation':'installed');
  value.subassembly=manualWork?manualWork.isolated:Boolean(work);value.underside=Boolean(work?.underside);
  if(work&&!manualWork)value.presentation_note='Only the current drive subassembly is shown. The frame and previously prepared parts are set aside; the drives join the frame at manual page 81.';
  if(xyWork?.isolated)value.presentation_note='Only the current XY joint operation is shown. Prepared parts stay aside until the closing or installation operation.';
  value.manual_fastener_reference=Boolean(m2&&active.index>=spec.stages.findIndex(s=>s.id==='x-install'));
  value.manual_note=drive?.note(active.index)||'';
  value.presentation_notes=[value.presentation_note,...manualWork?.notes||[]].filter(Boolean);
  if(manualWork){value.presentation_label=manualWork.status;value.camera_direction=[...manualWork.direction];value.camera_distance_floor=manualWork.isolated ? .05 : .24;value.part_notes={...manualWork.partNotes};value.stored_keys=(headWork?head:xyWork?xy:idlerWork?idler:feetWork?feet:bed).stored(active.index,new Set(active.part_keys))}
  if(idler){const stored=idler.stored(active.index,new Set(active.part_keys));value.stored_count=(value.stored_count||0)+stored.length}
  if(xy){const stored=xy.stored(active.index,new Set(active.part_keys));value.stored_count=(value.stored_count||0)+stored.length}
  return value;
 }
 function setStage(index){
  if(!Number.isSafeInteger(index)||index<0||index>=spec.stages.length)fail('Stage index out of range');
  checkActive();
  const state=active??snapshot(),part_keys=spec.stages.slice(0,index+1).flatMap(stage=>stage.part_keys);let shown=new Set(part_keys);
  for(const key of preparation?.deferred(index)||[])shown.delete(key);
  shown=drive?.filter(index,shown)||shown;
  shown=bed?.filter(index,shown)||shown;
  shown=feet?.filter(index,shown)||shown;
  shown=idler?.filter(index,shown)||shown;
  shown=xy?.filter(index,shown)||shown;
  shown=head?.filter(index,shown)||shown;
  // Native-hidden alternatives stay hidden. No part, transform or material is
  // replaced. Validate every root before applying the cumulative mask.
  for(const [key,node]of [...bindings,...companionBindings.map((row,i)=>['companion '+i,row.node])]){
   const descriptor=Object.getOwnPropertyDescriptor(node,'visible');
   if(!descriptor||!('value' in descriptor)||!descriptor.writable||typeof node.visible!=='boolean')fail('Native visibility changed: '+key);
  }
  const undo=[];
  try{for(const policy of [preparation,idler,xy,m2]){const restore=policy?.apply(index);if(restore)undo.push(restore)}}
  catch(error){for(const restore of undo.reverse())restore();throw error}
  for(const [key,node]of bindings){node.visible=state.visibilities.get(key)&&shown.has(key);state.graph.get(node).visible=node.visible}
  for(const {node,part_keys}of companionBindings){node.visible=state.companionVisibilities.get(node)&&part_keys.some(key=>shown.has(key));state.graph.get(node).visible=node.visible}
  state.index=index;state.part_keys=part_keys;active=state;
  return result();
 }
 function leave(){
  checkActive();
  if(!active)return null;
  // Do not overwrite concurrent changes. A failed graph/visibility check above
  // leaves the external state untouched; the caller must resolve that conflict.
  for(const [key,node]of [...bindings,...companionBindings.map((row,i)=>['companion '+i,row.node])]){
   const descriptor=Object.getOwnPropertyDescriptor(node,'visible');
   if(!descriptor||!('value' in descriptor)||!descriptor.writable)fail('Native visibility changed: '+key);
  }
  const undo=[];
  try{for(const policy of [preparation,idler,xy,m2]){const restore=policy?.leave();if(restore)undo.push(restore)}}
  catch(error){for(const restore of undo.reverse())restore();throw error}
  for(const [key,node]of bindings)node.visible=active.visibilities.get(key);
  for(const [node,visible]of active.companionVisibilities)node.visible=visible;
  active=null;return null;
 }
 return {
  setStage,leave,
  current(){checkActive();return result()},
  // Stage keys include assigned alternatives; "focus added" only uses this
  // stage's keys which were visible when assembly mode was entered.
  getBoundsKeys(){checkActive();return active?visibleKeys([...new Set([...(spec.stages[active.index].operation_part_keys||spec.stages[active.index].part_keys),...preparation?.focus(active.index)||[],...drive?.focus(active.index)||[],...bed?.focus(active.index)||[],...feet?.focus(active.index)||[],...idler?.focus(active.index)||[],...xy?.focus(active.index)||[],...head?.focus(active.index)||[]])]):[]},
  getVisibleKeys(){checkActive();return active?visibleKeys():[]},
  getDisplayedParts(){
   checkActive();if(!active)return [];
   return visibleKeys().map(key=>({key,nodes:[...new Set([nodes.get(key),companionForKey.get(key)].filter(visibleNode))]}));
  },
  getPartNodes(key){
   checkActive();if(!bindings.has(key))fail('Unknown source part: '+key);
   if(!active||!active.part_keys.includes(key))return [];
   const roots=new Set(),native=nodes.get(key),companion=companionForKey.get(key);
   if(visibleNode(native))roots.add(native);if(visibleNode(companion))roots.add(companion);
   return [...roots];
  },
  // The app can focus the displayed replacement rather than the hidden native
  // support-bearing leaf. Counts/keys remain native identities, not mesh count.
  getBoundsNodes(){
   checkActive();if(!active)return [];
   const keys=[...(spec.stages[active.index].operation_part_keys||spec.stages[active.index].part_keys),...preparation?.focus(active.index)||[],...drive?.focus(active.index)||[],...bed?.focus(active.index)||[],...feet?.focus(active.index)||[],...idler?.focus(active.index)||[],...xy?.focus(active.index)||[],...head?.focus(active.index)||[]],roots=new Set();
   for(const key of keys){const native=nodes.get(key),companion=companionForKey.get(key);if(visibleNode(native))roots.add(native);if(visibleNode(companion))roots.add(companion)}
   return [...roots];
  },
 };
}

// A frame-mounted bank uses original dock geometry and registered parked heads.
const copy=value=>JSON.parse(JSON.stringify(value));
export function bankChoices(catalog,data,gantry){
 return data.profiles.map(p=>catalog.variants.find(v=>v.machine_head&&v.mount==='stealthchanger'&&(!gantry||v.gantry===gantry)&&Object.entries(p.selection).every(([k,value])=>v[k]===value))).filter(Boolean);
}
export function bankCapacity(data,machine){return data.machines[machine]?.capacity||0}
// Trident moves its bed, while the top-mounted docks stay fixed. Retain
// native dock geometry and limit the preview's highest bed position.
export function bankBedReferenceDrop(catalog,data,state,variant){
 const base=Math.max(0,variant?.fit?.bed_reference_drop_mm||0);
 if(!state?.enabled)return base;
 const bed=data.machines[catalog.machine_id]?.bed_clearance;
 if(!bed)return base;
 normalizeBank(state,catalog,data,variant?.gantry);
 return Math.max(base,bed.minimum_reference_drop_mm);
}
export function normalizeBank(state,catalog,data,gantry){
 const capacity=bankCapacity(data,catalog.machine_id),choices=bankChoices(catalog,data,gantry);
 if(!state||typeof state.enabled!=='boolean'||!Array.isArray(state.tools)||!Number.isInteger(state.active)||state.tools.length<1||state.tools.length>capacity||state.active<0||state.active>=state.tools.length)throw Error('ツールバンクの台数または使用中のヘッドが不正です。');
 const tools=state.tools.map(id=>{
  const v=choices.find(v=>v.id===id||v.source_head_configuration===id);if(!v)throw Error('この機体に登録されていないドック構成です。');return v.source_head_configuration||v.id;
 });
 return {enabled:state.enabled,active:state.active,tools};
}
export function initialBank(catalog,data,gantry){
 const choices=bankChoices(catalog,data,gantry);if(!choices.length)throw Error('この機体のドック構成は未登録です。');
 return {enabled:false,active:0,tools:Array.from({length:Math.min(3,bankCapacity(data,catalog.machine_id))},(_,i)=>choices[i%choices.length].source_head_configuration||choices[i%choices.length].id)};
}
export function bankPlan(state,catalog,data,activeVariant){
 const normalized=normalizeBank(state,catalog,data,activeVariant?.gantry);if(!normalized.enabled)return {state:normalized,instances:[]};
 const choices=bankChoices(catalog,data,activeVariant?.gantry),selected=choices.find(v=>(v.source_head_configuration||v.id)===normalized.tools[normalized.active]);
 if(selected?.id!==activeVariant?.id)throw Error('使用中のヘッドとツールバンクが一致しません。');
 const mount=data.machines[catalog.machine_id],instances=[];
 normalized.tools.forEach((id,slot)=>{
  const v=choices.find(v=>(v.source_head_configuration||v.id)===id),p=data.profiles.find(p=>Object.entries(p.selection).every(([k,value])=>v[k]===value));
  const center=mount.center_x_mm+(slot-(normalized.tools.length-1)/2)*data.pitch_mm,anchor=[center,mount.translation_mm[1],mount.translation_mm[2]];
  instances.push({id:p.dock,translation_mm:anchor,hidden_keys:p.dock_hidden_keys||[],part_offsets_mm:p.dock_part_offsets_mm||{},slot,kind:'dock'});
  for(const id of data.fixture_assets||[])instances.push({id,translation_mm:anchor,slot,kind:'fastener'});
  if(slot===normalized.active)return;
  // Undo the rail registration and belt-specific backplate offset. Parked
  // tools carry no shuttle, rail, belt keeper or machine gantry.
  const rail=v.machine_head.translation_delta_mm,shift=anchor.map((n,i)=>n+p.park_translation_mm[i]-rail[i]);
  shift[1]+=v.belt_width_mm===9?data.nine_mm_forward_mm:0;
  const plan=v.machine_head;
  instances.push({id:plan.base,translation_mm:plan.translation.map((n,i)=>n+shift[i]),hidden_keys:plan.hidden,slot,kind:'tool'});
  for(const m of plan.modules.filter(m=>m.role==='tool'))instances.push({...copy(m),translation_mm:m.translation_mm.map((n,i)=>n+shift[i]),slot,kind:'tool'});
 });
 return {state:normalized,instances};
}
export function readBankURL(search){const value=new URLSearchParams(search).get('tools');if(value===null)return null;if(value.length>4096)throw Error('ツールバンクのURLが長すぎます。');return JSON.parse(value)}

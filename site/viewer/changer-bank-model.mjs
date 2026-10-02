// A frame-mounted bank uses original dock geometry and registered parked heads.
const copy=value=>JSON.parse(JSON.stringify(value));
export function bankSource(v,system){return system==='indx'?v.hotend:v.source_head_configuration||v.id}
export function bankSystem(state){
 const system=state?.system||'stealthchanger';
 if(!['stealthchanger','indx','madmax'].includes(system))throw Error('未登録のツール交換方式です。');
 return system;
}
export function variantBankSystem(variant){return variant?.toolhead==='indx'?'indx':variant?.mount==='madmax'?'madmax':'stealthchanger'}
export function bankSpec(data,system){
 if(system==='indx')return data.indx;
 if(system!=='madmax')return data;
 // The native MadMax head is registered, but there is no machine-mounted
 // dock bank in this release. A disabled single-tool state can be saved;
 // never borrow StealthChanger fixtures or its Trident collision verdict.
 return {machines:Object.fromEntries(Object.keys(data.machines).map(id=>[id,{capacity:1,bank_permitted:false,docking_registered:false,docking_unregistered_reason:'MadMaxの機体側ドックは未登録です。現在は単独ヘッドの装着表示です。'}]))};
}
export function bankChoices(catalog,data,gantry,system='stealthchanger',cooling='4010'){
 if(system==='indx')return (data.indx?.tool_options||[]).map(p=>catalog.variants.find(v=>v.toolhead==='indx'&&v.hotend===p.id&&v.cooling===cooling&&(!gantry||v.gantry===gantry))).filter(Boolean);
 if(system==='madmax')return catalog.variants.filter(v=>v.machine_head&&v.mount==='madmax'&&v.registration_source==='madmax_xol'&&(!gantry||v.gantry===gantry));
 return data.profiles.map(p=>catalog.variants.find(v=>v.machine_head&&v.mount==='stealthchanger'&&(!gantry||v.gantry===gantry)&&Object.entries(p.selection).every(([k,value])=>v[k]===value))).filter(Boolean);
}
export function bankCapacity(data,machine,system='stealthchanger'){return bankSpec(data,system)?.machines[machine]?.capacity||0}
// A signed offset brings the bed toward the nozzle, bounded by the native
// Z rail/carriage envelope. Dock interference must never lower this datum.
export function bankBedReferenceDrop(catalog,data,state,variant){
 const mount=data.machines[catalog.machine_id],nozzle=variant?.fit?.nozzle_mm?.[2],top=mount?.bed_reference_top_mm;
 // Signed bed offset: the bed must rise to the actual nozzle plane at Z=0.
 const base=Number.isFinite(nozzle)&&Number.isFinite(top)?top-nozzle:(variant?.fit?.bed_reference_drop_mm||0);
 return Number.isFinite(mount?.bed_max_up_mm)?Math.max(base,-mount.bed_max_up_mm):base;
}
export function normalizeBank(state,catalog,data,gantry){
 const system=bankSystem(state),capacity=bankCapacity(data,catalog.machine_id,system);
 let choices=bankChoices(catalog,data,gantry,system);if(!state?.enabled&&!choices.length)choices=bankChoices(catalog,data,undefined,system);
 if(!state||typeof state.enabled!=='boolean'||!Array.isArray(state.tools)||!Number.isInteger(state.active)||state.tools.length<1||state.tools.length>capacity||state.active<0||state.active>=state.tools.length)throw Error('ツールバンクの台数または使用中のヘッドが不正です。');
 const mount=bankSpec(data,system)?.machines[catalog.machine_id];
 if(state.enabled&&mount?.bank_permitted===false)throw Error(mount.docking_unregistered_reason||mount.printing_blocked_reason);
 const tools=state.tools.map(id=>{
  const v=choices.find(v=>v.id===id||v.source_head_configuration===id||system==='indx'&&v.hotend===id);if(!v)throw Error('この機体に登録されていないドック構成です。');return bankSource(v,system);
 });
 return {enabled:state.enabled,active:state.active,tools,...(system!=='stealthchanger'?{system}: {})};
}
export function initialBank(catalog,data,gantry,system='stealthchanger'){
 let choices=bankChoices(catalog,data,gantry,system);if(!choices.length)choices=bankChoices(catalog,data,undefined,system);if(!choices.length)throw Error('この機体のドック構成は未登録です。');
 return {enabled:false,active:0,tools:Array.from({length:Math.min(3,bankCapacity(data,catalog.machine_id,system))},(_,i)=>bankSource(choices[i%choices.length],system)),...(system!=='stealthchanger'?{system}: {})};
}
export function bankStateForVariant(state,variant,catalog,data){
 // Older MadMax files inherited the disabled StealthChanger bank by default.
 if(variant?.mount==='madmax'&&state?.enabled===false&&state.system===undefined){
  if(!Array.isArray(state.tools)||!state.tools.length||state.tools.length>bankCapacity(data,catalog.machine_id)||!state.tools.every(id=>typeof id==='string')||!Number.isInteger(state.active)||state.active<0||state.active>=state.tools.length)throw Error('ツールバンクの台数または使用中のヘッドが不正です。');
  return initialBank(catalog,data,variant.gantry,'madmax');
 }
 if((variant?.mount==='madmax')!==(bankSystem(state)==='madmax'))throw Error('構成とツール交換方式が一致しません。');
 return state;
}
export function bankPlan(state,catalog,data,activeVariant){
 const normalized=normalizeBank(state,catalog,data,activeVariant?.gantry);if(!normalized.enabled)return {state:normalized,instances:[]};
 const system=bankSystem(normalized),spec=bankSpec(data,system),choices=bankChoices(catalog,data,activeVariant?.gantry,system,activeVariant?.cooling),selected=choices.find(v=>bankSource(v,system)===normalized.tools[normalized.active]);
 if(selected?.id!==activeVariant?.id)throw Error('使用中のヘッドとツールバンクが一致しません。');
 const mount=spec.machines[catalog.machine_id],instances=[];
 if(system==='indx'){
  if(mount.fixture_asset)instances.push({id:mount.fixture_asset,translation_mm:mount.translation_mm,slot:-1,kind:'fixture'});
  normalized.tools.forEach((id,slot)=>{
   const t=[mount.center_x_mm+(slot-(normalized.tools.length-1)/2)*spec.pitch_mm,mount.translation_mm[1],mount.translation_mm[2]];
   instances.push({id:spec.dock_asset,translation_mm:t,slot,kind:'dock'});
   if(slot!==normalized.active)instances.push({id:spec.parked_asset,translation_mm:t,slot,kind:'tool'});
  });return {state:normalized,instances};
 }
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

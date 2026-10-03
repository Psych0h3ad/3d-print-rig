import {monolithHeadCatalog} from './monolith-head-model.mjs?v=trident-clearance-35';
import {translatedProbeFit} from './probe-checks.js?v=trident-clearance-35';

const clone=value=>JSON.parse(JSON.stringify(value));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function withMonolithMachines(current,heads,headRegistry,gantries,registrations){
 const binding=registrations.machines[current.machine_id];
 if(!binding)return current;
 const compatible=gantries.variants.filter(g=>g.machine===binding.family&&g.size_mm===binding.size_mm&&(!binding.gantry_ids||binding.gantry_ids.includes(g.id)));
 if(!compatible.length)return current;
 const result=clone(current),bench=monolithHeadCatalog(heads,headRegistry,{...gantries,variants:compatible});
 result.dimensions=['gantry','mount','toolhead','extruder','hotend','carriage','probe','board','cooling'];
 for(const g of result.gantries)if(g.id==='machine_gantry')g.label=current.machine_id.endsWith('_ldo_cnc')?'機体標準 · LDO CNC AWD':'機体標準 · VORON V2.4';
 result.gantries.push(...bench.gantries.map(g=>({...g,label:'Monolith · '+g.label.replace(binding.family+' / '+binding.size_mm+' · ','').replace('printed','プリント').replace('sheet_metal','板金')})));
 result.assets={...result.assets,...bench.assets,...gantries.assets};
 result.monolith={gantries:compatible,binding};
 for(const source of bench.variants){
  const v=clone(source),g=compatible.find(g=>g.id===v.gantry),mount={...binding,...binding.gantries?.[g.id]},shift=mount.translation_mm;
  if(!Array.isArray(shift)||shift.length!==3||!shift.every(Number.isFinite))throw Error('Monolithの機体取付座標が不正です');
  const plan=v.machine_head;
  plan.translation=add(plan.translation,shift);plan.translation_delta_mm=add(plan.translation_delta_mm,shift);
  plan.nozzle_mm=add(plan.nozzle_mm,shift);for(const m of plan.modules)m.translation_mm=add(m.translation_mm,shift);
  v.id='monolith_machine__'+result.machine_id+'__'+g.id+'__'+v.source_head_configuration;
  v.machine_gantry={...mount,id:g.id,modules:g.modules,family:g.machine,size_mm:g.size_mm};
  v.modules=[];v.head_translation_mm=[0,0,0];v.removed_stock_keys=[...(mount.stock_hidden_keys||[])];
  v.fit.nozzle_mm=[...plan.nozzle_mm];v.fit.bed_reference_drop_mm=0;
  if(v.fit.probe)v.fit.probe=translatedProbeFit(v.fit.probe,shift);
  v.fit.machine_gantry={family:g.machine,datum_checks:mount.datum_checks};
  v.notes=[...v.notes.filter(n=>!n.includes('機体フレーム・ドック')),...(mount.notes||[])];
  v.notes.push('Monolithを機体の取付基準に配置。固定式はSphinx、交換式は専用StealthChangerから選べます。','XYベルトは元CADから抽出した経路がヘッドとY軸に追従。クランプ内部・歯・張力・ドッキング・全域の干渉は未検証。');
  result.variants.push(v);
 }
 if(!result.sources.some(s=>s.url===gantries.source.url))result.sources.push({label:'Monolith Gantry',url:gantries.source.url});
 return result;
}

// Metadata names identify the actual bearing blocks, not an entire rail module.
export function monolithPartMotion(module,row){
 if(module.startsWith('monolith_x_frame_'))return row.name==='_MGN12H'?'xy':'y';
 if(module.startsWith('monolith_x_'))return 'y';
 if(module.startsWith('monolith_y_frame_')&&row.name==='_MGN9H')return 'y';
 return 'fixed';
}

export function monolithPartDelta(module,row,delta,family){
 const motion=monolithPartMotion(module,row);
 return [motion==='xy'?delta[0]:0,motion==='xy'||motion==='y'?delta[1]:0,family==='V2'?delta[2]:0];
}

export function monolithConfigurationRequest(catalog,search){
 const q=new URLSearchParams(search),g=q.get('gantry');
 if(!g||q.has('configuration'))return null;
 const matching=catalog.variants.filter(v=>v.machine_gantry?.id===g),head=q.get('head_configuration');
 return matching.find(v=>v.source_head_configuration===head)||matching.find(v=>v.mount==='fixed')||matching[0]||null;
}

export function monolithDisplayLimits(original,reference,variant){
 const limits=clone(original);
 for(const [i,axis]of ['X','Y','Z'].entries()){
  const range=variant?.machine_gantry?.[axis.toLowerCase()+'_delta_limits_mm'];if(!range)continue;
  if(range.length!==2||!range.every(Number.isFinite)||range[0]>range[1])throw Error('Monolithの'+axis+'ガイド可動範囲が不正です');
  limits[axis]=[Math.max(original[axis][0],reference[i]+range[0]),Math.min(original[axis][1],reference[i]+range[1])];
  if(limits[axis][0]>limits[axis][1])throw Error('このヘッドとガイドでは機体の表示範囲に届きません');
 }
 return limits;
}

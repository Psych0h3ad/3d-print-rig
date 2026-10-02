// Report measured mounting conditions without certifying an entire machine.
const mm=value=>Number.isFinite(value)?value.toFixed(3):'未計測';
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const range=r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[0]<=r[1]?r:null;
function assessment(variant){
 const p=variant?.fit?.probe;if(!p)return null;
 const nozzle=variant.fit.nozzle_mm,measured=point(nozzle)&&point(p.coil_bottom_mm)?p.coil_bottom_mm[2]-nozzle[2]:null;
 const gap=Number.isFinite(measured)?measured:p.coil_nozzle_gap_mm;
 const cartographer=/cartographer/i.test([p.id,p.label,variant.probe].join(' '));
 // The Cartographer Touch range must not become a generic Beacon requirement.
 const required=range(p.height_range_mm)||range(p.required_coil_gap_mm)||(cartographer?[2.6,3]:null);
 const datum=Number.isFinite(measured)&&Number.isFinite(p.coil_nozzle_gap_mm)&&Math.abs(measured-p.coil_nozzle_gap_mm)>.02;
 const body=p.physical_passed===false||!!p.native_body_collisions?.length;
 const bed=Number.isFinite(p.minimum_probe_bed_clearance_at_nozzle_contact_mm)&&p.minimum_probe_bed_clearance_at_nozzle_contact_mm<=0;
 const height=p.height_passed===false||!!(required&&Number.isFinite(gap)&&(gap<required[0]-1e-5||gap>required[1]+1e-5));
 const metal=!!p.metal_keepout_collisions?.length;
 const metalVerified=p.metal_keepout_verified===true||p.metal_keepout_applicable===false;
 const measuredChecks=p.physical_passed===true&&p.height_passed===true&&Number.isFinite(gap)&&Number.isFinite(p.minimum_probe_bed_clearance_at_nozzle_contact_mm);
 return {p,gap,required,datum,body,bed,height,metal,metalVerified,measuredChecks};
}
export function probeHasConflict(variant){const a=assessment(variant);return !!a&&(a.datum||a.body||a.bed||a.height||a.metal)}
export function translatedProbeFit(probe,shift){
 if(!point(shift))throw Error('Invalid probe translation');
 const result={...probe};
 if(point(probe.coil_bottom_mm))result.coil_bottom_mm=probe.coil_bottom_mm.map((v,i)=>v+shift[i]);
 if(Array.isArray(probe.metal_keepout_bounds_mm))result.metal_keepout_bounds_mm=probe.metal_keepout_bounds_mm.map(p=>point(p)?p.map((v,i)=>v+shift[i]):p);
 result.machine_environment_verified=false;return result;
}
export function probeCheck(variant){
 const a=assessment(variant),p=a?.p;
 if(!p){
  if(variant.probe&&variant.probe!=='none')return {state:'unverified',label:'選択したプローブの取付条件未確認',warning:true,lines:['選択したプローブの取付基準とクリアランスは未検証です。']};
  const failed=(variant.fit?.probe_candidates||[]).filter(c=>c.height_passed===false);
  return {state:'none',label:'プローブなし',warning:false,lines:failed.map(c=>`付属Cartographer：コイル高さ ${mm(c.coil_nozzle_gap_mm)} mm。指定2.6〜3.0 mm外の取付です。`)};
 }
 const lines=[];let state='geometry-checked',label='形状・高さ確認済み';
 if(a.body)lines.push('プローブと周辺部品が干渉しています。');
 if(a.bed)lines.push('ノズル接触時にプローブ本体・マウント・ねじがベッドへ接触します。');
 if(a.datum)lines.push('コイルとノズルの座標が登録済みの高さと一致しません。取付条件を再検証してください。');
 if(a.height){
  if(a.required)lines.push(`現在 ${mm(a.gap)} mm ／ 指定${a.required.map(mm).join('〜')} mm。現マウントでの取付対応を保証しないプレビューです。`);
  else lines.push('登録マウントの高さ条件外です。センサー固有の設置条件を確認してください。');
 }
 if(a.metal)lines.push('取付対応を保証しないプレビューです。ホットエンド／ベルト固定ねじが金属除外領域に入ります。');
 if(a.body){state='body-conflict';label='部品干渉あり'}
 else if(a.bed){state='bed-conflict';label='プローブ最下部がベッドに接触'}
 else if(a.datum){state='datum-conflict';label='取付座標の不整合'}
 else if(a.height){state='height-conflict';label='コイル高さ条件外'}
 else if(a.metal){state='metal-conflict';label='金属除外領域に干渉'}
 else if(!a.measuredChecks){state='unverified';label='原本プローブ · 取付条件未確認';lines.push('形状の表示だけでは取付適合を判定できません。コイル基準面・設置高さ・本体干渉を確認してください。')}
 if(!a.metalVerified){if(state==='geometry-checked'){state='unverified';label='形状・高さ確認済み／金属領域未確認'}lines.push('付属基板の金属除外領域は未確認です。')}
 if(p.machine_environment_verified===false){if(state==='geometry-checked'){state='unverified';label='ヘッド内の検査のみ／機体側未検証'}lines.push('機体への移設後、周辺フレーム・ベルト・全可動域の干渉は未検証です。')}
 lines.push(...(p.notes||[]));
 return {state,label,warning:state!=='geometry-checked',lines};
}
export function probeOptionSuffix(variant){
 if(!variant?.fit?.probe)return '';
 const c=probeCheck(variant);return c.warning?' · '+c.label:'';
}
export function headInspectionState(variant){
 const check=probeCheck(variant),native=variant.fit?.complete_head_native,carriage=variant.fit?.carriage_native_body_passed===false;
 let label=native?({collision:'本体干渉あり · 比較用',contact:'原本CADに微小な交差あり',clear:'検査姿勢の本体交差なし',reference:native.unresolved_pairs?.length?'一部の交差判定が未確定':'原本組立 · 接続未検証'}[native.state]||'原本組立 · 接続未検証'):check.label;
 if(native&&variant.fit?.probe)label+=' ／ '+check.label;
 if(carriage)label='キャリッジ試着：本体干渉あり ／ '+label;
 return {label,state:carriage?'carriage-conflict':check.warning?check.state:native?.state||check.state,warning:carriage||check.warning||!!native&&native.state!=='clear'};
}
export function probeMetrics(variant){
 const clearance=variant.fit?.complete_head_native?.cooling_bed_clearance_at_nozzle_contact_mm;
 const rows=Number.isFinite(clearance)?[['冷却部／接触面',`${clearance.toFixed(2)} mm（参考）`]]:[];
 const a=assessment(variant),p=a?.p;if(!p)return rows;
 rows.unshift(['コイル／ノズル',`${mm(a.gap)} mm`]);
 if(Number.isFinite(p.minimum_probe_bed_clearance_at_nozzle_contact_mm))rows.push(['最下部／ベッド',`${mm(p.minimum_probe_bed_clearance_at_nozzle_contact_mm)} mm`]);
 if(p.spacer_mm)rows.push(['絶縁スペーサー',`${p.spacer_mm.toFixed(1)} mm × 2`]);
 if(p.nearest_hotend_to_board)rows.push(['基板／ホットエンド',`${mm(p.nearest_hotend_to_board.distance_mm)} mm`]);
 return rows;
}
export function probeGuide(variant){
 const p=variant.fit?.probe,nozzle=variant.fit?.nozzle_mm;
 if(!p||!Array.isArray(nozzle)||!Array.isArray(p.coil_bottom_mm))return null;
 const points=[nozzle,p.coil_bottom_mm];
 if(points.flat().some(n=>!Number.isFinite(n)))return null;
 const x=Math.max(nozzle[0],p.coil_bottom_mm[0])+25,y=p.coil_bottom_mm[1];
 return {nozzle:nozzle.slice(),coil:p.coil_bottom_mm.slice(),
  dimension:[[x,y,nozzle[2]],[x,y,p.coil_bottom_mm[2]]],keepout:Array.isArray(p.metal_keepout_bounds_mm)&&p.metal_keepout_bounds_mm.length===2&&p.metal_keepout_bounds_mm.every(point)?p.metal_keepout_bounds_mm:null};
}

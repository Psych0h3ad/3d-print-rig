// Report measured mounting conditions without certifying an entire machine.
const mm=value=>Number.isFinite(value)?value.toFixed(3):'未計測';
export function probeCheck(variant){
 const p=variant.fit?.probe;
 if(!p){
  const failed=(variant.fit?.probe_candidates||[]).filter(c=>c.height_passed===false);
  return {state:'none',label:'プローブなし',warning:false,lines:failed.map(c=>`付属Cartographer：コイル高さ ${mm(c.coil_nozzle_gap_mm)} mm。指定2.6〜3.0 mm外の取付です。`)};
 }
 const lines=[];let state='geometry-checked',label='形状・高さ確認済み';
 if(p.physical_passed===false){state='body-conflict';label='部品干渉あり';lines.push('プローブと周辺部品が干渉しています。')}
 else if(p.height_passed===false){state='height-conflict';label='コイル高さ条件外';lines.push(`現在 ${mm(p.coil_nozzle_gap_mm)} mm ／ 指定2.600〜3.000 mm。現マウントでの取付対応を保証しないプレビューです。`)}
 else if(p.metal_keepout_collisions?.length){state='metal-conflict';label='金属除外領域に干渉';lines.push('取付対応を保証しないプレビューです。ホットエンド／ベルト固定ねじが金属除外領域に入ります。')}
 if(p.metal_keepout_verified===false){if(state==='geometry-checked'){state='unverified';label='形状・高さ確認済み／金属領域未確認'}lines.push('付属基板の世代と金属除外領域は未確認です。')}
 return {state,label,warning:state!=='geometry-checked',lines};
}
export function probeOptionSuffix(variant){
 const p=variant?.fit?.probe;if(!p)return '';
 if(p.physical_passed===false)return ' · 部品干渉';
 if(p.height_passed===false)return ' · 高さ条件外';
 return p.metal_keepout_collisions?.length?' · 金属干渉あり':'';
}
export function probeMetrics(variant){
 const p=variant.fit?.probe;if(!p)return [];
 const rows=[['コイル／ノズル',`${mm(p.coil_nozzle_gap_mm)} mm`]];
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
  dimension:[[x,y,nozzle[2]],[x,y,p.coil_bottom_mm[2]]],keepout:p.metal_keepout_bounds_mm||null};
}

import {installedHeadPlan} from './machine-head-model.mjs?v=public-v18-probe1';
export function monolithHeadCatalog(heads,registry,gantries){
 if(!registry.sources.stealthchanger_monolith||!registry.monolith_target)throw Error('Monolithの取付基準が未登録です');
 const variants=[];
 for(const g of gantries.variants)for(const source of heads.variants){
  if(source.mount!=='stealthchanger'||source.gantry!=='sc_monolith_'+g.belt_width_mm)continue;
  const v=JSON.parse(JSON.stringify(source));v.registration_source='stealthchanger_monolith';
  v.machine_head=installedHeadPlan(v,registry,{...registry.monolith_target,belt_width_mm:g.belt_width_mm,xy_motors:g.xy_motors});
  v.source_head_configuration=source.id;v.gantry=g.id;v.xy_motors=g.xy_motors;v.id='monolith_installed__'+g.id+'__'+source.id;
  v.fit={...v.fit,nozzle_mm:v.machine_head.nozzle_mm,machine_mount:{kind:'Monolith MGN12H / 専用反転ベルトクランプ',axis_error_mm:registry.monolith_target.axis_error_mm,full_travel_verified:false,docking_registered:false}};
  v.notes=[...g.notes.filter(s=>!s.startsWith('ガントリー単体')),...v.notes,'MonolithのMGN12穴軸とシャトル背面の取付面で配置。機体フレーム・ドック・ホーミング・全可動域は未検証。'];variants.push(v);
 }
 return {...heads,machine_id:'monolith_workbench',dimensions:['gantry','toolhead','mount','extruder','hotend','carriage','probe','board','cooling'],gantries:gantries.variants.map(g=>({id:g.id,label:`${g.machine} / ${g.size_mm} · ${g.build} · ${g.belt_width_mm} mm · ${g.xy_motors===4?'AWD':'2WD'}`})),variants,assets:{...heads.assets,...heads.base_assets,...registry.assets}};
}
export function monolithCompanion(heads,variant){
 return heads.variants.find(v=>v.mount==='stealthchanger'&&v.gantry==='sc_monolith_'+variant.belt_width_mm&&['toolhead','extruder','hotend','board','cooling'].every(k=>v[k]===variant[k]));
}

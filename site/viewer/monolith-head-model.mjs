import {installedHeadPlan} from './machine-head-model.mjs?v=8a648bfe089bd36733b7';
import {translatedProbeFit} from './probe-checks.js?v=ea1aef3e30bf7d11d3cb';
const completeSphinx=v=>v.mount==='fixed'&&v.gantry==='sphinx_monolith'&&v.fit?.nozzle_mm?.every(Number.isFinite)&&['extruder','hotend'].every(k=>v.modules.some(m=>m.id===v.fit?.complete_head_native?.[k]));
export function monolithHeadCatalog(heads,registry,gantries){
 if(!registry.sources.stealthchanger_monolith||!registry.monolith_target)throw Error('Monolithの取付基準が未登録です');
 const variants=[];
 for(const g of gantries.variants)for(const source of heads.variants){
  const changer=source.mount==='stealthchanger'&&source.gantry==='sc_monolith_'+g.belt_width_mm;
  const fixed=completeSphinx(source)&&registry.sources[source.base_asset]?.compatible_belt_widths_mm?.includes(g.belt_width_mm);
  if(!changer&&!fixed)continue;
  const v=JSON.parse(JSON.stringify(source));v.registration_source=changer?'stealthchanger_monolith':source.base_asset;v.belt_width_mm=g.belt_width_mm;
  v.machine_head=installedHeadPlan(v,registry,{...registry.monolith_target,belt_width_mm:g.belt_width_mm,xy_motors:g.xy_motors});
  if(v.fit?.probe)v.fit.probe=translatedProbeFit(v.fit.probe,v.machine_head.translation_delta_mm);
  v.source_head_configuration=source.id;v.gantry=g.id;v.xy_motors=g.xy_motors;v.id='monolith_installed__'+g.id+'__'+source.id;
  v.fit={...v.fit,nozzle_mm:v.machine_head.nozzle_mm,machine_mount:{kind:'Monolith MGN12H / 専用反転ベルトクランプ',axis_error_mm:Math.max(registry.monolith_target.axis_error_mm,registry.sources[v.registration_source].axis_error_mm||0),full_travel_verified:false,docking_registered:false}};
  if(fixed)v.fit.machine_mount.belt_preview_cut=registry.sources[v.registration_source].belt_preview_cut;
  v.notes=[...g.notes.filter(s=>!s.startsWith('ガントリー単体')),...v.notes,changer?'Split KeeperのMGN接触面と4本の穴軸で配置。シャトルとKeeperの接触を原本CADで照合。':'通常固定式：SphinxのMGN接触面・4本の穴軸・6/9 mmベルト溝を原本CADで照合。','機体フレーム・ドック・ホーミング・全可動域は未検証。'];variants.push(v);
  if(fixed)v.notes.push('ベルト表示はヘッド入口まで。クランプ内部の折返し経路は未登録。');
 }
 // Select the mounting method before the head, so the initial SC head cannot
 // hide all fixed heads through prefix filtering.
 return {...heads,machine_id:'monolith_workbench',dimensions:['gantry','mount','toolhead','extruder','hotend','carriage','probe','board','cooling'],gantries:gantries.variants.map(g=>({id:g.id,label:`${g.machine} / ${g.size_mm} · ${g.build} · ${g.belt_width_mm} mm · ${g.xy_motors===4?'AWD':'2WD'}`})),variants,assets:{...heads.assets,...heads.base_assets,...registry.assets}};
}
export function monolithCompanion(heads,variant){
 if(completeSphinx(variant))return heads.variants.find(v=>v.id===variant.id);
 return heads.variants.find(v=>v.mount==='stealthchanger'&&v.gantry==='sc_monolith_'+variant.belt_width_mm&&['toolhead','extruder','hotend','board','cooling','probe'].every(k=>v[k]===variant[k]));
}

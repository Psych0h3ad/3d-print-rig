// These source presets share the exact body with the archived printed-only
// choice. Resolve old links to the existing assembled preset, preserving its
// geometry, placements, probe, board and scoped native findings.
export const sphinxCompanionPresets=[
 ['voron','tricorn','sphinx19__voron__tricorn__short','sphinx_tricorn_long','sphinx_feed_tricorn'],
 ['voron','goliath_chcxl','sphinx44__voron__goliath_air__short__none','sphinx_goliath_air','sphinx_feed_goliath'],
 ['monolith','tricorn','sphinx19__monolith__tricorn__short','sphinx_tricorn_long','sphinx_feed_tricorn'],
 ['monolith','goliath_chcxl','sphinx44__monolith__goliath_air__short__none','sphinx_goliath_air','sphinx_feed_goliath']
].map(([family,pattern,to,hotend,feed])=>({
 from:`head13__sphinx__fixed__micro_bowden__${pattern}__sphinx_${family}__none__source`,to,
 base:`head_sphinx_${family}_${pattern}`,gantry:`sphinx_${family}`,
 hotend:pattern==='goliath_chcxl'?'goliath_air':pattern,
 modules:['sphinx_sherpa_r2_standard_short',hotend,feed,'sphinx_hotend_fan_2510']
}));

export function withSphinxCompanionPresets(catalog){
 const byId=new Map(catalog.variants.map(v=>[v.id,v]));
 const aliases={...catalog.configuration_aliases},removed=new Set();
 for(const p of sphinxCompanionPresets){
  const old=byId.get(p.from),target=byId.get(p.to);
  // Supplemental catalogs containing other heads do not contain this family.
  if(!old&&!target&&!aliases[p.from])continue;
  const native=target?.fit?.complete_head_native;
  const valid=target?.toolhead==='sphinx'&&target.mount==='fixed'&&target.base_asset===p.base
   &&target.gantry===p.gantry&&target.extruder==='sherpa_r2_standard_short'
   &&target.hotend===p.hotend&&target.probe==='none'&&target.board==='none'
   &&native?.base===p.base&&native.extruder===p.modules[0]&&native.hotend===p.modules[1]
   &&target.modules.length===p.modules.length
   &&target.modules.every((m,i)=>m.id===p.modules[i]&&m.role==='tool'
    &&m.translation_mm?.length===3&&m.translation_mm.every(n=>n===0))
   &&target.base_hidden_keys?.length===0&&target.head_translation_mm?.length===3
   &&target.head_translation_mm.every(n=>n===0)
   &&target.fit.nozzle_mm?.length===3&&target.fit.nozzle_mm.every(Number.isFinite);
  if(!valid||old&&(old.toolhead!=='sphinx'||old.mount!=='fixed'||old.base_asset!==p.base
   ||old.gantry!==p.gantry||old.extruder!=='micro_bowden'||old.hotend!==(p.hotend==='goliath_air'?'goliath_chcxl':p.hotend)
   ||old.probe!=='none'||old.board!=='none')
   ||!old&&aliases[p.from]!==p.to||aliases[p.from]&&aliases[p.from]!==p.to)
   throw Error('Source Sphinx companion preset changed: '+p.from);
  if(!catalog.base_assets[p.base]||!p.modules.every(id=>catalog.assets[id]))
   throw Error('Missing Sphinx companion source asset: '+p.to);
  aliases[p.from]=p.to;removed.add(p.from);
 }
 return {...catalog,configuration_aliases:aliases,variants:catalog.variants.filter(v=>!removed.has(v.id))};
}

export function hasDeclaredHeadHardware(v){
 if(v.hardware_assembled)return true;
 const native=v.fit?.complete_head_native,ids=new Set((v.modules||[]).map(m=>m.id));
 return native?.base===(v.base_asset||v.toolhead)&&native?.state!=='collision'
  &&[native?.hotend,native?.extruder,v.fit?.hotend_cooling?.module].every(id=>id&&ids.has(id));
}

export function registeredConfigurationId(catalog,id){
 const aliases=catalog.configuration_aliases||{};
 if(aliases[id])return aliases[id];
 if(typeof id!=='string'||!id.startsWith('installed__'))return id;
 for(const [from,to]of Object.entries(aliases)){
  const suffix='__'+from;
  if(!id.endsWith(suffix))continue;
  const target=id.slice(0,-suffix.length)+'__'+to;
  // Keep the saved host/gantry prefix and require that exact installed target.
  if(catalog.variants.some(v=>v.id===target))return target;
 }
 return id;
}

import {createSourcePartsMap} from './source-parts-map.mjs?v=aef1e3b96b466ccb5b31';
import {tridentGuideLineage} from './voron-guide-lineage.mjs';
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const norm=s=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[_\-]+/g,' ');
const fail=s=>{throw Error('Assembly guide: '+s)};
export const supportsVoronAssembly=id=>/^voron_(?:trident_(?:250|300|350)|v24_(?:250|300|350)_printed)$/.test(id);
// Chapter-sized visual assembly states. Subassemblies keep their hardware.
// Transforms are final source placements, never invented insertion trajectories.
const plans={
 trident:[['frame','Frame',12,23],['drives','A/B drives and idlers',24,48],['gantry','Y rails and gantry frame',49,76],['zaxis','Z rails and lift',77,117],['xaxis','X axis',118,141],['belts','A/B belts',142,163],['bed','Print bed and support',164,187],['head','Stealthburner assembly',188,189],['wiring','Electronics and cable paths',190,268],['skirts','Skirts',269,290],['panels','Panels and doors',291,320],['filament','Filament path',291,320]],
 v24:[['frame','Frame',12,21],['zdrives','Z drives and idlers',22,51],['bed','Print bed and support',52,61],['drives','A/B drives and idlers',62,81],['gantry','Gantry and X beam',82,107],['zaxis','Z joints and belts',108,123],['belts','A/B belts',124,145],['head','Stealthburner assembly',146,147],['wiring','Electronics and cable paths',148,211],['skirts','Skirts',212,239],['panels','Panels and doors',240,259],['exhaust','Exhaust filter',240,259],['filament','Filament path',240,259]]
};
function tridentSection(p,path){
 if(p.group==='Frame')return p.motion==='z'||p.source_leaf==='1167'?'bed':path.includes('Cable Frame Anchors')?'wiring':'frame';
 if(p.group==='Z Assembly')return /Bed Components/.test(path)?'bed':/Chain|Wago|WAGO/.test(path)?'wiring':'zaxis';
 if(p.group==='Electronics')return 'wiring';if(p.group==='Skirt')return 'skirts';
 if(p.group==='Panels')return /Opaque Panels|Deck Supports|Deck_Wire/.test(path)?'wiring':'panels';
 if(p.group==='Filament_Path')return 'filament';
 if(p.source_key===undefined)fail('Missing Trident native occurrence: '+p.key);
 // The exact source preparer relocates source508 nuts into the X extrusion,
 // and source461 is the X rail screw template. Keep them with that receiver.
 if(p.rail_mount||String(p.source_key)==='508'||String(p.source_key)==='461')return 'xaxis';
 const section=tridentGuideLineage.sections[String(p.source_key)];if(!section)fail('Unknown Trident source occurrence: '+p.source_key);return section;
}
function v24Section(p,path){
 switch(p.group){
 case 'V24_Frame':return path.includes('/Gantry:')?'gantry':'frame';
 case 'V24_Z_Drives':return /Chain Lower|Endstop/.test(path)?'wiring':'zdrives';
 case 'V24_Bed':return 'bed';case 'V24_X_Beam':return 'gantry';
 case 'V24_Gantry':return /Z_Joints/.test(path)?'zaxis':/Chain_Guide/.test(path)?'wiring':/A\/B Drives|Front Idlers/.test(path)?'drives':'gantry';
 case 'V24_Reference_Belts':return /Z Belts/.test(path)?'zaxis':'belts';
 case 'V24_Toolhead':{
  const owner=p.source_path?.[4];
  if(['Panasonic GX-H15A:1','MGN12H (1):1','X_Carriage:1'].includes(owner))return 'gantry';
  if(['SB TOOLHEAD-Revo Voron:1','ADXL_Assembly - Generic:1','CW2_Assembly:1','Stealthburner_Assembly:1'].includes(owner))return 'head';
  fail('Unreviewed V2.4 carriage/head source owner: '+owner);
 }case 'V24_Electronics':return 'wiring';case 'V24_Skirts':return 'skirts';case 'V24_Enclosure':return 'panels';case 'V24_Exhaust':return 'exhaust';case 'V24_Spool':return 'filament';
 default:fail('Unreviewed printed V2.4 source group: '+p.group);
 }
}
export async function createVoronAssemblyGuide(loaded,scene){
 const id=loaded?.source?.machineId;if(!supportsVoronAssembly(id))fail('No source-backed assembly overview for this machine');
 const base=await createSourcePartsMap(loaded,scene,{allowVisibilityStages:true}),family=id.startsWith('voron_trident_')?'trident':'v24',groups=new Map(plans[family].map(r=>[r[0],[]]));
 const raw=new Map();for(const c of loaded.inspection.components)for(const p of c.meta.parts)raw.set(c.path+'#'+p.key,{p,component:c.path});
 for(const source of base.stages)for(const key of source.part_keys){
  const {p,component}=raw.get(key),path=(p.source_path??[p.source_component??'']).join('/');
  const section=family==='v24'?v24Section(p,path):component.includes('trident_r2_sb_carriage')?'xaxis':component.startsWith('toolheads/')||!p.group&&!component.includes('trident_r2_gantry_')?'head':tridentSection(p,path);
  if(!groups.has(section))fail('Unknown assembly section: '+section);groups.get(section).push(key);
 }
 const note='Advance to add the next source subassembly. Hardware stays with its source group. Parts use their final CAD positions; this overview does not animate insertion paths or replace the full manual.';
 const stages=plans[family].map(([id,title,start,end],index)=>{const keys=groups.get(id);if(!keys.length)fail('Missing assembly section: '+id);return Object.freeze({id,index,title,note,page_start:start,page_end:end,part_keys:Object.freeze(keys)})});
 const identity=Object.freeze({...base.identity,view_kind:'manual-assembly-overview-v1',stages_sha256:await hash([base.identity,stages,tridentGuideLineage.inventory_sha256])});
 const owners=new Map(stages.flatMap(s=>s.part_keys.map(k=>[k,s])));if(owners.size!==base.partCount)fail('Incomplete assembly assignment');
 const stage=v=>{const s=typeof v==='string'?stages.find(s=>s.id===v):stages[v];if(!s)fail('Unknown assembly stage');return s};let current=0,preview=false;
 const visibleKeys=()=>[...new Set(base.entries().map(r=>r.key))];
 const result=()=>{const s=stages[current],keys=visibleKeys();return {index:current,visible_keys:keys,visible_count:keys.length,added:s.part_keys.length,preview,manual_text:`Official manual ${s.page_start}–${s.page_end}`}};
 const search=(query,translate=v=>v)=>{const ts=norm(query).split(/\s+/).filter(Boolean);return stages.filter(s=>{const content=norm([translate(s.title),...s.part_keys.flatMap(k=>{const p=base.part(k);return[p.key,p.name,p.group,...p.path]})].join(' '));return ts.every(t=>content.includes(t))})};
 return Object.freeze({identity,manual:base.manual,stages:Object.freeze(stages),partCount:base.partCount,renderCount:base.renderCount,stage,part:base.part,owner:k=>{const s=owners.get(k);if(!s)fail('Unknown source part');return s},parts:v=>stage(v).part_keys.map(base.part),search,
  matchParts(value,query,translate=v=>v){const s=stage(value),ts=norm(query).split(/\s+/).filter(Boolean);return s.part_keys.map(base.part).filter(p=>ts.every(t=>norm([translate(s.title),p.key,p.name,...p.path].join(' ')).includes(t)))},
  setStage(v){const s=stage(v);base.setVisibilityKeys(stages.slice(0,s.index+1).flatMap(r=>r.part_keys));current=s.index;preview=false;return result()},
  previewComplete(){base.setVisibilityKeys(null);preview=true;return result()},
  restore(){base.setVisibilityKeys(null);preview=false},state(){base.verifyLive();return result()},entries:base.entries,getPartNodes:base.getPartNodes,verifyLive:base.verifyLive,
 });
}

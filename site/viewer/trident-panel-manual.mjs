import {checkedTridentManualData} from './trident-manual-data.mjs?v=19bb83f1fe559b8920ac';
const fail=s=>{throw Error('Trident panel manual: '+s)};
export const tridentPanelPresentationID='trident-side-door-v1';
export function tridentPanelProfile(){return JSON.parse(JSON.stringify(checkedTridentManualData().panel))}
export function refineTridentPanelManual(machine,stages,raw,components){
 if(machine!=='voron_trident_250')return stages;
 const data=checkedTridentManualData().panel;
 const c=components.find(c=>c.path===data.component);if(!c||['bytes','sha256'].some(k=>c.metadata[k]!==data.metadata[k]||c.model[k]!==data.model[k]))fail('Received model/metadata changed');
 for(const e of data.parts){const row=raw.get(data.component+'#'+e.key);if(!row||row.component!==data.component||['key','name','source_leaf','source_component','method'].some(k=>row.p[k]!==e[k])||JSON.stringify(row.p.rigid_translation_mm)!==JSON.stringify(e.rigid_translation_mm))fail('Source owner or frame changed: '+e.key)}
 const old=stages.find(s=>s.id==='panels'),keys=data.stages.flatMap(s=>s.part_keys);if(!old||old.part_keys.length!==keys.length||new Set(keys).size!==keys.length||keys.some(k=>!old.part_keys.includes(k)))fail('Source panel chapter changed');
 const out=stages.flatMap(s=>s.id==='panels'?data.stages.map(s=>JSON.parse(JSON.stringify(s))):[s]);
 const owners=new Map();for(const[i,s]of out.entries())for(const k of s.part_keys){if(owners.has(k))fail('Duplicate source occurrence');owners.set(k,i)}
 if(owners.size!==stages.reduce((n,s)=>n+s.part_keys.length,0))fail('Incomplete source accounting');
 for(const[i,s]of out.entries())for(const k of s.operation_part_keys||s.part_keys)if(!owners.has(k)||owners.get(k)>i)fail('Future or unknown source reference');
 return out;
}

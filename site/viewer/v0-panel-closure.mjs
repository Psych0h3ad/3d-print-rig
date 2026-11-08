import {checkedV0ManualData} from './v0-manual-data.mjs?v=02c5ea8d6a8687e71f2b';

const fail=s=>{throw Error('V0 panel closure: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const exact=(a,b)=>{if(a===b)return true;if(Array.isArray(b))return dense(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v));if(b&&typeof b==='object')return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k]));return false};
export function createV0PanelClosure({spec,manifest}){
 const sources=checkedV0ManualData('v0-panel-closure');
 const src=sources[manifest?.machine_id];
 if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||!exact(spec.manual,src.manual))fail('Unreviewed original source/manual');
 if(!dense(spec.stages)||!dense(manifest.parts))fail('Sparse source/stages');
 const ids=spec.stages.map(s=>s.id),parts=new Map(),rows=new Map();
 for(const p of manifest.parts){if(!p||parts.has(p.key))fail('Duplicate original source owner');parts.set(p.key,p);}
 const order=src.operations.map(o=>o.id);
 if(!exact(ids.slice(ids.indexOf(order[0]),ids.indexOf(order.at(-1))+1),order)||order.some(id=>ids.filter(v=>v===id).length!==1))fail('Changed exact bottom/motor instruction order');
 for(const [key,d]of Object.entries(src.descriptors)){const p=parts.get(key);if(!p||!exact({name:p.name,source:p.source,solid_count:p.solid_count,bounds_mm:p.bounds_mm,appearance_role:p.appearance_role},d))fail('Changed exact source reference '+key);}
 for(const c of src.ownershipCorrections){const owners=spec.stages.filter(s=>dense(s.part_keys)&&s.part_keys.includes(c.key));if(owners.length!==1||owners[0].id!==c.toStage)fail('Wrong original corrected owner '+c.key);}
 for(const rule of src.operations){const s=spec.stages[ids.indexOf(rule.id)];for(const field of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])if(!exact(s[field],rule[field]))fail('Changed exact instruction '+rule.id+' '+field);const bottom=rule.displayIntent.startsWith('bottom-');rows.set(rule.id,Object.freeze({id:rule.id,isolated:false,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),direction:Object.freeze(bottom?[.6,-1,.8]:[.2,.2,-1]),underside:bottom,status:bottom?'Bottom panel refitting reference':'Cable pass-through and motor panel reference',notes:Object.freeze([rule.id==='bottom-panel-position'?'The same four original rubber feet are set aside only while the bottom panel is positioned.':'Original source geometry and positions are retained; mating and holding remain unqualified.']),partNotes:Object.freeze({})}));}
 const at=index=>{if(!Number.isSafeInteger(index)||index<0||!ids[index])fail('Unknown operation');return rows.get(ids[index])||null};
 const filter=(index,shown)=>{const work=at(index);return new Set([...shown].filter(key=>work?.id==='bottom-panel-position'?!src.rubberFeet.includes(key):true))};
 return Object.freeze({at,filter,focus(index){return at(index)?[...at(index).refs]:[]},stored(index,shown){const visible=filter(index,shown);return[...shown].filter(k=>!visible.has(k))}});
}

import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

const fail=s=>{throw Error('V0 panel/door: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const exact=(a,b)=>{if(a===b)return true;if(Array.isArray(b))return dense(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v));if(b&&typeof b==='object')return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k]));return false};
export function createV0PanelDoor({spec,manifest}){
 const sources=checkedV0ManualData('v0-panel-door');
 const src=sources[manifest?.machine_id];if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||!exact(spec.manual,src.manual))fail('Unreviewed source/manual');
 if(!dense(spec.stages)||!dense(manifest.parts))fail('Sparse source/stages');
 const ids=spec.stages.map(s=>s.id),parts=new Map(),rows=new Map();
 for(const p of manifest.parts){if(!p||parts.has(p.key))fail('Duplicate original owner');parts.set(p.key,p);}
 for(const [key,d]of Object.entries(src.descriptors)){const p=parts.get(key);if(!p||!exact({name:p.name,source:p.source,solid_count:p.solid_count,bounds_mm:p.bounds_mm,appearance_role:p.appearance_role},d))fail('Changed original part '+key);}
 for(const order of Object.values(src.groups)){const start=ids.indexOf(order[0]);if(start<0||!exact(ids.slice(start,start+order.length),order)||order.some(id=>ids.filter(v=>v===id).length!==1))fail('Changed exact instruction group');}
 if(ids[ids.indexOf('tophat-source-lock-studs')-1]!=='tophat-frame'||ids[ids.indexOf('tophat-hinge-washers')+1]!=='tophat-attach')fail('Wrong original hardware timing');
 for(const rule of src.operations){const s=spec.stages[ids.indexOf(rule.id)];for(const field of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])if(!exact(s[field],rule[field]))fail('Changed instruction '+rule.id+' '+field);const direction=rule.displayIntent==='left'?[-1,.25,.3]:rule.displayIntent==='right'?[1,.25,.3]:rule.displayIntent==='front'?[.2,.15,1]:[.4,.3,-1];rows.set(rule.id,Object.freeze({id:rule.id,isolated:false,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),direction:Object.freeze(direction),underside:false,status:rule.displayIntent==='source-washers'?'Source CAD supplement: hinge washers':rule.displayIntent==='source-studs'?'Source CAD supplement: lock studs':'Panel and door installation reference',notes:Object.freeze(['Source CAD placement reference. Insertion paths, tightening and physical fit remain unverified.']),partNotes:Object.freeze({})}));}
 const at=index=>{if(!Number.isSafeInteger(index)||index<0||!ids[index])fail('Unknown operation');return rows.get(ids[index])||null};
 return Object.freeze({at,filter(index,shown){at(index);return new Set(shown)},focus(index){return at(index)?[...at(index).refs]:[]},stored(index,shown){at(index);return[]}});
}

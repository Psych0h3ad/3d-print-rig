import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

const fail=s=>{throw Error('V0 top-hat: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const exact=(a,b)=>{if(a===b)return true;if(Array.isArray(b))return dense(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v));if(b&&typeof b==='object')return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k]));return false};
export function createV0TophatAssembly({spec,manifest}){
 const sources=checkedV0ManualData('v0-tophat-assembly');
 const src=sources[manifest?.machine_id];if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||!exact(spec.manual,src.manual))fail('Unreviewed source/manual');
 if(!dense(spec.stages)||!dense(manifest.parts))fail('Sparse source/stages');
 const ids=spec.stages.map(s=>s.id),parts=new Map(),rows=new Map();for(const p of manifest.parts){if(!p||parts.has(p.key))fail('Duplicate source part');parts.set(p.key,p)}
 for(const [key,d]of Object.entries(src.descriptors)){const p=parts.get(key);if(!p||!exact({name:p.name,source:p.source,solid_count:p.solid_count,bounds_mm:p.bounds_mm,appearance_role:p.appearance_role},d))fail('Changed exact source '+key)}
 for(const group of Object.values(src.groups)){const i=ids.indexOf(group[0]);if(i<0||!exact(ids.slice(i,i+group.length),group)||group.some(k=>ids.filter(v=>v===k).length!==1))fail('Changed operation sequence')}
 for(const rule of src.operations){const s=spec.stages[ids.indexOf(rule.id)];for(const f of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])if(!exact(s[f],rule[f]))fail('Changed operation '+rule.id+' '+f);const direction=rule.id.includes('left')?[-1,.45,.4]:rule.id.includes('right')?[1,.45,.4]:rule.id.includes('front')?[.2,.4,1]:rule.id.includes('rear')?[.4,.35,-1]:[.65,.65,1];rows.set(rule.id,Object.freeze({id:rule.id,isolated:rule.isolated,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),shownKeys:rule.shownKeys?Object.freeze([...rule.shownKeys]):null,direction:Object.freeze(direction),underside:false,status:rule.status,notes:Object.freeze([rule.isolated?'Top-hat subassembly at its original CAD position. Other prepared assemblies are set aside; no insertion, tightening or physical-fit result is implied.':'Source CAD placement reference. Insertion paths, tightening and physical fit remain unverified.']),partNotes:Object.freeze({})}))}
 const at=i=>{if(!Number.isSafeInteger(i)||i<0||!ids[i])fail('Unknown operation');return rows.get(ids[i])||null};
 return Object.freeze({at,filter(i,shown){const r=at(i);return r?.isolated?new Set([...shown].filter(k=>r.shownKeys.includes(k))):new Set(shown)},focus(i){return at(i)?[...at(i).refs]:[]},stored(i,shown){const r=at(i);return r?.isolated?[...shown].filter(k=>!r.shownKeys.includes(k)):[]}})
}

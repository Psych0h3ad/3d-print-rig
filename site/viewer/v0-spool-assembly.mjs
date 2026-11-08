import {checkedV0ManualData} from './v0-manual-data.mjs?v=02c5ea8d6a8687e71f2b';

const fail=s=>{throw Error('V0 spool: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const exact=(a,b)=>{if(a===b)return true;if(Array.isArray(b))return dense(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v));if(b&&typeof b==='object')return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k]));return false};
export function createV0SpoolAssembly({spec,manifest}){
 const sources=checkedV0ManualData('v0-spool-assembly');
 const src=sources[manifest?.machine_id];if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||!exact(spec.manual,src.manual))fail('Unreviewed source/manual');
 if(!dense(spec.stages)||!dense(manifest.parts))fail('Sparse source/stages');const ids=spec.stages.map(s=>s.id),parts=new Map(),rows=new Map();
 for(const p of manifest.parts){if(!p||parts.has(p.key))fail('Duplicate source part');parts.set(p.key,p)}
 for(const [k,d]of Object.entries(src.descriptors)){const p=parts.get(k);if(!p||!exact({name:p.name,source:p.source,solid_count:p.solid_count,bounds_mm:p.bounds_mm,appearance_role:p.appearance_role},d))fail('Changed exact source '+k)}
 const first=ids.indexOf(src.sequence[0]);if(first<0||!exact(ids.slice(first,first+src.sequence.length),src.sequence)||src.sequence.some(k=>ids.filter(v=>v===k).length!==1))fail('Changed operation sequence');
 for(const rule of src.operations){const s=spec.stages[ids.indexOf(rule.id)];for(const f of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])if(!exact(s[f],rule[f]))fail('Changed operation '+rule.id+' '+f);rows.set(rule.id,Object.freeze({id:rule.id,isolated:rule.isolated,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),shownKeys:rule.shownKeys?Object.freeze([...rule.shownKeys]):null,direction:Object.freeze(rule.id==='spool-lower-supplement'?[.65,-.45,-1]:[.65,.45,-1]),underside:rule.id==='spool-lower-supplement',status:rule.status,notes:Object.freeze([]),partNotes:Object.freeze({})}))}
 const at=i=>{if(!Number.isSafeInteger(i)||i<0||!ids[i])fail('Unknown operation');return rows.get(ids[i])||null};
 return Object.freeze({at,filter(i,shown){const r=at(i);return r?.isolated?new Set([...shown].filter(k=>r.shownKeys.includes(k))):new Set(shown)},focus(i){return at(i)?[...at(i).refs]:[]},stored(i,shown){const r=at(i);return r?.isolated?[...shown].filter(k=>!r.shownKeys.includes(k)):[]}})
}

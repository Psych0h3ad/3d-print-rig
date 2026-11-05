import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

const fail=s=>{throw Error('V0 fan assembly: '+s)};
const equal=(a,b)=>Array.isArray(a)&&a.length===b.length&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)&&a[i]===b[i]).every(Boolean);
const same=(a,b)=>equal([...a].sort(),[...b].sort())&&new Set(a).size===a.length;
export function createV0FanAssembly({spec,manifest}){
 const sources=checkedV0ManualData('v0-fan-assembly');
 const src=sources[manifest?.machine_id];
 if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||spec.manual.sha256!==src.manual)fail('Unreviewed source/manual');
 const ids=spec.stages.map(s=>s.id),parts=new Map(manifest.parts.map(p=>[p.key,p])),rows=new Map(),indexes=src.operations.map(o=>ids.indexOf(o.id));
 if(indexes.some((x,i)=>x<0||i&&x<=indexes[i-1])||src.operations.some(o=>ids.filter(id=>id===o.id).length!==1))fail('Changed exact fan operation order');
 const install=ids.indexOf(src.install);if(install<=indexes[0])fail('Prepared receiver installation must be later');
 for(const rule of src.operations){
  const stage=spec.stages[ids.indexOf(rule.id)];
  if(stage.page_start!==rule.page_start||stage.page_end!==rule.page_end||!same(stage.part_keys,rule.part_keys)||!same(stage.operation_part_keys||stage.part_keys,rule.operation_part_keys))fail('Changed source fan stage '+rule.id);
  for(const key of [...rule.part_keys,...rule.operation_part_keys]){const p=parts.get(key),d=src.descriptors[key];if(!p||!d||p.name!==d.name||p.source?.repository!=='VoronDesign/Voron-0'||p.source?.source_key!==key.slice(-5)||!spec.manual.revision.includes(p.source?.commit||'MISSING')||!equal(p.source?.assembly_path,d.path))fail('Changed original fan owner '+key);}
  rows.set(rule.id,Object.freeze({id:rule.id,isolated:rule.isolated,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),direction:Object.freeze(rule.isolated?[.45,-1,.55]:[.1,.2,1]),underside:rule.isolated,status:rule.isolated?'Prepared fan subassembly reference':'Controller cooling fan reference',notes:Object.freeze([rule.isolated?'Keep this prepared subassembly aside until installation.':'Original source positions are retained; no insertion or thermal deformation is simulated.']),partNotes:Object.freeze({})}));
 }
 const at=index=>{if(!Number.isSafeInteger(index)||index<0||!ids[index])fail('Unknown operation');return rows.get(ids[index])||null};
 const filter=(index,shown)=>{const work=at(index);return new Set([...shown].filter(key=>work?.isolated?work.keys.includes(key):index>=install||!src.prepared.includes(key)))};
 return Object.freeze({at,filter,focus(index){return at(index)?[...at(index).refs]:[]},stored(index,shown){const visible=filter(index,shown);return [...shown].filter(key=>!visible.has(key))}});
}

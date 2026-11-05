import {checkedV0ManualData} from './v0-manual-data.mjs?v=39f5b1cde427278cb44a';

const fail=s=>{throw Error('V0 enclosure assembly: '+s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const exact=(a,b)=>{
 if(a===b)return true;
 if(Array.isArray(b))return dense(a)&&a.length===b.length&&b.every((v,i)=>exact(a[i],v));
 if(b&&typeof b==='object')return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&exact(a[k],b[k]));
 return false;
};
export function createV0EnclosureAssembly({spec,manifest}){
 const sources=checkedV0ManualData('v0-enclosure-assembly');
 const src=sources[manifest?.machine_id];
 if(!src||spec.model_sha256!==src.model||spec.manifest_sha256!==src.manifest||!exact(spec.manual,src.manual))fail('Unreviewed source/manual');
 if(!dense(spec.stages)||!dense(manifest.parts))fail('Sparse source/stages');
 const ids=spec.stages.map(s=>s.id),parts=new Map(),rows=new Map();
 for(const p of manifest.parts){if(!p||parts.has(p.key))fail('Duplicate source owner');parts.set(p.key,p);}
 const order=src.operations.map(o=>o.id),span=[...order.slice(0,10),'display-blank',...order.slice(10)];
 if(!exact(ids.slice(ids.indexOf(order[0]),ids.indexOf(order.at(-1))+1),span)||order.some(id=>ids.filter(x=>x===id).length!==1))fail('Changed exact skirt/display instruction order');
 for(const rule of src.operations){
  const stage=spec.stages[ids.indexOf(rule.id)];
  for(const field of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])if(!exact(stage[field],rule[field]))fail('Changed skirt/display instruction '+rule.id+' '+field);
  for(const key of rule.operation_part_keys){const p=parts.get(key),d=src.descriptors[key];if(!p||!d||p.name!==d.name||p.solid_count!==d.solid_count||!exact(p.source,d.source))fail('Changed original skirt/display owner '+key);}
  const isolated=rule.displayIntent.startsWith('prepare-'),display=rule.id.startsWith('display');
  rows.set(rule.id,Object.freeze({id:rule.id,isolated,keys:Object.freeze([...rule.operation_part_keys]),refs:Object.freeze([...rule.operation_part_keys]),direction:Object.freeze(isolated?[.6,.3,1]:display?[.1,.05,1]:rule.id.includes('right')?[1,.1,.3]:rule.id.includes('left')?[-1,.1,.3]:rule.id.includes('rear')?[.1,.1,-1]:[.1,.1,1]),underside:false,status:isolated?'Prepared skirt or display reference':'Skirt and display installation reference',notes:Object.freeze([isolated?'Keep this exact prepared source group aside until its installation step.':'Original source positions are retained; finite fit and holding remain unqualified.']),partNotes:Object.freeze({})}));
 }
 const prepared=src.preparedGroups.map(g=>({keys:[...g.keys],install:ids.indexOf(g.install)}));
 if(prepared.some(g=>g.install<0||g.keys.some(k=>!parts.has(k))))fail('Missing prepared group installation');
 const at=index=>{if(!Number.isSafeInteger(index)||index<0||!ids[index])fail('Unknown operation');return rows.get(ids[index])||null};
 const filter=(index,shown)=>{const work=at(index);return new Set([...shown].filter(key=>work?.isolated?work.keys.includes(key):!prepared.some(g=>index<g.install&&g.keys.includes(key))))};
 return Object.freeze({at,filter,focus(index){return at(index)?[...at(index).refs]:[]},stored(index,shown){const visible=filter(index,shown);return [...shown].filter(key=>!visible.has(key))}});
}

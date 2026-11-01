// Source occurrences, not a purchasing BOM or a tightening sequence. Purchased
// assemblies may contain internal hardware: their manual remains authoritative.
export function isNamedFastener(part){
 if(['base','accent','printed','frame'].includes(part.role))return false;
 const name=String(part.name).replaceAll('_',' ');
 return /(?:\bM\d(?:\.\d+)?\s*[x×]\s*\d|\b(?:screw|bolt|washer|shim|hexnut|nut|insert|BHCS|SHCS|FHCS|HHCS)\b)/i.test(name);
}
export function assemblyPartRows(index,value){
 const parts=index.parts(value),counts=new Map(),seen=new Map();
 const name=p=>isNamedFastener(p)?p.name.replace(/\s*\(\d+\)\s*$/u,'').trim():p.name;
 for(const p of parts){const n=name(p);counts.set(n,(counts.get(n)||0)+1)}
 return parts.map(part=>{const label=name(part),ordinal=(seen.get(label)||0)+1;seen.set(label,ordinal);return Object.freeze({part,key:part.key,label,ordinal,total:counts.get(label),fastener:isNamedFastener(part)})});
}

const normalize=text=>text.trim().replace(/\s+/gu,' ');
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const japanese=/[\u3040-\u30ff\u3400-\u9fff]/u;
const format=(text,values)=>text.replace(/\{(\d+)\}/gu,(token,key)=>Object.hasOwn(values,key)?String(values[key]):token);
function patterns(entries){
 return entries.map(([source,id])=>{
  const keys=[];let last=0,expression='';
  for(const m of source.matchAll(/\{(\d+)\}/gu)){expression+=escape(source.slice(last,m.index))+'(.*?)';keys.push(m[1]);last=m.index+m[0].length}
  expression+=escape(source.slice(last));return {test:new RegExp('^'+expression+'$','u'),keys,id,specificity:source.replace(/\{\d+\}/gu,'').length};
 }).sort((a,b)=>b.specificity-a.specificity);
}

export function createTranslator(definitions,{dictionaries=new Map()}={}){
 const sourceIndex=new Map(),englishIndex=new Map(),jaPatterns=[],enPatterns=[];
 for(const[id,e]of Object.entries(definitions)){
  for(const source of [e.ja,...e.aliases||[]]){if(!sourceIndex.has(normalize(source)))sourceIndex.set(normalize(source),id);if(e.kind==='template'||/\{\d+\}/u.test(source))jaPatterns.push([source,id])}
  if(!englishIndex.has(normalize(e.en)))englishIndex.set(normalize(e.en),id);
  if(e.kind==='template'||/\{\d+\}/u.test(e.en))enPatterns.push([e.en,id]);
 }
 const jp=patterns(jaPatterns),ep=patterns(enPatterns),specificJP=jp.filter(p=>p.specificity>=8);
 const fragments=[...sourceIndex.keys()].filter(s=>s.length>1&&japanese.test(s)).sort((a,b)=>b.length-a.length);
 const jpFragments=new RegExp(fragments.map(escape).join('|')||'(?!)','gu');
 const jpNames=new RegExp(fragments.filter(s=>/[a-z]/iu.test(s)).map(escape).join('|')||'(?!)','gu');
 const englishFragments=[...englishIndex.keys()].filter(s=>s.length>1&&!/\{\d+\}/u.test(s)).sort((a,b)=>b.length-a.length);
 const enFragments=new RegExp('(?<![A-Za-z0-9_])(?:'+(englishFragments.map(escape).join('|')||'(?!)')+')(?![A-Za-z0-9_])','gu');
 const fallbacks=new Set();
 function resolve(id,language){
  const entry=definitions[id];if(!entry)return id;
  if(language==='ja')return entry.ja;
  if(language==='en')return entry.en;
  const dictionary=dictionaries.get(language),record=dictionary?.[id];
  if(record?.[0]===entry.revision&&typeof record[1]==='string'&&record[1]){fallbacks.delete(language+':'+id);return record[1]}
  if(dictionary)fallbacks.add(language+':'+id);return entry.en;
 }
 function match(text,list,language,depth){
  for(const p of list){const m=text.match(p.test);if(!m)continue;const values=Object.fromEntries(p.keys.map((key,i)=>[key,translate(m[i+1],language,depth+1)]));return format(resolve(p.id,language),values)}
 }
 function english(text,depth){
  const source=normalize(text),id=sourceIndex.get(source);
  if(id)return resolve(id,'en');
  const complete=match(source,specificJP,'en',depth);if(complete!==undefined)return complete;
  const input=source.replace(jpNames,key=>resolve(sourceIndex.get(key),'en'));
  return match(input,jp,'en',depth)??input.replace(jpFragments,key=>resolve(sourceIndex.get(key),'en'));
 }
 function translate(text,language='en',depth=0){
  if(typeof text!=='string'||depth>5)return text;
  const source=normalize(text);if(!source)return text;
  const id=sourceIndex.get(source)||englishIndex.get(source);
  let result;
  if(id)result=resolve(id,language);
  else if(source.includes(' ／ ')){
   // Controllers append independent status messages with this separator.
   // Match a complete template first so a separator inside a parameter is
   // retained; otherwise translate each complete message independently.
   const whole=match(source,japanese.test(source)?specificJP:ep,language,depth);
   result=whole??source.split(' ／ ').map(part=>translate(part,language,depth+1)).join(' ／ ');
  }
  else if(language==='ja')result=japanese.test(source)?match(source,jp,'ja',depth)??source.replace(jpFragments,key=>resolve(sourceIndex.get(key),'ja')):match(source,ep,'ja',depth)??source.replace(enFragments,key=>resolve(englishIndex.get(key),'ja'));
  else if(language==='en')result=japanese.test(source)?english(source,depth):source;
  else{
   const input=japanese.test(source)?english(source,depth):source;
   const whole=englishIndex.get(input);
   result=whole?resolve(whole,language):match(input,ep,language,depth)??input.replace(enFragments,key=>resolve(englishIndex.get(key),language));
  }
  if(result===source)return text;
  return text.slice(0,text.indexOf(text.trim()))+result+text.slice(text.indexOf(text.trim())+text.trim().length);
 }
 return {translate,formatMessage:(id,values={},language='en')=>format(resolve(id,language),values),messageIdFor:text=>sourceIndex.get(normalize(text))||englishIndex.get(normalize(text)),messageSource:id=>definitions[id]?.ja||id,diagnostics:()=>({fallbacks:[...fallbacks]})};
}

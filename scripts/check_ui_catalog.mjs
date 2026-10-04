import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {createTranslator} from '../site/viewer/translation-engine.mjs';

const root=fileURLToPath(new URL('../site/viewer/',import.meta.url));
const source=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
const translator=createTranslator(source.entries),jp=/[\u3040-\u30ff\u3400-\u9fff]/u;
const decode=text=>text.replace(/\\(?:u\{([a-f0-9]+)\}|u([a-f0-9]{4})|x([a-f0-9]{2})|([\s\S]))/giu,(_,point,u,x,c)=>point||u||x?String.fromCodePoint(parseInt(point||u||x,16)):({n:'\n',r:'\r',t:'\t'}[c]??c));
function literals(text){
 const strings=[];
 for(let i=0;i<text.length;i++){
  if(text.slice(i,i+2)==='//'){i=text.indexOf('\n',i+2);if(i<0)break;continue}
  if(text.slice(i,i+2)==='/*'){i=text.indexOf('*/',i+2)+1;if(i===0)break;continue}
  const quote=text[i];if(!['"',"'",'`'].includes(quote))continue;
  let value='',end=i+1;
  for(;end<text.length;end++){const c=text[end];if(c==='\\'){value+=c+(text[++end]||'');continue}if(c===quote)break;value+=c}
  i=end;
  if(quote==='`')strings.push(...value.split(/\$\{[^}]*\}/gu).map(decode));else strings.push(decode(value));
 }
 return strings;
}
const unknown=[],invalid=[];
async function scan(directory){
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const path=resolve(directory,entry.name);if(entry.isDirectory()){if(entry.name!=='locales')await scan(path);continue}
  if(!/\.(?:html|m?js)$/u.test(entry.name))continue;
  const raw=await fs.readFile(path,'utf8');let values;
  if(entry.name.endsWith('.html')){
   const html=raw.replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/giu,'');
   values=[...html.matchAll(/>([^<>]+)</gu)].map(m=>m[1]).concat([...html.matchAll(/(?:aria-label|title|alt|placeholder)\s*=\s*(["'])(.*?)\1/gu)].map(m=>m[2]));
  }else values=literals(raw);
  for(const rawValue of values){
   const value=rawValue.trim().replace(/\s+/gu,' ');if(!value)continue;
   if(/^(?:ui|view|status|navigation|title)\.[a-z0-9_]+$/u.test(value)&&!Object.hasOwn(source.entries,value))invalid.push({file:relative(root,path).replaceAll('\\','/'),id:value});
   if(jp.test(value)&&jp.test(translator.translate(value,'en')))unknown.push({file:relative(root,path).replaceAll('\\','/'),text:value});
  }
 }
}
await scan(root);
const unique=Array.from(new Map(unknown.map(row=>[row.file+'\0'+row.text,row])).values()).sort((a,b)=>a.file.localeCompare(b.file)||a.text.localeCompare(b.text));
const baselinePath=new URL('../localization/legacy-fragments.json',import.meta.url);
if(process.argv.includes('--report')){console.log(JSON.stringify({invalid,unknown:unique},null,2));process.exitCode=invalid.length?1:0}
else if(process.argv.includes('--write')){assertNoInvalid();await fs.writeFile(baselinePath,JSON.stringify({schema_version:1,fragments:unique},null,2)+'\n');console.log('Legacy fragment baseline:',unique.length)}
else{
 assertNoInvalid();const baseline=JSON.parse(await fs.readFile(baselinePath,'utf8')),allowed=new Set(baseline.fragments.map(row=>row.file+'\0'+row.text));
 const missing=unique.filter(row=>!allowed.has(row.file+'\0'+row.text));
 if(missing.length)throw Error('UI text absent from localization catalog: '+JSON.stringify(missing));
 console.log(`UI catalog check passed: no new untranslated Japanese literals or unknown stable IDs (${unique.length} legacy assembly fragments).`);
}
function assertNoInvalid(){if(invalid.length)throw Error('Unknown message IDs: '+JSON.stringify(invalid))}

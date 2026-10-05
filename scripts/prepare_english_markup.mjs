// Render the existing message catalog into the initial HTML as well as the
// runtime UI. The translator recognizes both source languages by stable ID.
import fs from 'node:fs/promises';
import {translate} from '../site/viewer/i18n.mjs';
const root=new URL('../site/viewer/',import.meta.url);
for(const entry of await fs.readdir(root,{withFileTypes:true})){
 if(!entry.isFile()||!entry.name.endsWith('.html'))continue;
 const path=new URL(entry.name,root),before=await fs.readFile(path,'utf8');
 const after=before.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/giu,token=>{
  if(/^<(?:script|style|!)/iu.test(token))return token;
  if(token.startsWith('<'))return token.replace(/(<html\b[^>]*\blang=)["']ja["']/iu,'$1"en"').replace(/\b(title|placeholder|aria-label|aria-description|alt|label)=(['"])(.*?)\2/gu,(m,key,quote,value)=>key+'='+quote+translate(value,'en').replaceAll(quote,quote==='"'?'&quot;':'&#39;')+quote);
  return translate(token,'en');
 });
 if(process.argv.includes('--write'))await fs.writeFile(path,after);
 else if(before!==after)throw Error(entry.name+': initial markup is not in English; run prepare_english_markup.mjs --write.');
}
console.log('Initial viewer markup uses the English message catalog.');

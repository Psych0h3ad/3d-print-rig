import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import './prepare_english_markup.mjs';
const root=new URL('../site/viewer/',import.meta.url);
for(const entry of await fs.readdir(root))if(entry.endsWith('.html')){
 const html=await fs.readFile(new URL(entry,root),'utf8');assert(/<html\b[^>]*lang="en"/u.test(html),entry+' initial document language');
 const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/giu,'');
 assert(!/[ぁ-んァ-ヶ一-龠]/u.test(markup),entry+' untranslated initial menu');
}
console.log('Every initial viewer page renders English before asynchronous setup.');

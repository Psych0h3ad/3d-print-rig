import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Pin model catalogs and the actual rendering/interaction code. Translation
// output is verified independently by build_locales and test_multilingual.
export function machineReviewInputs(){
 const inputs={};
 function visit(directory){
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
   const relative=(directory+'/'+entry.name).replaceAll('\\','/');
   if(entry.isDirectory()){
    if(!/^vendor(?:-|$)/.test(entry.name)&&entry.name!=='locales')visit(relative);
   }else if(/\.(?:json|html|css|m?js)$/.test(entry.name)&&!entry.name.startsWith('messages-')){
    const bytes=fs.readFileSync(path.join(root,relative));
    inputs[relative]=createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex');
   }
  }
 }
 visit('site/viewer');
 for(const name of fs.readdirSync(path.join(root,'site')).filter(n=>n.endsWith('.json'))){
  const relative='site/'+name;
  inputs[relative]=createHash('sha256').update(fs.readFileSync(path.join(root,relative),'utf8').replaceAll('\r\n','\n')).digest('hex');
 }
 return Object.fromEntries(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b)));
}

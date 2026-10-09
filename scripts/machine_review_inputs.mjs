import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Pin the review machinery too: changing an auditor, test, loader or build
// gate invalidates its old results even when the rendered model is unchanged.
// Translation output is verified independently by build_locales/multilingual.
export function machineReviewInputs(reviewRoot=root){
 const inputs={};
 function pin(relative){
  const bytes=fs.readFileSync(path.join(reviewRoot,relative));
  inputs[relative]=createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex');
 }
 function visit(directory,reviewCode=false){
  for(const entry of fs.readdirSync(path.join(reviewRoot,directory),{withFileTypes:true})){
   const relative=(directory+'/'+entry.name).replaceAll('\\','/');
   if(entry.isDirectory()){
    if(entry.name!=='locales')visit(relative,reviewCode);
   }else if((reviewCode?/\.(?:json|html|css|py|m?js)$/:/\.(?:json|html|css|m?js)$/).test(entry.name)&&!entry.name.startsWith('messages-')){
    pin(relative);
   }
  }
 }
 visit('site/viewer');
 for(const name of fs.readdirSync(path.join(reviewRoot,'site')).filter(n=>n.endsWith('.json'))){
  pin('site/'+name);
 }
 visit('scripts',true);
 for(const entry of fs.readdirSync(path.join(reviewRoot,'.github/workflows'),{withFileTypes:true}))
  if(entry.isFile()&&/\.ya?ml$/.test(entry.name))pin('.github/workflows/'+entry.name);
 return Object.fromEntries(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b)));
}

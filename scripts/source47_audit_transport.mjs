import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function loadSource47AuditData(site,{onBody=()=>{}}={}){
 const expected=await fs.readFile(new URL('../site/viewer/source47/source47-data.mjs',import.meta.url));
 const actual=await fs.readFile(path.join(path.resolve(site),'viewer/source47/source47-data.mjs'));
 const sha=b=>createHash('sha256').update(b).digest('hex');
 if(sha(actual)!==sha(expected))throw Error('Built source47 loader differs from current source');
 const root=path.resolve(site),api=await import(pathToFileURL(path.join(root,'viewer/source47/source47-data.mjs')).href);
 const targets=new Map(Object.values(api.source47Delivery).map(p=>[path.resolve(root,p.gzip.path),p]));
 for(const p of Object.values(api.source47Delivery)){
  try{await fs.access(path.join(root,p.sourcePath));throw Error('Raw build-only source47 data was delivered')}catch(e){if(e.code!=='ENOENT')throw e}
 }
 const received=await api.loadSource47Data({fetchImpl:async(url,{signal,cache})=>{
  signal.throwIfAborted();const file=path.resolve(fileURLToPath(url)),pin=targets.get(file);
  if(!pin||cache!=='no-cache')throw Error('Unregistered source47 audit request');
  const body=await fs.readFile(file);signal.throwIfAborted();
  onBody(pin.gzip.path,body,pin);
  return new Response(body,{headers:{'Content-Length':String(body.length)}});
 }});
 return api.checkedSource47Data(received);
}

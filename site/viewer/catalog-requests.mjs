import {contentSHA256} from './mount-validation.mjs';
import {workspaceTask} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';

// One catalog load owns these raw responses. Never share mutable parsed data or
// reuse an earlier machine load's evidence identities.
export function createCatalogRequests({fetch:fetchSource=globalThis.fetch,hash=contentSHA256,task=workspaceTask}={}) {
 const requests=new Map(),hashes=Object.create(null);
 function discard(name,pending) {
  if(requests.get(name)!==pending)return;
  requests.delete(name);delete hashes[name];
 }
 function request(name) {
  let pending=requests.get(name);
  if(!pending) {
   pending=(async()=>{
    const response=await fetchSource('../'+name,{cache:'no-cache'});
    if(!response.ok)throw Error('ヘッドの取付データを取得できません');
    const text=await response.text();
    try {
     const digest=await hash(text);
     Object.defineProperty(hashes,name,{value:digest,enumerable:true,configurable:true});
    } catch(error) {
     if(error?.name==='AbortError')throw error;
     // Unsupported hashing leaves mounting evidence unverified.
    }
    return text;
   })();
   requests.set(name,pending);
   pending.catch(()=>discard(name,pending));
  }
  return pending;
 }
 function read(name,parse) {
  // Track every consumer, including cache hits, so a closed workspace rejects
  // before it can reuse a successful response.
  return task(async()=>{
   const pending=request(name),text=await pending;
   if(!parse)return;
   try{return JSON.parse(text)}catch(error){discard(name,pending);throw error}
  });
 }
 return {get:name=>read(name,true),pin:name=>read(name,false),hashes};
}

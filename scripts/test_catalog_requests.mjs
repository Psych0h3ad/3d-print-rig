// Request/evidence lifetime checks. No model, native geometry or browser loads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createCatalogRequests} from '../site/viewer/catalog-requests.mjs';
const requestModule=new URL('../site/viewer/catalog-requests.mjs',import.meta.url);
const lifecycleReference=fs.readFileSync(requestModule,'utf8').match(/from '(\.\/workspace-lifecycle\.mjs(?:\?v=[^']+)?)'/)?.[1];
assert(lifecycleReference,'Use the production request helper\'s exact lifecycle instance after cache revisions');
const {WorkspaceScope,activateScope,workspaceTask}=await import(new URL(lifecycleReference,requestModule));

const sha=text=>createHash('sha256').update(text).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const response=text=>({ok:true,text:async()=>text});
const cases=[];
async function check(name,run){await run();cases.push(name)}

await check('router and catalog consumers share task and listener lifetime',async()=>{
 const router=new URL('../site/viewer/workspace-router.mjs',import.meta.url);
 const reference=fs.readFileSync(router,'utf8').match(/from '(\.\/workspace-lifecycle\.mjs(?:\?v=[^']+)?)'/)?.[1];
 assert(reference,'Router lifecycle import must be inspectable');
 const owner=await import(new URL(reference,router));
 assert.equal(owner.WorkspaceScope,WorkspaceScope,'Router and request helper must use one module instance');
 for(const name of ['machine-heads.js','configurations.js']){
  const url=new URL('../site/viewer/'+name,import.meta.url);
  const ref=fs.readFileSync(url,'utf8').match(/from '(\.\/workspace-lifecycle\.mjs(?:\?v=[^']+)?)'/)?.[1];
  assert(ref,name+' lifecycle import');
  assert.equal((await import(new URL(ref,url))).WorkspaceScope,owner.WorkspaceScope,name+' must share router cleanup');
 }
 const scope=new owner.WorkspaceScope();owner.activateScope(scope);
 let events=0,fetches=0;const target=new EventTarget();
 owner.workspaceListen(target,'change',()=>events++);target.dispatchEvent(new Event('change'));
 scope.dispose();target.dispatchEvent(new Event('change'));
 const requests=createCatalogRequests({fetch:async()=>{fetches++;return response('{}')},hash:async text=>sha(text)});
 try{await assert.rejects(requests.get('after-navigation.json'),/Workspace has closed/);assert.equal(fetches,0);assert.equal(events,1);}
 finally{owner.activateScope(undefined);}
});

await check('concurrent reads/pins share transport and hash, never parsed objects',async()=>{
 const gate=deferred(),text=JSON.stringify({nested:{value:1},items:[{value:2}]});
 let fetches=0,reads=0,hashes=0,tasks=0;
 const requests=createCatalogRequests({
  fetch:async(url,options)=>{fetches++;assert.equal(url,'../catalog.json');assert.deepEqual(options,{cache:'no-cache'});await gate.promise;return {ok:true,text:async()=>{reads++;return text}}},
  hash:async text=>{hashes++;return sha(text)},task:run=>{tasks++;return run()}
 });
 const a=requests.get('catalog.json'),b=requests.get('catalog.json'),pin=requests.pin('catalog.json');
 assert.equal(fetches,1);gate.resolve();const [first,second,pinned]=await Promise.all([a,b,pin]);
 assert.equal(pinned,undefined);assert.deepEqual([fetches,reads,hashes,tasks],[1,1,1,3]);
 assert.notEqual(first,second);assert.notEqual(first.nested,second.nested);assert.notEqual(first.items,second.items);
 first.nested.value=50;first.items[0].value=60;second.items.push({value:70});
 assert.deepEqual(await requests.get('catalog.json'),JSON.parse(text));
 assert.deepEqual(second.nested,{value:1});assert.equal(requests.hashes['catalog.json'],sha(text));
 assert.throws(()=>{requests.hashes['catalog.json']='changed'},TypeError);
 assert.deepEqual([fetches,reads,hashes,tasks],[1,1,1,4]);
});

await check('pins never parse, malformed get evicts source and identity for retry',async()=>{
 let text='not JSON',fetches=0,parses=0;const parse=JSON.parse;
 const requests=createCatalogRequests({fetch:async()=>{fetches++;return response(text)},hash:async text=>sha(text)});
 JSON.parse=(...args)=>{parses++;return parse(...args)};
 try {
  await requests.pin('input.json');await requests.pin('input.json');
  assert.equal(parses,0);assert.equal(requests.hashes['input.json'],sha(text));
  await assert.rejects(requests.get('input.json'),SyntaxError);
  assert.equal(Object.hasOwn(requests.hashes,'input.json'),false);
  text='{"recovered":true}';assert.deepEqual(await requests.get('input.json'),{recovered:true});
  assert.equal(requests.hashes['input.json'],sha(text));assert.equal(fetches,2);assert.equal(parses,2);
 } finally {JSON.parse=parse}
});

for(const mode of ['http','network','sync-fetch','body','fetch-abort','body-abort','hash-abort']) {
 await check(`${mode} failure coalesces, rejects and retries`,async()=>{
  let fetches=0,hashes=0;const gate=deferred(),error=Object.assign(Error(mode),{name:mode.endsWith('abort')?'AbortError':'Error'});
  const requests=createCatalogRequests({
   fetch:()=>{
    const attempt=++fetches;if(attempt===1&&mode==='sync-fetch')throw error;
    return (async()=>{
     await gate.promise;
     if(attempt===1&&['network','fetch-abort'].includes(mode))throw error;
     if(attempt===1&&mode==='http')return {ok:false};
     return {ok:true,text:async()=>{if(attempt===1&&['body','body-abort'].includes(mode))throw error;return '{"ok":true}'}};
    })();
   },
   hash:async text=>{if(++hashes===1&&mode==='hash-abort')throw error;return sha(text)}
  });
  const first=requests.get('retry.json'),second=requests.pin('retry.json');gate.resolve();
  const result=await Promise.allSettled([first,second]);
  for(const item of result){assert.equal(item.status,'rejected');if(mode!=='http')assert.equal(item.reason,error)}
  assert.equal(fetches,1);assert.equal(Object.hasOwn(requests.hashes,'retry.json'),false);
  assert.deepEqual(await requests.get('retry.json'),{ok:true});assert.equal(fetches,2);
 });
}

await check('unsupported hashing stays unverified and a new scope retries hashing',async()=>{
 let fetches=0,hashes=0;const options={fetch:async()=>{fetches++;return response('{"ok":true}')},hash:async()=>{hashes++;throw Error('WebCrypto unavailable')}};
 const requests=createCatalogRequests(options);
 assert.deepEqual(await requests.get('unsupported.json'),{ok:true});await requests.pin('unsupported.json');
 assert.equal(Object.hasOwn(requests.hashes,'unsupported.json'),false);assert.deepEqual([fetches,hashes],[1,1]);
 await createCatalogRequests(options).get('unsupported.json');assert.deepEqual([fetches,hashes],[2,2]);
});

await check('workspace settlement tracks consumers and closed cache hits reject',async()=>{
 const scope=new WorkspaceScope();activateScope(scope);
 try {
  const gate=deferred();let fetches=0,settled=false;
  const requests=createCatalogRequests({fetch:async()=>{fetches++;await gate.promise;return response('{}')},hash:async text=>sha(text)});
  const first=requests.get('scope.json'),second=requests.pin('scope.json');
  assert.equal(scope.tasks.size,2);const waiting=scope.settle().then(()=>{settled=true});
  await Promise.resolve();assert.equal(settled,false);
  scope.dispose();gate.resolve();await Promise.all([first,second,waiting]);
  assert.equal(scope.tasks.size,0);assert.equal(settled,true);
  // Already-started work settles, as in the original workspaceTask contract.
  for(const run of [()=>requests.get('scope.json'),()=>requests.pin('scope.json'),()=>requests.get('new.json')])await assert.rejects(run(),/Workspace has closed/);
  assert.equal(fetches,1);await scope.settle();
 } finally {activateScope(undefined)}
});

const root=fileURLToPath(new URL('../',import.meta.url));
const loaderPath=path.join(root,'site/viewer/machine-heads.js'),loaderSource=fs.readFileSync(loaderPath,'utf8');
assert.match(loaderSource,/import \{createCatalogRequests\} from '\.\/catalog-requests\.mjs(?:\?v=[^']+)?'/);
function compileLoader(source,dependencies) {
 const start=source.indexOf('export async function loadMachineHeadCatalog('),end=source.indexOf('\nexport function createMachineHeads(',start);
 assert(start>=0&&end>start,'Production loader function boundaries');
 return new Function(...Object.keys(dependencies),source.slice(start,end).replace(/^export /,'')+'\nreturn loadMachineHeadCatalog;')(...Object.values(dependencies));
}
function fixture({unsupported=false,failPin=false}={}) {
 const machine='request_fixture_a',other='request_fixture_b',bodies=new Map(),counts=new Map();let scopes=0,failures=0;
 const put=(name,value)=>bodies.set(name,JSON.stringify(value));
 put('TOOLHEAD_CONFIGURATIONS.json',{variants:[],assets:{},base_assets:{xol:{meta:'xol-meta.json'},stealthburner:{meta:'sb-meta.json'}}});
 put('HEAD_ADDITIONS.json',{});put('MACHINE_HEAD_REGISTRATIONS.json',{machines:{[machine]:{},[other]:{}}});
 put('TOOLCHANGER_BANK.json',{assets:{},machines:{},indx:{machines:{}}});
 put('shared-root.json',{root:true});put('shared-target.json',{target:true});put('xol-meta.json',{});put('sb-meta.json',{});put('ASSET_BUNDLE.json',{sha256:'bundle'});
 const rootPins=Object.fromEntries(['TOOLHEAD_CONFIGURATIONS.json','MACHINE_HEAD_REGISTRATIONS.json','TOOLCHANGER_BANK.json','shared-root.json'].map(n=>[n,sha(bodies.get(n))]));
 for(const name of ['MOUNT_VALIDATION.json','HEAD_VALIDATION.json'])put(name,{model_bundle_sha256:'bundle',input_sha256:rootPins,machines:Object.fromEntries([machine,other].map(id=>[id,{input_sha256:{'shared-target.json':sha(bodies.get('shared-target.json'))}}]))});
 const fetch=async url=>{const name=url.slice(3);counts.set(name,(counts.get(name)||0)+1);if(failPin&&name==='shared-root.json'&&failures++===0)return {ok:false};assert(bodies.has(name),name);return response(bodies.get(name))};
 const hash=async text=>{if(unsupported)throw Error('unsupported');return sha(text)};
 const dependencies={
  workspaceTask,fetch,contentSHA256:hash,createCatalogRequests:()=>{scopes++;return createCatalogRequests({fetch,hash})},
  // Mutate parsed catalogs deliberately; evidence must keep the raw identity.
  withHeadAdditions:raw=>{raw.added=true;return raw},withRapidoXUhfCover:raw=>raw,
  xolEmbeddedBoard:raw=>raw,sbEmbeddedBoard:raw=>raw,withEmbeddedBoards:heads=>heads,
  nativeDeckEvidenceSource:{file:'unexpected-deck.json'},nativeCatalogEvidenceSource:{catalog:'TOOLHEAD_CONFIGURATIONS.json',file:'unexpected-catalog.json'},
  nativeWitnessInputs:(evidence,hashes,bundle,id)=>Object.entries({...evidence.input_sha256,...evidence.machines[id].input_sha256}).every(([name,digest])=>hashes[name]===digest)?{hashes,bundle}:null,
  acceptedMountValidation:()=>({fixture:true}),acceptedHeadValidation:()=>({fixture:true})
 };
 // No native bridge authentication is simulated by this routing fixture.
 if(unsupported){dependencies.nativeCatalogEvidenceSource.file='unverified-proof.json';put('unverified-proof.json',{})}
 return {machine,other,bodies,counts,get scopes(){return scopes},load:compileLoader(loaderSource,dependencies)};
}

await check('production loader coalesces raw/MOUNT/HEAD inputs per invocation',async()=>{
 const f=fixture(),first=await f.load(f.machine);
 assert(first.heads.added);assert(first.registry.probe_travel_validation?.fixture);assert(first.registry.head_witness_validation?.fixture);
 assert.equal(f.scopes,1);for(const count of f.counts.values())assert.equal(count,1);
 assert.equal(f.counts.get('shared-target.json'),1);assert.equal(f.counts.get('ASSET_BUNDLE.json'),1);
 first.heads.base_assets.xol.meta='mutated';first.registry.machines[f.machine].mutated=true;
 const second=await f.load(f.other);assert.equal(f.scopes,2);
 assert.equal(second.heads.base_assets.xol.meta,'xol-meta.json');assert.equal(second.registry.machines[f.machine].mutated,undefined);
 for(const count of f.counts.values())assert.equal(count,2);
 f.bodies.set('shared-root.json',f.bodies.get('shared-root.json')+' ');
 const stale=await f.load(f.machine);assert.equal(stale.registry.probe_travel_validation,null);assert.equal(stale.registry.head_witness_validation,null);
 for(const count of f.counts.values())assert.equal(count,3);
});

await check('concurrent production load scopes refetch independently',async()=>{
 const f=fixture();const [first,second]=await Promise.all([f.load(f.machine),f.load(f.other)]);
 assert.equal(f.scopes,2);for(const count of f.counts.values())assert.equal(count,2);
 assert.notEqual(first.heads,second.heads);assert.notEqual(first.registry,second.registry);
});

await check('MOUNT pin failure retries during HEAD; unsupported hash accepts neither',async()=>{
 const f=fixture({failPin:true}),data=await f.load(f.machine);
 assert.equal(data.registry.probe_travel_validation,null);assert(data.registry.head_witness_validation?.fixture);assert.equal(f.counts.get('shared-root.json'),2);
 const unsupported=fixture({unsupported:true}),unverified=await unsupported.load(unsupported.machine);
 assert.equal(unverified.registry.probe_travel_validation,null);assert.equal(unverified.registry.head_witness_validation,null);
});

// Optional actual JSON catalog request/byte comparison against a saved loader.
// Only JSON served by this checkout is read. No native/purchased model inputs.
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
const baselinePath=option('--baseline-loader'),reportPath=option('--report');
let sourceComparison=null;
if(baselinePath) {
 const modules=await Promise.all([
  'head-additions.mjs','rapido-x-uhf-cover.mjs','eva-options.mjs','eva-heads.mjs','eva-installations.mjs',
  'siboor-catalog.mjs','native-evidence-bridge.mjs','mount-validation.mjs','head-validation.mjs','embedded-boards.mjs',
  'trinity-alpha-installation.mjs','trinity-alpha-host-extensions.mjs','trinity-alpha-siboor-r2.mjs'
 ].map(name=>import(new URL('../site/viewer/'+name,import.meta.url))));
 const production=Object.assign({},...modules),site=path.join(root,'site'),machine='voron_v24_250_printed';
 async function measure(source,{tamper=null}={}) {
  const inputs={},bySource={};let requests=0,bytes=0,hashes=0,hashedBytes=0,parses=0;
  const fetch=async url=>{
   const name=url.slice(3),file=path.resolve(site,name);
   assert(file.startsWith(site+path.sep)&&file.endsWith('.json'),'JSON catalogs only: '+name);
   let text=fs.readFileSync(file,'utf8');inputs[name]={bytes:Buffer.byteLength(text),sha256:sha(text)};
   if(name===tamper)text+=' ';
   const size=Buffer.byteLength(text);requests++;bytes+=size;
   const row=bySource[name]??={requests:0,bytes:0};row.requests++;row.bytes+=size;
   return response(text);
  };
  const hash=async text=>{hashes++;hashedBytes+=Buffer.byteLength(text);return sha(text)};
  const dependencies={...production,workspaceTask,fetch,contentSHA256:hash,createCatalogRequests:()=>createCatalogRequests({fetch,hash})};
  const parse=JSON.parse;JSON.parse=(...args)=>{parses++;return parse(...args)};
  let data;
  try{data=await compileLoader(source,dependencies)(machine)}finally{JSON.parse=parse}
  const accepted={mount:data.registry.probe_travel_validation?.machine??null,head:data.registry.head_witness_validation?.machine??null};
  const result={requests,bytes,hashes,hashedBytes,parses,accepted,inputs,bySource};
  return {result,data};
 }
 const baselineSource=fs.readFileSync(baselinePath,'utf8');
 let baseline=await measure(baselineSource),after=await measure(loaderSource);
 assert.deepEqual(after.data,baseline.data,'Actual source catalog output and authenticated evidence must be identical');
 assert.deepEqual(after.result.accepted,{mount:machine,head:machine});
 assert(after.result.requests<baseline.result.requests);assert(after.result.bytes<baseline.result.bytes);
 assert(after.result.parses<baseline.result.parses);assert.equal(after.result.hashes,after.result.requests);
 for(const row of Object.values(after.result.bySource))assert.equal(row.requests,1);
 sourceComparison={machine,baselineLoaderSha256:sha(baselineSource),loaderSha256:sha(loaderSource),baseline:baseline.result,after:after.result,deepEqualCatalogAndEvidence:true};
 baseline=null;after=null;globalThis.gc?.();
 const tamper='STOCK_SKIRT_RETENTION_QA_92.json';
 const stale=await measure(loaderSource,{tamper});assert.deepEqual(stale.result.accepted,{mount:null,head:null});
 sourceComparison.tamperedSharedInput={name:tamper,accepted:stale.result.accepted};
 cases.push('actual source JSON requests/bytes, equal catalogs/authenticated evidence, fresh-load tampering rejected');
}

const report={passed:true,scope:'Catalog transport/hash/parse and evidence lifetimes only; no model, browser, clearance or mounting audit.',cases,sourceComparison,
 sources:Object.fromEntries(['site/viewer/machine-heads.js','site/viewer/catalog-requests.mjs','scripts/test_catalog_requests.mjs'].map(name=>{const bytes=fs.readFileSync(path.join(root,name));return [name,{sha256:sha(bytes),bytes:bytes.length}]}))};
if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,cases:cases.length,sourceComparison:sourceComparison?{baseline:sourceComparison.baseline.requests,after:sourceComparison.after.requests,baselineBytes:sourceComparison.baseline.bytes,afterBytes:sourceComparison.after.bytes}:null}));

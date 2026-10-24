// Private, exact-body preparation only. Import performs no application I/O.
// node --max-old-space-size=224 --max-semi-space-size=4 --v8-pool-size=1
//   scripts/prepare_layout_equipment_inputs.mjs --cache-dir <absolute private dir>
//   --map <absolute inputs.json> --report <absolute report.json> [--timeout-ms 60000]
// The CLI has no URL, catalog, source-directory or pin override.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as checkedCatalog from '../site/layout/layout-equipment.mjs';
import {
  MAX_LAYOUT_EQUIPMENT_BYTES,LAYOUT_EQUIPMENT_TRANSFER_BASE,
  equipmentTransferIdentity,equipmentPreviewGeometryTransferIdentity,
  downloadEquipmentModel,downloadEquipmentPreviewGeometry,verifyEquipmentModelBytes
} from '../site/layout/layout-equipment-transfer.mjs';

export const MAX_EQUIPMENT_INPUT_TOTAL_BYTES=64*1024*1024;
const BASE='https://psych0h3ad.github.io/3d-print-rig-extra-models/';
const PREFIX='layout/assets/equipment/u1-exterior/';
const CACHE_NAME='layout-equipment-inputs-v1';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SITE=path.join(ROOT,'site');
const MODELS=Object.freeze([
  ['snapmaker_u1_layout_reference','standalone','U1_exterior_standalone_loaded.glb'],
  ['snapmaker_u1_layout_reference','docked','U1_exterior_docked.glb'],
  ['biqu_pop_station_mini_layout_reference','empty','PopStationMini_empty.glb'],
  ['biqu_pop_station_mini_layout_reference','loaded','PopStationMini_loaded.glb']
].map(Object.freeze));
const fail=message=>Object.assign(new Error(message),{code:'LAYOUT_EQUIPMENT_INPUT_PREPARATION'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(parent,child)=>{const r=path.relative(parent,child);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
const checkAbort=signal=>signal?.throwIfAborted();
const statOrNull=async file=>{try{return await fs.lstat(file)}catch(e){if(e.code==='ENOENT')return null;throw e;}};

/** Synchronous snapshot, including all ten budgets, before filesystem/network work.
 * Catalog injection is for fixtures; CLI preparation always uses checked metadata.
 */
export function layoutEquipmentInputPlan(catalog=checkedCatalog) {
  if(LAYOUT_EQUIPMENT_TRANSFER_BASE!==BASE||MAX_LAYOUT_EQUIPMENT_BYTES!==16*1024*1024)
    throw fail('Transfer contract host or body limit changed; review required');
  function entry(model,expected,kind) {
    if(!model||model.path!==PREFIX+expected)throw fail('Missing or unexpected final equipment registration: '+expected);
    const transfer=(kind==='model'?equipmentTransferIdentity:equipmentPreviewGeometryTransferIdentity)(model);
    if(transfer.baseURL!==BASE||transfer.encoding!=='gzip'||transfer.path!==model.path+'.gz')
      throw fail('Only canonical exact gzip transfers are registered');
    const url=new URL(transfer.path,BASE);
    if(url.href!==BASE+transfer.path||url.origin!=='https://psych0h3ad.github.io'||url.search||url.hash)
      throw fail('Noncanonical equipment URL');
    const pin=Object.freeze({path:model.path,bytes:model.bytes,sha256:model.sha256,
      transfer:Object.freeze({...transfer})});
    return Object.freeze({kind,pin,url:url.href});
  }
  const entries=MODELS.map(([id,variant,name])=>{
    const row=catalog.getLayoutEquipment(id,variant);
    if(row?.id!==id||row.equipmentVariant!==variant)throw fail('Missing equipment variant: '+id+'/'+variant);
    return entry(row.model,name,'model');
  });
  entries.push(entry(catalog.LAYOUT_EQUIPMENT_PREVIEW_MODEL,'U1_preview_geometry.json','preview'));
  const totalBytes=entries.reduce((n,{pin})=>n+pin.bytes+pin.transfer.bytes,0);
  if(!Number.isSafeInteger(totalBytes)||totalBytes>MAX_EQUIPMENT_INPUT_TOTAL_BYTES)
    throw fail('Equipment inputs exceed 64 MiB aggregate byte budget');
  return Object.freeze({entries:Object.freeze(entries),totalBytes,fixtureOnly:catalog!==checkedCatalog});
}

// Reject links/junctions in every existing component, including ancestors of
// not-yet-created destinations. A textual outside-site check alone is insufficient.
async function absolutePrivate(value,label) {
  if(typeof value!=='string'||!path.isAbsolute(value))throw fail(label+' must be an explicit absolute path');
  const result=path.resolve(value);
  if(within(SITE,result)||within(result,SITE))throw fail(label+' must be outside and separate from site');
  let current=path.parse(result).root;
  const parts=result.slice(current.length).split(path.sep).filter(Boolean);
  for(let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]);const stat=await statOrNull(current);
    if(!stat)break;
    if(stat.isSymbolicLink())throw fail(label+' cannot traverse links or junctions');
    if(i<parts.length-1&&!stat.isDirectory())throw fail(label+' parent is not a directory');
    if(i===parts.length-1&&(label==='cache-dir'?!stat.isDirectory():!stat.isFile()))
      throw fail(label+' is not a '+(label==='cache-dir'?'directory':'regular file'));
  }
  return result;
}

async function readBoundedFile(file,pin,signal) {
  checkAbort(signal);
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==pin.bytes)throw fail('Changed cached body; no overwrite: '+file);
  const handle=await fs.open(file,'r');
  try {
    if((await handle.stat()).size!==pin.bytes)throw fail('Changed cached body; no overwrite: '+file);
    const bytes=Buffer.alloc(pin.bytes);let offset=0;
    while(offset<bytes.length) {
      checkAbort(signal);
      const {bytesRead}=await handle.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);
      if(!bytesRead)throw fail('Truncated cached body: '+file);
      offset+=bytesRead;
    }
    const tail=await handle.read(Buffer.alloc(1),0,1,offset);
    if(tail.bytesRead)throw fail('Oversize cached body: '+file);
    if(pin.sha256!==undefined)await verifyEquipmentModelBytes(bytes,pin,{signal});
    return bytes;
  } finally {await handle.close();}
}

function capture(total,signal) {
  const bytes=new Uint8Array(total);let count=0;
  return {bytes,wrap:stream=>stream.pipeThrough(new TransformStream({
    transform(chunk,controller) {
      checkAbort(signal);
      if(!(chunk instanceof Uint8Array)||chunk.byteLength>total-count)throw fail('Captured body exceeds pinned byte budget');
      bytes.set(chunk,count);count+=chunk.byteLength;controller.enqueue(chunk);
    },
    flush() {checkAbort(signal);if(count!==total)throw fail('Truncated captured body');}
  }),{signal})};
}

// Bound even an injected fetch that ignores its signal, and cancel a late body.
function fetchWithSignal(fetchImpl,url,options) {
  const {signal}=options;checkAbort(signal);
  return new Promise((resolve,reject)=>{
    const aborted=()=>{signal.removeEventListener('abort',aborted);reject(signal.reason);};
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve().then(()=>{checkAbort(signal);return fetchImpl(url,options);}).then(response=>{
      signal.removeEventListener('abort',aborted);
      if(signal.aborted){void Promise.resolve(response.body?.cancel()).catch(()=>{});reject(signal.reason);}
      else resolve(response);
    },error=>{signal.removeEventListener('abort',aborted);reject(error);});
  });
}

async function obtainPair(entry,fetchImpl,signal) {
  const {pin,kind,url:expected}=entry,wire=capture(pin.transfer.bytes,signal);
  const decoded=kind==='preview'?capture(pin.bytes,signal):null;
  const options={signal,fetchImpl:async(url,request)=>{
    if(url.href!==expected||request.redirect!=='error'||request.credentials!=='omit'||request.referrerPolicy!=='no-referrer')
      throw fail('Unexpected equipment request or transport policy');
    const response=await fetchWithSignal(fetchImpl,url,request);let body;
    return {ok:response.ok,status:response.status,url:response.url,type:response.type,redirected:response.redirected,
      headers:response.headers,get body(){
        return body??=(response.body?.getReader?wire.wrap(response.body):response.body);
      }};
  }};
  let raw;
  if(kind==='preview') {
    // Tap the existing decoder instead of serializing its parsed JSON result.
    options.Decoder=function(format) {
      const decoder=new DecompressionStream(format);
      return {writable:decoder.writable,readable:decoded.wrap(decoder.readable)};
    };
    await downloadEquipmentPreviewGeometry(pin,options);raw=decoded.bytes;
  } else raw=new Uint8Array(await downloadEquipmentModel(pin,options));
  // Authenticate the saved copies too; no recompression or reconstructed JSON.
  await verifyEquipmentModelBytes(wire.bytes,pin.transfer,{signal});
  await verifyEquipmentModelBytes(raw,pin,{signal});
  return {wire:wire.bytes,raw};
}

async function checkCacheTree(directory,entries,signal) {
  const allowed=new Map([['',new Set()]]);
  for(const {pin} of entries)for(const name of [pin.path,pin.transfer.path]) {
    const parts=name.split('/');
    for(let i=0;i<parts.length;i++) {
      const parent=parts.slice(0,i).join('/');
      if(!allowed.has(parent))allowed.set(parent,new Set());
      allowed.get(parent).add(parts[i]);
    }
  }
  async function walk(relative) {
    checkAbort(signal);
    const file=path.join(directory,relative),stat=await fs.lstat(file);
    if(stat.isSymbolicLink())throw fail('Linked cache body; no overwrite: '+file);
    if(allowed.has(relative)) {
      if(!stat.isDirectory())throw fail('Cache directory changed; no overwrite: '+file);
      const expected=allowed.get(relative),seen=new Set();
      const dir=await fs.opendir(file);
      for await(const item of dir) {
        if(!expected.has(item.name))throw fail('Unexpected cache entry; no overwrite: '+item.name);
        seen.add(item.name);await walk(relative?relative+'/'+item.name:item.name);
      }
      if(seen.size!==expected.size)throw fail('Incomplete existing cache; no overwrite: '+file);
    } else if(!stat.isFile())throw fail('Non-file cache body; no overwrite: '+file);
  }
  await walk('');
}

async function atomicJSON(file,value,signal) {
  checkAbort(signal);await fs.mkdir(path.dirname(file),{recursive:true});
  const existing=await statOrNull(file);
  if(existing&&(!existing.isFile()||existing.isSymbolicLink()))throw fail('Output is not a regular private file: '+file);
  const temporary=path.join(path.dirname(file),'.'+path.basename(file)+'.'+randomUUID()+'.tmp');
  try {
    await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600,signal});
    checkAbort(signal);await fs.rename(temporary,file);
  } finally {await fs.rm(temporary,{force:true});}
}

/** All downloads sequential. The dedicated complete ten-file cache directory is
 * published by one rename only after every pair passes. Existing incomplete or
 * altered caches fail closed; choose a new cache directory for a new catalog.
 */
export async function prepareLayoutEquipmentInputs({cacheDir,mapPath,reportPath,
  timeoutMs=60000,signal:callerSignal,fetchImpl=globalThis.fetch,catalog=checkedCatalog}={}) {
  const plan=layoutEquipmentInputPlan(catalog);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw fail('timeout-ms must be between 1 and 120000');
  if(typeof fetchImpl!=='function')throw fail('A fetch implementation is required');
  const controller=new AbortController();
  const signal=callerSignal?AbortSignal.any([callerSignal,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(new DOMException('Equipment preparation timed out','TimeoutError')),timeoutMs);
  let staging,lockDir;
  try {
    checkAbort(signal);
    cacheDir=await absolutePrivate(cacheDir,'cache-dir');
    mapPath=await absolutePrivate(mapPath,'map');reportPath=await absolutePrivate(reportPath,'report');
    if(within(cacheDir,mapPath)||within(cacheDir,reportPath)||within(mapPath,cacheDir)||within(reportPath,cacheDir)||
      within(mapPath,reportPath)||within(reportPath,mapPath))throw fail('Cache, map and report destinations must be separate');
    // Preparers sharing this private cache serialize by exclusive reservation.
    // Refuse an existing/stale reservation rather than removing another job's lock.
    await fs.mkdir(cacheDir,{recursive:true});
    const reservation=path.join(cacheDir,'.layout-equipment-input-preparation.lock');
    try{await fs.mkdir(reservation,{mode:0o700});lockDir=reservation;}
    catch(error){if(error.code==='EEXIST')throw fail('Equipment cache is reserved by another preparation');throw error;}
    const payloadDir=path.join(cacheDir,CACHE_NAME),existing=await statOrNull(payloadDir);
    // Validate all existing files before any possible request or output write.
    if(existing)await checkCacheTree(payloadDir,plan.entries,signal);
    else {
      staging=await fs.mkdtemp(path.join(cacheDir,'.layout-equipment-stage-'));
    }
    let requests=0;
    for(const entry of plan.entries) {
      checkAbort(signal);const {pin}=entry;
      const fetchBody=existing?async url=>{
        if(url.href!==entry.url)throw fail('Unexpected cached request');
        const file=path.join(payloadDir,pin.transfer.path);
        const stat=await fs.lstat(file);
        if(!stat.isFile()||stat.size!==pin.transfer.bytes)throw fail('Changed cached transport; no overwrite: '+file);
        return {ok:true,status:200,url:url.href,redirected:false,
          headers:new Headers({'content-length':String(stat.size)}),
          body:Readable.toWeb(createReadStream(file,{highWaterMark:65536,signal}))};
      }:async(url,options)=>{requests++;return fetchImpl(url,options);};
      const {raw,wire}=await obtainPair(entry,fetchBody,signal);
      if(existing) {
        const saved=await readBoundedFile(path.join(payloadDir,pin.path),pin,signal);
        if(!Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength).equals(saved))throw fail('Decoded cache differs from transport');
      } else {
        for(const [name,bytes] of [[pin.path,raw],[pin.transfer.path,wire]]) {
          checkAbort(signal);const file=path.join(staging,name);
          await fs.mkdir(path.dirname(file),{recursive:true});
          await fs.writeFile(file,bytes,{flag:'wx',mode:0o600,signal});
        }
      }
    }
    checkAbort(signal);
    if(staging) {
      // Never replace an existing generation, including a concurrent publisher.
      if(await statOrNull(payloadDir))throw fail('Cache appeared during preparation; no overwrite');
      await fs.rename(staging,payloadDir);staging=undefined;
    }
    const mapping={files:Object.fromEntries(plan.entries.filter(e=>e.kind==='model').map(({pin})=>[pin.path,path.join(payloadDir,pin.path)]))};
    const sourceInputs={};
    for(const relative of ['site/layout/layout-equipment.mjs','site/layout/layout-equipment-transfer.mjs','scripts/prepare_layout_equipment_inputs.mjs']) {
      const file=path.join(ROOT,relative),stat=await fs.lstat(file);
      if(!stat.isFile()||stat.size<1||stat.size>MAX_LAYOUT_EQUIPMENT_BYTES)throw fail('Source identity exceeds body budget');
      sourceInputs[relative]=sha(await readBoundedFile(file,{bytes:stat.size},signal));
    }
    const report={schema:'layout-equipment-input-preparation-v1',passed:true,fixtureOnly:plan.fixtureOnly,
      actualSourceGateRun:false,scope:'Exact transport and decoded identities only; no geometry, mounting, visual or release coverage result.',
      cacheDir,payloadDir,preparedDir:path.join(payloadDir,PREFIX),cache:existing?'hit':'download',requests,
      mapPath,sourceInputs,totalPinnedBytes:plan.totalBytes,
      limits:{perBodyBytes:MAX_LAYOUT_EQUIPMENT_BYTES,aggregateBytes:MAX_EQUIPMENT_INPUT_TOTAL_BYTES,concurrency:1,timeoutMs},
      assets:plan.entries.map(({kind,pin})=>({kind,...pin,decodedFile:path.join(payloadDir,pin.path),encodedFile:path.join(payloadDir,pin.transfer.path)})),
      modelMapEntries:4,cachedBodyCount:10,metadataCopied:false,noPublication:true};
    await atomicJSON(mapPath,mapping,signal);await atomicJSON(reportPath,report,signal);
    return {mapping,report};
  } finally {
    clearTimeout(timer);
    try {
      if(staging) {
        if(!within(cacheDir,staging)||!path.basename(staging).startsWith('.layout-equipment-stage-'))throw fail('Unsafe staging cleanup');
        await fs.rm(staging,{recursive:true,force:true});
      }
    } finally {
      if(lockDir)await fs.rmdir(lockDir); // Exact directory created by this call; never recursive.
    }
  }
}

export async function main(argv=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<argv.length;i+=2) {
    const key=argv[i],value=argv[i+1];
    if(!['--cache-dir','--map','--report','--timeout-ms'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(options,key))
      throw fail('Usage: --cache-dir <absolute dir> --map <absolute file> --report <absolute file> [--timeout-ms 60000]');
    options[key]=value;
  }
  if(['--cache-dir','--map','--report'].some(key=>!options[key]))throw fail('Explicit cache-dir, map and private report are required');
  if(options['--timeout-ms']!==undefined&&!/^[1-9][0-9]*$/.test(options['--timeout-ms']))throw fail('Invalid timeout-ms');
  const {report}=await prepareLayoutEquipmentInputs({cacheDir:options['--cache-dir'],mapPath:options['--map'],reportPath:options['--report'],
    ...(options['--timeout-ms']?{timeoutMs:Number(options['--timeout-ms'])}:{})});
  console.log(JSON.stringify({passed:true,cache:report.cache,requests:report.requests,models:4,bodies:10,map:report.mapPath,report:options['--report']}));
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{console.error(error.code??error.name,error.message);process.exitCode=1;});

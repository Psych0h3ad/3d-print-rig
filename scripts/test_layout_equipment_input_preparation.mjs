// Synthetic fixtures ONLY. No actual-source gate, asset search or live requests.
// One process, sequential cases; no child jobs. Run with UV_THREADPOOL_SIZE=1:
// node --max-old-space-size=224 --max-semi-space-size=4 --v8-pool-size=1
//   scripts/test_layout_equipment_input_preparation.mjs [--report <absolute file>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import v8 from 'node:v8';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceURL=new URL('./prepare_layout_equipment_inputs.mjs',import.meta.url);
const checks=[],originalFetch=globalThis.fetch;
let liveRequests=0,root,preparer,production;
globalThis.fetch=async()=>{liveRequests++;throw new Error('Live network forbidden in fixture suite');};
const reportArg=process.argv.slice(2);
assert(reportArg.length===0||(reportArg.length===2&&reportArg[0]==='--report'&&path.isAbsolute(reportArg[1])),
  'Usage: [--report <absolute private file>]');
const reportPath=reportArg[1];
const run=async(name,fn)=>{
  try{await fn();checks.push({name,passed:true});console.log('PASS '+name);}
  catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+' '+error.message);}
};
const mustFail=(job,pattern)=>assert.rejects(job,pattern);
const integrity=e=>['LAYOUT_EQUIPMENT_INPUT_PREPARATION','LAYOUT_EQUIPMENT_INTEGRITY'].includes(e.code);
const absent=async file=>assert.equal(await fsp.stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false);
const json=async file=>JSON.parse(await fsp.readFile(file,'utf8'));

function tinyGLB(index) {
  let text=JSON.stringify({asset:{version:'2.0',generator:'SYNTHETIC INPUT PREPARATION FIXTURE '+index},scenes:[{nodes:[]}],scene:0});
  text=text.padEnd(Math.ceil(Buffer.byteLength(text)/4)*4,' ');
  const body=Buffer.from(text),header=Buffer.alloc(20);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+body.length,8);
  header.writeUInt32LE(body.length,12);header.writeUInt32LE(0x4e4f534a,16);
  return Buffer.concat([header,body]);
}

function fixture() {
  const raw=production.entries.map((e,i)=>e.kind==='model'?tinyGLB(i):Buffer.from(' { "fixtureOnly": true, "label": "日本語", "parts": [] }\n'));
  const wire=raw.map((bytes,i)=>{
    const encoded=gzipSync(bytes,{level:1});encoded.writeUInt32LE(123456+i,4);return encoded;
  });
  const pins=production.entries.map(({pin},i)=>({...pin,bytes:raw[i].length,sha256:sha(raw[i]),
    transfer:{...pin.transfer,bytes:wire[i].length,sha256:sha(wire[i])}}));
  const registrations=[['snapmaker_u1_layout_reference','standalone'],['snapmaker_u1_layout_reference','docked'],
    ['biqu_pop_station_mini_layout_reference','empty'],['biqu_pop_station_mini_layout_reference','loaded']];
  const catalog={getLayoutEquipment:(id,variant)=>{
    const index=registrations.findIndex(([a,b])=>id===a&&variant===b);
    return index<0?null:{id,equipmentVariant:variant,model:pins[index]};
  },LAYOUT_EQUIPMENT_PREVIEW_MODEL:pins[4]};
  function replace(index,bytes) {
    raw[index]=bytes;wire[index]=gzipSync(bytes);pins[index].bytes=bytes.length;pins[index].sha256=sha(bytes);
    pins[index].transfer.bytes=wire[index].length;pins[index].transfer.sha256=sha(wire[index]);
  }
  return {raw,wire,pins,catalog,replace};
}

function network(data,{responseChange,bodyChange}={}) {
  const calls=[];let active=0,maxActive=0,cancels=0;
  const fetchImpl=async(url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
    assert(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);
    const index=data.pins.findIndex(pin=>url.href===pin.transfer.baseURL+pin.transfer.path);
    assert(index>=0,'Request escaped exact fixture allowlist');calls.push(url.href);
    active++;maxActive=Math.max(maxActive,active);let completed=false,offset=0;
    const finish=()=>{if(!completed){active--;completed=true;}};
    const bytes=bodyChange?bodyChange(data.wire[index],index):data.wire[index];
    const body=new ReadableStream({
      async pull(controller) {
        await Promise.resolve();
        if(offset===bytes.length){finish();controller.close();return;}
        const end=Math.min(offset+7,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;
      },cancel(){finish();cancels++;}
    });
    const response={ok:true,status:200,url:url.href,redirected:false,type:'basic',
      headers:new Headers({'content-length':String(data.wire[index].length)}),body};
    return responseChange?responseChange(response,index):response;
  };
  return {fetchImpl,calls,get maxActive(){return maxActive;},get cancels(){return cancels;}};
}

let sequence=0;
function destinations() {
  const folder=path.join(root,String(++sequence));
  return {cacheDir:path.join(folder,'cache'),mapPath:path.join(folder,'inputs.json'),reportPath:path.join(folder,'preparation.json')};
}
const prepare=(options,data,net)=>preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,fetchImpl:net.fetchImpl,timeoutMs:3000});
async function assertNoOutput(options) {
  await absent(options.mapPath);await absent(options.reportPath);
  const children=await fsp.readdir(options.cacheDir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  assert.deepEqual(children,[],'Failure left a published cache or staging residue');
}
async function listFiles(directory) {
  const result=[];
  async function walk(relative) {
    for(const row of await fsp.readdir(path.join(directory,relative),{withFileTypes:true})) {
      const name=relative?relative+'/'+row.name:row.name;
      if(row.isDirectory())await walk(name);else result.push(name);
    }
  }
  await walk('');return result.sort();
}

try {
  await run('import-performs-zero-application-filesystem-network-or-output-IO',async()=>{
    let io=0;const restored=[];
    const block=(object,key)=>{const previous=object[key];object[key]=()=>{io++;throw new Error('Import attempted I/O: '+key);};restored.push(()=>{object[key]=previous;});};
    for(const key of ['access','lstat','stat','realpath','open','readFile','writeFile','mkdir','mkdtemp','opendir','readdir','rename','rm'])block(fsp,key);
    for(const key of ['createReadStream','writeFileSync'])block(fs,key);
    // Node 24 may synchronously load ESM source through this public function.
    // Permit only the three module-source reads, and only from Node's loader;
    // application reads of these same files still fail the import test.
    const sourceReads=new Set([sourceURL,new URL('../site/layout/layout-equipment.mjs',import.meta.url),
      new URL('../site/layout/layout-equipment-transfer.mjs',import.meta.url)].map(url=>fileURLToPath(url)));
    const readSource=fs.readFileSync;
    fs.readFileSync=function(file,...args) {
      const name=file instanceof URL?fileURLToPath(file):path.resolve(String(file));
      const caller=new Error().stack.split('\n')[2]??'';
      if(sourceReads.has(name)&&/node:internal\/modules\/(esm|cjs)\//.test(caller))return readSource(file,...args);
      io++;throw new Error('Import attempted application I/O: readFileSync');
    };
    restored.push(()=>{fs.readFileSync=readSource;});
    block(console,'log');block(console,'error');syncBuiltinESMExports();
    try{preparer=await import(sourceURL);assert.equal(io,0);assert.equal(liveRequests,0);}
    finally{for(const restore of restored.reverse())restore();syncBuiltinESMExports();}
  });
  assert(preparer,'Import must succeed before fixture cases');
  production=preparer.layoutEquipmentInputPlan();
  if(reportPath)await fsp.mkdir(path.dirname(reportPath),{recursive:true});
  root=await fsp.mkdtemp(path.join(reportPath?path.dirname(reportPath):os.tmpdir(),'.equipment-input-fixtures-'));

  await run('checked-catalog-exact-five-pairs-ten-pins-and-aggregate-no-actual-bodies',()=>{
    assert.equal(production.fixtureOnly,false);assert.equal(production.entries.length,5);
    assert.deepEqual(production.entries.map(e=>path.basename(e.pin.path)),[
      'U1_exterior_standalone_loaded.glb','U1_exterior_docked.glb','PopStationMini_empty.glb','PopStationMini_loaded.glb','U1_preview_geometry.json']);
    assert.deepEqual(production.entries.map(e=>[e.pin.bytes,e.pin.transfer.bytes]),[
      [5751820,2502888],[5262896,2371206],[1189304,104124],[2116204,199439],[7200460,1714202]]);
    assert.equal(production.totalBytes,production.entries.reduce((n,e)=>n+e.pin.bytes+e.pin.transfer.bytes,0));
    assert(production.totalBytes<preparer.MAX_EQUIPMENT_INPUT_TOTAL_BYTES);assert(Object.isFrozen(production.entries[0].pin.transfer));
    for(const entry of production.entries)assert.equal(entry.url,'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/'+entry.pin.transfer.path);
  });

  let cached;
  await run('sequential-bounded-download-exact-encoded-decoded-output-and-four-model-map',async()=>{
    const data=fixture(),options=destinations(),net=network(data);
    const {mapping,report}=await prepare(options,data,net);cached={data,options,report};
    assert.equal(net.calls.length,5);assert.equal(net.maxActive,1);assert.equal(report.requests,5);
    assert.equal(report.fixtureOnly,true);assert.equal(report.actualSourceGateRun,false);assert.equal(report.metadataCopied,false);
    assert.equal(report.modelMapEntries,4);assert.equal(report.cachedBodyCount,10);
    assert.deepEqual(Object.keys(mapping),['files']);assert.equal(Object.keys(mapping.files).length,4);
    assert.deepEqual(Object.keys(mapping.files),data.pins.slice(0,4).map(p=>p.path));
    assert(Object.values(mapping.files).every(file=>path.isAbsolute(file)&&file.endsWith('.glb')));
    assert(!Object.keys(mapping.files).some(key=>key.endsWith('.gz')||key.endsWith('.json')));
    for(let i=0;i<5;i++) {
      const row=report.assets[i];
      assert.deepEqual(await fsp.readFile(row.decodedFile),data.raw[i]);assert.deepEqual(await fsp.readFile(row.encodedFile),data.wire[i]);
      assert.equal(sha(await fsp.readFile(row.encodedFile)),data.pins[i].transfer.sha256);
    }
    assert.deepEqual(await listFiles(report.payloadDir),data.pins.flatMap(pin=>[pin.path,pin.transfer.path]).sort());
    assert.deepEqual(await json(options.mapPath),mapping);assert.deepEqual(await json(options.reportPath),report);
    assert.equal(report.sourceInputs['scripts/prepare_layout_equipment_inputs.mjs'],sha(await fsp.readFile(sourceURL)));
    assert.notDeepEqual(gzipSync(data.raw[4]),data.wire[4],'Fixture must detect accidental recompression');
    assert.notEqual(JSON.stringify(JSON.parse(data.raw[4])),data.raw[4].toString(),'Fixture must detect JSON reconstruction');
  });

  await run('valid-cache-hit-revalidates-all-pairs-with-zero-fetches-and-stable-map',async()=>{
    const {data,options}=cached;let requests=0;
    const before=await fsp.readFile(options.mapPath);
    const result=await prepare(options,data,{fetchImpl:async()=>{requests++;throw new Error('Cache hit attempted network');}});
    assert.equal(requests,0);assert.equal(result.report.cache,'hit');assert.equal(result.report.requests,0);
    assert.deepEqual(await fsp.readFile(options.mapPath),before);
    assert.deepEqual(await listFiles(result.report.payloadDir),data.pins.flatMap(p=>[p.path,p.transfer.path]).sort());
  });

  await run('malformed-missing-duplicate-and-unregistered-pins-reject-before-IO',async()=>{
    const mutations=[
      d=>d.pins[0].bytes=0,d=>d.pins[0].bytes=-1,d=>d.pins[0].bytes=NaN,d=>d.pins[0].bytes=1.5,
      d=>d.pins[0].bytes=16*1024*1024+1,d=>d.pins[0].sha256='A'.repeat(64),d=>d.pins[0].sha256='0'.repeat(63),
      d=>d.pins[0].transfer.bytes=16*1024*1024+1,d=>d.pins[0].transfer.bytes='20',d=>d.pins[0].transfer.sha256='nope',
      d=>d.pins[0].transfer.encoding='br',d=>delete d.pins[0].transfer,d=>delete d.pins[0].transfer.baseURL,
      d=>d.pins[0].path=d.pins[1].path,d=>d.pins[0].path='layout/assets/equipment/u1-popstation/U1_standalone_loaded.glb',
      d=>d.pins[0].transfer.path+='?query',d=>d.pins[0].path='../escape.glb',
      d=>d.pins[4].path='layout/assets/equipment/u1-exterior/other.json',d=>d.pins[4].transfer.path+='?query',
      d=>d.catalog.getLayoutEquipment=()=>null
    ];
    for(const mutate of mutations) {
      const data=fixture(),options=destinations(),net=network(data);mutate(data);
      await mustFail(()=>prepare(options,data,net),integrity);assert.equal(net.calls.length,0);await assertNoOutput(options);
    }
  });

  await run('canonical-host-rejects-private-alternate-credential-port-path-and-query-URLs',async()=>{
    const bases=['http://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/','https://127.0.0.1/','https://[::1]/',
      'https://192.168.1.1/','https://localhost/','https://invalid.example/','https://user@psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/',
      'https://psych0h3ad.github.io:443/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/','https://psych0h3ad.github.io/other/',
      'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/?x=1'];
    for(const base of bases)for(const index of [0,4]) {
      const data=fixture(),options=destinations(),net=network(data);data.pins[index].transfer.baseURL=base;
      await mustFail(()=>prepare(options,data,net),integrity);assert.equal(net.calls.length,0);await assertNoOutput(options);
    }
  });

  await run('aggregate-budget-rejects-ten-individually-legal-bodies-before-request',async()=>{
    const data=fixture(),options=destinations(),net=network(data);
    for(const pin of data.pins){pin.bytes=16*1024*1024;pin.transfer.bytes=16*1024*1024;}
    await mustFail(()=>prepare(options,data,net),/aggregate byte budget/);assert.equal(net.calls.length,0);await assertNoOutput(options);
  });

  await run('truncation-extra-bytes-and-encoded-hash-mutations-never-install',async()=>{
    for(const kind of ['truncated','oversize','hash'])for(const at of [0,4]) {
      const data=fixture(),options=destinations();
      const net=network(data,{bodyChange:(wire,index)=>{
        if(index!==at)return wire;
        if(kind==='truncated')return wire.subarray(0,-1);
        if(kind==='oversize')return Buffer.concat([wire,Buffer.from([0])]);
        const changed=Buffer.from(wire);changed[10]^=1;return changed;
      }});
      await mustFail(()=>prepare(options,data,net),integrity);await assertNoOutput(options);
      assert.equal(net.calls.length,at+1);assert.equal(net.maxActive,1);
    }
  });

  await run('decoded-size-hash-inflation-and-invalid-gzip-fail-before-publication',async()=>{
    for(const mutation of [
      d=>d.pins[0].bytes++,d=>d.pins[0].bytes--,d=>d.pins[0].sha256='0'.repeat(64),
      d=>d.pins[4].bytes++,d=>d.pins[4].bytes--,d=>d.pins[4].sha256='0'.repeat(64),
      d=>{d.wire[0]=Buffer.alloc(30,1);d.pins[0].transfer.bytes=30;d.pins[0].transfer.sha256=sha(d.wire[0]);},
      d=>{d.wire[4]=gzipSync(Buffer.alloc(1024*1024,32));d.pins[4].transfer.bytes=d.wire[4].length;d.pins[4].transfer.sha256=sha(d.wire[4]);}
    ]) {
      const data=fixture(),options=destinations();mutation(data);const net=network(data);
      await mustFail(()=>prepare(options,data,net));await assertNoOutput(options);
    }
  });

  await run('redirect-response-URL-HTTP-encoding-length-and-status-semantics-match-contract',async()=>{
    const changes=[r=>({...r,redirected:true}),r=>({...r,type:'opaqueredirect'}),r=>({...r,url:'https://127.0.0.1/body'}),
      r=>({...r,url:r.url+'?redirected'}),r=>({...r,url:''}),r=>({...r,ok:false,status:302}),r=>({...r,ok:false,status:404}),
      r=>{r.headers.set('content-encoding','gzip');return r;},r=>{r.headers.set('content-encoding','br');return r;},
      r=>{r.headers.set('content-length','999');return r;},r=>{r.headers.set('content-length','+1');return r;},
      r=>{r.headers.set('content-length','not-a-number');return r;},r=>({...r,body:null})];
    for(const change of changes) {
      const data=fixture(),options=destinations(),net=network(data,{responseChange:change});
      await mustFail(()=>prepare(options,data,net));await assertNoOutput(options);assert.equal(net.calls.length,1);
    }
    const data=fixture(),options=destinations(),net=network(data,{responseChange:r=>{
      r.headers.delete('content-length');r.headers.set('content-encoding',' Identity ');return r;
    }});
    await prepare(options,data,net);assert.equal(net.calls.length,5);
  });

  await run('pinned-preview-invalid-UTF8-or-JSON-is-rejected-with-no-reconstruction',async()=>{
    for(const body of [Buffer.from('{bad'),Buffer.from('globalThis.__fixtureEval=true'),Buffer.from([0x22,0xff,0x22])]) {
      const data=fixture(),options=destinations();data.replace(4,body);const net=network(data);
      await mustFail(()=>prepare(options,data,net),/valid UTF-8 JSON/);await assertNoOutput(options);
    }
    assert.equal(globalThis.__fixtureEval,undefined);
  });

  await run('preabort-midstream-abort-stalled-stream-and-signal-ignoring-fetch-are-bounded',async()=>{
    const data=fixture();
    {
      const options=destinations(),net=network(data),controller=new AbortController();controller.abort();
      await mustFail(()=>preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,fetchImpl:net.fetchImpl,signal:controller.signal}),e=>e.name==='AbortError');
      assert.equal(net.calls.length,0);await assertNoOutput(options);
    }
    {
      const options=destinations(),controller=new AbortController();let canceled=false;
      const fetchImpl=async url=>({ok:true,status:200,url:url.href,headers:new Headers(),
        body:new ReadableStream({pull(c){c.enqueue(data.wire[0].subarray(0,7));controller.abort();},cancel(){canceled=true;}})});
      await mustFail(()=>preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,fetchImpl,signal:controller.signal}),e=>e.name==='AbortError');
      assert(canceled);await assertNoOutput(options);
    }
    {
      const options=destinations();let canceled=false;
      const fetchImpl=async url=>({ok:true,status:200,url:url.href,headers:new Headers(),
        body:new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;}})});
      await mustFail(()=>preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,fetchImpl,timeoutMs:80}),e=>e.name==='TimeoutError');
      assert(canceled);await assertNoOutput(options);
    }
    {
      const options=destinations();let finish,canceled=false;
      const job=preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,timeoutMs:80,
        fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});
      await mustFail(()=>job,e=>e.name==='TimeoutError');await assertNoOutput(options);
      assert(finish);finish({body:new ReadableStream({cancel(){canceled=true;}})});
      await new Promise(resolve=>setImmediate(resolve));assert(canceled);
    }
  });

  await run('failed-preparation-allows-clean-retry-and-snapshots-pins-before-await',async()=>{
    const data=fixture(),options=destinations(),broken=network(data,{bodyChange:wire=>wire.subarray(0,-1)});
    await mustFail(()=>prepare(options,data,broken));await assertNoOutput(options);
    const good=network(data),job=prepare(options,data,good);data.pins[0].bytes=1;data.pins[0].sha256='0'.repeat(64);
    const result=await job;assert.equal(good.calls.length,5);assert.equal(result.report.assets[0].bytes,data.raw[0].length);
  });

  await run('concurrent-preparer-refused-and-late-existing-cache-never-replaced',async()=>{
    {
      const data=fixture(),options=destinations(),net=network(data);let release,entered;
      const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
      const job=prepare(options,data,{fetchImpl:async(url,request)=>{entered();await gate;return net.fetchImpl(url,request);}});
      await started;const second=network(data);
      try{await mustFail(()=>prepare(options,data,second),/reserved by another preparation/);assert.equal(second.calls.length,0);}
      finally{release();await job;}
      assert.equal((await json(options.reportPath)).cachedBodyCount,10);
      assert.deepEqual(await fsp.readdir(options.cacheDir),['layout-equipment-inputs-v1']);
    }
    {
      const data=fixture(),options=destinations(),net=network(data);
      const payload=path.join(options.cacheDir,'layout-equipment-inputs-v1'),sentinel=path.join(payload,'existing.txt');let once=false;
      const fetchImpl=async(url,request)=>{
        if(!once){once=true;await fsp.mkdir(payload);await fsp.writeFile(sentinel,'preserve competing cache');}
        return net.fetchImpl(url,request);
      };
      await mustFail(()=>prepare(options,data,{fetchImpl}),/Cache appeared/);
      assert.equal(await fsp.readFile(sentinel,'utf8'),'preserve competing cache');
      assert.deepEqual(await fsp.readdir(options.cacheDir),['layout-equipment-inputs-v1']);
      await absent(options.mapPath);await absent(options.reportPath);
    }
  });

  await run('changed-raw-or-gzip-cache-is-rejected-without-overwrite-or-network',async()=>{
    for(const field of ['decodedFile','encodedFile'])for(const kind of ['hash','size'])for(const index of [0,4]) {
      const data=fixture(),options=destinations(),result=await prepare(options,data,network(data));
      const file=result.report.assets[index][field],beforeMap=await fsp.readFile(options.mapPath),beforeReport=await fsp.readFile(options.reportPath);
      const old=await fsp.readFile(file),changed=kind==='hash'?Buffer.from(old):old.subarray(0,-1);
      if(kind==='hash')changed[changed.length-1]^=1;await fsp.writeFile(file,changed);
      let calls=0;
      await mustFail(()=>prepare(options,data,{fetchImpl:async()=>{calls++;throw new Error('Invalid cache requested network');}}));
      assert.equal(calls,0);assert.deepEqual(await fsp.readFile(file),changed);
      assert.deepEqual(await fsp.readFile(options.mapPath),beforeMap);assert.deepEqual(await fsp.readFile(options.reportPath),beforeReport);
    }
  });

  await run('incomplete-extra-and-nonfile-caches-fail-closed',async()=>{
    for(const kind of ['missing','extra','directory']) {
      const data=fixture(),options=destinations(),result=await prepare(options,data,network(data));
      const file=result.report.assets[0].encodedFile;
      if(kind==='extra')await fsp.writeFile(path.join(result.report.payloadDir,'unexpected.json'),'{}');
      else {await fsp.unlink(file);if(kind==='directory')await fsp.mkdir(file);}
      let calls=0;await mustFail(()=>prepare(options,data,{fetchImpl:async()=>{calls++;throw new Error('No repair');}}),integrity);
      assert.equal(calls,0);
    }
  });

  await run('relative-site-overlapping-and-linked-destinations-or-caches-are-rejected',async()=>{
    const data=fixture(),site=fileURLToPath(new URL('../site/',import.meta.url));
    for(const change of [o=>o.cacheDir='relative',o=>o.mapPath='relative',o=>o.reportPath='relative',
      o=>o.cacheDir=path.join(site,'private-cache'),o=>o.cacheDir=path.dirname(site),o=>o.mapPath=path.join(site,'inputs.json'),
      o=>o.reportPath=o.mapPath,o=>o.reportPath=path.join(o.cacheDir,'report.json'),o=>o.mapPath=path.dirname(o.cacheDir)]) {
      const options=destinations(),net=network(data);change(options);
      await mustFail(()=>prepare(options,data,net),integrity);assert.equal(net.calls.length,0);
    }
    const target=path.join(root,'link-target'),link=path.join(root,'cache-junction');await fsp.mkdir(target);
    await fsp.symlink(target,link,process.platform==='win32'?'junction':'dir');
    const options=destinations(),net=network(data);options.cacheDir=path.join(link,'new-cache');
    await mustFail(()=>prepare(options,data,net),/links or junctions/);assert.equal(net.calls.length,0);
    const normal=destinations(),result=await prepare(normal,data,network(data));
    const payload=result.report.payloadDir,external=path.join(root,'cache-moved');await fsp.rename(payload,external);
    await fsp.symlink(external,payload,process.platform==='win32'?'junction':'dir');
    await mustFail(()=>prepare(normal,data,net),/Linked cache/);assert.equal(net.calls.length,0);
    for(const key of ['mapPath','reportPath']) {
      const invalid=destinations();await fsp.mkdir(invalid[key],{recursive:true});
      const unused=network(data);await mustFail(()=>prepare(invalid,data,unused),/regular file/);assert.equal(unused.calls.length,0);
      await absent(invalid.cacheDir);
    }
  });

  await run('CLI-required-absolute-arguments-no-override-and-bounded-timeout-validation',async()=>{
    for(const argv of [[],['--help'],['--cache-dir'],['--url','https://127.0.0.1/'],
      ['--cache-dir','a','--map','b','--report','c','--map','d'],
      ['--cache-dir','a','--map','b','--report','c','--timeout-ms','1e6']])
      await mustFail(()=>preparer.main(argv),integrity);
    for(const timeoutMs of [0,-1,1.5,NaN,120001,'60']) {
      const data=fixture(),options=destinations(),net=network(data);
      await mustFail(()=>preparer.prepareLayoutEquipmentInputs({...options,catalog:data.catalog,fetchImpl:net.fetchImpl,timeoutMs}),integrity);
      assert.equal(net.calls.length,0);await assertNoOutput(options);
    }
  });

  await run('one-process-worker-and-memory-envelope-no-live-source-requests',()=>{
    assert.equal(liveRequests,0);assert(v8.getHeapStatistics().heap_size_limit<=256*1024*1024,'Use documented heap flags');
    assert(process.memoryUsage().rss<=256*1024*1024,'Fixture process exceeds 256 MiB RSS');
    assert(process.resourceUsage().maxRSS*1024<=256*1024*1024,'Fixture peak RSS exceeds 256 MiB');
    assert.equal(process.env.UV_THREADPOOL_SIZE,'1','Use UV_THREADPOOL_SIZE=1');
    assert(process.execArgv.includes('--v8-pool-size=1'),'Use --v8-pool-size=1');
  });
} catch(error) {
  checks.push({name:'fixture-suite-setup',passed:false,error:error.stack});console.error(error.stack);
} finally {
  globalThis.fetch=originalFetch;
  if(root) {
    const parent=path.resolve(reportPath?path.dirname(reportPath):os.tmpdir());
    assert.equal(path.dirname(root),parent);assert(path.basename(root).startsWith('.equipment-input-fixtures-'));
    await fsp.rm(root,{recursive:true,force:true});
  }
  const sourceInputs={};
  for(const url of [sourceURL,new URL(import.meta.url),new URL('../site/layout/layout-equipment.mjs',import.meta.url),
    new URL('../site/layout/layout-equipment-transfer.mjs',import.meta.url)])sourceInputs[fileURLToPath(url)]=sha(await fsp.readFile(url));
  const report={schema:'layout-equipment-input-preparation-fixtures-v1',passed:checks.length>0&&checks.every(c=>c.passed),
    fixtureOnly:true,actualSourceGateRun:false,liveNetworkRequests:liveRequests,workerCount:1,
    checks:checks.length,cases:checks,heapLimitBytes:v8.getHeapStatistics().heap_size_limit,memoryUsage:process.memoryUsage(),
    peakRSSBytes:process.resourceUsage().maxRSS*1024,
    availableCPUs:os.availableParallelism(),sourceInputs,
    checkedMetadataPins:production?.entries.map(e=>e.pin),
    scope:'Synthetic tiny GLB/JSON/gzip input preparation contracts only. Checked catalog pins were inspected as metadata; actual bodies were not fetched or audited.',
    remainingParentHooks:[
      'prepare_repository_inputs.py: invoke private equipment preparation separately from tracked metadata preparation; do not copy indexes/licenses from original inputs.',
      'build_approved_site.py: consume exactly four decoded model map entries; resolve and authenticate gzip siblings privately in both actual-asset audits before passing existing exact-transport gates.',
      'test_layout_equipment_preview.mjs default: use preparedDir from the preparation report for five cached pairs; read index, mount, bed outline and license from ordinary tracked prepared metadata.',
      'After host publication, run actual-source preparation and actual-asset gates separately; retain fixtureOnly separation. No inventory, coverage or cache refresh performed here.'
    ],noPublication:true};
  if(reportPath) {
    await fsp.mkdir(path.dirname(reportPath),{recursive:true});
    await fsp.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  console.log(JSON.stringify({passed:report.passed,checks:report.checks,fixtureOnly:true,liveNetworkRequests:liveRequests,report:reportPath??null}));
  if(!report.passed)process.exitCode=1;
}

// One process, sequential jobs, no live network. Exact prepared assets are
// required; missing input is a failure. prepare_repository_inputs.py populates
// the ignored private cache. Metadata/notices always come from prepared site files.
// UV_THREADPOOL_SIZE=1 node --max-old-space-size=224 --max-semi-space-size=4 --v8-pool-size=1
//   scripts/test_layout_equipment_preview.mjs
//   --prepared-dir <prepared u1-exterior folder> [--source-module <frozen module>]
//   [--report <report.json>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import v8 from 'node:v8';
import {fileURLToPath} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';

const options = {};
for(let i=2;i<process.argv.length;i+=2) {
  const key = process.argv[i];
  assert(['--prepared-dir','--source-module','--report'].includes(key),'Unknown argument: '+key);
  assert(process.argv[i+1] && !process.argv[i+1].startsWith('--'),'Missing argument: '+key);
  assert(!Object.hasOwn(options,key),'Duplicate argument: '+key);
  options[key] = path.resolve(process.argv[i+1]);
}
const metadataDir = fileURLToPath(new URL('../site/layout/assets/equipment/u1-exterior/',import.meta.url));
// Keep in sync with scripts/layout_equipment_inputs.py. No fallback to site,
// arbitrary model folders, another checkout or a personal source directory.
const preparedDir = options['--prepared-dir'] ?? fileURLToPath(new URL('../__pycache__/layout-equipment-inputs/cache/layout-equipment-inputs-v1/layout/assets/equipment/u1-exterior/',import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const checks = [], assets = [];
const test = async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const bad = {code:'LAYOUT_EQUIPMENT_PREVIEW_INTEGRITY'};
const transportBad = {code:'LAYOUT_EQUIPMENT_INTEGRITY'};
const canceled = error => error.name === 'AbortError';
const tick = ()=>new Promise(resolve=>setImmediate(resolve));
const deferred = ()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const previewURL = new URL('../site/layout/layout-equipment-preview.mjs',import.meta.url);
// Follow the same module URL as the production preparer, including its cache
// identity. A second unversioned import would create a different preview cache.
const equipmentSpecifier=fs.readFileSync(previewURL,'utf8').match(/from ['"](.\/layout-equipment\.mjs(?:\?v=[a-f0-9]+)?)['"]/);
assert(equipmentSpecifier,'Production preview metadata import missing');
const equipmentURL = new URL(equipmentSpecifier[1],previewURL);
const transferURL = new URL('../site/layout/layout-equipment-transfer.mjs',import.meta.url);
const originalFetch = globalThis.fetch;
let unexpectedNetwork = 0;
globalThis.fetch = async()=>{unexpectedNetwork++;throw new Error('Unexpected live network');};

function inspectGLB(raw,gltf) {
  const header=20+raw.readUInt32LE(12),length=raw.readUInt32LE(header);
  assert.equal(raw.readUInt32LE(header+4),0x004e4942);
  assert.equal(header+8+length,raw.length);
  assert.equal(gltf.buffers.length,1);assert.equal(gltf.buffers[0].uri,undefined);
  assert(gltf.buffers[0].byteLength<=length);
  const binary=raw.subarray(header+8,header+8+gltf.buffers[0].byteLength);
  function accessor(index,integer=false) {
    assert(Number.isSafeInteger(index));const a=gltf.accessors[index];assert(a);
    assert.equal(a.sparse,undefined);assert(!a.normalized);
    assert.equal(a.componentType,integer?5125:5126);assert.equal(a.type,integer?'SCALAR':'VEC3');
    const view=gltf.bufferViews[a.bufferView];assert(view);assert.equal(view.buffer,0);
    const width=integer?1:3,stride=view.byteStride??width*4,start=(view.byteOffset??0)+(a.byteOffset??0);
    assert(Number.isSafeInteger(a.count)&&a.count>0);assert(stride>=width*4&&stride%4===0);
    const end=start+(a.count-1)*stride+width*4;
    assert(start>=0&&end<=binary.length&&end<=(view.byteOffset??0)+view.byteLength);
    const read=(i,k=0)=>integer?binary.readUInt32LE(start+i*stride+k*4):binary.readFloatLE(start+i*stride+k*4);
    return {count:a.count,read};
  }
  let primitives=0,vertices=0,triangles=0,normalMaxError=0;
  for(const mesh of gltf.meshes) for(const primitive of mesh.primitives) {
    assert.equal(primitive.mode??4,4);const p=accessor(primitive.attributes.POSITION),n=accessor(primitive.attributes.NORMAL);
    assert.equal(p.count,n.count);
    for(let i=0;i<p.count;i++) {
      for(let k=0;k<3;k++) assert(Number.isFinite(p.read(i,k))&&Number.isFinite(n.read(i,k)));
      const error=Math.abs(Math.hypot(n.read(i,0),n.read(i,1),n.read(i,2))-1);
      assert(error<=1e-4);normalMaxError=Math.max(normalMaxError,error);
    }
    if(primitive.indices!==undefined) {
      const ix=accessor(primitive.indices,true);assert.equal(ix.count%3,0);
      for(let i=0;i<ix.count;i++)assert(ix.read(i)<p.count);
      triangles+=ix.count/3;
    } else {assert.equal(p.count%3,0);triangles+=p.count/3;}
    assert(gltf.materials[primitive.material]);primitives++;vertices+=p.count;
  }
  for(const material of gltf.materials) {
    const pbr=material.pbrMetallicRoughness??{};
    for(const value of [...(pbr.baseColorFactor??[1,1,1,1]),pbr.metallicFactor??1,pbr.roughnessFactor??1])
      assert(Number.isFinite(value)&&value>=0&&value<=1);
  }
  return {primitives,vertices,triangles,normalMaxError,materials:gltf.materials.length};
}

try {
  const equipment = await import(equipmentURL);
  const preview = await import(previewURL);
  const transport = await import(transferURL);
  const {LAYOUT_EQUIPMENT_PREVIEW:descriptor,LAYOUT_EQUIPMENT_PREVIEW_MODEL:model,
    createLayoutEquipmentPreviewCache,getLayoutEquipment,resolveLayoutEquipment,
    getLayoutEquipmentPreviewGeometry,isLayoutEquipmentPreviewPrepared} = equipment;
  const {createLayoutEquipmentPreviewPreparer,prepareLayoutEquipmentPreview} = preview;
  const ids = Object.keys(descriptor.geometry), first = ids[0];
  const U1 = 'snapmaker_u1_layout_reference', POP = 'biqu_pop_station_mini_layout_reference';
  const combinations = [[U1,'standalone'],[U1,'docked'],[POP,'empty'],[POP,'loaded']];
  const before = equipment.equipmentRows[0];

  await test('inert-import-metadata-without-vertex-literals-or-network',()=>{
    assert.equal(unexpectedNetwork,0);assert.equal(isLayoutEquipmentPreviewPrepared(),false);
    assert.equal(getLayoutEquipmentPreviewGeometry(first),null);
    assert.equal(getLayoutEquipmentPreviewGeometry('__proto__'),null);
    assert.equal(ids.length,22);assert(Object.isFrozen(descriptor.geometry));
    assert.deepEqual([descriptor.kind,descriptor.units,descriptor.up,descriptor.front,descriptor.rootPivotM],
      ['layout-preview-geometry','m','+Y','+Z',[0,0,0]]);
    const source = fs.readFileSync(equipmentURL,'utf8');
    assert(source.length<100000);assert.doesNotMatch(source,/const U1_GEOMETRIES|"positionsM"\s*:\s*\[|"normals"\s*:\s*\[|"indices"\s*:\s*\[/);
    const used = new Set();
    for(const [id,variant] of combinations) {
      const row = getLayoutEquipment(id,variant);
      assert.equal(row.manufacturerCAD,false);
      if(id===U1) assert.equal(Object.hasOwn(row,'publicSourcesOnly'),false);
      for(const part of row.proxy.parts.filter(p=>p.shape==='mesh')) {
        used.add(part.geometryId);assert.equal(part.positionsM,undefined);
        assert(Object.hasOwn(descriptor.geometry,part.geometryId));
      }
      assert.equal(row.model.transfer.baseURL,transport.LAYOUT_EQUIPMENT_TRANSFER_BASE);
      assert.deepEqual(row.fullScene.normalizationFrame.rootPivotM,[0,0,0]);
    }
    assert.deepEqual([...used].sort(),[...ids].sort());
    const saved = {...before,publicSourcesOnly:true,privateSourceDerived:false,purchasedSourceDerived:false};
    const resolved = resolveLayoutEquipment(saved,'docked');
    for(const flag of ['publicSourcesOnly','privateSourceDerived','purchasedSourceDerived']) assert(!Object.hasOwn(resolved,flag));
    for(const key of ['__proto__','constructor','toString','unknown'])
      assert.throws(()=>getLayoutEquipment(U1,key),{code:'LAYOUT_UNKNOWN_EQUIPMENT_VARIANT'});
    const unknown = {id:'unknown'};assert.equal(resolveLayoutEquipment(unknown),unknown);
  });

  // The folder is explicitly bounded: no scan, purchase, provenance or other
  // directories are searched. Test only the prepared release copies.
  const readExact = (directory,name) => {
    const file = path.join(directory,name);
    assert(fs.existsSync(file),'Required prepared asset missing: '+file);
    return fs.readFileSync(file);
  };
  const read = name => readExact(preparedDir,name);
  const readMetadata = name => readExact(metadataDir,name);
  let body, gzip, data;
  await test('exact-prepared-json-gzip-index-and-neutral-notices',()=>{
    body = read('U1_preview_geometry.json');gzip = read('U1_preview_geometry.json.gz');
    assert.equal(body.length,4776355);assert.equal(sha(body),'3963e49ff68e19254a2c38ddddf56f411c8885886b2ce425ad9c84d904203b38');
    assert.equal(gzip.length,1530121);assert.equal(sha(gzip),'80789adad7ef30467d91943c45987c48538e024ace7d17a687a663abd2902b6d');
    assert.deepEqual(gunzipSync(gzip),body);
    assert.deepEqual(JSON.parse(readMetadata('U1_preview_geometry_index.json')),descriptor);
    assert.deepEqual(JSON.parse(readMetadata('MOUNT_SPEC.json')),getLayoutEquipment(POP).mount);
    const outline = JSON.parse(readMetadata('U1_BED_OUTLINE.json'));
    assert.equal(outline.schema,'snapmaker-u1-official-slicer-bed-outline-v1');
    const notice = JSON.parse(readMetadata('U1_exterior_notices.json')).notices[0];
    assert.equal(notice.name,'Snapmaker_OrcaSlicer_LICENSE.txt');
    assert.equal(notice.sha256,outline.repository_license.sha256);
    assert.equal(notice.sha256,'57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6');
    assert.equal(notice.sha256,sha(Buffer.from(notice.text)));
    data = JSON.parse(body);
    assert.deepEqual(Object.keys(data).sort(),[...ids].sort());
    assets.push({name:'U1_preview_geometry.json',bytes:body.length,sha256:sha(body),gzipBytes:gzip.length,gzipSHA256:sha(gzip)});
  });

  const response = (url,bytes,extra={})=>({ok:true,status:200,url:url.href,redirected:false,
    headers:new Headers({'content-length':String(bytes.length)}),body:new Blob([bytes]).stream(),...extra});
  const fetchPrepared = async url => {
    assert.equal(url.href,transport.LAYOUT_EQUIPMENT_TRANSFER_BASE+model.transfer.path);
    return response(url,gzip);
  };
  await test('fixed-host-real-preview-transport-decode-and-progress',async()=>{
    const events = [];
    const actual = await transport.downloadEquipmentPreviewGeometry(model,{fetchImpl:fetchPrepared,onProgress:e=>events.push(e)});
    assert.deepEqual(actual,data);
    assert(events.some(e=>e.phase==='download'));assert(events.some(e=>e.phase==='decode'));
    const pending = createLayoutEquipmentPreviewPreparer({download:(pin,opts)=>{
      assert.equal(pin,model);return transport.downloadEquipmentPreviewGeometry(pin,{...opts,fetchImpl:fetchPrepared});
    }});
    assert.equal(await pending.prepareLayoutEquipmentPreview(),descriptor);assert(pending.isPrepared());
    for(const id of ids) assert.deepEqual(pending.getGeometry(id),data[id]);
  });

  await test('all-four-final-glbs-decoded-gzip-pins-and-common-root',async()=>{
    const expected = [
      [3631984,'f68bf8498a9a2d3114a6f8fff7af45c495208ac5098616426f3bc835e9089bd7'],
      [3143064,'de89610a4bdfb1b108498f345effe92109022d641d882c5ff113f01f57acc369'],
      [1189304,'23849c9c59f8dafccedcfb3d3557e521ea784a5be27f29ec25943acf348a909a'],
      [2116204,'1e9c8b3da39e9056c89ffd47e313a7ab87f84c822f38d68ff6c6e154c5c8f76f']
    ];
    for(let i=0;i<combinations.length;i++) {
      const [id,variant] = combinations[i], row = getLayoutEquipment(id,variant), pin = row.model;
      assert.deepEqual([pin.bytes,pin.sha256],expected[i]);
      const raw = read(path.basename(pin.path)), wire = read(path.basename(pin.transfer.path));
      assert.equal(raw.length,pin.bytes);assert.equal(sha(raw),pin.sha256);
      assert.equal(wire.length,pin.transfer.bytes);assert.equal(sha(wire),pin.transfer.sha256);
      const decoded = await transport.downloadEquipmentModel(pin,{fetchImpl:async url=>{
        assert.equal(url.href,transport.LAYOUT_EQUIPMENT_TRANSFER_BASE+pin.transfer.path);return response(url,wire);
      }});
      assert.deepEqual(Buffer.from(decoded),raw);
      assert.equal(raw.toString('ascii',0,4),'glTF');assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
      assert.equal(raw.readUInt32LE(16),0x4e4f534a);
      const gltf = JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString('utf8'));
      assert.equal(gltf.asset.version,'2.0');
      for(const nodeIndex of gltf.scenes[gltf.scene??0].nodes) {
        const node = gltf.nodes[nodeIndex];
        assert.deepEqual(node.translation??[0,0,0],[0,0,0]);
        assert.deepEqual(node.rotation??[0,0,0,1],[0,0,0,1]);
        assert.deepEqual(node.scale??[1,1,1],[1,1,1]);
        assert.deepEqual(node.matrix??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
      }
      const geometry=inspectGLB(raw,gltf);
      assets.push({id,variant,name:path.basename(pin.path),bytes:pin.bytes,sha256:pin.sha256,
        gzipBytes:pin.transfer.bytes,gzipSHA256:pin.transfer.sha256,rootTransform:'identity',geometry});
    }
  });

  await test('strict-schema-unknown-prototype-accessor-and-array-fields',async()=>{
    const malformed = [null,[],{},'code',42,JSON.parse('{"__proto__":{}}'),
      Object.assign(Object.create({inherited:true}),data)];
    for(const value of malformed) await assert.rejects(createLayoutEquipmentPreviewCache().install(value),bad);
    const cases = [
      d=>delete d[ids.at(-1)], d=>d.extra={}, d=>d.schema='v2', d=>d.rootPivotM=[1,0,0],
      d=>Object.defineProperty(d,'__proto__',{value:{},enumerable:true}),
      d=>d[first].unknown=[], d=>d[first].constructor={}, d=>d[first].prototype={},
      d=>d[first].positionsM.extra=1, d=>d[first].indices[Symbol('extra')]=1,
      d=>delete d[first].positionsM[0],
      d=>Object.defineProperty(d[first].normals,'0',{get(){throw new Error('Getter executed');},enumerable:true}),
      d=>Object.setPrototypeOf(d[first],{positionsM:[]}),
      d=>Object.setPrototypeOf(d[first].indices,Object.create(Array.prototype)),
      d=>Object.defineProperty(d,first,{get(){throw new Error('Getter executed');},enumerable:true})
    ];
    for(const mutate of cases) {
      const input = structuredClone(data);mutate(input);
      const cache = createLayoutEquipmentPreviewCache();await assert.rejects(cache.install(input),bad);
      assert(!cache.isPrepared());assert.equal(cache.getGeometry(first),null);
    }
    assert.equal({}.polluted,undefined);
  });

  await test('dimensions-finite-unit-normals-and-index-bounds',async()=>{
    const cases = [
      d=>d[first].positionsM.pop(),d=>d[first].normals.push(0),d=>d[first].indices.pop(),
      d=>d[first].positionsM[0]=NaN,d=>d[first].positionsM[0]=Infinity,d=>d[first].positionsM[0]=Number.MAX_VALUE,
      d=>d[first].normals[0]='0',d=>d[first].normals[0]=undefined,d=>d[first].normals.fill(0,0,3),
      d=>d[first].normals[0]=2,d=>d[first].indices[0]=-1,d=>d[first].indices[0]=.5,
      d=>d[first].indices[0]=descriptor.geometry[first].vertices,d=>d[first].indices[0]=2**32,
      d=>d[first].indices[0]=NaN,d=>d[first].positionsM=new Float32Array(d[first].positionsM)
    ];
    for(const mutate of cases) {
      const input = structuredClone(data);mutate(input);
      await assert.rejects(createLayoutEquipmentPreviewCache().install(input),bad);
    }
  });

  await test('all-22-exact-F32-U32-receipts-reject-position-normal-index-mutations',async()=>{
    // Mutate each geometry independently; all three attribute families must
    // fail a receipt check while still passing dimensions/normal/index bounds.
    for(const id of ids) for(const field of ['positionsM','normals','indices']) {
      const input = {...data,[id]:{...data[id],[field]:data[id][field].slice()}};
      if(field==='positionsM') input[id][field][0]+=.001;
      else if(field==='normals') {
        const n=input[id][field];for(let i=0;i<3;i++) n[i]*=-1;
      } else input[id][field][0]=(input[id][field][0]+1)%descriptor.geometry[id].vertices;
      await assert.rejects(createLayoutEquipmentPreviewCache().install(input),/differs from prepared receipt/);
    }
  });

  await test('atomic-install-input-snapshot-and-immutable-cache',async()=>{
    const cache=createLayoutEquipmentPreviewCache(),input=structuredClone(data);
    const pending=cache.install(input);input[first].positionsM[0]+=1;delete input[ids.at(-1)];
    assert.equal(cache.isPrepared(),false);assert.equal(cache.getGeometry(first),null);
    const installed=await pending;
    assert(cache.isPrepared());assert(Object.isFrozen(installed));
    for(const id of ids) {
      const part=cache.getGeometry(id);assert.deepEqual(part,data[id]);
      for(const field of ['positionsM','normals','indices']) {
        assert(Object.isFrozen(part[field]));assert.notEqual(part[field],data[id][field]);
        assert.throws(()=>{part[field][0]=4;},TypeError);
      }
    }
    assert.equal(cache.getGeometry('constructor'),null);
    await assert.rejects(cache.install({}),bad);assert.equal(cache.getGeometry(first),installed[first]);
    const c=new AbortController(),other=createLayoutEquipmentPreviewCache();
    const interrupted=other.install(data,{signal:c.signal});c.abort();
    await assert.rejects(interrupted,canceled);assert(!other.isPrepared());
    await other.install(data);assert(other.isPrepared());
  });

  await test('concurrent-callers-one-download-cached-preparation-and-progress-isolation',async()=>{
    let calls=0;const gate=deferred(),entered=deferred(),events=[[],[]];
    const prep=createLayoutEquipmentPreviewPreparer({download:async(pin,{signal,onProgress})=>{
      calls++;assert.equal(pin,model);assert(!signal.aborted);entered.resolve();
      onProgress({phase:'download',percent:10});await gate.promise;return data;
    }});
    const a=prep.prepareLayoutEquipmentPreview({onProgress:e=>events[0].push(e)});await entered.promise;
    const b=prep.prepareLayoutEquipmentPreview({onProgress:e=>events[1].push(e)});
    gate.resolve();assert.equal(await a,descriptor);assert.equal(await b,descriptor);assert.equal(calls,1);
    assert.equal(events[1][0].phase,'download');assert(Object.isFrozen(events[1][0]));
    assert.equal(events[0].at(-1).phase,'ready');assert.equal(events[1].at(-1).phase,'ready');
    assert.equal(await prep.prepareLayoutEquipmentPreview(),descriptor);assert.equal(calls,1);
    const c=new AbortController();c.abort();
    await assert.rejects(prep.prepareLayoutEquipmentPreview({signal:c.signal}),canceled);assert.equal(calls,1);
  });

  await test('one-abort-or-throwing-progress-consumer-does-not-poison-another',async()=>{
    const gate=deferred(),entered=deferred(),c=new AbortController(),seen=[];let inner;
    const prep=createLayoutEquipmentPreviewPreparer({download:async(_pin,{signal,onProgress})=>{
      inner=signal;entered.resolve();await gate.promise;onProgress({phase:'download'});return data;
    }});
    const a=prep.prepareLayoutEquipmentPreview({signal:c.signal,onProgress:e=>seen.push(e)});
    const rejectedA=assert.rejects(a,canceled);await entered.promise;
    const b=prep.prepareLayoutEquipmentPreview();
    const error=new Error('Subscriber failure');
    const rejectedBad=assert.rejects(prep.prepareLayoutEquipmentPreview({onProgress:()=>{throw error;}}),e=>e===error);
    c.abort();assert(!inner.aborted);gate.resolve();await rejectedA;await rejectedBad;
    assert.equal(await b,descriptor);assert(prep.isPrepared());assert.equal(seen.length,0);
  });

  await test('last-abort-immediate-retry-late-old-download-cannot-install',async()=>{
    const gates=[deferred(),deferred()],entered=[deferred(),deferred()],signals=[];
    let calls=0;
    const prep=createLayoutEquipmentPreviewPreparer({download:async(_pin,{signal,onProgress})=>{
      const n=calls++;signals.push(signal);entered[n].resolve();await gates[n].promise;
      onProgress({phase:'late'});return n===0?{}:data;
    }});
    const aControl=new AbortController(),bControl=new AbortController(),events=[];
    const a=prep.prepareLayoutEquipmentPreview({signal:aControl.signal,onProgress:e=>events.push(e)});
    const b=prep.prepareLayoutEquipmentPreview({signal:bControl.signal});
    const ra=assert.rejects(a,canceled),rb=assert.rejects(b,canceled);await entered[0].promise;
    aControl.abort();assert(!signals[0].aborted);bControl.abort();assert(signals[0].aborted);await ra;await rb;
    const retry=prep.prepareLayoutEquipmentPreview();await entered[1].promise;
    gates[0].resolve();await tick();assert(!prep.isPrepared());assert.equal(events.length,0);
    gates[1].resolve();assert.equal(await retry,descriptor);assert.equal(calls,2);assert(prep.isPrepared());
  });

  await test('abort-before-job-start-and-during-validation-allows-clean-retry',async()=>{
    let calls=0;
    const prep=createLayoutEquipmentPreviewPreparer({download:async()=>{calls++;return data;}});
    const c=new AbortController(),reason=new DOMException('Caller canceled','AbortError');
    const canceledBeforeStart=prep.prepareLayoutEquipmentPreview({signal:c.signal});c.abort(reason);
    await assert.rejects(canceledBeforeStart,e=>e===reason);await tick();assert.equal(calls,0);assert(!prep.isPrepared());
    const d=new AbortController();
    const canceledDuringValidation=prep.prepareLayoutEquipmentPreview({signal:d.signal,onProgress:event=>{
      if(event.phase==='verify')setImmediate(()=>d.abort());
    }});
    await assert.rejects(canceledDuringValidation,canceled);assert(!prep.isPrepared());
    assert.equal(await prep.prepareLayoutEquipmentPreview(),descriptor);assert.equal(calls,2);
  });

  await test('preabort-failed-download-schema-receipts-and-same-cache-retry',async()=>{
    let calls=0;const error=new Error('Transport fixture failure');
    const prep=createLayoutEquipmentPreviewPreparer({download:async()=>{
      calls++;if(calls===1)throw error;if(calls===2)return {};
      if(calls===3){const d=structuredClone(data);d[first].positionsM[0]+=.01;return d;}
      return data;
    }});
    const c=new AbortController();c.abort();
    await assert.rejects(prep.prepareLayoutEquipmentPreview({signal:c.signal}),canceled);assert.equal(calls,0);
    await assert.rejects(prep.prepareLayoutEquipmentPreview({onProgress:1}),TypeError);assert.equal(calls,0);
    await assert.rejects(prep.prepareLayoutEquipmentPreview(),e=>e===error);assert(!prep.isPrepared());
    await assert.rejects(prep.prepareLayoutEquipmentPreview(),bad);assert(!prep.isPrepared());
    await assert.rejects(prep.prepareLayoutEquipmentPreview(),bad);assert(!prep.isPrepared());
    assert.equal(await prep.prepareLayoutEquipmentPreview(),descriptor);assert.equal(calls,4);
  });

  await test('exact-transport-malformed-mutated-schema-and-no-URL-override',async()=>{
    let requests=0;
    const never=async()=>{requests++;throw new Error('Must not request arbitrary URL');};
    for(const mutate of [p=>p.path='../escape.json',p=>p.transfer.path+='?query',
      p=>p.transfer.baseURL='https://invalid.example/',p=>delete p.transfer.baseURL]) {
      const pin=structuredClone(model);mutate(pin);
      await assert.rejects(transport.downloadEquipmentPreviewGeometry(pin,{fetchImpl:never}),transportBad);
    }
    assert.equal(requests,0);
    for(const wire of [gzip.subarray(0,-1),Buffer.concat([gzip,Buffer.from([0])]),Buffer.from(gzip).fill(0,20,21)])
      await assert.rejects(transport.downloadEquipmentPreviewGeometry(model,{fetchImpl:async url=>response(url,wire)}),transportBad);
    for(const mutate of [p=>p.bytes--,p=>p.sha256='0'.repeat(64),p=>p.transfer.sha256='0'.repeat(64)]) {
      const pin=structuredClone(model);mutate(pin);
      await assert.rejects(transport.downloadEquipmentPreviewGeometry(pin,{fetchImpl:fetchPrepared}),transportBad);
    }
    for(const bytes of [Buffer.from('{broken'),Buffer.from('globalThis.__u1Eval=true'),Buffer.from([0x22,0xff,0x22])]) {
      const wire=gzipSync(bytes),pin={...model,bytes:bytes.length,sha256:sha(bytes),
        transfer:{...model.transfer,bytes:wire.length,sha256:sha(wire)}};
      await assert.rejects(transport.downloadEquipmentPreviewGeometry(pin,{fetchImpl:async url=>response(url,wire)}),transportBad);
    }
    // A valid UTF-8 JSON body with synthetic transport pins still cannot widen
    // the consumer schema. This injection never changes production pins.
    for(const bytes of [Buffer.from('null'),Buffer.from('[]'),Buffer.from('{"schema":"future"}'),Buffer.from('{"__proto__":{"polluted":true}}')]) {
      const wire=gzipSync(bytes),pin={...model,bytes:bytes.length,sha256:sha(bytes),
        transfer:{...model.transfer,bytes:wire.length,sha256:sha(wire)}};
      const prep=createLayoutEquipmentPreviewPreparer({download:(_fixed,opts)=>
        transport.downloadEquipmentPreviewGeometry(pin,{...opts,fetchImpl:async url=>response(url,wire)})});
      await assert.rejects(prep.prepareLayoutEquipmentPreview(),bad);assert(!prep.isPrepared());
    }
    for(const body of ['globalThis.__u1Eval=true',{schema:'unknown'},JSON.parse('{"__proto__":{"polluted":true}}')]) {
      const prep=createLayoutEquipmentPreviewPreparer({download:async()=>body});
      await assert.rejects(prep.prepareLayoutEquipmentPreview(),bad);assert(!prep.isPrepared());
    }
    assert.equal(globalThis.__u1Eval,undefined);assert.equal({}.polluted,undefined);
  });

  if(options['--source-module']) await test('frozen-source-array-and-registration-equivalence',()=>{
    const source=fs.readFileSync(options['--source-module'],'utf8');
    const literal=source.match(/^const U1_GEOMETRIES = (.*);$/m);
    assert(literal,'Prepared source geometry dictionary missing');assert.deepEqual(JSON.parse(literal[1]),data);
    for(const [label,id] of [['U1',U1],['POP',POP]]) {
      const definition=JSON.parse(source.match(new RegExp('^const '+label+' = (.*);$','m'))[1]);
      for(const [variant,value] of Object.entries(definition.variants)) {
        const row=getLayoutEquipment(id,variant);
        assert.deepEqual(row.model,{...value.model,transfer:{...value.model.transfer,baseURL:transport.LAYOUT_EQUIPMENT_TRANSFER_BASE}});
        for(const key of Object.keys(value).filter(k=>!['proxy','model'].includes(k))) assert.deepEqual(row[key],value[key]);
        assert.deepEqual(row.proxy.parts.map(p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['positionsM','normals','indices'].includes(k)))),value.proxy.parts);
      }
      assert.deepEqual(getLayoutEquipment(id).fullScene,definition.fullScene);
      assert.deepEqual(getLayoutEquipment(id).mount,definition.mount);
    }
  });

  await test('production-cache-shared-preexisting-rows-ABA-reset-and-metadata-roundtrip',async()=>{
    assert(!isLayoutEquipmentPreviewPrepared());let requests=0;
    globalThis.fetch=async(url,options)=>{
      requests++;assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return fetchPrepared(url);
    };
    try {
      const [a,b]=await Promise.all([prepareLayoutEquipmentPreview(),prepareLayoutEquipmentPreview()]);
      assert.equal(a,descriptor);assert.equal(b,descriptor);assert.equal(requests,1);assert(isLayoutEquipmentPreviewPrepared());
      for(const id of ids) assert.deepEqual(getLayoutEquipmentPreviewGeometry(id),data[id]);
      const oldPart=before.proxy.parts.find(p=>p.shape==='mesh');assert.equal(oldPart.positionsM,getLayoutEquipmentPreviewGeometry(oldPart.geometryId).positionsM);
      for(const id of [U1,POP]) {
        const keys=id===U1?['standalone','docked','standalone']:['empty','loaded','empty'];
        const rows=keys.map(k=>getLayoutEquipment(id,k));
        assert.deepEqual(rows[0],rows[2]);
        assert.equal(resolveLayoutEquipment(rows[1]).equipmentVariant,keys[0]);
        const saved=JSON.parse(JSON.stringify({id,equipmentVariant:keys[1]}));
        assert.equal(getLayoutEquipment(saved.id,saved.equipmentVariant).equipmentVariant,keys[1]);
      }
      assert.equal(getLayoutEquipment(U1,'standalone').inventoryIds.length+getLayoutEquipment(POP,'empty').inventoryIds.length,4);
      assert.equal(getLayoutEquipment(U1,'docked').inventoryIds.length+getLayoutEquipment(POP,'loaded').inventoryIds.length,4);
      await prepareLayoutEquipmentPreview();assert.equal(requests,1);
    } finally {globalThis.fetch=async()=>{unexpectedNetwork++;throw new Error('Unexpected live network');};}
  });

  assert.equal(unexpectedNetwork,0);
  const metadataFiles = ['U1_preview_geometry_index.json','MOUNT_SPEC.json','U1_BED_OUTLINE.json','U1_exterior_notices.json'];
  const sourceInputs = Object.fromEntries([
    ...[equipmentURL,previewURL,transferURL,new URL(import.meta.url)].map(url=>fileURLToPath(url)),
    ...metadataFiles.map(name=>path.join(metadataDir,name))
  ].map(file=>[file,sha(fs.readFileSync(file))]));
  const report={passed:true,checks:checks.length,cases:checks,workerCount:1,liveNetworkRequests:unexpectedNetwork,
    heapLimitBytes:v8.getHeapStatistics().heap_size_limit,memoryUsage:process.memoryUsage(),geometryCount:ids.length,
    assets,sourceInputs,preparedDir,metadataDir,sourceEquivalence:options['--source-module']?{sha256:sha(fs.readFileSync(options['--source-module']))}:null,
    scope:'Exact prepared JSON/gzip and four GLBs; strict schema, all 66 F32/U32 receipts, common identity datum, immutable atomic cache, transport and async abort/retry/concurrency. Catalog ABA/default reset and minimal metadata roundtrip only.',
    openIntegrations:['App preload/lazy hooks and renderer','Population state/UI integration with farm release','Inventory/cache coverage and full repository/actual-asset release orchestration','Browser screenshots, cross-browser visuals and served revision','Native-solid mounting/operating clearance; no native-source inputs read'],
    noPublication:true};
  if(options['--report'])fs.writeFileSync(options['--report'],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {globalThis.fetch=originalFetch;}

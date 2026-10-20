import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {inspectPhysicalPart,compareHardware,assertPinned,parseGLB,sha,WITNESS_SHA,decodeDeliveryBytes,readDeliveryAsset} from './audit_fox_ab_fan_assets.mjs';

let checks=0;const tests=[];
const test=(name,fn)=>{fn();checks++;tests.push(name)};
const clone=x=>structuredClone(x);
function tetra(offset=[0,0,0]){
 const vertices=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]].map(p=>p.map((x,i)=>x+offset[i])),faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],positions=[],normals=[];
 for(const f of faces){const[a,b,c]=f.map(i=>vertices[i]),u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);for(const p of[a,b,c]){positions.push(...p);normals.push(...n.map(x=>x/l))}}
 return {key:'algorithm-fixture-only',primitives:[{positions:Float32Array.from(positions),normals:Float32Array.from(normals),indices:Uint32Array.from({length:12},(_,i)=>i)}]};
}
test('closed oriented tetra has no boundary/link defects',()=>{const r=inspectPhysicalPart(tetra());assert.equal(r.triangles,4);assert.equal(r.euler,2);assert.ok(r.signedVolumeM3>0)});
test('positive-area deleted face fails closure',()=>{const p=tetra();p.primitives[0].indices=p.primitives[0].indices.slice(0,9);assert.throws(()=>inspectPhysicalPart(p),/open\/nonmanifold edge/)});
test('unit but reversed stored normal fails facing',()=>{const p=tetra();for(let i=0;i<3;i++)p.primitives[0].normals[i]*=-1;assert.throws(()=>inspectPhysicalPart(p),/reversed normal/)});
test('nonunit normal fails independently of closure',()=>{const p=tetra();p.primitives[0].normals[2]*=2;assert.throws(()=>inspectPhysicalPart(p),/nonunit normal/)});
test('nonfinite position fails',()=>{const p=tetra();p.primitives[0].positions[0]=NaN;assert.throws(()=>inspectPhysicalPart(p),/nonfinite position/)});
test('nonfinite normal fails',()=>{const p=tetra();p.primitives[0].normals[0]=Infinity;assert.throws(()=>inspectPhysicalPart(p),/nonunit normal/)});
test('duplicated face cannot pass directed edge closure',()=>{const p=tetra(),q=p.primitives[0];q.indices=Uint32Array.from([...q.indices,...q.indices.slice(0,3)]);assert.throws(()=>inspectPhysicalPart(p),/open\/nonmanifold edge/)});
test('collapsed encoded triangle fails rather than disappearing',()=>{const p=tetra();p.primitives[0].indices[1]=0;assert.throws(()=>inspectPhysicalPart(p),/zero-area triangle/)});
test('reversed winding and normals cannot pass positive orientation',()=>{const p=tetra(),q=p.primitives[0];for(let i=0;i<q.indices.length;i+=3)[q.indices[i+1],q.indices[i+2]]=[q.indices[i+2],q.indices[i+1]];for(let i=0;i<q.normals.length;i++)q.normals[i]*=-1;assert.throws(()=>inspectPhysicalPart(p),/nonpositive oriented/)});
test('two closed shells pinched at one vertex fail vertex-link test',()=>{const a=tetra(),b=tetra();b.primitives[0].positions=b.primitives[0].positions.map(x=>-x);b.primitives[0].normals=b.primitives[0].normals.map(x=>-x);const idx=b.primitives[0].indices;for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];a.primitives.push(b.primitives[0]);assert.throws(()=>inspectPhysicalPart(a),/pinched\/disconnected vertex link/)});
test('malformed binary container fails',()=>assert.throws(()=>parseGLB(Buffer.alloc(32))));
test('source witness mutation fails even when JSON remains parseable',()=>{const b=Buffer.from('{"source":"original"}'),wrong=Buffer.from('{"source":"modified"}');assertPinned(b,sha(b),'fixture');assert.throws(()=>assertPinned(wrong,sha(b),'fixture'),/source pin changed/)});

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function hardwareFixture(){
 const parts=new Map(),witness={hardware:[],printed:[]};
 for(let i=0;i<28;i++){const key='fixture-'+i,record={source:{url:'https://example.invalid/source'},rigid_rotation:[[1,0,0],[0,1,0],[0,0,1]],rigid_translation_mm:[0,0,0],motion:'fixed',color:[.2,.3,.4,1],appearance_role:i<26?null:'base'},signature={position:{sha256:'position-original'},normal:{sha256:'normal-original'},indices:null,materialSha256:'material-original',matrix:identity};
  parts.set(key,{key,record,primitives:[{signature,matrix:identity}]});if(i<26)witness.hardware.push({key,metadata:clone(record),primitives:[clone(signature)]});else witness.printed.push({key,metadata:clone(record),matrix:identity});
 }return {parts,witness};
}
test('exact original hardware witnesses match',()=>{const{parts,witness}=hardwareFixture();compareHardware(parts,witness)});
test('purchased geometry byte digest change fails hardware parity',()=>{const{parts,witness}=hardwareFixture();parts.get('fixture-0').primitives[0].signature.position.sha256='changed';assert.throws(()=>compareHardware(parts,witness),/hardware arrays/)});
test('purchased material change fails hardware parity',()=>{const{parts,witness}=hardwareFixture();parts.get('fixture-0').primitives[0].signature.materialSha256='painted';assert.throws(()=>compareHardware(parts,witness),/hardware arrays/)});
test('purchased source/pose change fails provenance parity',()=>{const{parts,witness}=hardwareFixture();parts.get('fixture-0').record.rigid_translation_mm[0]=1;assert.throws(()=>compareHardware(parts,witness),/source\/pose\/role/)});
test('missing physical hardware cannot become a skipped pass',()=>{const{parts,witness}=hardwareFixture();parts.delete('fixture-0');assert.throws(()=>compareHardware(parts,witness))});
test('printed follower frame cannot silently move',()=>{const{parts,witness}=hardwareFixture();parts.get('fixture-27').primitives[0].matrix=[...identity];parts.get('fixture-27').primitives[0].matrix[12]=1;assert.throws(()=>compareHardware(parts,witness),/printed source pose/)});
test('repository-relative original public source witness is sealed',()=>{const p=fileURLToPath(new URL('../docs/FOX_AB_FAN_SOURCE_WITNESSES_V30.json',import.meta.url)),b=fs.readFileSync(p);assertPinned(b,WITNESS_SHA,'Original witness');const w=JSON.parse(b);assert.equal(w.hardware.length,26);assert.equal(w.printed.length,2);assert.ok(!/[A-Z]:[\\/]|\\Users\\/.test(b.toString('utf8')),'No private paths in public witness')});
// Small transport fixtures use the production bounded decoder, independently of
// model/topology fixtures. They cannot stand in for the real delivered GLB audit.
const transportRaw=Buffer.from('bounded source delivery fixture\n'),transportGzip=gzipSync(transportRaw),transportPins={decodedBytes:transportRaw.length,decodedSha256:sha(transportRaw),gzipBytes:transportGzip.length,gzipSha256:sha(transportGzip)};
test('pinned gzip verifies encoded and decoded bytes',()=>assert.deepEqual(decodeDeliveryBytes(transportGzip,transportPins,'gzip'),transportRaw));
test('pinned identity delivery remains supported',()=>assert.deepEqual(decodeDeliveryBytes(transportRaw,transportPins,'identity'),transportRaw));
test('valid gzip header mutation with unchanged payload fails encoded hash',()=>{const b=Buffer.from(transportGzip);b[4]^=1;assert.throws(()=>decodeDeliveryBytes(b,transportPins,'gzip'),/source pin changed/)});
test('CRC-corrupt gzip fails inflation even if its encoded pin is supplied',()=>{const b=Buffer.from(transportGzip);b[b.length-8]^=1;assert.throws(()=>decodeDeliveryBytes(b,{...transportPins,gzipSha256:sha(b)},'gzip'),/incorrect data check/)});
test('truncated gzip fails rather than yielding partial decoded source',()=>{const b=transportGzip.subarray(0,-4);assert.throws(()=>decodeDeliveryBytes(b,{...transportPins,gzipBytes:b.length,gzipSha256:sha(b)},'gzip'))});
test('inflation cannot exceed pinned decoded allocation bound',()=>{const b=gzipSync(Buffer.alloc(128*1024,65));assert.throws(()=>decodeDeliveryBytes(b,{...transportPins,gzipBytes:b.length,gzipSha256:sha(b)},'gzip'),e=>e.code==='ERR_BUFFER_TOO_LARGE')});
test('decoded digest is independently required after valid gzip decode',()=>assert.throws(()=>decodeDeliveryBytes(transportGzip,{...transportPins,decodedSha256:'0'.repeat(64)},'gzip'),/decoded: source pin changed/));
test('shorter decoded payload fails exact decoded length',()=>assert.throws(()=>decodeDeliveryBytes(transportGzip,{...transportPins,decodedBytes:transportRaw.length+1},'gzip'),/decoded size changed/));
test('invalid or unbounded decoded pin sizes fail before inflation',()=>{for(const size of [0,-1,Infinity,32*1024*1024+1])assert.throws(()=>decodeDeliveryBytes(transportGzip,{...transportPins,decodedBytes:size},'gzip'),/bounded delivery size/)});
function withDeliveryFixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fox-delivery-fixture-'));try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}
test('gzip-only assembled delivery needs no raw file',()=>withDeliveryFixture(root=>{fs.writeFileSync(path.join(root,'fixture.glb.gz'),transportGzip);const inputs=[],r=readDeliveryAsset(root,'fixture.glb',transportPins,inputs);assert.equal(r.encoding,'gzip');assert.equal(r.selectedPath,'fixture.glb.gz');assert.deepEqual(r.bytes,transportRaw);assert.equal(inputs[0].encodedAndDecodedPinsVerified,true)}));
test('raw-only assembled delivery stays valid before compression',()=>withDeliveryFixture(root=>{fs.writeFileSync(path.join(root,'fixture.glb'),transportRaw);assert.equal(readDeliveryAsset(root,'fixture.glb',transportPins).encoding,'identity')}));
test('both present representations must pass; gzip is selected',()=>withDeliveryFixture(root=>{fs.writeFileSync(path.join(root,'fixture.glb'),transportRaw);fs.writeFileSync(path.join(root,'fixture.glb.gz'),transportGzip);const r=readDeliveryAsset(root,'fixture.glb',transportPins);assert.equal(r.encoding,'gzip');assert.equal(r.representations.length,2);assert.ok(r.representations.every(p=>p.encodedAndDecodedPinsVerified))}));
test('good gzip cannot hide stale raw delivery bytes',()=>withDeliveryFixture(root=>{const b=Buffer.from(transportRaw);b[0]^=1;fs.writeFileSync(path.join(root,'fixture.glb'),b);fs.writeFileSync(path.join(root,'fixture.glb.gz'),transportGzip);assert.throws(()=>readDeliveryAsset(root,'fixture.glb',transportPins),/source pin changed/)}));
test('missing raw and gzip is a failure, never a skipped pass',()=>withDeliveryFixture(root=>assert.throws(()=>readDeliveryAsset(root,'fixture.glb',transportPins),/missing raw and gzip/)));
test('oversized disk delivery is rejected before a bounded read',()=>withDeliveryFixture(root=>{fs.writeFileSync(path.join(root,'fixture.glb.gz'),Buffer.alloc(transportGzip.length+1));assert.throws(()=>readDeliveryAsset(root,'fixture.glb',transportPins),/file size changed before read/)}));
const result={status:'PASS_FOX_SOURCE_AND_ALGORITHM_NEGATIVES',checks,tests,actualModelsLoaded:0,scope:'Small algorithm/source-pin/bounded-delivery regressions only. The separate actual delivered GLB auditor is mandatory.'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));

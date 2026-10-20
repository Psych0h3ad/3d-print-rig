// Exact procedural source regression; no printer model, network or WebGL load.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const R=path.dirname(fileURLToPath(import.meta.url)),option=process.argv.indexOf('--site'),site=option>=0?path.resolve(process.argv[option+1]):path.resolve(R,'../site');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const THREE=await import(pathToFileURL(path.join(site,'viewer/vendor-r180/three.module.js')));
const H=await import(pathToFileURL(path.join(site,'viewer/layout-ratrig-procedural-cleanup.mjs'))),results=[],findings=[],observations=[];
function test(id,fn){try{fn();results.push({id,status:'PASS'})}catch(e){const f={id,error:e.message};findings.push(f);results.push({...f,status:'FAIL'})}}
function bytes(a){return Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)}
function attrs(g){return Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{bytes:bytes(a).toString('hex'),array:a.array.constructor.name,itemSize:a.itemSize,count:a.count,normalized:a.normalized,name:a.name,usage:a.usage,gpuType:a.gpuType}]))}
function fixture({outside=false,sideZero=false}={}){
 const g=new THREE.ExtrudeGeometry();for(const name of Object.keys(g.attributes))g.deleteAttribute(name);g.clearGroups();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1e-20,0,0,0,1e-20,0, 0,0,0,1,0,0,outside?99:2,0,0, 0,0,1,3,0,1,0,sideZero?0:3,1],3));
 g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute(Array.from({length:18},(_,i)=>i+.25),2));
 g.setAttribute('color',new THREE.Uint8BufferAttribute(Array.from({length:27},(_,i)=>i*7%256),3,true));
 const extra=new THREE.Float32BufferAttribute(Array.from({length:9},(_,i)=>i+.125),1);extra.name='source-extra';extra.setUsage(THREE.DynamicDrawUsage);g.setAttribute('extra',extra);
 g.addGroup(0,6,0);g.addGroup(6,3,1);return g;
}
function exactCross(g,i){
 const p=g.attributes.position,values=Array.from({length:9},(_,j)=>p.array[(i+j/3|0)*p.itemSize+j%3]);
 // A separate exact dyadic oracle over the encoded source IEEE values.
 const data=new DataView(new ArrayBuffer(8));
 const decomposed=values.map(x=>{assert.ok(Number.isFinite(x));if(x===0)return [0n,0];data.setFloat64(0,x,false);const b=data.getBigUint64(0,false),e=Number(b>>52n&2047n),frac=b&((1n<<52n)-1n);return [(b>>63n?-1n:1n)*(e?(1n<<52n)|frac:frac),e?e-1023-52:-1074]});
 const exponent=Math.min(...decomposed.filter(([n])=>n!==0n).map(([,e])=>e));
 const v=decomposed.map(([n,e])=>n===0n?0n:n<<BigInt(e-exponent));const a=v.slice(0,3),u=v.slice(3,6).map((x,j)=>x-a[j]),w=v.slice(6,9).map((x,j)=>x-a[j]);
 return [u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
}
function groupAt(g,i){const group=g.groups.filter(x=>i>=x.start&&i+2<x.start+x.count);assert.equal(group.length,1);return group[0].materialIndex}
function positiveSignature(g){const h=crypto.createHash('sha256');let zero=0,positive=0;
 for(let i=0;i<g.attributes.position.count;i+=3){if(exactCross(g,i).every(x=>x===0n)){zero++;continue}positive++;h.update(String(groupAt(g,i))+'|');
  for(const [k,a]of Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b))){h.update(k+'|');const n=a.itemSize*a.array.BYTES_PER_ELEMENT;h.update(bytes(a).subarray(i*n,(i+3)*n))}}
 return {positive,zero,hash:h.digest('hex')};
}
function reject(id,mutate,pattern){test(id,()=>{const g=fixture();mutate(g);const before=attrs(g);assert.throws(()=>H.cleanupProceduralBeltGeometry(g),pattern);assert.deepEqual(attrs(g),before);g.dispose()})}
// Rejection/preservation controls run before the source positive fixtures.
reject('wrong-geometry-type',g=>g.type='BufferGeometry',/geometry type/);
reject('indexed-source-rejected',g=>g.setIndex(Array.from({length:9},(_,i)=>i)),/indexed/);
reject('morph-source-rejected',g=>g.morphAttributes.position=[g.attributes.position.clone()],/morph/);
reject('interleaved-source-rejected',g=>g.setAttribute('normal',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(27),3),3,0)),/unsupported attribute/);
reject('attribute-count-mismatch-rejected',g=>g.setAttribute('extra',new THREE.Float32BufferAttribute([1],1)),/unsupported attribute/);
reject('wrong-cap-material-rejected',g=>g.groups[0].materialIndex=1,/association/);
reject('wrong-side-material-rejected',g=>g.groups[1].materialIndex=0,/association/);
reject('third-group-rejected',g=>g.addGroup(0,0,2),/association/);
reject('overlapping-groups-rejected',g=>g.groups[1].start=3,/cover/);
reject('nontriangle-group-rejected',g=>{g.groups[0].count=5;g.groups[1].start=5;g.groups[1].count=4},/non-triangle groups/);
reject('partial-draw-start-rejected',g=>g.drawRange.start=3,/partial/);
reject('partial-draw-count-rejected',g=>g.drawRange.count=6,/partial/);
reject('nonfinite-source-position-rejected',g=>g.attributes.position.setX(0,NaN),/nonfinite/);
test('bounds-changing-removal-rejected',()=>{const g=fixture({outside:true}),before=attrs(g);assert.throws(()=>H.cleanupProceduralBeltGeometry(g),/changed belt bounds/);assert.deepEqual(attrs(g),before);g.dispose()});
for(const [id,groupName,meshName]of [['wrong-parent-name','other','dynamic_belt_0'],['wrong-mesh-name','RatRig_Dynamic_Routes','dynamic_belt_X']])test(id,()=>{const root=new THREE.Group(),group=new THREE.Group(),g=fixture(),mesh=new THREE.Mesh(g);group.name=groupName;mesh.name=meshName;group.add(mesh);root.add(group);const before=attrs(g);assert.throws(()=>H.cleanupLayoutRatRigBelts(root),/group missing/);assert.equal(mesh.geometry,g);assert.deepEqual(attrs(g),before);g.dispose()});
test('shared-target-geometry-rejected',()=>{const root=new THREE.Group(),group=new THREE.Group(),g=fixture(),one=new THREE.Mesh(g),two=new THREE.Mesh(g);group.name='RatRig_Dynamic_Routes';one.name='dynamic_belt_0';two.name='not-a-belt';group.add(one);root.add(group,two);const before=attrs(g);assert.throws(()=>H.cleanupLayoutRatRigBelts(root),/shared/);assert.deepEqual(attrs(g),before);assert.equal(one.geometry,g);g.dispose()});
test('side-zero-is-retained-as-finding-not-cleaned',()=>{const g=fixture({sideZero:true}),before=positiveSignature(g),out=H.cleanupProceduralBeltGeometry(g),after=positiveSignature(out.geometry);assert.equal(out.removedTriangles.length,1);assert.equal(before.zero,2);assert.equal(after.zero,1);assert.equal(before.hash,after.hash);g.dispose();out.geometry.dispose()});
test('tiny-positive-cap-and-all-attribute-material-bits-survive',()=>{const g=fixture(),before=attrs(g),sig=positiveSignature(g),out=H.cleanupProceduralBeltGeometry(g);assert.equal(out.removedTriangles.length,1);assert.equal(sig.positive,2);const after=positiveSignature(out.geometry);assert.equal(after.positive,sig.positive);assert.equal(after.hash,sig.hash);assert.equal(after.zero,0);assert.deepEqual(attrs(g),before);
 for(const [name,a]of Object.entries(out.geometry.attributes)){const b=g.attributes[name];assert.equal(a.array.constructor,b.array.constructor);assert.equal(a.normalized,b.normalized);assert.equal(a.itemSize,b.itemSize);assert.equal(a.name,b.name);assert.equal(a.usage,b.usage);assert.equal(a.gpuType,b.gpuType)}
 assert.deepEqual(out.geometry.groups,[{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1}]);const second=H.cleanupProceduralBeltGeometry(out.geometry);assert.equal(second.changed,false);assert.equal(second.geometry,out.geometry);g.dispose();out.geometry.dispose()});
test('target-disposal-material-transform-and-nontarget-preservation',()=>{const root=new THREE.Group(),group=new THREE.Group(),g=fixture(),stock=fixture(),material=new THREE.MeshStandardMaterial({color:'#18212a',metalness:.8,roughness:.4}),m=new THREE.Mesh(g,[material,material]),s=new THREE.Mesh(stock,material);let disposed=0;g.addEventListener('dispose',()=>disposed++);group.name='RatRig_Dynamic_Routes';m.name='dynamic_belt_4';m.position.set(1,2,3);m.rotation.set(.1,.2,.3);group.add(m);root.add(group,s);root.updateMatrixWorld(true);const matrix=m.matrixWorld.toArray(),stockBytes=attrs(stock),mats=m.material;const out=H.cleanupLayoutRatRigBelts(root);assert.equal(out.removedTriangles,1);assert.equal(disposed,1);assert.equal(m.material,mats);assert.deepEqual(m.matrixWorld.toArray(),matrix);assert.deepEqual(attrs(stock),stockBytes);assert.equal(s.geometry,stock);assert.equal(H.cleanupLayoutRatRigBelts(root).removedTriangles,0);assert.equal(disposed,1);m.geometry.dispose();stock.dispose();material.dispose()});


const sourceFixture=JSON.parse(fs.readFileSync(path.join(R,'fixtures/layout_ratrig_belts.json'),'utf8'));
const adapter=fs.readFileSync(path.join(site,'viewer/ratrig_adapter.mjs'),'utf8'),math=await import(pathToFileURL(path.join(site,'viewer/ratrig_motion_math.mjs')));
const body=adapter.match(/function beltMesh\(data\)\{[\s\S]*?\n  \}/)?.[0];assert.ok(body);assert.equal(sha(body),sourceFixture.originalBeltFunctionSHA256);
const build=new Function('THREE','cadToScene','return '+body)(THREE,math.cadToScene),root=new THREE.Group(),group=new THREE.Group(),sourceRows=[];group.name='RatRig_Dynamic_Routes';root.add(group);
for(let i=0;i<sourceFixture.belts.length;i++){const g=build(sourceFixture.belts[i]),name='dynamic_belt_'+i,mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.name=name;group.add(mesh);sourceRows.push({g,name,before:positiveSignature(g),attrsBefore:attrs(g)});
 for(const [attr,pin]of Object.entries(sourceFixture.expected[name].before)){assert.equal(bytes(g.attributes[attr]).byteLength,pin.bytes);assert.equal(sha(bytes(g.attributes[attr])),pin.sha256)}}
test('four-source-procedural-belts-preserve-positive-face-bytes-and-exact-degeneracy',()=>{const result=H.cleanupLayoutRatRigBelts(root);assert.equal(result.removedTriangles,4);for(let i=0;i<group.children.length;i++){const mesh=group.children[i],row=sourceRows[i];
 for(const removed of result.belts[i].removedTriangles)assert.ok(exactCross(row.g,removed.firstVertex).every(v=>v===0n));
 const after=positiveSignature(mesh.geometry);assert.equal(after.hash,row.before.hash);assert.equal(after.positive,row.before.positive);assert.equal(after.zero,0);assert.deepEqual(attrs(row.g),row.attrsBefore);
 for(const [attr,pin]of Object.entries(sourceFixture.expected[row.name].after)){assert.equal(bytes(mesh.geometry.attributes[attr]).byteLength,pin.bytes);assert.equal(sha(bytes(mesh.geometry.attributes[attr])),pin.sha256)}}assert.equal(H.cleanupLayoutRatRigBelts(root).removedTriangles,0)});
for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose()}
test('cleanup-remains-a-layout-provider-call',()=>{assert.ok(!adapter.includes('cleanupLayoutRatRigBelts'));const source=fs.readFileSync(path.join(site,'viewer/layout-machine-providers.mjs'),'utf8');assert.equal(source.split('cleanupLayoutRatRigBelts(loaded.root)').length,2);const branch=source.indexOf("if(recipe.category==='ratrig')"),call=source.indexOf('cleanupLayoutRatRigBelts(loaded.root)'),next=source.indexOf("if(recipe.category==='positron')",branch);assert.ok(branch>=0&&call>branch&&next>call)});
assert.deepEqual(findings,[],'Procedural cleanup regressions');
console.log(JSON.stringify({status:'PASS',checks:results.length,sourceBelts:sourceFixture.belts.length,removedExactZeroSourceCaps:4,helperSHA256:sha(fs.readFileSync(path.join(site,'viewer/layout-ratrig-procedural-cleanup.mjs'))),scope:'Source-derived procedural belts plus synthetic negative controls only; no full-model, browser, native-solid or operating-envelope claim.'}));

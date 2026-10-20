import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';
import {cloneAdmittedLayoutZeroFaces} from '../site/layout/layout-zero-face-cleanup.mjs';
import {planExactZeroFaceCompaction} from '../site/layout/layout-zero-face-plan.mjs';
import {layoutZeroFaceAdmissions} from '../site/layout/layout-zero-face-admissions.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const threeArg=process.argv.indexOf('--three-module');
const THREE=await import(threeArg>0?process.argv[threeArg+1]:pathToFileURL(path.resolve(here,'../site/viewer/vendor-r180/three.module.js')).href);assert.equal(THREE.REVISION,'180');
const hash=array=>crypto.createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const bundle=JSON.parse(fs.readFileSync(path.join(here,'fixtures/layout_source_zero_faces.json')));
const proof=bundle.sourceProofs;
function fixtureBytes(name){const row=bundle.arrays[name];assert.ok(row);assert.ok(row.bytes<=2000000);const bytes=inflateSync(Buffer.from(row.deflateBase64,'base64'),{maxOutputLength:row.bytes});assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256);return bytes;}
const constructors={Float32Array,Uint16Array,Uint32Array,Int8Array,Uint8Array,Int16Array,Int32Array};
const cases=[];let checks=0;
const check=(name,fn)=>{fn();checks++;cases.push(name);};
const checkAsync=async(name,fn)=>{await fn();checks++;cases.push(name);};
function tupleHash(attributes,index,faces){const h=crypto.createHash('sha256');for(const name of Object.keys(attributes).sort()){
 const a=attributes[name],tuple=a.itemSize*a.array.BYTES_PER_ELEMENT,bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);
 h.update(JSON.stringify([name,a.itemSize,a.array.constructor.name,a.normalized??false]));
 for(const face of faces)for(let c=0;c<3;c++){const offset=index[face*3+c]*tuple;h.update(bytes.subarray(offset,offset+tuple));}
 }return h.digest('hex');}
function makeSource(row){
 const g=new THREE.BufferGeometry();g.name='source geometry';g.userData={sourceRevision:1,nested:{unchanged:true}};
 for(const [name,record]of Object.entries(row.sourceAttributes)){
  const b=fixtureBytes(row.fixtures[name]),C=constructors[record.arrayType];assert.equal(hash(b),record.sha256);
  const a=new THREE.BufferAttribute(new C(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),record.itemSize,record.normalized);
  a.name=name;a.setUsage(THREE.DynamicDrawUsage);
  if(name==='index')g.setIndex(a);else g.setAttribute(name,a);
 }
 g.groups=structuredClone(row.sourceGroups);g.setDrawRange(row.sourceDrawRange.start,row.sourceDrawRange.count==='Infinity'?Infinity:row.sourceDrawRange.count);
 g.computeBoundingBox();g.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({color:0x537bcd,metalness:.24,roughness:.61});material.name='source material';
 const mesh=new THREE.Mesh(g,material);mesh.name=row.sourceMeshName;mesh.userData.part_key=row.sourceKey;
 mesh.position.set(1,2,3);mesh.rotation.set(.1,.2,.3);mesh.updateMatrix();
 const json={meshes:[],nodes:[],accessors:[],bufferViews:[]};
 json.meshes[row.sourceMeshIndex]={name:row.sourceMeshName,primitives:[structuredClone(row.sourcePrimitive)]};
 json.nodes[row.sourceNodeIndex]={name:row.sourceNodeName,mesh:row.sourceMeshIndex,extras:{part_key:row.sourceKey}};
 for(const a of Object.values(row.sourceAttributes)){json.accessors[a.accessorIndex]=structuredClone(a.accessor);json.bufferViews[a.accessor.bufferView]=structuredClone(a.bufferView);}
 const parser={json,associations:new Map([[mesh,{meshes:row.sourceMeshIndex,primitives:row.sourcePrimitiveIndex,nodes:row.sourceNodeIndex}]])};
 return {mesh,context:{scope:'layout',machineId:row.machineId,sourceModelSha256:row.sourceModelSha256,parser}};
}
const actualResults=[];
for(const row of proof.rows){
 const {mesh,context}=makeSource(row),g=mesh.geometry,sourceAttributes={...g.attributes},index=g.index,material=mesh.material;
 const hashes=Object.fromEntries([...Object.entries(g.attributes),['index',g.index]].map(([n,a])=>[n,hash(a.array)]));
 const matrix=mesh.matrix.toArray(),materialJSON=material.toJSON(),originalBox=g.boundingBox.toArray?g.boundingBox.toArray():JSON.stringify(g.boundingBox),sphere=JSON.stringify(g.boundingSphere);
 await checkAsync(row.machineId+'/'+row.sourceKey+' exact clone',async()=>{
  const result=await cloneAdmittedLayoutZeroFaces(mesh,context),clone=result.geometry;
  assert.equal(result.status,'CLONED_EXACT_SOURCE_ZERO_FACES');assert.notEqual(clone,g);assert.equal(mesh.geometry,g);assert.equal(mesh.material,material);
  assert.deepEqual(material.toJSON(),materialJSON);assert.deepEqual(mesh.matrix.toArray(),matrix);
  for(const [name,record]of Object.entries(row.expectedAfterAttributes)){
   const a=name==='index'?clone.index:clone.attributes[name],old=name==='index'?index:sourceAttributes[name];
   assert.equal(hash(a.array),record.sha256);assert.notEqual(a.array.buffer,old.array.buffer);assert.equal(a.name,old.name);assert.equal(a.usage,old.usage);assert.equal(a.gpuType,old.gpuType);
  }
  assert.deepEqual(clone.groups,row.expectedAfterGroups);assert.deepEqual(clone.drawRange,{start:row.expectedAfterDrawRange.start,count:row.expectedAfterDrawRange.count==='Infinity'?Infinity:row.expectedAfterDrawRange.count});
  const positiveBefore=tupleHash(g.attributes,g.index.array,Array.from({length:g.index.count/3},(_,i)=>i).filter(i=>!row.removedTriangles.includes(i)));
  const positiveAfter=tupleHash(clone.attributes,clone.index.array,Array.from({length:clone.index.count/3},(_,i)=>i));
  assert.equal(positiveBefore,row.proof.positiveTriangleTupleSha256Before);assert.equal(positiveAfter,positiveBefore);
  assert.equal(JSON.stringify(clone.boundingBox),JSON.stringify(g.boundingBox));assert.equal(JSON.stringify(clone.boundingSphere),sphere);
  clone.userData.nested.unchanged=false;assert.equal(g.userData.nested.unchanged,true);
  // Mutating and disposing the clone must not affect any source buffer.
  clone.attributes.position.array[0]+=1;clone.dispose();
  for(const [name,value]of Object.entries(hashes))assert.equal(hash((name==='index'?g.index:g.attributes[name]).array),value);
  actualResults.push({machineId:row.machineId,sourceKey:row.sourceKey,removedTriangles:row.removedTriangles.length,removedVertices:row.removedVertices.length,positiveTupleSha256:positiveBefore});
 });
 // Negative admission cases are exercised against one selected source at a time.
 await checkAsync(row.sourceKey+' missing hash rejects',async()=>{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,{...context,sourceModelSha256:undefined}),/SHA-256 required/);});
 await checkAsync(row.sourceKey+' wrong hash rejects',async()=>{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,{...context,sourceModelSha256:'0'.repeat(64)}),/SHA-256 mismatch/);});
 await checkAsync(row.sourceKey+' non-layout rejects',async()=>{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,{...context,scope:'viewer'}),/layout scope/);});
 await checkAsync(row.sourceKey+' accessor mismatch rejects',async()=>{
  const a=context.parser.json.accessors[row.sourceAttributes.position.accessorIndex],old=a.count;a.count++;
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/source accessor/);}finally{a.count=old;}
 });
 await checkAsync(row.sourceKey+' position bytes mismatch rejects',async()=>{
  const a=g.attributes.position.array,raw=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),old=raw[0];raw[0]^=1;
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/position SHA-256/);}finally{raw[0]=old;}
 });
 await checkAsync(row.sourceKey+' normal bytes mismatch rejects',async()=>{
  const a=g.attributes.normal.array,raw=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),old=raw[0];raw[0]^=1;
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/normal SHA-256/);}finally{raw[0]=old;}
 });
 await checkAsync(row.sourceKey+' index bytes mismatch rejects',async()=>{
  const a=g.index.array,old=a[0];a[0]=a[0]===0?1:0;
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/index SHA-256/);}finally{a[0]=old;}
 });
 await checkAsync(row.sourceKey+' association mismatch rejects',async()=>{
  const a=context.parser.associations.get(mesh);a.meshes++;
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/association/);}finally{a.meshes--;}
 });
 await checkAsync(row.sourceKey+' unexpected attribute rejects',async()=>{
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/attribute names/);}finally{g.deleteAttribute('uv');}
 });
 await checkAsync(row.sourceKey+' unlisted key leaves source untouched',async()=>{
  mesh.userData.part_key='unlisted-public-part';
  try{const r=await cloneAdmittedLayoutZeroFaces(mesh,context);assert.equal(r.status,'NOT_ADMITTED');assert.equal(r.geometry,g);}finally{mesh.userData.part_key=row.sourceKey;}
 });
 await checkAsync(row.sourceKey+' group mismatch rejects',async()=>{
  g.addGroup(0,3,0);try{await assert.rejects(cloneAdmittedLayoutZeroFaces(mesh,context),/groups\/draw/);}finally{g.clearGroups();}
 });
 g.dispose();material.dispose();
}

// Numeric fixtures verify tuple preservation beyond the admitted source format.
function numericFixture(){
 const p=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,0,.5,.5,0,.25,.25,0]);
 const n=new Float32Array(18);for(let i=2;i<n.length;i+=3)n[i]=1;n.fill(0,9,12);
 const uv=new Float32Array([0,0,1,0,0,1,-0,1,.5,.5,.25,.25]);
 const color=new Uint8Array([255,0,0,0,255,0,0,0,255,12,34,56,10,20,30,1,2,3]);
 const custom=new Int16Array([-32768,1,2,3,4,32767]);
 return {attributes:{position:{array:p,itemSize:3,count:6,normalized:false},normal:{array:n,itemSize:3,count:6,normalized:false},uv:{array:uv,itemSize:2,count:6,normalized:false},color:{array:color,itemSize:3,count:6,normalized:true},custom:{array:custom,itemSize:1,count:6,normalized:false}},index:{array:new Uint16Array([0,1,2,0,3,1,2,1,0,0,5,4])},groups:[{start:0,count:6,materialIndex:2},{start:6,count:6,materialIndex:7}],drawRange:{start:3,count:9}};
}
check('exact duplicate and exact collinear removed; positive winding, UV/color/custom byte identity',()=>{
 const g=numericFixture(),before=Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,hash(a.array)])),indexBefore=hash(g.index.array),plan=planExactZeroFaceCompaction(g);
 assert.deepEqual(plan.removedTriangles,[1,3]);assert.deepEqual(plan.removedVertices,[3,4,5]);
 assert.deepEqual([...plan.index],[0,1,2,2,1,0]);assert.deepEqual(plan.groups,[{start:0,count:3,materialIndex:2},{start:3,count:3,materialIndex:7}]);assert.deepEqual(plan.drawRange,{start:3,count:3});
 assert.equal(tupleHash(g.attributes,g.index.array,[0,2]),tupleHash(plan.attributes,plan.index,[0,1]));
 for(const [name,a]of Object.entries(g.attributes))assert.equal(hash(a.array),before[name]);assert.equal(hash(g.index.array),indexBefore);
});
check('positive triangle using smallest Float32 coordinates is retained',()=>{
 const g=numericFixture(),p=g.attributes.position.array;p[3]=2**-149;p[7]=2**-149;p.fill(0,12);
 const plan=planExactZeroFaceCompaction(g);assert(plan.keptTriangles.includes(0));assert(plan.keptTriangles.includes(2));
});
check('zero normal on a positive face rejects',()=>{const g=numericFixture();g.attributes.normal.array.fill(0,0,3);assert.throws(()=>planExactZeroFaceCompaction(g),/positive-area triangle/);});
check('removed isolated vertex changing bounds rejects',()=>{const g=numericFixture();g.attributes.position.array.set([9,9,0],12);assert.throws(()=>planExactZeroFaceCompaction(g),/bounding box/);});
check('interleaved source rejects',()=>{const g=numericFixture();g.attributes.uv.isInterleavedBufferAttribute=true;assert.throws(()=>planExactZeroFaceCompaction(g),/unsupported/);});
check('morph source rejects',()=>{const g=numericFixture();g.morphAttributes={position:[]};assert.throws(()=>planExactZeroFaceCompaction(g),/morph/);});
check('unaligned material group rejects',()=>{const g=numericFixture();g.groups[0].start=1;assert.throws(()=>planExactZeroFaceCompaction(g),/group/);});
check('out of range index rejects',()=>{const g=numericFixture();g.index.array[0]=100;assert.throws(()=>planExactZeroFaceCompaction(g),/out-of-range/);});
check('no epsilon removes a near-collinear positive triangle',()=>{const g=numericFixture();g.attributes.position.array[17]=2**-149;assert(planExactZeroFaceCompaction(g).keptTriangles.includes(3));});
check('admissions frozen and restricted to five exact source tuples',()=>{assert.equal(layoutZeroFaceAdmissions.length,5);assert(Object.isFrozen(layoutZeroFaceAdmissions));assert(Object.isFrozen(layoutZeroFaceAdmissions[0].sourceAttributes.position));});

console.log(JSON.stringify({status:'PASS_PORTABLE_SELECTED_GEOMETRY_AND_ADMISSION_FIXTURES',checks,actualSelectedMeshes:actualResults,fixtures:cases,wholeScenesLoaded:0,normalValuesInvented:0,rawModelMutations:0}));

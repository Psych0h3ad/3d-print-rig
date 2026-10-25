// Separate legacy derivation witnesses and current intrinsic-plate fixtures.
// Actual exported V6 evidence is produced separately by the equipment audits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {deriveU1Bottom,addU1BottomClosure,U1_BOTTOM_SOURCE,U1_INTRINSIC_BOTTOM_SOURCE,createEquipmentMeshCache} from '../site/layout/layout-equipment-mesh.mjs';
import {getLayoutEquipment,LAYOUT_EQUIPMENT_PREVIEW} from '../site/layout/layout-equipment.mjs';
import {validateU1BottomGeometry,validateU1IntrinsicBottomGeometry as sharedIntrinsicValidator} from './audit_layout_equipment_geometry.mjs';
import {validateU1IntrinsicBottomGeometry} from './audit_u1_bottom.mjs';

const checks=[];
function test(name,fn){fn();checks.push(name);}
function annulus(count,vertexCount){
 const positions=[],indices=[];
 for(const y of [.012,.006])for(const scale of [1,.8])for(let i=0;i<count;i++){
  const angle=i*2*Math.PI/count;positions.push(Math.cos(angle)*.2*scale,y,Math.sin(angle)*.22*scale);
 }
 for(let i=0;i<count;i++){
  const j=(i+1)%count,a=i,b=j,c=count+j,d=count+i;
  indices.push(a,c,b,a,d,c); // +Y top annulus
  indices.push(a+2*count,b+2*count,c+2*count,a+2*count,c+2*count,d+2*count); // -Y bottom
  indices.push(a,b,a+2*count,b,b+2*count,a+2*count);
  indices.push(d,d+2*count,c,c,d+2*count,c+2*count);
 }
 while(positions.length<vertexCount*3)positions.push(...positions.slice(0,3));
 const normals=positions.map((_,i)=>i%3===1?1:0);
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint32Array(indices)};
}
function geometry(p,n,ix){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(p),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n),3));g.setIndex(new THREE.BufferAttribute(new Uint32Array(ix),1));return g;
}
const raw=annulus(60,512),preview=annulus(32,288),objects=[];
// Execute the actual cache + private receipt-switch source with a controlled
// descriptor port. There is deliberately no public production override/hook.
const meshSource=fs.readFileSync(new URL('../site/layout/layout-equipment-mesh.mjs',import.meta.url),'utf8');
function sourceSection(a,b){const from=meshSource.indexOf(a),to=meshSource.indexOf(b,from+a.length);assert.ok(from>=0&&to>from,a);return meshSource.slice(from,to);}
const cacheSourceAt=meshSource.indexOf('export function createEquipmentMeshCache(');assert.ok(cacheSourceAt>=0);
const fixtureCache=new Function('THREE','LAYOUT_EQUIPMENT_PREVIEW','U1_BOTTOM_SOURCE','U1_INTRINSIC_BOTTOM_SOURCE','deriveU1Bottom',
 sourceSection('function deriveLegacyPreviewBottom(){','export const U1_BOTTOM_SOURCE=')+
 sourceSection('const bottomFail=','const area=')+
 sourceSection('function bufferGeometry(','/** The full reference')+
 meshSource.slice(cacheSourceAt).replace('export function createEquipmentMeshCache(','function createEquipmentMeshCache(')+';return createEquipmentMeshCache(THREE);');
const rimPart=()=>({geometryId:U1_BOTTOM_SOURCE.previewGeometryId,positionsM:Array.from(preview.positions),normals:Array.from(preview.normals),indices:Array.from(preview.indices)});
const cacheFor=descriptor=>fixtureCache(THREE,descriptor,U1_BOTTOM_SOURCE,U1_INTRINSIC_BOTTOM_SOURCE,deriveU1Bottom);
function capGeometry(data=raw){const cap=deriveU1Bottom(THREE,data.positions,data.indices),g=geometry(cap.positionsM,cap.normals,cap.indices);g.userData.layoutEquipmentDerivative=cap.receipt;objects.push(g);return g;}
function full(){
 const root=new THREE.Group(),g=geometry(raw.positions,raw.normals,raw.indices),m=new THREE.MeshStandardMaterial({color:0x889088,roughness:.5,metalness:.08}),rim=new THREE.Mesh(g,m);
 rim.userData={name:U1_BOTTOM_SOURCE.name,groupId:'casing',groupKind:'casing'};root.add(rim);objects.push(g,m);
 const glassGeometry=new THREE.BoxGeometry(.35,.4,.001),glassMaterial=new THREE.MeshStandardMaterial({transparent:true,opacity:.2}),glass=new THREE.Mesh(glassGeometry,glassMaterial);
 glass.position.set(0,.212,.23);root.add(glass);objects.push(glassGeometry,glassMaterial);
 return {root,rim,glass,row:{id:U1_BOTTOM_SOURCE.id,equipmentVariant:'standalone',model:{...U1_BOTTOM_SOURCE.models.standalone}}};
}
try{
 test('two measured faces and curved boundary are independently closed',()=>{
  const before=raw.positions.slice(),g=capGeometry(),a=validateU1BottomGeometry(raw.positions,raw.indices,g);
  assert.equal(a.triangles,116);assert.equal(a.vertices,120);assert.equal(a.planes[0].boundaryVertices,60);assert.ok(a.verticalRayChecks>600);assert.deepEqual(raw.positions,before);
  assert.ok(a.planes[0].areaM2<.32*.352,'Closure must follow curve, not rectangular bounds');
 });
 for(const [label,mutate]of [
  ['nonfinite position',p=>{p.positions[0]=NaN;}],['out-of-range index',p=>{p.indices[0]=99999;}],
  ['missing top face',p=>{p.indices=p.indices.slice(3);}]
 ])test('construction rejects '+label,()=>{const data={positions:raw.positions.slice(),indices:raw.indices.slice()};mutate(data);assert.throws(()=>deriveU1Bottom(THREE,data.positions,data.indices));});
 for(const [label,mutate,expected]of [
  ['invented vertex',g=>{g.attributes.position.array[0]+=.001;},/boundary vertex/],
  ['raised front closure',g=>{g.attributes.position.array[1]+=.1;},/boundary vertex|planes/],
  ['nonunit normal',g=>{g.attributes.normal.array[1]*=2;},/unit normal/],
  ['triangle reversal',g=>{const a=g.index.array;[a[0],a[1]]=[a[1],a[0]];},/winding/],
  ['missing triangle',g=>{g.setIndex(new THREE.BufferAttribute(g.index.array.slice(3),1));},/boundary|area/],
  ['false derivative receipt',g=>{g.userData.layoutEquipmentDerivative.triangles++;},/Expected/]
 ])test('independent gate rejects '+label,()=>{const g=capGeometry();mutate(g);assert.throws(()=>validateU1BottomGeometry(raw.positions,raw.indices,g),expected);});
 test('legacy preview derivation keeps original arrays as exact prefix independently',()=>{
  const cap=deriveU1Bottom(THREE,preview.positions,preview.indices),offset=preview.positions.length/3;
  const g=geometry([...preview.positions,...cap.positionsM],[...preview.normals,...cap.normals],[...preview.indices,...cap.indices.map(i=>i+offset)]);
  g.userData.layoutEquipmentDerivative=cap.receipt;objects.push(g);
  assert.equal(validateU1BottomGeometry(preview.positions,preview.indices,g,{merged:true}).triangles,60);
  assert.deepEqual(g.attributes.normal.array.subarray(0,preview.normals.length),preview.normals);
 });
 test('actual legacy receipt/cache branch appends exactly one cap and retains source prefix',()=>{
  const cache=cacheFor({body:{sha256:'3963e49ff68e19254a2c38ddddf56f411c8885886b2ce425ad9c84d904203b38'},geometry:{}}),part=rimPart();
  try{
   const before=structuredClone(part),g=cache.get(part),result=validateU1BottomGeometry(preview.positions,preview.indices,g,{merged:true});
   assert.equal(result.triangles,60);assert.equal(g.attributes.position.count,288+64);assert.equal(g.index.count,preview.indices.length+60*3);
   assert.deepEqual(g.attributes.position.array.subarray(0,preview.positions.length),preview.positions);
   assert.deepEqual(g.attributes.normal.array.subarray(0,preview.normals.length),preview.normals);
   assert.deepEqual(g.index.array.subarray(0,preview.indices.length),preview.indices);
   assert.equal(cache.get(part),g);assert.deepEqual(part,before,'Cache must not mutate source fixture arrays');
  }finally{cache.dispose();}
 });
 test('actual V6 receipt/cache branch never appends a legacy cap',()=>{
  const cache=cacheFor(LAYOUT_EQUIPMENT_PREVIEW),part=rimPart();
  try{const g=cache.get(part);assert.deepEqual(g.attributes.position.array,preview.positions);assert.deepEqual(g.index.array,preview.indices);assert.equal(g.userData.layoutEquipmentDerivative,undefined);assert.equal(cache.get(part),g);}finally{cache.dispose();}
 });
 for(const [label,descriptor]of [
  ['unknown preview body',{body:{sha256:'0'.repeat(64)},geometry:LAYOUT_EQUIPMENT_PREVIEW.geometry}],
  ['V6 body without intrinsic receipt',{body:{sha256:U1_INTRINSIC_BOTTOM_SOURCE.previewBodySHA256},geometry:{}}],
  ['unknown body with valid intrinsic entry',{body:{sha256:'f'.repeat(64)},geometry:{[U1_INTRINSIC_BOTTOM_SOURCE.previewGeometryId]:LAYOUT_EQUIPMENT_PREVIEW.geometry[U1_INTRINSIC_BOTTOM_SOURCE.previewGeometryId]}}]
 ])test('actual receipt/cache branch rejects '+label,()=>{const cache=cacheFor(descriptor);try{assert.throws(()=>cache.get(rimPart()),e=>e.code==='LAYOUT_U1_BOTTOM_GEOMETRY');}finally{cache.dispose();}});
 test('unrelated preview identity does not acquire closure',()=>{
  const cache=createEquipmentMeshCache(THREE),g=cache.get({geometryId:'unrelated',positionsM:Array.from(preview.positions),normals:Array.from(preview.normals),indices:Array.from(preview.indices)});
  assert.equal(g.userData.layoutEquipmentDerivative,undefined);assert.deepEqual(g.attributes.position.array,preview.positions);cache.dispose();
 });
 test('full closure is separate and retains rim PBR, source geometry and glass aperture',()=>{
  const {root,rim,glass,row}=full(),glassBefore=glass.geometry.attributes.position.array.slice(),native=rim.geometry,pbr=rim.material;
  const bounds=new THREE.Box3().setFromObject(root),receipt=addU1BottomClosure(THREE,root,row),cap=rim.children[0];objects.push(cap.geometry);
  assert.equal(rim.geometry,native);assert.equal(cap.material,pbr);assert.equal(cap.name,U1_BOTTOM_SOURCE.derivativeName);assert.equal(receipt.sourceModel.sha256,row.model.sha256);
  assert.deepEqual(glass.geometry.attributes.position.array,glassBefore);assert.equal(glass.material.opacity,.2);assert.ok(new THREE.Box3().setFromObject(root).equals(bounds));
  assert.equal(validateU1BottomGeometry(raw.positions,raw.indices,cap.geometry).triangles,116);
  assert.throws(()=>addU1BottomClosure(THREE,root,row),/duplicate closure/);
 });
 test('unrelated equipment is untouched',()=>{const {root}=full(),snapshot=root.toJSON();assert.equal(addU1BottomClosure(THREE,root,{id:'cabinet'}),null);assert.deepEqual(root.toJSON(),snapshot);});
 for(const [label,mutate,expected]of [
  ['model SHA',f=>{f.row.model.sha256='0'.repeat(64);},/unreviewed source/],
  ['model bytes',f=>{f.row.model.bytes++;},/unreviewed source/],
  ['model path',f=>{f.row.model.path='other.glb';},/unreviewed source/],
  ['unreviewed variant',f=>{f.row.equipmentVariant='v5';},/unreviewed source/],
  ['missing exact occurrence',f=>{f.rim.userData.name='casing / other';},/occurrence/],
  ['duplicate occurrence',f=>{f.root.add(f.rim.clone());},/occurrence/],
  ['wrong group',f=>{f.rim.userData.groupId='glass';},/contract changed/],
  ['moved source rim',f=>{f.rim.position.x=.001;},/contract changed/],
  ['transparent floor material',f=>{f.rim.material.transparent=true;},/contract changed/],
  ['changed source vertex count',f=>{f.rim.geometry.setAttribute('position',new THREE.BufferAttribute(raw.positions.slice(3),3));},/contract changed/]
 ])test('full source contract rejects '+label,()=>{const f=full();mutate(f);assert.throws(()=>addU1BottomClosure(THREE,f.root,f.row),expected);});
 function intrinsic(variant='standalone'){
  const f=full(),g=new THREE.CylinderGeometry(.19,.19,.0017,64,1,false);g.scale(1,1,1.1);g.translate(0,.008,0);
  const m=new THREE.MeshStandardMaterial({color:0xd2d5d1}),plate=new THREE.Mesh(g,m);
  plate.name=U1_INTRINSIC_BOTTOM_SOURCE.name;plate.userData={name:plate.name,groupId:'bottom_closure',groupKind:'bottom_closure'};
  f.root.add(plate);objects.push(g,m);f.plate=plate;
  f.row.equipmentVariant=variant;f.row.model={...U1_INTRINSIC_BOTTOM_SOURCE.models[variant]};return f;
 }
 test('current exact V6 pins and preview body are distinct from legacy witnesses',()=>{
  assert.equal(LAYOUT_EQUIPMENT_PREVIEW.body.sha256,U1_INTRINSIC_BOTTOM_SOURCE.previewBodySHA256);
  assert.ok(LAYOUT_EQUIPMENT_PREVIEW.geometry[U1_INTRINSIC_BOTTOM_SOURCE.previewGeometryId]);
  for(const variant of ['standalone','docked'])for(const [key,value]of Object.entries(U1_INTRINSIC_BOTTOM_SOURCE.models[variant]))assert.equal(getLayoutEquipment(U1_BOTTOM_SOURCE.id,variant).model[key],value);
 });
 test('intrinsic closed topology, winding, measured opening and triangle rays',()=>{
  const f=intrinsic(),result=validateU1IntrinsicBottomGeometry(raw.positions,raw.indices,f.plate.geometry);
  assert.equal(result.measuredOpeningContained,true);assert.ok(result.verticalRayChecks>1000);assert.ok(result.signedVolumeM3>0);assert.equal(result.planes.length,2);
 });
 function volumeOf(p,ix){
  let total=0;for(let i=0;i<ix.length;i+=3){const a=Array.from(p.slice(ix[i]*3,ix[i]*3+3)),b=Array.from(p.slice(ix[i+1]*3,ix[i+1]*3+3)),c=Array.from(p.slice(ix[i+2]*3,ix[i+2]*3+3));
   total+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }return total;
 }
 test('near-coincident seam IDs never replace raw volume/area/ray geometry',()=>{
  const f=intrinsic(),g=f.plate.geometry,p=g.attributes.position.array,ix=g.index.array,seen=new Set();let changed=-1;
  for(let i=0;i<p.length;i+=3){const key=Array.from(p.slice(i,i+3)).join(',');if(p[i]===0&&p[i+2]===0&&seen.has(key)){p[i]=Math.fround(2e-8);changed=i;break;}seen.add(key);}
  assert.ok(changed>=0,'Fixture needs a duplicated cap-centre seam');
  const before=p.slice(),rawVolume=volumeOf(p,ix),welded=p.slice(),first=new Map();
  for(let i=0;i<p.length;i+=3){const key=Array.from(p.slice(i,i+3),v=>Math.round(v/1e-7)).join(',');if(!first.has(key))first.set(key,Array.from(p.slice(i,i+3)));welded.set(first.get(key),i);}
  assert.notEqual(rawVolume,volumeOf(welded,ix),'Corruption must distinguish raw from healed geometry');
  const result=validateU1IntrinsicBottomGeometry(raw.positions,raw.indices,g);
  assert.equal(result.signedVolumeM3,rawVolume);assert.deepEqual(p,before);assert.equal(result.geometryUsesRawSourceVertices,true);assert.equal(result.topologyUsesWeldedIdsOnly,true);
  for(const plane of result.planes){let area=0;for(let i=0;i<ix.length;i+=3){const t=[ix[i],ix[i+1],ix[i+2]].map(j=>Array.from(p.slice(j*3,j*3+3)));if(t.every(q=>Math.abs(q[1]-plane.yM)<1e-7)){const [a,b,c]=t;area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;}}
   assert.ok(Math.abs(plane.areaM2-area)<1e-14,'Face area must use actual triangles');
  }
  assert.deepEqual(sharedIntrinsicValidator(raw.positions,raw.indices,g),result,'Required geometry/loader gates must delegate to raw validator');
 });
 for(const variant of ['standalone','docked'])test('exact '+variant+' intrinsic plate is retained without a derived duplicate',()=>{
  const f=intrinsic(variant);f.root.updateMatrixWorld(true);const before=f.root.toJSON();assert.equal(addU1BottomClosure(THREE,f.root,f.row),null);
  assert.deepEqual(f.root.toJSON(),before);assert.equal(addU1BottomClosure(THREE,f.root,f.row),null);
 });
 test('V6 preview rim and intrinsic plate are separate unmodified cache geometries',()=>{
  const f=intrinsic(),cache=createEquipmentMeshCache(THREE);
  const part=(geometryId,g)=>({geometryId,positionsM:Array.from(g.attributes.position.array),normals:Array.from(g.attributes.normal.array),indices:Array.from(g.index.array)});
  const a=part(U1_BOTTOM_SOURCE.previewGeometryId,f.rim.geometry),b=part(U1_INTRINSIC_BOTTOM_SOURCE.previewGeometryId,f.plate.geometry),rim=cache.get(a),plate=cache.get(b);
  assert.deepEqual(Array.from(rim.attributes.position.array),a.positionsM);assert.deepEqual(Array.from(rim.index.array),a.indices);
  assert.equal(rim.userData.layoutEquipmentDerivative,undefined);assert.equal(plate.userData.layoutEquipmentDerivative,undefined);
  assert.equal(cache.get(b),plate);validateU1IntrinsicBottomGeometry(raw.positions,raw.indices,plate);cache.dispose();
 });
 for(const [label,mutate]of [
  ['unknown SHA',f=>{f.row.model.sha256='0'.repeat(64);}],['unknown bytes',f=>{f.row.model.bytes++;}],
  ['unknown path',f=>{f.row.model.path='other.glb';}],['unknown variant',f=>{f.row.equipmentVariant='v5';}],
  ['missing bottom',f=>{f.plate.removeFromParent();}],['duplicate bottom',f=>{f.root.add(f.plate.clone());}],
  ['wrong name',f=>{f.plate.userData.name='other';}],['wrong group',f=>{f.plate.userData.groupId='casing';}],
  ['moved plate',f=>{f.plate.position.y=.01;}],['transparent plate',f=>{f.plate.material.transparent=true;}],
  ['runtime duplicate cap',f=>{f.rim.userData.layoutEquipmentDerivative={kind:'bad'};}],
  ['unlabelled legacy duplicate',f=>{f.glass.name=U1_BOTTOM_SOURCE.derivativeName;}]
 ])test('intrinsic source rejects '+label,()=>{const f=intrinsic();mutate(f);assert.throws(()=>addU1BottomClosure(THREE,f.root,f.row),e=>e.code==='LAYOUT_U1_BOTTOM_GEOMETRY');});
 for(const [label,mutate]of [
  ['missing triangle',g=>{g.setIndex(new THREE.BufferAttribute(g.index.array.slice(3),1));}],
  ['nonfinite position',g=>{g.attributes.position.array[0]=NaN;}],
  ['nonunit normal',g=>{g.attributes.normal.array[1]=3;}],
  ['triangle reversal',g=>{const a=g.index.array;[a[0],a[1]]=[a[1],a[0]];}],
  ['outside rim height',g=>{g.translate(0,.1,0);}],
  ['opening escape',g=>{g.scale(.5,1,.5);}],
  ['runtime derivative',g=>{g.userData.layoutEquipmentDerivative={kind:'bad'};}]
 ])test('independent intrinsic geometry rejects '+label,()=>{const f=intrinsic();mutate(f.plate.geometry);assert.throws(()=>validateU1IntrinsicBottomGeometry(raw.positions,raw.indices,f.plate.geometry));});
 console.log(JSON.stringify({passed:true,checks:checks.length,cases:checks,actualAssetsAudited:false,scope:'Separate exact legacy cap corruption witnesses; strict V6 intrinsic identity, no duplicate preview/full cap, manifold/winding/opening/ray corruption. Current exported assets audited separately.'}));
}finally{for(const o of objects)o.dispose();}

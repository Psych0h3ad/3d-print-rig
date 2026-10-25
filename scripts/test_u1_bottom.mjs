// Focused corruption/ownership fixtures. Actual V4 exterior evidence is produced
// separately by audit_u1_bottom.mjs and the normal equipment asset gates.
import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {deriveU1Bottom,addU1BottomClosure,U1_BOTTOM_SOURCE,createEquipmentMeshCache} from '../site/layout/layout-equipment-mesh.mjs';
import {validateU1BottomGeometry} from './audit_layout_equipment_geometry.mjs';

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
 test('preview keeps all original arrays as exact immutable prefix',()=>{
  const part=Object.freeze({geometryId:U1_BOTTOM_SOURCE.previewGeometryId,positionsM:Object.freeze(Array.from(preview.positions)),normals:Object.freeze(Array.from(preview.normals)),indices:Object.freeze(Array.from(preview.indices))});
  const cache=createEquipmentMeshCache(THREE),g=cache.get(part);
  assert.equal(validateU1BottomGeometry(preview.positions,preview.indices,g,{merged:true}).triangles,60);
  assert.deepEqual(g.attributes.normal.array.subarray(0,preview.normals.length),preview.normals);
  assert.equal(cache.get(part),g);let disposed=0;g.addEventListener('dispose',()=>disposed++);cache.dispose();cache.dispose();assert.equal(disposed,1);
 });
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
 console.log(JSON.stringify({passed:true,checks:checks.length,cases:checks,actualAssetsAudited:false,scope:'Independent closure geometry corruption, exact source-pin rejection, preview prefix/cache ownership, separate full geometry/PBR, glass and bounds preservation. Actual V4 assets audited separately.'}));
}finally{for(const o of objects)o.dispose();}

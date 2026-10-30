// Reference-pad geometry and the actual PNG loader. The cabinet remains the
// separately pinned supplier mesh; pad estimates are not native hardware.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {register} from 'node:module';
const at=process.argv.indexOf('--site'),site=at>=0?path.resolve(process.argv[at+1]):path.resolve('site');
const imp=p=>import(pathToFileURL(path.join(site,p)).href);
const THREE=await imp('viewer/vendor-r180/three.module.js');
const {POPSTATION_STANDARD_FEET:spec,createPopStationFootGeometry,assemblePopStationStandardFeet}=await imp('layout/layout-popstation-feet.mjs');
const {BIQU_POPSTATION_CAD:bare,BIQU_POPSTATION_STANDARD:installed}=await imp('layout/layout-biqu-popstation.mjs');
const {createLayoutEquipmentLoader}=await imp('layout/layout-machine-loader.mjs');
const checks=[],check=(name,fn)=>{fn();checks.push(name)},near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const geometry=createPopStationFootGeometry(THREE),pos=geometry.attributes.position,norm=geometry.attributes.normal,index=geometry.index;
check('closed-reference-profile-finite-normals-triangles-and-winding',()=>{
 assert.equal(spec.count,4);assert.equal(spec.manufacturerCAD,false);assert.equal(spec.physicalMountingVerified,false);
 for(let i=0;i<pos.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(pos,i),n=new THREE.Vector3().fromBufferAttribute(norm,i);
  assert([...p,...n].every(Number.isFinite));near(n.length(),1,1e-5);
 }
 const a=new THREE.Vector3(),b=a.clone(),c=a.clone(),n=a.clone();
 for(let i=0;i<index.count;i+=3){
  const ids=[0,1,2].map(j=>index.getX(i+j));a.fromBufferAttribute(pos,ids[0]);b.fromBufferAttribute(pos,ids[1]);c.fromBufferAttribute(pos,ids[2]);
  const face=b.clone().sub(a).cross(c.clone().sub(a));assert(face.length()>1e-12,'zero-area pad triangle');
  const smooth=ids.map(j=>n.clone().fromBufferAttribute(norm,j)).reduce((x,y)=>x.add(y),new THREE.Vector3());
  assert(face.dot(smooth)>0,'pad triangle and normal disagree');
 }
 near(geometry.boundingBox.min.y,0);near(geometry.boundingBox.max.y,spec.referenceHeightM);
});
check('rigid-source-carrier-and-four-visible-rubber-references',()=>{
 const body=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshStandardMaterial());
 child.position.set(.002,.2,-.004);body.add(child);body.updateMatrixWorld(true);const matrix=child.matrix.toArray();
 const root=assemblePopStationStandardFeet(THREE,body,installed);root.updateMatrixWorld(true);
 assert.deepEqual(child.matrix.toArray(),matrix);assert.equal(root.children[0].children[0],body);near(body.parent.position.y,.0106);
 const pads=root.children.filter(n=>n.isMesh);assert.equal(pads.length,4);
 assert.deepEqual(pads.map(p=>[p.position.x,p.position.z]),spec.centersXZ);
 for(const pad of pads){assert(pad.visible);assert.equal(pad.userData.manufacturerCAD,false);near(pad.material.roughness,.92);near(pad.material.metalness,0);near(new THREE.Box3().setFromObject(pad).min.y,0);}
 assert.equal(assemblePopStationStandardFeet(THREE,new THREE.Group(),bare),null);
 pads[0].geometry.dispose();pads[0].material.dispose();child.geometry.dispose();child.material.dispose();
});
geometry.dispose();
let actual=null;
const modelAt=process.argv.indexOf('--model');
if(at>=0||modelAt>=0){
 register('./layout-built-three-loader.mjs',import.meta.url);
 const {GLTFLoader}=await imp('viewer/vendor-r180/GLTFLoader.js');
 const local=modelAt>=0?path.resolve(process.argv[modelAt+1]):path.join(site,bare.model.path);
 const bytes=fs.existsSync(local)?fs.readFileSync(local):Buffer.from(await (await imp('layout/layout-equipment-transfer.mjs')).downloadEquipmentModel(bare.model));
 assert.equal(bytes.length,bare.model.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),bare.model.sha256);
 const array=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),observed=[];
 const load=createLayoutEquipmentLoader({download:async()=>array,parse:async()=>{
  const gltf=await new GLTFLoader().parseAsync(array,'');gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(n=>{if(n.isMesh)observed.push({node:n,geometry:n.geometry,matrix:n.matrix.toArray(),world:n.matrixWorld.toArray(),normal:Buffer.from(n.geometry.attributes.normal.array.buffer).toString('base64'),position:Buffer.from(n.geometry.attributes.position.array.buffer).toString('base64'),index:Buffer.from(n.geometry.index.array.buffer).toString('base64')});});return gltf;
 }});
 const result=await load(bare.id,{equipmentVariant:'standard-feet'}),meshes=[];result.root.updateMatrixWorld(true);result.root.traverse(n=>{if(n.isMesh)meshes.push(n);});
 assert.equal(observed.length,70);assert.equal(meshes.length,74);assert.equal(meshes.filter(n=>n.userData.layoutReferencePart===spec.id).length,4);
 for(const r of observed){assert.equal(r.node.geometry,r.geometry);assert.deepEqual(r.node.matrix.toArray(),r.matrix);assert.equal(Buffer.from(r.node.geometry.attributes.position.array.buffer).toString('base64'),r.position);assert.equal(Buffer.from(r.node.geometry.index.array.buffer).toString('base64'),r.index);assert.equal(Buffer.from(r.node.geometry.attributes.normal.array.buffer).toString('base64'),r.normal);const expected=new THREE.Matrix4().makeTranslation(0,spec.bodyLiftM,0).multiply(new THREE.Matrix4().fromArray(r.world));r.node.matrixWorld.toArray().forEach((v,i)=>near(v,expected.elements[i],1e-10));assert(r.node.visible);}
 near(result.dimensions.height*1000,installed.dimensionsMm.height,.05);near(result.dimensions.min[1],0);
 const pads=meshes.filter(n=>n.userData.layoutReferencePart===spec.id);
 for(const yaw of [0,90,37,-90]){result.root.rotation.y=THREE.MathUtils.degToRad(yaw);result.root.updateMatrixWorld(true);for(const p of pads)near(new THREE.Box3().setFromObject(p).min.y,0);}
 actual={cabinetLeaves:70,referencePads:4,originalLocalMatricesAndBuffers:true,sourceSHA256:bare.model.sha256,heightMm:result.dimensions.height*1000,poses:[0,90,37,-90],scope:'Actual supplier mesh and PNG loader; no native receiver/thread/load or exact pad-dimension qualification.'};
 result.dispose();checks.push('actual-70-source-leaves-plus-four-pads-in-production-PNG-loader');
}
console.log(JSON.stringify({passed:true,checks,actual,scope:'Estimated exterior pads, finite mesh/winding, rigid source preservation and selected floor poses. Physical foot fastening, load and complete machine clearance remain unverified.'}));

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {register} from 'node:module';

const root=new URL('../',import.meta.url),json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const fixture=json('scripts/fixtures/head_depth_precision.json'),catalog=json('site/HEAD_ADDITIONS.json');
assert.equal(catalog.assets[fixture.source.asset].files['model.glb'].sha256,fixture.source.stored_model_sha256);
assert.equal(catalog.assets[fixture.source.asset].files['model.glb'].decoded_sha256,fixture.source.decoded_model_sha256);
assert.equal(catalog.variants.find(v=>v.id==='trinity88__n19').source_version,fixture.source.revision);
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {frameHeadBounds,updateHeadClipping}=await import('../site/viewer/head-camera.mjs');
const {createExportCamera}=await import('../site/viewer/export-camera.mjs');
let cornerChecks=0,poses=0;
const corners=box=>{
 const result=[];
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])result.push(new THREE.Vector3(x,y,z));
 return result;
};
const cameraState=camera=>JSON.stringify({position:camera.position,quaternion:camera.quaternion,up:camera.up,aspect:camera.aspect,zoom:camera.zoom,view:camera.view,filmOffset:camera.filmOffset});
function depthCheck(camera,box,allInFront=true){
 assert(camera.near>0&&camera.far>camera.near&&Number.isFinite(camera.far));
 assert([...camera.projectionMatrix.elements,...camera.projectionMatrixInverse.elements].every(Number.isFinite));
 for(const point of corners(box)){
  const depth=-point.clone().applyMatrix4(camera.matrixWorldInverse).z;
  if(depth<=0){assert(!allInFront);continue}
  assert(depth>camera.near&&depth<camera.far,'A forward bounds corner was depth-clipped');
  const projected=point.clone().project(camera);
  assert(projected.z>-1&&projected.z<1,'Projected corner outside depth frustum');cornerChecks++;
 }
 poses++;
}
function clip(camera,box,allInFront=true){
 camera.updateWorldMatrix(true,false);
 const state=cameraState(camera),boxState=JSON.stringify(box),xy=corners(box).map(p=>p.project(camera).toArray().slice(0,2));
 const result=updateHeadClipping(camera,box);
 assert.equal(cameraState(camera),state,'Clipping moved the camera or changed the view');
 assert.equal(JSON.stringify(box),boxState,'Clipping mutated assembly bounds');
 corners(box).forEach((p,i)=>{const q=p.project(camera);if([...xy[i],q.x,q.y].every(Number.isFinite))assert(Math.abs(q.x-xy[i][0])<1e-9&&Math.abs(q.y-xy[i][1])<1e-9,'Clipping changed image position')});
 depthCheck(camera,box,allInFront);return result;
}
function controlsFor(camera){return {target:new THREE.Vector3(),maxDistance:1.5,update(){
 const delta=camera.position.clone().sub(this.target);
 if(delta.length()>this.maxDistance)camera.position.copy(this.target).add(delta.setLength(this.maxDistance));
 camera.lookAt(this.target);
}}}

// These bounds/surface points are pinned to the public n19 export. They are
// camera fixtures, independent of full-asset or native-solid fit audits.
const n19=new THREE.Box3(new THREE.Vector3(...fixture.accessor_world_bounds_m[0]),new THREE.Vector3(...fixture.accessor_world_bounds_m[1]));
const directions=[[[1,.65,1.4],[0,1,0]],[[0,0,1],[0,1,0]],[[0,0,-1],[0,1,0]],[[1,0,0],[0,1,0]],[[0,-1,0],[0,0,-1]]];
for(const scale of [1e-6,1,1e6])for(const [width,height,insets] of [[390,299,{top:60,bottom:62}],[320,250,{top:56,bottom:62}],[80,1000,{}],[2000,160,{}],[914,635,{left:120,right:20}]]){
 for(const [direction,up] of directions)for(const zoom of [.5,1,3]){
  const box=new THREE.Box3(n19.min.clone().multiplyScalar(scale),n19.max.clone().multiplyScalar(scale));
  const camera=new THREE.PerspectiveCamera(38,1,.0005,5);camera.zoom=zoom;camera.up.fromArray(up);
  frameHeadBounds(camera,controlsFor(camera),box,{direction,width,height,insets});
  depthCheck(camera,box);
  for(const point of corners(box)){
   const q=point.project(camera),x=(q.x+1)*width/2,y=(1-q.y)*height/2;
   assert(x>=(insets.left||0)-1e-8&&x<=width-(insets.right||0)+1e-8);
   assert(y>=(insets.top||0)-1e-8&&y<=height-(insets.bottom||0)+1e-8);
  }
  assert.equal(clip(camera,box).updated,false,'Same pose must be idempotent');
 }
}

// Dolly/pan/orbit, reversal, depth travel well beyond the original far=5, and
// bounds expansion/contraction all use the current view. Side clipping caused
// by a user's zoom/pan is intentional and must not be corrected by moving CAD.
const box=new THREE.Box3(new THREE.Vector3(-.05,-.07,-.04),new THREE.Vector3(.08,.09,.06));
const camera=new THREE.PerspectiveCamera(38,390/299,.0005,5);
let first;
for(const distance of [.25,2,20,2,.25])for(const angle of [0,.7,Math.PI,5.1,0]){
 const target=new THREE.Vector3(.025,-.015,0);
 camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle)*distance,.1*distance,Math.cos(angle)*distance));camera.lookAt(target);
 const result=clip(camera,box);assert(!result.crossesEyePlane);
 if(!first)first=[camera.near,camera.far];
}
assert.deepEqual([camera.near,camera.far],first,'A-to-B-to-A did not restore planes');
camera.zoom=4;camera.aspect=.08;camera.setViewOffset(80,1000,15,-20,80,1000);camera.updateProjectionMatrix();clip(camera,box);
camera.zoom=.2;camera.aspect=12.5;camera.clearViewOffset();camera.updateProjectionMatrix();clip(camera,box);
camera.position.set(0,0,.3);camera.lookAt(0,0,0);
const small=clip(camera,box),expanded=box.clone().expandByScalar(.1);clip(camera,expanded);clip(camera,box);
assert.deepEqual([camera.near,camera.far],[small.near,small.far]);

// A parented camera must use refreshed world transforms, not local position.
const parent=new THREE.Group(),child=new THREE.PerspectiveCamera(38,1,.0005,5);parent.add(child);
parent.position.set(.02,-.01,2);parent.rotation.set(.1,.2,.05);child.position.set(0,0,.3);clip(child,box);
parent.position.z=8;parent.rotation.y=-.3;clip(child,box);

// Eye inside, on a face, partially behind, a very close positive corner, and
// entirely behind. A positive near plane cannot include the eye/negative depth.
const crossingCamera=new THREE.PerspectiveCamera(38,1,.0005,5);
for(const bounds of [new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),new THREE.Box3(new THREE.Vector3(-1,-1,-1e-8),new THREE.Vector3(1,1,1))]){
 assert(clip(crossingCamera,bounds,false).crossesEyePlane);
}
crossingCamera.position.z=1;
assert(clip(crossingCamera,new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),false).crossesEyePlane);
const saved=[crossingCamera.near,crossingCamera.far,...crossingCamera.projectionMatrix.elements];
assert.equal(updateHeadClipping(crossingCamera,new THREE.Box3(new THREE.Vector3(-1,-1,2),new THREE.Vector3(1,1,3))).reason,'behind');
assert.equal(updateHeadClipping(crossingCamera,new THREE.Box3()).reason,'empty');
assert.deepEqual([crossingCamera.near,crossingCamera.far,...crossingCamera.projectionMatrix.elements],saved);
for(const value of [NaN,Infinity,-Infinity]){
 const invalid=box.clone();invalid.min.x=value;if(invalid.isEmpty())invalid.max.x=value;
 assert.throws(()=>updateHeadClipping(crossingCamera,invalid),/Nonfinite/);
}
assert.throws(()=>updateHeadClipping(new THREE.OrthographicCamera(),box),/perspective/);
const singular=new THREE.PerspectiveCamera();singular.scale.z=0;
assert.throws(()=>updateHeadClipping(singular,box),/transform/);
const invalidProjection=new THREE.PerspectiveCamera(38,1,.0005,5),previous=invalidProjection.projectionMatrix.clone();
invalidProjection.zoom=0;
assert.throws(()=>updateHeadClipping(invalidProjection,box),/projection/);
assert.equal(invalidProjection.near,.0005);assert.equal(invalidProjection.far,5);assert(invalidProjection.projectionMatrix.equals(previous));
assert.throws(()=>updateHeadClipping(new THREE.PerspectiveCamera(),new THREE.Box3(new THREE.Vector3(-1,-1,-Number.MAX_VALUE),new THREE.Vector3(1,1,-1))),/Unrepresentable/);
const pointBox=new THREE.Box3(new THREE.Vector3(0,0,-.2),new THREE.Vector3(0,0,-.2));clip(new THREE.PerspectiveCamera(),pointBox);

// Preserve depth separation between actual exported logo/body sample pairs.
// The integer comparison models24-bit depth, not a browser/GPU guarantee.
const samples=fixture.surface_samples_native_mm;assert(samples.length>=8);
const precise=new THREE.PerspectiveCamera(38,1,.0005,5),legacy=new THREE.PerspectiveCamera(38,1,.0005,5);
const frame={direction:[0,0,-1],width:914,height:635};
frameHeadBounds(precise,controlsFor(precise),n19,frame);legacy.copy(precise);legacy.near=.0005;legacy.far=5;legacy.updateProjectionMatrix();
assert(precise.position.distanceTo(legacy.position)<1e-12,'Precision fix changed the camera pose');
const depth=(p,c)=>(new THREE.Vector3(...p).multiplyScalar(.001).project(c).z+1)/2;
const quantized=(p,c)=>Math.round(depth(p,c)*(2**24-1));
let minimumGain=Infinity,minimumCandidateSteps=Infinity,maximumLegacySteps=0;
for(const row of samples){
 const {logo,body}=row;
 const oldDelta=depth(body,legacy)-depth(logo,legacy),newDelta=depth(body,precise)-depth(logo,precise);
 assert(oldDelta>0&&newDelta>0);
 const gain=newDelta/oldDelta,steps=quantized(body,precise)-quantized(logo,precise),oldSteps=quantized(body,legacy)-quantized(logo,legacy);
 assert(gain>20,'Dynamic planes did not materially improve n19 depth separation');
 assert(steps>=32&&steps>oldSteps+16,'n19 logo/body gap lacks quantized depth separation');
 minimumGain=Math.min(minimumGain,gain);minimumCandidateSteps=Math.min(minimumCandidateSteps,steps);maximumLegacySteps=Math.max(maximumLegacySteps,oldSteps);
}
depthCheck(precise,n19);

// Export bypasses the interactive draw loop and may choose another distance.
// Parent integration must pass prepareCamera, which receives the finished clone.
const interactiveState=[cameraState(precise),precise.near,precise.far];
for(const mode of ['current','custom']){
 const exported=createExportCamera(precise,{mode,target:n19.getCenter(new THREE.Vector3()),azimuth:145,elevation:-33,roll:20,distanceMm:2200,aspect:.25});
 clip(exported,n19);
}
assert.deepEqual([cameraState(precise),precise.near,precise.far],interactiveState);

console.log(JSON.stringify({status:'Head camera depth precision passed',poses,cornerChecks,sourceSurfaceSamples:samples.length,minimumGain,minimumCandidateSteps,maximumLegacySteps,scope:'Source-backed projection fixtures; no GPU or native-clearance claim.'}));

import * as THREE from 'three';

// bounds must enclose every visible renderable in world space. Call after camera
// controls/assembly motion, before rendering. This changes depth planes only.
export function updateHeadClipping(camera,bounds){
 if(!camera?.isPerspectiveCamera)throw Error('Head clipping requires a perspective camera');
 if(bounds.isEmpty())return {updated:false,reason:'empty'};
 if([...bounds.min.toArray(),...bounds.max.toArray()].some(n=>!Number.isFinite(n)))throw Error('Nonfinite head bounds');
 camera.updateWorldMatrix(true,false);
 const determinant=camera.matrixWorld.determinant();
 if(!Number.isFinite(determinant)||determinant===0||camera.matrixWorldInverse.elements.some(n=>!Number.isFinite(n)))throw Error('Invalid head camera transform');
 let minDepth=Infinity,maxDepth=-Infinity,minPositive=Infinity;
 const corner=new THREE.Vector3();
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  corner.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);
  if(corner.toArray().some(n=>!Number.isFinite(n)))throw Error('Nonfinite head camera bounds');
  const depth=-corner.z;
  minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);
  if(depth>0)minPositive=Math.min(minPositive,depth);
 }
 if(maxDepth<=0)return {updated:false,reason:'behind'};
 // A positive near plane cannot retain points at/behind the eye, or every
 // surface arbitrarily close to it. Report that case and prefer visibility to
 // precision; keep even the closest positive corner ahead of the near plane.
 const crossesEyePlane=minDepth<=0;
 const near=crossesEyePlane?Math.min(maxDepth*1e-6,minPositive*.5):minDepth*.9,far=maxDepth*1.1;
 if(!Number.isFinite(near)||!Number.isFinite(far)||!(near>0&&far>near))throw Error('Unrepresentable head clipping range');
 const updated=camera.near!==near||camera.far!==far;
 if(updated){
  const oldNear=camera.near,oldFar=camera.far,projection=camera.projectionMatrix.clone(),inverse=camera.projectionMatrixInverse.clone();
  camera.near=near;camera.far=far;camera.updateProjectionMatrix();
  if([...camera.projectionMatrix.elements,...camera.projectionMatrixInverse.elements].some(n=>!Number.isFinite(n))||camera.projectionMatrix.determinant()===0){
   camera.near=oldNear;camera.far=oldFar;camera.projectionMatrix.copy(projection);camera.projectionMatrixInverse.copy(inverse);
   throw Error('Unrepresentable head camera projection');
  }
 }
 return {updated,near,far,crossesEyePlane};
}

// Fit the actual assembly into the canvas area left clear by its controls.
// The offset moves the image center; it does not move any source CAD part.
export function frameHeadBounds(camera,controls,bounds,{direction,width,height,insets={},padding=1.12}){
 const {left=0,right=0,top=0,bottom=0}=insets;
 const numbers=[width,height,left,right,top,bottom,padding,...bounds.min.toArray(),...bounds.max.toArray(),...direction];
 if(numbers.some(n=>!Number.isFinite(n))||bounds.isEmpty()||width<=left+right||height<=top+bottom||Math.min(left,right,top,bottom)<0||padding<1)throw Error('Invalid head camera frame');
 const back=new THREE.Vector3(...direction).normalize(),horizontal=new THREE.Vector3().crossVectors(camera.up,back).normalize();
 if(!back.lengthSq()||!horizontal.lengthSq())throw Error('Invalid head camera direction');
 const vertical=new THREE.Vector3().crossVectors(back,horizontal),center=bounds.getCenter(new THREE.Vector3());
 const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/camera.zoom;
 const tx=tangent*(width/height)*(width-left-right)/width/padding,ty=tangent*(height-top-bottom)/height/padding;
 let distance=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const corner=new THREE.Vector3(x,y,z).sub(center);
  distance=Math.max(distance,corner.dot(back)+Math.abs(corner.dot(horizontal))/tx,corner.dot(back)+Math.abs(corner.dot(vertical))/ty);
 }
 if(!(distance>0))throw Error('Empty head camera frame');
 if(Number.isFinite(controls.maxDistance)&&controls.maxDistance<distance)controls.maxDistance=distance*1.5;
 camera.aspect=width/height;
 if(left||right||top||bottom)camera.setViewOffset(width,height,(right-left)/2,(bottom-top)/2,width,height);
 else camera.clearViewOffset();
 camera.position.copy(center).addScaledVector(back,distance);controls.target.copy(center);controls.update();
 updateHeadClipping(camera,bounds);
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 return {distance,insets:{left,right,top,bottom}};
}

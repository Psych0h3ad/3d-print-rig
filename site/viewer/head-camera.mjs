import * as THREE from 'three';

// Fit the actual assembly into the canvas area left clear by its controls.
// The offset moves the image center; it does not move any source CAD part.
export function frameHeadBounds(camera,controls,bounds,{direction,width,height,insets={},padding=1.12}){
 const {left=0,right=0,top=0,bottom=0}=insets;
 const numbers=[width,height,left,right,top,bottom,padding,...bounds.min.toArray(),...bounds.max.toArray(),...direction];
 if(numbers.some(n=>!Number.isFinite(n))||bounds.isEmpty()||width<=left+right||height<=top+bottom||Math.min(left,right,top,bottom)<0||padding<1)throw Error('Invalid head camera frame');
 const back=new THREE.Vector3(...direction).normalize(),horizontal=new THREE.Vector3().crossVectors(camera.up,back).normalize();
 if(!back.lengthSq()||!horizontal.lengthSq())throw Error('Invalid head camera direction');
 const vertical=new THREE.Vector3().crossVectors(back,horizontal),center=bounds.getCenter(new THREE.Vector3());
 const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
 const tx=tangent*(width/height)*(width-left-right)/width/padding,ty=tangent*(height-top-bottom)/height/padding;
 let distance=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const corner=new THREE.Vector3(x,y,z).sub(center);
  distance=Math.max(distance,corner.dot(back)+Math.abs(corner.dot(horizontal))/tx,corner.dot(back)+Math.abs(corner.dot(vertical))/ty);
 }
 if(!(distance>0))throw Error('Empty head camera frame');
 if(Number.isFinite(controls.maxDistance)&&controls.maxDistance<distance)controls.maxDistance=distance*1.5;
 camera.far=Math.max(camera.far,distance+bounds.getSize(new THREE.Vector3()).length()*2);
 camera.aspect=width/height;
 if(left||right||top||bottom)camera.setViewOffset(width,height,(right-left)/2,(bottom-top)/2,width,height);
 else camera.clearViewOffset();
 camera.position.copy(center).addScaledVector(back,distance);controls.target.copy(center);controls.update();
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 return {distance,insets:{left,right,top,bottom}};
}

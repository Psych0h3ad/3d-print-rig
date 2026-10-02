import * as THREE from 'three';
export function cameraAngles(camera,target){const delta=camera.position.clone().sub(target),distance=delta.length();return {azimuth:THREE.MathUtils.radToDeg(Math.atan2(delta.x,delta.z)),elevation:THREE.MathUtils.radToDeg(Math.atan2(delta.y,Math.hypot(delta.x,delta.z))),distanceMm:distance*1000}}
export function createExportCamera(camera,{mode='current',target,azimuth=0,elevation=0,roll=0,distanceMm,aspect=camera.aspect}={}){
 const result=camera.clone();if(!Number.isFinite(aspect)||aspect<=0)throw Error('画像の縦横比が不正です');result.aspect=aspect;
 if(mode==='custom'){
  if(!target?.isVector3||[azimuth,elevation,roll,distanceMm,...target.toArray()].some(v=>!Number.isFinite(v))||distanceMm<=0||distanceMm>20000||Math.abs(elevation)>90)throw Error('角度または距離が不正です');
  const yaw=THREE.MathUtils.degToRad(azimuth),pitch=THREE.MathUtils.degToRad(elevation),distance=distanceMm/1000;
  result.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));
  result.up.set(0,Math.abs(elevation)===90?0:1,elevation===90?-1:elevation===-90?1:0);result.lookAt(target);result.rotateZ(THREE.MathUtils.degToRad(roll));
 }else if(mode!=='current')throw Error('未登録の視点です');
 result.updateProjectionMatrix();result.updateMatrixWorld(true);return result;
}

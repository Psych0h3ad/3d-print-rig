import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from './vendor/RectAreaLightUniformsLib.js';

export function setupLighting(scene,renderer){
 const $=s=>document.querySelector(s);
 RectAreaLightUniformsLib.init();
 const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.04);
 scene.environment=env.texture;room.dispose();pmrem.dispose();
 const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25);scene.add(ambient);
 const daylight=[];
 for(const[p,i]of [[[1,2,2],1.4],[[-2,1,0],.5],[[0,2,-2],.8]]){
  const light=new THREE.DirectionalLight(0xffffff,i);light.position.set(...p);scene.add(light);daylight.push({light,intensity:i});
 }
 const lights=[];
 const viewVector=v=>new THREE.Vector3(v[0],v[2],-v[1]);
 function lightColor(t){
  const mode=$('#ledColor').value;
  return mode==='rainbow'?new THREE.Color().setHSL(t*.82,.9,.52):new THREE.Color(mode==='red'?0xff1838:mode==='blue'?0x387dff:0xfff4e7);
 }
 let mod=null,ready=false;const emitters=[];
 function apply(){
  const installed=$('#ledMod').checked,power=$('#ledPower').checked,night=$('#night').checked,value=+$('#ledLevel').value/100;
  const on=installed&&power&&ready;
  if(mod)mod.visible=installed;
  for(const light of lights){light.intensity=on?260*value:0;light.color.copy(lightColor(light.userData.t))}
  for(const mesh of emitters){mesh.material.emissive.copy(on?lightColor(mesh.userData.t):new THREE.Color(0));mesh.material.emissiveIntensity=on?3.2*value:0}
  scene.background.set(night?'#04070c':'#edf1f5');scene.environmentIntensity=night?.006:.16;
  ambient.intensity=night?.008:.25;
  for(const entry of daylight)entry.light.intensity=night?0:entry.intensity;
  renderer.toneMappingExposure=night?1.35:.9;
  document.body.classList.toggle('night',night);
  $('#ledPower').disabled=!installed||!ready;$('#ledLevel').disabled=!installed||!power||!ready;
  $('#ledColor').disabled=!installed||!power||!ready;
  $('#focusDisco').disabled=!installed||!ready;
  $('#ledPercent').textContent=Math.round(value*100)+'%';
  $('#lightStatus').textContent=(night?'暗室':'昼間')+' ／ '+(!installed?'LED Modなし':on&&value>0?'庫内LED点灯':'庫内LED消灯');
 }
 for(const id of ['ledMod','ledPower','night','ledLevel','ledColor'])$('#'+id).addEventListener('input',apply);
 $('#nightOn').onclick=()=>{$('#ledMod').checked=true;$('#ledPower').checked=true;$('#night').checked=true;if(+$('#ledLevel').value===0)$('#ledLevel').value=75;apply()};
 const whenReady=Promise.all([fetch('../DISCO_MOD.json').then(r=>r.json()),loadModel(new GLTFLoader(),'../Disco_on_a_Stick_XXL_350.glb')]).then(([data,g])=>{
  mod=g.scene;mod.name='Disco_on_a_Stick_XXL';scene.add(mod);
  mod.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();if(o.userData.led_role==='LED'){o.material.roughness=.35;emitters.push(o)}});
  for(const spec of data.lights){
   const u=viewVector(spec.along),n=viewVector(spec.normal),v=new THREE.Vector3().crossVectors(n,u);
   const members=emitters.filter(o=>o.userData.side===spec.side);
   members.sort((a,b)=>{a.geometry.computeBoundingBox();b.geometry.computeBoundingBox();return a.geometry.boundingBox.getCenter(new THREE.Vector3()).dot(u)-b.geometry.boundingBox.getCenter(new THREE.Vector3()).dot(u)});
   members.forEach((o,i)=>o.userData.t=i/(members.length-1));
   for(let i=0;i<3;i++){
    const light=new THREE.RectAreaLight(0xffffff,0,spec.length_mm/3000,spec.width_mm/1000);
    light.position.copy(viewVector(spec.center_mm).multiplyScalar(.001)).addScaledVector(u,(i-1)*spec.length_mm/3000);
    light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,v.clone().negate(),n.clone().negate()));
    light.userData.t=(i+.5)/3;scene.add(light);lights.push(light);
   }
  }
  ready=true;for(const id of ['ledMod','ledPower','nightOn','ledLevel','ledColor'])$('#'+id).disabled=false;apply();
  return mod;
 }).catch(e=>{$('#lightStatus').textContent='Disco Modの読込に失敗しました';console.error(e)});
 apply();
 return {apply,whenReady};
}

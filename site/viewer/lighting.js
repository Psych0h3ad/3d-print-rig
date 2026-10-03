import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=rear-cooling-34';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from './vendor/RectAreaLightUniformsLib.js';
import {lightingState} from './lighting-state.mjs?v=rear-cooling-34';
import {ledSample,ledEffects,createLedAnimator} from './lighting-animation.mjs?v=rear-cooling-34';

export function setupLighting(scene,renderer,{registration={meta:'DISCO_MOD.json',glb:'Disco_on_a_Stick_XXL_350.glb',translation_mm:[0,0,0]},machine='siboor_trident_350',update=()=>{}}={}){
 const $=s=>document.querySelector(s);
 scene.background ||= new THREE.Color('#edf1f5');
 const rig=new THREE.Group(),p=registration.translation_mm;rig.name='Fixed_Frame_Disco';rig.position.set(p[0]/1000,p[2]/1000,-p[1]/1000);scene.add(rig);
 const storageKey='3d-print-rig-lighting-'+machine;
 const effects=document.createElement('label');effects.htmlFor='ledEffect';effects.textContent='発光パターン';
 const effectSelect=document.createElement('select');effectSelect.id='ledEffect';
 for(const [value,text]of [['static','固定'],['flow','色の流れ'],['breath','呼吸'],['chase','チェイス']])effectSelect.append(Object.assign(document.createElement('option'),{value,textContent:text}));effectSelect.value='flow';
 const speedLabel=document.createElement('label');speedLabel.htmlFor='ledAnimationSpeed';speedLabel.innerHTML='<span class="axislabel">発光の速度<strong id="ledAnimationRate">1.0×</strong></span>';
 const speed=document.createElement('input');Object.assign(speed,{id:'ledAnimationSpeed',type:'range',min:'0',max:'200',step:'10',value:'100'});
 $('#ledColor').after(effects,effectSelect,speedLabel,speed);
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
  for(const [key,id] of [['installed','ledMod'],['power','ledPower'],['night','night']])if(typeof saved?.[key]==='boolean')$('#'+id).checked=saved[key];
  if(Number.isFinite(saved?.level)&&saved.level>=0&&saved.level<=100)$('#ledLevel').value=saved.level;
  if(['white','red','blue','rainbow'].includes(saved?.color))$('#ledColor').value=saved.color;
  if(ledEffects.includes(saved?.effect))effectSelect.value=saved.effect;
  if(Number.isFinite(saved?.animationSpeed)&&saved.animationSpeed>=0&&saved.animationSpeed<=200)speed.value=saved.animationSpeed;
 }catch{}
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({installed:$('#ledMod').checked,power:$('#ledPower').checked,night:$('#night').checked,level:Number($('#ledLevel').value),color:$('#ledColor').value,effect:effectSelect.value,animationSpeed:Number(speed.value)}))}catch{}}
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
 let mod=null,ready=false,failed=false,currentState;const emitters=[],color=new THREE.Color();
 function frame(seconds){
  const {on=false,value=0}=currentState||{},sample=t=>ledSample({color:$('#ledColor').value,effect:effectSelect.value,position:t,seconds});
  const setColor=s=>s.rainbow?color.setHSL(s.hue,.9,.52):color.setHex(s.hex);
  for(const light of lights){const s=sample(light.userData.t);light.color.copy(setColor(s));light.intensity=on?260*value*s.gain:0}
  for(const mesh of emitters){const s=sample(mesh.userData.t);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.emissive.copy(on?setColor(s):color.setHex(0));material.emissiveIntensity=on?3.2*value*s.gain:0}}
  document.body.dataset.ledAnimation=effectSelect.value;document.body.dataset.ledAnimationTime=seconds.toFixed(3);update();
 }
 const animator=createLedAnimator({active:()=>Boolean(currentState?.on&&effectSelect.value!=='static'&&Number(speed.value)>0&&!document.hidden),rate:()=>Number(speed.value)/100,draw:frame});
 function apply(){
  const state=lightingState({installed:$('#ledMod').checked,power:$('#ledPower').checked,night:$('#night').checked,level:$('#ledLevel').value,ready,failed}),{installed,on,night,value}=state;
  currentState=state;
  if(mod)mod.visible=installed;
  frame(animator.seconds);animator.refresh();
  scene.background.set(night?'#04070c':'#edf1f5');scene.environmentIntensity=night?.006:.16;
  ambient.intensity=night?.008:.25;
  for(const entry of daylight)entry.light.intensity=night?0:entry.intensity;
  renderer.toneMappingExposure=night?1.35:.9;
  document.body.classList.toggle('night',night);
  $('#ledPower').disabled=state.powerDisabled;$('#ledLevel').disabled=state.adjustDisabled;
  $('#ledColor').disabled=state.adjustDisabled;
  effectSelect.disabled=state.adjustDisabled;speed.disabled=state.adjustDisabled||effectSelect.value==='static';
  $('#ledAnimationRate').textContent=(Number(speed.value)/100).toFixed(1)+'×';
  $('#focusDisco').disabled=!installed||!ready;
  $('#ledPercent').textContent=Math.round(value*100)+'%';
  $('#lightStatus').textContent=state.status;
  document.body.dataset.discoInstalled=String(installed&&ready);document.body.dataset.discoFramePosition=JSON.stringify(rig.position.toArray());update();
 }
 for(const id of ['ledMod','ledPower','night','ledLevel','ledColor','ledEffect','ledAnimationSpeed'])$('#'+id).addEventListener('input',()=>{save();apply()});
 document.addEventListener('visibilitychange',()=>animator.refresh());
 window.addEventListener('pagehide',e=>e.persisted?animator.stop():animator.dispose());window.addEventListener('pageshow',()=>animator.refresh());
 $('#nightOn').onclick=()=>{$('#ledMod').checked=true;$('#ledPower').checked=true;$('#night').checked=true;if(+$('#ledLevel').value===0)$('#ledLevel').value=75;save();apply()};
 const whenReady=Promise.all([fetch('../'+registration.meta).then(r=>{if(!r.ok)throw Error('Disco取付データ');return r.json()}),loadModel(new GLTFLoader(),'../'+registration.glb)]).then(([data,g])=>{
  mod=g.scene;mod.name='Disco_on_a_Stick_XXL';rig.add(mod);
  mod.traverse(o=>{if(!o.isMesh)return;const shift=registration.side_translation_mm?.[o.userData.side];if(shift)o.position.add(viewVector(shift).multiplyScalar(.001));o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.userData.led_role==='LED'){for(const m of Array.isArray(o.material)?o.material:[o.material])m.roughness=.35;emitters.push(o)}});
  if(emitters.length!==data.leds_per_stick*data.stick_count)throw Error('Disco LED部品数の不一致');
  for(const spec of data.lights){
   const u=viewVector(spec.along),n=viewVector(spec.normal),v=new THREE.Vector3().crossVectors(n,u);
   const members=emitters.filter(o=>o.userData.side===spec.side);
   members.sort((a,b)=>{a.geometry.computeBoundingBox();b.geometry.computeBoundingBox();return a.geometry.boundingBox.getCenter(new THREE.Vector3()).dot(u)-b.geometry.boundingBox.getCenter(new THREE.Vector3()).dot(u)});
   if(members.length!==data.leds_per_stick)throw Error('Disco左右のLED登録不一致');members.forEach((o,i)=>o.userData.t=i/Math.max(1,members.length-1));
   for(let i=0;i<3;i++){
    const light=new THREE.RectAreaLight(0xffffff,0,spec.length_mm/3000,spec.width_mm/1000);
    light.position.copy(viewVector(spec.center_mm.map((v,j)=>v+(registration.side_translation_mm?.[spec.side]?.[j]||0))).multiplyScalar(.001)).addScaledVector(u,(i-1)*spec.length_mm/3000);
    light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,v.clone().negate(),n.clone().negate()));
    light.userData.t=(i+.5)/3;rig.add(light);lights.push(light);
   }
  }
  ready=true;for(const id of ['ledMod','ledPower','nightOn','ledLevel','ledColor'])$('#'+id).disabled=false;apply();
  return mod;
 }).catch(e=>{failed=true;if(mod)mod.visible=false;apply();console.error(e)});
 apply();
 function focus(camera,controls){if(!ready||!mod)return;rig.updateMatrixWorld(true);const box=new THREE.Box3();mod.traverse(o=>{if(o.isMesh&&o.userData.side==='left')box.expandByObject(o)});if(box.isEmpty())return;camera.up.set(0,1,0);box.getCenter(controls.target);camera.position.copy(controls.target).add(new THREE.Vector3(.16,-.07,.24));controls.update();update()}
 return {apply,whenReady,rig,focus,animator};
}

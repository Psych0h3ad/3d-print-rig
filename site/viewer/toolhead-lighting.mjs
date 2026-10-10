import * as THREE from 'three';
import {prepareLedSurface,restoreLedSurface} from './led-emission-surface.mjs?v=af40a3200e128a08c940';
import * as identities from './toolhead-led-identities.mjs?v=39dec8b48b8d0d1a46d6';
import {ledSample,createLedAnimator} from './lighting-animation.mjs';

const visible=object=>object.visible&&(!object.parent||visible(object.parent));
const belongs=(object,scene)=>object===scene||Boolean(object.parent&&belongs(object.parent,scene));
export function createToolheadLedRig(scene,{identify=identities.sourceLedIdentity,apertureFor=identities.sourceLedAperture,guideFor=identities.sourceOpticalGuide||(()=>null),own=()=>{}}={}){
 const seen=new WeakSet(),emitters=[],guides=[],color=new THREE.Color();
 function restoreGuide(e){for(const m of e.materials)m.dispose();e.mesh.material=e.originalMaterial;delete e.mesh.userData.ledGuide;}
 function discover(){
  for(let i=emitters.length-1;i>=0;i--){const e=emitters[i];if(!belongs(e.mesh,scene)){e.mesh.remove(e.light);restoreLedSurface(e.mesh);seen.delete(e.mesh);emitters.splice(i,1);}}
  for(let i=guides.length-1;i>=0;i--){const e=guides[i];if(!belongs(e.mesh,scene)){restoreGuide(e);seen.delete(e.mesh);guides.splice(i,1);}}
  scene.traverse(mesh=>{
  if(!mesh.isMesh||seen.has(mesh))return;seen.add(mesh);
  const identity=identify(mesh);if(!identity){const guide=guideFor(mesh);if(guide){const originalMaterial=mesh.material,materials=[].concat(originalMaterial).map(m=>m.clone());for(const m of [].concat(originalMaterial))own(m);mesh.material=Array.isArray(originalMaterial)?materials:materials[0];const e={mesh,guide,materials,originalMaterial};mesh.userData.ledGuide={originalMaterial};guides.push(e);}return;}
  const aperture=apertureFor(mesh),surface=prepareLedSurface(mesh,{...identity,aperture});own(surface.originalGeometry);for(const m of [].concat(surface.originalMaterial))own(m);
  const p=mesh.geometry.attributes.position,n=new THREE.Vector3(...identity.normal),center=new THREE.Vector3(),v=new THREE.Vector3();let front=-Infinity;
  if(aperture)center.fromArray(aperture.center).addScaledVector(n,.00015);
  else{for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);center.add(v);front=Math.max(front,v.dot(n));}center.multiplyScalar(1/p.count);center.addScaledVector(n,front-center.dot(n)+.00015);}
  const light=new THREE.PointLight(0xffffff,0,.07,2);light.position.copy(center);light.name='Native_toolhead_LED_'+identity.id;mesh.add(light);light.updateWorldMatrix(true,false);
  emitters.push({mesh,identity,surface,light});
  });return emitters;
 }
 function update({power=true,level=75,color:mode='white',effect='static',seconds=0}={}){
  discover();let count=0;
  for(const [i,entry]of emitters.entries()){
   const on=power&&visible(entry.mesh)&&Number(level)>0;if(visible(entry.mesh))count++;
   const nozzle=entry.identity.kind==='nozzle',sample=ledSample({color:nozzle?'white':mode,effect:nozzle?'static':effect,position:(i%3)/2,seconds});
   if(nozzle)color.setHex(0xffffff);else if(sample.rainbow)color.setHSL(sample.hue,.9,.52);else color.setHex(sample.hex);
   const gain=on?Math.max(0,Math.min(100,Number(level)||0))/100*sample.gain:0;
   for(const material of entry.surface.materials){material.emissive.copy(color);material.emissiveIntensity=3.2*gain;}
   entry.light.color.copy(color);entry.light.intensity=(nozzle?.004:.0015)*gain;
  }
  for(const e of guides){
   // These guarded source exports place the guide and PCB in the same native
   // asset root. Never ascend to the bank/machine and borrow another head's PCB.
   const root=e.mesh.parent,paired=root&&root!==scene?emitters.filter(p=>(e.guide.led_ids||[e.guide.emitter_id]).includes(p.identity.id)&&belongs(p.mesh,root)):[];
   const emitter=paired.find(p=>visible(p.mesh)),gain=emitter&&visible(e.mesh)?emitter.surface.materials[0].emissiveIntensity:0;
   for(const [i,m]of e.materials.entries()){const original=[].concat(e.originalMaterial)[i];m.color.copy(original.color);m.metalness=original.metalness;m.roughness=original.roughness;m.emissiveIntensity=gain;if(emitter)m.emissive.copy(emitter.surface.materials[0].emissive);}
  }
  return {installed:count,lit:power&&level>0?count:0,registered:emitters.length};
 }
 function dispose(){for(const e of emitters){e.mesh.remove(e.light);restoreLedSurface(e.mesh);seen.delete(e.mesh);}for(const e of guides){restoreGuide(e);seen.delete(e.mesh);}emitters.length=0;guides.length=0;}
 return {discover,update,dispose,emitters,guides};
}

export function setupToolheadLighting(scene,{scope}={}){
 const document=globalThis.document,aside=document?.querySelector('aside');if(!aside||scene.userData.toolheadLedController)return;
 const key='3d-print-rig-toolhead-led-v1',state={power:true,level:75,color:'red',effect:'static'};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(typeof saved?.power==='boolean')state.power=saved.power;if(Number.isFinite(saved?.level)&&saved.level>=0&&saved.level<=100)state.level=saved.level;if(['white','red','blue','rainbow'].includes(saved?.color))state.color=saved.color;if(['static','flow','breath','chase'].includes(saved?.effect))state.effect=saved.effect;}catch{}
 const panel=document.createElement('details');panel.id='toolheadLighting';
 panel.innerHTML='<summary data-i18n-id="led.head_section">Toolhead lighting</summary><label><input id="headLedPower" type="checkbox"><span data-i18n-id="led.head_power">Turn on toolhead LEDs</span></label><label for="headLedLevel" data-i18n-id="led.head_brightness">Toolhead LED brightness</label><input id="headLedLevel" type="range" min="0" max="100" step="5"><label for="headLedColor" data-i18n-id="led.head_color">Logo LED color</label><select id="headLedColor"><option value="white">White</option><option value="red">Red</option><option value="blue">Blue</option><option value="rainbow">Rainbow</option></select><label for="headLedEffect" data-i18n-id="led.head_effect">Logo LED effect</label><select id="headLedEffect"><option value="static">Fixed</option><option value="flow">Flow</option><option value="breath">Breathing</option><option value="chase">Chase</option></select><p class="foot" data-i18n-id="led.head_scope">Only LEDs included in the source CAD are lit. Nozzle lights stay white.</p><p id="headLedStatus" class="status" aria-live="polite"></p>';
 const controls={power:panel.querySelector('#headLedPower'),level:panel.querySelector('#headLedLevel'),color:panel.querySelector('#headLedColor'),effect:panel.querySelector('#headLedEffect')};
 controls.power.checked=state.power;controls.level.value=state.level;controls.color.value=state.color;controls.effect.value=state.effect;
 panel.hidden=true;aside.append(panel);
 const rig=createToolheadLedRig(scene,{own:value=>scope?.resource(value)});
 let renderer,camera,last={installed:0,lit:0},attached=false;
 const redraw=()=>{if(renderer&&camera&&!scope?.disposed)renderer.render(scene,camera)};
 const animator=createLedAnimator({active:()=>state.power&&state.level>0&&state.effect!=='static'&&last.installed>0&&!document.hidden,draw:seconds=>{rig.update({...state,seconds});redraw();}});
 function update(){
  last=rig.update({...state,seconds:animator.seconds});panel.hidden=!last.installed;
  for(const [k,input]of Object.entries(controls))input.disabled=!last.installed||(k!=='power'&&!state.power);
  const status=panel.querySelector('#headLedStatus');status.textContent=last.lit+' / '+last.installed+' LED';
  Object.assign(document.body.dataset,{toolheadLedInstalled:String(last.installed),toolheadLedLit:String(last.lit),toolheadLedLevel:String(state.level),toolheadLedEffect:state.effect,toolheadLedTime:animator.seconds.toFixed(3)});
  if(last.installed&&!attached){attached=true;animator.refresh();}
  if(!last.installed&&animator.running){attached=false;animator.stop();}
 }
 const previous=scene.onBeforeRender;
 scene.onBeforeRender=function(r,s,c,...rest){previous.call(this,r,s,c,...rest);if(!r.getRenderTarget()){renderer=r;camera=c;}update();};
 const listen=(target,event,fn)=>{target.addEventListener(event,fn);scope?.cleanup(()=>target.removeEventListener(event,fn));};
 for(const input of Object.values(controls))listen(input,'input',()=>{state.power=controls.power.checked;state.level=Number(controls.level.value);state.color=controls.color.value;state.effect=controls.effect.value;try{localStorage.setItem(key,JSON.stringify(state));}catch{}update();animator.refresh();redraw();});
 listen(document,'visibilitychange',()=>animator.refresh());
 scope?.cleanup(()=>{animator.dispose();scene.onBeforeRender=previous;rig.dispose();panel.remove();delete scene.userData.toolheadLedController;});
 scene.userData.toolheadLedController=rig;
 return {rig,state,update,animator,panel};
}

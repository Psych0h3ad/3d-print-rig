import {workspaceFrame,workspaceListen,workspaceTask} from './workspace-lifecycle.mjs';
import {validateAxes} from './community-state.mjs?v=460b3fa78cc503ddb6e6';
import {translate} from './i18n.mjs?v=434a340d78f8803fcf98';
export function setupNativeMotionControls({adapter,profile,camera,controls,render,scope,onPose=()=>{},getDisplay=()=>({}),setDisplay=()=>{},validateDisplay=()=>{}}){
 const $=id=>document.getElementById(id),zero=()=>Object.fromEntries(Object.keys(profile.axes).map(k=>[k,0])),t=s=>translate(s,document.documentElement.lang);let animation=null;
 function set(next){adapter.setAxes(next);for(const[k,v]of Object.entries(next)){$(k).value=v;$(k+'Value').textContent=v.toFixed(1)+' mm'}document.body.dataset.pose=JSON.stringify(next);onPose();render()}
 for(const[k,range]of Object.entries(profile.axes)){const input=$(k);input.min=range[0];input.max=range[1];input.step='any';input.disabled=false;input.oninput=()=>{animation=null;set({...adapter.getAxes(),[k]:Number(input.value)})}}
 $('motionPause').onclick=()=>{animation=null};$('resetPose').onclick=()=>{animation=null;set(zero())};
 function frame(time){if(!animation||scope.disposed)return;const u=(time-animation.start)/24000,stage=Math.min(2,Math.floor(u*3)),v=Math.min(1,u*3-stage),e=.5-.5*Math.cos(v*Math.PI);const next={};
  for(const[k,r]of Object.entries(profile.axes)){const points=[animation.from[k],r[0],r[1],0];next[k]=points[stage]+(points[stage+1]-points[stage])*e}
  set(next);if(u>=1)animation=null;else workspaceFrame(frame);
 }
 $('motionPlay').onclick=()=>{animation={start:performance.now(),from:adapter.getAxes()};workspaceFrame(frame)};
 scope.cleanup(()=>{animation=null});
 for(const id of ['motionPlay','motionPause','resetPose'])$(id).disabled=false;
 const notices=$('motionNotices');if(notices){const describe=()=>notices.replaceChildren(...(profile.motion_registration.notices||[]).map(s=>{const p=document.createElement('p');p.className='foot';p.textContent=t(s);return p}));describe();workspaceListen(window,'rig-language-change',describe)}
 function capture(){return {schema:'3d-print-rig.native-motion.v1',machine:profile.machine_id,model_sha256:profile.motion_registration.model_sha256,axes:adapter.getAxes(),display:getDisplay(),camera:{position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()}}}
 function restore(data){if(data?.schema!=='3d-print-rig.native-motion.v1'||data.machine!==profile.machine_id||data.model_sha256!==profile.motion_registration.model_sha256)throw Error('Configuration belongs to another native assembly');validateAxes(data.axes,profile);
  for(const k of ['position','target','up'])if(!Array.isArray(data.camera?.[k])||data.camera[k].length!==3||!data.camera[k].every(v=>Number.isFinite(v)&&Math.abs(v)<30))throw Error('Invalid camera');
  if(Math.hypot(...data.camera.up)<.5||data.camera.position.every((v,i)=>Math.abs(v-data.camera.target[i])<.001))throw Error('Invalid camera');
  if(data.display!==undefined)validateDisplay(data.display);
  animation=null;if(data.display!==undefined)setDisplay(data.display);set(data.axes);camera.position.fromArray(data.camera.position);camera.up.fromArray(data.camera.up);controls.target.fromArray(data.camera.target);controls.update();render();
 }
 if($('saveConfiguration')){
  $('saveConfiguration').disabled=$('loadConfiguration').disabled=false;
  $('saveConfiguration').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(capture(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=profile.machine_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('configurationStatus').textContent=t('構成JSONを保存しました。')};
  $('loadConfiguration').onclick=()=>$('configurationFile').click();$('configurationFile').onchange=()=>workspaceTask(async()=>{const file=$('configurationFile').files?.[0];$('configurationFile').value='';if(!file)return;try{if(file.size>65536)throw Error('Configuration exceeds 64 KB');restore(JSON.parse(await file.text()));$('configurationStatus').textContent=t('構成JSONを復元しました。')}catch(e){$('configurationStatus').textContent=e.message}});
 }
 document.body.dataset.motionEnabled='true';set(zero());return {set,capture,restore};
}

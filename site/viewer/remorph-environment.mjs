import * as THREE from 'three';
import {sceneLightingState} from './scene-lighting-state.mjs?v=extra-machines-55';
export function createRemorphEnvironment(scene,renderer,profile){
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshStandardMaterial({color:'#e0e4e7',roughness:.86}));
 floor.rotation.x=-Math.PI/2;floor.position.y=profile.environment.floor_z_mm/1000;floor.receiveShadow=true;floor.visible=false;scene.add(floor);
 const grid=new THREE.GridHelper(3,60,'#a1aeb9','#c5ced5');grid.position.y=floor.position.y+.0002;grid.visible=false;scene.add(grid);
 const ambient=new THREE.HemisphereLight('#ffffff','#697780',.35),key=new THREE.DirectionalLight('#ffffff',1.4),fill=new THREE.DirectionalLight('#dceaff',.6);
 key.position.set(1.2,1.8,1.3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-.8;key.shadow.camera.right=.8;key.shadow.camera.top=.9;key.shadow.camera.bottom=-.8;key.shadow.normalBias=.001;
 fill.position.set(-1,.6,-.8);scene.add(ambient,key,fill);
 const leds=profile.environment.leds.map(p=>{const light=new THREE.PointLight('#fff1da',0,1.1,2);light.position.set(p.center_mm[0]/1000,p.center_mm[2]/1000,-p.center_mm[1]/1000);scene.add(light);return light});
 const ledKeys=new Set(profile.environment.leds.map(p=>p.part_key)),materials=[];scene.traverse(n=>{if(n.isMesh&&ledKeys.has(n.userData?.part_key))materials.push(...[].concat(n.material))});
 let brightness=profile.environment.led_startup_percent,dark=false,roomDark=false;
 function setBrightness(percent){if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Invalid brightness');brightness=percent;for(const light of leds)light.intensity=.4*percent/100;for(const material of materials){material.emissive.set('#fff1da');material.emissiveIntensity=2*percent/100}return percent}
 function applyRoom(){const room=sceneLightingState({darkUI:dark,roomDark,ledAvailable:leds.length>0});scene.background=new THREE.Color(room.background);renderer.toneMappingExposure=room.exposure;ambient.intensity=room.darkRoom?.025:.35;key.intensity=room.darkRoom?.025:1.4;fill.intensity=room.darkRoom?.025:.6;return room}
 function setDark(value){dark=Boolean(value);applyRoom();return dark}
 function setRoomDark(value){roomDark=Boolean(value);return applyRoom()}
 function setFloor({visible=false,finish='matte',gridVisible=false}={}){if(!['matte','dark','workshop'].includes(finish))throw Error('Invalid floor finish');floor.visible=Boolean(visible);grid.visible=Boolean(gridVisible);floor.material.color.set(finish==='dark'?'#30383f':finish==='workshop'?'#a8adb0':'#e0e4e7')}
 setBrightness(brightness);setDark(false);
 return {floor,grid,leds,setBrightness,setFloor,setDark,setRoomDark,getBrightness:()=>brightness};
}

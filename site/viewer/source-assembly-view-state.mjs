import {settleCameraPose} from './responsive-camera.mjs?v=149a79a654914b2af652';
export function validateCamera(c){
 for(const key of ['position','target','up'])if(!Array.isArray(c?.[key])||c[key].length!==3||!c[key].every(v=>Number.isFinite(v)&&Math.abs(v)<100))throw Error('Invalid saved camera');
 const eye=c.position.map((v,i)=>v-c.target[i]),distance=Math.hypot(...eye),upLength=Math.hypot(...c.up);
 if(distance<.001||Math.abs(upLength-1)>1e-9)throw Error('Invalid saved camera basis');
 const cross=[eye[1]*c.up[2]-eye[2]*c.up[1],eye[2]*c.up[0]-eye[0]*c.up[2],eye[0]*c.up[1]-eye[1]*c.up[0]];
 if(Math.hypot(...cross)/distance<1e-8)throw Error('Camera up is parallel to the view');
 return c;
}
export function captureCamera(camera,controls){return validateCamera({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()});}
export function restoreCamera(c,camera,controls){validateCamera(c);camera.position.fromArray(c.position);camera.up.fromArray(c.up);controls.target.fromArray(c.target);settleCameraPose(camera,controls);}
export function validateSavedView(saved,machine){
 if(saved?.schema!=='source-assembly-view-v1'||saved.machine!==machine||!['full','head'].includes(saved.view)||!saved.settings)throw Error('Wrong saved configuration');
 validateCamera(saved.settings.camera);
 return saved;
}

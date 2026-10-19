import assert from 'node:assert/strict';
import fs from 'node:fs';
import{PerspectiveCamera,Vector3}from '../site/viewer/vendor-r180/three.module.js';
import{bindSourceConfigurationLoad,selectSourceCameraPreset}from '../site/viewer/source-assembly-configuration-ui.mjs';
import{createSourceUIText}from '../site/viewer/source-assembly-ui-text.mjs';
import{sourceText}from '../site/viewer/source-assembly-messages.mjs';

// Exercise the installed file-input event handler and the real camera and
// localized text helpers. The minimal button DOM records actual ARIA writes;
// model loading and browser/WebGL review remain separate checks.
class Button{
 constructor(id){this.id=id;this.attributes=new Map();}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
}
const ids=['iso','front','side','rear','under','focusHead'],buttons=ids.map(id=>new Button(id));
const tools={querySelectorAll:selector=>{assert.equal(selector,'button');return buttons;}};
const machine='rh3d_virtu_may_230',camera=new PerspectiveCamera(),controls={target:new Vector3(),update(){}};
let language='en',calls=0,renders=0,mode='full',migrated=false,reject=false;
const status={dataset:{},textContent:''},messages=createSourceUIText(()=>language),file={files:[],value:''};
const saved={schema:'source-assembly-view-v1',machine,view:'head',settings:{camera:{position:[0,-.2,0],target:[0,0,0],up:[0,0,-1]}}};
const load=async(view,settings)=>{calls++;assert.equal(settings.camera.up.length,3);if(reject)return false;mode=view;selectSourceCameraPreset(tools,'iso');return{migrated};};
bindSourceConfigurationLoad({file,machine,load,camera,controls,tools,render:()=>renders++,messages,status,task:operation=>operation()});
const selectFile=(value,size)=>{const body=typeof value==='string'?value:JSON.stringify(value);file.files=[{size:size??Buffer.byteLength(body),text:async()=>body}];file.value='selected.json';};
const pressed=()=>buttons.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.id);
let cases=0;
for(const id of ids){selectSourceCameraPreset(tools,id);assert.deepEqual(pressed(),[id]);cases++;}
for(const lang of ['en','ja','es','ko','ru'])for(const view of ['head','full']){
 language=lang;mode=view==='head'?'full':'head';messages.set(status,'saved');selectSourceCameraPreset(tools,'iso');
 const value=structuredClone(saved);value.view=view;selectFile(value);await file.onchange();
 assert.equal(mode,view);assert.equal(status.textContent,sourceText('loaded',lang));assert.notEqual(status.textContent,sourceText('saved',lang));
 assert.deepEqual(camera.position.toArray(),value.settings.camera.position);assert.deepEqual(camera.up.toArray(),[0,0,-1]);assert.deepEqual(controls.target.toArray(),[0,0,0]);
 assert.deepEqual(pressed(),[],'Restored camera must not retain Perspective');assert.equal(file.value,'');cases++;
}
// An arbitrary orbit with the same up vector is not an Underside preset.
language='en';const orbit=structuredClone(saved);orbit.settings.camera.position=[.31,-.23,.17];selectFile(orbit);await file.onchange();assert.deepEqual(pressed(),[]);cases++;
migrated=true;selectFile(saved);await file.onchange();assert.equal(status.textContent,sourceText('migrated','en'));migrated=false;cases++;
// Canceled picking leaves the current display alone and does not call load.
selectSourceCameraPreset(tools,'rear');messages.set(status,'saved');file.files=[];const before=calls;await file.onchange();assert.equal(calls,before);assert.deepEqual(pressed(),['rear']);assert.equal(status.textContent,sourceText('saved','en'));cases++;
for(const bad of [{...saved,machine:'other'},{...saved,schema:'other'},{...saved,view:'other'},'{', {...saved,settings:{camera:{...saved.settings.camera,up:[0,2,0]}}}]){
 const before=calls;selectFile(bad);await file.onchange();assert.equal(calls,before);assert.equal(status.textContent,sourceText('unsafe','en'));assert.deepEqual(pressed(),['rear']);cases++;
}
selectFile(saved,2*1024*1024+1);const beforeLarge=calls;await file.onchange();assert.equal(calls,beforeLarge);cases++;
reject=true;selectFile(saved);const beforeCamera=camera.position.toArray(),beforeRenders=renders;await file.onchange();assert.equal(status.textContent,sourceText('unsafe','en'));assert.deepEqual(camera.position.toArray(),beforeCamera);assert.deepEqual(pressed(),['rear']);assert.equal(renders,beforeRenders);cases++;
// Guard the production hookup: both full/head loading paths return their
// migration result and this same handler owns the real file input.
const source=fs.readFileSync(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
assert.match(source,/bindSourceConfigurationLoad\(\{file,machine,load,camera,controls,tools,render,messages,status:\$\('configurationStatus'\),task:workspaceTask\}\)/);
assert.match(source,/return migration;\}/);assert.match(source,/return migration\?\?true;/);
assert.match(source,/selectSourceCameraPreset\(tools,kind\)/);
console.log(JSON.stringify({passed:true,cases,languages:5,production_file_input_handler:true,camera_schema:'source-assembly-view-v1',scope:'File event handler, camera restoration, ARIA state and localized success/failure UI. Model/GPU/native checks are separate.'}));

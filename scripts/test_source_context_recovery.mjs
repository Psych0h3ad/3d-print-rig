// Execute the production load body and event handlers with GPU/model stubs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {captureCamera,restoreCamera} from '../site/viewer/source-assembly-view-state.mjs';
import {selectSourceCameraPreset} from '../site/viewer/source-assembly-configuration-ui.mjs';
import {createLoadCoordinator,sourceProgressStatus} from '../site/viewer/source-assembly-runtime/loading.mjs';
import {initialState} from '../site/viewer/source-assembly-runtime/state.mjs';
import {restoreCurrentAssemblyState} from '../site/viewer/source-assembly-runtime/restore_current_state.mjs';
const ui=fs.readFileSync(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
const begin=ui.indexOf(" async function load(requested='full',saved=null)"),end=ui.indexOf('open.onclick=',begin);
assert(begin>=0&&end>begin);
const install=new Function('env',`
 const {THREE,coordinator,renderer,workspaceListen,workspaceTask,restoreCurrentAssemblyState,sourceProgressStatus,captureCamera,restoreCamera,selectSourceCameraPreset,camera,controls,tools}=env;
 let active=env.active,packet=env.packet,headPlan={loading_budget:{single_load_peak_bytes:1024}},mode=env.mode,sourceContextLost=false,sourceContextState=null,sourceContextPreset=null,renderExport={};
 const scene={add(){}},grid={position:{set(){}}},cancelLoad={},messages={set(){},clear(){}},status={},axisControls={},colorControls={},viewSelect={};
 const $=()=>({}),lang=()=> 'en',sync=()=>{},placeSceneFill=()=>{},console={error:(...args)=>{env.errors++;env.errorMessages.push(args.map(e=>e?.stack??String(e)).join(' '));}};
 const view=()=>{env.views++;camera.position.set(9,9,9);camera.up.set(0,1,0);controls.target.set(0,0,0);selectSourceCameraPreset(tools,'iso');};
 const rebuildEnvironment=()=>env.environmentRebuilds++;
 const render=()=>env.renders++,navigator={},choose=()=>{},requestModelChoice=async()=> 'full';
 const visibleBounds=()=>({min:{y:0},getCenter:()=>({x:0,z:0})});
 const release=()=>{active=null;env.releases++},releaseRoot=()=>{};
 const loadSourceAssembly=async()=>{if(env.environmentRebuilds!==1)throw Error('Environment not rebuilt before model');if(env.fail)throw Error('Synthetic rebuild failure');return env.next;};
 ${ui.slice(begin,end)}
`);
class Button{constructor(id){this.id=id;this.attributes=new Map();}setAttribute(k,v){this.attributes.set(k,v)}getAttribute(k){return this.attributes.get(k)}}
const packet={id:'context-fixture',model:{sha256:'a'.repeat(64)},inventory:{sha256:'b'.repeat(64)},variants:[{id:'native',visible_keys:[]}],default_variant:'native',axes:{},parts:[],visibility_groups:[]};
let cases=0;
for(const mode of ['full','head'])for(const preset of [null,'under'])for(const fail of [false,true]){
 const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),update(){}};
 camera.position.set(.31,-.23,.17);camera.up.set(0,0,-1);controls.target.set(.01,.02,.03);const live=captureCamera(camera,controls);
 const buttons=['iso','under','front'].map(id=>new Button(id)),tools={querySelectorAll:()=>buttons};selectSourceCameraPreset(tools,preset);
 const saved={...initialState(packet),camera:{position:[4,4,4],target:[0,0,0],up:[0,1,0]},source_material_display:'palette'};
 const callbacks=new Map(),tasks=[];
 const env={THREE,camera,controls,tools,coordinator:createLoadCoordinator(),renderer:{domElement:{}},packet,mode,fail,
  active:{snapshot:()=>structuredClone(saved)},next:{packet,root:{},apply(s){this.saved=structuredClone(s)}},
  views:0,renders:0,releases:0,errors:0,errorMessages:[],restores:0,environmentRebuilds:0,
  workspaceListen:(_,event,fn)=>callbacks.set(event,fn),workspaceTask:fn=>{const task=fn();tasks.push(task);return task;},
  restoreCurrentAssemblyState,sourceProgressStatus,captureCamera,selectSourceCameraPreset,
  restoreCamera:(...args)=>{env.restores++;restoreCamera(...args);}};
 install(env);let prevented=false;callbacks.get('webglcontextlost')({preventDefault(){prevented=true;}});assert(prevented);
 callbacks.get('webglcontextrestored')();await Promise.all(tasks);assert(env.releases>=1);assert.equal(env.environmentRebuilds,1);
 if(fail){assert.equal(env.restores,0);assert.equal(env.errors,1);}
 else{
  assert.equal(env.errors,0,env.errorMessages.join('\n'));assert.equal(env.views,1,env.errorMessages.join('\n'));assert.equal(env.restores,1);assert.equal(env.renders,1);
  assert.deepEqual(captureCamera(camera,controls),live,'Live camera must win over stale snapshot/default view');
  assert.deepEqual(env.next.saved.camera,live);assert.equal(env.next.saved.source_material_display,'palette');
  assert.deepEqual(buttons.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.id),preset?[preset]:[]);
 }
 cases++;
}
// Orbit interaction must clear a preset so recovery does not label a custom view.
const start=ui.match(/controls\.addEventListener\('start',([^;]+)\);/);assert(start);
const button=new Button('iso'),tools={querySelectorAll:()=>[button]};selectSourceCameraPreset(tools,'iso');
new Function('controls','tools','selectSourceCameraPreset',start[0])({addEventListener:(event,fn)=>{assert.equal(event,'start');fn();}},tools,selectSourceCameraPreset);
assert.equal(button.getAttribute('aria-pressed'),'false');
console.log(JSON.stringify({passed:true,cases,scope:'Production context handlers and rebuild control flow with synthetic GPU/model stubs; live camera, presets, full/head, failed rebuild and orbit indication. No browser or geometry claim.'}));

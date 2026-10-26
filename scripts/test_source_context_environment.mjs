// Real source lifecycle and event-handler code; tiny resource doubles, no GPU/model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WorkspaceScope} from '../site/viewer/workspace-lifecycle.mjs';
const source=fs.readFileSync(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
const begin=source.indexOf(' let environment=null;'),end=source.indexOf(' const ambient=',begin);
const eventsBegin=source.indexOf(" workspaceListen(renderer.domElement,'webglcontextlost'"),eventsEnd=source.indexOf(' open.onclick=',eventsBegin);
assert(begin>=0&&end>begin&&eventsBegin>=0&&eventsEnd>eventsBegin);
const install=new Function('env',`
 const {THREE,RoomEnvironment,renderer,scene,scope,workspaceListen,workspaceTask,load,release,render,restoreCamera,selectSourceCameraPreset}=env;
 const active={snapshot:()=>({lighting:'studio',theme:'dark'})},camera={},controls={},tools={querySelectorAll:()=>[{id:'rear',getAttribute:()=> 'true'}]},coordinator={cancel(){}},mode='full';
 const captureCamera=()=>({position:[0,0,-1],target:[0,0,0],up:[0,1,0]});
 let sourceContextLost=false,sourceContextState=null,sourceContextPreset=null;
 ${source.slice(begin,end)}
 ${source.slice(eventsBegin,eventsEnd)}
 return {rebuildEnvironment,disposeEnvironment};
`);
const scope=new WorkspaceScope(),renderer={domElement:{},context:0};
const scene=scope.scene({environment:null,environmentIntensity:.35,traverse(){}});
const generators=[],rooms=[],targets=[],order=[],callbacks=new Map(),tasks=[];
let fail=false,loads=0,cameraRestores=0,presetRestores=0;
class Generator{
 constructor(r){assert.equal(r,renderer);this.disposals=0;generators.push(this);}
 fromScene(room,sigma){
  assert(rooms.includes(room));assert.equal(sigma,.03);assert.equal(scene.environment,null,'Old GPU environment must be detached before regeneration');
  if(fail)throw Error('Synthetic PMREM generation failure');
  const texture={context:renderer.context,isTexture:true,disposals:0,dispose(){this.disposals++;}};
  const target={texture,disposals:0,dispose(){assert.equal(scene.environment,null);this.disposals++;}};
  targets.push(target);order.push('environment:'+renderer.context);return target;
 }
 dispose(){this.disposals++;}
}
class Room{constructor(){this.disposals=0;rooms.push(this);}dispose(){this.disposals++;}}
const env={THREE:{PMREMGenerator:Generator},RoomEnvironment:Room,renderer,scene,scope,
 workspaceListen:(_,event,fn)=>callbacks.set(event,fn),workspaceTask:fn=>{const p=Promise.resolve().then(fn);tasks.push(p);return p;},
 release:()=>{assert.equal(scene.environment.context,renderer.context);order.push('release:'+renderer.context);},
 load:async(mode,saved)=>{assert.equal(mode,'full');assert.equal(scene.environment.context,renderer.context);assert.equal(saved.lighting,'studio');assert.equal(saved.theme,'dark');loads++;order.push('load:'+renderer.context);return true;},
 render:()=>assert.equal(scene.environment.context,renderer.context),
 restoreCamera:saved=>{assert.deepEqual(saved.position,[0,0,-1]);cameraRestores++;},
 selectSourceCameraPreset:(_,id)=>{assert.equal(id,'rear');presetRestores++;}};
const installed=install(env);
assert.equal(targets.length,1);assert.equal(scene.environment,targets[0].texture);
for(let context=1;context<=2;context++){
 let prevented=false;callbacks.get('webglcontextlost')({preventDefault(){prevented=true;}});assert(prevented);
 renderer.context=context;callbacks.get('webglcontextrestored')();await Promise.all(tasks);
 assert.equal(targets[context-1].disposals,1);assert.equal(targets[context].disposals,0);
 assert.equal(scene.environment,targets[context].texture);assert.equal(scene.environmentIntensity,.35);
 assert.deepEqual(order.slice(-3),['environment:'+context,'release:'+context,'load:'+context]);
}
assert.equal(loads,2);assert.equal(cameraRestores,2);assert.equal(presetRestores,2);
assert.equal(scope.cleanups.length,1,'Repeated restores must not accumulate disposable targets');
fail=true;assert.throws(()=>installed.rebuildEnvironment(),/Synthetic PMREM/);
assert.equal(scene.environment,null);assert.equal(targets.at(-1).disposals,1);
assert(generators.every(g=>g.disposals===1));assert(rooms.every(r=>r.disposals===1));
fail=false;installed.rebuildEnvironment();const last=targets.at(-1);
scope.dispose();assert.equal(last.disposals,1);assert.equal(scene.environment,null);
assert.equal(last.texture.disposals,1,'Workspace also releases its captured scene texture');
scope.dispose();installed.disposeEnvironment();installed.rebuildEnvironment();
assert.equal(last.disposals,1);assert.equal(targets.length,4);
assert(generators.every(g=>g.disposals===1));assert(rooms.every(r=>r.disposals===1));
console.log(JSON.stringify({passed:true,context_restores:2,generations:generators.length,targets:targets.length,
 checks:['fresh GPU environment before release/model reload','live camera/preset retained','lighting intensity retained','old target disposed once','transient PMREM/room disposed each generation','failed generation cleanup and retry','single cleanup registration','workspace disposal and post-disposal no-op'],
 scope:'Actual production environment block and context event handlers with resource doubles and real WorkspaceScope cleanup. No actual GPU, full model or visual equivalence claim.'}));

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {compileVirtualPrinter,createVirtualPlayback,virtualSettingsFromAdapter} from '../site/viewer/virtual-printer-emulator.mjs';

// Exercise the actual panel handlers with a delayed frame timestamp. A frame's
// timestamp marks the frame start and may precede the Play click's clock read.
class Element {
 constructor(){this.children=[];this.value='';this.textContent='';this.disabled=false;this.classList={add(){},toggle(){}}}
 set innerHTML(html){this.nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));this.nodes.get('gcodeSpeed').value='1';const metadata=new Element();metadata.value='{}';this.nodes.set('gcodeMetadata',metadata)}
 querySelector(selector){return selector==='summary'?new Element():this.nodes.get(selector.slice(1))}
 append(...children){this.children.push(...children)}
 after(){}
}
const frames=new Map(),cleanups=[];let request=0,clock=1000,pose=[0,0,10];
const document={createElement:()=>new Element(),body:{dataset:{}},hidden:false};
const context={THREE,compileVirtualPrinter,createVirtualPlayback,virtualSettingsFromAdapter,document,window:{},structuredClone,performance:{now:()=>clock},
 workspaceFrame:callback=>{frames.set(++request,callback);return request},cancelAnimationFrame:id=>frames.delete(id),
 workspaceTask:run=>run(),workspaceListen(){},onWorkspaceDispose:callback=>cleanups.push(callback)};
const code=(await readFile(new URL('../site/viewer/gcode-panel.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
vm.createContext(context);vm.runInContext(code,context);
const container=new Element(),settings={initial:[0,0,10],limits:{X:[0,100],Y:[0,100],Z:[0,100]}};
const controller=context.setupGcodePanel({container,profile:{},adapter:{},scene:new THREE.Group(),setPose:xyz=>{pose=[...xyz]},getPose:()=>[...pose],getLimits:()=>settings.limits,getFirmwareSettings:()=>settings,render(){},drawPath:false});
const panel=container.children[0],get=id=>panel.querySelector('#'+id);
get('gcodeText').value='G90\nG1 X10 F600\nG4 P1000';get('gcodeMacros').value='';
get('gcodeCompile').onclick();assert.equal(document.body.dataset.gcodeComplete,'true');
function frame(frameStart,actualNow){clock=actualNow;const [id,callback]=frames.entries().next().value;frames.delete(id);callback(frameStart)}
function healthy(){assert.equal(document.body.dataset.gcodeComplete,'true');assert.equal(get('gcodePlay').disabled,false);assert(!get('gcodeStatus').textContent.includes('clock reversed'))}
get('gcodePlay').onclick();frame(999.5,1010);healthy();assert.equal(Number(document.body.dataset.gcodeTime),.01);assert.equal(pose[0],.1);
frame(1020,1025);healthy();assert.equal(Number(document.body.dataset.gcodeTime),.025);
get('gcodePlay').onclick();assert.equal(frames.size,0);assert.equal(controller.playing,false);
clock=3000;get('gcodePlay').onclick();frame(2990,3010);healthy();assert.equal(Number(document.body.dataset.gcodeTime),.035);
frame(4980,4990);healthy();assert.equal(controller.playing,false);assert.equal(Number(document.body.dataset.gcodeTime),2);assert.equal(frames.size,0);
// Play at the end must restart from the original program position.
clock=6000;get('gcodePlay').onclick();frame(5990,6010);healthy();assert.equal(Number(document.body.dataset.gcodeTime),.01);assert.equal(pose[0],.1);
document.hidden=true;frame(6020,6030);assert.equal(controller.playing,false);assert.equal(frames.size,0);healthy();
document.hidden=false;clock=7000;get('gcodePlay').onclick();frame(6990,7010);healthy();assert.equal(Number(document.body.dataset.gcodeTime),.02);
for(const dispose of cleanups)dispose();assert.equal(frames.size,0);assert.equal(controller.playing,false);
console.log('Actual G-code panel: delayed first frame, monotonic progression, pause/resume, end/restart, hidden-page pause and disposal passed.');

import assert from 'node:assert/strict';
import {deviceMemoryHint,showDeviceMemoryWarning} from '../site/viewer/device-memory.mjs';
import {beginModelLoading} from '../site/viewer/model-progress.mjs';

for(const value of [undefined,null,0,-1,NaN,Infinity,'4',{},true])
  assert.equal(deviceMemoryHint({deviceMemory:value}),null);
assert.equal(deviceMemoryHint(Object.defineProperty({},'deviceMemory',{get(){throw Error('unavailable')}})),null);
for(const value of [.25,.5,1,2,4,8,16,32]) assert.equal(deviceMemoryHint({deviceMemory:value}),value);

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.isConnected=true;this.textContent='';}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}}
  setAttribute(k,v){this.attrs[k]=v} removeAttribute(k){delete this.attrs[k]}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
}
let stage=new Element('stage');
const document={getElementById:()=>stage,createElement:tag=>new Element(tag)};
for(const deviceMemory of [undefined,8,16,32]) {
  stage=new Element('stage');
  showDeviceMemoryWarning(stage,{document,navigator:{deviceMemory}});
  assert.equal(stage.children.length,0,'Unknown or larger RAM must not show a fabricated shortage');
}
for(const deviceMemory of [.25,.5,1,2,4]) {
  stage=new Element('stage');
  const first=beginModelLoading({model:{}},{document,navigator:{deviceMemory}});
  const second=beginModelLoading({model:{}},{document,navigator:{deviceMemory}});
  assert.equal(stage.children.filter(n=>n.className==='model-memory-warning').length,1);
  const panel=stage.children.find(n=>n.className==='model-memory-warning');
  assert(panel.children[0].textContent.includes(`${deviceMemory} GiB`));
  assert(panel.children[0].textContent.includes('空き容量ではありません'));
  assert.equal(panel.attrs.role,'status');
  first.finish();second.finish();assert.equal(stage.children.length,1,'Warning remains after parsing finishes');
  panel.children[1].onclick();assert.equal(stage.children.length,0);
  const third=beginModelLoading({model:{}},{document,navigator:{deviceMemory}});third.finish();
  assert.equal(stage.children.length,0,'Dismissal survives later downloads in this stage');
}
const old=stage;stage=new Element('stage');
showDeviceMemoryWarning(stage,{document,navigator:{deviceMemory:2}});
assert.equal(stage.children.length,1);assert.equal(old.children.length,0,'Fresh workspaces own their warning');
// Production workspace shell: advisory gets a flow row outside the short 3D
// stage, and keyboard dismissal moves focus to an existing header control.
const shell=[],classes=new Set();let focused=0;
const headerButton={focus(){focused++}},main={before(panel){shell.push(panel)}};
const realDocument={...document,body:{classList:{add(v){classes.add(v)},remove(v){classes.delete(v)}}},querySelector(selector){return selector==='body > main'?main:headerButton}};
const shellStage=new Element('stage');
showDeviceMemoryWarning(shellStage,{document:realDocument,navigator:{deviceMemory:2}});
assert.equal(shellStage.children.length,0);assert.equal(shell.length,1);assert(classes.has('has-device-memory-warning'));
const shellPanel=shell[0];realDocument.activeElement=shellPanel.children[1];shellPanel.contains=node=>shellPanel.children.includes(node);
shellPanel.children[1].onclick();assert.equal(focused,1);assert(!classes.has('has-device-memory-warning'));assert.equal(shellPanel.isConnected,false);
showDeviceMemoryWarning(shellStage,{document:realDocument,navigator:{deviceMemory:2}});assert.equal(shell.length,1,'A dismissed shell row stays dismissed for this workspace');
const embedStage=new Element('stage'),hiddenHeader={getClientRects:()=>[],focus(){throw Error('Hidden header cannot receive focus')}},cameraButton={getClientRects:()=>[{}],focus(){focused++}};
realDocument.querySelectorAll=()=>[hiddenHeader,cameraButton];
showDeviceMemoryWarning(embedStage,{document:realDocument,navigator:{deviceMemory:2}});
const embedPanel=shell.at(-1);embedPanel.contains=n=>embedPanel.children.includes(n);realDocument.activeElement=embedPanel.children[1];embedPanel.children[1].onclick();assert.equal(focused,2,'Embedded dismissal focuses a visible stage control');
console.log('Device memory: feature detection, unavailable/throwing hints, no free-RAM inference, concurrent loading, dismissal and workspace replacement passed.');

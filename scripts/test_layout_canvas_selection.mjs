// Run the production renderer through the established CPU/DOM/WebGL ports.
// Pointer routing, Three raycasts, transforms and exports execute real code;
// these checks do not substitute for the separate browser visual review.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

async function selectionCases(){
  const G=await import(pathToFileURL(path.join(A,'layout/layout-groups.mjs')));
  size={width:1000,height:750};
  const catalog=[{id:'select-printer',label:'Printer',widthMm:200,depthMm:180,heightMm:300,dimensionsMm:{width:200,depth:180,height:300}}];
  let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:7000,depthMm:6000}),furniture:[
    S.createDesk({id:'a',widthMm:900,depthMm:600,pose:{xMm:-1500,zMm:-1000,yawDeg:20}}),
    S.createDesk({id:'b',widthMm:900,depthMm:600,pose:{xMm:1400,zMm:1000,yawDeg:0}})],
    printers:[{id:'child',machineId:'select-printer',configurationId:null,attachment:{parentId:'a',surfaceId:'top',xMm:0,zMm:0,yawDeg:0}}]},catalog);
  const original=S.serializeLayout(state,catalog),picks=[],moves=[],rotations=[],container=makeContainer();let checked=[],api;
  api=factoryRealOrbit({container,catalog,onPick:event=>{
    picks.push(event);const ids=new Set(checked.length?checked:event.seedIds);
    const remove=event.mode==='toggle'&&event.ids.every(id=>ids.has(id));for(const id of event.ids)if(remove)ids.delete(id);else ids.add(id);
    checked=[...ids];api.setPickedRoots(checked);
  },onMove:m=>moves.push(m),onRotate:r=>rotations.push(r)});
  api.setState(state,null);api.view('top');await settled();const renderer=renderers.at(-1);
  const click=(point,extra={})=>{api.canvas.emit('pointerdown',{...point,shiftKey:true,...extra});api.canvas.emit('pointerup',{...point,shiftKey:true,...extra});};
  const point=id=>{const e=S.deriveScene(state,catalog).furniture.find(e=>e.id===id);return screen(new THREE.Vector3(e.xMm/1000,0,e.zMm/1000),renderer.lastCamera);};
  const footprint=id=>{let node;renderer.lastScene.traverse(o=>{if(o.userData.planProjection&&o.userData.entityId===id)node=o;});node.updateMatrixWorld(true);return node.userData.planPoints.map(([x,z])=>screen(new THREE.Vector3(x,0,z).applyMatrix4(node.matrixWorld),renderer.lastCamera));};
  const rectangle=(points,padding=4)=>({start:{clientX:Math.min(...points.map(p=>p.clientX))-padding,clientY:Math.min(...points.map(p=>p.clientY))-padding},end:{clientX:Math.max(...points.map(p=>p.clientX))+padding,clientY:Math.max(...points.map(p=>p.clientY))+padding}});
  const dragBox=(box,{reverse=false,end='pointerup'}={})=>{const a=reverse?box.end:box.start,b=reverse?box.start:box.end;api.canvas.emit('pointerdown',{...a,shiftKey:true});api.canvas.emit('pointermove',{...b,shiftKey:true});assert.equal(container.querySelector('.layout-selection-marquee').hidden,false);api.canvas.emit(end,{...b,shiftKey:true});assert.equal(container.querySelector('.layout-selection-marquee').hidden,true);};
  click(point('a'));assert.deepEqual(checked,['a'],'Mounted printer selects its support root');
  click(point('b'));assert.deepEqual(checked,['a','b']);click(point('a'));assert.deepEqual(checked,['b']);
  assert.deepEqual(moves,[]);assert.deepEqual(rotations,[]);assert.equal(S.serializeLayout(state,catalog),original);
  checked=[];api.setPickedRoots([]);const beforeCamera=cameraSnapshot(renderer.lastCamera),all=rectangle([...footprint('a'),...footprint('b')]);
  dragBox(all);assert.deepEqual(new Set(checked),new Set(['a','b']));assert.deepEqual(cameraSnapshot(renderer.lastCamera),beforeCamera,'Box selection panned camera');
  checked=[];api.setPickedRoots([]);dragBox(all,{reverse:true});assert.deepEqual(new Set(checked),new Set(['a','b']));
  checked=[];api.setPickedRoots([]);const one=rectangle(footprint('b'));dragBox(one);assert.deepEqual(checked,['b']);
  checked=[];api.setPickedRoots([]);dragBox(rectangle(footprint('b'),-12));assert.deepEqual(checked,[],'Partially enclosed furniture was selected');
  for(const end of ['pointercancel','lostpointercapture']){const calls=picks.length;dragBox(all,{end});assert.equal(picks.length,calls,'Cancelled selection changed roots');}
  api.canvas.emit('pointerdown',{...all.start,shiftKey:true});api.canvas.emit('pointermove',{...all.end,shiftKey:true});api.canvas.reviewBlur();assert.equal(container.querySelector('.layout-selection-marquee').hidden,true);
  api.canvas.emit('pointerdown',{...all.start,shiftKey:true});api.canvas.emit('pointermove',{...all.end,shiftKey:true});api.canvas.reviewWindowHandlers.get('keydown')({key:'Escape',preventDefault(){}});assert.equal(container.querySelector('.layout-selection-marquee').hidden,true);
  state=G.createGroup(state,{id:'unit',name:'Bench',memberIds:['a','b']},catalog);api.setState(state,null);await settled();
  click(point('a'));assert.deepEqual(new Set(checked),new Set(['a','b']),'Whole existing group selected');
  click(point('a'));assert.deepEqual(checked,[],'Whole existing group deselected');
  click(point('a'),{altKey:true});assert.deepEqual(checked,['a'],'Alt-Shift can pick a root within a group');
  checked=[];api.setPickedRoots([]);dragBox(rectangle(footprint('b')));assert.deepEqual(new Set(checked),new Set(['a','b']),'Box selection respects whole groups');
  api.view('perspective');await settled();assert.equal(container.querySelector('.layout-object-tools').hidden,true);
  const highlights=renderer.lastScene.children.filter(n=>n.userData.layoutPicked);assert.equal(highlights.filter(n=>n.visible).length,1);
  assert.equal(highlights.find(n=>n.visible).geometry.attributes.position.count,48,'Two root bounds only');
  const cameraBefore=cameraSnapshot(renderer.lastCamera);api.canvas.emit('pointerdown',{clientX:10,clientY:10,shiftKey:true});api.canvas.emit('pointermove',{clientX:100,clientY:120,shiftKey:true});api.canvas.emit('pointerup',{clientX:100,clientY:120,shiftKey:true});await settled();assert.deepEqual(cameraSnapshot(renderer.lastCamera),cameraBefore,'3D Shift drag must not move objects or orbit');
  assert.equal(api.focusSelected(),true,'Focus frames checked roots even without a primary selection');await settled();
  const nativeRender=renderer.render.bind(renderer);renderer.render=(scene,camera)=>{if(renderer.target)assert.equal(highlights.some(n=>n.visible),false,'Selection outlines leaked into full PNG');return nativeRender(scene,camera);};
  // Use furniture-only state so export never requests a model fixture.
  const bare=S.createDefaultLayout({room:state.room,furniture:state.furniture},catalog);api.setState(bare,null);await settled();
  await api.exportImage({width:320,loadMachine:async()=>assert.fail('Furniture selection requested printer CAD')});assert.equal(highlights.filter(n=>n.visible).length,1,'Export must restore checked outlines');
  api.setState(S.createDefaultLayout(),null);assert.equal(container.dataset.layoutPicked,'0','Removed roots left stale highlight');assert.equal(highlights.some(n=>n.visible),false);
  assert.deepEqual(moves,[]);assert.deepEqual(rotations,[]);
  api.dispose();assert.equal(container.querySelector('.layout-selection-marquee'),null);
  passed.push('Canvas multiselection: Shift hit/mounted root/group expansion and Alt override; full-containment box forward/reverse; cancel/blur/Escape; no pan/move/history; bounded highlight geometry, focus, export omission/restoration and stale-root cleanup.');
}

const harnessURL=new URL('./test_layout_renderer_contract.mjs',import.meta.url);
let replay=fs.readFileSync(harnessURL,'utf8');
const replaceOnce=(before,after)=>{assert.equal(replay.split(before).length,2,'Renderer fixture boundary changed');replay=replay.replace(before,after);};
replaceOnce('const ownerSourceStillMatchesSnapshot=',`await (${selectionCases.toString()})();\nconst ownerSourceStillMatchesSnapshot=`);
replaceOnce("import {machineChoices} from '../site/viewer/machines.js';",`import {machineChoices} from '${new URL('../site/viewer/machines.js',import.meta.url).href}';`);
replay=replay.replaceAll('import.meta.url',JSON.stringify(harnessURL.href));
replaceOnce('test:pin(fileURLToPath(',`canvasSelectionTest:pin(${JSON.stringify(fileURLToPath(import.meta.url))}),test:pin(fileURLToPath(`);
try{await import('data:text/javascript;base64,'+Buffer.from(replay).toString('base64'));}
catch(error){error.stack=error.stack?.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'renderer-selection-replay');console.error(error);process.exitCode=1;}

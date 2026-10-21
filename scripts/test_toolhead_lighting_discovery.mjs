import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {createToolheadLedRig}=await import('../site/viewer/toolhead-lighting.mjs');

for(const folder of ['vendor','vendor-r180']){
 const {Group}=await import(new URL('../site/viewer/'+folder+'/three.module.js',import.meta.url));
 const first=new Group(),second=new Group(),child=new Group(),events=[];
 for(const parent of [first,second])for(const type of ['childadded','childremoved'])parent.addEventListener(type,event=>events.push([event.type,event.target,event.child]));
 first.add(child);second.attach(child);second.remove(child);
 assert.deepEqual(events,[['childadded',first,child],['childremoved',first,child],['childadded',second,child],['childremoved',second,child]],folder+' must dispatch child graph events on the parent');
}

// Controller fixtures only: exercise the render-time discovery cost and graph
// lifecycle without certifying source geometry, browser output or physical fit.
const scene=new THREE.Scene(),frame=new THREE.Group(),head=new THREE.Group(),parked=new THREE.Group();
scene.add(frame,head,parked);
const geometry=new THREE.BoxGeometry(.005,.005,.001);
const material=new THREE.MeshStandardMaterial({color:0x456789,emissive:0x010203,emissiveIntensity:.2});
const unlit=new THREE.Scene(),unlitMeshes=Array.from({length:2048},()=>new THREE.Mesh(geometry,material));unlit.add(...unlitMeshes);
let unlitScans=0;const unlitTraverse=unlit.traverse;
unlit.traverse=function(callback){unlitScans++;return unlitTraverse.call(this,callback);};
const unlitRig=createToolheadLedRig(unlit,{identify:()=>null,guideFor:()=>null});
for(let i=0;i<600;i++)assert.deepEqual(unlitRig.update(),{installed:0,lit:0,registered:0});
assert.equal(unlitScans,1,'A >1000-mesh scene without any LEDs must not rescan on every render');
unlitRig.dispose();for(const node of [unlit,...unlitMeshes]){
 assert.equal(node._listeners?.childadded?.length||0,0);assert.equal(node._listeners?.childremoved?.length||0,0);
}
const hardware=Array.from({length:2048},()=>new THREE.Mesh(geometry,material));frame.add(...hardware);
const emitter=new THREE.Mesh(geometry,material),guide=new THREE.Mesh(geometry,material);head.add(emitter,guide);
const sources=new Map([[emitter,{id:'fixture-logo',kind:'logo',normal:[0,0,1]}]]);
const rig=createToolheadLedRig(scene,{identify:mesh=>sources.get(mesh)||null,apertureFor:()=>null,
 guideFor:mesh=>mesh===guide?{id:'fixture-guide',emitter_id:'fixture-logo'}:null});
let scans=0,visits=0;
const traverse=scene.traverse;
scene.traverse=function(callback){scans++;return traverse.call(this,object=>{visits++;callback(object);});};
assert.deepEqual(rig.update(),{installed:1,lit:1,registered:1});
assert.equal(scans,1);
const initialVisits=visits;
for(let i=0;i<600;i++){
 head.position.set(Math.sin(i/17)*.1,Math.cos(i/19)*.2,-Math.sin(i/23)*.1);
 scene.updateMatrixWorld(true);
 const level=[0,100,300,100][i%4],power=i%7!==0;
 const counts=rig.update({level,power,color:['white','red','blue','rainbow'][i%4],effect:['static','flow','breath','chase'][i%4],seconds:i/30});
 assert.deepEqual(counts,{installed:1,lit:power&&level>0?1:0,registered:1});
 assert.equal(rig.emitters[0].light.intensity>0,power&&level>0);
 assert.equal(rig.guides[0].optical.enabled,power&&level>0?1:0);
 assert(rig.emitters[0].light.getWorldPosition(new THREE.Vector3()).equals(rig.emitters[0].light.position.clone().add(head.position)));
}
head.position.set(0,0,0);head.visible=false;
assert.deepEqual(rig.update(),{installed:0,lit:0,registered:1});
assert.equal(rig.emitters[0].light.intensity,0);assert.equal(rig.guides[0].optical.enabled,0);
head.visible=true;material.color.set('#ff00aa');rig.update();assert(guide.material.color.equals(material.color));
material.color.set('#456789');rig.update();assert(guide.material.color.equals(material.color));
assert.equal(scans,1,'Orbit/motion, visibility, palettes and LED samples must not rescan the scene');
assert.equal(visits,initialVisits);

// A-to-B-to-A removal must restore source resources, with no orphan lights.
head.remove(emitter);assert.deepEqual(rig.update(),{installed:0,lit:0,registered:0});
assert.equal(emitter.geometry,geometry);assert.equal(emitter.material,material);assert.equal(emitter.children.length,0);
assert.equal(rig.guides[0].optical.enabled,0);
head.add(emitter);assert.deepEqual(rig.update(),{installed:1,lit:1,registered:1});
assert.equal(emitter.children.filter(o=>o.isPointLight).length,1);
parked.add(guide);rig.update();assert.equal(rig.guides[0].optical.enabled,0);
parked.add(emitter);rig.update();assert.equal(rig.guides[0].optical.enabled,1);
head.add(guide,emitter);rig.update();assert.equal(rig.guides[0].optical.enabled,1);
parked.attach(head);assert.equal(rig.update().registered,1);assert.equal(rig.guides[0].optical.enabled,1);
scene.attach(head);assert.equal(rig.update().registered,1);assert.equal(rig.guides[0].optical.enabled,1);

// Watch previously empty/leaf nodes and pre-populated added subtrees. No event
// bubbling is supplied by Three.js, so scene-only listeners would miss these.
const branch=new THREE.Group(),nested=new THREE.Group(),extra=new THREE.Mesh(geometry,material);
sources.set(extra,{id:'fixture-extra',kind:'nozzle',normal:[0,0,1]});
branch.add(nested);hardware[0].add(branch);rig.update();
nested.add(extra);assert.equal(rig.update().registered,2);
assert.equal(extra.children.filter(o=>o.isPointLight).length,1);
branch.removeFromParent();assert.equal(rig.update().registered,1);
assert.equal(extra.geometry,geometry);assert.equal(extra.material,material);assert.equal(extra.children.length,0);
const beforeDetached=scans;nested.add(new THREE.Group());rig.update();assert.equal(scans,beforeDetached,'Detached branches must release their observers');
hardware[0].add(branch);assert.equal(rig.update().registered,2);
frame.clear();assert.equal(rig.update().registered,1);
frame.add(hardware[0]);assert.equal(rig.update().registered,2);

// Explicit discovery remains usable, including after an idempotent reset.
const beforeExplicit=scans;rig.discover();assert.equal(scans,beforeExplicit+1);
let unrelatedEvents=0;const unrelated=()=>unrelatedEvents++;scene.addEventListener('childadded',unrelated);
rig.dispose();rig.dispose();
for(const mesh of [emitter,extra,guide]){
 assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(mesh.children.length,0);
 assert(!mesh.userData.ledSurface&&!mesh.userData.ledGuide);
}
for(const node of [scene,frame,head,parked,...hardware,branch,nested,emitter,guide,extra]){
 assert.equal(node._listeners?.childadded?.length||0,node===scene?1:0,'Disposal must release all attached/detached node observers');
 assert.equal(node._listeners?.childremoved?.length||0,0);
}
scene.add(new THREE.Group());assert.equal(unrelatedEvents,1);scene.removeEventListener('childadded',unrelated);
assert.equal(rig.update().registered,2,'Explicit reuse after disposal must bootstrap discovery again');
rig.dispose();geometry.dispose();material.dispose();
console.log(JSON.stringify({passed:true,scope:'Synthetic render-time LED controller fixtures',bundled_graph_event_contracts:['vendor','vendor-r180'],no_LED_meshes:2048,no_LED_stable_updates:600,no_LED_scene_scans:unlitScans,stable_updates:600,initial_scene_visits:initialVisits,additional_stable_scene_scans:0,
 lifecycle:'nested/leaf/pre-populated additions, remove/reparent/clear, detached mutations, A-to-B-to-A, palette/visibility/motion/RGB, explicit discovery, reset and observer cleanup'}));

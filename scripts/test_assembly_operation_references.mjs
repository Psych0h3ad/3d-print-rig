// Reuse original hardware across manual operations without duplicating parts
// or coupling a part check to operation completion. Software fixtures only.
import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {createAssemblyIndex,createAssemblyProgress,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
import {createAssemblyWorkbench} from '../site/viewer/assembly-workbench.mjs';
import {createV0AssemblyStages} from '../site/viewer/v0-assembly.mjs';
const hash=c=>c.repeat(64),manifest={machine_id:'operations',parts:[{key:'screw',name:'M3x8 BHCS'},{key:'mount',name:'Rear mount'},{key:'rail',name:'Z rail block'}]},receipts={'model.glb':hash('a'),'assembly_manifest.json':hash('b'),'assembly_stages.json':hash('c')};
const spec={model_sha256:hash('a'),manifest_sha256:hash('b'),parts:3,manual:{sha256:hash('d'),revision:'fixture',pages:10,url:'https://example.test/manual.pdf'},stages:[
 {id:'prepare',title:'Prepare mount',page_start:1,page_end:1,part_keys:['mount','screw']},
 {id:'remove',title:'Remove screw',page_start:2,page_end:2,part_keys:[],operation_part_keys:['mount','screw']},
 {id:'rail',title:'Attach rail',page_start:3,page_end:3,part_keys:['rail'],operation_part_keys:['mount','rail']},
 {id:'refit',title:'Refit screw',page_start:4,page_end:4,part_keys:[],operation_part_keys:['mount','screw','rail']},
]};
const build=s=>createAssemblyIndex({manifest,machine:s,receipts}),index=build(spec),nodes=new Map(manifest.parts.map(p=>{const n=new THREE.Group();n.userData.part_key=p.key;n.add(new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),new THREE.MeshBasicMaterial()));return[p.key,n]}));
const control=s=>createV0AssemblyStages({nodes,manifest,machine:s,receipts}),controller=control(spec);
assert.equal(index.partCount,3);assert.deepEqual(index.operations('screw').map(s=>s.id),['prepare','remove','refit']);assert.equal(index.owner('screw').id,'prepare');assert.deepEqual(index.search('M3x8').map(s=>s.id),['prepare','remove','refit']);
for(const i of [0,1,2,3,2,1,0,3]){const r=controller.setStage(i);assert.equal(r.added,spec.stages[i].part_keys.length);assert.deepEqual(r.operation_part_keys,spec.stages[i].operation_part_keys);assert.deepEqual(controller.getBoundsKeys(),spec.stages[i].operation_part_keys||spec.stages[i].part_keys)}controller.leave();
let negative=0;
for(const change of [s=>s.stages[1].operation_part_keys=['rail'],s=>s.stages[2].operation_part_keys=['mount'],s=>s.stages[1].operation_part_keys=['screw','screw'],s=>s.stages[1].operation_part_keys=['unknown'],s=>s.stages[1].operation_part_keys=new Array(2),s=>s.stages[1].operation_part_keys=null]){
 const candidate=structuredClone(spec);change(candidate);assert.throws(()=>build(candidate));assert.throws(()=>control(candidate));negative+=2;
}
const p=createAssemblyProgress(index);p.togglePart('screw');p.setStage('refit');p.toggle('remove');const saved=p.snapshot();assert.deepEqual(saved.checked_parts,['screw']);assert.deepEqual(saved.checked_stages,['remove']);assert.deepEqual(validateAssemblyProgress(index,JSON.parse(JSON.stringify(saved))),saved);
const doc=new TestDocument(),container=doc.createElement('section');doc.body.append(container);const legacy={};for(const key of ['select','previous','next','focus','note','manual','finish'])legacy[key]=doc.createElement(key==='select'?'select':'button');for(const s of index.stages){const o=doc.createElement('option');o.value=String(s.index);legacy.select.append(o)}
const focused=[],store=new Map();let ui;
const view=i=>({index:i,added:spec.stages[i].part_keys.length,visible_count:i===1?1:3,visible_keys:i===1?['mount']:['mount','screw','rail'],stored_keys:i===1?['screw']:[],part_notes:i===1?{screw:'Retain original source screw'}:{},manual_text:'Manual fixture'});
ui=createAssemblyWorkbench({container,index,legacy,format:(id,values=[])=>id.split('.').at(-1)+(values.length?' '+values.join('/') : ''),translate:x=>x,storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},onStage:i=>ui.update(view(i)),onFocusPart:k=>focused.push(k),download:()=>{}});
ui.activate();ui.update(view(0));container.querySelector('[data-part="screw"]').click();assert.deepEqual(focused,['screw']);let related=Array.from(container.querySelectorAll('label')).find(n=>n.className==='assembly-related-stage').querySelector('select');assert.equal(related.value,'prepare');assert.equal(related.children.length,3);
related.value='remove';related.dispatch('change');assert.equal(ui.snapshot().current_stage,'remove');assert.equal(container.querySelector('[data-part="screw"]').getAttribute('aria-pressed'),'true','Related operation navigation retains the original selected occurrence');assert.equal(container.querySelector('[data-part-check="screw"]').disabled,true);assert.match(container.querySelector('[data-part="screw"]').querySelector('small').textContent,/screw.*stored/);assert.equal(Array.from(container.querySelectorAll('p')).find(n=>n.className==='assembly-part-source-note').textContent,'Retain original source screw');
container.querySelector('[data-part="screw"]').click();assert.deepEqual(focused,['screw'],'Set-aside occurrence cannot trigger a 3D focus');related=Array.from(container.querySelectorAll('label')).find(n=>n.className==='assembly-related-stage').querySelector('select');assert.equal(related.value,'remove');related.value='refit';related.dispatch('change');assert.equal(container.querySelector('[data-part="screw"]').getAttribute('aria-pressed'),'true');assert.equal(container.querySelector('[data-part-check="screw"]').disabled,false);
const check=container.querySelector('[data-part-check="screw"]');check.checked=true;check.dispatch('change');assert.deepEqual(ui.snapshot().checked_parts,['screw']);assert.deepEqual(ui.snapshot().checked_stages,[]);const roundtrip=JSON.parse(JSON.stringify(ui.snapshot()));ui.importProgress(roundtrip);assert.deepEqual(ui.snapshot(),roundtrip);ui.dispose();
console.log(JSON.stringify({passed:true,negative,scope:'Repeated source references, future/duplicate/sparse/unknown rejection in index and controller, stored occurrence UI and related-operation selection, independent global hardware checks and file roundtrip. Fixture only, no CAD fit.'}));

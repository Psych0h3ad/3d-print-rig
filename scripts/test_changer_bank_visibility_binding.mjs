import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import * as THREE from '../site/viewer/vendor/three.module.js';
register('./three-test-loader.mjs',import.meta.url);
const {bindShowHeadConsumer}=await import('./audit_changer_banks.mjs');
const {createFullMachineSource47}=await import('../site/viewer/source47/source47-full-machine.mjs');
const read=name=>JSON.parse(fs.readFileSync(new URL('../site/viewer/source47/data/'+name,import.meta.url)));
const app=fs.readFileSync(new URL('../site/viewer/app.js',import.meta.url),'utf8');
const input=read('ROUTE350_CAPTURE_BINDINGS_V2.json'),reference=read('FULL350_SOURCE_REFERENCE.json'),serviceInput=read('SOURCE_SERVICE_ROUTE_BINDINGS.json');
// Source-identified transform fixtures exercise the real controller binding;
// the separate assembled-model audit checks the exported hardware geometry.
const model=new THREE.Group(),meshes=[];
for(const key of new Set([...reference.nodes.map(n=>n.part_key),...Object.keys(serviceInput.source_reference_matrices),'PTFE_tube','CAN_cable'])){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshBasicMaterial());
 mesh.userData.originalKey=String(key);mesh.userData.stock=true;model.add(mesh);meshes.push(mesh);
}
const head={root:model,entries:meshes.map(mesh=>({key:mesh.userData.originalKey,mesh}))};
const source47=createFullMachineSource47({model,meshes,manifest:{parts:[]},input,reference,serviceInput,getHead:()=>head,onPose:()=>{}});
let shown=true,headCalls=0,beltCalls=0;
const fields=new Map([['#head',{checked:true}],['#panels',{checked:true}],['#cables',{get checked(){return shown}}],['#routing',{dataset:{}}]]);
const bindings={activeConfig:{removed_stock_keys:[],modules:[]},$:id=>fields.get(id),allMeshes:[],groups:{stock:{visible:true}},stockHeadGroup:'stock',installed:'custom',installedHeads:{setVisible:()=>headCalls++},xolScene:null,panes:[],assetRoots:new Map(),moving:{reference_flexible:[]},parts:new Map(),showBelts:()=>beltCalls++,source47};
const omitted={...bindings};delete omitted.source47;
assert.throws(()=>bindShowHeadConsumer(app,omitted),/Missing visibility fixture binding: source47/);
const show=bindShowHeadConsumer(app,bindings);
show();assert.equal(source47.active,false);assert.equal(headCalls,1);assert.equal(beltCalls,1);
source47.requestPose(...source47.referencePose);assert.equal(source47.active,true);
for(const enabled of [true,false,true]){
 shown=enabled;show();const state=source47.visibilitySnapshot(),dataset=fields.get('#routing').dataset;
 assert.equal(state.chain_links,enabled?47:0);assert.equal(state.PTFE,enabled);assert.equal(state.CAN,enabled);
 assert.equal(dataset.sourceEffectiveChainLinks,state.chain_links);assert.equal(dataset.ptfe,String(enabled));assert.equal(dataset.can,String(enabled));
}
const broken=app.replace("source47.setVisible($('#cables').checked)","source47.setVisible(true)");
assert.notEqual(broken,app);shown=false;
bindShowHeadConsumer(broken,bindings)();assert.notEqual(source47.visibilitySnapshot().chain_links,0,'Negative control must expose ignored cable visibility');
source47.deactivate();assert.equal(source47.active,false);
bindShowHeadConsumer(app,{...bindings,source47:undefined})();
assert.equal(headCalls,beltCalls);
console.log('Production visibility bindings, real source route delegation, reverse toggles and omitted/ignored-binding negative controls passed.');

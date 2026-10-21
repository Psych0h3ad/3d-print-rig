// Source/controller integration only. Meshes below are keyed software fixtures;
// actual exported-asset, GPU and native-mating audits remain separate gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const root=path.resolve(option('--source')||fileURLToPath(new URL('../',import.meta.url)));
const viewer=path.join(root,'site/viewer'),inputs={};
const read=rel=>{const p=path.join(root,rel),bytes=fs.readFileSync(p);inputs[rel]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};return bytes.toString('utf8')};
const library=await import(pathToFileURL(path.join(viewer,'v0-mod-library.mjs')));
const {componentViews,resolveComponentView,componentViewKeys}=library;
const {loadExternalComponent}=await import(pathToFileURL(path.join(viewer,'component-assets.mjs')));
const THREE=await import(pathToFileURL(path.join(viewer,'vendor/three.module.js')));
read('site/viewer/v0-mod-library.mjs');read('site/viewer/component-assets.mjs');read('site/viewer/vendor/three.module.js');
const additions=JSON.parse(read('site/COMPONENT_ADDITIONS.json'));
const item=additions.items[0],parts=item.views.flatMap(v=>v.parts.map(key=>({key,name:key})));
const views=componentViews(item,parts);
for(const p of parts){const selected=resolveComponentView(views,{part:p.key});assert.deepEqual(componentViewKeys(selected.view,selected.part),[p.key])}
assert(views.every(v=>!v.assembly));
assert.throws(()=>componentViews(item,parts.slice(1)),/Missing component part/);
assert.throws(()=>componentViews({...item,views:[...item.views,item.views[0]]},parts),/Invalid component view/);
assert.throws(()=>componentViews(item,[...parts,{key:'unregistered',name:'unregistered'}]),/Unregistered component part/);
assert.throws(()=>componentViewKeys(views[0],'all'),/このバリエーション/);
const original=globalThis.fetch;let parsed=false;
globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));
try{await assert.rejects(loadExternalComponent({parseAsync:async()=>{parsed=true}},additions.assets[item.module],'https://example.test/viewer/components.html'),/checksum mismatch/);assert.equal(parsed,false)}finally{globalThis.fetch=original}
const tests=[{id:'existing-external-source-view-and-corrupt-download-regressions',status:'PASS'}];
const app=read('site/viewer/components.js');
// Like test_v0_state_app: retain the entire current mount body and its closures.
// Only browser/GPU/load boundaries are injected. No resolver is reimplemented.
function productionModule(text,dependencies,globals){
 const context=vm.createContext({...globals,dependencies});
 const dependency=specifier=>{const key=specifier==='three'?'three':specifier.split('/').at(-1).split('?')[0];assert(Object.hasOwn(dependencies,key),'Missing mounted dependency: '+key);return key};
 const code=text.replace(/^import \{([^}]+)\} from '([^']+)';$/gmu,(_,names,specifier)=>`const {${names}}=dependencies[${JSON.stringify(dependency(specifier))}];`)
  .replace(/^import \* as (\w+) from '([^']+)';$/gmu,(_,name,specifier)=>`const ${name}=dependencies[${JSON.stringify(dependency(specifier))}];`)
  .replace(/\bimport\.meta\.url/gu,JSON.stringify('https://example.test/rig/viewer/components.js')).replace(/^export /gmu,'');
 return vm.runInContext(`(function(){${code}\nreturn {mount};})()`,context,{filename:'components.js'});
}
function geometryModule(rel,names){
 const text=read(rel).replace(/^import \* as THREE from 'three';\r?\n/u,'').replace(/^export /gmu,'');
 return new Function('THREE',text+'\nreturn {'+names.join(',')+'};')(THREE);
}
const selection=geometryModule('site/viewer/component-selection.js',['partNodes','selectParts','visibleBounds']);
const cameraModule=geometryModule('site/viewer/head-camera.mjs',['frameHeadBounds']);
const realCatalog=JSON.parse(read('site/COMPONENT_LIBRARY.json'));
const realFirst=realCatalog.items[0];assert(realFirst?.id);
const fixtureItems=[
 {...realFirst,module:'fixture-first',select_parts:true,views:[{id:'one',label:'First section',parts:['part-a']},{id:'two',label:'Second section',parts:['part-b']}]},
 {id:'fixture-other-hotend',module:'fixture-second',kind:'hotend',label:'Other component',manufacturer:'Fixture',solids:2,select_parts:true,views:[{id:'one',label:'Other section',parts:['part-a']},{id:'two',label:'Other second section',parts:['part-b']}]},
 {id:'fixture-extruder',module:'fixture-third',kind:'extruder',label:'Extruder fixture',manufacturer:'Fixture',solids:2,select_parts:true,views:[{id:'one',label:'Extruder section',parts:['part-a']},{id:'two',label:'Extruder second section',parts:['part-b']}]},
];
const plain=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.disabled=false;this.hidden=false;this._value='';this._text='';this.clientWidth=900;this.clientHeight=700;}
 get value(){return this.tag==='select'&&!this.children.some(c=>c.value===this._value)?'':this._value}
 set value(v){this._value=String(v)}
 get textContent(){return this.children.length?this.children.map(n=>n.textContent).join(''):this._text}
 set textContent(v){this.children=[];this._text=String(v)}
 append(...nodes){const empty=this.children.length===0;this.children.push(...nodes);if(this.tag==='select'&&empty&&nodes.length)this.value=nodes[0].value;for(const n of nodes)if(n.selected)this.value=n.value}
 prepend(...nodes){this.children.unshift(...nodes);for(const n of nodes)if(n.selected)this.value=n.value}
 replaceChildren(...nodes){this.children=[];this._value='';this._text='';this.append(...nodes)}
 querySelector(){return null}
 getBoundingClientRect(){return {width:900,height:700,top:0,left:0,bottom:700,right:900}}
 addEventListener(){}
}
async function mounted(query,{catalogFailure=false,initialFailure=false}={}){
 const elements=new Map(),body=new Element(),requests=[],replacements=[],errors=[],roots=[],gates=new Map(),failures=new Set();
 if(initialFailure)failures.add('fixture-first');
 const $=selector=>{if(!elements.has(selector)){const tag=['#component','#componentCategory','#componentView','#componentPart'].includes(selector)?'select':'div';const e=new Element(tag);if(['#component','#componentCategory','#openRender'].includes(selector))e.disabled=true;elements.set(selector,e)}return elements.get(selector)};
 const document={body,querySelector:$,createElement:t=>new Element(t),createTextNode:t=>{const n=new Element('text');n.textContent=t;return n}};
 const location={href:'https://example.test/rig/viewer/components.html'+query,get search(){return new URL(this.href).search}};
 const catalog={items:structuredClone(fixtureItems),assets:Object.fromEntries(fixtureItems.map(i=>[i.module,{glb:i.module+'/model.glb',meta:i.module+'/parts.json'}]))};
 const meta={parts:[{key:'part-a',name:'Part A'},{key:'part-b',name:'Part B'}]};
 let scene,exportOptions,openCount=0;
 class Renderer{constructor(){this.domElement=new Element('canvas')}setPixelRatio(){}setClearColor(){}setSize(){}setAnimationLoop(){}render(){}}
 class Orbit{constructor(){this.target=new THREE.Vector3()}addEventListener(){}update(){}}
 const namespaces={
  'workspace-entry.mjs':{ensureWorkspaceEntry(){}},'workspace-navigation.mjs':{replaceWorkspaceURL(_state,_title,url){location.href=String(url);replacements.push(location.href)}},
  'display-preferences.mjs':{setupSceneDisplay(){}},'workspace-lifecycle.mjs':{workspaceTask:fn=>Promise.resolve().then(fn),WorkspaceResizeObserver:class{observe(){}}},
  three:{...THREE,WebGLRenderer:Renderer},'OrbitControls.js':{OrbitControls:Orbit},'GLTFLoader.js':{GLTFLoader:class{}},
  'model-loader.js':{loadModel:async(_loader,url)=>{
   requests.push(String(url));const module=String(url).split('/').at(-2);if(gates.has(module))await gates.get(module);
   if(failures.has(module))throw Error('Controlled source load failure: '+module);
   const root=new THREE.Group();root.userData.fixtureModule=module;
   for(const [i,key]of ['part-a','part-b'].entries()){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.02,.03,.04),new THREE.MeshStandardMaterial({color:0x667788}));mesh.userData.part_key=key;mesh.position.x=i*.03;root.add(mesh);
   }
   roots.push(root);return {scene:root};
  }},
  'component-assets.mjs':{loadExternalComponent:async()=>{throw Error('Unexpected external model fixture boundary')}},
  'public-info.js':{setupPublicInfo(){}},'render-export.js':{setupRenderExport:options=>{exportOptions=options;$('#openRender').disabled=false;$('#openRender').onclick=()=>{openCount++};return {}}},
  'component-selection.js':selection,'product-links.js':{renderProductLinks(){}},'v0-mod-library.mjs':library,'head-camera.mjs':cameraModule,'head-assembly.js':{partKey:n=>n.userData.part_key},
  'microswiss-source-shroud-palette.mjs':{hasMicroSwissSourceShroud:()=>false,createSourceShroudPalette:()=>null,mountSourceShroudPalette:()=>({select(){}})},
 };
 const api=productionModule(app,namespaces,{document,location,devicePixelRatio:1,URL,URLSearchParams,console:{error:e=>errors.push(String(e))},fetch:async url=>{
  const path=String(url);if(path.includes('COMPONENT_LIBRARY'))return {ok:!catalogFailure,json:async()=>catalog};
  if(path.endsWith('/parts.json'))return {ok:true,json:async()=>meta};throw Error('Unexpected request: '+path);
 }});
 await api.mount({renderer:v=>v,resource:v=>v,scene:v=>(scene=v)});
 const displayed=()=>{const result=[];scene.traverse(n=>{if(n.isMesh){for(let p=n;p;p=p.parent)if(!p.visible)return;result.push(n)}});return result};
 const choose=async id=>{$('#component').value=id;await $('#component').onchange({target:$('#component')})};
 const chooseCategory=async category=>{$('#componentCategory').value=category;$('#componentCategory').onchange({target:$('#componentCategory')});await new Promise(resolve=>setImmediate(resolve))};
 const guard=()=>exportOptions.beforeRender();
 const dispose=()=>{for(const root of roots)root.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}})};
 return {$,document,location,requests,replacements,errors,roots,failures,gates,displayed,choose,chooseCategory,guard,dispose,get exportOptions(){return exportOptions},get openCount(){return openCount}};
}
async function test(id,fn){await fn();tests.push({id,status:'PASS'})}
for(const [id,query]of [['unknown','?component=unregistered-request&lang=ko&view=two&part=part-b'],['empty','?component=&lang=ko']]){
 await test(id+'-URL-mount-keeps-identity-and-never-loads-fallback',async()=>{
  const f=await mounted(query);try{
   assert.equal(f.requests.length,0,'An explicit invalid component must not request the first model');assert.equal(f.replacements.length,0);assert.equal(f.location.href,'https://example.test/rig/viewer/components.html'+query);
   assert.equal(f.displayed().length,0);assert.equal(f.document.body.dataset.component,undefined);assert.equal(f.document.body.dataset.ready,'error');
   assert.equal(f.$('#component').value,'');assert.equal(f.$('#component').children[0].disabled,true);assert.equal(f.$('#component').disabled,false);assert.equal(f.$('#componentCategory').disabled,false);
   assert.equal(f.$('#openRender').disabled,true);assert.throws(f.guard,/原本の部品がありません/);
   await f.choose(fixtureItems[0].id);assert.equal(f.requests.length,1);assert.equal(f.document.body.dataset.ready,'true');assert.equal(f.document.body.dataset.component,fixtureItems[0].id);assert.equal(f.displayed().length,1);
   assert.equal(f.$('#component').value,fixtureItems[0].id);assert.equal(f.$('#openRender').disabled,false);assert.doesNotThrow(f.guard);
   const u=new URL(f.location.href);assert.equal(u.searchParams.get('component'),fixtureItems[0].id);assert.equal(u.searchParams.get('lang'),'ko');
  }finally{f.dispose()}
 });
}
await test('absent-URL-component-defaults-first-only-when-identity-absent',async()=>{
 const f=await mounted('?lang=ja');try{assert.equal(f.requests.length,1);assert.equal(f.document.body.dataset.component,realFirst.id);assert.equal(f.$('#openRender').disabled,false);assert.doesNotThrow(f.guard)}finally{f.dispose()}
});
await test('valid-URL-retains-exact-component-and-legacy-part-view-selection',async()=>{
 const f=await mounted('?component='+fixtureItems[0].id+'&view=missing-view&part=part-b&embed=1');try{
  assert.equal(f.requests.length,1);assert.equal(f.document.body.dataset.component,fixtureItems[0].id);assert.equal(f.document.body.dataset.componentView,'two');assert.equal(f.document.body.dataset.componentPart,'part-b');
  assert.deepEqual(f.displayed().map(n=>n.userData.part_key),['part-b']);assert.equal(new URL(f.location.href).searchParams.get('embed'),'1');
 }finally{f.dispose()}
});
await test('initial-model-failure-has-blank-recovery-and-export-guard',async()=>{
 const f=await mounted('?component='+fixtureItems[0].id,{initialFailure:true});try{
  assert.equal(f.document.body.dataset.ready,'error');assert.equal(f.displayed().length,0);assert.equal(f.replacements.length,0);assert.equal(f.document.body.dataset.component,undefined);assert.equal(f.$('#component').value,'');
  assert.equal(f.$('#component').disabled,false);assert.equal(f.$('#componentCategory').disabled,false);assert.equal(f.$('#openRender').disabled,true);assert.throws(f.guard,/原本の部品がありません/);
  f.failures.clear();await f.choose(fixtureItems[0].id);assert.equal(f.requests.length,2);assert.equal(f.document.body.dataset.ready,'true');assert.equal(f.displayed().length,1);assert.doesNotThrow(f.guard);
 }finally{f.dispose()}
});
await test('failed-switch-rolls-back-exact-root-part-selection-URL-and-export-readiness',async()=>{
 const f=await mounted('?component='+fixtureItems[0].id+'&view=two&part=part-b');try{
  const before={href:f.location.href,replacements:f.replacements.length,meshes:f.displayed(),root:f.roots[0],view:f.$('#componentView').value,part:f.$('#componentPart').value};
  f.failures.add('fixture-second');let release;f.gates.set('fixture-second',new Promise(resolve=>release=resolve));
  const pending=f.choose(fixtureItems[1].id);await Promise.resolve();await Promise.resolve();
  assert.equal(f.$('#openRender').disabled,true);assert.throws(f.guard,/原本の部品がありません/);assert.equal(f.$('#component').disabled,true);assert.deepEqual(f.displayed(),before.meshes);
  release();await pending;assert.strictEqual(f.roots[0],before.root);assert.deepEqual(f.displayed(),before.meshes);assert.equal(f.location.href,before.href);assert.equal(f.replacements.length,before.replacements);
  assert.equal(f.document.body.dataset.component,fixtureItems[0].id);assert.equal(f.document.body.dataset.ready,'true');assert.equal(f.$('#component').value,fixtureItems[0].id);assert.equal(f.$('#componentView').value,before.view);assert.equal(f.$('#componentPart').value,before.part);
  assert.equal(f.$('#openRender').disabled,false);assert.doesNotThrow(f.guard);assert.equal(f.$('#component').disabled,false);
 }finally{f.dispose()}
});
await test('category-recovery-replaces-blank-only-after-real-load-success',async()=>{
 const f=await mounted('?component=unknown');try{await f.chooseCategory('extruder');assert.equal(f.document.body.dataset.component,'fixture-extruder');assert.equal(f.requests.length,1);assert.equal(f.displayed().length,1);assert.equal(f.$('#componentCategory').value,'extruder');assert.doesNotThrow(f.guard)}finally{f.dispose()}
});
await test('catalog-fetch-failure-never-enables-export-or-displays-another-component',async()=>{
 const f=await mounted('?component=unknown',{catalogFailure:true});try{assert.equal(f.document.body.dataset.ready,'error');assert.equal(f.requests.length,0);assert.equal(f.replacements.length,0);assert.equal(f.displayed().length,0);assert.equal(f.$('#openRender').disabled,true);assert.throws(f.guard,/原本の部品がありません/)}finally{f.dispose()}
});
await test('component-item-resolver-null-default-explicit-empty-unknown-contract-and-legacy-view-fallback',()=>{
 for(const id of [null,undefined])assert.strictEqual(library.resolveComponentItem(fixtureItems,id),fixtureItems[0]);
 assert.strictEqual(library.resolveComponentItem(fixtureItems,fixtureItems[1].id),fixtureItems[1]);
 for(const id of ['', 'unknown'])assert.throws(()=>library.resolveComponentItem(fixtureItems,id),/未登録の部品です/);
 assert.throws(()=>library.resolveComponentItem([],null),/未登録の部品です/);
 const v=componentViews(fixtureItems[0],[{key:'part-a',name:'A'},{key:'part-b',name:'B'}]);
 assert.strictEqual(resolveComponentView(v,{view:'unknown',part:'unknown'}).view,v[0]);assert.equal(resolveComponentView(v,{view:'unknown',part:'part-b'}).part,'part-b');
});
for(const [rel,pin]of Object.entries(inputs)){const b=fs.readFileSync(path.join(root,rel));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),pin.sha256,'Source changed during regression: '+rel)}
const report={status:'PASS',tests,sourceInputs:inputs,productionMountedController:true,productionComponentResolver:true,productionViewSelectionAndBounds:true,realCatalogFirstIdentity:realFirst.id,scope:'Current mounted components controller + actual Three keyed software fixtures and real view/selection/camera functions. GPU/export encoding and actual asset/native mating are separate release checks.',modelsDownloaded:0,actualModelsDecoded:0,GPU:false,native:false};
if(option('--report'))fs.writeFileSync(option('--report'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:tests.length,scope:report.scope}));

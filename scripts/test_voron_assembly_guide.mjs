import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createVoronAssemblyGuide,supportsVoronAssembly} from '../site/viewer/voron-assembly-guide.mjs';
import {createSourcePartsMap} from '../site/viewer/source-parts-map.mjs';
import {createAssemblyProgress,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
const sha='a'.repeat(64);
function fixture(){
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);let live=true;
 const base=[{key:'frame',name:'Frame',group:'Frame'},{key:'z',name:'Z motor',group:'Z Assembly'},{key:'bed',name:'Bed',group:'Z Assembly',source_component:'Z Assembly:1/Bed Components:1/Bed:1'}, {key:'skirt',name:'Skirt',group:'Skirt'},{key:'electronics',name:'Controller',group:'Electronics'},{key:'panel',name:'Window',group:'Panels',source_component:'Panels:1/Transparent Panels:1/Window:1'},{key:'filament',name:'Holder',group:'Filament_Path'},{key:'hidden',name:'Native alternative',group:'Frame'},{key:'bednut',name:'M5 T-nut',group:'Frame',motion:'z'}, {key:'bedscrew',name:'M5x16',group:'Frame',source_leaf:'1167'}];
 const gantry=[{key:'drive',name:'Drive',source_key:'0'},{key:'yrail',name:'Y rail',source_key:'456'},{key:'xrail',name:'X rail',source_key:'390'},{key:'belt',name:'Belt',source_key:'535'},{key:'xbolt',name:'M3x8',source_key:'461'},{key:'xnut',name:'M3 T-nut',source_key:'508'}];
 const head=[{key:'head',name:'Head'},{key:'fan',name:'Fan'}];
 const components=[['machines/voron_trident_350/assembly_manifest.json',base],['modules/trident_r2_gantry_350.json',gantry],['modules/sb_common.json',head],['modules/trident_r2_sb_carriage.json',[{key:'carrier',name:'x_carriage_frame',source_key:'259'}]]].map(([path,parts])=>{const r=new THREE.Group();root.add(r);for(const p of parts){const n=new THREE.Mesh(new THREE.BoxGeometry(.01,.02,.03),new THREE.MeshStandardMaterial());n.userData.part_key=p.key;n.visible=p.key!=='hidden';r.add(n)}return {path,root:r,meta:{parts},metadata:{sha256:sha,bytes:50},model:{sha256:sha,bytes:100}}});
 return {scene,root,components,loaded:{root,source:{machineId:'voron_trident_350'},inspection:{components,active:()=>live}},retire:()=>{live=false}};
}
const f=fixture(),g=await createVoronAssemblyGuide(f.loaded,f.scene),all=[];f.root.traverse(n=>{if(n.isMesh)all.push([n,n.visible,n.material,n.geometry,[...n.matrix.elements]])});
assert(supportsVoronAssembly('voron_trident_250'));assert(supportsVoronAssembly('voron_v24_300_printed'));assert(!supportsVoronAssembly('voron_v24_350_ldo_cnc'));
assert.equal(g.stages.length,12);assert.equal(g.partCount,19);assert.equal(g.identity.view_kind,'manual-assembly-overview-v1');
let count=0;for(let i=0;i<g.stages.length;i++){const r=g.setStage(i);assert(r.visible_count>=count);count=r.visible_count;assert.equal(r.index,i)}
assert.equal(count,18,'Hidden alternatives must stay hidden at completion');
const bed=g.owner('machines/voron_trident_350/assembly_manifest.json#bednut');assert.equal(bed.id,'bed');assert.equal(g.owner('machines/voron_trident_350/assembly_manifest.json#bedscrew').id,'bed');
assert.equal(g.owner('modules/trident_r2_gantry_350.json#xbolt').id,'xaxis');assert.equal(g.owner('modules/trident_r2_gantry_350.json#xnut').id,'xaxis');
assert.equal(g.owner('modules/trident_r2_sb_carriage.json#carrier').id,'xaxis');g.setStage('belts');assert.equal(g.getPartNodes('modules/trident_r2_sb_carriage.json#carrier').length,1);assert.equal(g.getPartNodes('modules/sb_common.json#fan').length,0,'The head chapter must remain later than its separate carrier');
g.setStage(0);assert.equal(g.entries().length,1);assert.equal(g.getPartNodes('modules/sb_common.json#fan').length,0);g.previewComplete();assert.equal(g.entries().length,18);assert.equal(g.state().preview,true);g.setStage(0);assert.equal(g.entries().length,1);assert.equal(g.state().preview,false);
const before=g.entries().map(x=>x.node.visible);assert.throws(()=>g.setStage(-1));assert.deepEqual(g.entries().map(x=>x.node.visible),before);
g.restore();for(const[n,v,m,geo,matrix]of all){assert.equal(n.visible,v);assert.equal(n.material,m);assert.equal(n.geometry,geo);assert.deepEqual(n.matrix.elements,matrix)}
const readonly=await createSourcePartsMap(f.loaded,f.scene);assert.throws(()=>readonly.setVisibilityKeys([]),/opt-in/);
const pg=createAssemblyProgress(g),mapProgress=createAssemblyProgress(readonly).snapshot();assert.throws(()=>validateAssemblyProgress(g,mapProgress),/another model/);pg.setStage(4);pg.toggle(4);assert.deepEqual(validateAssemblyProgress(g,JSON.parse(JSON.stringify(pg.snapshot()))),pg.snapshot());
const bad=fixture();bad.loaded.source.machineId='voron_v24_350_ldo_cnc';await assert.rejects(()=>createVoronAssemblyGuide(bad.loaded,bad.scene),/source-backed/);
const unknown=fixture();unknown.components[1].meta.parts[0].source_key='unknown';await assert.rejects(()=>createVoronAssemblyGuide(unknown.loaded,unknown.scene),/Unknown Trident/);
const external=g.entries()[0].node;external.visible=false;assert.throws(()=>g.restore(),/changed/);external.visible=true;g.restore();f.retire();assert.throws(()=>g.setStage(0),/retired/);
console.log(JSON.stringify({passed:true,scope:'Explicit assembly masks, source-derived phases, seated receiver cohorts, original hidden alternatives, preview/reverse/reset, exact progress identity, live/retired/unknown-source negative software fixtures. No native mating or insertion simulation.'}));
const vScene=new THREE.Scene(),vRoot=new THREE.Group();vScene.add(vRoot);
const pth=owner=>['(Unsaved)','Gantry:1','X Axis:1','X Carriage:1',owner];
const vParts=[['frame','V24_Frame',[]],['zdrive','V24_Z_Drives',[]],['bed','V24_Bed',[]],['drive','V24_Gantry',['(Unsaved)','Gantry:1','A/B Drives:1']],['gantry','V24_X_Beam',[]],['zjoint','V24_Gantry',['(Unsaved)','Gantry:1','Z_Joints:1']],['belt','V24_Reference_Belts',['(Unsaved)','Gantry:1','A Belt:1']],['head','V24_Toolhead',pth('SB TOOLHEAD-Revo Voron:1')],['controller','V24_Electronics',[]],['skirt','V24_Skirts',[]],['panel','V24_Enclosure',[]],['exhaust','V24_Exhaust',[]],['filament','V24_Spool',[]],['carrier','V24_Toolhead',pth('X_Carriage:1')],['block','V24_Toolhead',pth('MGN12H (1):1')],['probe','V24_Toolhead',pth('Panasonic GX-H15A:1')]].map(([key,group,source_path])=>({key,name:key,group,source_path}));
for(const p of vParts){const n=new THREE.Mesh(new THREE.BoxGeometry(.01,.02,.03),new THREE.MeshStandardMaterial());n.userData.part_key=p.key;vRoot.add(n)}
const vComponent={path:'machines/voron_v24_350_printed/assembly_manifest.json',root:vRoot,meta:{parts:vParts},metadata:{sha256:sha,bytes:50},model:{sha256:sha,bytes:100}},vLoaded={root:vRoot,source:{machineId:'voron_v24_350_printed'},inspection:{components:[vComponent],active:()=>true}};
const vg=await createVoronAssemblyGuide(vLoaded,vScene);vg.setStage('belts');for(const k of ['carrier','block','probe']){const key=vComponent.path+'#'+k;assert.equal(vg.owner(key).id,'gantry');assert.equal(vg.getPartNodes(key).length,1)}assert.equal(vg.getPartNodes(vComponent.path+'#head').length,0);vg.restore();
vParts.find(p=>p.key==='carrier').source_path=pth('Unreviewed_carriage');await assert.rejects(()=>createVoronAssemblyGuide(vLoaded,vScene),/Unreviewed V2.4/);
console.log(JSON.stringify({passed:true,scope:'Source-specific Trident carriage and V2.4 carriage/block/probe required before belts; later source head retained separately; unknown head-owner negative.'}));

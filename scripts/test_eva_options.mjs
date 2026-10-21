// Synthetic lifecycle fixtures use the production controller. They are never
// exported as CAD, and do not certify native mating or continuous clearance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import {spawnSync} from 'node:child_process';
import {messageIdFor} from '../site/viewer/i18n.mjs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {displayMotion,nativeMotion,communityConfiguration,validateCommunityState,communitySchema} from '../site/viewer/community-state.mjs';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {bindLedSource,verifyLedModelBytes} from '../site/viewer/led-source-binding.mjs';
import {createInactiveHeadCache,canRestoreInactiveHeadIndices} from '../site/viewer/inactive-head-cache.mjs';
import {validateEvaOptionsRegistry,validateEvaFlexEndpoints,applyEvaOptionsProfile,createEvaOptionsController} from '../site/viewer/eva-options.mjs';

const clone=structuredClone,hash=v=>createHash('sha256').update(typeof v==='string'||ArrayBuffer.isView(v)?v:JSON.stringify(v)).digest('hex');
const categories=['carriage','core','hotend_mount','hotend','extruder','hotend_fan','part_fan','duct','fasteners','probe','endstop','endstop_mount'];
const hardware=new Set(['hotend','extruder','hotend_fan','part_fan','fasteners','probe','endstop']);
let positives=0,negatives=0,loads=0,patchCalls=0,liveDownloads=0,maxDownloads=0;
function check(body){body();positives++}
function rejected(body){assert.throws(body);negatives++}
async function failed(body){await assert.rejects(body);negatives++}
const basis=[[1,0,0],[0,0,1],[0,-1,0]];
function fixture(generation){
 const machine='fixture_eva_host_'+generation,origin=generation===2?[70,0,0]:[0,0,0],revision=String(generation).repeat(40);
 const definitions=new Map(),variants=[],assets={};
 for(const suffix of ['stock','a','b']){
  const id='fixture_eva'+generation+'_'+suffix,assetId=id+'_complete';
  const parts=categories.map((category,i)=>({key:id+'_'+category,source_path:['Fixture public assembly '+generation,category+':1'],
   source_brep_sha256:hash(category),eva_generation:generation,eva_version:null,
   eva_companions:category==='hotend'?['hotend','nozzle']:[category],printed:!hardware.has(category),
   appearance_role:hardware.has(category)?null:category==='duct'?'accent':'base',
   bounds_mm:[[i*3,0,0],[i*3+1,1,1]],native_bounds_mm:[[i*3+origin[0],origin[1],origin[2]],[i*3+1+origin[0],1+origin[1],1+origin[2]]]}));
  const companions=Object.fromEntries(categories.map(category=>[category,[id+'_'+category]]));companions.nozzle=companions.hotend;
  const meta={id:assetId,source_sha256:hash('source-'+generation),source_revision:revision,eva_generation:generation,eva_version:null,source_origin_mm:origin,parts};
  const asset={component_id:assetId,parts:parts.length,external:{base_url:'https://example.invalid/fixture-eva/',local_directory:'fixture-eva'},
   files:{'model.glb':{path:assetId+'.glb',bytes:100,sha256:hash(assetId)},'parts.json':{path:assetId+'.json',bytes:100,sha256:hash(meta)}}};
  const variant={id,toolhead:'eva_'+generation,gantry:'native',mount:'fixed',carriage:'native',extruder:'native',hotend:'native',probe:'native',board:'none',cooling:'native',
   belt_width_mm:generation===2?6:9,base_asset:assetId,base_hidden_keys:[],head_translation_mm:[0,0,0],hardware_assembled:true,modules:[],fit:{nozzle_mm:[0,0,0]},
   source_version:revision,eva:{generation,version:null,version_scope:'source_assembly',source_revision:revision,companions},machine_id:machine,
   installation:{source_origin_mm:origin,translation_mm:[0,0,0],native_review_sha256:hash(id+'review'),mount_axis_error_mm:0,
    same_carriage_source_identity:{source_path:parts[0].source_path,source_brep_sha256:parts[0].source_brep_sha256},source_head_configuration:id}};
  assets[assetId]=asset;variants.push(variant);definitions.set(assetId,meta);
 }
 const stock=variants[0],host={machine_id:machine,model_sha256:hash(machine+'model'),manifest_sha256:hash(machine+'manifest'),profile_sha256:hash(machine+'profile'),
  origin_mm:origin,basis,stock_head_keys:definitions.get(stock.base_asset).parts.map(p=>p.key),configurations:variants.map(v=>v.id),default_configuration:stock.id,
  native_mount:{head_group:'head',carriage_source_identity:stock.installation.same_carriage_source_identity,
   rail_keys:['native_rail'],fastener_keys:[stock.id+'_fasteners'],axes:[{point_mm:[0,0,0],direction:[0,0,1]}]}};
 const registry={schema:'3d-print-rig-eva-options-v1',assets,variants,hosts:{[machine]:host}},heads={variants:clone(variants),base_assets:clone(assets)};
 return {registry,heads,definitions,host,stock,a:variants[1],b:variants[2],generation};
}
function model(meta){
 const root=new THREE.Group(),shared=new THREE.MeshStandardMaterial({color:'#444444',roughness:.37,metalness:.7});
 for(const p of meta.parts){
  const geometry=new THREE.BoxGeometry(.001,.001,.001),center=p.bounds_mm[0].map((v,i)=>(v+p.bounds_mm[1][i])*.5);
  geometry.translate(...displayMotion(center,{basis}));
  const mesh=new THREE.Mesh(geometry,shared);mesh.userData.part_key=p.key;root.add(mesh);
 }
 return root;
}
function current(f){
 const parts=clone(f.definitions.get(f.stock.base_asset).parts).map(p=>({...p,group:'head'}));
 for(const[group,key]of [['frame','native_frame'],['gantry','native_rail'],['belt','native_belt'],['chain','native_chain'],['tube','native_ptfe'],['bed_wire','native_can']])
  parts.push({key,group,appearance_role:null,source_path:['Fixture machine',key]});
 const root=model(f.definitions.get(f.stock.base_asset)),nodes=new Map();
 for(const p of parts.filter(p=>p.group!=='head')){const m=new THREE.Mesh(new THREE.BoxGeometry(.001,.001,.001),new THREE.MeshStandardMaterial({color:'#222222'}));m.userData.part_key=p.key;root.add(m)}
 root.traverse(n=>{if(n.userData.part_key)nodes.set(n.userData.part_key,n)});
 const profile={machine_id:f.host.machine_id,origin_mm:clone(f.host.origin_mm),basis:clone(basis),axes:{x:[-10,10],y:[-20,20],z:[-30,30]},
  motions:{head:f.generation===2?['x',0,'z']:[{x:1,y:-.2},'y',0],gantry:[0,'y',0],belt:['x','y',0],chain:['x','y','z'],tube:['x','y','z'],bed_wire:[0,0,'z']}};
 const records=new Map(parts.map(p=>[p.key,p])),initial=new Map([...nodes].map(([k,n])=>[k,n.matrix.clone()]));let axes={x:0,y:0,z:0};
 const adapter={nodes,records,getAxes:()=>({...axes}),setAxes(next){axes={...next};for(const[k,n]of nodes){n.matrixAutoUpdate=false;n.matrix.copy(initial.get(k));const delta=displayMotion(nativeMotion(records.get(k).group,axes,profile),profile);for(let i=0;i<3;i++)n.matrix.elements[12+i]+=delta[i];n.visible=true}root.updateMatrixWorld(true);return {...axes}}};
 const manifest={machine_id:f.host.machine_id,native_leaf_count:parts.length,parts};
 const replay_asset_identity={schema:'loaded-printer-asset-identity/1',machine_id:f.host.machine_id,files:[
  {name:'model.glb',sha256:hash('compressed'),decoded_sha256:f.host.model_sha256},
  {name:'assembly_manifest.json',sha256:f.host.manifest_sha256},{name:'machine_profile.json',sha256:f.host.profile_sha256}]};
 return {root,manifest,profile,adapter,replay_asset_identity};
}
function dependencies(f,{mutate,wait,fail,frontFail}={}){
 return {registry:f.registry,heads:f.heads,loader:{},href:'https://example.invalid/viewer/community.html',
  async loadComponent(loader,asset){
   loads++;liveDownloads++;maxDownloads=Math.max(maxDownloads,liveDownloads);
   try{if(wait)await wait(asset);if(fail)fail(asset);const meta=clone(f.definitions.get(asset.component_id)),root=model(meta);mutate?.(meta,root,asset);return {meta,gltf:{scene:root,animations:[]}}}finally{liveDownloads--}
  },async loadFrontSurfaces(){return {registry:{fixture:true}}},applyFrontSurfaces(root,meta,pin,options){
   patchCalls++;assert.equal(pin,f.registry.assets[meta.id].files['model.glb'].sha256);assert.deepEqual(options.sourceOriginMm,f.host.origin_mm);frontFail?.();return true;
  }};
}
function nativeSnapshot(c){
 return [...c.adapter.nodes].filter(([k])=>c.adapter.records.get(k).group!=='head').map(([key,node])=>({key,node,
  visible:node.visible,matrix:[...node.matrix.elements],geometry:node.geometry,vertices:[...node.geometry.attributes.position.array],material:node.material,color:node.material.color.toArray()}));
}
function untouched(c,before){for(const row of before){const n=c.adapter.nodes.get(row.key);assert.equal(n,row.node);assert.equal(n.visible,row.visible);assert.deepEqual([...n.matrix.elements],row.matrix);assert.equal(n.geometry,row.geometry);assert.deepEqual([...n.geometry.attributes.position.array],row.vertices);assert.equal(n.material,row.material);assert.deepEqual(n.material.color.toArray(),row.color)}}
const f2=fixture(2),f3=fixture(3);
let endpointFixtures=0,endpointGuardNegatives=0;
function endpointFixture(generation){
 const f=fixture(generation),c=current(f),route=c.manifest.parts.find(p=>p.key==='native_ptfe');route.group='registered_flex';
 const moving=[f.host.origin_mm[0]+5,-12,40],fixed=[f.host.origin_mm[0]+5,-12,20],node=c.adapter.nodes.get(route.key);
 node.geometry.dispose();node.geometry=new THREE.CylinderGeometry(.0015,.0015,.020,12,4,true);
 node.geometry.translate(...displayMotion(moving.map((v,i)=>(v+fixed[i])/2-f.host.origin_mm[i]),c.profile));
 c.profile.motions.registered_flex=[0,0,0];c.profile.motions.fixed=[0,0,0];
 c.profile.motion_registration={rest_offsets_mm:{},flex:{[route.key]:{type:'endpoint_route',moving_group:'head',fixed_group:'fixed',moving_mm:moving,fixed_mm:fixed}}};
 c.profile.configurations={stock:{label:'Native',hidden_keys:[],rest_offsets_mm:{}}};
 f.a.installation.flex_endpoints_mm={[route.key]:{moving_mm:[moving[0]+8,moving[1]-5,moving[2]+3]}};
 f.b.installation.flex_endpoints_mm={[route.key]:{moving_mm:[moving[0]-6,moving[1]+4,moving[2]-2]}};
 c.adapter=createCommunityAdapter(c.root,c.manifest,c.profile);
 return {f,c,key:route.key,moving,fixed};
}
for(const generation of [2,3]){
 const {f,c,key,moving,fixed}=endpointFixture(generation),sourceProfile=clone(c.profile.motion_registration);
 applyEvaOptionsProfile(c,f.registry,f.heads);
 const config=c.profile.configurations;
 check(()=>{assert.deepEqual(config[f.a.id].flex_endpoints_mm,f.a.installation.flex_endpoints_mm);
  assert.deepEqual(config[f.b.id].flex_endpoints_mm,f.b.installation.flex_endpoints_mm);
  assert.deepEqual(config[f.stock.id].flex_endpoints_mm,{});assert.deepEqual(c.profile.motion_registration,sourceProfile)});
 const e=c.adapter.flex.find(e=>e.key===key),source=[...e.mesh.geometry.attributes.position.array],weights=clone(e.weights),initial=nativeSnapshot(c);
 const normals=[...e.mesh.geometry.attributes.normal.array],indices=[...e.mesh.geometry.index.array];
 const controller=createEvaOptionsController(c,dependencies(f));
 const {nativeRoutePoints}=await import('./audit_eva_options.mjs');
 const baseline=nativeRoutePoints(c,c.adapter.getAxes());
 const positions=()=>[...e.mesh.geometry.attributes.position.array];
 const assertRoute=(id,axes)=>{
  const target=f.registry.variants.find(v=>v.id===id).installation.flex_endpoints_mm?.[key]?.moving_mm||moving;
  const offset=displayMotion(target.map((v,i)=>v-moving[i]),c.profile),motion=displayMotion(nativeMotion('head',axes,c.profile),c.profile);
  const p=e.mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)for(let j=0;j<3;j++){
   const w=weights[i].head||0,expected=source[3*i+j]+w*(motion[j]+offset[j]);
   assert(Math.abs(p.array[3*i+j]-expected)<1e-7,'Production endpoint does not retain source weights');
   if((weights[i].fixed||0)===1)assert.equal(p.array[3*i+j],source[3*i+j],'Fixed-end vertex moved');
  }
  assert.deepEqual(e.weights,weights);assert.deepEqual(c.profile.motion_registration,sourceProfile);
  const endpoints=nativeRoutePoints(c,axes);
  for(const endpoint of endpoints){const original=baseline.find(r=>r.key===endpoint.key&&r.end===endpoint.end);
   assert(endpoint.distance_mm<=original.distance_mm+.01,'Original native cap vertices detached');
   assert.deepEqual(endpoint.target_mm,endpoint.end==='moving'?target:fixed);
  }
  return endpoints;
 };
 let aPose;
 for(const id of [f.a.id,f.b.id,f.a.id,f.stock.id]){
  const before=nativeSnapshot(c);await controller.install(id);untouched(c,before);
  const oldAxes=c.adapter.getAxes();c.adapter.setConfiguration(id);assert.deepEqual(c.adapter.getAxes(),oldAxes);
  const preserved=nativeSnapshot(c);controller.update(oldAxes);untouched(c,preserved);
  for(const axes of [{x:0,y:0,z:0},{x:-10,y:-20,z:-30},{x:10,y:20,z:30},{x:3,y:-7,z:12},{x:-3,y:7,z:-12},{x:0,y:0,z:0}]){
   c.adapter.setAxes(axes);const untouchedNative=nativeSnapshot(c);controller.update(axes);untouched(c,untouchedNative);assertRoute(id,axes);
  }
  if(id===f.a.id){if(aPose)assert.deepEqual(positions(),aPose,'A-B-A changed native route');aPose=positions()}
 }
 // The actual audit follows original cap vertices. A disconnected source cap
 // cannot pass merely because an unrelated route vertex reaches the socket.
 await controller.install(f.a.id);c.adapter.setConfiguration(f.a.id);controller.update(c.adapter.getAxes());
 const routed=positions(),p=e.mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++)if((weights[i].head||0)>=.999)for(let j=0;j<3;j++)p.array[3*i+j]=source[3*i+j];
 const foreign=weights.findIndex(w=>(w.head||0)>.05&&(w.head||0)<.95);assert(foreign>=0,'Missing unrelated interior fixture vertex');
 const target=f.a.installation.flex_endpoints_mm[key].moving_mm;
 p.setXYZ(foreign,...displayMotion(target.map((v,i)=>v-c.profile.origin_mm[i]),c.profile));
 const detached=nativeRoutePoints(c,c.adapter.getAxes()).find(r=>r.end==='moving');
 check(()=>assert(detached.distance_mm>baseline.find(r=>r.end==='moving').distance_mm+.05,'Detached original cap passed via unrelated vertex'));
 p.array.set(routed);c.adapter.setConfiguration(f.stock.id);await controller.reset();
 check(()=>{untouched(c,initial);assert.deepEqual(positions(),source);assert.deepEqual([...e.mesh.geometry.attributes.normal.array],normals);
  assert.deepEqual([...e.mesh.geometry.index.array],indices);assert.deepEqual(c.adapter.getAxes(),{x:0,y:0,z:0})});
 // A source-reviewed hotend can exclude native Z0. Selecting it clamps the
 // real adapter before the overlay update; returning to the source restores 0.
 const limited=clone(f.registry);limited.variants[1].installation.axes={z:[2,20]};
 applyEvaOptionsProfile(c,limited,f.heads);
 await controller.install(f.a.id);c.adapter.setConfiguration(f.a.id);controller.update(c.adapter.getAxes());
 check(()=>{assert.equal(c.adapter.getAxes().z,2);assertRoute(f.a.id,c.adapter.getAxes())});
 const limitedSnapshot=nativeSnapshot(c);rejected(()=>c.adapter.setAxes({x:0,y:0,z:0}));untouched(c,limitedSnapshot);check(()=>assert.equal(c.adapter.getAxes().z,2));
 for(const z of [20,11,2,20,2]){c.adapter.setAxes({x:0,y:0,z});controller.update(c.adapter.getAxes());assertRoute(f.a.id,c.adapter.getAxes())}
 c.adapter.setConfiguration(f.stock.id);c.adapter.setAxes({x:0,y:0,z:0});await controller.reset();
 check(()=>{untouched(c,initial);assert.deepEqual(positions(),source);assert.deepEqual(c.adapter.getAxes(),{x:0,y:0,z:0})});
 const before=nativeSnapshot(c),axes=c.adapter.getAxes(),configuration=c.adapter.getConfiguration();
 for(const endpoints of [{unknown:{moving_mm:moving}},{native_rail:{moving_mm:moving}},
  {[key]:{moving_mm:[NaN,0,0]}},{[key]:{moving_mm:[0,0]}},{[key]:{moving_mm:moving,fixed_mm:fixed}},
  {[key]:null},{[key]:{moving_mm:['1',2,3]}}]){
  config.invalid={label:'Invalid',hidden_keys:['native_chain'],rest_offsets_mm:{native_rail:[1,2,3]},axes:{x:[-2,2]},flex_endpoints_mm:endpoints};
  rejected(()=>c.adapter.setConfiguration('invalid'));endpointGuardNegatives++;
  assert.deepEqual(c.adapter.getAxes(),axes);assert.equal(c.adapter.getConfiguration(),configuration);untouched(c,before);
 }
 for(const [field,value]of [['type','bed_wire'],['moving_group','bed']]){
  const original=c.profile.motion_registration.flex[key][field];c.profile.motion_registration.flex[key][field]=value;
  config.invalid={label:'Invalid native type',flex_endpoints_mm:f.a.installation.flex_endpoints_mm};
  rejected(()=>c.adapter.setConfiguration('invalid'));endpointGuardNegatives++;
  assert.deepEqual(c.adapter.getAxes(),axes);assert.equal(c.adapter.getConfiguration(),configuration);untouched(c,before);
  c.profile.motion_registration.flex[key][field]=original;
 }
 for(const endpoints of [[],null,{[key]:{moving_mm:[Infinity,0,0]}},{'bad/key':{moving_mm:moving}},
  {constructor:{moving_mm:moving}},{[key]:{moving_mm:moving,fixed_mm:fixed}}]){
  const bad=clone(f.registry),prior=clone(c.profile);bad.variants[1].installation.flex_endpoints_mm=endpoints;
  rejected(()=>applyEvaOptionsProfile(c,bad,f.heads));assert.deepEqual(c.profile,prior);endpointGuardNegatives++;
 }
 for(const endpoints of [{unknown:{moving_mm:moving}},{native_rail:{moving_mm:moving}}]){
  const bad=clone(f.registry),prior=clone(c.profile);bad.variants[1].installation.flex_endpoints_mm=endpoints;
  rejected(()=>applyEvaOptionsProfile(c,bad,f.heads));assert.deepEqual(c.profile,prior);
  rejected(()=>createEvaOptionsController(c,{...dependencies(f),registry:bad}));endpointGuardNegatives+=2;
 }
 // A head without a measured override must not inherit a previous head's target.
 const without=clone(f.registry);delete without.variants[2].installation.flex_endpoints_mm;
 c.profile.configurations.stock.flex_endpoints_mm=clone(f.a.installation.flex_endpoints_mm);
 applyEvaOptionsProfile(c,without,f.heads);check(()=>assert.deepEqual(c.profile.configurations[f.b.id].flex_endpoints_mm,{}));
 controller.dispose();endpointFixtures++;
}
for(const f of [f2,f3]){
 const baseline=clone(f.registry);check(()=>{assert.equal(validateEvaOptionsRegistry(f.registry,f.heads),true);assert.deepEqual(f.registry,baseline)});
 const mutations=[
  r=>r.schema='wrong',r=>delete r.hosts,r=>r.variants.push(clone(r.variants[0])),r=>r.assets[f.a.base_asset].component_id='wrong',
  r=>r.assets[f.a.base_asset].external=true,r=>r.assets[f.a.base_asset].external.base_url='http://example.invalid/',
  r=>r.assets[f.a.base_asset].files['model.glb'].sha256='bad',r=>r.assets[f.a.base_asset].files['parts.json'].path='../private',
  r=>r.assets[f.a.base_asset].files['model.glb'].encoding='unknown',r=>r.assets[f.a.base_asset].files['model.glb'].encoding='gzip',
  r=>r.assets[f.a.base_asset].parts=0,r=>r.variants[1].base_asset='missing',r=>r.variants[1].hotend='guessed',
  r=>r.variants[1].modules=[{id:'guessed'}],r=>r.variants[1].head_translation_mm=[0,1,0],
  r=>r.variants[1].installation.translation_mm=[1,0,0],r=>r.variants[1].installation.source_origin_mm=[0,1,0],
  r=>r.variants[1].installation.native_review_sha256='bad',r=>r.variants[1].installation.mount_axis_error_mm=.051,
  r=>r.variants[1].installation.mount_axis_error_mm=-1,r=>r.variants[1].installation.source_head_configuration='other',
  r=>r.variants[1].installation.same_carriage_source_identity=true,
  r=>r.variants[1].installation.same_carriage_source_identity.source_brep_sha256=hash('other'),
  r=>r.hosts[f.host.machine_id].model_sha256='bad',r=>r.hosts[f.host.machine_id].profile_sha256='bad',
  r=>r.hosts[f.host.machine_id].stock_head_keys.push(r.hosts[f.host.machine_id].stock_head_keys[0]),
  r=>r.hosts[f.host.machine_id].configurations.push('unknown'),r=>r.hosts[f.host.machine_id].configurations.pop(),
  r=>r.hosts[f.host.machine_id].default_configuration='missing',r=>r.hosts[f.host.machine_id].basis[0][0]=2,
  r=>r.hosts[f.host.machine_id].basis[0][0]=-1,r=>r.hosts[f.host.machine_id].native_mount.axes[0].direction=[0,0,2],
  r=>r.hosts[f.host.machine_id].native_mount.axes[0].point_mm[0]=NaN,
  r=>r.hosts[f.host.machine_id].native_mount.rail_keys=[f.stock.id+'_carriage'],
  r=>r.hosts[f.host.machine_id].native_mount.fastener_keys=['native_frame'],
  r=>r.variants[1].notes='Missing scope',r=>r.variants[1].label={title:'Bad label'}
 ];
 for(const mutate of mutations){const bad=clone(f.registry);mutate(bad);rejected(()=>validateEvaOptionsRegistry(bad,f.heads))}
 for(const mutate of [v=>v.eva.companions.hotend.push(v.eva.companions.hotend[0]),v=>v.hardware_assembled=false,v=>v.eva.generation=4]){
  const r=clone(f.registry),heads=clone(f.heads);mutate(r.variants[1]);heads.variants[1]=clone(r.variants[1]);rejected(()=>validateEvaOptionsRegistry(r,heads));
 }
 const pinCases=[c=>delete c.replay_asset_identity,c=>c.replay_asset_identity.files[0].decoded_sha256=hash('stale'),
  c=>c.replay_asset_identity.files[1].sha256=hash('stale'),c=>c.replay_asset_identity.files[2].sha256=hash('stale'),
  c=>c.replay_asset_identity.files[0].verification='observed-sha256',c=>c.replay_asset_identity.files.push(clone(c.replay_asset_identity.files[0])),
  c=>c.profile.origin_mm=[1,2,3],c=>c.profile.basis=[[0,1,0],[0,0,1],[1,0,0]],
  c=>c.manifest.parts[0].group='belt',c=>c.manifest.parts[0].source_path=['unknown'],
  c=>c.adapter.nodes.delete('native_rail'),c=>c.root.remove(c.adapter.nodes.get('native_chain'))];
 for(const mutate of pinCases){const c=current(f);mutate(c);rejected(()=>createEvaOptionsController(c,dependencies(f)))}
 {
  const c=current(f),original=c.profile,parts=c.manifest.parts,receipt=clone(c.replay_asset_identity),source=clone(c.profile);
  const stock={label:'Source stock',hidden_keys:[],rest_offsets_mm:{},notices:['Native source limits']};
  c.profile.configurations={stock:clone(stock),[f.stock.id]:clone(stock)};
  const variants=clone(f.registry);variants.variants[1].label='Complete source head A';variants.variants[1].sources=[{url:'https://example.invalid/public-source'}];variants.variants[1].notes=['Clearance is unqualified'];
  applyEvaOptionsProfile(c,variants,f.heads);
  check(()=>{assert.equal(c.profile,original);assert.equal(c.manifest.parts,parts);assert.deepEqual(c.replay_asset_identity,receipt);
   assert.deepEqual(c.profile.configurations.stock,stock);assert.deepEqual(c.profile.configurations[f.stock.id],stock);
   assert.equal(c.profile.configurations[f.a.id].label,'Complete source head A');assert.deepEqual(c.profile.configurations[f.a.id].sources,variants.variants[1].sources);
   assert.deepEqual(c.profile.configurations[f.a.id].notices,['Clearance is unqualified']);assert.deepEqual(c.profile.configurations[f.a.id].hidden_keys,[]);assert.deepEqual(c.profile.configurations[f.a.id].rest_offsets_mm,{});
   const effective=clone(c.profile);delete effective.configurations;assert.deepEqual(effective,source)});
  const before=clone(c.profile),bad=clone(variants);bad.hosts[f.host.machine_id].manifest_sha256=hash('bad');rejected(()=>applyEvaOptionsProfile(c,bad,f.heads));check(()=>assert.deepEqual(c.profile,before));
  const fallback=clone(f.registry),option=fallback.variants[1];option.installation={...option.installation,
   label:'Native complete alternative',sources:[{url:'https://example.invalid/native-source'}],notices:['Alternative companions'],
   axes:{x:[-5,5],z:[-10,20]},machine_description:'Alternative source head',motion_notices:['Measured nozzle limits only']};
  c.profile.configurations.stock.machine_description='Old LGX and Rapido';c.profile.configurations.stock.motion_notices=['Old nozzle 8.5 mm'];
  applyEvaOptionsProfile(c,fallback,f.heads);
  check(()=>{const row=c.profile.configurations[f.a.id];assert.equal(row.label,option.installation.label);
   assert.deepEqual(row.sources,option.installation.sources);assert.deepEqual(row.notices,option.installation.notices);
   assert.deepEqual(row.axes,option.installation.axes);assert.equal(row.machine_description,'Alternative source head');
   assert.deepEqual(row.motion_notices,['Measured nozzle limits only']);assert.deepEqual(c.profile.configurations[f.b.id].motion_notices,[]);
   assert.equal(c.profile.configurations[f.b.id].machine_description,f.b.id)});
  for(const limits of [{x:[-11,5]},{y:[0,21]},{z:[0,NaN]},{q:[0,1]},{x:[2,1]}]){
   const bad=clone(fallback),previous=clone(c.profile);bad.variants[1].installation.axes=limits;
   rejected(()=>applyEvaOptionsProfile(c,bad,f.heads));check(()=>assert.deepEqual(c.profile,previous));
  }
  for(const proof of [{url:'http://example.invalid',bytes:12,sha256:option.installation.native_review_sha256},
   {url:'https://example.invalid/public',bytes:12,sha256:hash('wrong')},
   {url:'https://example.invalid/public',bytes:0,sha256:option.installation.native_review_sha256}]){
   const bad=clone(fallback);bad.variants[1].installation.native_review=proof;rejected(()=>validateEvaOptionsRegistry(bad,f.heads));
  }
 }
 const c=current(f),nativeDisposals=[];c.root.traverse(m=>{if(m.isMesh){m.geometry.addEventListener('dispose',()=>nativeDisposals.push(m.geometry));m.material.addEventListener('dispose',()=>nativeDisposals.push(m.material))}});
 const before=nativeSnapshot(c),controller=createEvaOptionsController(c,dependencies(f)),loadBefore=loads;
 check(()=>{assert.equal(controller.active,f.stock.id);assert.equal(controller.current,null);assert.equal(loads,loadBefore);assert.equal(controller.entries.length,3)});
 await controller.install(f.a.id);check(()=>{assert.equal(controller.active,f.a.id);assert(controller.current);assert.equal(loads,loadBefore+1);assert(f.host.stock_head_keys.every(k=>!c.adapter.nodes.get(k).visible));untouched(c,before)});
 const aRoot=controller.current.root,aGeometry=controller.current.root.children[0].geometry;let disposedA=0;aGeometry.addEventListener('dispose',()=>disposedA++);
 const sourceMats=new Map([...controller.current.nodes].map(([k,n])=>[k,n.material.color.toArray()]));
 for(const palette of [{base:'#00ff55',accent:'#ee11ff',frame:'#abcdef'},{base:'#1177ee',accent:'#ffaa00'}, {base:'#00ff55',accent:'#ee11ff',frame:'#abcdef'},{}]){
  controller.setPalette(palette);
  for(const[key,node]of controller.current.nodes){const part=controller.current.records.get(key);if(part.printed===false)assert.deepEqual(node.material.color.toArray(),sourceMats.get(key));else if(palette[part.appearance_role])assert.equal(node.material.color.getHexString(),palette[part.appearance_role].slice(1));else assert.deepEqual(node.material.color.toArray(),sourceMats.get(key))}
 }positives++;
 for(const axes of [{x:-10,y:-20,z:-30},{x:10,y:20,z:30},{x:4,y:8,z:12},{x:-4,y:-8,z:-12},{x:0,y:0,z:0}]){
  c.adapter.setAxes(axes);const native=nativeSnapshot(c);controller.update(axes);untouched(c,native);
  const expected=displayMotion(nativeMotion('head',axes,c.profile),c.profile);
  assert.deepEqual(controller.current.root.matrix.elements.slice(12,15),expected);
  assert(f.host.stock_head_keys.every(k=>!c.adapter.nodes.get(k).visible));
 }positives++;
 check(()=>{const box=controller.bounds(),focus=controller.focus();assert(!box.isEmpty());assert(focus.center.toArray().every(Number.isFinite));assert(focus.size.toArray().every(v=>v>0))});
 await controller.install(f.b.id);check(()=>{assert.equal(controller.active,f.b.id);assert.equal(aRoot.parent,null);assert.equal(disposedA,1);assert.equal(c.root.children.filter(n=>n===controller.current.root).length,1)});
 await controller.install(f.a.id);check(()=>{assert.equal(controller.active,f.a.id);assert.equal(nativeDisposals.length,0)});
 await controller.reset();check(()=>{assert.equal(controller.active,f.stock.id);assert.equal(controller.current,null);assert(f.host.stock_head_keys.every(k=>c.adapter.nodes.get(k).visible));untouched(c,before);assert.equal(nativeDisposals.length,0)});
 await failed(()=>controller.install('other-host-id'));
 rejected(()=>controller.update({x:100,y:0,z:0}));rejected(()=>controller.setPalette({base:'red'}));
 rejected(()=>controller.setPalette({hardware:'#ffffff'}));
 controller.dispose();check(()=>assert.equal(nativeDisposals.length,0));rejected(()=>controller.update({x:0,y:0,z:0}));
}

// A candidate failing any metadata, hardware or geometry guard leaves the
// previously successful head visible, owned and undisposed.
const badCandidates=[
 (m,r)=>m.eva_generation=3,(m,r)=>m.source_revision='f'.repeat(40),(m,r)=>m.parts.pop(),
 (m,r)=>m.parts.push(clone(m.parts[0])),(m,r)=>m.source_origin_mm[0]+=1,
 (m,r)=>m.parts.find(p=>p.eva_companions.includes('hotend_fan')).appearance_role='accent',
 (m,r)=>m.parts.find(p=>p.eva_companions.includes('hotend_fan')).printed=true,
 (m,r)=>m.parts.find(p=>p.eva_companions.includes('hotend_fan')).appearance_role='frame',
 (m,r)=>delete m.parts[0].source_path,(m,r)=>m.parts[0].native_bounds_mm[0][0]+=.1,
 (m,r)=>m.parts[0].source_path=['Different source carriage'],(m,r)=>m.parts[0].source_brep_sha256=hash('wrong-carriage'),
 (m,r)=>r.remove(r.children[0]),(m,r)=>r.children[0].userData.part_key='unknown',
 (m,r)=>r.add(r.children[0].clone()),(m,r)=>r.children[0].visible=false,
 (m,r)=>r.children[0].geometry.attributes.position.setX(0,NaN),
 (m,r)=>r.children[0].geometry.attributes.normal.setX(0,NaN),
 (m,r)=>r.children[0].geometry.index.setX(0,9999),(m,r)=>r.children[0].geometry.setIndex([]),
 (m,r)=>r.children[0].geometry.setDrawRange(0,0),
 (m,r)=>r.children[0].position.x=.01,(m,r)=>r.children[0].material.opacity=0,
 (m,r)=>r.children[0].material.color.r=NaN
];
for(const mutate of badCandidates){
 const f=f2,c=current(f);let bad=false;
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:(m,r)=>{if(bad)mutate(m,r)}}));
 await controller.install(f.a.id);const previous=controller.current,baseline=nativeSnapshot(c);let released=0;
 previous.root.children[0].geometry.addEventListener('dispose',()=>released++);bad=true;
 await failed(()=>controller.install(f.b.id));check(()=>{assert.equal(controller.active,f.a.id);assert.equal(controller.current.root,previous.root);assert.equal(released,0);untouched(c,baseline);assert(f.host.stock_head_keys.every(k=>!c.adapter.nodes.get(k).visible))});controller.dispose();
}
for(const lane of ['load','front']){
 const f=f3,c=current(f);let bad=false;
 const controller=createEvaOptionsController(c,dependencies(f,{fail:()=>{if(bad&&lane==='load')throw Error('load fixture')},frontFail:()=>{if(bad&&lane==='front')throw Error('front fixture')}}));
 await controller.install(f.a.id);bad=true;const previous=controller.current.root;await failed(()=>controller.install(f.b.id));check(()=>{assert.equal(controller.current.root,previous);assert.equal(controller.active,f.a.id)});controller.dispose();
}

// Complete multi-source assemblies retain every per-part public pin; altering
// either the registration recipe or the loaded part provenance is rejected.
for(const generation of [2,3]){
 const f=fixture(generation);
 for(const v of f.registry.variants){
  const meta=f.definitions.get(v.base_asset),sources={};
  for(const p of meta.parts){p.source_sha256=hash('public-cad-'+p.eva_companions[0]);p.source_revision=p.eva_companions.includes('extruder')?'a'.repeat(40):v.eva.source_revision;
   sources[p.key]={source_sha256:p.source_sha256,source_revision:p.source_revision,source_path:p.source_path};}
  v.eva.composition={recipe_sha256:hash(v.id+'recipe'),part_sources:sources};meta.eva_composition=clone(v.eva.composition);
 }
 f.heads.variants=clone(f.registry.variants);
 check(()=>assert.equal(validateEvaOptionsRegistry(f.registry,f.heads),true));
 const changed=clone(f.registry);changed.variants[1].eva.composition.recipe_sha256=hash('other-recipe');rejected(()=>validateEvaOptionsRegistry(changed,f.heads));
 const c=current(f);let bad=false;
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:m=>{if(bad)m.parts.find(p=>p.eva_companions.includes('extruder')).source_sha256=hash('wrong-hardware')}}));
 await controller.install(f.a.id);check(()=>assert.equal(controller.active,f.a.id));bad=true;await failed(()=>controller.install(f.b.id));
 check(()=>assert.equal(controller.active,f.a.id));controller.dispose();
}
for(const generation of [2,3]){
 const f=fixture(generation),c=current(f);
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:(meta,root)=>{
  for(const m of root.children){m.geometry.deleteAttribute('normal');m.material.flatShading=true}
 }}));
 await controller.install(f.a.id);check(()=>{assert.equal(controller.active,f.a.id);assert(controller.current.root.children.every(m=>!m.geometry.attributes.normal&&m.material.flatShading))});
 const loadCount=loads;await controller.install(f.a.id);check(()=>assert.equal(loads,loadCount));controller.dispose();
 const invalid=createEvaOptionsController(current(f),dependencies(f,{mutate:(m,r)=>r.children[0].geometry.deleteAttribute('normal')}));
 await failed(()=>invalid.install(f.a.id));invalid.dispose();
}
for(const role of ['purchased','metal','motor','native','tube']){
 const f=fixture(3),c=current(f);
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:meta=>{for(const p of meta.parts)if(p.printed===false)p.appearance_role=role}}));
 await controller.install(f.a.id);const original=new Map([...controller.current.nodes].map(([k,n])=>[k,n.material.color.toArray()]));
 for(const palette of [{base:'#ff1100',accent:'#aa55ff',frame:'#ffffff'},{base:'#0011ff',accent:'#ccbb00',frame:'#111111'},{}]){
  controller.setPalette(palette);for(const[k,n]of controller.current.nodes)if(controller.current.records.get(k).printed===false)assert.deepEqual(n.material.color.toArray(),original.get(k));
 }
 check(()=>assert(controller.current.manifest.parts.filter(p=>p.printed===false).every(p=>p.appearance_role===role)));controller.dispose();
}
// A native endstop is a purchased switch on a printed carrier. Preserve both
// source leaves; recoloring the carrier must never recolor or conceal its switch.
const beforeEndstopNegatives=negatives;
for(const generation of [2,3]){
 const f=fixture(generation),c=current(f),controller=createEvaOptionsController(c,dependencies(f));
 await controller.install(f.a.id);
 const switchKey=f.a.eva.companions.endstop[0],mountKey=f.a.eva.companions.endstop_mount[0];
 const originalSwitch=controller.current.nodes.get(switchKey).material.color.toArray();
 for(const palette of [{base:'#13ff57',accent:'#b700ee'},{base:'#1155ff',accent:'#ff8100'},{base:'#13ff57',accent:'#b700ee'}]){
  controller.setPalette(palette);
  check(()=>{assert.equal(controller.current.nodes.get(mountKey).material.color.getHexString(),palette.base.slice(1));
   assert.deepEqual(controller.current.nodes.get(switchKey).material.color.toArray(),originalSwitch);
   assert.equal(controller.current.records.get(mountKey).printed,true);assert.equal(controller.current.records.get(switchKey).printed,false)});
 }
 controller.dispose();
 for(const mutate of [v=>delete v.eva.companions.endstop_mount,v=>delete v.eva.companions.endstop,
  v=>{delete v.eva.companions.endstop;delete v.eva.companions.endstop_mount},
  v=>v.eva.companions.endstop_mount=[...v.eva.companions.endstop],
  v=>v.eva.companions.endstop.push(...v.eva.companions.endstop_mount)]){
  const registry=clone(f.registry),heads=clone(f.heads);mutate(registry.variants[1]);heads.variants[1]=clone(registry.variants[1]);
  rejected(()=>validateEvaOptionsRegistry(registry,heads));
 }
 for(const mutate of [
  (mount,sw)=>mount.eva_companions=['endstop'],(mount,sw)=>mount.eva_companions=[],(mount,sw)=>sw.eva_companions=[],
  (mount,sw)=>mount.printed=false,(mount,sw)=>delete mount.printed,(mount,sw)=>mount.appearance_role='purchased',
  (mount,sw)=>sw.printed=true,(mount,sw)=>delete sw.printed,
  ...['base','accent','frame','cnc'].map(role=>(mount,sw)=>sw.appearance_role=role),
 ]){
  let bad=false;const currentHost=current(f),before=nativeSnapshot(currentHost);
  const guarded=createEvaOptionsController(currentHost,dependencies(f,{mutate:meta=>{
   if(bad)mutate(meta.parts.find(p=>p.eva_companions.includes('endstop_mount')),meta.parts.find(p=>p.eva_companions.includes('endstop')));
  }}));
  await guarded.install(f.a.id);const retained=guarded.current.root;bad=true;
  await failed(()=>guarded.install(f.b.id));
  check(()=>{assert.equal(guarded.active,f.a.id);assert.equal(guarded.current.root,retained);untouched(currentHost,before)});
  guarded.dispose();
 }
}
const endstopCompanionNegatives=negatives-beforeEndstopNegatives;
{
 const f=fixture(2),stockMeta=f.definitions.get(f.stock.base_asset),mount=f.stock.eva.companions.endstop_mount[0];
 // Immutable legacy stock can carry the old mixed category. It is restored
 // through the original full-host nodes and never parsed as a new overlay.
 f.stock.eva.companions.endstop.push(mount);delete f.stock.eva.companions.endstop_mount;
 stockMeta.parts.find(p=>p.key===mount).eva_companions=['endstop'];
 f.registry.assets[f.stock.base_asset].files['parts.json'].sha256=hash(stockMeta);
 f.heads.variants=clone(f.registry.variants);f.heads.base_assets=clone(f.registry.assets);
 const c=current(f),original=nativeSnapshot(c),initialLoads=loads,controller=createEvaOptionsController(c,dependencies(f));
 await controller.install(f.stock.id);check(()=>{assert.equal(loads,initialLoads);assert.equal(controller.current,null)});
 await controller.install(f.a.id);await controller.reset();
 check(()=>{assert.equal(controller.current,null);assert.equal(controller.active,f.stock.id);untouched(c,original);assert(f.host.stock_head_keys.every(k=>c.adapter.nodes.get(k).visible))});
 controller.dispose();
}
{
 const f=f3,c=current(f);
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:(meta,root)=>{
  const leaf=root.children[0],owner=new THREE.Group();owner.userData.part_key=leaf.userData.part_key;
  root.remove(leaf);delete leaf.userData.part_key;const other=leaf.clone();other.geometry=leaf.geometry.clone();other.material=leaf.material.clone();owner.add(leaf,other);root.add(owner);
 }}));
 await controller.install(f.a.id);check(()=>{const owner=controller.current.nodes.get(f.a.id+'_carriage');assert.equal(owner.children.length,2);assert(owner.children.every(n=>n.userData.part_key===owner.userData.part_key));assert.notEqual(owner.children[0].material,owner.children[1].material)});
 controller.setPalette({base:'#10cc55',accent:'#aa11cc'});check(()=>{const owner=controller.current.nodes.get(f.a.id+'_carriage');assert(owner.children.every(n=>n.material.color.getHexString()==='10cc55'))});controller.dispose();
}
{
 // Even an injected loader borrowing native resources cannot dispose them.
 const f=f2,c=current(f),native=c.adapter.nodes.get(f.stock.id+'_carriage');let nativeReleased=0;
 native.geometry.addEventListener('dispose',()=>nativeReleased++);native.material.addEventListener('dispose',()=>nativeReleased++);
 const controller=createEvaOptionsController(c,dependencies(f,{mutate:(m,r)=>{r.children[0].geometry=native.geometry;r.children[0].material=native.material}}));
 await controller.install(f.a.id);await controller.reset();controller.dispose();check(()=>assert.equal(nativeReleased,0));
}
function latch(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
// Rapid requests do not begin concurrent network/model loads or commit stale
// heads. Updates and palettes during the wait affect only the final candidate.
{
 const f=f2,c=current(f),gate=latch(),started=latch(),calls=[];
 const controller=createEvaOptionsController(c,dependencies(f,{wait:async asset=>{calls.push(asset.component_id);if(calls.length===1){started.resolve();await gate.promise}}}));
 const first=controller.install(f.a.id);await started.promise;
 const second=controller.install(f.b.id),third=controller.install(f.a.id);
 c.adapter.setAxes({x:10,y:20,z:30});controller.update(c.adapter.getAxes());controller.setPalette({base:'#55aaff',accent:'#ff55aa'});
 gate.resolve();const result=await Promise.all([first,second,third]);
 check(()=>{assert.deepEqual(result.map(r=>r.stale),[true,true,false]);assert.deepEqual(calls,[f.a.base_asset,f.a.base_asset]);assert.equal(controller.active,f.a.id);
  assert.deepEqual(controller.current.root.matrix.elements.slice(12,15),displayMotion(nativeMotion('head',c.adapter.getAxes(),c.profile),c.profile));assert.equal(controller.pending,null)});controller.dispose();
}
{
 const f=f3,c=current(f),gate=latch(),started=latch();let waiting=false;
 const controller=createEvaOptionsController(c,dependencies(f,{wait:async()=>{if(waiting){started.resolve();await gate.promise}}}));
 await controller.install(f.a.id);waiting=true;const loading=controller.install(f.b.id);await started.promise;
 const reset=controller.reset();check(()=>{assert.equal(controller.active,f.stock.id);assert.equal(controller.current,null);assert(f.host.stock_head_keys.every(k=>c.adapter.nodes.get(k).visible))});
 await reset;gate.resolve();const result=await loading;check(()=>{assert(result.stale);assert.equal(controller.active,f.stock.id);assert.equal(controller.current,null)});controller.dispose();
}
{
 const f=f2,c=current(f),gate=latch(),started=latch();
 const controller=createEvaOptionsController(c,dependencies(f,{wait:async()=>{started.resolve();await gate.promise}}));
 const request=controller.install(f.a.id);await started.promise;controller.dispose();gate.resolve();const result=await request;
 check(()=>{assert(result.stale);assert.equal(controller.current,null);assert(f.host.stock_head_keys.every(k=>c.adapter.nodes.get(k).visible))});
}
{
 const f=f3,c=current(f),gate=latch(),started=latch();
 const controller=createEvaOptionsController(c,dependencies(f,{wait:async()=>{started.resolve();await gate.promise},fail:()=>{throw Error('obsolete load failure')}}));
 const request=controller.install(f.a.id);await started.promise;await controller.reset();gate.resolve();
 const result=await request;check(()=>{assert(result.stale);assert.equal(controller.active,f.stock.id);assert.equal(controller.current,null)});controller.dispose();
}
{
 const f=f2,c=current(f);c.adapter.nodes.get(f.host.stock_head_keys[0]).visible=false;
 const controller=createEvaOptionsController(c,dependencies(f));await controller.install(f.a.id);await controller.reset();
 check(()=>{assert.equal(c.adapter.nodes.get(f.host.stock_head_keys[0]).visible,false);assert(f.host.stock_head_keys.slice(1).every(k=>c.adapter.nodes.get(k).visible))});controller.dispose();
}
check(()=>assert.equal(maxDownloads,1));

// Exercise the default checksum loader and production surface replacement on
// real glTF parses of synthetic fixtures, without a network or CAD fallback.
function fixtureGlb(root){
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.1,.1,.1,1],metallicFactor:.7,roughnessFactor:.37}}]},chunks=[];let offset=0;
 function accessor(attribute,type,componentType,position=false){
  const data=Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength),view=doc.bufferViews.length;
  doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});chunks.push(data);offset+=data.length;
  const padding=(-offset)&3;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding}
  const index=doc.accessors.length,record={bufferView:view,componentType,count:attribute.count,type};
  if(position){const box=new THREE.Box3().setFromBufferAttribute(attribute);record.min=box.min.toArray();record.max=box.max.toArray()}
  doc.accessors.push(record);return index;
 }
 root.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry;
  const position=accessor(g.attributes.position,'VEC3',5126,true),normal=accessor(g.attributes.normal,'VEC3',5126),indices=accessor(g.index,'SCALAR',g.index.array instanceof Uint16Array?5123:5125);
  const index=doc.nodes.length;doc.nodes.push({mesh:doc.meshes.length,extras:{part_key:mesh.userData.part_key}});doc.scenes[0].nodes.push(index);
  doc.meshes.push({primitives:[{attributes:{POSITION:position,NORMAL:normal},indices,material:0}]});
 });
 doc.buffers=[{byteLength:offset}];let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]);
 const binary=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,json,binHeader,binary]);
}
register('./three-test-loader.mjs',import.meta.url);
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
let defaultLoaderChecks=0;
for(const generation of [2,3]){
 const f=fixture(generation),bodies=new Map();
 for(const [assetId,meta]of f.definitions){
  const root=model(meta),bytes=fixtureGlb(root),metadata=Buffer.from(JSON.stringify(meta)),asset=f.registry.assets[assetId];
  asset.files['model.glb']={path:assetId+'.glb',bytes:bytes.length,sha256:hash(bytes)};
  asset.files['parts.json']={path:assetId+'.json',bytes:metadata.length,sha256:hash(metadata)};
  bodies.set(asset.files['model.glb'].path,bytes);bodies.set(asset.files['parts.json'].path,metadata);
 }
 f.heads.base_assets=clone(f.registry.assets);
 const sourceMeta=f.definitions.get(f.a.base_asset),target=sourceMeta.parts.find(p=>p.eva_companions.includes('core'));
 const patchRoot=new THREE.Group(),patchMesh=model(sourceMeta).children.find(n=>n.userData.part_key===target.key).clone();
 patchMesh.geometry=patchMesh.geometry.clone();patchMesh.geometry.translate(...displayMotion(f.host.origin_mm,{basis}));patchMesh.userData.part_key='source_patch';patchRoot.add(patchMesh);
 const patchMeta={id:'fixture_source_surfaces',source_solids_modified:false,supports_removed:false,parts:[{key:'source_patch',source_brep_sha256:target.source_brep_sha256}]};
 const owners={};for(const v of f.registry.variants){const meta=f.definitions.get(v.base_asset),part=meta.parts.find(p=>p.eva_companions.includes('core'));
  owners[meta.id]={id:meta.id,model_sha256:f.registry.assets[v.base_asset].files['model.glb'].sha256,source_step_sha256:meta.source_sha256,source_origin_mm:clone(f.host.origin_mm),
   targets:[{part_key:part.key,patch_key:'source_patch',source_path:part.source_path,source_brep_sha256:part.source_brep_sha256}]};
 }owners.fixture_fourth={...clone(Object.values(owners)[0]),id:'fixture_fourth'};
 const surfaces={registry:{schema:'3d-print-rig-eva-front-surfaces-v1',source_solids_modified:false,supports_removed:false,owners,
  asset:{component_id:patchMeta.id,external:{base_url:'https://example.invalid/'},files:{'model.glb':{decoded_sha256:hash('patch')}}}},patchRoot,patchMeta};
 const patchGeometry=patchMesh.geometry,patchPositions=[...patchGeometry.attributes.position.array],patchNormals=[...patchGeometry.attributes.normal.array],patchIndices=[...patchGeometry.index.array];let patchDisposed=0;
 patchGeometry.addEventListener('dispose',()=>patchDisposed++);
 const c=current(f),requests=[],originalFetch=globalThis.fetch;let broken=false;
 globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').pop();requests.push(name);const data=bodies.get(name);if(!data)return new Response('missing',{status:404});return new Response(broken&&name===f.registry.assets[f.b.base_asset].files['model.glb'].path?Buffer.from('wrong hash'):data)};
 try{
  const controller=createEvaOptionsController(c,{registry:f.registry,heads:f.heads,loader:new GLTFLoader(),href:'https://example.invalid/viewer/community.html',loadFrontSurfaces:async()=>surfaces});
  assert.equal(requests.length,0);await controller.install(f.a.id);
  check(()=>{assert.equal(requests.length,2);assert.equal(controller.active,f.a.id);assert.equal(controller.current.nodes.get(target.key).userData.eva_front_surface?.source_solids_modified,false);
   assert.notEqual(controller.current.nodes.get(target.key).geometry,patchGeometry);
   assert.equal(patchMesh.parent,patchRoot);assert.deepEqual(patchMesh.matrix.elements,new THREE.Matrix4().elements)});
  const original=controller.current.root;broken=true;await failed(()=>controller.install(f.b.id));check(()=>{assert.equal(controller.current.root,original);assert.equal(controller.active,f.a.id)});
  broken=false;await controller.install(f.b.id);await controller.install(f.a.id);await controller.reset();controller.dispose();
  check(()=>{assert.equal(patchDisposed,0);assert.equal(patchMesh.geometry,patchGeometry);assert.deepEqual([...patchGeometry.attributes.position.array],patchPositions);
   assert.deepEqual([...patchGeometry.attributes.normal.array],patchNormals);assert.deepEqual([...patchGeometry.index.array],patchIndices);assert.equal(patchMesh.parent,patchRoot)});
  defaultLoaderChecks++;
 }finally{globalThis.fetch=originalFetch}
}
const gate=await fs.readFile(new URL('./check_eva_front_release.py',import.meta.url),'utf8');
const build=await fs.readFile(new URL('./build_site.py',import.meta.url),'utf8');
check(()=>{assert(gate.includes('audit_eva_front_surfaces.mjs'));assert(build.includes('check_eva_front_release.py'))});
check(()=>{
 assert(/subprocess\.run\(\[sys\.executable,\s*str\(ROOT\/'scripts\/check_eva_options_release\.py'\),\s*'--output', folder\], cwd=ROOT, check=True\)/.test(build),'Missing mandatory options build invocation');
 assert(build.includes("shutil.copyfile(Path(folder)/'actual-options.json', target/'review/eva-options.json')"),'Missing actual options release report');
 const coverage=spawnSync(process.execPath,[new URL('./check_machine_coverage.mjs',import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'),'--registration-only'],{encoding:'utf8'});
 assert.equal(coverage.status,0,coverage.stderr||'Required machine suite registration failed');
 const rows=JSON.parse(coverage.stdout).machines;
 for(const family of ['vminion','vcore3']){const machines=rows.filter(m=>m.family===family);assert(machines.length,'Missing native EVA family');
  for(const machine of machines)assert(machine.regressions.includes('eva_options'),'EVA controller suite not required for '+machine.id);
 }
});
const {checkedEvaOptionArtifact,checkEvaOptionNativeReview,evaOptionsCodeClosure,
 evaOptionIdentityBridgeParts,evaOptionIdentityBridgeDescriptor,checkEvaOptionIdentityBridge}=await import('./audit_eva_options.mjs');
const ownFile=new URL('./test_eva_options.mjs',import.meta.url),ownBytes=await fs.readFile(ownFile);
const descriptor={path:'fixture-code.txt',bytes:ownBytes.length,sha256:hash(ownBytes)};
const record={url:'https://psych0h3ad.github.io/fixture-code.txt',path:decodeURIComponent(ownFile.pathname).replace(/^\/(?:([A-Z]:))/,'$1'),descriptor};
await checkedEvaOptionArtifact(record);positives++;
for(const mutate of [r=>r.descriptor.encoding='unknown',r=>r.descriptor.bytes++,r=>r.descriptor.sha256=hash('stale'),
 r=>r.url='https://example.invalid/fixture-code.txt',r=>r.descriptor.encoding='gzip',r=>delete r.descriptor.sha256]){
 const bad=clone(record);mutate(bad);await failed(()=>checkedEvaOptionArtifact(bad));
}
await failed(()=>checkedEvaOptionArtifact(record,{...descriptor,sha256:hash('other catalog')}));
for(const f of [fixture(2),fixture(3)]){
 const manifest=current(f).manifest,profile={source:{revision:f.stock.eva.source_revision,source_step_sha256:hash('fixture-native-source')}},carriage=f.stock.id+'_carriage';
 const review={machine_id:f.host.machine_id,eva_generation:f.generation,source_revision:profile.source.revision,
  source_step_sha256:profile.source.source_step_sha256,carriage_key:carriage,native_mating_planes:{gap_mm:0},
  mount_review:{mount_verified:true,full_physical_fit_certified:false,axis_error_mm:0,rail_keys:clone(f.host.native_mount.rail_keys),fastener_keys:clone(f.host.native_mount.fastener_keys)},
  native_fastener_hole_axes:[{source_shaft:{origin_mm:[0,0,0],axis:[0,0,1]}}],
  source_leaf_witnesses:[{key:carriage,valid:true,source_identity:{path:clone(f.host.native_mount.carriage_source_identity.source_path)},brep_sha256:f.host.native_mount.carriage_source_identity.source_brep_sha256}]};
 check(()=>{assert.equal(checkEvaOptionNativeReview(review,f.stock,f.host,manifest,profile).full_physical_fit_certified,false)});
 for(const mutate of [r=>r.machine_id='other',r=>r.eva_generation=4,r=>r.source_revision='stale',r=>r.source_step_sha256=hash('other'),
  r=>r.mount_review.mount_verified=false,r=>r.mount_review.full_physical_fit_certified=true,r=>r.mount_review.axis_error_mm=.06,
  r=>r.mount_review.rail_keys=['other'],r=>r.mount_review.fastener_keys=['missing'],r=>r.native_mating_planes.gap_mm=.5,
  r=>r.native_fastener_hole_axes[0].source_shaft.axis=[1,0,0],r=>r.source_leaf_witnesses[0].valid=false,
  r=>r.source_leaf_witnesses[0].brep_sha256=hash('other'),r=>r.source_leaf_witnesses[0].source_identity.path=['other']]){
  const bad=clone(review);mutate(bad);rejected(()=>checkEvaOptionNativeReview(bad,f.stock,f.host,manifest,profile));
 }
}
let socketProofNegatives=0;
for(const generation of [2,3]){
 const {f,c,key}=endpointFixture(generation),v=f.a,meta=f.definitions.get(v.base_asset),socket=meta.parts.find(p=>p.eva_companions.includes('extruder'));
 const route=c.profile.motion_registration.flex[key],target=v.installation.flex_endpoints_mm[key].moving_mm;
 c.profile.source={revision:v.eva.source_revision,source_step_sha256:hash('fixture-native-source')};
 const review={machine_id:f.host.machine_id,eva_generation:generation,configuration:v.id,source_revision:v.eva.source_revision,
  source_step_sha256:c.profile.source.source_step_sha256,
  mount_review:{mount_verified:true,full_physical_fit_certified:false,axis_error_mm:0,rail_keys:clone(f.host.native_mount.rail_keys),fastener_keys:clone(f.host.native_mount.fastener_keys)},
  flex_endpoints_mm:{[key]:{moving_mm:clone(target),source_moving_mm:clone(route.moving_mm),fixed_mm:clone(route.fixed_mm),
   socket:{part_key:socket.key,source_path:clone(socket.source_path),source_brep_sha256:socket.source_brep_sha256,
    source_sha256:meta.source_sha256,source_revision:meta.source_revision},
   measurement:{frame:'native_host_mm',method:'native_cad_socket_axis',center_mm:clone(target)}}}};
 check(()=>{const proof=checkEvaOptionNativeReview(review,v,f.host,c.manifest,c.profile,null,meta);
  assert.deepEqual(proof.flex_endpoint_socket_reviews[0].moving_mm,target);assert.equal(proof.full_physical_fit_certified,false)});
 for(const mutate of [r=>delete r.flex_endpoints_mm,r=>r.flex_endpoints_mm.unknown=clone(r.flex_endpoints_mm[key]),
  r=>r.flex_endpoints_mm[key].moving_mm[0]+=1,r=>r.flex_endpoints_mm[key].source_moving_mm[0]+=1,
  r=>r.flex_endpoints_mm[key].fixed_mm[0]+=1,r=>r.flex_endpoints_mm[key].measurement.frame='display_mm',
  r=>r.flex_endpoints_mm[key].measurement.method='generic_offset',r=>r.flex_endpoints_mm[key].measurement.center_mm[0]+=1,
  r=>r.flex_endpoints_mm[key].socket.part_key='unknown',r=>r.flex_endpoints_mm[key].socket.source_path=['other'],
  r=>r.flex_endpoints_mm[key].socket.source_brep_sha256=hash('wrong'),r=>r.flex_endpoints_mm[key].socket.source_sha256=hash('wrong'),
  r=>r.flex_endpoints_mm[key].socket.source_revision='wrong']){
  const bad=clone(review);mutate(bad);rejected(()=>checkEvaOptionNativeReview(bad,v,f.host,c.manifest,c.profile,null,meta));socketProofNegatives++;
 }
 rejected(()=>checkEvaOptionNativeReview(review,v,f.host,c.manifest,c.profile,null));socketProofNegatives++;
 const missing=clone(meta);delete missing.parts.find(p=>p.key===socket.key).source_brep_sha256;
 rejected(()=>checkEvaOptionNativeReview(review,v,f.host,c.manifest,c.profile,null,missing));socketProofNegatives++;
 const registry=clone(f.registry);registry.variants[1].installation.flex_endpoints_mm={[key]:{moving_mm:[NaN,0,0]}};
 rejected(()=>validateEvaOptionsRegistry(registry,f.heads));socketProofNegatives++;
}
// A BRep namespace alias is accepted only with the exact native-source receipt;
// neither matching boxes/volumes nor a newly written canonical hash prove it.
function identityBridgeFixture(){
 const f=fixture(3),metadata=clone(f.definitions.get(f.a.base_asset)),part=metadata.parts[0],manifest=current(f).manifest;
 const native=manifest.parts.find(p=>p.key===f.stock.id+'_carriage'),approvedMountSha256=hash('approved native mount receipt');
 Object.assign(part,{brep_sha256:hash('render native occurrence'),source_brep_sha256:f.host.native_mount.carriage_source_identity.source_brep_sha256,
  source_sha256:metadata.source_sha256,source_revision:metadata.source_revision,source_label_path:['source','baseline-carriage'],definition_label:'baseline-definition',
  native_transform:[[1,0,0,0],[0,1,0,0],[0,0,1,0]],faces:7,solids:5,volume_mm3:5,bounds_mm:[[0,0,0],[5,1,1]]});
 Object.assign(native,{brep_sha256:part.source_brep_sha256,source_label_path:['source','host-carriage'],definition_label:'host-definition',
  native_transform:clone(part.native_transform),faces:part.faces,solids:part.solids,volume_mm3:part.volume_mm3,bounds_mm:clone(part.bounds_mm)});
 metadata.source_url='https://ratrig.autodesk360.com/shares/public/fixture';
 metadata.eva_composition={part_sources:{[part.key]:{source_sha256:part.source_sha256,source_revision:part.source_revision,source_path:clone(part.source_path)}}};
 const proof={schema:'3d-print-rig-native-brep-serialization-identity-v1',source_sha256:part.source_sha256,source_revision:part.source_revision,
  source_url:'https://ratrig.autodesk360.com/shares/public/fixture',source_path:clone(part.source_path),source_label_path:clone(native.source_label_path),definition_label:native.definition_label,
  baseline_label_namespace:{source_label_path:clone(part.source_label_path),definition_label:part.definition_label},native_transform:clone(part.native_transform),
  baseline_brep_sha256:part.brep_sha256,host_brep_sha256:part.source_brep_sha256,approved_mount_receipt_sha256:approvedMountSha256,
  baseline_brep_namespace:'Authored occurrence location',host_brep_namespace:'Normalized occurrence matrix',regenerated_breps_byte_exact:true,source_definition_tshape_identical:true,
  volume_mm3:5,volume_error_mm3:0,faces:part.faces,solids:5,baseline_bounds_mm:clone(part.bounds_mm),host_bounds_mm:clone(part.bounds_mm),
  native_face_witnesses:Array.from({length:part.faces},(_,face_ordinal)=>({face_ordinal,center_error_mm:0,area_error_mm2:0,source_area_mm2:1})),
  carriage_mating_plane:{face_ordinal:0,separation_mm:0,baseline:{face:0,point:[0,0,0],normal:[0,0,1],area:1},host:{face:0,point:[0,0,0],normal:[0,0,1],area:1}},
  native_fastener_bores:[{face_ordinal:1,fastener_key:f.host.native_mount.fastener_keys[0],radius_mm:1,axis_error_mm:0,
   baseline:{face:1,radius:1,point:[0,0,0],direction:[0,0,1]},host:{face:1,radius:1,point:[0,0,0],direction:[0,0,1]}}],
  source_geometry_changed:false,render_geometry_changed:false,full_physical_fit_certified:false,
  inverse_placement_solid_comparison:{method:'BRepAlgoAPI_Cut/Common, exact shared native definition',native_definition_breps_byte_identical:true,
   native_definition_brep_sha256:hash('native carriage definition'),baseline_minus_host_total_volume_mm3:0,host_minus_baseline_total_volume_mm3:0,all_five_source_solids_retained:true,
   witnesses:Array.from({length:5},(_,solid_ordinal)=>({solid_ordinal,baseline_volume_mm3:1,host_volume_mm3:1,
    baseline_minus_host:{volume_mm3:0,solids:0,faces:0},host_minus_baseline:{volume_mm3:0,solids:0,faces:0},common:{volume_mm3:1,solids:1,faces:1}}))}};
 part.source_brep_identity_bridge={url:'https://psych0h3ad.github.io/fixture-carriage-identity.json',bytes:Buffer.byteLength(JSON.stringify(proof)),sha256:hash(proof),
  baseline_brep_sha256:proof.baseline_brep_sha256,host_brep_sha256:proof.host_brep_sha256,native_definition_brep_sha256:proof.inverse_placement_solid_comparison.native_definition_brep_sha256};
 const context={metadata,variant:f.a,host:f.host,manifest,profile:{source:{source_step_sha256:part.source_sha256,revision:part.source_revision}},approvedMountSha256};
 return {part,proof,context};
}
let identityBridgeNegatives=0;
{
 const f=identityBridgeFixture();
 check(()=>{assert.deepEqual(evaOptionIdentityBridgeParts(f.context.metadata).map(p=>p.key),[f.part.key]);
  const result=checkEvaOptionIdentityBridge(f.proof,f.part,f.context);assert.equal(result.native_solid_witnesses,5);assert.equal(result.full_physical_fit_certified,false)});
 for(const mutate of [r=>delete r.part.source_brep_identity_bridge,r=>r.part.source_brep_identity_bridge.sha256='missing',
  r=>r.part.source_brep_identity_bridge.host_brep_sha256=hash('false canonical BRep'),r=>r.part.source_brep_identity_bridge.baseline_brep_sha256=hash('false rendered BRep'),
  r=>r.part.source_brep_identity_bridge.encoding='gzip',r=>r.part.source_brep_identity_bridge.url='https://example.invalid/bridge.json',
  r=>r.part.source_brep_identity_bridge.url+='?mutable=1',r=>r.part.source_brep_identity_bridge.bytes=0,
  r=>r.context.metadata.parts.push(clone(r.part))]){
  const bad=clone(f);mutate(bad);rejected(()=>evaOptionIdentityBridgeParts(bad.context.metadata));identityBridgeNegatives++;
 }
 for(const mutate of [r=>r.proof=null,r=>r.proof.source_definition_tshape_identical=false,r=>r.proof.regenerated_breps_byte_exact=false,
  r=>r.proof.source_path=['other occurrence'],r=>r.proof.source_sha256=hash('stale source'),r=>r.proof.source_revision='stale',r=>r.proof.source_url='https://example.invalid/other-public-cad',
  r=>r.proof.host_brep_sha256=hash('false host'),r=>r.proof.baseline_brep_sha256=hash('false render'),r=>r.proof.approved_mount_receipt_sha256=hash('other mount'),
  r=>r.proof.source_label_path=['other host label'],r=>r.proof.baseline_label_namespace.definition_label='other definition',r=>r.proof.native_transform[0][3]+=1,
  r=>r.proof.native_face_witnesses.pop(),r=>r.proof.native_face_witnesses[1].face_ordinal=0,r=>r.proof.native_face_witnesses[0].center_error_mm=.001,
  r=>r.proof.inverse_placement_solid_comparison.native_definition_breps_byte_identical=false,r=>r.proof.inverse_placement_solid_comparison.all_five_source_solids_retained=false,
  r=>r.proof.inverse_placement_solid_comparison.native_definition_brep_sha256=hash('stale definition'),r=>r.proof.inverse_placement_solid_comparison.witnesses.pop(),
  r=>r.proof.inverse_placement_solid_comparison.witnesses[0].baseline_minus_host.volume_mm3=.001,
  r=>r.proof.inverse_placement_solid_comparison.witnesses[0].common.volume_mm3=.5,r=>r.proof.carriage_mating_plane.separation_mm=.001,
  r=>r.proof.native_fastener_bores[0].axis_error_mm=.001,r=>{r.proof.native_fastener_bores[0].baseline.point[0]+=1;r.proof.native_fastener_bores[0].host.point[0]+=1},
  r=>r.context.manifest.parts.find(p=>p.source_path?.at(-1)==='carriage:1').brep_sha256=hash('wrong actual host'),
  r=>r.context.metadata.eva_composition.part_sources[r.part.key].source_sha256=hash('false composition'),
  r=>r.proof.render_geometry_changed=true,r=>r.proof.source_geometry_changed=true,r=>r.proof.full_physical_fit_certified=true]){
  const bad=clone(f);mutate(bad);rejected(()=>checkEvaOptionIdentityBridge(bad.proof,bad.part,bad.context));identityBridgeNegatives++;
 }
 // The Python preparer must pin declarations from checksum-addressed metadata,
 // and refuse aliases with missing, stale or invalid receipt descriptors.
 const cases=[f.context.metadata];
 for(const mutate of [p=>delete p.source_brep_identity_bridge,p=>p.source_brep_identity_bridge.sha256='missing',
  p=>p.source_brep_identity_bridge.host_brep_sha256=hash('false canonical'),p=>p.source_brep_identity_bridge.url='https://example.invalid/bridge.json',
  p=>p.source_brep_identity_bridge.encoding='gzip',p=>p.source_brep_identity_bridge.bytes=0]){
  const bad=clone(f.context.metadata);mutate(bad.parts[0]);cases.push(bad);
 }
 const python=`import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('eva_gate',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\ncases=json.load(sys.stdin);good=module.identity_bridge_descriptors(cases[0]);assert len(good)==1\nfor bad in cases[1:]:\n try: module.identity_bridge_descriptors(bad)\n except ValueError: pass\n else: raise AssertionError('Unproved or unpinned carriage bridge accepted')\nprint(json.dumps({'positive':good,'rejected':len(cases)-1}))`;
 const gatePath=decodeURIComponent(new URL('./check_eva_options_release.py',import.meta.url).pathname).replace(/^\/(?:([A-Z]:))/,'$1');
 const run=spawnSync(process.env.PYTHON||'python',['-B','-c',python,gatePath],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||'Python carriage bridge input preparation failed');
 const prepared=JSON.parse(run.stdout);check(()=>assert.deepEqual(prepared.positive[f.part.key],{url:f.part.source_brep_identity_bridge.url,descriptor:evaOptionIdentityBridgeDescriptor(f.part)}));
 negatives+=prepared.rejected;identityBridgeNegatives+=prepared.rejected;
 const downloadFixture=`import importlib.util,json,sys,hashlib,tempfile,io,contextlib\nfrom pathlib import Path\nfrom unittest.mock import patch\nspec=importlib.util.spec_from_file_location('eva_gate',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\nmeta,proof_text=json.load(sys.stdin);part=meta['parts'][0];bridge=part['source_brep_identity_bridge'];base='https://psych0h3ad.github.io/fixture-bridge/';blobs={bridge['url']:proof_text.encode()}\ndef blob(name,data):\n data=data.encode() if isinstance(data,str) else data;blobs[base+name]=data;return {'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}\nhead={'component_id':meta['id'],'external':{'base_url':base,'local_directory':'fixture'},'files':{'model.glb':blob('head.glb','synthetic model download fixture'),'parts.json':blob('head-parts.json',json.dumps(meta,separators=(',',':')))}}\nhostid='fixture-source-host';hostfiles={'model.glb':blob('host.glb','synthetic native download fixture'),'assembly_manifest.json':blob('host-manifest.json','{}'),'machine_profile.json':blob('host-profile.json','{}')};review=blob('mount.json','{}')\nregistry={'schema':'3d-print-rig-eva-options-v1','assets':{meta['id']:head},'variants':[{'id':'fixture-configuration','base_asset':meta['id'],'machine_id':hostid,'installation':{'native_review_sha256':review['sha256'],'native_review':{'url':base+review['path'],'bytes':review['bytes'],'sha256':review['sha256']}}}], 'hosts':{hostid:{'model_sha256':hostfiles['model.glb']['sha256'],'manifest_sha256':hostfiles['assembly_manifest.json']['sha256'],'profile_sha256':hostfiles['machine_profile.json']['sha256'],'configurations':['fixture-configuration'],'default_configuration':'fixture-configuration'}}}\nfront={'asset':{'external':{'base_url':base},'files':{'model.glb':blob('patch.glb','synthetic patch download fixture'),'parts.json':blob('patch-parts.json','{}')}}}\ncatalogs={'EVA_OPTIONS.json':registry,'HEAD_ADDITIONS.json':{'assets':{meta['id']:head}},'COMMUNITY_MACHINES_ASSETS.json':{'base_url':base,'machines':{hostid:{'machine_id':hostid,'files':hostfiles}}},'EVA_INSTALLATIONS.json':{'machines':{hostid:{}}},'EVA_FRONT_SURFACES.json':front}\nclass Response:\n def __init__(self,url,corrupt):self.url=url;self.corrupt=corrupt\n def __enter__(self):return self\n def __exit__(self,*args):pass\n def geturl(self):return self.url\n def read(self,n):\n  data=blobs[self.url];return (b'X'+data[1:] if self.corrupt and self.url==bridge['url'] else data)[:n]\nfor corrupt in [False,True]:\n with tempfile.TemporaryDirectory(prefix='eva-bridge-prep-fixture-') as folder:\n  root=Path(folder);(root/'site').mkdir();out=root/'output';seen=[]\n  for name,data in catalogs.items():(root/'site'/name).write_text(json.dumps(data))\n  def fetch(request,timeout):\n   url=request.full_url\n   if url==bridge['url']:assert base+'head-parts.json' in seen\n   seen.append(url);return Response(url,corrupt)\n  with patch.object(module,'ROOT',root),patch.object(sys,'argv',['gate','--output',str(out),'--prepare-only']),patch.object(module.urllib.request,'urlopen',fetch),contextlib.redirect_stdout(io.StringIO()):\n   if corrupt:\n    try:module.main()\n    except ValueError as error:assert 'checksum mismatch' in str(error)\n    else:raise AssertionError('Stale native bridge download accepted')\n   else:\n    module.main();inputs=json.loads((out/'inputs.json').read_text());record=inputs['identity_bridges'][meta['id']][part['key']];assert record['url']==bridge['url'] and record['descriptor']['sha256']==bridge['sha256'];assert hashlib.sha256(Path(record['path']).read_bytes()).hexdigest()==bridge['sha256']\nprint(json.dumps({'pinned_metadata_then_bridge_download':True,'corrupt_bridge_download_rejected':True}))`;
 const downloaded=spawnSync(process.env.PYTHON||'python',['-B','-c',downloadFixture,gatePath],{input:JSON.stringify([f.context.metadata,JSON.stringify(f.proof)]),encoding:'utf8'});
 assert.equal(downloaded.status,0,downloaded.stderr||'Python identity bridge download gate fixture failed');
 const lifecycle=JSON.parse(downloaded.stdout);check(()=>assert.equal(lifecycle.pinned_metadata_then_bridge_download,true));
 check(()=>assert.equal(lifecycle.corrupt_bridge_download_rejected,true));negatives++;identityBridgeNegatives++;
 const wrong=fixture(3),meta=wrong.definitions.get(wrong.a.base_asset);meta.parts[0].source_brep_sha256=hash('unproved installed carriage');
 meta.parts[0].source_brep_identity_bridge=clone(f.part.source_brep_identity_bridge);
 const c=current(wrong),controller=createEvaOptionsController(c,dependencies(wrong));
 await failed(()=>controller.install(wrong.a.id));identityBridgeNegatives++;
 check(()=>{assert.equal(controller.active,wrong.stock.id);assert.equal(controller.current,null)});controller.dispose();
}
const closure=evaOptionsCodeClosure();
check(()=>{for(const file of ['site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js','site/viewer/community-state.mjs',
 'site/viewer/native-motion-flex.mjs','site/viewer/component-assets.mjs','site/viewer/eva-options.mjs','site/viewer/community-loader.mjs'])assert(/^[a-f0-9]{64}$/.test(closure[file]),'Missing release code pin '+file)});
async function parentIntegrationReview(){
 const files={};for(const name of ['community-renderer.mjs','toolheads.js','machine-heads.js','eva-front-surfaces.mjs','inactive-head-cache.mjs','render-export.js'])files[name]=await fs.readFile(new URL('../site/viewer/'+name,import.meta.url),'utf8');
 const findings=[],checks=[];let standaloneBankAdapterReview=null,communityStartupReview=null;
 const range=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a,'Parent source fixture anchor changed');return text.slice(a,b)};
 const line=(file,fragment)=>files[file].slice(0,files[file].indexOf(fragment)).split('\n').length;
 // Execute exact nested production functions with synthetic DOM/frame/load
 // adapters. No rewritten install/render algorithm and no CAD/GPU claim.
 const communityFunctions=range(files['community-renderer.mjs'],' const ranges=()',' function resize(){')+
  range(files['community-renderer.mjs'],' function setAxes(next){',' function setPalette(value){')+
  range(files['community-renderer.mjs'],' async function setInstallation(id){',' for(const[id,kind]of ');
 const makeCommunity=new Function('env',`
  const {current,evaOptions,scope,axisKeys,$,document,history,location,describe,workspaceFrame,controls,renderer,scene,camera,
   communityConfiguration,validateCommunityState,communitySchema,setPalette,grid,lighting,rememberDisplayControl,performance}=env;
  let state=env.state,installationRequest=0,animation=null,frame=null;
  ${communityFunctions}
  return {setInstallation,restore,capture,state:()=>state,startMotion(){
   animation={start:performance.now(),from:{...state.axes}};render();
  },stopMotion(){animation=null},animation:()=>animation};
 `);
 for(const generation of [2,3]){
  const {f,c}=endpointFixture(generation);f.a.installation.axes={z:[2,20]};
  c.profile.title='Synthetic source host';c.profile.eva_installation={configuration:f.stock.id};applyEvaOptionsProfile(c,f.registry,f.heads);
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',checked:false});return elements.get(id)};
  const frames=[],gate=latch(),started=latch();let hold=false,breakLoad=false;
  const controller=createEvaOptionsController(c,dependencies(f,{wait:async()=>{if(hold){started.resolve();await gate.promise}},fail:()=>{if(breakLoad)throw Error('Fixture checksum failure')}}));
  const state={schema:communitySchema,machine:f.host.machine_id,configuration:f.stock.id,axes:{x:0,y:0,z:0},
   palette:{base:'#111111',accent:'#ee2222',frame:'#aaaaaa'},night:false,grid:false,references:false};
  const environment={current:c,evaOptions:controller,scope:{disposed:false},axisKeys:['x','y','z'],$:element,
   document:{body:{dataset:{}}},history:{replaceState(){}},location:{href:'https://example.invalid/viewer/community.html'},describe(){},
   workspaceFrame:cb=>{frames.push(cb);return frames.length},controls:{update(){},target:new THREE.Vector3()},
   renderer:{render(){}},scene:{},camera:{position:new THREE.Vector3(1,1,1),up:new THREE.Vector3(0,1,0),lookAt(){}},
   communityConfiguration,validateCommunityState,communitySchema,setPalette(){},grid:{visible:false},lighting(){},rememberDisplayControl(){},performance:{now:()=>0},state};
  c.adapter.setReferences=()=>{};
  const ui=makeCommunity(environment);
  await ui.setInstallation('stock');assert.equal(controller.active,f.stock.id);checks.push('EVA'+generation+' native stock/default alias');
  await ui.setInstallation(f.b.id);const before=clone(ui.capture()),geometry=nativeSnapshot(c),oldOverlay=controller.current.root;
  const saved={...ui.capture(),configuration:f.a.id,axes:{x:0,y:0,z:2}};breakLoad=true;
  await assert.rejects(()=>ui.restore(saved),/Fixture checksum failure/);
  assert.deepEqual(ui.capture(),before);assert.equal(controller.active,f.b.id);assert.equal(controller.current.root,oldOverlay);untouched(c,geometry);
  checks.push('EVA'+generation+' exact community restore failed-load rollback');breakLoad=false;
  await ui.restore(saved);assert.equal(ui.state().configuration,f.a.id);assert.deepEqual(c.adapter.getAxes(),saved.axes);assert.equal(controller.active,f.a.id);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.capture())).axes,saved.axes);checks.push('EVA'+generation+' source-limited restore/save');
  // Execute the source chooser too: alternatives must link their own reviewed
  // assembly, and an absent alternative proof must not link the native default.
  const describeSource=range(files['community-renderer.mjs'],' function describe(){',' workspaceListen(window,');
  const makeElement=()=>({children:[],hidden:false,append(...rows){this.children.push(...rows)},replaceChildren(...rows){this.children=rows}}),dom=new Map();
  const get=id=>{if(!dom.has(id))dom.set(id,makeElement());return dom.get(id)};
  const proofVariants=clone(f.registry.variants);proofVariants[1].installation.native_review={url:'https://example.invalid/alternative-review.json'};
  c.profile.eva_installation.native_review={url:'https://example.invalid/default-review.json'};
  const describeState={configuration:f.a.id};
  const modelNotice={textContent:'Original model reference',hidden:false};
  c.profile.configurations[f.a.id].sources=[{url:'https://example.invalid/public-author-cad',author:'Public source author',revision:'exact-variant-revision'}];
  const callDescribe=new Function('env',`const {current,state,evaOptions,$,document,t,machine,descriptions,sourceNotices,communityConfiguration,location,modelNotice}=env;
   ${describeSource};return describe;`)({current:c,state:describeState,evaOptions:{entries:proofVariants},$:get,
    document:{documentElement:{lang:'en'},querySelector:()=>makeElement(),createElement:()=>makeElement()},t:v=>v,
    machine:f.host.machine_id,descriptions:{},sourceNotices:{},communityConfiguration,location:environment.location,modelNotice});
  callDescribe();let links=get('installationSource').children.filter(n=>n.href);
  assert.equal(modelNotice.hidden,true,'EVA chooser must not display a phantom original-model notice');assert.equal(modelNotice.textContent,'Original model reference','Hiding the notice must retain its original source text');
  assert(links.some(n=>n.href===proofVariants[1].installation.native_review.url));assert(!links.some(n=>n.href===c.profile.eva_installation.native_review.url));
  assert(!links.some(n=>(n.textContent||'').includes('undefined')));
  delete proofVariants[1].installation.native_review;callDescribe();links=get('installationSource').children.filter(n=>n.href);
  assert(!links.some(n=>n.href===c.profile.eva_installation.native_review.url));
  describeState.configuration=f.stock.id;callDescribe();links=get('installationSource').children.filter(n=>n.href);
  assert(links.some(n=>n.href===c.profile.eva_installation.native_review.url));assert.equal(get('installationSource').hidden,false);
  checks.push('EVA'+generation+' exact active native proof/source-label fallback and original-default-only proof');
  await ui.setInstallation(f.stock.id);c.adapter.setAxes({x:0,y:0,z:0});ui.state().axes=c.adapter.getAxes();
  // A user can press Play after beginning a lazy head download. Committing a
  // new head with Z0 excluded must cancel or clamp that existing animation.
  hold=true;const switching=ui.setInstallation(f.a.id);await started.promise;ui.startMotion();gate.resolve();await switching;
  let error=null;try{frames.shift()(300)}catch(e){error=e.message}
  if(error)findings.push({priority:'P2',file:'site/viewer/community-renderer.mjs',line:line('community-renderer.mjs',' async function setInstallation(id){'),
   title:'Animation started during head loading keeps the previous zero-based starting pose',generation,
   evidence:error,trigger:'Start lazy alternate-head load from Z0, press Play before completion, commit a head with Z range [2,20], then render the next frame',
   effect:'Production render requests a Z value below the selected range and throws; motion preview stops',
   fix:'Cancel the current animation when committing the installation, or rebase every animation start axis to the new selected limits'});
  else checks.push('EVA'+generation+' pending-load animation rebase');
  controller.dispose();
 }
 // Execute the whole parent startup sequence, including the real chooser and
 // retry handler. Only DOM, scene/render setup and source I/O are synthetic.
 // The production controller and native adapter retain their own guards.
 {
  const source=files['community-renderer.mjs'].replaceAll('\r\n','\n');
  const startupBody=range(source,"  const responses=await Promise.all(['COMMUNITY_MACHINES_ASSETS.json'",'\n }catch(e){');
  const startupCatch=range(source,' }catch(e){','\n}\n');
  const statusSource=range(source,' function statusText(',' // This template placeholder');
  const startupSource=' try{\n'+startupBody+'\n'+startupCatch;
  const nested=range(source,' function setAxes(next){',' function visibleBounds(')+
   range(source,' async function setInstallation(id){',' for(const[id,kind]of ')+
   range(source,' function describe(){',' workspaceListen(window,');
  function startupFactory(initialization){return new Function('env',`
   const {$,document,fetch,loadCommunity,evaCommunityIndex,withHeadAdditions,applyEvaOptionsProfile,
    createEvaOptionsController,GLTFLoader,scene,scope,machine,communityConfiguration,communityMotionEnabled,
    workspaceTask,history,location,render,view,resize,setupPublicInfo,setupRenderExport,setupGcodePanel,
    displacementGcodeSettings,displacementCoordinateNote,unavailableCoordinateNote,t,grid,communitySchema,
    THREE,renderer,camera,controls,descriptions,sourceNotices,validateCommunityState,lighting,rememberDisplayControl,messageIdFor}=env;
   const status=$('status'),modelNotice=$('sourceModelNotice');
   let current,state,evaOptions,axisKeys=[],installationRequest=0,animation=null;
   ${statusSource}
   const ranges=()=>({...current.profile.axes,...communityConfiguration(current.profile,state?.configuration??'stock').axes});
   ${nested}
   return {async start(){${initialization}},capture,
    snapshot(){return {configuration:state?.configuration,axes:state&&{...state.axes},
     selector:$('headInstallation').value,url_configuration:new URL(location.href).searchParams.get('configuration'),
     ready:document.body.dataset.ready==='true',page_error:document.body.dataset.error??null,
     status:$('configurationStatus').textContent,status_hidden:$('status').hidden,model_notice_hidden:modelNotice.hidden,
     selector_connected:typeof $('headInstallation').onchange==='function',
     axes_connected:axisKeys.every(k=>!$(k).disabled&&typeof $(k).oninput==='function'),
     palette_connected:['base','accent','frame'].every(k=>!$(k).disabled&&typeof $(k).oninput==='function'),
     save_load_connected:!$('saveConfiguration').disabled&&!$('loadConfiguration').disabled
      &&typeof $('saveConfiguration').onclick==='function'&&typeof $('loadConfiguration').onclick==='function'
      &&typeof $('configurationFile').onchange==='function',
     render_export_connected:!$('openRender').disabled&&env.exportSetups()===1,
     native_root_visible:current?.root.visible}},
    retry(id){$('headInstallation').value=id;return $('headInstallation').onchange()},dispose(){evaOptions?.dispose()}};
  `)}
  assert.ok(files['render-export.js'].includes("$('#openRender').disabled=false;$('#openRender').onclick="),'Render-export DOM setup contract changed');
  const runStartup=startupFactory(startupSource),rows=[],legacy=[];
  const eager="await setInstallation('stock');";assert.equal(startupSource.split(eager).length,2,'Startup default initialization anchor changed');
  const oldStartup=startupFactory(startupSource.replace(eager,"await setInstallation(requestedInstallation||'stock');"));
  function setup(generation,{requested=false,breakLoad=false,factory=runStartup}={}){
   const {f,c}=endpointFixture(generation);f.a.installation.axes={z:[2,20]};
   c.profile.title='Synthetic source host';c.profile.eva_installation={configuration:f.stock.id};
   c.profile.source={version:'Fixture source '+generation,revision:f.stock.source_version,repository:'https://example.invalid/public-source',license:'Fixture source terms'};
   c.profile.palette_defaults={base:'#111111',accent:'#ee2222',frame:'#aaaaaa'};c.manifest.reference_leaves=[];
   const element=tag=>({tag,checked:false,disabled:true,hidden:false,value:'',textContent:'',children:[],
    setAttribute(k,v){this[k]=String(v)},removeAttribute(k){delete this[k]},getAttribute(k){return this[k]??null},
    append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}});
   const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id)};
   const document={body:{dataset:{},append(){}},documentElement:{lang:'en'},createElement:element,
    querySelector:id=>$(id)};
   const location=new URL('https://example.invalid/viewer/community.html?machine='+f.host.machine_id);
   if(requested)location.searchParams.set('configuration',f.a.id);
   const attempts=[],timing=[];let controller,broken=breakLoad,exports=0;
   const controlsReady=()=>['headInstallation','configurationFile'].every(id=>typeof $(id).onchange==='function')
    &&typeof $('x').oninput==='function'&&!$('saveConfiguration').disabled&&!$('openRender').disabled;
   const io=dependencies(f,{fail:asset=>{attempts.push(asset.component_id);timing.push({controls_connected:controlsReady(),render_export_setups:exports});
    if(broken)throw Error('Injected selected head download failure')}});
   const noop=()=>{},env={$,document,fetch:async name=>({ok:true,json:async()=>name.includes('EVA_OPTIONS.json')?f.registry:{}}),loadCommunity:async()=>c,
    evaCommunityIndex:x=>x,withHeadAdditions:()=>f.heads,applyEvaOptionsProfile,
    createEvaOptionsController:(current,options)=>controller=createEvaOptionsController(current,{...options,...io}),
    GLTFLoader:class{},scene:new THREE.Scene(),scope:{disposed:false,cleanup(){}},machine:f.host.machine_id,
    communityConfiguration,communityMotionEnabled:()=>true,workspaceTask:run=>run(),history:{replaceState(a,b,url){location.href=url}},location,
    render:noop,view:noop,resize:noop,setupPublicInfo:async()=>{},setupRenderExport(){exports++;$('openRender').disabled=false},setupGcodePanel:noop,
    displacementGcodeSettings:noop,displacementCoordinateNote:'',unavailableCoordinateNote:'',t:v=>v,grid:{visible:false},
    communitySchema,THREE,renderer:{},camera:{position:new THREE.Vector3(1,1,1),up:new THREE.Vector3(0,1,0),lookAt(){}},
    controls:{target:new THREE.Vector3(),update(){}},descriptions:{},sourceNotices:{},validateCommunityState,
    lighting:noop,rememberDisplayControl:noop,messageIdFor,exportSetups:()=>exports};
   return {f,c,ui:factory(env),attempts,timing,allowDownloads(){broken=false},get controller(){return controller}};
  }
  function usable(row){
   assert.equal(row.page_error,null,'Selected head failure aborted native startup');
   for(const key of ['ready','status_hidden','model_notice_hidden','selector_connected','axes_connected','palette_connected','save_load_connected','render_export_connected','native_root_visible'])
    assert.equal(row[key],true,'Native startup controls unavailable: '+key);
  }
  function selection(test,row,id){
   assert.equal(row.configuration,id);assert.equal(row.selector,id);assert.equal(row.url_configuration,id);
   assert.equal(test.controller.active,id);assert.deepEqual(row.axes,test.c.adapter.getAxes());
  }
  for(const generation of [2,3]){
   for(const scenario of ['native_default','linked_success','linked_failure']){
    const test=setup(generation,{requested:scenario!=='native_default',breakLoad:scenario==='linked_failure'});
    try{
     await test.ui.start();const initial=test.ui.snapshot(),id=scenario==='linked_success'?test.f.a.id:test.f.stock.id;
     check(()=>{usable(initial);selection(test,initial,id);assert.equal(test.attempts.length,scenario==='native_default'?0:1);
      if(scenario==='linked_success')assert.equal(initial.axes.z,2);
      if(scenario==='linked_failure')assert.equal(initial.status,'Injected selected head download failure');
      else assert.equal(initial.status,'');
     });
     if(scenario!=='native_default')check(()=>assert(test.timing.every(t=>t.controls_connected&&t.render_export_setups===1),'Linked head download began before recovery controls/export setup'));
     const record={generation,scenario,initial,download_attempts:test.attempts.length};
     if(scenario==='linked_failure'){
      check(()=>{assert.equal(test.controller.current,null);assert(test.f.host.stock_head_keys.every(k=>test.c.adapter.nodes.get(k).visible))});
      test.allowDownloads();await test.ui.retry(test.f.a.id);record.retried=test.ui.snapshot();
      check(()=>{usable(record.retried);selection(test,record.retried,test.f.a.id);assert.equal(record.retried.status,'');
       assert.equal(record.retried.axes.z,2);assert.equal(test.attempts.length,2);
       assert(test.f.host.stock_head_keys.every(k=>!test.c.adapter.nodes.get(k).visible));
      });record.download_attempts=test.attempts.length;
     }
     rows.push(record);checks.push('EVA'+generation+' exact parent startup '+scenario+(record.retried?' with selector retry':''));
    }finally{test.ui.dispose()}
   }
   const old=setup(generation,{requested:true,breakLoad:true,factory:oldStartup});
   try{
    let error;try{await old.ui.start()}catch(e){error=e.message}
    const snapshot=old.ui.snapshot();assert.equal(error,'Injected selected head download failure');
    assert.equal(snapshot.native_root_visible,true);assert.equal(snapshot.selector_connected,false);assert.equal(snapshot.axes_connected,false);
    rejected(()=>usable(snapshot));legacy.push({generation,error,snapshot,controls_before_selected_load:old.timing[0]?.controls_connected});
    checks.push('EVA'+generation+' old eager startup order rejected with loaded native machine and disconnected controls');
   }finally{old.ui.dispose()}
  }
  communityStartupReview={exact_parent_startup:true,production_controller_and_native_adapter:true,source_generations:[2,3],
   scenarios:rows,legacy_eager_path_rejected:true,legacy_negative_fixtures:legacy};
 }
 // Run the exact standalone adapter before the hidden rig installer. Its
 // disabled-bank branch must clear the rig without parsing another EVA head.
 assert(files['toolheads.js'].includes('await toolBank?.install(variant);'),'Standalone bank install call path changed');
 {
  const f=fixture(3),catalog={...f.heads,assets:{},machine_id:'toolhead'},bankVariants=f.registry.variants.map(v=>({...v,
   machine_head:{base:v.base_asset,translation:[0,0,0],hidden:[],modules:[]}}));
  const adapterSource=range(files['toolheads.js'],' const bankAdapter={',' toolBank=setupChangerBank(');
  const makeBankAdapter=new Function('bankRig','bankCatalog','workspaceTask',adapterSource+';return bankAdapter;');
  const bankCatalog={...catalog,variants:bankVariants};let hiddenLoads=0;
  const source=range(files['machine-heads.js'],'export function createMachineHeads(', 'export function ensureMachineHeadControls(').replace(/^export /,'');
  const createRig=new Function('env',`const {THREE,createMonolithGantry,GLTFLoader,workspaceTask,madmaxPtfeAssetSpec,madmaxJointAssetSpec,
   loadExternalComponent,loadEvaFrontSurfaces,applyEvaFrontSurfaces,bindEvaMeshIdentities,partKey,appearanceRole,captureMadmaxJoint,
   validateEvaMetadata,setMadmaxJointPose,madmaxJointApplies,setRapidoXUhfSurface,bindLedSource,createInactiveHeadCache,canRestoreInactiveHeadIndices}=env;
   const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);${source};return createMachineHeads;`)(
    {THREE,createInactiveHeadCache,canRestoreInactiveHeadIndices,createMonolithGantry:()=>({install:async()=>{},setPalette(){},setDelta(){}}),GLTFLoader:class{},workspaceTask:run=>run(),
     madmaxPtfeAssetSpec:(machine,id,spec)=>spec,madmaxJointAssetSpec:(machine,id,spec)=>spec,
     loadExternalComponent:async(loader,spec)=>{hiddenLoads++;const meta=clone(f.definitions.get(spec.component_id)),root=model(meta);
      const ledModelReceipt=await verifyLedModelBytes(root,spec,new TextEncoder().encode(spec.component_id),{catalogId:spec.component_id});
      return {meta,gltf:{scene:root},ledModelReceipt}},
     loadEvaFrontSurfaces:async()=>({}),applyEvaFrontSurfaces:()=>{},bindEvaMeshIdentities:(meta,root)=>{root.traverse(m=>{if(m.isMesh)assert(meta.parts.some(p=>p.key===m.userData.part_key))})},
     partKey:m=>m.userData.part_key,appearanceRole:p=>p.appearance_role,captureMadmaxJoint:()=>null,
     validateEvaMetadata:(v,meta)=>assert.equal(v.eva.generation,meta.eva_generation),setMadmaxJointPose(){},madmaxJointApplies:()=>false,setRapidoXUhfSurface(){},bindLedSource});
  const previousLocation=globalThis.location;globalThis.location={href:'https://example.invalid/viewer/toolheads.html'};
  try{
   const calls=[],active={},spyRig={active,async install(v,state){calls.push({v,state})},async setBank(state){calls.push({bank:state})}};
   const spyAdapter=makeBankAdapter(spyRig,bankCatalog,run=>run()),enabled={enabled:true},disabled={enabled:false};
   assert.equal(spyAdapter.active,active);
   await spyAdapter.install({id:bankVariants[0].id},enabled);
   check(()=>{assert.equal(calls.at(-1).v,bankVariants[0]);assert.equal(calls.at(-1).state,enabled)});
   await spyAdapter.install(bankVariants[1],disabled);assert.equal(calls.at(-1).v,null);assert.equal(calls.at(-1).state,disabled);
   await spyAdapter.install(bankVariants[2]);assert.equal(calls.at(-1).v,null);
   await spyAdapter.install(null,disabled);assert.equal(calls.at(-1).v,null);
   await spyAdapter.setBank(disabled);assert.equal(calls.at(-1).bank,disabled);
   async function disabledBanks(factory){
    const scene=new THREE.Group(),rig=createRig(scene,catalog),beforeLoads=hiddenLoads;rig.setVisible(false);
    const adapter=factory(rig,bankCatalog,run=>run());
    try{
     for(const v of [bankVariants[0],...bankVariants.slice(1),bankVariants[0]])await adapter.install(v,{enabled:false});
     const evidence={hidden_rig_cache_entries:rig.cache.size,hidden_rig_roots:rig.rig.children.length,
      hidden_head_loads:hiddenLoads-beforeLoads,rig_visible:rig.rig.visible};
     assert.equal(evidence.hidden_rig_cache_entries,0,'Disabled bank retains hidden EVA source cache');
     assert.equal(evidence.hidden_rig_roots,0,'Disabled bank retains hidden EVA roots');
     assert.equal(evidence.hidden_head_loads,0,'Disabled bank parsed a complete EVA head');
     assert.equal(rig.active,null);assert.equal(rig.bankRig.children.length,0);
     return evidence;
    }finally{
     const resources=new Set();for(const promise of rig.cache.values())promise.loaded?.root.traverse(m=>{if(m.isMesh){resources.add(m.geometry);for(const mat of [].concat(m.material))resources.add(mat)}});
     for(const resource of resources)resource.dispose();scene.clear();
    }
   }
   const evidence=await disabledBanks(makeBankAdapter);check(()=>assert.equal(evidence.hidden_head_loads,0));
   // The former eager path intentionally bypasses the disabled-bank guard.
   // The same resource assertion must reject it, so removing the guard cannot
   // turn this regression into another passing direct-rig fixture.
   const badOldAdapter=(rig,bankCatalog,run)=>({install(v,state){return run(()=>rig.install(bankCatalog.variants.find(p=>p.id===v.id),state))}});
   await assert.rejects(()=>disabledBanks(badOldAdapter),/Disabled bank retains hidden EVA source cache/);negatives++;
   standaloneBankAdapterReview={...evidence,exact_parent_adapter:true,enabled_source_recipe_forwarding:true,
    absent_bank_clears_without_loading:true,legacy_eager_path_rejected:true,selection_count:bankVariants.length+1};
   checks.push('Exact standalone bankAdapter preserves enabled source recipe and clears disabled or absent bank without hidden EVA parsing',
    'Old eager hidden-rig path rejected by the same cache/resource assertion');
  }finally{if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation}
 }
 for(const [name,text]of Object.entries(files))assert.equal(hash(await fs.readFile(new URL('../site/viewer/'+name,import.meta.url),'utf8')),hash(text),'Parent review source changed during fixtures '+name);
 return {schema:'3d-print-rig-eva-parent-integration-review-v1',passed:findings.length===0,
  source_sha256:Object.fromEntries(Object.entries(files).map(([name,text])=>['site/viewer/'+name,hash(text)])),
   checks,findings,community_startup:communityStartupReview,standalone_bank_adapter:standaloneBankAdapterReview,scope:'Exact parent startup/chooser/retry and nested installation/restore/render, standalone bankAdapter and hidden machine-head installer functions with synthetic DOM/frame/source-loading adapters; old eager startup/bank paths rejected; no exported CAD or GPU review',
  final_actual_audit_run:false,full_physical_fit_certified:false};
}
// Normal machine regression jobs must exercise the production integration.
// --integration-review remains compatible; only --fixtures-only opts out.
const integrationRequired=!process.argv.includes('--fixtures-only');
const parentIntegration=integrationRequired?await parentIntegrationReview():null;
const report={passed:!parentIntegration||parentIntegration.passed,fixture_source_sha256:hash(await fs.readFile(new URL(import.meta.url))),controller_fixtures_passed:true,positive_fixtures:positives,rejected_fixtures:negatives,component_loads:loads,front_helper_invocations:patchCalls,
 max_concurrent_component_loads:maxDownloads,default_checksum_loader_and_front_helper_generations:defaultLoaderChecks,source_generations:[2,3],native_hardware_disposed:false,original_front_release_gate_retained:true,
 mandatory_options_build_gate:true,required_machine_families:['vminion','vcore3'],
 production_endpoint_fixture_generations:endpointFixtures,endpoint_binding_negatives:endpointGuardNegatives,
 measured_socket_proof_negatives:socketProofNegatives,
 native_identity_bridge_negatives:identityBridgeNegatives,endstop_companion_negatives:endstopCompanionNegatives,
 parent_integration_required:integrationRequired,parent_integration:parentIntegration,
 installed_gate_descriptor_and_native_proof_negatives:35+socketProofNegatives+identityBridgeNegatives,installed_gate_code_closure_files:Object.keys(closure).length,
 scope:'Synthetic production-controller registry, exact host-frame/pin guards, complete companions, A-B-A and failed-load rollback, serialized stale requests, immediate source reset, finite native motion, purchased palette protection and native leaves unchanged by the controller. Separate production-adapter fixtures exercise measured moving sockets with source route weights, unchanged fixed caps and exact route reset; endpoint witnesses reject disconnected caps even when unrelated vertices touch the socket. Actual exported CAD, native-solid clearance and browser review require separate evidence.',physical_fit_certified:false};
const reportIndex=process.argv.indexOf('--report');if(reportIndex>=0){const destination=process.argv[reportIndex+1];if(!destination)throw Error('Missing fixture report destination');await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n')}
if(parentIntegration&&!parentIntegration.passed)process.exitCode=1;
console.log(JSON.stringify(report));

// Host shards retain exact whole-registry coverage without parsing both hosts together.
const {evaAuditHostSelection}=await import("./audit_eva_options.mjs");
const shardRegistry={hosts:{hostA:{},hostB:{}}};
assert.deepEqual(evaAuditHostSelection(shardRegistry),["hostA","hostB"]);
assert.deepEqual(evaAuditHostSelection(shardRegistry,["hostB"]),["hostB"]);
for(const bad of [[],["hostA","hostA"],["missing"],"hostA"])assert.throws(()=>evaAuditHostSelection(shardRegistry,bad));

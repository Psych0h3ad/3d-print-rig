import assert from 'node:assert/strict';
import {headPlacementKey,acceptedHeadValidation,applyHeadValidation,headWitnessCheck}from '../site/viewer/head-validation.mjs';
import {translate}from '../site/viewer/i18n.mjs';
const plan={base:'head',translation:[1,2,3],nozzle_mm:[1,2,0],hidden:['ref'],modules:[{id:'hotend',translation_mm:[1,2,3]}]},v={source_head_configuration:'native',toolhead:'sphinx',mount:'fixed',machine_head:plan,fit:{machine_mount:{full_travel_verified:false}}};
const hit={category:'body',head_module:'head',head_part:'plate',head_name:'Plate',fixture_part:'screw',fixture_name:'Screw',display_xyz_mm:[250,125,40],overlap_mm3:70};
const record={source_configurations:['native'],placement:'p',intersections:[hit],full_travel_verified:false},evidence={schema:'3d-print-rig-head-witness-v1',revision:'r',model_bundle_sha256:'bundle',input_sha256:{heads:'h',registry:'r'},placements:{p:headPlacementKey(plan)},machines:{machine:{input_sha256:{meta:'m',profile:'p'},records:[record]}}},pins={heads:'h',registry:'r',meta:'m',profile:'p'},bundle={sha256:'bundle'};
const accepted=acceptedHeadValidation(evidence,pins,bundle,'machine');assert(accepted);
for(const name of Object.keys(pins))assert.equal(acceptedHeadValidation(evidence,{...pins,[name]:'changed'},bundle,'machine'),null);
assert.equal(acceptedHeadValidation(evidence,pins,{sha256:'other'},'machine'),null);assert.equal(acceptedHeadValidation(evidence,pins,bundle,'other'),null);
const repeated=structuredClone(evidence);repeated.machines.machine.input_sha256.heads='h';assert(acceptedHeadValidation(repeated,pins,bundle,'machine'));
const contradictory=structuredClone(evidence);contradictory.machines.machine.input_sha256.heads='changed';assert.equal(acceptedHeadValidation(contradictory,{...pins,heads:'changed'},bundle,'machine'),null,'Target pins must not overwrite contradictory global source identities');
const registry={head_witness_validation:accepted},source=structuredClone(v);assert(applyHeadValidation(v,registry,'machine'));assert.equal(v.fit.machine_mount.full_travel_verified,false);const check=headWitnessCheck(v);assert.equal(check.state,'machine-head-conflict');assert(check.warning);
for(const text of [check.label,...check.lines])assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(translate(text)),text);
for(const change of [n=>n.machine_head.translation[1]+=.1,n=>n.machine_head.hidden.push('plate'),n=>n.machine_head.modules[0].translation_mm[2]+=.1,n=>n.machine_gantry={id:'other'},n=>n.source_head_configuration='other']){const n=structuredClone(source);change(n);assert.equal(applyHeadValidation(n,registry,'machine'),null);assert.equal(n.fit.rigid_head_witnesses,undefined)}
const noHit=structuredClone(v);noHit.fit.rigid_head_witnesses.intersections=[];assert.equal(headWitnessCheck(noHit).state,'machine-head-unverified');assert(headWitnessCheck(noHit).warning);
const engagement=structuredClone(v);engagement.fit.rigid_head_witnesses.intersections[0].category='mount_interface';assert.equal(headWitnessCheck(engagement).intersections.length,0);assert.equal(headWitnessCheck(engagement).interfaces.length,1);assert(headWitnessCheck(engagement).warning);
const trident=structuredClone(accepted);trident.records[0].gantry='trident_r2';const tridentRegistry={head_witness_validation:trident};
assert(applyHeadValidation(structuredClone(source),tridentRegistry,'machine','trident_r2'));
for(const gantry of [undefined,'machine_gantry','siboor_awd','monolith_awd'])assert.equal(applyHeadValidation(structuredClone(source),tridentRegistry,'machine',gantry),null);
assert.equal(applyHeadValidation(structuredClone(source),registry,'machine','trident_r2'),null);
const shared=structuredClone(evidence);shared.intersection_witnesses={one:hit};shared.machines.machine.records[0].intersection_ids=['one'];delete shared.machines.machine.records[0].intersections;
assert.deepEqual(acceptedHeadValidation(shared,pins,bundle,'machine').records[0].intersections,[hit]);
shared.machines.machine.records[0].intersection_ids.push('missing');assert.equal(acceptedHeadValidation(shared,pins,bundle,'machine'),null);
console.log('Native head intersections: exact placement/input pins, visible part changes, stale evidence, changed gantries, interface separation, no false full-travel pass and bilingual scope passed.');

// The auditor must reject incomplete exports independently of what the loader
// happened to see. These are negative fixtures, not native hardware proof.
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const {assertHeadCompanions,assertExportedHeadParts,assertSphinxFanSource,assertSphinxFanBounds}=await import('./audit_loaded_heads.mjs');
const {rapidoXUhfCover}=await import('../site/viewer/rapido-x-uhf-cover.mjs');
const {TRINITY_INSTALLED_BELT_SAMPLE_KEYS}=await import('../site/viewer/trinity-alpha-installation.mjs');
const rapido={id:'rapido-negative-fixture',toolhead:'stealthburner',hotend:'rapido_x_uhf',cover_source:{kind:'original_uhf'},machine_head:{base:'stealthburner',translation:[0,0,0],hidden:[],modules:[{id:'sb_rapido_x',translation_mm:[0,0,0],hidden_keys:[...rapidoXUhfCover.replaced_keys]},{id:'hotend_rapido_x',translation_mm:[0,0,0]}]}};
assertHeadCompanions(rapido);
for(const change of [n=>delete n.cover_source,n=>n.machine_head.hidden.push('423'),n=>n.machine_head.hidden.push('412'),n=>n.machine_head.modules[0].hidden_keys.pop(),n=>n.machine_head.modules[0].hidden_keys.push('sb_rapido_x_mount_2'),n=>n.machine_head.modules.pop(),n=>n.machine_head.modules.push(structuredClone(n.machine_head.modules[0])),n=>n.machine_head.modules[0].translation_mm[1]=NaN]){
 const bad=structuredClone(rapido);change(bad);assert.throws(()=>assertHeadCompanions(bad));
}
const sphinx={id:'sphinx-negative-fixture',toolhead:'sphinx',fit:{complete_head_native:{base:'sphinx',hotend:'native_hotend',extruder:'native_sherpa'},hotend_cooling:{module:'sphinx_hotend_fan_2510'}},machine_head:{base:'sphinx',translation:[0,0,0],hidden:[],modules:['native_hotend','native_sherpa','sphinx_hotend_fan_2510'].map(id=>({id,translation_mm:[0,0,0]}))}};
assertHeadCompanions(sphinx);
for(const id of ['native_hotend','native_sherpa','sphinx_hotend_fan_2510']){const bad=structuredClone(sphinx);bad.machine_head.modules=bad.machine_head.modules.filter(m=>m.id!==id);assert.throws(()=>assertHeadCompanions(bad),/missing declared companion/);}
const alpha={id:'trinity-negative-fixture',native_alpha_92:{},machine_head:{base:'native_alpha',translation:[0,0,0],modules:[],hidden:['actual_retained_Trident_block',...TRINITY_INSTALLED_BELT_SAMPLE_KEYS]}};
assertHeadCompanions(alpha);
for(const key of alpha.machine_head.hidden){const bad=structuredClone(alpha);bad.machine_head.hidden=bad.machine_head.hidden.filter(k=>k!==key);assert.throws(()=>assertHeadCompanions(bad));}
const fan={id:'sphinx_hotend_fan_2510',geometry_revision:'sphinx-rear-cooling-2',source_commit:'c00b13ef851d38fef6e295e18296650e1ca50d7e',source_mount_url:'https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180',source_transform:{rotation_z_deg:180,translation_mm:[-.09999065671,-43.69962727068417,-378.6758689537]},mount_plane_y_mm:.21037520701583,parts:[{key:'fan',source_brep_sha256:'7ac69fa419e0b5bae62b82abcbc5f4d10f4c489bc14f071639f379fd7ac76e23'}]};
assertSphinxFanSource(fan);
for(const change of [n=>n.geometry_revision='sphinx-front-cooling-1',n=>n.source_commit='unreviewed',n=>n.source_transform.rotation_z_deg=0,n=>n.source_transform.translation_mm[1]+=10,n=>n.mount_plane_y_mm=0,n=>n.parts[0].source_brep_sha256='changed']){const bad=structuredClone(fan);change(bad);assert.throws(()=>assertSphinxFanSource(bad));}
const manifest={parts:[{key:'shell'},{key:'led'},{key:'fan'},{key:'nozzle'}]},loaded={entries:manifest.parts.map(p=>({key:p.key,mesh:{parent:{name:'P'+p.key+'__fixture'}}}))};
assertExportedHeadParts(manifest,loaded,'fixture');
for(const key of ['shell','led','fan','nozzle'])assert.throws(()=>assertExportedHeadParts(manifest,{entries:loaded.entries.filter(e=>e.key!==key)},'fixture'),/missing exported part/);
assert.throws(()=>assertExportedHeadParts({parts:[...manifest.parts,manifest.parts[0]]},loaded,'fixture'),/duplicate source part/);
assert.throws(()=>assertExportedHeadParts(manifest,{entries:[...loaded.entries,{...loaded.entries[0],mesh:{parent:{name:'another-instance'}}}]},'fixture'),/duplicate exported part/);
assert.throws(()=>assertExportedHeadParts(manifest,{entries:[...loaded.entries,{key:'unknown',mesh:{}}]},'fixture'),/unregistered export/);
const primitives={entries:[...loaded.entries,{...loaded.entries[0]}]};assertExportedHeadParts(manifest,primitives,'multi-material-fixture');
const fanBounds=[[-12.5,.21037520701583,-45],[12.5,10.21037520701583,-20]];assertSphinxFanBounds(fanBounds);
for(const axis of [0,1,2]){const detached=structuredClone(fanBounds);for(const side of detached)side[axis]+=5;assert.throws(()=>assertSphinxFanBounds(detached),/detached/);}
assert.throws(()=>assertSphinxFanBounds([]),/missing/);
const splitSource={source_sha256:'8c94727b60ab24b2f76c303be8000b5a434e728b38070e5c8e82069eebe61e4c',parts:[{key:'480'},{key:'546'}]},splitExport={entries:['P480__Switch_Housing','P480__Switch_Lever','P546__motor_body','P546__steel_endcaps_and_shaft'].map(name=>({key:name.match(/^P([^_]+)__/)[1],mesh:{name}}))};
assertExportedHeadParts(splitSource,splitExport,'stealthburner');
for(const row of splitExport.entries)assert.throws(()=>assertExportedHeadParts(splitSource,{entries:splitExport.entries.filter(e=>e!==row)},'stealthburner'),/surface decomposition/);

// Optional actual-asset negatives use untouched source metadata and GLB leaves,
// then remove real exported leaves / translate the real purchased fan in memory.
if(process.argv[2]){
 const fs=await import('node:fs/promises'),path=await import('node:path'),{gunzipSync}=await import('node:zlib'),{createHash}=await import('node:crypto'),THREE=await import('three'),{GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js'),{partKey}=await import('../site/viewer/head-assembly.js');
 const root=path.resolve(process.argv[2]),pins={};
 for(const [id,name,required]of [['stealthburner','toolheads/sb_stock',rapidoXUhfCover.original_keys],['sphinx_hotend_fan_2510','modules/sphinx_hotend_fan_2510',['sphinx_hotend_fan_2510_fan']]]){
  const metadataBytes=await fs.readFile(path.join(root,name+'.json')),modelBytes=await fs.readFile(path.join(root,name+'.glb.gz')),decoded=gunzipSync(modelBytes),meta=JSON.parse(metadataBytes),g=await new GLTFLoader().parseAsync(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength),'');
  pins[name]={metadata_sha256:createHash('sha256').update(metadataBytes).digest('hex'),model_sha256:createHash('sha256').update(modelBytes).digest('hex'),decoded_sha256:createHash('sha256').update(decoded).digest('hex')};
  if(id==='stealthburner'){assert.equal(pins[name].metadata_sha256,rapidoXUhfCover.metadata_sha256);assert.equal(pins[name].decoded_sha256,rapidoXUhfCover.decoded_model_sha256);}
  const actual={entries:[]};g.scene.traverse(mesh=>{if(mesh.isMesh)actual.entries.push({key:partKey(mesh),mesh});});assertExportedHeadParts(meta,actual,id);assertSphinxFanSource(meta);
  for(const key of required)assert.throws(()=>assertExportedHeadParts(meta,{entries:actual.entries.filter(e=>e.key!==key)},id),/missing exported part/);
  if(id==='sphinx_hotend_fan_2510'){
   const box=new THREE.Box3().setFromObject(g.scene),bounds=b=>[[b.min.x,-b.max.z,b.min.y],[b.max.x,-b.min.z,b.max.y]].map(side=>side.map(n=>n*1000));assertSphinxFanBounds(bounds(box));box.translate(new THREE.Vector3(0,0,-.005));assert.throws(()=>assertSphinxFanBounds(bounds(box)),/detached/);
  }
  g.scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}});
 }
 console.log(JSON.stringify({actual_asset_negative_regressions:true,input_sha256:pins,browser_review:false,native_solid_review:false}));
}
console.log('Head companion negatives: wrong Rapido shell/orphan LED/cartridge, missing source Sphinx cooling/hotend/extruder, pinned rear fan placement, residual Trinity belts, missing/duplicate/unregistered actual leaves passed; no native fit inferred.');

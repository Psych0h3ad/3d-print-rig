import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import crypto from 'node:crypto';
import {register} from 'node:module';
import {fileURLToPath} from 'node:url';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three'),{GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
const {prepareLedSurface,restoreLedSurface,cloneNativeLedTree}=await import('../site/viewer/led-emission-surface.mjs');
const {createToolheadLedRig,TOOLHEAD_LED_MAX_LEVEL,TOOLHEAD_LED_DEFAULT_LEVEL}=await import('../site/viewer/toolhead-lighting.mjs');
const {sourceDiscoAperture}=await import('../site/viewer/disco-led-apertures.mjs');
const {lightingState}=await import('../site/viewer/lighting-state.mjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

function geometrySha(geometry){
 const chunks=[Buffer.from(JSON.stringify({groups:geometry.groups,drawRange:geometry.drawRange}))];
 for(const [key,a]of [['index',geometry.index],...Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b))]){
  if(!a)continue;const array=a.array||a.data.array;
  chunks.push(Buffer.from(JSON.stringify({key,type:array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,count:a.count,offset:a.offset,stride:a.data?.stride})),Buffer.from(array.buffer,array.byteOffset,array.byteLength));
 }
 return sha(Buffer.concat(chunks));
}
function materialSha(material,{physicalOnly=false}={}){
 const json=material.toJSON();
 if(physicalOnly){delete json.uuid;delete json.emissive;delete json.emissiveIntensity;}
 return sha(JSON.stringify(json));
}
const nativeLights=root=>{const lights=[];root.traverse(o=>{if(o.isLight&&o.name.startsWith('Native_toolhead_LED_'))lights.push(o)});return lights;};
const sourceState=mesh=>JSON.stringify({name:mesh.name,part_key:mesh.userData.part_key,row:mesh.userData.ledSourceRow,asset:mesh.userData.ledSourceAsset});
function captureNative(root){
 const native=new Map();root.traverse(mesh=>{if(mesh.isMesh)native.set(mesh,{geometry:mesh.geometry,material:mesh.material,
  geometry_sha256:geometrySha(mesh.geometry),material_sha256:[].concat(mesh.material).map(m=>materialSha(m)),source:sourceState(mesh),
  children:mesh.children.slice(),parent:mesh.parent,position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),visible:mesh.visible});});return native;
}
function checkOriginals(native,{restored=false}={}){
 for(const [mesh,source]of native){
  assert.equal(sourceState(mesh),source.source,mesh.name+' changed source identity');
  assert.equal(geometrySha(source.geometry),source.geometry_sha256,mesh.name+' changed native geometry/normals');
  assert.deepEqual([].concat(source.material).map(m=>materialSha(m)),source.material_sha256,mesh.name+' changed native material');
  if(restored){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);
   assert(!mesh.userData.ledSurface&&!mesh.userData.ledGuide,mesh.name+' retained a runtime LED binding');
   assert.deepEqual(mesh.children,source.children,mesh.name+' retained an orphan light');}
 }
}
function capturePrepared(native){
 return new Map([...native.keys()].map(mesh=>[mesh,{geometry:mesh.geometry,material:mesh.material,
  geometry_sha256:geometrySha(mesh.geometry),physical_sha256:[].concat(mesh.material).map(m=>materialSha(m,{physicalOnly:true}))}]));
}
function checkPrepared(native,prepared){
 checkOriginals(native);
 for(const [mesh,source]of prepared){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);
  assert.equal(geometrySha(mesh.geometry),source.geometry_sha256,mesh.name+' changed positions/normals/source emission mask with brightness');
  assert.deepEqual([].concat(mesh.material).map(m=>materialSha(m,{physicalOnly:true})),source.physical_sha256,mesh.name+' changed hardware/palette material');
  const original=native.get(mesh);assert.equal(mesh.parent,original.parent);assert(mesh.position.equals(original.position));assert(mesh.quaternion.equals(original.quaternion));assert(mesh.scale.equals(original.scale));assert.equal(mesh.visible,original.visible);
 }
}
function pairedLogo(controller,guide){
 const ids=guide.guide.led_ids||[guide.guide.emitter_id],root=guide.mesh.parent;
 const rows=controller.emitters.filter(e=>ids.includes(e.identity.id)&&e.mesh.parent===root);
 assert.equal(rows.length,1,guide.mesh.name+' must pair with exactly one PCB in its own head');
 assert.equal(rows[0].identity.kind,'logo',guide.mesh.name+' must not borrow a nozzle emitter');return rows[0];
}
function checkLightValues(controller,{gain,color=0xff1838}={}){
 for(const e of controller.emitters){
  const expectedColor=e.identity.kind==='nozzle'?0xffffff:color;
  assert.equal(e.light.parent,e.mesh);assert.equal(e.light.color.getHex(),expectedColor);
  assert.equal(e.light.intensity,(e.identity.kind==='nozzle'?.004:.0015)*gain);assert(Number.isFinite(e.light.intensity));
  assert(e.light.matrixWorld.elements.every(Number.isFinite));
  for(const m of e.surface.materials){assert.equal(m.emissiveIntensity,3.2*gain);assert(Number.isFinite(m.emissiveIntensity));assert.equal(m.emissive.getHex(),expectedColor);}
 }
 for(const g of controller.guides){const e=pairedLogo(controller,g);for(const m of g.materials){assert.equal(m.emissiveIntensity,e.surface.materials[0].emissiveIntensity);assert(m.emissive.equals(e.light.color));}}
}

export async function auditLedLighting(root){
 const inputs={},load=async name=>{const body=await fs.readFile(path.join(root,name));inputs[name]={sha256:sha(body),bytes:body.length};return body;};
 const meta=JSON.parse(await load('DISCO_MOD.json')),bytes=await load('Disco_on_a_Stick_XXL_350.glb.gz');
 const decoded=gunzipSync(bytes),model=(await new GLTFLoader().parseAsync(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength),'')).scene;
 const report={schema:'native-led-lighting-109',tested_at_utc:new Date().toISOString(),producer_sha256:sha(await fs.readFile(process.env.LED_AUDIT_EXECUTED_FILE||fileURLToPath(import.meta.url))),source_sha256:{},input_sha256:inputs,decoded_disco_glb_sha256:sha(decoded),disco_emitters:0,luminous_triangles:0,nonluminous_triangles:0,pose_checks:0,source_led_scope:'Only exact source LED identities and native outward lens triangles. No new PCB/hardware or manufacturing geometry.',browser_render_test:false,browser_review:false,native_workers:0,native_solid_review:false,whole_machine_certified:false};
 async function pinRuntime(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await pinRuntime(full);else if(/\.(js|mjs)$/.test(entry.name))report.source_sha256[path.relative(process.cwd(),full).replaceAll('\\','/')]=sha(await fs.readFile(full));}}
 await pinRuntime(path.join(process.cwd(),'site/viewer'));
 report.expected_emitters=meta.leds_per_stick*meta.stick_count;
 report.decoded_reportsha={'Disco_on_a_Stick_XXL_350.glb.gz':sha(decoded)};
 report.surface_checks={parsed_led_emitters:0,position_checks:0,material_checks:0,normal_mask_checks:0,restoration_checks:0};
 report.head_fixtures=[];
 report.toolhead_brightness_scope={regression:'led-brightness-117',levels:[0,50,100,200,300,100,0],default_level:TOOLHEAD_LED_DEFAULT_LEVEL,max_level:TOOLHEAD_LED_MAX_LEVEL,
  projection:'CPU assertions of actual THREE.PointLight intensity and masked material emission; no GPU pixel/luminance measurements.',
  source_assets:['SB stock','SB Rapido 2 HF','Xol Sherpa Mini Rapido 2 UHF AWD9'],normal_scope:'Finite, unit normals on nondegenerate LED triangles; inherited zero-area dark triangles are counted explicitly and preserved.',installed_machine_combinations_tested:false,physical_photometric_certification:false};
 report.source_geometry_notices=[];
 assert.equal(TOOLHEAD_LED_DEFAULT_LEVEL,100);assert.equal(TOOLHEAD_LED_MAX_LEVEL,300);
 const disco100=lightingState({installed:true,power:true,night:true,ready:true,level:100});assert.equal(disco100.value,1);
 assert.deepEqual(lightingState({installed:true,power:true,night:true,ready:true,level:300}),disco100,'Disco retains its independent 100% cap');
 report.disco_independence={level:100,value:disco100.value,actual_model_unchanged_checks:0,scope:'Actual Disco source meshes remain unchanged in the shared scene during toolhead updates; independent Disco state remains capped at 100%. No browser render.'};
 report.aperture_proof={derivation:'native-source-lens-disc',coordinate_space:'mesh-local-metres',source_commit:'5e5fca5761380576a8bb77f7301cdee90afa0e6e',source_face_index:13,emitters:[]};
 for(const spec of meta.lights){
  const normal=[spec.normal[0],spec.normal[2],-spec.normal[1]],rows=[];model.traverse(o=>{if(o.isMesh&&o.userData.led_role==='LED'&&o.userData.side===spec.side)rows.push(o);});
  assert.equal(rows.length,meta.leds_per_stick);
  for(const mesh of rows){
   const original=mesh.geometry;original.computeBoundingBox();const bounds=original.boundingBox.clone(),color=mesh.material.color.clone(),physical=[mesh.material.metalness,mesh.material.roughness];
   const aperture=sourceDiscoAperture(mesh);assert(aperture,'Native Disco lens aperture missing');assert(aperture.normal.every((v,i)=>Math.abs(v-normal[i])<1e-8));
   const sourcePositions=original.attributes.position.array.slice(),surface=prepareLedSurface(mesh,{normal:aperture.normal,aperture});mesh.geometry.computeBoundingBox();
   assert(mesh.geometry.boundingBox.equals(bounds));assert.deepEqual(original.attributes.position.array,sourcePositions);
   assert(mesh.material.color.equals(color));assert.deepEqual([mesh.material.metalness,mesh.material.roughness],physical);
   const mask=mesh.geometry.attributes.ledEmissionMask,n=mesh.geometry.attributes.normal;
   const proof={source_identity:mesh.name,side:spec.side,center:aperture.center,normal:aperture.normal,radius:aperture.radius_mm*.001,source_geometry_sha256:sha(Buffer.concat([Buffer.from(original.attributes.position.array.buffer),Buffer.from(original.index.array.buffer)])),luminous_triangles:surface.luminous_triangles,nonluminous_triangles:surface.body_triangles,source_lens_vertex_count:0,front_center_luminous_triangles:0,rim_emission_vertices:0,back_emission_vertices:0,outside_aperture_emission_vertices:0,nonfinite_mask_values:0};
   const positions=mesh.geometry.attributes.position,unique=new Set(),v=new THREE.Vector3(),center=new THREE.Vector3(...aperture.center),outward=new THREE.Vector3(...normal),radius=proof.radius;
   for(let i=0;i<mask.count;i++){
    const dot=n.getX(i)*normal[0]+n.getY(i)*normal[1]+n.getZ(i)*normal[2],value=mask.getX(i);if(!Number.isFinite(value))proof.nonfinite_mask_values++;
    if(!value)continue;v.fromBufferAttribute(positions,i).sub(center);const plane=v.dot(outward),radial=v.lengthSq()-plane*plane;
    if(dot<=.92)proof.back_emission_vertices++;
    if(plane>.0002)proof.rim_emission_vertices++;
    if(Math.abs(plane)>.00004+1e-7||radial>(radius+3e-6)**2)proof.outside_aperture_emission_vertices++;
    unique.add([positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>v.toFixed(8)).join(','));
    if(i%3===0){const centroid=new THREE.Vector3();for(let j=0;j<3;j++)centroid.add(new THREE.Vector3().fromBufferAttribute(positions,i+j));centroid.multiplyScalar(1/3).sub(center);if(centroid.length()<radius*.7)proof.front_center_luminous_triangles++;}
   }
   proof.source_lens_vertex_count=unique.size;assert.equal(surface.luminous_triangles,61,'Native disc triangle binding changed');assert(proof.front_center_luminous_triangles>0);
   for(const k of ['rim_emission_vertices','back_emission_vertices','outside_aperture_emission_vertices','nonfinite_mask_values'])assert.equal(proof[k],0,k);
   report.aperture_proof.emitters.push(proof);
   report.disco_emitters++;report.luminous_triangles+=surface.luminous_triangles;report.nonluminous_triangles+=surface.body_triangles;
   for(const xyz of [[0,0,0],[.04,.12,.08],[-.04,-.12,.08],[0,0,0]]){mesh.position.set(...xyz);mesh.updateWorldMatrix(true,false);assert(mesh.matrixWorld.elements.every(Number.isFinite));assert.equal(mesh.userData.ledSurface,surface);report.pose_checks++;}
   restoreLedSurface(mesh);assert.equal(mesh.geometry,original);assert.equal(mesh.material.color.getHex(),color.getHex());
   for(const key of Object.keys(report.surface_checks))report.surface_checks[key]++;
  }
 }
 assert.equal(report.disco_emitters,meta.leds_per_stick*meta.stick_count);
 const scene=new THREE.Scene(),rig=createToolheadLedRig(scene);scene.add(model);assert.equal(rig.update().installed,0,'Disco is not a toolhead LED');rig.dispose();
 const discoNative=captureNative(model);
 for(const [prefix,metaPath,glbPath] of [['toolheads/sb_stock','toolheads/sb_stock.json','toolheads/sb_stock.glb.gz'],['modules/sb_rapido2_hf','modules/sb_rapido2_hf.json','modules/sb_rapido2_hf.glb.gz'],['xol','XOL_MOD.json','Xol_SherpaMini_Rapido2UHF_AWD9.glb.gz']]){
  const metadata=JSON.parse(await load(metaPath)),stored=await load(glbPath),buffer=gunzipSync(stored);report.decoded_reportsha[glbPath]=sha(buffer);
  const head=(await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')).scene;
  const lookup=new Map(metadata.parts.map(p=>[String(p.key),p]));head.traverse(o=>{if(o.isMesh){const key=o.userData.part_key||o.name.match(/^P([^_]+)__/u)?.[1]||o.name;o.userData.ledSourceRow=lookup.get(String(key));}});
  const target=new THREE.Scene();target.add(head,model);const controller=createToolheadLedRig(target),native=captureNative(head);
  const counts=controller.update(),fixture={fixture_id:prefix,input_paths:[metaPath,glbPath],expected_emitters:3,expected_guides:1,emitters:counts.installed,guides:controller.guides.length,effects:['static','flow','breath','chase'],colors:['white','red','blue','rainbow'],effect_samples:0,movement_checks:0,on_off_checks:0,hidden_checks:0,reset_checks:0,restoration_checks:0,orphan_guide_dark_checks:0,nozzle_white_checks:0,guide_checks:0};
  assert.equal(counts.installed,3,prefix+' missing actual LED');assert.equal(controller.guides.length,1,prefix+' missing actual diffuser');
  assert.equal(counts.lit,3);checkLightValues(controller,{gain:1,color:0xfff4e7});
  assert.equal(controller.emitters.filter(e=>e.identity.kind==='nozzle').length,2);assert.equal(controller.emitters.filter(e=>e.identity.kind==='logo').length,1);
  fixture.brightness={levels:[...report.toolhead_brightness_scope.levels],samples:[],default_100_checks:1,triple_300_checks:0,reversal_checks:0,
   unchanged_meshes:native.size,geometry_normal_material_source_mask_checks:0,source_emitters:[],guide_pairing:[],individual_hidden_checks:0,
   source_emitter_movement_checks:0,head_detach_reattach_checks:0,native_clone_checks:0,duplicate_head_guide_isolation_checks:0,controller_reset_checks:0};
  for(const e of controller.emitters){
   const surface=e.surface,original=native.get(e.mesh);assert.equal(surface.originalGeometry,original.geometry);assert.equal(surface.originalMaterial,original.material);
   assert(surface.aperture);assert(surface.luminous_triangles>0&&surface.body_triangles>0);
   const expanded=original.geometry.index?original.geometry.toNonIndexed():original.geometry.clone();
   assert.deepEqual(e.mesh.geometry.attributes.position.array,expanded.attributes.position.array,'LED brightness preparation must retain native triangles');expanded.dispose();
   const normal=e.mesh.geometry.attributes.normal,mask=e.mesh.geometry.attributes.ledEmissionMask,positions=e.mesh.geometry.attributes.position;let zeroAreaDarkVertices=0;
   for(let i=0;i<normal.count;i++){
    const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i),length=Math.hypot(nx,ny,nz);assert([nx,ny,nz].every(Number.isFinite));assert(mask.getX(i)===0||mask.getX(i)===1);
    if(length===0){
     const first=i-i%3,a=new THREE.Vector3().fromBufferAttribute(positions,first),b=new THREE.Vector3().fromBufferAttribute(positions,first+1),c=new THREE.Vector3().fromBufferAttribute(positions,first+2);
     assert.equal(b.sub(a).cross(c.sub(a)).lengthSq(),0,'Only unchanged native zero-area triangles may have zero normals');assert.equal(mask.getX(i),0,'Degenerate source triangles must remain nonluminous');zeroAreaDarkVertices++;
    }else assert(Math.abs(length-1)<1e-5,'Nondegenerate prepared LED normals must remain unit vectors');
    if(mask.getX(i))assert(nx*surface.normal[0]+ny*surface.normal[1]+nz*surface.normal[2]>.92);
   }
   if(zeroAreaDarkVertices)report.source_geometry_notices.push({fixture_id:prefix,emitter_id:e.identity.id,zero_area_dark_triangles:zeroAreaDarkVertices/3,scope:'Inherited source triangles retained exactly; no unit normal exists for zero-area faces. Not a claim of complete source-mesh normal quality.'});
   fixture.brightness.source_emitters.push({id:e.identity.id,kind:e.identity.kind,mesh:e.mesh.name,native_geometry_sha256:original.geometry_sha256,
    native_material_sha256:original.material_sha256,prepared_geometry_sha256:geometrySha(e.mesh.geometry),mask_sha256:sha(Buffer.from(mask.array.buffer,mask.array.byteOffset,mask.array.byteLength)),
    source_aperture:surface.aperture,luminous_triangles:surface.luminous_triangles,body_triangles:surface.body_triangles,native_zero_area_dark_vertices:zeroAreaDarkVertices});
  }
  for(const g of controller.guides)fixture.brightness.guide_pairing.push({guide:g.mesh.name,guide_id:g.guide.id,emitter_id:pairedLogo(controller,g).identity.id});
  const prepared=capturePrepared(native),samples=new Map();let previous;
  for(const level of fixture.brightness.levels){
   assert.deepEqual(controller.update({level,color:'red',effect:'static',seconds:0}),{installed:3,lit:level?3:0,registered:3});
   checkLightValues(controller,{gain:level/100});
   const sample={level,emitters:controller.emitters.map(e=>({id:e.identity.id,kind:e.identity.kind,point_intensity:e.light.intensity,emissive_intensity:e.surface.materials[0].emissiveIntensity})),
    guides:controller.guides.map(g=>({id:g.guide.id,emitter_id:pairedLogo(controller,g).identity.id,emissive_intensity:g.materials[0].emissiveIntensity}))};
   if(!samples.has(level)&&level>0)for(let i=0;i<sample.emitters.length;i++){
    assert(sample.emitters[i].point_intensity>previous.emitters[i].point_intensity,prefix+' projected nozzle/logo light must rise');
    assert(sample.emitters[i].emissive_intensity>previous.emitters[i].emissive_intensity,prefix+' lens emission must rise');
   }
   if(!samples.has(level)&&level>0)for(let i=0;i<sample.guides.length;i++)assert(sample.guides[i].emissive_intensity>previous.guides[i].emissive_intensity);
   if(samples.has(level)){assert.deepEqual(sample,samples.get(level),prefix+' reversed control must restore exact emission');fixture.brightness.reversal_checks++;}else samples.set(level,sample);
   checkPrepared(native,prepared);fixture.brightness.geometry_normal_material_source_mask_checks++;
   checkOriginals(discoNative,{restored:true});assert.equal(nativeLights(model).length,0);report.disco_independence.actual_model_unchanged_checks++;
   fixture.brightness.samples.push(sample);previous=sample;
  }
  for(let i=0;i<3;i++){assert.equal(samples.get(300).emitters[i].point_intensity,samples.get(100).emitters[i].point_intensity*3);assert.equal(samples.get(300).emitters[i].emissive_intensity,samples.get(100).emitters[i].emissive_intensity*3);fixture.brightness.triple_300_checks++;}
  for(let i=0;i<controller.guides.length;i++){assert.equal(samples.get(300).guides[i].emissive_intensity,samples.get(100).guides[i].emissive_intensity*3);fixture.brightness.triple_300_checks++;}
  for(const level of [100,300])for(const effect of fixture.effects)for(const color of fixture.colors)for(const seconds of [0,.37]){
   controller.update({level,effect,color,seconds});fixture.effect_samples++;
   for(const e of controller.emitters){for(const m of e.surface.materials)assert(Number.isFinite(m.emissiveIntensity));assert(Number.isFinite(e.light.intensity));assert(e.light.color.equals(e.surface.materials[0].emissive));if(e.identity.kind==='nozzle'){assert.equal(e.surface.materials[0].emissive.getHex(),0xffffff);assert.equal(e.light.color.getHex(),0xffffff);assert.equal(e.light.intensity,.004*level/100);assert.equal(e.surface.materials[0].emissiveIntensity,3.2*(level/100));fixture.nozzle_white_checks++;}}
   for(const g of controller.guides){assert(g.materials[0].emissiveIntensity>0);const emitter=pairedLogo(controller,g);assert(g.materials[0].emissive.equals(emitter.surface.materials[0].emissive));assert.equal(g.materials[0].emissiveIntensity,emitter.surface.materials[0].emissiveIntensity);fixture.guide_checks++;}
  }
  const nativeHeadPosition=head.position.clone(),initial=controller.emitters.map(e=>e.light.getWorldPosition(new THREE.Vector3()));
  fixture.tested_head_translations_m=[[0,0,0],[.04,.12,.08],[-.04,-.12,.08],[0,0,0]];
  for(const xyz of fixture.tested_head_translations_m){head.position.copy(nativeHeadPosition).add(new THREE.Vector3(...xyz));target.updateMatrixWorld(true);controller.update({level:300});for(const [i,e]of controller.emitters.entries())assert(e.light.getWorldPosition(new THREE.Vector3()).distanceTo(initial[i].clone().add(new THREE.Vector3(...xyz)))<1e-9);fixture.movement_checks++;}fixture.reset_checks++;
  for(const e of controller.emitters){
   const position=e.mesh.position.clone(),world=e.light.getWorldPosition(new THREE.Vector3());
   for(const delta of [[.01,-.02,.03],[-.01,.02,-.03],[0,0,0]]){
    e.mesh.position.copy(position).add(new THREE.Vector3(...delta));target.updateMatrixWorld(true);controller.update({level:300});
    const expectedDelta=new THREE.Vector3(...delta).applyMatrix4(e.mesh.parent.matrixWorld).sub(new THREE.Vector3().applyMatrix4(e.mesh.parent.matrixWorld));
    assert(e.light.getWorldPosition(new THREE.Vector3()).distanceTo(world.clone().add(expectedDelta))<1e-9);
    assert.equal(e.light.parent,e.mesh);assert.equal(e.light.intensity,e.identity.kind==='nozzle'?.004*3:.0015*3);fixture.brightness.source_emitter_movement_checks++;
   }
   assert(e.mesh.position.equals(position));e.mesh.visible=false;assert.equal(controller.update({level:300}).lit,2);
   assert.equal(e.light.intensity,0);for(const m of e.surface.materials)assert.equal(m.emissiveIntensity,0);
   if(e.identity.kind==='logo')for(const g of controller.guides)assert.equal(g.materials[0].emissiveIntensity,0);
   fixture.brightness.individual_hidden_checks++;e.mesh.visible=true;assert.equal(controller.update({level:300}).lit,3);
  }
  for(const power of [false,true,false,true]){assert.equal(controller.update({power,level:300,color:'red',effect:'static'}).lit,power?3:0);checkLightValues(controller,{gain:power?3:0});fixture.on_off_checks++;}
  head.visible=false;assert.equal(controller.update({level:300}).lit,0);for(const e of controller.emitters){assert.equal(e.light.intensity,0);for(const m of e.surface.materials)assert.equal(m.emissiveIntensity,0);}for(const g of controller.guides)assert.equal(g.materials[0].emissiveIntensity,0);fixture.hidden_checks++;head.visible=true;
  controller.update({level:300,color:'red'});checkPrepared(native,prepared);
  const clone=cloneNativeLedTree(head),cloneMeshes=[];clone.traverse(o=>{if(o.isMesh)cloneMeshes.push(o)});
  assert.equal(cloneMeshes.length,native.size);assert.equal(nativeLights(clone).length,0);
  const originals=[...native.values()];for(const [i,mesh]of cloneMeshes.entries()){assert.equal(mesh.geometry,originals[i].geometry);assert.equal(mesh.material,originals[i].material);assert(!mesh.userData.ledSurface&&!mesh.userData.ledGuide);}
  assert.equal(nativeLights(head).length,3);fixture.brightness.native_clone_checks++;
  clone.position.add(new THREE.Vector3(.15,0,0));target.add(clone);assert.equal(controller.update({level:300,color:'red'}).lit,6);
  for(const g of controller.guides)pairedLogo(controller,g);
  const ownGuides=controller.guides.filter(g=>native.has(g.mesh)),logos=controller.emitters.filter(e=>native.has(e.mesh)&&e.identity.kind==='logo').map(e=>({mesh:e.mesh,parent:e.mesh.parent}));
  for(const e of logos)e.parent.remove(e.mesh);assert.equal(controller.update({level:300}).lit,5);
  for(const g of ownGuides)assert.equal(g.materials[0].emissiveIntensity,0,'An orphan guide must not borrow the cloned head\'s identical emitter ID');
  for(const g of controller.guides.filter(g=>!native.has(g.mesh)))assert.equal(g.materials[0].emissiveIntensity,3.2*3);
  fixture.orphan_guide_dark_checks++;fixture.brightness.duplicate_head_guide_isolation_checks++;
  for(const e of logos)e.parent.add(e.mesh);assert.equal(controller.update({level:300}).lit,6);
  target.remove(clone);assert.equal(controller.update({level:300}).registered,3);assert.equal(nativeLights(clone).length,0);for(const mesh of cloneMeshes)assert(!mesh.userData.ledSurface&&!mesh.userData.ledGuide);
  target.remove(head);assert.deepEqual(controller.update({level:300}),{installed:0,lit:0,registered:0});assert.equal(controller.guides.length,0);
  checkOriginals(native,{restored:true});assert.equal(nativeLights(head).length,0);fixture.brightness.head_detach_reattach_checks++;
  target.add(head);assert.equal(controller.update({level:300,color:'red'}).lit,3);checkLightValues(controller,{gain:3});assert.equal(nativeLights(head).length,3);fixture.brightness.head_detach_reattach_checks++;
  controller.dispose();controller.dispose();assert.equal(controller.emitters.length,0);assert.equal(controller.guides.length,0);checkOriginals(native,{restored:true});assert.equal(nativeLights(head).length,0);fixture.restoration_checks++;
  const reset=createToolheadLedRig(target);assert.equal(reset.update().lit,3);checkLightValues(reset,{gain:1,color:0xfff4e7});assert.equal(nativeLights(head).length,3);
  reset.dispose();checkOriginals(native,{restored:true});assert.equal(nativeLights(head).length,0);fixture.brightness.controller_reset_checks++;
  assert(head.position.equals(nativeHeadPosition));for(const [mesh,source]of native){assert.equal(mesh.parent,source.parent);assert(mesh.position.equals(source.position));assert(mesh.quaternion.equals(source.quaternion));assert(mesh.scale.equals(source.scale));assert.equal(mesh.visible,source.visible);}
  checkOriginals(discoNative,{restored:true});assert.equal(nativeLights(model).length,0);target.remove(model);
  report.head_fixtures.push(fixture);head.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});
 }
 model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});
 report.passed=true;report.completed_at_utc=new Date().toISOString();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await auditLedLighting(path.resolve(process.argv[2]));if(process.argv[3]){const file=path.resolve(process.argv[3]),bytes=JSON.stringify(report,null,2)+'\n';await fs.writeFile(file,bytes);console.log(JSON.stringify({report:file,report_sha256:sha(bytes)}));}else console.log(JSON.stringify(report));
}

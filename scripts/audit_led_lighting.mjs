import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import crypto from 'node:crypto';
import {register} from 'node:module';
import {fileURLToPath} from 'node:url';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three'),{GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
const {prepareLedSurface,restoreLedSurface}=await import('../site/viewer/led-emission-surface.mjs');
const {createToolheadLedRig}=await import('../site/viewer/toolhead-lighting.mjs');
const {sourceDiscoAperture}=await import('../site/viewer/disco-led-apertures.mjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

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
 model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});
 for(const [prefix,metaPath,glbPath] of [['toolheads/sb_stock','toolheads/sb_stock.json','toolheads/sb_stock.glb.gz'],['modules/sb_rapido2_hf','modules/sb_rapido2_hf.json','modules/sb_rapido2_hf.glb.gz'],['xol','XOL_MOD.json','Xol_SherpaMini_Rapido2UHF_AWD9.glb.gz']]){
  const metadata=JSON.parse(await load(metaPath)),stored=await load(glbPath),buffer=gunzipSync(stored);report.decoded_reportsha[glbPath]=sha(buffer);
  const head=(await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')).scene;
  const lookup=new Map(metadata.parts.map(p=>[String(p.key),p]));head.traverse(o=>{if(o.isMesh){const key=o.userData.part_key||o.name.match(/^P([^_]+)__/u)?.[1]||o.name;o.userData.ledSourceRow=lookup.get(String(key));}});
  const target=new THREE.Scene();target.add(head);const controller=createToolheadLedRig(target),native=new Map();head.traverse(o=>{if(o.isMesh)native.set(o,{geometry:o.geometry,material:o.material});});
  const counts=controller.update(),fixture={fixture_id:prefix,input_paths:[metaPath,glbPath],expected_emitters:3,expected_guides:1,emitters:counts.installed,guides:controller.guides.length,effects:['static','flow','breath','chase'],colors:['white','red','blue','rainbow'],effect_samples:0,movement_checks:0,on_off_checks:0,hidden_checks:0,reset_checks:0,restoration_checks:0,orphan_guide_dark_checks:0,nozzle_white_checks:0,guide_checks:0};
  assert.equal(counts.installed,3,prefix+' missing actual LED');assert.equal(controller.guides.length,1,prefix+' missing actual diffuser');
  for(const effect of fixture.effects)for(const color of fixture.colors)for(const seconds of [0,.37]){
   controller.update({effect,color,seconds});fixture.effect_samples++;
   for(const e of controller.emitters){assert(e.surface.aperture);assert(e.surface.luminous_triangles>0&&e.surface.body_triangles>0);for(const m of e.surface.materials)assert(Number.isFinite(m.emissiveIntensity));if(e.identity.kind==='nozzle'){assert.equal(e.surface.materials[0].emissive.getHex(),0xffffff);fixture.nozzle_white_checks++;}}
   for(const g of controller.guides){assert(g.materials[0].emissiveIntensity>0);const emitter=controller.emitters.find(e=>(g.guide.led_ids||[]).includes(e.identity.id));assert(g.materials[0].emissive.equals(emitter.surface.materials[0].emissive));fixture.guide_checks++;}
  }
  const initial=controller.emitters.map(e=>e.light.getWorldPosition(new THREE.Vector3()));
  for(const xyz of [[0,0,0],[.04,.12,.08],[-.04,-.12,.08],[0,0,0]]){head.position.set(...xyz);target.updateMatrixWorld(true);controller.update();for(const [i,e]of controller.emitters.entries())assert(e.light.getWorldPosition(new THREE.Vector3()).distanceTo(initial[i].clone().add(head.position))<1e-9);fixture.movement_checks++;}fixture.reset_checks++;
  for(const power of [false,true]){assert.equal(controller.update({power}).lit,power?3:0);for(const g of controller.guides)assert.equal(g.materials[0].emissiveIntensity>0,power);fixture.on_off_checks++;}
  head.visible=false;assert.equal(controller.update().lit,0);for(const g of controller.guides)assert.equal(g.materials[0].emissiveIntensity,0);fixture.hidden_checks++;head.visible=true;
  const logos=controller.emitters.filter(e=>e.identity.kind==='logo').map(e=>({mesh:e.mesh,parent:e.mesh.parent}));for(const e of logos)e.parent.remove(e.mesh);controller.update();for(const g of controller.guides)assert.equal(g.materials[0].emissiveIntensity,0);fixture.orphan_guide_dark_checks++;
  for(const e of logos)e.parent.add(e.mesh);assert.equal(controller.update().installed,3);controller.dispose();for(const [mesh,source]of native){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);}fixture.restoration_checks++;
  report.head_fixtures.push(fixture);head.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});
 }
 report.passed=true;report.completed_at_utc=new Date().toISOString();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await auditLedLighting(path.resolve(process.argv[2]));if(process.argv[3]){const file=path.resolve(process.argv[3]),bytes=JSON.stringify(report,null,2)+'\n';await fs.writeFile(file,bytes);console.log(JSON.stringify({report:file,report_sha256:sha(bytes)}));}else console.log(JSON.stringify(report));
}

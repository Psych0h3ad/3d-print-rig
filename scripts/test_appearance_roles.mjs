import assert from 'node:assert/strict';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {lightingState} from '../site/viewer/lighting-state.mjs';
for(const key of ['417','430','431','530','556','559','577','578'])assert.equal(appearanceRole({key}),'base');for(const key of ['423','532','534','536','545','547'])assert.equal(appearanceRole({key}),'accent');
for(const name of ['B Drive Frame Lower','XY Joint - Right','Z Motor Mount (3)','Octopus Bracket','bottom_panel_clip_x4 (2)'])assert.equal(appearanceRole({key:'v24_00100',name}),'base');
for(const name of ['Cable Cover','Fan Grill B (1)','PCB_Spacer','D2F_Endstop_Pod','60mm_exhaust_fan_grill'])assert.equal(appearanceRole({key:'v24_00100',name}),'accent');
for(const name of ['Heatsink','NEMA17 Black','2020 Drop-in T-nut, M3','PCB','MGN9H','Panasonic GX-H15A'])assert.equal(appearanceRole({key:'v24_00100',name}),null);assert.equal(appearanceRole({key:'different_cad',name:'Cable Cover'}),null);
for(const installed of [false,true])for(const power of [false,true])for(const night of [false,true])for(const ready of [false,true])for(const level of [0,75,100]){const state=lightingState({installed,power,night,ready,level});assert.equal(state.on,installed&&power&&ready&&level>0);assert.equal(state.installed,installed&&ready);assert.equal(state.night,night);assert.equal(state.adjustDisabled,!installed||!power||!ready)}
assert.equal(lightingState({installed:true,power:true,night:true,level:75,ready:true,failed:true}).on,false);
for(const name of ['Front Idler A Top','Z Bearing Block Bottom (1) (2)','Z Belt Drive B (3)','Middle_Fan_Support_ v1(Mirror)','PSU_Stabilizer','bottom_panel_hinge_x2'])assert.equal(appearanceRole({key:'v24_00327',name}),'base');
for(const name of ['Z Belt Clamp Upper (2) (1)','Z Belt Clamp Lower','Belt Tensioner','Belt_Guard','Door Handle B'])assert.equal(appearanceRole({key:'v24_00327',name}),'accent');
for(const name of ['LED_Diffuser','Rubber Foot','GT2 20T Pulley','Z Belt','Foam Tape (1mm)'])assert.equal(appearanceRole({key:'v24_00327',name}),null);
assert.equal(appearanceRole({key:'ldo_cnc_00327',name:'Front Idler A Top'}),null);
for(const name of ['M3 Threaded Insert (14) (1)','2020 Drop-in T-nut, M3 (17)','Motor','PCB','Heatsink','Nylon Washer (Thumbscrew)'])assert.equal(appearanceRole({key:'fysetc_v24_250_pro_1',name,appearance_role:'accent'}),null);
for(const name of ['B Drive Frame Lower','B Drive Frame Upper','Octopus Bracket','XY Joint - Right-12'])assert.equal(appearanceRole({key:'fysetc_v24_250_pro_1',name}),'base');
const micron=(name,key='m180_01617')=>({key,name,source:{repository:'PrintersForAnts/Micron'}});
for(const name of ['Nema14_Motor_Mount v5','Nema17_Motor_Mount v3','M2_Hex_Adapter','M2_Hex_Adapter_Parametric'])assert.equal(appearanceRole({...micron(name),appearance_role:'base'}),'base');
for(const name of ['A_Drive_Frame_Upper v7','B_Drive_Frame_Lower v10','AB_Drive_Top_Bearing_Retainer v5','Rear_Plate v1','Front_Body v6','Board_Spacer_Micron','Main Handle v3','Hinge Barrel v19'])assert.equal(appearanceRole(micron(name)),'base');
for(const name of ['Belt_Clamp_A v2','Belt_Clamp_B v2','Toothed_Idler_Carrier_Pinned v1','Extruder_Knob v2','Bezel v2','Railstop v1'])assert.equal(appearanceRole(micron(name)),'accent');
for(const name of ['Rear_Gantry_Extrusion','X_Extrusion'])assert.equal(appearanceRole(micron(name)),'frame');
for(const name of ['PG9_Gland v2','Diffuser_Micron v9','GT2_16T_Pulley v2','Powge_64T_Pulley v1','Revo Voron','2510 Axial Fan','M3 Threaded Insert v5','MGN7-220mm v1','PCB'])assert.equal(appearanceRole(micron(name)),null);
assert.equal(appearanceRole({...micron('Rear_Plate v1'),source:{repository:'another/assembly'}}),null);
for(const name of ['M3 Washer 7mmx.5mm','MGN7-H-Carriage v1','Outer Housing','Release clip (8) (1)','p2^UHP-200_psu_octopus_spider_and_pi_mount']){
 const p={...micron(name),appearance_role:'base'};p.source.assembly_path=[name==='Outer Housing'?'KGLM-3 Spherical Bearing:1':name.startsWith('Release')?'ECAS_Fitting v1:1':name.startsWith('p2')?'Meanwell-UHP-200-24:1':'Idler_Printed:1'];assert.equal(appearanceRole(p),null);
}
for(const path of ['CenterPanelClip-3.5mm (14):1','CornerPanelClip (2):1','reverseBowdenEntry:1','Panels:1/Handles:1'])assert.equal(appearanceRole({...micron('SOLID','m120_00941'),source:{repository:'PrintersForAnts/Micron',assembly_path:[path]}}),'base');
for(const name of ['Front_Cover v7','Idler_Carrier_Pinned v1','Printed_Spacer','Mounting_Cover_B v6','Z_Belt_Cover_A v5'])assert.equal(appearanceRole(micron(name)),'accent');

// These are the original source leaves, not every SOLID beneath Printed:1.
const railstopKeys=['00345','00348','00376','00379','00407','00410','00438','00441'];
for(const source_key of railstopKeys){
 const part={key:'m120_'+source_key,name:'SOLID',appearance_role:'base',source:{
  repository:'PrintersForAnts/Micron',commit:'f76aa28767211ddfee2e30290aadcea3c45f8513',
  cache_machine:'micron_r1_120',source_key,assembly_path:['120_R1_Assembly v4','Frame_Assembly v5:1','Verticals:1','Vertical_Frame_and_Rail_Assembly:1','Printed:1','Railstops v3:1','=>[0:1:1:199]']}};
 assert.equal(appearanceRole(part),'accent',source_key+' anonymous [a]_railstops_x8 source leaf');
 for(const source of [{commit:'another-revision'},{cache_machine:'micron_plus_r1_180'},{source_key:'00000'},{assembly_path:['Printed:1','Hardware:1','SOLID:1']}]){
  assert.equal(appearanceRole({...part,appearance_role:null,source:{...part.source,...source}}),null,'Unreviewed source identity cannot inherit railstop accent');
 }
 assert.equal(appearanceRole({...part,key:'m180_'+source_key,appearance_role:null}),null,'120 source whitelist cannot classify Plus leaves');
}

// Importing the audit is side-effect free: CI source fixtures need no GLBs and
// parent release orchestration can call the exported async function explicitly.
const {register}=await import('node:module');register('./three-test-loader.mjs',import.meta.url);
const {micronRoleContract,expectedMicronRoles,assertMicronRoles,materialState,assertMaterialState}=await import('./audit_micron_colors.mjs');
const THREE=await import('three');
let omittedPrintedRejected=0,omittedFrameRejected=0,purchasedDescendantRejected=0;
for(const [id,contract]of Object.entries(micronRoleContract)){
 const expected=expectedMicronRoles(id),parts=[...expected.keys()].map(key=>({key}));
 while(parts.length<contract.parts)parts.push({key:'fixture_purchased_'+parts.length});
 const manifest={machine_id:id,parts},records=new Map(parts.map(p=>[p.key,{appearance_role:expected.get(p.key)||null}]));
 assertMicronRoles(manifest,records);
 for(const [key,role]of expected){
  const original=records.get(key);records.set(key,{appearance_role:null});
  assert.throws(()=>assertMicronRoles(manifest,records),/source role must be/,'An uncolored printed/frame leaf must fail independently of classifier output');
  records.set(key,original);if(role==='frame')omittedFrameRejected++;else omittedPrintedRejected++;
 }
 const purchased=parts.find(p=>!expected.has(p.key));records.set(purchased.key,{appearance_role:'base'});
 assert.throws(()=>assertMicronRoles(manifest,records),/source role must be protected/,'A purchased descendant cannot inherit its parent printed role');
 records.set(purchased.key,{appearance_role:null});purchasedDescendantRejected++;
 assert.throws(()=>assertMicronRoles({...manifest,parts:parts.slice(1)},records),/source census/);
 assert.throws(()=>assertMicronRoles({...manifest,machine_id:'micron_unregistered'},records),/Unreviewed Micron/);
}

// Check the attached mesh material; a detached palette row cannot be evidence.
const originalHardware=new THREE.MeshStandardMaterial({color:'#937b52',metalness:.83,roughness:.28,opacity:.43,transparent:true,emissive:'#0c152a',emissiveIntensity:.61,side:THREE.FrontSide,vertexColors:false});
const baseline=materialState(originalHardware),mesh=new THREE.Mesh(new THREE.BoxGeometry(),originalHardware.clone());
assertMaterialState(mesh.material,baseline,'Exact purchased PBR clone');
for(const mutate of [m=>m.color.set('#ff00ff'),m=>m.metalness=0,m=>m.roughness=.72,m=>m.opacity=1,m=>m.transparent=false,m=>m.side=THREE.DoubleSide,m=>m.flatShading=true,m=>m.emissiveIntensity=0,m=>m.depthWrite=false]){
 mesh.material=originalHardware.clone();mutate(mesh.material);
 assert.throws(()=>assertMaterialState(mesh.material,baseline,'Purchased material changed'));
}
mesh.material=originalHardware.clone();const detachedRow={material:mesh.material,original:mesh.material.color.clone()};
mesh.material=mesh.material.clone();mesh.material.color.set('#ff00ff');
assertMaterialState(detachedRow.material,baseline,'Detached row remains unchanged');
assert.throws(()=>assertMaterialState(mesh.material,baseline,'Actual rendered material differs'));
assertMaterialState(originalHardware,baseline,'Source shared material must remain exact');
console.log(JSON.stringify({passed:true,anonymous_railstop_source_leaves:railstopKeys.length,omitted_printed_leaves_rejected:omittedPrintedRejected,omitted_frame_leaves_rejected:omittedFrameRejected,purchased_descendants_rejected:purchasedDescendantRejected,hardware_pbr_mutations_rejected:9,detached_palette_material_rejected:true,scope:'Source identities, fail-closed frozen role expectations and adversarial material fixtures; actual exports, GPU and native solids are separate.'}));

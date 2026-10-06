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
console.log('Printed identity assignments and 48 lighting state transitions passed; hardware remains protected.');
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

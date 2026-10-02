import assert from 'node:assert/strict';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {lightingState} from '../site/viewer/lighting-state.mjs';
for(const key of ['417','430','431','530','556','559','577','578'])assert.equal(appearanceRole({key}),'base');for(const key of ['423','532','534','536','545','547'])assert.equal(appearanceRole({key}),'accent');
for(const name of ['B Drive Frame Lower','XY Joint - Right','Z Motor Mount (3)','Octopus Bracket','bottom_panel_clip_x4 (2)'])assert.equal(appearanceRole({key:'v24_00100',name}),'base');
for(const name of ['Cable Cover','Fan Grill B (1)','PCB_Spacer','D2F_Endstop_Pod','60mm_exhaust_fan_grill'])assert.equal(appearanceRole({key:'v24_00100',name}),'accent');
for(const name of ['Heatsink','NEMA17 Black','2020 Drop-in T-nut, M3','PCB','MGN9H','Panasonic GX-H15A'])assert.equal(appearanceRole({key:'v24_00100',name}),null);assert.equal(appearanceRole({key:'different_cad',name:'Cable Cover'}),null);
for(const installed of [false,true])for(const power of [false,true])for(const night of [false,true])for(const ready of [false,true])for(const level of [0,75,100]){const state=lightingState({installed,power,night,ready,level});assert.equal(state.on,installed&&power&&ready&&level>0);assert.equal(state.installed,installed&&ready);assert.equal(state.night,night);assert.equal(state.adjustDisabled,!installed||!power||!ready)}
assert.equal(lightingState({installed:true,power:true,night:true,level:75,ready:true,failed:true}).on,false);
for(const name of ['M3 Threaded Insert (14) (1)','2020 Drop-in T-nut, M3 (17)','Motor','PCB','Heatsink','Nylon Washer (Thumbscrew)'])assert.equal(appearanceRole({key:'fysetc_v24_250_pro_1',name,appearance_role:'accent'}),null);
for(const name of ['B Drive Frame Lower','B Drive Frame Upper','Octopus Bracket','XY Joint - Right-12'])assert.equal(appearanceRole({key:'fysetc_v24_250_pro_1',name}),'base');
console.log('Printed identity assignments and 48 lighting state transitions passed; hardware remains protected.');

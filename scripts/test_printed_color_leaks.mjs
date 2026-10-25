import assert from 'node:assert/strict';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';

// Named printed leaves and anonymous source slots must not inherit roles from
// purchased assemblies or nearby parts with a similar name.
const cases=[
 ['568','z_rear_insert_3hole','Z Assembly:1/Z_Rear:1/Z_Rear_Printed:1/z_rear_insert_3hole:1','base'],
 ['722','z_stepper_left','Z Assembly:1/Z_Motors:1/Z_Stepper_Left:1/Z_Mount_Left_Printed:1/z_stepper_left:1','base'],
 ['831','COMPOUND','Skirt:1/Front:1/Mini12864 Assembly:1/LCD Case Front:1/=>[0:1:1:451]','base'],
 ['837','BTT_Knob_Light_Shield','Skirt:1/Front:1/Mini12864 Assembly:1/BTT_Knob_Light_Shield:1','accent'],
 ['953','SOLID','Electronics:1/Controllers:1/Octopus:1/DIN Clip:2/=>[0:1:1:525]','base'],
 ['977','SOLID','Electronics:1/Meanwell LRS-200-24:1/PSU_Stabilizer:1/=>[0:1:1:540]','base'],
 ['1194','SOLID','Panels:1/Opaque Panels:1/Rear Panel:1/Corner Clip 6mm:5/=>[0:1:1:608]','base'],
];
let rejected=0;
for(const size of [250,300,350])for(const [leaf,name,source_component,role]of cases){
 const part={key:`voron_trident_${size}_base_${leaf}`,source_leaf:leaf,name,source_component};
 assert.equal(appearanceRole(part),role);
 for(const changes of [{source_leaf:'unreviewed'},{key:'another_'+part.key},{name:'PCB'},{source_component:source_component+'/Purchased:1'}]){
  assert.equal(appearanceRole({...part,...changes}),null);rejected++;
 }
}
const spool={key:'v24_01392',name:'SOLID',source_path:['(Unsaved)','Spool Holder:1','=>[0:1:1:1535]'],source:{repository:'VoronDesign/Voron-2',commit:'a192410e27ea345644ae5c4b29b4c9c40cbe1a73',source_key:'01392'}};
assert.equal(appearanceRole(spool),'base');
for(const changes of [{repository:'other/source'},{commit:'unreviewed'},{source_key:'01386'}]){
 assert.equal(appearanceRole({...spool,source:{...spool.source,...changes}}),null);rejected++;
}
assert.equal(appearanceRole({...spool,source_path:['(Unsaved)','Spool Holder:1','PFTE insert (86mm):1']}),null);
for(const [leaf,name,path]of [['710','Motor_Body','Z Assembly:1/Z_Motors:1/Z_Stepper_Left:1/Z_Stepper_Left_Motion:1/NEMA17 Leadscrew 300mm:1/Motor_Body:1'],['836','COMPOUND','Skirt:1/Front:1/Mini12864 Assembly:1/Mini12864 Screen:1/=>[0:1:1:457]'],['984','COMPOUND','Electronics:1/Meanwell LRS-200-24:1/=>[0:1:1:545]']]){
 assert.equal(appearanceRole({key:'voron_trident_250_base_'+leaf,source_leaf:leaf,name,source_component:path}),null);
}
console.log(JSON.stringify({passed:true,source_identity_mutations_rejected:rejected,purchased_sibling_cases:3,scope:'Focused source identity regression; actual material slots and motion use audit_printed_color_leaks.mjs.'}));

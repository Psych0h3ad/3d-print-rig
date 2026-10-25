import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
import {sourcePrintedRole,sourcePrintedRecords} from '../site/viewer/source-printed-roles.mjs';
import {printedColorSourceContracts,assertPrintedColorSourceRegistrations,assertPrintedColorSourceCoverage,assertPrintedColorSourceAsset} from './printed-color-source-contracts.mjs';
import {createPaletteController} from '../site/viewer/palette-controller.mjs';
import {machineChoices} from '../site/viewer/machines.js';
const THREE=await import('three');
assertPrintedColorSourceRegistrations(machineChoices);
const crossantSource={repository:'Pole-Engineering/Crossant-235',commit:'e9409a087233f3ec95354594fe9b9cd9357b4ac5',file:'CAD/Crossant V0.6.rar :: Crossant V0.6_.step'};
const vzbotSource={repository:'https://github.com/VzBoT3D/VzBoT-Vz330',revision:'a7b1cdc7121c1d36c73704aa3c7d74c42bc0c959',path:'CAD/Full Printer/Vz-330_v1.2.zip',source_step_sha256:'68b5e77168f67ccbbc9a6f53397cec70bf1a54c6689446be282dd9588b9668a3'};
let printed=0,rejected=0;
for(const [machine_id,contract]of Object.entries(printedColorSourceContracts)){
 const parts=Object.entries(contract.printed).map(([key,name])=>machine_id.startsWith('crossant')?{
  key,name,group:'Crossant_CPAP Housing',appearance_role:'hardware',source:{...crossantSource,source_key:key.slice(9),assembly_path:['Crossant v0.5.4 panelsupdate v11','CPAP Housing:1',...(name==='Cover'?[]:['Hardwares (3):1']),name+':1']},
 }:{key,name,group:'fixed',appearance_role:'native'});
 const manifest={machine_id,source:{...vzbotSource},parts};
 const before=JSON.stringify(manifest),records=sourcePrintedRecords(manifest);
 for(const part of parts){
  assert.equal(sourcePrintedRole(manifest,part),'base');assert.equal(records.get(part.key).appearance_role,'base');
  assert.notEqual(records.get(part.key),part);printed++;
  for(const replacement of [{key:'unreviewed'},{name:'Purchased motor cover'},{group:'head'}]){assert.equal(sourcePrintedRole(manifest,{...part,...replacement}),null);rejected++;}
  assert.equal(sourcePrintedRole({...manifest,machine_id:'another_assembly'},part),null);rejected++;
  if(part.source){
   for(const source of [{repository:'other/source'},{commit:'unreviewed'},{file:'another.step'},{source_key:'01041'},{assembly_path:part.source.assembly_path.concat('Purchased:1')}]){assert.equal(sourcePrintedRole(manifest,{...part,source:{...part.source,...source}}),null);rejected++;}
  }else{
   for(const source of [{repository:'other/source'},{revision:'unreviewed'},{path:'another.zip'},{source_step_sha256:'0'.repeat(64)}]){assert.equal(sourcePrintedRole({...manifest,source:{...manifest.source,...source}},part),null);rejected++;}
  }
 }
 assert.equal(JSON.stringify(manifest),before,'Never rewrite the pinned source manifest');
 assert.equal(sourcePrintedRole(manifest,{key:'unreviewed',group:'fixed'}),null,'Undefined name cannot match an unknown numeric key');
 const purchased={key:machine_id.startsWith('crossant')?'crossant_01066':'00228',name:'Bottom cover v5 (1)',group:parts[0].group,appearance_role:'hardware',source:parts[0].source};
 const withHardware={...manifest,parts:[...parts,purchased]};assert.equal(sourcePrintedRecords(withHardware).get(purchased.key),purchased);
 // Independent transport/census gates reject refreshed pins and omissions.
 const gateManifest={...manifest,parts:[...parts]};while(gateManifest.parts.length<contract.parts)gateManifest.parts.push({key:'purchased_'+gateManifest.parts.length,name:'Purchased'});
 assertPrintedColorSourceAsset(machine_id,contract.manifest_sha256,contract.model_sha256,gateManifest);
 assert.throws(()=>assertPrintedColorSourceAsset(machine_id,'0'.repeat(64),contract.model_sha256,gateManifest),/manifest changed/);
 assert.throws(()=>assertPrintedColorSourceAsset(machine_id,contract.manifest_sha256,'0'.repeat(64),gateManifest),/model changed/);
 assert.throws(()=>assertPrintedColorSourceAsset(machine_id,contract.manifest_sha256,contract.model_sha256,{...gateManifest,parts:gateManifest.parts.slice(1)}),/source census/);
}
const machines=[{id:'crossant_235_v06_leadscrew',family:'crossant'},{id:'vzbot_330_printed',family:'vzbot'}];
assertPrintedColorSourceRegistrations(machines);assertPrintedColorSourceCoverage(machines);
assert.throws(()=>assertPrintedColorSourceCoverage(machines.slice(0,1)),/Missing actual/);
assert.throws(()=>assertPrintedColorSourceCoverage([...machines,machines[0]]),/Duplicate/);
assert.throws(()=>assertPrintedColorSourceRegistrations([...machines,{id:'unreviewed_vzbot',family:'vzbot'}]),/Every registered/);

// The two adapters gain source-color reset without changing their previous PBR.
const shared=new THREE.MeshStandardMaterial({color:'#617383',metalness:.53,roughness:.31});
const print=new THREE.Mesh(new THREE.BoxGeometry(),shared),hardware=new THREE.Mesh(new THREE.BoxGeometry(),shared);
const palette=createPaletteController(new Map([['printed',print],['purchased',hardware]]),new Map([['printed',{appearance_role:'base'}],['purchased',{appearance_role:'hardware'}]]),{printedFinish:false});
for(const state of [{base:'#00e5ff'},{base:'#ff2095'},JSON.parse(JSON.stringify({base:'#00e5ff'})),{}, {base:'#ff2095'},{}]){
 palette.setPalette(state);assert.equal(print.material.color.getHexString(),state.base?.slice(1)||'617383');assert.equal(hardware.material.color.getHexString(),'617383');
 for(const material of [print.material,hardware.material]){assert.equal(material.metalness,.53);assert.equal(material.roughness,.31);}
 assert.equal(shared.color.getHexString(),'617383');
}
console.log(JSON.stringify({passed:true,source_printed_leaves:printed,identity_mutations_rejected:rejected,purchased_siblings_preserved:true,transport_and_registration_gates:true,color_only_PBR_and_exact_native_reset:true,scope:'Source/transport contracts and adversarial material fixtures; execute audit_source_printed_colors.mjs for current public exports.'}));

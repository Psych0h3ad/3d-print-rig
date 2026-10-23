// Exact existing Yavoth v59 preview exports. This does not certify the author
// BOM, fastening, snap retention, source contact or physical fit.
import assert from 'node:assert/strict';
import {assertCowlMetadata,geometryBufferIdentity} from './yavoth-cowl-identity.mjs';
import {assertYavothSupportOmission} from './yavoth-support-omission.mjs';
const sourceExports={
  "head_print_yavoth_orbiter2_rapido2_hf_rear5": {
    "keys": [
      "head_print_yavoth_orbiter2_rapido2_hf_rear5_9",
      "head_print_yavoth_orbiter2_rapido2_hf_rear5_1",
      "head_print_yavoth_orbiter2_rapido2_hf_rear5_5"
    ]
  },
  "head_print_yavoth_orbiter2_rapido2_hf_standard": {
    "keys": [
      "head_print_yavoth_orbiter2_rapido2_hf_standard_7",
      "head_print_yavoth_orbiter2_rapido2_hf_standard_1",
      "head_print_yavoth_orbiter2_rapido2_hf_standard_5"
    ]
  },
  "head_print_yavoth_orbiter2_rapido2_uhf_rear5": {
    "keys": [
      "head_print_yavoth_orbiter2_rapido2_uhf_rear5_13",
      "head_print_yavoth_orbiter2_rapido2_uhf_rear5_2",
      "head_print_yavoth_orbiter2_rapido2_uhf_rear5_5"
    ]
  },
  "head_print_yavoth_orbiter2_rapido2_uhf_standard": {
    "keys": [
      "head_print_yavoth_orbiter2_rapido2_uhf_standard_11",
      "head_print_yavoth_orbiter2_rapido2_uhf_standard_2",
      "head_print_yavoth_orbiter2_rapido2_uhf_standard_5"
    ]
  },
  "head_print_yavoth_sherpa_mini_rapido2_hf_rear5": {
    "keys": [
      "head_print_yavoth_sherpa_mini_rapido2_hf_rear5_19",
      "head_print_yavoth_sherpa_mini_rapido2_hf_rear5_1",
      "head_print_yavoth_sherpa_mini_rapido2_hf_rear5_5"
    ]
  },
  "head_print_yavoth_sherpa_mini_rapido2_hf_standard": {
    "keys": [
      "head_print_yavoth_sherpa_mini_rapido2_hf_standard_17",
      "head_print_yavoth_sherpa_mini_rapido2_hf_standard_1",
      "head_print_yavoth_sherpa_mini_rapido2_hf_standard_5"
    ]
  },
  "head_print_yavoth_sherpa_mini_rapido2_uhf_rear5": {
    "keys": [
      "head_print_yavoth_sherpa_mini_rapido2_uhf_rear5_23",
      "head_print_yavoth_sherpa_mini_rapido2_uhf_rear5_2",
      "head_print_yavoth_sherpa_mini_rapido2_uhf_rear5_5"
    ]
  },
  "head_print_yavoth_sherpa_mini_rapido2_uhf_standard": {
    "keys": [
      "head_print_yavoth_sherpa_mini_rapido2_uhf_standard_21",
      "head_print_yavoth_sherpa_mini_rapido2_uhf_standard_2",
      "head_print_yavoth_sherpa_mini_rapido2_uhf_standard_5"
    ]
  },
  "yavoth59_carriage_6": {
    "keys": [
      "yavoth59_carriage_6_0"
    ]
  },
  "yavoth59_carriage_9": {
    "keys": [
      "yavoth59_carriage_9_0"
    ]
  },
  "yavoth59_fan2510": {
    "keys": [
      "yavoth59_fan2510_0"
    ]
  },
  "yavoth59_fans_hf": {
    "keys": [
      "yavoth59_fans_hf_40",
      "yavoth59_fans_hf_41"
    ]
  },
  "yavoth59_fans_uhf": {
    "keys": [
      "yavoth59_fans_uhf_40",
      "yavoth59_fans_uhf_41"
    ]
  },
  "yavoth59_orbiter2": {
    "keys": [
      "yavoth59_orbiter2_182",
      "yavoth59_orbiter2_183",
      "yavoth59_orbiter2_184",
      "yavoth59_orbiter2_185",
      "yavoth59_orbiter2_186",
      "yavoth59_orbiter2_187",
      "yavoth59_orbiter2_188",
      "yavoth59_orbiter2_189",
      "yavoth59_orbiter2_190",
      "yavoth59_orbiter2_191",
      "yavoth59_orbiter2_192",
      "yavoth59_orbiter2_193",
      "yavoth59_orbiter2_194",
      "yavoth59_orbiter2_195",
      "yavoth59_orbiter2_196",
      "yavoth59_orbiter2_197",
      "yavoth59_orbiter2_198",
      "yavoth59_orbiter2_199",
      "yavoth59_orbiter2_200",
      "yavoth59_orbiter2_201",
      "yavoth59_orbiter2_202",
      "yavoth59_orbiter2_203",
      "yavoth59_orbiter2_204",
      "yavoth59_orbiter2_205",
      "yavoth59_orbiter2_206",
      "yavoth59_orbiter2_207",
      "yavoth59_orbiter2_208",
      "yavoth59_orbiter2_209",
      "yavoth59_orbiter2_210",
      "yavoth59_orbiter2_211",
      "yavoth59_orbiter2_212",
      "yavoth59_orbiter2_213",
      "yavoth59_orbiter2_214",
      "yavoth59_orbiter2_215",
      "yavoth59_orbiter2_216",
      "yavoth59_orbiter2_217",
      "yavoth59_orbiter2_218",
      "yavoth59_orbiter2_219",
      "yavoth59_orbiter2_220",
      "yavoth59_orbiter2_221",
      "yavoth59_orbiter2_222",
      "yavoth59_orbiter2_223",
      "yavoth59_orbiter2_224",
      "yavoth59_orbiter2_225",
      "yavoth59_orbiter2_226",
      "yavoth59_orbiter2_227",
      "yavoth59_orbiter2_228",
      "yavoth59_orbiter2_229",
      "yavoth59_orbiter2_230",
      "yavoth59_orbiter2_231",
      "yavoth59_orbiter2_232",
      "yavoth59_orbiter2_233",
      "yavoth59_orbiter2_234",
      "yavoth59_orbiter2_235",
      "yavoth59_orbiter2_236",
      "yavoth59_orbiter2_237"
    ]
  },
  "yavoth59_rapido1_hf": {
    "keys": [
      "yavoth59_rapido1_hf_65",
      "yavoth59_rapido1_hf_66"
    ]
  },
  "yavoth59_rapido1_uhf": {
    "keys": [
      "yavoth59_rapido1_uhf_67",
      "yavoth59_rapido1_uhf_69",
      "yavoth59_rapido1_uhf_70",
      "yavoth59_rapido1_uhf_71",
      "yavoth59_rapido1_uhf_72",
      "yavoth59_rapido1_uhf_74",
      "yavoth59_rapido1_uhf_75",
      "yavoth59_rapido1_uhf_78",
      "yavoth59_rapido1_uhf_79",
      "yavoth59_rapido1_uhf_80",
      "yavoth59_rapido1_uhf_81",
      "yavoth59_rapido1_uhf_82",
      "yavoth59_rapido1_uhf_83",
      "yavoth59_rapido1_uhf_84",
      "yavoth59_rapido1_uhf_85",
      "yavoth59_rapido1_uhf_86"
    ]
  },
  "yavoth59_sherpa_mini": {
    "keys": [
      "yavoth59_sherpa_mini_0",
      "yavoth59_sherpa_mini_1",
      "yavoth59_sherpa_mini_2",
      "yavoth59_sherpa_mini_3",
      "yavoth59_sherpa_mini_4",
      "yavoth59_sherpa_mini_5",
      "yavoth59_sherpa_mini_6",
      "yavoth59_sherpa_mini_7",
      "yavoth59_sherpa_mini_8",
      "yavoth59_sherpa_mini_10",
      "yavoth59_sherpa_mini_11",
      "yavoth59_sherpa_mini_13",
      "yavoth59_sherpa_mini_14",
      "yavoth59_sherpa_mini_15",
      "yavoth59_sherpa_mini_16",
      "yavoth59_sherpa_mini_17",
      "yavoth59_sherpa_mini_18",
      "yavoth59_sherpa_mini_19",
      "yavoth59_sherpa_mini_20",
      "yavoth59_sherpa_mini_21",
      "yavoth59_sherpa_mini_22",
      "yavoth59_sherpa_mini_23",
      "yavoth59_sherpa_mini_24",
      "yavoth59_sherpa_mini_25",
      "yavoth59_sherpa_mini_26",
      "yavoth59_sherpa_mini_27",
      "yavoth59_sherpa_mini_28",
      "yavoth59_sherpa_mini_29",
      "yavoth59_sherpa_mini_30",
      "yavoth59_sherpa_mini_31"
    ]
  }
};
const correctCowlSources={
 head_print_yavoth_orbiter2_rapido2_uhf_rear5:{key:'12',name:'Yavoth_Cowl_UHF_5mm:1'},
 head_print_yavoth_sherpa_mini_rapido2_uhf_rear5:{key:'22',name:'Yavoth_Cowl_UHF_5mm (1):1'},
 head_print_yavoth_sherpa_micro_rapido2_uhf_rear5:{key:'32',name:'Yavoth_Cowl_UHF_5mm (2):1'}
};
export function yavothRequiredExportKeys(id){
 assert(sourceExports[id],'Yavoth unreviewed companion export '+id);
 return [...sourceExports[id].keys];
}
export function assertYavothCowlSource(v,assets){
 const base=v.base_asset||v.machine_head?.base,expected=correctCowlSources[base];if(!expected)return;
 const a=assets.find(([id,a])=>id===base&&a.root.visible)?.[1];assert(a,'Yavoth missing cowl source');
 assertCowlMetadata(base,a);
}
export function assertYavothExactExportedCompanions(v,assets,{validatedGeometry}={}){
 if(v.toolhead!=='yavoth'||!(v.hardware_assembled||/^yavoth59__/.test(v.source_head_configuration||v.id)))return;
 assertYavothCowlSource(v,assets);
 assert(['rapido1_hf','rapido1_uhf'].includes(v.hotend),'Yavoth assembled hotend source');
 const extruder={sherpa_r2_standard_short:'sherpa_mini',orbiter2:'orbiter2'}[v.extruder];
 assert(extruder,'Yavoth assembled extruder source');
 const length=v.hotend==='rapido1_uhf'?'uhf':'hf',rear=v.cooling==='rear5'?'rear5':'standard';
 assert(['source','rear5'].includes(v.cooling),'Yavoth cowl source');
 const base='head_print_yavoth_'+extruder+'_rapido2_'+length+'_'+rear;
 assert.equal(v.base_asset,base,'Yavoth source-specific cowl/LED holder');
 const expected=[base,'yavoth59_fan2510','yavoth59_fans_'+length,'yavoth59_'+extruder,'yavoth59_'+v.hotend,'yavoth59_carriage_'+v.belt_width_mm];
 const visible=assets.filter(([,a])=>a.root.visible);
 assert.deepEqual(visible.map(([id])=>id).sort(),[...expected].sort(),'Yavoth missing/obsolete module');
 for(const id of expected){
  const asset=visible.find(([key])=>key===id)[1],required=sourceExports[id]?.keys;
  assertYavothSupportOmission(id,asset);
  assert(required,'Yavoth unreviewed companion export '+id);
  assert.deepEqual(asset.entries.map(e=>String(e.key)).sort(),[...required].sort(),'Yavoth missing/duplicate source leaf '+id);
  for(const row of asset.entries){
   let attached=false;
   for(let o=row.mesh;o;o=o.parent){assert(o.visible,'Yavoth hidden required source leaf '+id+'/'+row.key);if(o===asset.root){attached=true;break;}}
   assert(attached,'Yavoth detached required source leaf '+id+'/'+row.key);
   assert(row.mesh.geometry?.attributes.position?.count>0,'Yavoth empty required source leaf '+id+'/'+row.key);
   if(!validatedGeometry?.has(row.mesh.geometry)){geometryBufferIdentity(row.mesh.geometry);validatedGeometry?.add(row.mesh.geometry);}
  }
 }
 const baseAsset=visible.find(([id])=>id===base)[1];
 for(const pattern of [/^LED_Holder(?:_UHF)?(?:[: (]|$)/,/^LED_Insert(?:[: (]|$)/]){
  const parts=baseAsset.meta.parts.filter(p=>pattern.test(p.name));
  assert.equal(parts.length,1,'Yavoth missing/duplicate original LED owner');
  assert.equal(baseAsset.entries.filter(e=>String(e.key)===String(parts[0].key)).length,1,'Yavoth duplicate LED mesh');
 }
}

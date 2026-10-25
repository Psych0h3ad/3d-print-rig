// Release gate: neither reviewed family may be omitted or silently skipped.
// Uses exactly the same explicit-path plan as audit_printed_color_leaks.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {GLTFLoader} from '../site/viewer/vendor-r180/GLTFLoader.js';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {auditPrintedColorLeaks} from './audit_printed_color_leaks.mjs';
import {assertPrintedColorSourceCoverage,assertPrintedColorSourceAsset,printedColorSourceContracts} from './printed-color-source-contracts.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function purchasedMaterialState(material){const json=material.toJSON();delete json.uuid;delete json.metadata;return {json,color:material.color.toArray()};}
export function assertPurchasedMaterialState(material,expected,label){assert.deepEqual(purchasedMaterialState(material),expected,label);}
async function auditHandleMaterials(plan){
 const spec=plan.assets.find(a=>a.id==='vzbot_330_printed'),contract=printedColorSourceContracts.vzbot_330_printed;
 async function checked(pin){const b=await fs.readFile(pin.path);assert.equal(sha(b),pin.sha256,'Changed actual handle input');return b;}
 const manifest=JSON.parse(await checked(spec.manifest)),profile=JSON.parse(await checked(spec.profile));
 let bytes=await checked(spec.model);if(spec.model.path.endsWith('.gz'))bytes=gunzipSync(bytes);
 assertPrintedColorSourceAsset(spec.id,spec.manifest.sha256,sha(bytes),manifest);
 const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;bytes=null;
 const printed=['00250','00253'],purchased=Object.keys(contract.purchased),wanted=new Set([...printed,...purchased]),slots=[];
 try{
  root.traverse(mesh=>{if(!mesh.isMesh)return;let n=mesh,key;while(n&&!key){key=n.userData?.part_key;n=n.parent;}if(!wanted.has(key))return;
   for(const [slot,material]of [].concat(mesh.material).entries())slots.push({key,slot,mesh,source:material,sourceState:purchasedMaterialState(material)});
  });
  assert.deepEqual([...new Set(slots.map(s=>s.key))].sort(),[...wanted].sort(),'Missing actual handle/bolt slots');
  const adapter=createCommunityAdapter(root,manifest,profile);
  for(const key of printed)assert.equal(adapter.records.get(key).appearance_role,'base');
  for(const key of purchased)assert.equal(adapter.records.get(key).appearance_role,'metal','Purchased bolt inherited printed role');
  for(const s of slots){s.material=[].concat(s.mesh.material)[s.slot];s.initial=purchasedMaterialState(s.material);
   if(purchased.includes(s.key))assertPurchasedMaterialState(s.material,s.sourceState,'Purchased bolt source PBR changed during setup '+s.key);
  }
  assert.equal(new Set(slots.map(s=>s.material)).size,slots.length,'Actual handle/bolt materials alias');
  const reference=Object.fromEntries(Object.keys(profile.axes).map(a=>[a,0])),forward=[reference];
  for(const [axis,[lo,hi]]of Object.entries(profile.axes))for(const value of [lo,(lo+hi)/2,hi])forward.push({...reference,[axis]:value});
  const poses=[...forward,...forward.toReversed(),reference];
  const a={base:'#00e5ff',accent:'#ff2095',frame:'#b9bec4'},b={base:a.accent,accent:a.base,frame:'#202326'};
  const palettes=[a,b,JSON.parse(JSON.stringify(a)),profile.palette_defaults,{},b,{}],observations=[];let checks=0,negativeAssertions=0;
  for(const palette of palettes){
   adapter.setPalette(palette);
   for(const pose of poses){adapter.setAxes(pose);
    for(const s of slots){
     const actual=[].concat(s.mesh.material)[s.slot];
     if(purchased.includes(s.key))assertPurchasedMaterialState(actual,s.initial,'Actual purchased bolt material changed '+s.key);
     else assert(actual.color.equals(palette.base?new THREE.Color(palette.base):new THREE.Color().fromArray(s.initial.color)),'Actual printed handle did not follow/reset '+s.key);
     checks++;
    }
   }
   observations.push({palette,slots:slots.map(s=>({key:s.key,slot:s.slot,role:adapter.records.get(s.key).appearance_role,color:'#'+s.material.color.getHexString()}))});
  }
  adapter.setAxes(reference);adapter.setPalette({});
  // Negative assertions mutate the two real exported bolt slots, not fixtures
  // or detached palette rows. Restore each property immediately after rejection.
  for(const s of slots.filter(s=>purchased.includes(s.key))){
   const color=s.material.color.clone(),metalness=s.material.metalness;
   s.material.color.set('#ff00cc');assert.throws(()=>assertPurchasedMaterialState(s.material,s.initial,'Recolored actual bolt'));negativeAssertions++;s.material.color.copy(color);
   s.material.metalness=metalness===0?1:0;assert.throws(()=>assertPurchasedMaterialState(s.material,s.initial,'Changed actual bolt PBR'));negativeAssertions++;s.material.metalness=metalness;
   assertPurchasedMaterialState(s.material,s.initial,'Actual purchased bolt native reset');
  }
  for(const s of slots){assertPurchasedMaterialState(s.source,s.sourceState,'Shared source material changed');assertPurchasedMaterialState(s.material,s.initial,'Actual handle/bolt source reset');}
  return {passed:true,machine:spec.id,source_revision:contract.source_revision,manifest_sha256:spec.manifest.sha256,model_stored_sha256:spec.model.sha256,model_sha256:contract.model_sha256,
   printed_keys:printed,purchased_keys:purchased,purchased_source_materials:slots.filter(s=>purchased.includes(s.key)).map(s=>({key:s.key,slot:s.slot,state:s.sourceState})),material_slots:slots.length,poses_per_palette:poses.length,palettes:palettes.length,attached_material_checks:checks,negative_assertions:negativeAssertions,purchased_PBR_preserved:true,exact_source_color_reset:true,observations};
 }finally{root.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of [].concat(m.material))material.dispose();}});globalThis.gc?.();}
}
export async function auditSourcePrintedColors(plan,reportPath){
 assertPrintedColorSourceCoverage(plan.assets);
 const report=await auditPrintedColorLeaks(plan,reportPath);
 report.source_printed_leaf_count=15;
 report.scope+=' Source gate includes ten VzBot printed leaves (eight endcaps and two handles), five Crossant leaves and actual-material negative checks for purchased bolts 00251/00252.';
 if(report.passed)try{report.source_handle_materials=await auditHandleMaterials(plan);}catch(error){report.passed=false;report.failures.push({id:'vzbot_handle_purchased_materials',message:error.message});}
 if(reportPath)await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await auditSourcePrintedColors(JSON.parse(await fs.readFile(process.argv[2],'utf8')),process.argv[3]);
 process.exitCode=report.passed?0:1;
}

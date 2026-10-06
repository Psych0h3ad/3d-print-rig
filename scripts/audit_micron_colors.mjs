// Actual source identity and material audit; pass the current assembled site.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import * as THREE from 'three';import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';import {createMicronAdapter} from '../site/viewer/micron-adapter.mjs';
import {micronHardwareColors} from '../site/viewer/micron-native-materials.mjs';
const root=path.resolve(process.argv[2]),results=[];globalThis.ProgressEvent=class{constructor(type,fields){Object.assign(this,{type},fields)}};
for(const id of ['micron_r1_120','micron_plus_r1_180']){
 const dir=path.join(root,'machines',id),read=async n=>JSON.parse(await fs.readFile(path.join(dir,n),'utf8')),manifest=await read('assembly_manifest.json'),profile=await read('machine_profile.json'),raw=gunzipSync(await fs.readFile(path.join(dir,'model.glb.gz')));
 const {scene}=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');const adapter=createMicronAdapter(scene,manifest,profile);let missingPrinted=0,protectedHardware=0;
 for(const r of manifest.parts){const p=r.source.assembly_path.join('/'),role=adapter.records.get(r.key).appearance_role;
  if(/CenterPanelClip|CornerPanelClip|reverseBowdenEntry|64T Front Pulley Gear/.test(p)&&['SOLID','COMPOUND'].includes(r.name)){assert(role,id+'/'+r.key+' omitted printed leaf');missingPrinted++;}
  if((/^(?:M\d+(?:\b|x|_)|MGN\d|Nema|36STH)/i.test(r.name)&&!/^Nema\d+_Motor_Mount|^M2_Hex_Adapter/.test(r.name))||/ECAS_Fitting|KGLM-3 Spherical Bearing|Meanwell-UHP-200-24|JR Mains Inlet/.test(p)){assert.equal(role,null,id+'/'+r.key+' incorrectly printed hardware');protectedHardware++;}
  if(/^Nema\d+_Motor_Mount|^M2_Hex_Adapter/.test(r.name))assert.equal(role,'base',id+'/'+r.key+' printed mount omitted');
 }
 const native=micronHardwareColors[id];for(const [key,expected]of Object.entries(native)){const materials=adapter.paletteMaterials.filter(r=>r.key===key);assert(materials.length);for(const r of materials){assert.equal(r.role,null);assert.deepEqual(r.original.toArray(),expected.color_linear);assert.equal(r.material.metalness,.65);}}
 const palettes=[profile.appearance.palette_defaults,{base:'#19ccaa',accent:'#ff7700',frame:'#c0c5cc'},{base:'#8040ff',accent:'#ccff22',frame:'#202326'},profile.appearance.palette_defaults,{}];
 const ref=profile.display_reference_xyz_mm,poses=[ref,...[0,1,2].flatMap(i=>[profile.display_limits_mm['XYZ'[i]][0],profile.display_limits_mm['XYZ'[i]][1],ref[i]].map(v=>ref.map((x,j)=>j===i?v:x)))];
 for(const palette of palettes){adapter.setPalette(palette);for(const xyz of poses){adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,xyz[i]])));for(const r of adapter.paletteMaterials){assert(r.material.color.equals(r.role&&palette[r.role]?new THREE.Color(palette[r.role]):r.original),id+'/'+r.key);if(!r.role){assert.equal(r.material.metalness,r.metalness);assert.equal(r.material.roughness,r.roughness)}else if(['base','accent'].includes(r.role)){assert.equal(r.material.metalness,0);assert.equal(r.material.roughness,.72)}}}}
 adapter.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,ref[i]])));adapter.setPalette({});assert(adapter.paletteMaterials.every(r=>r.material.color.equals(r.original)));
 results.push({id,model_sha256:createHash('sha256').update(raw).digest('hex'),manifest_sha256:createHash('sha256').update(await fs.readFile(path.join(dir,'assembly_manifest.json'))).digest('hex'),parts:manifest.parts.length,materials:adapter.paletteMaterials.length,native_hardware_materials_restored:Object.keys(native).length,printed_alias_leaves_checked:missingPrinted,hardware_identities_checked:protectedHardware,palette_transitions:palettes.length,poses_per_palette:poses.length,roles:manifest.parts.reduce((s,p)=>{const k=adapter.records.get(p.key).appearance_role||'protected';s[k]=(s[k]||0)+1;return s},{})});
 scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of [].concat(n.material))m.dispose()}});globalThis.gc?.();
}
const report={all_passed:true,scope:'Actual Micron 120 / Plus GLB parts: source alias coverage, printed palette and purchased hardware isolation, independent materials, all-axis endpoint/reverse/reference color retention and original-material reset. Mechanical clearance and GPU screenshots are separate.',results};
if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

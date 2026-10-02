// Actual GLB/material verification for all six published V2.4 size/structure pairs.
// node --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_v24_colors.mjs ASSETS
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createV24Adapter} from '../site/viewer/v24_matrix_adapter.mjs';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
const root=path.resolve(process.argv[2]);
const read=async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'));
const report=[];
for(const size of [250,300,350])for(const structure of ['printed','ldo_cnc']){
 const machine=`voron_v24_${size}_${structure}`,dir=`machines/${machine}`;
 const manifest=await read(`${dir}/assembly_manifest.json`),profile=await read(`${dir}/machine_profile.json`);
 let raw;try{raw=await fs.readFile(path.join(root,dir,'model.glb'))}catch{raw=gunzipSync(await fs.readFile(path.join(root,dir,'model.glb.gz')))}
 const {scene}=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 const records=new Map(manifest.parts.map(p=>[p.key,p])),materials=[];
 scene.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();let parent=o,key;while(parent&&!key){key=parent.userData.part_key;parent=parent.parent}assert(records.has(key));for(const material of Array.isArray(o.material)?o.material:[o.material])materials.push({material,row:records.get(key),original:material.color.clone()})});
 const adapter=createV24Adapter(scene,manifest,profile);
 for(const palette of [{base:'#2dd4bf',accent:'#ff6b20',frame:'#b9bec4'},{base:'#703cff',accent:'#a1ef20',frame:'#303030'}]){
  adapter.setPalette(palette);
  for(const r of materials){const role=appearanceRole(r.row);assert(r.material.color.equals(role?new THREE.Color(palette[role]):r.original),`${machine}: ${r.row.key} ${r.row.name}`)}
 }
 // Source identities absent from the old exporter, including repeated suffixes.
 for(const p of manifest.parts.filter(p=>/^v24_/.test(p.key)&&/^(Front Idler [AB] (Top|Bottom)|Z (Bearing Block|Belt Clamp|Belt Drive)|Belt Tensioner|Belt_Guard|Door Handle [AB]|PSU_Stabilizer|Middle_Fan_Support_|bottom_panel_hinge_x2|Bowden Tube Holder)/.test(p.name)))assert(appearanceRole(p),p.key+' missing printed classification');
 for(const r of materials)r.material.color.copy(r.original);
 for(const r of materials)assert(r.material.color.equals(r.original));
 const counts={};for(const p of manifest.parts){const role=appearanceRole(p)||'protected';counts[role]=(counts[role]||0)+1}
 report.push({machine,parts:manifest.parts.length,materials:materials.length,counts});
 scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});
}
console.log(JSON.stringify({passed:true,machines:report},null,2));

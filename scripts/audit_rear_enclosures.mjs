// Audit the shipped GLB, in addition to the separately pinned native-solid proof.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]);const read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
const proof=await read('REAR_ENCLOSURE_QA.json'),bundle=await read('ASSET_BUNDLE.json');assert.equal(proof.model_bundle_sha256,bundle.sha256);
const results=[];
for(const row of [...proof.trident.machines,...proof.v24.machines]){
 const id=row.machine_id,folder='machines/'+id,relative=id==='siboor_trident_350'?'SIBOOR_Trident_350.glb.gz':folder+'/model.glb.gz';
 const raw=gunzipSync(await fs.readFile(path.join(root,relative)));assert.equal(createHash('sha256').update(raw).digest('hex'),row.model_sha256,id+' native-proof identity');
 const n=raw.readUInt32LE(12),data=JSON.parse(raw.subarray(20,20+n)),binary=raw.subarray(28+n),parts=[];
 const coordinates=i=>{const a=data.accessors[i],v=data.bufferViews[a.bufferView];assert.equal(a.componentType,5126);const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||12;return Array.from({length:a.count},(_,k)=>[rawFloat(offset+k*stride),-rawFloat(offset+k*stride+8),rawFloat(offset+k*stride+4)]);};
 const rawFloat=i=>binary.readFloatLE(i)*1000;
 for(const p of row.native_parts||[]){
  const node=data.nodes.find(n=>(n.extras?.part_key||n.name)===p.key);assert(node&&Number.isInteger(node.mesh));const vertices=data.meshes[node.mesh].primitives.flatMap(p=>coordinates(p.attributes.POSITION));assert(vertices.flat().every(Number.isFinite));
  const thickness=Math.max(...vertices.map(v=>v[1]))-Math.min(...vertices.map(v=>v[1]));assert(Math.abs(thickness-3)<.002||/01206$/.test(p.key)&&Math.abs(thickness-1)<.002,p.key+' native sheet thickness');
  if(/(?:1219|01207)$/.test(p.key)){
   const top=Math.max(...vertices.map(v=>v[2])),edge=vertices.filter(v=>Math.abs(v[0])<100&&v[2]>top-40);assert(edge.length>0,p.key+' native exhaust edges');
   // 147 mm straight sides, 2 mm rounded returns on each side: 151 mm mouth.
   const width=Math.max(...edge.map(v=>v[0]))-Math.min(...edge.map(v=>v[0]));assert(Math.abs(width-151)<.2,id+' exhaust notch was stretched: '+width);
   parts.push({key:p.key,exhaust_notch_width_mm:width,thickness_mm:thickness});
  }else parts.push({key:p.key,thickness_mm:thickness});
 }
 results.push({machine_id:id,model_sha256:row.model_sha256,parts,unchanged_native_reference:row.geometry_changed===false});
}
const result={all_passed:true,machines:results,scope:'Actual shipped model identity and rear panel/foam positions, native exhaust notch width and thickness. Native-solid interference evidence is in REAR_ENCLOSURE_QA.json; rendering and full printer clearance are separate.'};
if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseSharedComponentGlb,sharedGlbDocument} from '../site/viewer/shared-component-glb.mjs';
// Resolve the browser import map to the same vendored modules in Node.
const three=new URL('../site/viewer/vendor/three.module.js',import.meta.url).href;
const utilsSource=fs.readFileSync(new URL('../site/viewer/vendor/BufferGeometryUtils.js',import.meta.url),'utf8').replaceAll("from 'three'",`from '${three}'`);
const utils='data:text/javascript;base64,'+Buffer.from(utilsSource).toString('base64');
const loaderSource=fs.readFileSync(new URL('../site/viewer/vendor/GLTFLoader.js',import.meta.url),'utf8').replaceAll("from 'three'",`from '${three}'`).replaceAll("from './BufferGeometryUtils.js'",`from '${utils}'`);
const {GLTFLoader}=await import('data:text/javascript;base64,'+Buffer.from(loaderSource).toString('base64'));

export function fixture(edit=()=>{}){
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'native_part',translation:[1,2,3],extras:{part_key:'native_1'}}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},mode:4,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.3,.4,1],metallicFactor:.6,roughnessFactor:.7}}],
  buffers:[{byteLength:72}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'}]};
 edit(json);let text=JSON.stringify(json);text+=' '.repeat((4-text.length%4)%4);const data=new Uint8Array(28+text.length+72),v=new DataView(data.buffer);
 [0x46546c67,2,data.length,text.length,0x4e4f534a].forEach((n,i)=>v.setUint32(i*4,n,true));data.set(new TextEncoder().encode(text),20);v.setUint32(20+text.length,72,true);v.setUint32(24+text.length,0x004e4942,true);
 new Float32Array(data.buffer,28+text.length).set([0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0,0,1]);return data;
}
export function fingerprint(gltf){
 const rows=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(n=>{if(!n.isMesh)return;const g=n.geometry,attributes={};
  for(const [name,a]of Object.entries(g.attributes))attributes[name]={count:a.count,itemSize:a.itemSize,normalized:a.normalized,sha256:crypto.createHash('sha256').update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')};
  const a=g.index;rows.push({name:n.name,key:n.userData.part_key,world:n.matrixWorld.elements,attributes,index:a?crypto.createHash('sha256').update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex'):null,
   material:{color:n.material.color.toArray(),metalness:n.material.metalness,roughness:n.material.roughness,opacity:n.material.opacity,side:n.material.side},triangles:(a?.count??g.attributes.position.count)/3});});return rows;
}
async function run(){
 const modelArg=process.argv.indexOf('--model');
 if(modelArg>=0){
  const file=fs.readFileSync(process.argv[modelArg+1]),bytes=new Uint8Array(file.buffer,file.byteOffset,file.byteLength),standard=process.argv.includes('--standard'),start=process.memoryUsage();
  const gltf=standard?await new GLTFLoader().parseAsync(bytes.buffer,''):await parseSharedComponentGlb(new GLTFLoader(),bytes,'');
  const rows=fingerprint(gltf),buffers=new Set();gltf.scene.traverse(n=>{if(!n.isMesh)return;for(const a of [...Object.values(n.geometry.attributes),n.geometry.index].filter(Boolean))buffers.add(a.array.buffer)});
  if(!standard)assert.deepEqual([...buffers],[bytes.buffer],'CAD arrays were copied');
  const report={passed:true,mode:standard?'standard':'shared',model_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),model_bytes:bytes.length,render_meshes:rows.length,
   triangles:rows.reduce((s,r)=>s+r.triangles,0),array_buffers:buffers.size,retained_array_buffer_bytes:[...buffers].reduce((s,b)=>s+b.byteLength,0),process_memory:{start,end:process.memoryUsage()},rows,
   scope:'Exact parsed geometry, transforms, material semantics and CPU array sharing. No iPhone runtime or native fit certification.'};
  const reportArg=process.argv.indexOf('--report');if(reportArg>=0)fs.writeFileSync(process.argv[reportArg+1],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined}));return;
 }
 const bytes=fixture(),loader=new GLTFLoader(),before=loader.pluginCallbacks.length;
 const shared=await parseSharedComponentGlb(loader,bytes,''),standard=await new GLTFLoader().parseAsync(bytes.buffer,'');assert.deepEqual(fingerprint(shared),fingerprint(standard));assert.equal(loader.pluginCallbacks.length,before);
 assert.equal(shared.scene.children[0].geometry.attributes.position.array.buffer,bytes.buffer);
 // Subsequent ordinary assets must still use GLTFLoader's default parser.
 const next=await loader.parseAsync(bytes.buffer,'');assert.notEqual(next.scene.children[0].geometry.attributes.position.array.buffer,bytes.buffer);assert.deepEqual(fingerprint(next),fingerprint(standard));
 let rejected=0;for(const edit of [j=>j.buffers[0].uri='bad.bin',j=>j.bufferViews[0].byteLength=4,j=>j.bufferViews[0].byteOffset=-4,j=>j.bufferViews[0].byteStride=12,j=>j.accessors[0].count=1e9,j=>j.accessors[0].sparse={},j=>j.images=[{}],j=>j.skins=[{}],j=>j.animations=[{}],j=>j.extensionsUsed=['KHR_draco_mesh_compression'],j=>j.meshes[0].primitives[0].targets=[{}],j=>j.meshes[0].primitives[0].mode=1]){assert.throws(()=>sharedGlbDocument(fixture(edit)));rejected++}
 const bad=bytes.slice();new DataView(bad.buffer).setUint32(8,0,true);assert.throws(()=>sharedGlbDocument(bad));rejected++;
 console.log(JSON.stringify({passed:true,exact_geometry_transform_material_semantics:true,shared_cpu_buffer:true,subsequent_normal_parse:true,rejections:rejected}));
}
export {GLTFLoader};
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').toLowerCase()===process.argv[1].replaceAll('\\','/').toLowerCase())await run();

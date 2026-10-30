import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--site','--cache-dir','--report'].includes(args[i])&&args[i+1]&&!options[args[i]],'Invalid audit arguments');options[args[i]]=path.resolve(args[i+1]);}
const site=options['--site']??fileURLToPath(new URL('../site/',import.meta.url)),imp=p=>import(pathToFileURL(path.join(site,p)));
const T=await imp('viewer/vendor-r180/three.module.js'),{GLTFLoader}=await imp('viewer/vendor-r180/GLTFLoader.js');
const B=await imp('layout/layout-biqu-popstation.mjs'),{createEquipmentMeshCache}=await imp('layout/layout-equipment-mesh.mjs');
const {BIQU_FINISH_LEAVES,BIQU_FINISH_STYLES}=await imp('layout/layout-biqu-appearance.mjs');
const {createLayoutEquipmentLoader}=await imp('layout/layout-machine-loader.mjs'),transport=await imp('layout/layout-equipment-transfer.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function bytes(ref,preview=false){
 if(options['--cache-dir']){const b=fs.readFileSync(path.join(options['--cache-dir'],path.basename(ref.path)));assert.equal(b.length,ref.bytes);assert.equal(sha(b),ref.sha256);return b;}
 return preview?new TextEncoder().encode(JSON.stringify(await transport.downloadEquipmentPreviewGeometry(ref))):transport.downloadEquipmentModel(ref);
}
const raw=await bytes(B.BIQU_POPSTATION_MODEL);let before;
function snapshot(root){root.updateMatrixWorld(true);const rows=[];root.traverse(n=>{if(n.isMesh)rows.push({index:n.userData.source_instance_index,visible:n.visible,matrix:n.matrix.toArray(),position:sha(Buffer.from(n.geometry.attributes.position.array.buffer,n.geometry.attributes.position.array.byteOffset,n.geometry.attributes.position.array.byteLength)),indices:sha(Buffer.from(n.geometry.index.array.buffer,n.geometry.index.array.byteOffset,n.geometry.index.array.byteLength))});});return rows;}
const loader=createLayoutEquipmentLoader({download:async()=>raw,parse:async body=>{const view=body instanceof ArrayBuffer?new Uint8Array(body):body;const array=view.buffer.slice(view.byteOffset,view.byteOffset+view.byteLength);const gltf=await new GLTFLoader().parseAsync(array,'');before=snapshot(gltf.scene);return gltf;},delegate:()=>{throw Error('Unexpected model delegation');}});
const lease=await loader(B.BIQU_POPSTATION_CAD.id,{equipmentVariant:'supplied'});assert.deepEqual(snapshot(lease.root),before);assert.equal(before.length,70);
const biased=[];lease.root.traverse(n=>{if(n.isMesh&&n.material.polygonOffset)biased.push(n.userData.source_instance_index);});assert.deepEqual(biased,[53,54]);
const finishes=[];lease.root.traverse(n=>{if(!n.isMesh)return;const index=n.userData.source_instance_index,role=BIQU_FINISH_LEAVES[index][3],style=BIQU_FINISH_STYLES[role],m=n.material;
 if(role!=='unassigned'){assert.equal(m.color.getHexString(),style.color.slice(1));assert.equal(m.opacity,style.opacity);assert.equal(m.metalness,style.metalness);assert.equal(m.depthWrite,style.opacity===1)}
 else{assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert.equal(m.metalness,0)}
 finishes.push({index,role,color:m.color.getHexString(),opacity:m.opacity,metalness:m.metalness});});
assert.equal(finishes.find(p=>p.index===69).color,'eeede8');assert.equal(finishes.find(p=>p.index===30).color,'1c1e22');assert.equal(finishes.find(p=>p.index===29).opacity,.3);
assert.equal(lease.source.category,'manufacturer-layout-equipment');assert.equal(lease.source.manufacturerCAD,true);assert.equal(lease.source.displayPolicy.id,'biqu-source-surface-depth-v1');
let doc;
if(options['--cache-dir'])doc=JSON.parse((await bytes(B.BIQU_POPSTATION_PREVIEW)).toString('utf8'));
else doc=await transport.downloadEquipmentPreviewGeometry(B.BIQU_POPSTATION_PREVIEW);
const part=await B.validateBiquPreview(doc),cache=createEquipmentMeshCache(T),geometry=cache.get(part);
const pg=geometry.attributes.position.array,ix=geometry.index.array;
assert.equal(sha(Buffer.from(pg.buffer,pg.byteOffset,pg.byteLength)),B.BIQU_POPSTATION_PREVIEW.arrays.positionsM.sha256);
assert.equal(sha(Buffer.from(new Uint32Array(part.indices).buffer)),B.BIQU_POPSTATION_PREVIEW.arrays.indices.sha256);
assert.equal(sha(Buffer.from(geometry.attributes.normal.array.buffer)),B.BIQU_POPSTATION_PREVIEW.arrays.normals.sha256);
// Independently compare the complete oriented triangle multisets. Material
// sorting may neither reverse, replace, duplicate nor drop a source triangle.
const triangles=new Map();for(let i=0;i<part.indices.length;i+=3){const key=part.indices.slice(i,i+3).join(',');triangles.set(key,(triangles.get(key)||0)+1)}
for(let i=0;i<ix.length;i+=3){const key=Array.from(ix.subarray(i,i+3)).join(','),count=triangles.get(key);assert(count>0,'Changed or reversed source triangle');if(count===1)triangles.delete(key);else triangles.set(key,count-1)}assert.equal(triangles.size,0);
assert.equal(geometry.groups.length,4);assert.equal(geometry.groups.reduce((n,g)=>n+g.count,0),part.indices.length);
const colors=geometry.getAttribute('color');assert.equal(colors.array.byteLength,239472);assert.equal(colors.normalized,true);
for(const leaf of part.sourceLeaves){const role=BIQU_FINISH_LEAVES[leaf.sourceInstanceIndex][3],rgb=new T.Color(BIQU_FINISH_STYLES[role].color).toArray().map(v=>Math.round(v*255));for(let v=leaf.vertexOffset;v<leaf.vertexOffset+leaf.vertexCount;v++)for(let c=0;c<3;c++)assert.equal(colors.array[v*3+c],rgb[c]);}
const material=new T.MeshStandardMaterial({color:part.color,side:T.DoubleSide}),materials=cache.displayMaterials(part,material);
assert.equal(materials.length,4);assert.equal(materials[0].polygonOffset,false);assert.equal(materials[3].polygonOffset,true);assert.equal(materials[1].metalness,.72);assert.equal(materials[2].opacity,.3);assert.equal(materials[2].depthWrite,false);assert(materials.every(m=>m.vertexColors&&m.color.getHexString()==='ffffff'));
const result={passed:true,sourceModelSHA256:B.BIQU_POPSTATION_MODEL.sha256,fullOccurrences:70,fullFinishes:finishes,fullBiasedOccurrences:biased,allGeometryMatricesVisibilityUnchanged:true,mergedPreviewTriangles:ix.length/3,previewDrawGroups:geometry.groups,previewPositionNormalBuffersUnchanged:true,allOrientedSourceTrianglesRetained:true,previewColorBytes:239472,scope:'Actual GLTFLoader and equipment consumer, official-photo display finishes and PC transparency. One shared preview geometry/four material groups, original vertices/normals/all oriented triangles retained. Unconfirmed interiors remain neutral; not a physical material or native fit specification.'};
lease.dispose();cache.dispose();material.dispose();
if(options['--report'])fs.writeFileSync(options['--report'],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

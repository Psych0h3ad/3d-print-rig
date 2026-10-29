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
assert.equal(lease.source.category,'manufacturer-layout-equipment');assert.equal(lease.source.manufacturerCAD,true);assert.equal(lease.source.displayPolicy.id,'biqu-source-surface-depth-v1');
let doc;
if(options['--cache-dir'])doc=JSON.parse((await bytes(B.BIQU_POPSTATION_PREVIEW)).toString('utf8'));
else doc=await transport.downloadEquipmentPreviewGeometry(B.BIQU_POPSTATION_PREVIEW);
const part=await B.validateBiquPreview(doc),cache=createEquipmentMeshCache(T),geometry=cache.get(part);
const pg=geometry.attributes.position.array,ix=geometry.index.array;
assert.equal(sha(Buffer.from(pg.buffer,pg.byteOffset,pg.byteLength)),B.BIQU_POPSTATION_PREVIEW.arrays.positionsM.sha256);
assert.equal(sha(Buffer.from(ix.buffer,ix.byteOffset,ix.byteLength)),B.BIQU_POPSTATION_PREVIEW.arrays.indices.sha256);
assert.deepEqual(geometry.groups,[{start:0,count:145452,materialIndex:0},{start:145452,count:7104,materialIndex:1},{start:152556,count:93588,materialIndex:0}]);
const material=new T.MeshStandardMaterial({color:part.color,side:T.DoubleSide}),materials=cache.displayMaterials(part,material);
assert.equal(materials.length,2);assert.equal(materials[0].polygonOffset,false);assert.equal(materials[1].polygonOffset,true);assert(materials[0].color.equals(materials[1].color));
const result={passed:true,sourceModelSHA256:B.BIQU_POPSTATION_MODEL.sha256,fullOccurrences:70,fullBiasedOccurrences:biased,allGeometryMatricesVisibilityUnchanged:true,mergedPreviewTriangles:ix.length/3,previewDrawGroups:geometry.groups,previewBuffersUnchanged:true,scope:'Actual GLTFLoader and equipment consumer; deterministic raster-depth display for authored coincident sheets. No geometry displacement or physical fit certification.'};
lease.dispose();cache.dispose();material.dispose();
if(options['--report'])fs.writeFileSync(options['--report'],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

// Exercise the exact renderer override caller with real Three resources.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createEquipmentMeshCache} from '../site/layout/layout-equipment-mesh.mjs';
import {BIQU_POPSTATION_PREVIEW} from '../site/layout/layout-biqu-popstation.mjs';
const source=fs.readFileSync(new URL('../site/layout/layout-renderer.mjs',import.meta.url),'utf8'),start=source.indexOf('  function previewPart('),end=source.indexOf('  function isPlan(',start);assert(start>=0&&end>start);
const leaves=JSON.parse(fs.readFileSync(new URL('./fixtures/biqu-preview-leaves.json',import.meta.url),'utf8')),indices=new Array(246144);
for(const leaf of leaves)for(let i=leaf.indexOffset;i<leaf.indexOffset+leaf.indexCount;i++)indices[i]=leaf.vertexOffset+(i-leaf.indexOffset)%leaf.vertexCount;
const part={shape:'mesh',geometryId:BIQU_POPSTATION_PREVIEW.geometryId,sourceLeaves:leaves,positionsM:new Array(79824*3).fill(0),normals:new Array(79824*3).fill(0),indices,doubleSided:true,color:'#eeede8'},cache=createEquipmentMeshCache(THREE);
const real=new THREE.MeshStandardMaterial(),ghost=new THREE.MeshBasicMaterial({color:'#21a795',transparent:true,opacity:.4,depthWrite:false}),countDispose=m=>{let n=0;m.addEventListener('dispose',()=>n++);return ()=>n;},ghostDisposals=countDispose(ghost),realDisposals=countDispose(real);
const call=vm.runInNewContext(source.slice(start,end)+';previewPart',{THREE,equipmentMeshCache:cache,material:()=>real});
const standalone=new THREE.Group(),group=new THREE.Group(),groupMember=new THREE.Group();group.add(groupMember);
call(standalone,part,ghost);call(groupMember,part,ghost);const meshes=[standalone.children[0],groupMember.children[0]];assert.strictEqual(meshes[0].geometry,meshes[1].geometry);
for(const color of ['#21a795','#df4a45','#21a795']){ghost.color.set(color);for(const mesh of meshes){assert.equal(mesh.material.length,4);for(const m of mesh.material){assert.strictEqual(m,ghost);assert.equal(m.color.getHexString(),color.slice(1));assert.equal(m.opacity,.4);assert.equal(m.transparent,true);assert.equal(m.depthWrite,false);assert.equal(m.vertexColors,false)}}}
const owned=cache.displayMaterials(part,real),ownedDisposals=owned.map(countDispose);assert(owned.every(m=>m!==real&&m!==ghost));assert.equal(owned[2].opacity,.3);
cache.dispose();cache.dispose();assert.equal(ghostDisposals(),0);assert.equal(realDisposals(),0);assert(ownedDisposals.every(c=>c()===1));real.dispose();ghost.dispose();
console.log(JSON.stringify({passed:true,scopes:['actual previewPart caller','standalone placement','group member placement','green-red-green','transparent depth policy','caller-owned material lifetime'],sourceFixturesOnly:true,nativeFitCertified:false}));

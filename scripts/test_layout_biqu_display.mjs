import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import * as T from '../site/viewer/vendor-r180/three.module.js';
import {BIQU_POPSTATION_CAD,BIQU_POPSTATION_PREVIEW} from '../site/layout/layout-biqu-popstation.mjs';
import {BIQU_FINISH_LEAVES,BIQU_FINISH_STYLES} from '../site/layout/layout-biqu-appearance.mjs';
import {configureBiquPreviewGroups,createBiquLayerMaterial,createBiquPreviewMaterials,applyBiquSurfaceDisplay} from '../site/layout/layout-biqu-display.mjs';
const {resolve}=await import('./layout-built-three-loader.mjs');
assert.deepEqual(await resolve('three',{parentURL:'file:///assembled/viewer/vendor-r180/GLTFLoader.js'},()=>{throw Error('Wrong module namespace')}),{url:'file:///assembled/viewer/vendor-r180/three.module.js',shortCircuit:true});
const mat=new T.MeshStandardMaterial({color:'#adadad',side:T.DoubleSide}),g=new T.BoxGeometry();
function scene(){const root=new T.Group();for(const [i,definition,instance]of BIQU_FINISH_LEAVES){const n=new T.Mesh(g,mat);n.userData={source_instance_index:i,source_definition_label:definition,source_instance_label:instance};n.position.set(i/100,0,0);root.add(n)}root.updateMatrixWorld(true);return root;}
const root=scene(),before=root.children.map(n=>({geometry:n.geometry,matrix:n.matrix.toArray(),visible:n.visible,material:n.material}));
assert.equal(applyBiquSurfaceDisplay(root,{id:'other'}),null);
assert.throws(()=>applyBiquSurfaceDisplay(scene(),{...BIQU_POPSTATION_CAD,model:{sha256:'0'.repeat(64)}}),/Unreviewed/);
for(const mutate of [r=>r.children[0].userData.source_instance_index=1,r=>r.children[0].visible=false,r=>r.children[29].userData.source_definition_label='other',r=>r.children[69].userData.source_instance_label='other'])assert.throws(()=>{const r=scene();mutate(r);applyBiquSurfaceDisplay(r,BIQU_POPSTATION_CAD)},/Missing|identity/);
const policy=applyBiquSurfaceDisplay(root,BIQU_POPSTATION_CAD);assert.deepEqual(policy.sourceInstances,[53,54]);assert.equal(policy.appearance,'biqu-photo-finish-v1');
for(const [i,n]of root.children.entries()){
 assert.strictEqual(n.geometry,before[i].geometry);assert.deepEqual(n.matrix.toArray(),before[i].matrix);assert.equal(n.visible,true);
 const role=BIQU_FINISH_LEAVES[i][3],style=BIQU_FINISH_STYLES[role];
 if(role==='unassigned')assert.strictEqual(n.material,mat);else{assert.notStrictEqual(n.material,mat);assert.equal(n.material.color.getHexString(),style.color.slice(1));assert.equal(n.material.opacity,style.opacity);assert.equal(n.material.metalness,style.metalness)}
 assert.equal(n.material.polygonOffset,i===53||i===54);
}
assert.equal(root.children[29].material.transparent,true);assert.equal(root.children[29].material.depthWrite,false);assert.equal(root.children[30].material.color.getHexString(),'1c1e22');assert.equal(root.children[69].material.color.getHexString(),'eeede8');assert.equal(mat.polygonOffset,false);assert.equal(mat.vertexColors,false);
const leaves=JSON.parse(fs.readFileSync(new URL('./fixtures/biqu-preview-leaves.json',import.meta.url),'utf8'));assert.equal(createHash('sha256').update(JSON.stringify(leaves)).digest('hex'),BIQU_POPSTATION_PREVIEW.sourceLeaves.sha256);
const indices=new Array(246144);for(const leaf of leaves)for(let i=leaf.indexOffset;i<leaf.indexOffset+leaf.indexCount;i++)indices[i]=leaf.vertexOffset+(i-leaf.indexOffset)%leaf.vertexCount;
const part={geometryId:BIQU_POPSTATION_PREVIEW.geometryId,sourceLeaves:leaves,indices};const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(new Float32Array(79824*3),3));pg.setIndex(new T.BufferAttribute(new Uint32Array(indices),1));
assert(configureBiquPreviewGroups(pg,part,T));assert.equal(pg.groups.length,4);assert.equal(pg.groups.reduce((n,g)=>n+g.count,0),indices.length);assert.equal(pg.getAttribute('color').normalized,true);assert.equal(pg.getAttribute('color').array.byteLength,239472);
for(const leaf of leaves){const rgb=new T.Color(BIQU_FINISH_STYLES[BIQU_FINISH_LEAVES[leaf.sourceInstanceIndex][3]].color).toArray().map(v=>Math.round(v*255));assert.deepEqual(Array.from(pg.getAttribute('color').array.subarray(leaf.vertexOffset*3,leaf.vertexOffset*3+3)),rgb)}
const once=pg.index.array.slice(),colors=pg.getAttribute('color').array.slice();configureBiquPreviewGroups(pg,part,T);assert.deepEqual(pg.index.array,once);assert.deepEqual(pg.getAttribute('color').array,colors);assert.deepEqual(part.indices,indices);
assert.equal(configureBiquPreviewGroups(pg,{geometryId:'other'},T),false);
for(const mutate of [p=>p.sourceLeaves[53].indexCount+=3,p=>p.sourceLeaves[29].sourceDefinitionLabel='other',p=>p.sourceLeaves[0].sourceInstanceIndex=1,p=>p.indices[0]=79824]){const bad=structuredClone(part);mutate(bad);assert.throws(()=>configureBiquPreviewGroups(pg,bad,T),/range|identity|triangle/)}
const previewMaterials=createBiquPreviewMaterials(mat);assert.equal(previewMaterials.length,4);assert(previewMaterials.every(m=>m.vertexColors));assert(previewMaterials.every(m=>m.color.getHexString()==='ffffff'));assert.equal(previewMaterials[2].transparent,true);assert.equal(previewMaterials[1].metalness,.72);assert.equal(previewMaterials[3].polygonOffset,true);for(const m of previewMaterials)m.dispose();
const clone=createBiquLayerMaterial(mat);assert.equal(clone.polygonOffset,true);assert.equal(mat.polygonOffset,false);clone.dispose();
for(const m of new Set(root.children.map(n=>n.material)))if(m!==mat)m.dispose();mat.dispose();g.dispose();pg.dispose();
console.log(JSON.stringify({passed:true,sourceOccurrences:70,previewFinishGroups:4,geometryAndMatricesUnchanged:true,scope:'Source-bound product-photo finishes, PC transparency and exact occurrence/material boundaries; anonymous unconfirmed interiors retain source gray. No material specification or native clearance certificate.'}));

// Synthetic Three objects exercise the display policy; actual mesh evidence is
// audited by audit_layout_biqu_display.mjs. No native-clearance certificate.
import assert from 'node:assert/strict';
import * as T from '../site/viewer/vendor-r180/three.module.js';
import {BIQU_POPSTATION_CAD,BIQU_POPSTATION_PREVIEW} from '../site/layout/layout-biqu-popstation.mjs';
import {configureBiquPreviewGroups,createBiquLayerMaterial,applyBiquSurfaceDisplay} from '../site/layout/layout-biqu-display.mjs';
const {resolve}=await import('./layout-built-three-loader.mjs');
assert.deepEqual(await resolve('three',{parentURL:'file:///assembled/viewer/vendor-r180/GLTFLoader.js'},()=>{throw Error('Wrong module namespace')}),{url:'file:///assembled/viewer/vendor-r180/three.module.js',shortCircuit:true});
assert.equal(await resolve('other',{parentURL:'file:///assembled/viewer/vendor-r180/GLTFLoader.js'},s=>s),'other');
assert.equal(await resolve('three',{parentURL:'file:///other/module.mjs'},s=>s),'three');
const mat=new T.MeshStandardMaterial({color:'#adadad',side:T.DoubleSide}),g=new T.BoxGeometry();
function scene(){const root=new T.Group();for(let i=0;i<70;i++){const n=new T.Mesh(g,mat);n.userData={source_instance_index:i,source_definition_label:i===53?'0:1:1:30':i===54?'0:1:1:31':i===69?'0:1:1:38':'definition',source_instance_label:i===53?'0:1:1:1:14':i===54?'0:1:1:1:15':'instance'};n.position.set(i/100,0,0);root.add(n);}root.updateMatrixWorld(true);return root;}
const root=scene(),before=root.children.map(n=>({geometry:n.geometry,matrix:n.matrix.toArray(),visible:n.visible,material:n.material}));
assert.equal(applyBiquSurfaceDisplay(root,{id:'other'}),null);
assert.throws(()=>applyBiquSurfaceDisplay(scene(),{...BIQU_POPSTATION_CAD,model:{sha256:'0'.repeat(64)}}),/Unreviewed/);
assert.throws(()=>{const r=scene();r.children[0].userData.source_instance_index=1;applyBiquSurfaceDisplay(r,BIQU_POPSTATION_CAD);},/Missing/);
assert.throws(()=>{const r=scene();r.children[0].visible=false;applyBiquSurfaceDisplay(r,BIQU_POPSTATION_CAD);},/Missing/);
assert.throws(()=>{const r=scene();r.children[53].userData.source_definition_label='other';applyBiquSurfaceDisplay(r,BIQU_POPSTATION_CAD);},/identity/);
const policy=applyBiquSurfaceDisplay(root,BIQU_POPSTATION_CAD);assert.deepEqual(policy.sourceInstances,[53,54]);
for(const [i,n]of root.children.entries()){
 assert.strictEqual(n.geometry,before[i].geometry);assert.deepEqual(n.matrix.toArray(),before[i].matrix);assert.equal(n.visible,true);
 if(i===53||i===54){assert.notStrictEqual(n.material,mat);assert.equal(n.material.polygonOffset,true);assert.equal(n.material.polygonOffsetFactor,1);assert.equal(n.material.polygonOffsetUnits,1);assert(n.material.color.equals(mat.color));assert.equal(n.material.side,mat.side);}
 else assert.strictEqual(n.material,mat);
}
assert.equal(mat.polygonOffset,false);
const leaves=Array.from({length:70},()=>({}));
for(const [i,start,definition,instance]of [[53,145452,'0:1:1:30','0:1:1:1:14'],[54,149004,'0:1:1:31','0:1:1:1:15']])leaves[i]={sourceInstanceIndex:i,sourceDefinitionLabel:definition,sourceInstanceLabel:instance,indexOffset:start,indexCount:3552};
const pg=new T.BufferGeometry();pg.setIndex(new T.BufferAttribute(new Uint32Array(246144),1));
const part={geometryId:BIQU_POPSTATION_PREVIEW.geometryId,sourceLeaves:leaves},index=pg.index.array.slice();
assert(configureBiquPreviewGroups(pg,part));assert.deepEqual(pg.groups,[{start:0,count:145452,materialIndex:0},{start:145452,count:7104,materialIndex:1},{start:152556,count:93588,materialIndex:0}]);
assert.deepEqual(pg.index.array,index);const groups=JSON.stringify(pg.groups);configureBiquPreviewGroups(pg,part);assert.equal(JSON.stringify(pg.groups),groups);
assert.equal(configureBiquPreviewGroups(pg,{geometryId:'other'}),false);
assert.throws(()=>configureBiquPreviewGroups(pg,{...part,sourceLeaves:leaves.map((l,i)=>i===53?{...l,indexCount:3555}:l)}),/range/);
const clone=createBiquLayerMaterial(mat);assert.equal(clone.polygonOffset,true);assert.equal(mat.polygonOffset,false);clone.dispose();
for(const n of root.children)if(n.material!==mat)n.material.dispose();mat.dispose();g.dispose();pg.dispose();
console.log(JSON.stringify({passed:true,checks:15,sourceOccurrences:70,geometryAndMatricesUnchanged:true,scope:'Source-specific raster-depth policy; no geometry displacement, removed parts or collision exemption.'}));

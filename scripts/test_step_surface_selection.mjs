import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {register} from 'node:module';
import {planSurfaceSelection,surfaceRule,snapshotHeadSurfaces} from '../site/viewer/step-surface-selection.mjs';
import {removeExactZeroArea} from '../site/viewer/step-surface-zero-area.mjs';
import {surfaceZip,packageSurfaceStep} from '../site/viewer/step-surface-package.mjs';
import {writeSurfaceStep} from '../site/viewer/step-surface-writer.mjs';
import {boundedBlobSha256} from '../site/viewer/bounded-sha256.mjs';
register('./three-test-loader.mjs',import.meta.url);const THREE=await import('three');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const size of [0,1,55,56,63,64,65,262143,262144,262145]){const bytes=Uint8Array.from({length:size},(_,i)=>(i*13+21)&255);assert.equal(await boundedBlobSha256(new Blob([bytes])),sha(bytes))}
const p=new Float32Array([0,0,0,.001,0,0,0,.001,0]),i=new Uint32Array([0,1,2,0,1,1]);
const part={key:'fixture_4',asset:'fixture',geometry:{position:{count:3,sha256:sha(p)},index:{count:6,componentType:5125,sha256:sha(i)}},sourceSelector:{id:'test-author-body'}};
const license='Synthetic license fixture',code=new TextEncoder().encode('Synthetic source fixture');
const policy={schema:'3d-print-rig-surface-step-sources-v1',representation:'faceted-open-shell-reference',parts:[part],source:{license:'TEST',revision:'fixed',sourceURL:'https://example.invalid/source'},license:{sha256:sha(license)},generator:[{name:'generator.mjs',path:'./generator.mjs',sha256:sha(code)}]};
const row=()=>({id:'fixture_4',asset:'fixture',key:'fixture_4',name:'triangle',positions:p.slice(),index:i.slice(),positionItemSize:3,normalized:false,deformed:false,materialCount:1,fullDrawRange:true,matrixCAD:[1000,0,0,0,0,0,1000,0,0,-1000,0,0,12,34,56,1],rgb:[1,0,0],opacity:.65});
assert(surfaceRule(policy,'fixture','4'));assert(surfaceRule(policy,'fixture','fixture_4'));assert(!surfaceRule(policy,'foreign','4'));
const original=row(),promise=planSurfaceSelection([original],policy);original.id='changed-after-yield';original.rgb[0]=0;original.matrixCAD[12]=999;original.index[0]=2;
const plan=await promise;assert.equal(plan.included[0].id,'fixture_4');assert.equal(plan.included[0].matrixCAD[12],12);assert.equal(plan.included[0].rgb[0],1);assert.deepEqual(plan.included[0].zeroAreaTriangles,[1]);assert.equal(plan.included[0].index.length,3);assert.equal(plan.included[0].sourceIndex.length,6);
for(const mutate of [r=>r.asset='unknown',r=>r.index[0]=2,r=>r.positions[0]=1,r=>r.materialCount=2,r=>r.fullDrawRange=false,r=>r.deformed=true]){const r=row();mutate(r);const result=await planSurfaceSelection([r],policy);assert.equal(result.included.length,0);assert.equal(result.omitted.length,1)}
const controller=new AbortController();controller.abort();await assert.rejects(planSurfaceSelection([row()],policy,{signal:controller.signal}),{name:'AbortError'});
await assert.rejects(planSurfaceSelection([row(),row()],policy),/Duplicate/);
// Tiny but nonzero Float32 triangles must survive: no epsilon/merge policy.
const tiny=new Float32Array([0,0,0,2**-149,0,0,0,2**-149,0]);assert.equal((await removeExactZeroArea(tiny,new Uint16Array([0,1,2]))).removed.length,0);
const collinear=new Float32Array([1,2,4,2,4,8,3,6,12]);assert.deepEqual((await removeExactZeroArea(collinear,new Uint16Array([0,1,2]))).removed,[0]);
const bench=new THREE.Group(),root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#fe3500'}));bench.add(root);root.add(mesh);mesh.geometry.setAttribute('position',new THREE.BufferAttribute(p,3));mesh.geometry.setIndex(new THREE.BufferAttribute(i,1));const cached=new Map([['fixture',{loaded:{root,meta:{parts:[{key:'fixture_4',name:'triangle'}]},meshes:[{key:'fixture_4',mesh}]}}]]);
const snap=()=>snapshotHeadSurfaces({cached,bench,THREE,policy});assert.equal(snap().length,1);root.remove(mesh);assert.equal(snap().length,0);root.add(mesh);mesh.visible=false;assert.equal(snap().length,0);mesh.visible=true;
const a=snap()[0].matrixCAD;bench.position.set(10,-3,7);bench.rotation.set(.2,.4,-.8);const b=snap()[0].matrixCAD;assert(a.every((x,j)=>Math.abs(x-b[j])<1e-10));
const output=await writeSurfaceStep(plan.included),codeFiles=[{name:'generator.mjs',blob:new Blob([code])}];
const pkg=await packageSurfaceStep(plan,output,{configuration:'fixture-selection',policy,license,codeFiles});assert.equal(pkg.manifest.excludedExactZeroAreaTriangles,1);assert.equal(pkg.manifest.geometry[0].indicesSha256,sha(i));assert.equal(pkg.manifest.counts.included,1);assert(pkg.blob.size>output.blob.size);
await assert.rejects(packageSurfaceStep(plan,output,{configuration:'fixture-selection',policy,license:'Wrong terms',codeFiles}),/license/);
await assert.rejects(packageSurfaceStep(plan,output,{configuration:'fixture-selection',policy,license,codeFiles:[]}),/generator/);
await assert.rejects(surfaceZip([{name:'../bad',blob:new Blob(['x'])}]),/Invalid/);
await assert.rejects(surfaceZip([{name:'a',blob:new Blob(['x'])},{name:'A',blob:new Blob(['y'])}]),/Invalid/);
await assert.rejects(surfaceZip([{name:'a',blob:new Blob(['xx'])}],{maxBytes:1}),/limit/);
await assert.rejects(surfaceZip([{name:'a',blob:new Blob(['xx'])}],{signal:controller.signal}),{name:'AbortError'});
// Model scope is explicitly source-specific: no inherited manufacturer grants.
const sourcePolicy=JSON.parse(fs.readFileSync(new URL('../site/viewer/step-surface-sources.json',import.meta.url),'utf8'));assert.equal(sourcePolicy.parts.length,18);assert.equal(new Set(sourcePolicy.parts.map(p=>p.sourceSelector.id)).size,14);assert(sourcePolicy.parts.every(p=>!/^microswiss/u.test(p.asset)));assert.equal(sourcePolicy.source.revision,'8bcb9c246fac19d8ac03931ef97fa07c5e5f0f2b');
for(const n of [6,9,10,11]){const alias=surfaceRule(sourcePolicy,'sb_v6','sb_v6_front_'+n),canonical=surfaceRule(sourcePolicy,'sb_revo_voron',String(n));assert(alias&&canonical);assert.deepEqual(alias.geometry,canonical.geometry);assert.deepEqual(alias.sourceSelector,canonical.sourceSelector);assert.equal(alias.sourceAlias.key,canonical.key)}
for(const key of ['front_7','front_13','mount_0','mount_1','hot_83'])assert.equal(surfaceRule(sourcePolicy,'sb_v6',key),undefined,'Copied hardware and unreviewed V6 parts remain excluded.');
const thin=JSON.parse(fs.readFileSync(new URL('./fixtures/step-surface-thin-facet.json',import.meta.url),'utf8')),thinRule=sourcePolicy.parts.find(p=>p.key===thin.source.key);assert.equal(thinRule.geometry.position.sha256,thin.source.positionSha256);assert.equal(thinRule.geometry.index.sha256,thin.source.indexSha256);
const thinStep=await writeSurfaceStep([{id:'source-thin-facet',name:'Source thin facet',positions:new Float32Array(thin.positions),index:new Uint32Array([0,1,2]),matrixCAD:thin.matrixCAD,rgb:[1,0,0],opacity:1}]);
const directions=[...(await thinStep.blob.text()).matchAll(/DIRECTION\('',\(([^)]+)\)\)/gu)].map(m=>m[1].split(',').map(Number));assert.equal(directions.length,2);assert(Math.abs(directions[0].reduce((n,x,i)=>n+x*directions[1][i],0))<1e-14,'Thin finite facets keep a numerically orthogonal reference axis without changing their plane.');
const {supportedLanguages,loadLanguage,formatMessage}=await import('../site/viewer/i18n.mjs');
for(const language of supportedLanguages){await loadLanguage(language);const counts=formatMessage('surface.counts',[14,104,90],language),zeros=formatMessage('surface.zero_area',[51],language);assert(!counts.includes('{')&&!zeros.includes('{'));for(const n of ['14','104','90'])assert(counts.includes(n));assert(zeros.includes('51'))}
console.log('Surface export: immutable pre-yield selection, exact source/payload rejects, zero-area integer proof, frame/camera independence, original source buffers, package licensing/code guards and cancellation passed. Native/complete-machine fit not claimed.');

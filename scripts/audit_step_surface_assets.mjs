// Actual delivered SB/CW2 meshes through the same snapshot/admission/writer.
// A surface export check is separate from native BRep repair and printer fit.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {headPlan,partKey} from '../site/viewer/head-assembly.js';
import {snapshotHeadSurfaces,planSurfaceSelection} from '../site/viewer/step-surface-selection.mjs';
import {writeSurfaceStep} from '../site/viewer/step-surface-writer.mjs';
import {packageSurfaceStep} from '../site/viewer/step-surface-package.mjs';
import {auditV6Surfaces} from './audit_step_surface_v6.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function auditSurfaceAssets(root,{output}={}){
 if(output){await fs.mkdir(output);await fs.writeFile(path.join(output,'actual-step-surface.json'),JSON.stringify({passed:false,status:'RUNNING'}))}
 const read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
 const catalog=await read('TOOLHEAD_CONFIGURATIONS.json'),policy=await read('viewer/step-surface-sources.json');
 const variant=catalog.variants.find(v=>v.id==='head__sc__standard_6__stealthburner__revo_voron__cw2');assert(variant);
 const hp=headPlan(variant),scene=new THREE.Scene(),bench=new THREE.Group(),cached=new Map(),pins={};scene.add(bench);
 const entries=[{id:hp.base,translation_mm:hp.translation,hidden_keys:[...hp.hidden]},...hp.modules.filter(m=>m.role!=='dock')];
 const loader=new GLTFLoader();
 for(const e of entries){
  const spec=catalog.base_assets[e.id]||catalog.assets[e.id];assert(spec&&!spec.external);
  const meta=await read(spec.meta);pins[spec.meta]=hash(await fs.readFile(path.join(root,spec.meta)));
  let file=spec.glb;try{await fs.access(path.join(root,file))}catch{file+='.gz'}
  const raw=await fs.readFile(path.join(root,file)),bytes=file.endsWith('.gz')?zlib.gunzipSync(raw):raw;pins[file]=hash(raw);
  const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const r=model.scene;r.position.set(e.translation_mm[0]*.001,e.translation_mm[2]*.001,-e.translation_mm[1]*.001);bench.add(r);
  const hidden=new Set(e.hidden_keys||[]),byKey=new Map(meta.parts.map(p=>[String(p.key),p])),meshes=[];
  r.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh);assert(byKey.has(key));const row=byKey.get(key);mesh.visible=!hidden.has(key)&&!['dock','rail_reference','shuttle_reference'].includes(row.component);mesh.material=mesh.material.clone();meshes.push({key,mesh,role:row.appearance_role})});
  cached.set(e.id,{loaded:{root:r,meta,meshes}});
 }
 const snapshot=()=>snapshotHeadSurfaces({cached,bench,THREE,policy,catalog,href:'https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html'});
 const initial=await planSurfaceSelection(snapshot(),policy);assert.equal(initial.included.length,14);assert(initial.omitted.length>0);assert.equal(initial.included.reduce((n,p)=>n+p.sourceIndex.length/3,0),107967);assert.equal(initial.included.reduce((n,p)=>n+p.zeroAreaTriangles.length,0),51);
 const thin=JSON.parse(await fs.readFile(new URL('./fixtures/step-surface-thin-facet.json',import.meta.url),'utf8')),thinPart=initial.included.find(p=>p.id===thin.source.key),sourceVertices=[];assert(thinPart);
 for(let k=0;k<3;k++){const i=thinPart.sourceIndex[thin.source.originalTriangleOrdinal*3+k]*3;sourceVertices.push(...thinPart.positions.subarray(i,i+3))}assert.deepEqual(sourceVertices,thin.positions);assert.equal(thinPart.positionSha256,thin.source.positionSha256);assert.equal(thinPart.indexSha256,thin.source.indexSha256);
 const reference=initial.included.map(p=>({id:p.id,matrixCAD:p.matrixCAD,rgb:p.rgb}));let checks=0;
 for(const delta of [[0,0,0],[.15,-.07,.003],[-.04,.08,-.05],[0,0,0]]){
  bench.position.set(...delta);bench.rotation.set(.13,-.17,.19);
  const rows=await planSurfaceSelection(snapshot(),policy);assert.deepEqual(rows.included.map(p=>p.id),reference.map(p=>p.id));
  for(let i=0;i<rows.included.length;i++)for(let j=0;j<16;j++){assert(Math.abs(rows.included[i].matrixCAD[j]-reference[i].matrixCAD[j])<1e-10);checks++}
 }
 bench.position.set(0,0,0);bench.rotation.set(0,0,0);
 for(const palette of [['#ffffff','#0095a8'],['#203040','#ff3500'],['#ffffff','#0095a8']]){
  for(const p of cached.values())for(const r of p.loaded.meshes)if(['base','accent'].includes(r.role))r.mesh.material.color.set(palette[r.role==='base'?0:1]);
  const plan=await planSurfaceSelection(snapshot(),policy);assert.equal(plan.included.length,14);
 }
 const plan=await planSurfaceSelection(snapshot(),policy),outputStep=await writeSurfaceStep(plan.included),license=await fs.readFile(path.join(root,'licenses/step-surface-gpl-3.0.txt'),'utf8');
 assert.equal(outputStep.parts,14);assert.equal(outputStep.triangles,107916);
 const codeFiles=await Promise.all(policy.generator.map(async r=>({name:r.name,blob:new Blob([await fs.readFile(path.resolve(root,'viewer',r.path))])})));
 const pkg=await packageSurfaceStep(plan,outputStep,{configuration:variant.id,policy,license,codeFiles});
 assert.equal(pkg.manifest.geometry.length,14);assert.equal(pkg.manifest.counts.selected,plan.counts.selected);
 // A changed hotend/cover index must not acquire permission from a printed role.
 const changed=snapshot(),candidate=changed.find(p=>p.id===policy.parts[0].key);candidate.index[0]=(candidate.index[0]+1)%(candidate.positions.length/3);
 const rejected=await planSurfaceSelection(changed,policy);assert.equal(rejected.included.length,13);assert(rejected.omitted.some(p=>p.id===candidate.id&&p.reason==='source-geometry-changed'));
 const report={passed:true,inputs:pins,configuration:variant.id,counts:plan.counts,triangles:outputStep.triangles,stepBytes:outputStep.blob.size,packageBytes:pkg.blob.size,framingMatrixChecks:checks,poseAndPaletteStates:7,newNativeSolids:0,scope:'Exact admitted exported mesh triangle surface STEP only. No native BRep repair, closed-solid or physical-fit qualification.'};
 report.v6CommonFront=await auditV6Surfaces(root,{catalog,policy});
 if(output){await fs.writeFile(path.join(output,'actual-surfaces.step'),Buffer.from(await outputStep.blob.arrayBuffer()));await fs.writeFile(path.join(output,'actual-package.zip'),Buffer.from(await pkg.blob.arrayBuffer()));
  const sample=plan.included.filter(p=>['sb_revo_voron_10','head_sb_cw2_20'].includes(p.id));const s=await writeSurfaceStep(sample);await fs.writeFile(path.join(output,'native-readback-sample.step'),Buffer.from(await s.blob.arrayBuffer()));await fs.writeFile(path.join(output,'source-manifest.json'),JSON.stringify(pkg.manifest,null,2));}
 if(output){const receipt=path.join(output,'actual-step-surface.json');await fs.writeFile(receipt+'.tmp',JSON.stringify(report,null,2));await fs.rename(receipt+'.tmp',receipt)}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const root=path.resolve(process.argv[2]),out=process.argv[3]?path.resolve(process.argv[3]):undefined;console.log(JSON.stringify(await auditSurfaceAssets(root,{output:out})))}

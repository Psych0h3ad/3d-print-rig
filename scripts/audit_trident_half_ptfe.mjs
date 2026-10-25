// Actual exported half-height assembly; explicit pinned cache paths only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {createCustomTube,customTubeCurve} from '../site/viewer/custom-voron-tube.mjs';
import {guardHalfZTube} from '../site/viewer/trident-half-z-tube.mjs';
import {auditFlexRoute,segmentTriangleDistance} from './flex-route-quality.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function auditTridentHalfPtfe({site,pins,report}={}){
 const sourcePaths=['site/viewer/trident-half-z-tube.mjs','site/viewer/custom-voron-tube.mjs',
  'site/viewer/trident-motion.mjs','scripts/audit_trident_half_ptfe.mjs','scripts/flex-route-quality.mjs',
  'scripts/fixtures/trident-half-z-ptfe.json'];
 const repo=fileURLToPath(new URL('../',import.meta.url));
 const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(fs.readFileSync(path.join(repo,p)))]));
 const catalog=JSON.parse(fs.readFileSync(path.join(site,'CUSTOM_VORON_ASSETS.json')));
 const spec=catalog.machines.find(m=>m.id==='voron_trident_350_half_z');assert(spec);
 const bindings=JSON.parse(fs.readFileSync(pins)),inputs={},inputPaths={};
 const read=name=>{
  const pin=spec.files[name],row=bindings.find(r=>r.catalog==='CUSTOM_VORON_ASSETS.json'&&r.path===pin.path);
  assert(row?.actual_path,'Missing explicitly bound public asset: '+pin.path);
  const raw=fs.readFileSync(row.actual_path);assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);
  const decoded=pin.encoding==='gzip'?gunzipSync(raw):raw;
  if(pin.decoded_sha256)assert.equal(hash(decoded),pin.decoded_sha256);
  inputs[name]={sha256:pin.sha256,decoded_sha256:hash(decoded)};inputPaths[name]=row.actual_path;return decoded;
 };
 const manifest=JSON.parse(read('assembly_manifest.json')),profile=JSON.parse(read('machine_profile.json'));
 guardHalfZTube(manifest);
 const data=read('model.glb'),root=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
 const motion=createTridentMotion(profile);motion.register(root,manifest);
 const tube=createCustomTube(root,manifest),ref=profile.display_reference_xyz_mm;
 const records=new Map(manifest.parts.map(p=>[p.key,p])),meshes=[];
 root.traverse(m=>{if(m.isMesh){assert(records.has(m.userData.part_key));meshes.push(m)}});
 assert.equal(new Set(meshes.map(m=>m.userData.part_key)).size,manifest.parts.length);
 const omitted=[],bodies=meshes.filter(m=>{
  const key=m.userData.part_key,row=records.get(key);
  if(key===manifest.custom_ptfe.part_key||row.motion==='reference_flexible'){
   omitted.push({key,reason:key===manifest.custom_ptfe.part_key?'replaced source tube':'separate flexible preview'});return false;
  }
  return true;
 });
 const cache=new WeakMap(),shapeCache=new Map(),rows=[],findings=[];let triangleTests=0,minGap=Infinity;
 const point=new THREE.Vector3(),box=new THREE.Box3(),radius=manifest.custom_ptfe.radius_mm;
 const world=([x,y,z])=>[x,z,-y];
 const poses=[];
 for(const x of [profile.display_limits_mm.X[0],ref[0],profile.display_limits_mm.X[1]])
  for(const y of [profile.display_limits_mm.Y[0],ref[1],profile.display_limits_mm.Y[1]])
   for(const z of profile.display_limits_mm.Z)poses.push([x,y,z]);
 poses.push(...poses.slice().reverse(),ref);
 for(const [x,y]of [[175,328],[ref[0],314]])for(const z of profile.display_limits_mm.Z)poses.push([x,y,z]);
 for(const xyz of poses){
  const delta=[xyz[0]-ref[0],xyz[1]-ref[1]];
  motion.setPose({x:xyz[0],y:xyz[1],z:xyz[2]});tube.update(...delta);root.updateMatrixWorld(true);
  const curve=customTubeCurve(manifest.custom_ptfe,...delta),key=JSON.stringify(delta);
  if(!shapeCache.has(key)){
   const s=manifest.custom_ptfe,start=world([s.start_mm[0]+delta[0],s.start_mm[1]+delta[1],s.start_mm[2]]);
   const q=auditFlexRoute(curve,{units:'m',start:{positionMm:start,axis:[0,1,0]},
    end:{positionMm:world(s.end_mm),axis:world(s.holder_bore_axis).map(v=>-v)},
    minBendRadiusMm:20,tubeRadiusMm:radius,maxSamples:16385,maxPairTests:2000000,chordToleranceMm:.04});
   assert(q.ok,JSON.stringify(q.findings));shapeCache.set(key,q);
  }
  const q=shapeCache.get(key),samples=q.samples;let poseGap=Infinity;
  for(const mesh of bodies){
   const bodyKey=mesh.userData.part_key,g=mesh.geometry;
   g.computeBoundingBox();box.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld);
   const lower=box.min.toArray().map(v=>v*1000-radius),upper=box.max.toArray().map(v=>v*1000+radius);
   const matrixKey=mesh.matrixWorld.elements.join(',');let entry=cache.get(mesh);
   const segments=[];
   for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i];let t0=0,t1=1;
    // Only named, finite fitting engagement is exempt. Straddling segments
    // are clipped; no whole mesh or broad unnamed head region is excluded.
    if(bodyKey==='578')t0=Math.max(t0,(10-a.arcLengthMm)/(b.arcLengthMm-a.arcLengthMm));
    if(bodyKey===manifest.custom_ptfe.holder_part_key)t1=Math.min(t1,(q.metrics.lengthMm-16-a.arcLengthMm)/(b.arcLengthMm-a.arcLengthMm));
    if(t0>=1||t1<=0||t0>=t1)continue;
    const mix=t=>a.positionMm.map((v,j)=>v+(b.positionMm[j]-v)*t),p=mix(Math.max(0,t0)),s=mix(Math.min(1,t1));
    if([0,1,2].some(j=>Math.max(p[j],s[j])<lower[j]||Math.min(p[j],s[j])>upper[j]))continue;
    segments.push({i,p,s});
   }
   if(!segments.length)continue;
   if(entry?.matrixKey!==matrixKey){
    const p=g.attributes.position,ix=g.index,count=ix?.count??p.count,triangles=new Float64Array(count*3);
    for(let i=0;i<count;i++){point.fromBufferAttribute(p,ix?ix.getX(i):i).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);triangles.set(point.toArray(),i*3)}
    entry={matrixKey,triangles};cache.set(mesh,entry);
   }
   const data=entry.triangles;
   for(const {i,p,s}of segments){
    for(let at=0;at<data.length;at+=9){
     if([0,1,2].some(j=>Math.max(p[j],s[j])+radius<Math.min(data[at+j],data[at+3+j],data[at+6+j])||Math.min(p[j],s[j])-radius>Math.max(data[at+j],data[at+3+j],data[at+6+j])))continue;
     triangleTests++;assert(triangleTests<=12000000,'Bounded triangle audit budget exceeded');
     const distance=segmentTriangleDistance(p,s,[Array.from(data.subarray(at,at+3)),Array.from(data.subarray(at+3,at+6)),Array.from(data.subarray(at+6,at+9))]);
     const gap=distance-radius;minGap=Math.min(minGap,gap);poseGap=Math.min(poseGap,gap);
     if(gap<-.001){findings.push({xyz,part_key:bodyKey,segment:i,arc_mm:samples[i].arcLengthMm,surface_gap_mm:gap});break;}
    }
    if(findings.length)break;
   }
   if(findings.length)break;
  }
  rows.push({xyz,shape_key:key,min_tested_surface_gap_mm:Number.isFinite(poseGap)?poseGap:null});
  if(findings.length)break;
 }
 motion.setPose({x:ref[0],y:ref[1],z:ref[2]});tube.update(0,0);
 for(const [p,sha]of Object.entries(sourceHashes))assert.equal(hash(fs.readFileSync(path.join(repo,p))),sha,'Source changed during actual audit: '+p);
 for(const [name,p]of Object.entries(inputPaths))assert.equal(hash(fs.readFileSync(p)),inputs[name].sha256,'Actual input changed during audit: '+name);
 const result={schema:'trident-half-height-actual-ptfe-review-v1',passed:!findings.length,inputs,source_sha256:sourceHashes,inputs_stable_during_audit:true,parts:manifest.parts.length,
  rows,findings,shape_samples:[...shapeCache.entries()].map(([key,q])=>({key,metrics:q.metrics,sampling:q.sampling})),triangle_tests:triangleTests,
  minimum_tested_surface_gap_mm:Number.isFinite(minGap)?minGap:null,excluded_source_flexible_parts:omitted,
  fitting_exemptions:[{part_key:'578',end:'start',arc_mm:10},{part_key:manifest.custom_ptfe.holder_part_key,end:'end',arc_mm:16}],
  threshold_scope:'20 mm centreline bend radius is an explicit display review assumption, not a material rating.',
  scope:'Actual exported assembly and production controller; named forward/reversed endpoint/midpoint poses, adaptive curve samples, named finite fittings and sampled exported-triangle surface clearance. Native solid interiors, continuous swept clearance, physical hose service length and manufacturing fit remain unqualified.',
  continuous_native_clearance_certified:false,physical_fit_certified:false};
 tube.dispose();
 if(report)fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
 assert(result.passed,JSON.stringify(findings));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,s)=>i%2?a:[...a,[v.slice(2),s[i+1]]],[]));
 assert(args.site&&args.pins&&args.report,'--site, --pins and --report required');
 const r=await auditTridentHalfPtfe(args);console.log(JSON.stringify({passed:r.passed,parts:r.parts,poses:r.rows.length,triangle_tests:r.triangle_tests,min_gap_mm:r.minimum_tested_surface_gap_mm}));
}

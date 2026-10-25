// Explicit public-cache paths only. Run one machine per process with
// --max-old-space-size=384 --v8-pool-size=1 --expose-gc.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {createMicronAdapter} from '../site/viewer/micron-adapter.mjs';
import {micronTubeSpecs,micronTubeRoute,micronRoutePoint} from '../site/viewer/micron-tube-routes.mjs';
import {mercuryTubeSpecs,mercuryTubeRoute,mercuryPoint} from '../site/viewer/mercury-tube-routes.mjs';
import {stingerTubeSpec,stingerTubeRoute} from '../site/viewer/stinger-tube-route.mjs';
import {auditFlexRoute,segmentTriangleDistance} from './flex-route-quality.mjs';
import {joinCurvatureJump} from './flexible-route-curvature.mjs';
register('./source-assembly-test-loader.mjs',import.meta.url);
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');

const hash=b=>createHash('sha256').update(b).digest('hex'),repo=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p));
export async function auditFlexibleFamily({site,bindings,machine,report:reportPath,surfaces=true,baseline}){
 assert(site&&bindings&&machine,'--site, --bindings, --machine and --report required');
 const map=read(bindings),community=read(path.join(repo,'site/COMMUNITY_MACHINES_ASSETS.json'));
 const approved=read(path.join(site,'APPROVED_DELIVERY.json')),micron=machine.startsWith('micron');
 const pins={},resolve=(logical,pin,catalog)=>{
  const rows=map.filter(r=>r.path===pin.path&&r.sha256===pin.sha256&&(!catalog||r.catalog===catalog));
  assert(rows.length,'No explicitly listed, current-catalog-matching path: '+logical);
  const r=rows[0],raw=fs.readFileSync(r.actual_path);assert.equal(raw.length,pin.bytes??r.bytes);assert.equal(hash(raw),pin.sha256);
  const decoded=pin.encoding==='gzip'||logical.endsWith('.glb')&&r.path.endsWith('.gz')?gunzipSync(raw):raw;
  if(pin.decoded_bytes)assert.equal(decoded.length,pin.decoded_bytes);if(pin.decoded_sha256)assert.equal(hash(decoded),pin.decoded_sha256);
  pins[logical]={path:r.path,actual_path:r.actual_path,sha256:hash(raw),decoded_sha256:hash(decoded),bytes:raw.length,decoded_bytes:decoded.length};return decoded;
 };
 function input(name){
  if(!micron)return resolve(name,community.machines[machine].files[name],'COMMUNITY_MACHINES_ASSETS.json');
  const p='machines/'+machine+'/'+name+(name==='model.glb'?'.gz':'');
  const pin=Array.isArray(approved.files)?approved.files.find(r=>r.path===p):approved.files[p];assert(pin,'Missing approved Micron pin '+p);
  return resolve(name,{...pin,path:p},'APPROVED_DELIVERY.json');
 }
 const manifest=JSON.parse(input('assembly_manifest.json')),profile=JSON.parse(input('machine_profile.json'));
 let raw=input('model.glb'),root=(await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;raw=null;global.gc?.();
 const adapter=micron?createMicronAdapter(root,manifest,profile):createCommunityAdapter(root,manifest,profile);
 const routeSpecs=micron?(machine.includes('plus')?micronTubeSpecs:[]):[machine==='lh_stinger_200'?{...stingerTubeSpec,kind:'ptfe',radius_mm:2}:{...mercuryTubeSpecs[machine],kind:'ptfe',radius_mm:2}];
 const point=micron?micronRoutePoint:machine==='lh_stinger_200'?p=>new THREE.Vector3(...profile.basis.map(row=>row.reduce((s,n,i)=>s+n*(p[i]-profile.origin_mm[i]),0)/1000)):mercuryPoint;
 const origin=point([0,0,0]),axis=p=>point(p).sub(origin).normalize().toArray();
 const routes=p=>routeSpecs.map(spec=>({spec,route:micron?micronTubeRoute(spec,['x','y','z'].map((a,i)=>p[a]-profile.display_reference_xyz_mm[i])):machine==='lh_stinger_200'?stingerTubeRoute(p,profile):mercuryTubeRoute(machine,p)}));
 const reference=micron?Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])):{x:0,y:0,z:0};
 const ranges=micron?Object.fromEntries(['x','y','z'].map(a=>[a,profile.display_limits_mm[a.toUpperCase()]])):profile.axes;
 const set=p=>micron?adapter.setPose(p):adapter.setAxes(p);set(reference);root.updateMatrixWorld(true);
 const bodyRows=[],omitted=[],v=new THREE.Vector3();
 for(const [key,node]of adapter.nodes){const record=adapter.records.get(key),group=record.group??record.motion;
  if(record.motion==='reference_flexible'||['tube','belt','chain','bed_wire','x_belt','compound_motion','registered_flex','belted_z','reference'].includes(group)){omitted.push({key,group});continue;}
  node.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position,ix=mesh.geometry.index;
   assert(pos&&pos.array.every(Number.isFinite),'Invalid actual rigid mesh '+key);
   const vertices=new Float32Array(pos.count*3),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);for(let j=0;j<3;j++){vertices[3*i+j]=v.getComponent(j);min[j]=Math.min(min[j],vertices[3*i+j]);max[j]=Math.max(max[j],vertices[3*i+j]);}}
   const count=(ix?.count??pos.count)/3;assert(Number.isInteger(count));
   const boxes=new Float32Array(count*6);
   for(let t=0;t<count;t++)for(let j=0;j<3;j++){let lo=Infinity,hi=-Infinity;for(let k=0;k<3;k++){const at=ix?ix.getX(3*t+k):3*t+k,n=vertices[3*at+j];lo=Math.min(lo,n);hi=Math.max(hi,n)}boxes[6*t+j]=lo;boxes[6*t+3+j]=hi;}
   bodyRows.push({key,record,mesh,vertices,ix,min,max,boxes,translation:new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).multiplyScalar(1000)});
  });
 }
 const sourceNames=['site/viewer/micron-tube-routes.mjs','site/viewer/mercury-tube-routes.mjs','site/viewer/stinger-tube-route.mjs','site/viewer/community-adapter.mjs','site/viewer/community-state.mjs','site/viewer/micron-adapter.mjs','site/viewer/micron-flexible.mjs','scripts/flex-route-quality.mjs','scripts/flexible-route-curvature.mjs','scripts/audit_flexible_family_routes.mjs'];
 const sources=Object.fromEntries(sourceNames.map(p=>[p,hash(fs.readFileSync(path.join(repo,p)))]));
 const shapes=[],findings=[],contacts=[],snapshots=[],cache=new Map();let triangleTests=0,adaptiveCount=0;
 function quality(spec,route){
  const c=route.curve,key=route.endpoints_mm.flat().join(',');if(cache.has(spec.key+key))return cache.get(spec.key+key);
  const q=auditFlexRoute(c,{units:'m',tubeRadiusMm:spec.radius_mm,minBendRadiusMm:25,chordToleranceMm:.05,maxSegmentLengthMm:8,
   start:{positionMm:point(route.endpoints_mm[0]).multiplyScalar(1000).toArray(),axis:axis(spec.start_axis??[0,0,1])},
   end:{positionMm:point(route.endpoints_mm[1]).multiplyScalar(1000).toArray(),axis:axis(spec.end_axis??spec.axis)}});
  cache.set(spec.key+key,q);return q;
 }
 function checkMesh(spec,route,p){
  const node=adapter.nodes.get(spec.key),meshes=[];assert(node,'Missing actual tube '+spec.key);node.traverse(m=>{if(m.isMesh)meshes.push(m)});assert(meshes.length);
  const mesh=meshes[0],pos=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;
  assert(mesh.visible&&pos.array.every(Number.isFinite)&&normals.array.every(Number.isFinite));
  for(let i=0;i<normals.count;i++)assert(Math.abs(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))-1)<1e-4,'Nonunit tube normal');
  const radial=12,ring=radial+1,last=pos.count-ring,ends=[0,last].map(off=>{const center=new THREE.Vector3();for(let k=0;k<radial;k++)center.add(new THREE.Vector3().fromBufferAttribute(pos,off+k));return center.multiplyScalar(1/radial).applyMatrix4(mesh.matrixWorld)});
  const errors=ends.map((e,i)=>e.distanceTo(point(route.endpoints_mm[i]))*1000);assert(Math.max(...errors)<.001,'Actual exported preview endpoint detached '+spec.key);
  return {pose:p,key:spec.key,actual_endpoint_errors_mm:errors,vertices:pos.count};
 }
 // Named source fitting engagement only. Other body contacts remain findings.
 function engagement(key,spec,length){
  if(micron&&(spec.start_attachment.includes(key)||spec.kind==='ptfe'&&key==='m180_01414'))return [0,spec.start_straight_mm];
  if(micron&&spec.end_attachment.includes(key)&&spec.kind==='umbilical')return [length-spec.end_straight_mm,length];
  if(machine==='lh_stinger_200'&&['2','30','50','52'].includes(key))return [0,7];
  if(machine==='lh_stinger_200'&&['277','280'].includes(key))return [length-12,length];
  if(machine.startsWith('mercury')&&key===(machine.endsWith('235')?'00399':'00411'))return [0,11];
  if(machine==='mercury_one1_235'&&key==='00260')return [length-8,length];
  if(machine==='mercury_one1_370'&&key==='00504')return [length-1,length];
  return null;
 }
 const fittingExemptions=new Map();
 function surfacesAt(spec,route,q,p){
  const margin=spec.radius_mm+q.sampling.observedChordDeviationMm+.002;
  for(const body of bodyRows){if(!body.mesh.visible)continue;const shift=new THREE.Vector3().setFromMatrixPosition(body.mesh.matrixWorld).multiplyScalar(1000).sub(body.translation).toArray();
   const exempt=engagement(body.key,spec,q.metrics.lengthMm);if(exempt)fittingExemptions.set(spec.key+'/'+body.key,{tube:spec.key,body:body.key,arc_mm:exempt,reason:'Source-identified coaxial fitting insertion; remainder is tested.'});
   let minimum=Infinity,witness=null;
   for(let k=1;k<q.samples.length;k++){
    let a=q.samples[k-1],b=q.samples[k];if(exempt&&a.arcLengthMm>=exempt[0]&&b.arcLengthMm<=exempt[1])continue;
    let from=a.positionMm,to=b.positionMm;
    if(exempt&&a.arcLengthMm<exempt[1]&&b.arcLengthMm>exempt[1])from=from.map((n,j)=>n+(to[j]-n)*(exempt[1]-a.arcLengthMm)/(b.arcLengthMm-a.arcLengthMm));
    if(exempt&&a.arcLengthMm<exempt[0]&&b.arcLengthMm>exempt[0])to=from.map((n,j)=>n+(to[j]-n)*(exempt[0]-a.arcLengthMm)/(b.arcLengthMm-a.arcLengthMm));
    from=from.map((n,j)=>n-shift[j]);to=to.map((n,j)=>n-shift[j]);
    const search=margin+3,min=from.map((n,j)=>Math.min(n,to[j])-search),max=from.map((n,j)=>Math.max(n,to[j])+search);
    if(min.some((n,j)=>n>body.max[j]||max[j]<body.min[j]))continue;
    for(let t=0;t<body.boxes.length/6;t++){
     if(min.some((n,j)=>n>body.boxes[6*t+3+j]||max[j]<body.boxes[6*t+j]))continue;
     const triangle=[];for(let j=0;j<3;j++){const at=body.ix?body.ix.getX(3*t+j):3*t+j;triangle.push(Array.from(body.vertices.subarray(3*at,3*at+3)));}
     triangleTests++;const d=segmentTriangleDistance(from,to,triangle);if(d<minimum){minimum=d;witness={segment:k-1,arc_mm:[a.arcLengthMm,b.arcLengthMm],distance_mm:d,gap_mm:d-spec.radius_mm,triangle:t};}
    }
   }
   if(minimum<=margin)contacts.push({pose:p,tube:spec.key,body:body.key,name:body.record.name,margin_mm:margin,...witness});
  }
 }
 const poses=[];
 for(const x of [ranges.x[0],reference.x,(ranges.x[0]+ranges.x[1])/2,ranges.x[1]])for(const y of [ranges.y[0],reference.y,(ranges.y[0]+ranges.y[1])/2,ranges.y[1]])for(const z of [ranges.z[0],reference.z,(ranges.z[0]+ranges.z[1])/2,ranges.z[1]])poses.push({x,y,z});
 for(const p of poses){set(p);root.updateMatrixWorld(true);for(const {spec,route}of routes(p)){
  const q=quality(spec,route);shapes.push({pose:p,key:spec.key,metrics:q.metrics,sampling:q.sampling});
  if(!q.ok)findings.push({pose:p,key:spec.key,findings:q.findings});
  if(!micron&&joinCurvatureJump(route.curve)>1e-6)findings.push({pose:p,key:spec.key,findings:[{code:'free-span-curvature-jump'}]});
  snapshots.push(checkMesh(spec,route,p));if(surfaces)surfacesAt(spec,route,q,p);
 }}
 const shape=p=>routes(p).flatMap(({route})=>Array.from({length:17},(_,i)=>route.curve.getPoint(i/16).multiplyScalar(1000).toArray()));
 const distance=(a,b)=>Math.max(0,...a.map((p,i)=>Math.hypot(...p.map((n,j)=>n-b[i][j]))));
 function transition(a,b,sa=shape(a),sb=shape(b),depth=0){
  const m=Object.fromEntries(['x','y','z'].map(k=>[k,(a[k]+b[k])/2])),sm=shape(m),linear=sa.map((p,i)=>p.map((n,j)=>(n+sb[i][j])/2));
  if(distance(sa,sb)>10||distance(sm,linear)>.3){assert(depth<12);transition(a,m,sa,sm,depth+1);transition(m,b,sm,sb,depth+1);return;}
  for(const p of [a,m,b]){set(p);for(const {spec,route}of routes(p)){const q=quality(spec,route);if(!q.ok)findings.push({adaptive:true,pose:p,key:spec.key,findings:q.findings});checkMesh(spec,route,p);}adaptiveCount++;}
 }
 const low=Object.fromEntries(Object.entries(ranges).map(([k,v])=>[k,v[0]])),high=Object.fromEntries(Object.entries(ranges).map(([k,v])=>[k,v[1]]));
 transition(low,high);transition(high,low);
 for(const a of ['x','y','z']){const lo={...reference,[a]:ranges[a][0]},hi={...reference,[a]:ranges[a][1]};transition(lo,hi);transition(hi,lo);}
 for(const p of poses.slice().reverse()){set(p);for(const {spec,route}of routes(p))checkMesh(spec,route,p);}
 set(reference);for(const {spec,route}of routes(reference))checkMesh(spec,route,reference);
 const negatives=[];
 if(baseline&&!micron){const filename=machine==='lh_stinger_200'?'stinger-tube-route.mjs':'mercury-tube-routes.mjs',oldPath=path.join(baseline,filename),oldBytes=fs.readFileSync(oldPath);
  const oldText=oldBytes.toString('utf8').replace(/from '(\.\/[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(path.join(repo,'site/viewer',p)).href));
  const old=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
  for(const p of [low,high,reference]){const r=machine==='lh_stinger_200'?old.stingerTubeRoute(p,profile):old.mercuryTubeRoute(machine,p),q=quality({...routeSpecs[0],key:'legacy-'+routeSpecs[0].key},r),jump=joinCurvatureJump(r.curve);
   const rejected=!q.ok||jump>1e-6;assert(rejected,'Old bad curve was not rejected by the actual-asset regression');negatives.push({pose:p,old_source_sha256:hash(oldBytes),rejected,metrics:q.metrics,findings:q.findings,join_curvature_jump_per_mm:jump});}
 }
 const report={schema:'flexible-family-actual-assets-v1',machine,passed:!findings.length&&!contacts.length,inputs:pins,source_sha256:sources,old_behavior_negative_controls:negatives,
  routes:routeSpecs.map(s=>({key:s.key,kind:s.kind,expected_length_mm:s.length_mm??s.length,min_bend_review_threshold_mm:25,threshold_source:'Declared display plausibility assumption; not a manufacturer bend rating.'})),
  poses:shapes,actual_mesh_snapshots:snapshots,adaptive_actual_mesh_poses:adaptiveCount,findings,body_contacts:contacts,triangle_tests:triangleTests,
  named_fitting_engagement_exemptions:[...fittingExemptions.values()],excluded_source_flexible_bodies:omitted,
  source_native_routes_retained_in_downloads:true,browser_review:false,native_solid_clearance_verified:false,
  scope:'Actual checksum-pinned public GLB, current checkout adapters, min/max/reference/mid XYZ, reversed poses, deterministic reference reset, adaptive axis/diagonal preview mesh transitions. Complete centerline fitting axes, bend radius, self-distance and length plus finite unit-normal tube meshes. Sampled exported rigid triangle surface distances exclude only named insertion intervals. No continuous/native-solid clearance, containment, mechanical service-length, electrical connector or manufacturer bend-limit certification.'};
 for(const [p,h]of Object.entries(sources))assert.equal(hash(fs.readFileSync(path.join(repo,p))),h,'Source changed during audit: '+p);
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v.slice(2),a[i+1]]],[]));
 const r=await auditFlexibleFamily({...args,surfaces:args.surfaces!=='false'});console.log(JSON.stringify({machine:r.machine,passed:r.passed,poses:r.poses.length,shape_findings:r.findings.length,body_contacts:r.body_contacts.slice(0,12),total_body_contacts:r.body_contacts.length,triangle_tests:r.triangle_tests,adaptive_actual_mesh_poses:r.adaptive_actual_mesh_poses}));if(!r.passed)process.exitCode=1;
}

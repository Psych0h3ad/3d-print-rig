// PTFE shape and sampled triangle clearance against the shipped Ender-3 bodies.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {GLTFLoader} from '../site/viewer/vendor-r180/GLTFLoader.js';
import {Vector3} from '../site/viewer/vendor-r180/three.module.js';
import {createCommunityAdapter} from '../site/viewer/community-adapter.mjs';
import {nativeMotion,displayMotion} from '../site/viewer/community-state.mjs';
import {enderBowdenRoute,enderBowdenSpec} from '../site/viewer/ender-bowden-route.mjs';
import {enderBowdenShapes} from '../site/viewer/ender-bowden-shapes.mjs';
import {auditFlexRoute,segmentTriangleDistance} from './flex-route-quality.mjs';
import {fetchPinnedSource} from './fetch_pinned_source.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const repo=fileURLToPath(new URL('../',import.meta.url));
export async function auditEnderBowden({site,assets,report:reportPath}={}){
 const index=JSON.parse(fs.readFileSync(path.join(site,'COMMUNITY_MACHINES_ASSETS.json'))),spec=index.machines.ender3_stock_220;
 assert.equal(spec.machine_id,'ender3_stock_220');
 assert.equal(enderBowdenShapes.source_manifest_sha256,spec.files['assembly_manifest.json'].sha256);
 assert.equal(enderBowdenShapes.source_profile_sha256,spec.files['machine_profile.json'].sha256);
 assert.equal(enderBowdenShapes.source_model_sha256,spec.files['model.glb'].decoded_sha256);
 assert.equal(enderBowdenShapes.length_mm,enderBowdenSpec.length_mm);
 const pins={},checked=async name=>{
  const pin=spec.files[name];assert(pin,'Missing exact Ender-3 input '+name);
  const file=assets&&path.join(assets,pin.path);
  const raw=file&&fs.existsSync(file)?fs.readFileSync(file):await fetchPinnedSource(new URL(pin.path,spec.base_url??index.base_url),pin);
  assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);
  const decoded=pin.encoding==='gzip'?gunzipSync(raw):raw;
  if(pin.encoding==='gzip'){assert.equal(decoded.length,pin.decoded_bytes);assert.equal(hash(decoded),pin.decoded_sha256);}
  pins[name]={sha256:pin.sha256,bytes:pin.bytes,decoded_sha256:pin.decoded_sha256??pin.sha256};return decoded;
 };
 const manifest=JSON.parse(await checked('assembly_manifest.json')),profile=JSON.parse(await checked('machine_profile.json'));
 let root;for(const name of ['model.glb',...(spec.additional_models||[])]){
  const raw=await checked(name),scene=(await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
  if(root)root.add(scene);else root=scene;
 }
 const adapter=createCommunityAdapter(root,manifest,profile);assert.equal(adapter.nodes.size,spec.parts);
 const sources=['site/viewer/ender-bowden-route.mjs','site/viewer/ender-bowden-shapes.mjs','site/viewer/community-adapter.mjs','site/viewer/community-state.mjs','scripts/flex-route-quality.mjs','scripts/fetch_pinned_source.mjs','scripts/audit_ender_bowden.mjs'];
 const sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(fs.readFileSync(path.join(repo,p)))]));
 global.gc?.();const bodies=[],point=new Vector3(),omitted=[];
 for(const [key,node]of adapter.nodes){const row=adapter.records.get(key);
  if(['reference','belted_z','tube','belt','x_belt','registered_flex','compound_motion','chain','bed_wire'].includes(row.group)){omitted.push({key,group:row.group});continue;}
  node.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position,ix=mesh.geometry.index,count=(ix?.count??a?.count);
   assert(a&&a.itemSize===3&&count>0&&count%3===0,'Missing or empty rigid exported triangles: '+key);assert(a.array.every(Number.isFinite),'Nonfinite rigid exported vertices: '+key);
   assert(mesh.matrixWorld.elements.every(Number.isFinite),'Nonfinite rigid exported transform: '+key);
   const triangles=new Float64Array(count*3),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<count;i+=3){const at=i*3;for(let j=0;j<3;j++){const n=ix?ix.getX(i+j):i+j;assert(Number.isInteger(n)&&n>=0&&n<a.count,'Invalid rigid triangle index: '+key);point.fromBufferAttribute(a,n).applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);assert(point.toArray().every(Number.isFinite),'Nonfinite rigid world triangle: '+key);triangles.set(point.toArray(),at+j*3);}
    for(let j=0;j<3;j++){min[j]=Math.min(min[j],triangles[at+j],triangles[at+3+j],triangles[at+6+j]);max[j]=Math.max(max[j],triangles[at+j],triangles[at+3+j],triangles[at+6+j]);}}
   bodies.push({key,row,triangles,min,max});
  });
 }
 const shapeCache=new Map(),surfaceCache=new Map(),rows=[],findings=[];let triangleTests=0,minGap=Infinity,surfaceReuses=0;
 const vector=native=>displayMotion(native,profile).map(v=>v*1000);
 for(const [configuration,c]of Object.entries(profile.configurations)){
  if((c.filament_path??'bowden')!=='bowden')continue;
  adapter.setConfiguration(configuration);const ranges={...profile.axes,...c.axes};
  const xs=Array.from({length:9},(_,i)=>ranges.x[0]+(ranges.x[1]-ranges.x[0])*i/8);
  const poses=[];for(const x of xs)for(const z of [...new Set([ranges.z[0],-20,0,40,80,100,120,140,160,180,ranges.z[1]].filter(z=>z>=ranges.z[0]&&z<=ranges.z[1]))])for(const y of [ranges.y[0],0,ranges.y[1]])poses.push({x,y,z});
  poses.push(...poses.slice().reverse(),{x:0,y:0,z:0});
  let configurationGap=Infinity;
  for(const axes of poses){adapter.setAxes(axes);const route=enderBowdenRoute(axes,profile,configuration),belted=c.selection?.z==='belted';
   const cacheKey=JSON.stringify([axes.x,axes.z,belted,c.rest_offsets_mm?.[enderBowdenSpec.head_key]??null,c.rest_offsets_mm?.[belted?enderBowdenSpec.belted_key:enderBowdenSpec.stock_key]??null]);
   if(!shapeCache.has(cacheKey)){
    const flat=enderBowdenRoute(axes,profile,configuration);
    const quality=auditFlexRoute(flat.curve,{units:'m',tubeRadiusMm:2,minBendRadiusMm:30,maxSegmentLengthMm:8,chordToleranceMm:.04,
     start:{positionMm:vector(flat.endpoints_mm[0]),axis:vector([1,0,0])},end:{positionMm:vector(flat.endpoints_mm[1]),axis:vector([0,-1,0])}});
    assert(quality.ok,JSON.stringify({configuration,axes,findings:quality.findings}));
    assert(Math.abs(quality.metrics.lengthMm-enderBowdenSpec.length_mm)<.1);shapeCache.set(cacheKey,quality);
   }
   const quality=shapeCache.get(cacheKey),shift=vector([0,0,0]),samples=quality.samples.map(s=>({...s,positionMm:s.positionMm.map((v,i)=>v+shift[i])}));
   const margin=2+quality.sampling.observedChordDeviationMm+.005;
   const tube=adapter.bowden.meshes[0];assert(tube.visible&&tube.geometry.attributes.position.array.every(Number.isFinite));
   assert.deepEqual(tube.userData.endpoints_mm,route.endpoints_mm);
   const hidden=new Set(c.hidden_keys||[]);
   for(const body of bodies){if(hidden.has(body.key))continue;
    const motion=vector(nativeMotion(body.row.group,axes,profile)),rest=vector(c.rest_offsets_mm?.[body.key]||[0,0,0]),delta=motion.map((v,i)=>v+rest[i]);
    const startFitting=body.key===(belted?enderBowdenSpec.belted_key:enderBowdenSpec.stock_key),endFitting=body.key===enderBowdenSpec.head_key;
    const surfaceKey=JSON.stringify([body.key,cacheKey,shift.map((v,i)=>v-delta[i]),startFitting,endFitting]);
    if(surfaceCache.has(surfaceKey)){surfaceReuses++;configurationGap=Math.min(configurationGap,surfaceCache.get(surfaceKey));continue;}
    let bodyGap=Infinity;
    for(let k=1;k<samples.length;k++){
     let a=samples[k-1],b=samples[k];
     // Only the mating face's first/last 3 mm are exempted, never another body.
     const lo=startFitting?3:0,hi=endFitting?quality.metrics.lengthMm-3:quality.metrics.lengthMm;
     if(b.arcLengthMm<=lo||a.arcLengthMm>=hi)continue;
     const clip=s=>a.positionMm.map((v,i)=>v+(b.positionMm[i]-v)*(s-a.arcLengthMm)/(b.arcLengthMm-a.arcLengthMm));
     let p=a.arcLengthMm<lo?clip(lo):a.positionMm,q=b.arcLengthMm>hi?clip(hi):b.positionMm;
     p=p.map((v,i)=>v-delta[i]);q=q.map((v,i)=>v-delta[i]);
     // Search farther than the rejection band so nearby surfaces have measured
     // triangle distances too, even when every conservative box rejects contact.
     const searchMargin=margin+10;
     const min=p.map((v,i)=>Math.min(v,q[i])-searchMargin),max=p.map((v,i)=>Math.max(v,q[i])+searchMargin);
     if(min.some((v,i)=>v>body.max[i]||max[i]<body.min[i]))continue;
     const data=body.triangles;
     for(let at=0;at<data.length;at+=9){if(min.some((v,i)=>v>Math.max(data[at+i],data[at+3+i],data[at+6+i])||max[i]<Math.min(data[at+i],data[at+3+i],data[at+6+i])))continue;
      const triangle=[Array.from(data.subarray(at,at+3)),Array.from(data.subarray(at+3,at+6)),Array.from(data.subarray(at+6,at+9))];
      triangleTests++;const distance=segmentTriangleDistance(p,q,triangle),gap=distance-2;minGap=Math.min(minGap,gap);configurationGap=Math.min(configurationGap,gap);
      bodyGap=Math.min(bodyGap,gap);
      if(distance<=margin){findings.push({configuration,axes,part_key:body.key,segment:k-1,centerline_distance_mm:distance,required_distance_mm:margin});break;}
     }
     if(findings.length)break;
    }
    if(!findings.length)surfaceCache.set(surfaceKey,bodyGap);
    if(findings.length)break;
   }
   if(findings.length)break;
  }
  let adaptivePoses=0;
  const poseShape=p=>{const curve=enderBowdenRoute(p,profile,configuration).curve;return Array.from({length:33},(_,i)=>curve.getPoint(i/32).multiplyScalar(1000).toArray());};
  const poseDistance=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(...p.map((v,j)=>v-b[i][j]))));
  function transition(a,b,sa=poseShape(a),sb=poseShape(b),depth=0){
   const mid=Object.fromEntries(Object.keys(a).map(k=>[k,(a[k]+b[k])/2])),sm=poseShape(mid);
   const deviation=poseDistance(sm,sa.map((p,i)=>p.map((v,j)=>(v+sb[i][j])/2)));
   if(poseDistance(sa,sb)>8||deviation>.25){assert(depth<12,'Adaptive route transition did not converge');transition(a,mid,sa,sm,depth+1);transition(mid,b,sm,sb,depth+1);return;}
   for(const p of [a,mid,b]){adapter.setAxes(p);const tube=adapter.bowden.meshes[0];assert(tube.visible);assert(tube.geometry.attributes.position.array.every(Number.isFinite));assert(tube.geometry.attributes.normal.array.every(Number.isFinite));
    assert.deepEqual(tube.userData.endpoints_mm,enderBowdenRoute(p,profile,configuration).endpoints_mm);adaptivePoses++;}
  }
  if(!findings.length){const low=Object.fromEntries(Object.entries(ranges).map(([k,r])=>[k,r[0]])),high=Object.fromEntries(Object.entries(ranges).map(([k,r])=>[k,r[1]]));
   transition(low,high);transition(high,low);
   for(const axis of Object.keys(ranges)){const a={x:0,y:0,z:0,[axis]:ranges[axis][0]},b={x:0,y:0,z:0,[axis]:ranges[axis][1]};transition(a,b);transition(b,a);}
  }
  rows.push({configuration,poses:poses.length,adaptive_route_poses:adaptivePoses,passed:!findings.length,min_tested_surface_gap_mm:Number.isFinite(configurationGap)?configurationGap:null});
  if(findings.length)break;
 }
 adapter.setConfiguration('stock');adapter.setAxes({x:0,y:0,z:0});
 const report={schema:'ender3-ptfe-shape-and-exported-surface-review-v1',passed:!findings.length,inputs:pins,source_sha256:sourceHashes,
  rows,findings,shape_samples:[...shapeCache.entries()].map(([key,q])=>({key,metrics:q.metrics,sampling:q.sampling})),triangle_tests:triangleTests,identical_rigid_surface_checks_reused:surfaceReuses,
  minimum_nearby_surface_gap_mm:Number.isFinite(minGap)?minGap:null,
  fitting_exclusions:[{part_keys:[enderBowdenSpec.stock_key,enderBowdenSpec.belted_key],end:'start',arc_mm:3},{part_keys:[enderBowdenSpec.head_key],end:'end',arc_mm:3}],
  excluded_nonrigid_source_bodies:omitted,
  adaptive_motion_tolerances:{max_observed_centerline_step_mm:8,max_observed_midpoint_deviation_mm:.25,points_per_shape:33,certified_swept_error_bound:false},
  scope:'All registered Bowden installations; named finite forward/reversed triangle-clearance poses; separately adaptive axis/diagonal transitions check actual generated tube visibility, finite geometry/normals and fitting attachment. Adaptive centerline shape, fitting axes, service length and self-distance are recorded. Broad-phase boxes only filter triangle tests. Flexible source bodies, source solid containment, manufacturing tolerances, strain and continuous swept/native-solid clearance are not certified.',
  native_solid_clearance_verified:false,browser_review:false};
 for(const [name,pin]of Object.entries(sourceHashes))assert.equal(hash(fs.readFileSync(path.join(repo,name))),pin,'Source changed during audit');
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 assert(report.passed,JSON.stringify(findings));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v.slice(2),a[i+1]]],[]));
 assert(args.site&&args.report,'--site and --report required');
 const result=await auditEnderBowden(args);console.log(JSON.stringify({passed:result.passed,installations:result.rows.length,poses:result.rows.reduce((n,r)=>n+r.poses,0),triangle_tests:result.triangle_tests}));
}

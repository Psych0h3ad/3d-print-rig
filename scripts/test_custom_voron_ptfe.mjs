import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {constantCustomTubeRoute,customTubeCurve,customTubeGeometry,createCustomTube} from '../site/viewer/custom-voron-tube.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';

export const fixtureSpec={route_type:'constant_cut_lsl_ellipse_93',machine_id:'voron_trident_500_custom',part_key:'voron_trident_350_base_1409',holder_part_key:'voron_trident_350_base_1393',start_mm:[0,-35.880961,432.660258],end_mm:[345.1625295410766,171.98175283421568,515.8999999999962],radius_mm:2,inner_radius_mm:1.5,plane_z_mm:475,inlet_bend_radius_mm:20,planar_bend_radius_mm:20,guide_bend_radius_mm:25,roof_guide_xy_mm:[0,260],storage_start_mm:[0,260,560],storage_end_mm:[345.1625295410766,300,560],tail_controls_mm:[[345.1625295410766,300,560],[345.1625295410766,300,500],[345.16252954107694,243.39839201394474,489.9064691072454],[345.16252954107665,187.01683476679023,510.4276777067855]],tail_length_mm:149.56018676206128,holder_lead_length_mm:16,minimum_design_radius_mm:20,cut_length_mm:1410,reference_xyz_mm:[249.60606718710815,251.63501757013745,0],display_limits_mm:{X:[0,500],Y:[0,500],Z:[0,250]}};
const mates={'voron_trident_350_base_1409':'29fa151d241090c622ac2655e8c01a4e14c0c96bb78e888b632af71f5f7377bf','voron_trident_350_base_1393':'05654bb66f978d3915f06c7da020ac9397031c8343c852b66e92f43f8a43ee47','578':'3e2ed880b86cda700c2652a3b6ca47b807764e0d3f64252d5bf509b4523f4d62','voron_trident_350_base_1359':'5c3afbfe96c2d0dbeff9fe2846b32876f860443e68ad4811c387ffcb00f65068'};
const near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);
const cad=p=>[p.x*1000,-p.z*1000,p.y*1000];
const vectorNear=(a,b,eps=1e-7)=>a.forEach((v,i)=>near(v,b[i],eps));
function quality(g){
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.index;assert(p&&n&&index);assert(p.array.every(Number.isFinite));assert(n.array.every(Number.isFinite));let worstNormal=0,minDot=1;
 for(let i=0;i<n.count;i++)worstNormal=Math.max(worstNormal,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));assert(worstNormal<1e-6);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),cross=new THREE.Vector3();
 for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];assert(ids.every(v=>Number.isInteger(v)&&v>=0&&v<p.count));a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);cross.crossVectors(b.sub(a),c.sub(a));assert(cross.lengthSq()>1e-24,'collapsed triangle');normal.set(0,0,0);for(const id of ids)normal.add(new THREE.Vector3().fromBufferAttribute(n,id));const dot=cross.normalize().dot(normal.normalize());assert(dot>0,'triangle winding opposes normals');minDot=Math.min(minDot,dot)}
 return {vertices:p.count,triangles:index.count/3,max_unit_normal_error:worstNormal,min_winding_normal_dot:minDot};
}
function independentLength(curve){let sum=0;for(const part of curve.curves){let last=part.getPoint(0);for(let i=1;i<=20000;i++){const point=part.getPoint(i/20000);sum+=point.distanceTo(last)*1000;last=point}}return sum}
export function runCustomTubeRegression({spec=fixtureSpec,mesh,manifest,profile}={}){
 const ref=spec.reference_xyz_mm;profile??={machine_id:spec.machine_id,kinematics:'trident',size_mm:500,display_reference_xyz_mm:ref,display_limits_mm:spec.display_limits_mm};
 mesh??=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xf6f6f6}));mesh.userData.part_key=spec.part_key;
 manifest??={machine_id:spec.machine_id,custom_ptfe:spec,parts:Object.entries(mates).map(([key,native_sha256])=>({key,native_sha256}))};
 const root=new THREE.Group();root.add(mesh);const originalGeometry=mesh.geometry,originalMaterial=mesh.material,sourceSpec=JSON.stringify(spec),sourceMeta=JSON.stringify(manifest),sourceProfile=JSON.stringify(profile);const tube=createCustomTube(root,manifest);let rejections=0;
 const numeric=[];for(let x=0;x<=500;x+=50)for(let y=0;y<=500;y+=50){const route=constantCustomTubeRoute(spec,x-ref[0],y-ref[1]);near(route.totalLengthMm,1410,1e-8);const a=route.storageRadiusMm,h=route.storageHeightMm;assert(Math.min(a*a/h,h*h/a)>=20);numeric.push({xyz_mm:[x,y,0],height_mm:h,length_mm:route.totalLengthMm})}
 const poses=[ref,[0,0,0],[500,500,250],[0,500,250],[500,0,0],[250,250,125],[125,375,250],[375,125,0]];poses.push(...poses.slice().reverse(),ref);const results=[];
 for(const xyz of poses){const dx=xyz[0]-ref[0],dy=xyz[1]-ref[1],curve=customTubeCurve(spec,dx,dy);near(curve.getLength()*1000,1410,1e-8);vectorNear(cad(curve.getPoint(0)),[spec.start_mm[0]+dx,spec.start_mm[1]+dy,spec.start_mm[2]]);vectorNear(cad(curve.getPoint(1)),spec.end_mm);
  for(let i=0;i<curve.curves.length-1;i++){vectorNear(curve.curves[i].getPoint(1).toArray(),curve.curves[i+1].getPoint(0).toArray(),1e-10);assert(curve.curves[i].getTangent(1).dot(curve.curves[i+1].getTangent(0))>1-1e-10,'tangent discontinuity')}
  const measured=independentLength(curve);near(measured,1410,1e-5);tube.update(dx,dy,true);assert(mesh.visible);assert.equal(mesh.material,originalMaterial);results.push({xyz_mm:xyz,independent_polyline_length_mm:measured,mesh:quality(mesh.geometry)});
  // The two concentric skins retain the 4/3 mm purchased tube cross-section.
  const p=mesh.geometry.getAttribute('position'),layers=769*25;for(const i of [0,384,768]){const center=curve.getPointAt(i/768);for(const [shell,radius]of [[0,.002],[1,.0015]])near(new THREE.Vector3().fromBufferAttribute(p,shell*layers+i*25).distanceTo(center),radius,1e-7)}
 }
 tube.update(0,0,false);assert(!mesh.visible);tube.update(0,0,true);assert(mesh.visible);const resetPositions=mesh.geometry.getAttribute('position').array.slice();tube.update(500-ref[0],500-ref[1]);tube.update(0,0);assert.deepEqual(mesh.geometry.getAttribute('position').array,resetPositions);
 const badSpec=mutate=>{const bad=structuredClone(spec);mutate(bad);assert.throws(()=>constantCustomTubeRoute(bad));rejections++};
 for(const [key,value]of [['route_type','unknown'],['machine_id','voron_v24_500_custom'],['part_key','unknown'],['holder_part_key','unknown'],['radius_mm',3],['inner_radius_mm',0],['cut_length_mm',100],['plane_z_mm',NaN]])badSpec(s=>s[key]=value);
 badSpec(s=>s.start_mm[0]=Infinity);badSpec(s=>s.roof_guide_xy_mm[0]=NaN);badSpec(s=>s.display_limits_mm.X[0]=NaN);badSpec(s=>s.tail_controls_mm=[]);
 for(const delta of [[NaN,0],[Infinity,0],[0,-Infinity],[-ref[0]-1,0],[501-ref[0],0],[0,-ref[1]-1],[0,501-ref[1]]]){const before=mesh.geometry;assert.throws(()=>tube.update(...delta));assert.equal(mesh.geometry,before,'rejected input changed current geometry');assert.deepEqual(mesh.geometry.getAttribute('position').array,resetPositions);rejections++}
 for(const key of Object.keys(mates)){const bad=structuredClone(manifest);bad.parts.find(r=>r.key===key).native_sha256='0'.repeat(64);assert.throws(()=>createCustomTube(root,bad));rejections++}
 for(const key of Object.keys(mates)){const bad=structuredClone(manifest);bad.parts=bad.parts.filter(r=>r.key!==key);assert.throws(()=>createCustomTube(root,bad));rejections++}
 const badMachine=structuredClone(manifest);badMachine.machine_id='voron_trident_350_half_z';assert.throws(()=>createCustomTube(root,badMachine));rejections++;assert.equal(createCustomTube(root,{parts:[]}),null);
 // Execute the real UI helper with the actual production adapter, rather than a guessed clamp.
 const app=fs.readFileSync(new URL('../site/viewer/custom-voron.js',import.meta.url),'utf8'),helper=app.slice(app.indexOf(' function applyPose(){'),app.indexOf('\n function applyPalette(){'));assert(helper.includes('current.display_xyz_mm'));
 const adapter=createTridentMotion(profile),inputs=Object.fromEntries(['x','y','z'].flatMap((a,i)=>[[a,{value:ref[i]}],[a+'v',{textContent:''}]]));inputs.belts={checked:true};const body={dataset:{}},calls=[],context={adapter,profile,externalPtfe:null,tube:{update:(...args)=>calls.push(args)},current:null,$:id=>inputs[id],document:{body},render(){}};vm.createContext(context);vm.runInContext(helper+';globalThis.apply=applyPose',context);
 for(const xyz of [[700,-50,999],[0,500,0],[500,0,250],ref]){['x','y','z'].forEach((a,i)=>inputs[a].value=xyz[i]);context.apply();const actual=xyz.map((v,i)=>Math.max(0,Math.min([500,500,250][i],v)));assert.deepEqual(JSON.parse(body.dataset.pose),actual);actual.forEach((v,i)=>near(Number(inputs[['x','y','z'][i]].value),v));vectorNear(calls.at(-1).slice(0,2),[actual[0]-ref[0],actual[1]-ref[1]]);assert.equal(inputs.zv.textContent,actual[2].toFixed(2)+' mm')}
 inputs.x.value=NaN;assert.throws(()=>context.apply());rejections++;
 tube.dispose();assert.equal(mesh.geometry,originalGeometry);assert.equal(JSON.stringify(spec),sourceSpec);assert.equal(JSON.stringify(manifest),sourceMeta);assert.equal(JSON.stringify(profile),sourceProfile);
 return {passed:true,numeric_poses:numeric,mesh_poses:results,rejection_checks:rejections,source_metadata_unchanged:true,actual_UI_helper_and_production_adapter:true,full_machine_native_continuous_clearance_certified:false};
}
if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').toLowerCase()===process.argv[1].replaceAll('\\','/').toLowerCase()){const report=runCustomTubeRegression();console.log(JSON.stringify({passed:report.passed,numeric_poses:report.numeric_poses.length,mesh_poses:report.mesh_poses.length,rejection_checks:report.rejection_checks}))}

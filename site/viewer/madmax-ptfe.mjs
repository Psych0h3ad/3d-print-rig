import * as THREE from 'three';
import {hollowTubeGeometry} from './custom-voron-tube.mjs?v=be16dba6afffddec260f';

// Native Xol r16 ECAS bore and upper lip; millimetres in the original Xol export.
// Only the flexible viewer route changes. Purchased fittings and STEP stay native.
export const madmaxPtfePort=Object.freeze({key:'xol_321',point_mm:[-.09999065669969168,-23.960002477594628,413.1176023963394],axis:[0,0,1],radius_mm:2,inner_radius_mm:1.5});
export function madmaxPtfeAssetSpec(machine,id,spec){return spec&&/^voron_trident_(250|300|350)$/.test(machine)&&id==='xol'?{...spec,metadata_sha256:'bc78d4c2ea028fedbacccbcf7f4607505ddfcc7dbb7511bb7186aaca74b53e32',decoded_model_sha256:'7d91de1ae7b0fba352210f2eb6307b19c13930b1c9ec5c4de30e57e60f61a081'}:spec;}
const variantId='installed__trident_r2__v21__madmax__xol__sherpa_mini__rapido2_uhf';
const point=([x,y,z])=>new THREE.Vector3(x/1000,z/1000,-y/1000);
const cad=p=>[p.x*1000,-p.z*1000,p.y*1000];
export function madmaxPtfeApplies(machine,v){
 return /^voron_trident_(250|300|350)$/.test(machine)&&v?.id===variantId&&v.toolhead==='xol'&&v.extruder==='sherpa_mini'&&v.hotend==='rapido2_uhf'&&v.mount==='madmax'&&v.carriage==='madmax_xol'&&v.gantry==='trident_r2'&&v.registration_source==='madmax_xol'&&v.machine_head?.base==='xol'&&v.machine_head.source_variant==='v21__madmax__xol__sherpa_mini__rapido2_uhf'&&!v.machine_head.hidden?.includes(madmaxPtfePort.key);
}
export function madmaxPtfeCurve(machine,start){
 const size=Number(machine.match(/^voron_trident_(250|300|350)$/)?.[1]);
 if(!size||!Array.isArray(start)||start.length!==3||!start.every(Number.isFinite))throw Error('Invalid MadMax PTFE datum');
 const dy=(size-250)/2,guide=[47.64908429185735,207.4723304648004+dy,464.19999997913783],guideEnd=[65.32675382152311,225.14999999446155+dy,464.1999999791379];
 const tail=[269.9999999998315,129.98175283420107+dy,513.1338262195733],end=[269.9999999998556,85.62882323077105+dy,528.4698150888082],axis=[0,-.9450976534473124,.32678804361295677];
 const exit=[start[0],start[1],start[2]+20],path=new THREE.CurvePath();
 const line=(a,b)=>path.add(new THREE.LineCurve3(point(a),point(b)));
 const cubic=(...p)=>path.add(new THREE.CubicBezierCurve3(...p.map(point)));
 line(start,exit);
 cubic(exit,[exit[0],exit[1],Math.max(exit[2]+35,guide[2]+20)],[guide[0]-45,guide[1]-45,guide[2]],guide);
 line(guide,guideEnd);
 cubic(guideEnd,[guideEnd[0]+55,guideEnd[1]+55,guideEnd[2]],tail.map((n,i)=>n-axis[i]*60),tail);
 line(tail,end);
 // CurvePath's built-in tangentAt resamples across straight/curved boundaries.
 // Use exact segment tangents so both native end sections remain coaxial.
 const lengths=path.getCurveLengths(),total=lengths.at(-1);
 path.getPointAt=path.getPoint.bind(path);
 path.getTangentAt=(u,target=new THREE.Vector3())=>{const distance=u*total;for(let i=0;i<path.curves.length;i++)if(distance<=lengths[i]||i===path.curves.length-1){const c=path.curves[i],t=Math.max(0,Math.min(1,1-(lengths[i]-distance)/c.getLength()));return target.copy(c.getTangentAt(t));}};
 path.getTangent=path.getTangentAt;
 return {curve:path,end_mm:end,guide_mm:guide,length_mm:total*1000};
}
export function createMadmaxPtfe(scene,base,manifest,profile,heads){
 const key=profile.machine_id+'_base_1409',row=manifest.parts.find(p=>p.key===key);
 if(!row||row.source_leaf!=='1409'||row.name!=='PTFE_Tube A (4x3mm)'||row.motion!=='reference_flexible')throw Error('Native Trident PTFE source identity changed');
 let source;base.traverse(o=>{if(o.isMesh&&(o.userData.part_key||o.name)===key)source=o});
 if(!source||Array.isArray(source.material))throw Error('Native Trident PTFE source missing');
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),source.material);mesh.name='MADMAX_NATIVE_PORT_PTFE_PREVIEW';mesh.userData={appearance_role:'hardware',native_material_source:key,external_ptfe_preview:true,native_step_part:false};mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
 let last='',diagnostics={active:false};
 return {mesh,source,update(variant,visible=true){
  const active=madmaxPtfeApplies(profile.machine_id,variant);
  mesh.visible=active&&Boolean(visible);source.visible=!active&&Boolean(visible);
  if(!active){last='';diagnostics={active:false,native_restored:true};return diagnostics;}
  const entry=heads.cache.get('xol')?.loaded?.entries.find(e=>e.key===madmaxPtfePort.key);
  if(!entry?.mesh.visible)throw Error('MadMax original ECAS inlet missing');
  entry.mesh.updateWorldMatrix(true,false);
  const inlet=entry.mesh.localToWorld(point(madmaxPtfePort.point_mm)),start=cad(inlet),state=start.join(',');
  if(state!==last){const r=madmaxPtfeCurve(profile.machine_id,start),geometry=hollowTubeGeometry(r.curve,madmaxPtfePort,384,24);mesh.geometry.dispose();mesh.geometry=geometry;last=state;diagnostics={active:true,start_mm:start,end_mm:r.end_mm,length_mm:r.length_mm,port_key:madmaxPtfePort.key,port_axis:[0,0,1],preview_only:true,constant_cut_length_certified:false,whole_route_clearance_certified:false};}
  return diagnostics;
 },dispose(){scene.remove(mesh);mesh.geometry.dispose();source.visible=true;}};
}

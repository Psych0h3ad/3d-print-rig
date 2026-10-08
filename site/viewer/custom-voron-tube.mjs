import * as THREE from './vendor/three.module.js';
import {isRoofTubeSource,roofCustomTubeCurve,roofCustomTubeRoute} from './trident-roof-tube.mjs?v=3c2b6b629363a92659ed';
const world=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
const gaussX=[-.9894009349916499,-.9445750230732326,-.8656312023878318,-.755404408355003,-.6178762444026438,-.4580167776572274,-.2816035507792589,-.09501250983763745,.09501250983763745,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const gaussW=[.027152459411754095,.062253523938647706,.09515851168249259,.12462897125553387,.14959598881657674,.16915651939500262,.18260341504492358,.1894506104550685,.1894506104550685,.18260341504492358,.16915651939500262,.14959598881657674,.12462897125553387,.09515851168249259,.062253523938647706,.027152459411754095];
const ellipseLength=(a,h)=>{let sum=0;for(let j=0;j<8;j++){const lo=j*Math.PI/8,hi=(j+1)*Math.PI/8,half=(hi-lo)/2,mid=(hi+lo)/2;for(let i=0;i<16;i++){const t=mid+half*gaussX[i];sum+=half*gaussW[i]*Math.hypot(a*Math.sin(t),h*Math.cos(t))}}return sum};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s);
/** Exact native-mate route. Slack moves in an ellipse; the cut length stays fixed. */
export function constantCustomTubeRoute(spec,dx=0,dy=0){
 if(spec.route_type!=='constant_cut_lsl_ellipse_93'||spec.machine_id!=='voron_trident_500_custom'||spec.part_key!=='voron_trident_350_base_1409'||spec.holder_part_key!=='voron_trident_350_base_1393'||spec.radius_mm!==2||spec.inner_radius_mm!==1.5)throw Error('Unsupported constant PTFE source');
 const scalar=['plane_z_mm','inlet_bend_radius_mm','planar_bend_radius_mm','guide_bend_radius_mm','cut_length_mm','tail_length_mm','holder_lead_length_mm','minimum_design_radius_mm'];
 if(![dx,dy,...scalar.map(k=>spec[k])].every(Number.isFinite)||scalar.slice(1).some(k=>spec[k]<=0))throw Error('Invalid constant PTFE dimensions');
 if(!Array.isArray(spec.tail_controls_mm)||spec.tail_controls_mm.length!==4)throw Error('Invalid native PTFE tail');
 for(const values of [spec.start_mm,spec.end_mm,spec.reference_xyz_mm,spec.storage_start_mm,spec.storage_end_mm,...spec.tail_controls_mm])if(!Array.isArray(values)||values.length!==3||!values.every(Number.isFinite))throw Error('Non-finite native PTFE datum');
 if(!Array.isArray(spec.roof_guide_xy_mm)||spec.roof_guide_xy_mm.length!==2||!spec.roof_guide_xy_mm.every(Number.isFinite))throw Error('Non-finite PTFE roof guide');
 for(const[i,a]of ['X','Y'].entries()){const value=spec.reference_xyz_mm[i]+[dx,dy][i],limits=spec.display_limits_mm?.[a];if(!Array.isArray(limits)||limits.length!==2||!limits.every(Number.isFinite)||limits[0]>=limits[1])throw Error('Invalid PTFE source travel');if(value<limits[0]-1e-8||value>limits[1]+1e-8)throw Error('PTFE pose outside source travel')}
 if(isRoofTubeSource(spec))return roofCustomTubeRoute(spec,dx,dy);
 const start=add(spec.start_mm,[dx,dy,0]),z=spec.plane_z_mm,rh=spec.inlet_bend_radius_mm,r=spec.planar_bend_radius_mm,rg=spec.guide_bend_radius_mm;
 const stem=[start[0],start[1],z-rh],headEnd=[start[0]+rh,start[1],z],guideStart=[spec.roof_guide_xy_mm[0],spec.roof_guide_xy_mm[1]+rg,z],guideEnd=[spec.roof_guide_xy_mm[0],spec.roof_guide_xy_mm[1],z+rg];
 const c0=add(headEnd,[0,r,0]),c1=add(guideStart,[r,0,0]),delta=sub(c1,c0),distance=Math.hypot(...delta),unit=scale(delta,1/distance),angle=Math.atan2(unit[1],unit[0]),offset=scale([unit[1],-unit[0],0],r),t0=add(c0,offset),t1=add(c1,offset);
 if(!(stem[2]>start[2]&&angle>0&&angle<Math.PI&&distance>2*r+2*spec.radius_mm))throw Error('PTFE tangent domain changed');
 const inner=z-rh-start[2]+Math.PI*rh/2+distance+3*Math.PI*r/2+Math.PI*rg/2+spec.storage_start_mm[2]-(z+rg);
 const span=sub(spec.storage_end_mm,spec.storage_start_mm),a=Math.hypot(...span)/2,target=spec.cut_length_mm-inner-spec.tail_length_mm-spec.holder_lead_length_mm;
 let lo=Math.sqrt(a*spec.minimum_design_radius_mm),hi=a*a/spec.minimum_design_radius_mm;
 if(target<ellipseLength(a,lo)||target>ellipseLength(a,hi))throw Error('PTFE cut length cannot reach this pose');
 for(let i=0;i<56;i++){const mid=(lo+hi)/2;if(ellipseLength(a,mid)<target)lo=mid;else hi=mid}
 const height=(lo+hi)/2;
 return {start,stem,headEnd,c0,c1,t0,t1,angle,guideStart,guideEnd,storageHeightMm:height,storageAxis:scale(span,1/(2*a)),storageRadiusMm:a,totalLengthMm:inner+ellipseLength(a,height)+spec.tail_length_mm+spec.holder_lead_length_mm};
}
function nativeCurve(point,tangent,length){
 const curve=new THREE.Curve();curve.arcLengthDivisions=1024;curve.getPoint=t=>world(point(t));curve.getTangent=t=>world(tangent(t)).normalize();curve.getLength=()=>length/1000;return curve;
}
function constantTubeCurve(spec,dx,dy){
 const f=constantCustomTubeRoute(spec,dx,dy),path=new THREE.CurvePath(),line=(a,b)=>path.add(new THREE.LineCurve3(world(a),world(b))),arc=(center,r,start,sweep)=>path.add(nativeCurve(t=>add(center,[r*Math.cos(start+sweep*t),r*Math.sin(start+sweep*t),0]),t=>[-Math.sin(start+sweep*t),Math.cos(start+sweep*t),0],r*sweep));
 line(f.start,f.stem);const rh=spec.inlet_bend_radius_mm,rg=spec.guide_bend_radius_mm;
 path.add(nativeCurve(t=>add(f.stem,[rh*(1-Math.cos(t*Math.PI/2)),0,rh*Math.sin(t*Math.PI/2)]),t=>[Math.sin(t*Math.PI/2),0,Math.cos(t*Math.PI/2)],rh*Math.PI/2));
 arc(f.c0,spec.planar_bend_radius_mm,-Math.PI/2,f.angle);line(f.t0,f.t1);arc(f.c1,spec.planar_bend_radius_mm,f.angle-Math.PI/2,3*Math.PI/2-f.angle);
 path.add(nativeCurve(t=>add(f.guideStart,[0,-rg*Math.sin(t*Math.PI/2),rg*(1-Math.cos(t*Math.PI/2))]),t=>[0,-Math.cos(t*Math.PI/2),Math.sin(t*Math.PI/2)],rg*Math.PI/2));line(f.guideEnd,spec.storage_start_mm);
 const a=f.storageRadiusMm,h=f.storageHeightMm,d=f.storageAxis;
 path.add(nativeCurve(t=>add(spec.storage_start_mm,add(scale(d,a*(1-Math.cos(t*Math.PI))),[0,0,h*Math.sin(t*Math.PI)])),t=>add(scale(d,a*Math.sin(t*Math.PI)),[0,0,h*Math.cos(t*Math.PI)]),ellipseLength(a,h)));
 const tail=new THREE.CubicBezierCurve3(...spec.tail_controls_mm.map(world));tail.arcLengthDivisions=1024;tail.getLength=()=>spec.tail_length_mm/1000;
 tail.getTangent=t=>world(add(add(scale(sub(spec.tail_controls_mm[1],spec.tail_controls_mm[0]),3*(1-t)**2),scale(sub(spec.tail_controls_mm[2],spec.tail_controls_mm[1]),6*(1-t)*t)),scale(sub(spec.tail_controls_mm[3],spec.tail_controls_mm[2]),3*t*t))).normalize();
 path.add(tail);line(spec.tail_controls_mm.at(-1),spec.end_mm);return path;
}
export function customTubeCurve(spec,dx=0,dy=0){
 if(isRoofTubeSource(spec)){if(spec.route_type)constantCustomTubeRoute(spec,dx,dy);return roofCustomTubeCurve(spec,dx,dy)}
 if(spec.route_type)return constantTubeCurve(spec,dx,dy);
 const points=spec.controls_mm.map((p,i)=>world([p[0]+(i<2?dx:0),p[1]+(i<2?dy:0),p[2]]));
 const path=new THREE.CurvePath();
 if(spec.start_mm)path.add(new THREE.LineCurve3(world([spec.start_mm[0]+dx,spec.start_mm[1]+dy,spec.start_mm[2]]),points[0]));
 path.add(new THREE.CubicBezierCurve3(...points.slice(0,4)));
 path.add(new THREE.LineCurve3(points[3],points[4]));
 path.add(new THREE.CubicBezierCurve3(...points.slice(4)));
 if(spec.end_mm)path.add(new THREE.LineCurve3(points.at(-1),world(spec.end_mm)));
 return path;
}
// Use the same hollow route at rest, during motion and after reset. Swapping a
// native sweep for a differently tessellated solid tube on the first XY input
// caused a visible pop and lost the 3 mm filament passage.
export function customTubeGeometry(spec,dx=0,dy=0){
 const curve=customTubeCurve(spec,dx,dy),fine=!!spec.route_type||isRoofTubeSource(spec),segments=fine?768:256,sides=fine?24:16;
 return hollowTubeGeometry(curve,spec,segments,sides);
}
export function hollowTubeGeometry(curve,spec,segments=256,sides=16){
 const frames=curve.computeFrenetFrames(segments,false),positions=[],normals=[],indices=[];
 const radii=[spec.radius_mm/1000,spec.inner_radius_mm/1000];
 const stride=sides+1,layer=(segments+1)*stride;
 for(const [shell,radius]of radii.entries())for(let i=0;i<=segments;i++){
  const p=curve.getPointAt(i/segments);
  for(let j=0;j<=sides;j++){
   const angle=2*Math.PI*j/sides,n=frames.normals[i].clone().multiplyScalar(-Math.cos(angle)).addScaledVector(frames.binormals[i],Math.sin(angle));
   positions.push(p.x+radius*n.x,p.y+radius*n.y,p.z+radius*n.z);
   normals.push(...n.multiplyScalar(shell?-1:1).toArray());
  }
 }
 for(let shell=0;shell<2;shell++)for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
  const a=shell*layer+i*stride+j,b=a+stride,c=b+1,d=a+1;
  indices.push(...(shell?[a,d,b,b,d,c]:[a,b,d,b,c,d]));
 }
 // Annular end faces have their own normals, so the rims stay crisp.
 for(const end of [0,segments]){
  const start=positions.length/3,tangent=curve.getTangentAt(end/segments).multiplyScalar(end?1:-1);
  for(let shell=0;shell<2;shell++)for(let j=0;j<=sides;j++){
   const index=(shell*layer+end*stride+j)*3;
   positions.push(...positions.slice(index,index+3));normals.push(...tangent.toArray());
  }
  for(let j=0;j<sides;j++){
   const a=start+j,b=a+stride,c=b+1,d=a+1;
   indices.push(...(end?[a,b,d,b,c,d]:[a,d,b,b,d,c]));
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function createCustomTube(root,manifest){
 const spec=manifest.custom_ptfe;if(!spec)return null;
 if(isRoofTubeSource(spec)){
  const roofs={'voron_trident_500_custom':'5c3afbfe96c2d0dbeff9fe2846b32876f860443e68ad4811c387ffcb00f65068','voron_trident_1000_custom':'1b505b511c69e5ff4fb91a22c387a7c71232008f753855f812b5fc6ee7fe18c9'};
  if(manifest.parts.find(p=>p.key==='voron_trident_350_base_1359')?.native_sha256!==roofs[manifest.machine_id])throw Error('Native PTFE roof identity changed');
  const inlets={'voron_trident_500_custom':'3e2ed880b86cda700c2652a3b6ca47b807764e0d3f64252d5bf509b4523f4d62','voron_trident_1000_custom':'0149b46ce11e86f45b4cda758e8755a67fb53baf4857ae89bb4650f59900148c'};
  if(manifest.parts.find(p=>p.key==='578')?.native_sha256!==inlets[manifest.machine_id])throw Error('Native PTFE inlet identity changed');
 }
 if(manifest.machine_id==='voron_trident_1000_custom'){
  const keys=[spec.part_key,spec.holder_part_key,'voron_trident_350_base_1359'],guards=spec.native_mate_guards;
  if(spec.schema!=='trident-variable-ptfe-preview-95'||spec.machine_id!==manifest.machine_id||spec.part_key!=='voron_trident_350_base_1409'||spec.holder_part_key!=='voron_trident_350_base_1393'||spec.radius_mm!==2||spec.inner_radius_mm!==1.5||!guards||Object.keys(guards).length!==keys.length||keys.some(key=>!/^[a-f0-9]{64}$/.test(guards[key]||'')||manifest.parts.find(row=>row.key===key)?.native_sha256!==guards[key]))throw Error('Native 1000 mm PTFE source/mate identity changed');
 }
 if(spec.route_type){
  constantCustomTubeRoute(spec);
  const mates={'voron_trident_350_base_1409':'29fa151d241090c622ac2655e8c01a4e14c0c96bb78e888b632af71f5f7377bf','voron_trident_350_base_1393':'05654bb66f978d3915f06c7da020ac9397031c8343c852b66e92f43f8a43ee47','578':'3e2ed880b86cda700c2652a3b6ca47b807764e0d3f64252d5bf509b4523f4d62'};
  if(manifest.machine_id!==spec.machine_id||Object.entries(mates).some(([key,sha])=>manifest.parts.find(row=>row.key===key)?.native_sha256!==sha))throw Error('Native PTFE source/mate identity changed');
 }
 let mesh;root.traverse(n=>{if(n.isMesh&&n.userData?.part_key===spec.part_key)mesh=n});
 if(!mesh)throw Error('Missing custom PTFE source');
 const native=mesh.geometry;let preview=null,last=[];
 return {update(dx=0,dy=0,visible=true){
  if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Non-finite PTFE pose');
  const next=last[0]===dx&&last[1]===dy?null:customTubeGeometry(spec,dx,dy);
  mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.visible=visible;mesh.frustumCulled=false;
  if(!next)return;
  preview?.dispose();preview=next;mesh.geometry=preview;last=[dx,dy];
 },dispose(){mesh.geometry=native;preview?.dispose();preview=null}};
}

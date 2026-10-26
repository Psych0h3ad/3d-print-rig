// Whole displayed loom versus bounded actual-source rigid triangle reads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {auditE3NGInstallations} from './audit_e3ng_installations.mjs';
import {loomCurve} from '../site/viewer/source-assembly-runtime/source_loom306.mjs';
import {reviewWorldDelta,initialState} from '../site/viewer/source-assembly-runtime/state.mjs';
import {sourceControlBounds} from '../site/viewer/source-control-bounds.mjs';
import {e3ngSkirtFasteners} from '../site/viewer/source-assembly-runtime/e3ng-skirt-fastener-data.mjs';

function segmentDistance(a,b,c,d){
 const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;
 assert(A>0&&C>0);let s=den>1e-20?THREE.MathUtils.clamp((B*E-C*D)/den,0,1):0,t=(B*s+E)/C;
 if(t<0){t=0;s=THREE.MathUtils.clamp(-D/A,0,1);}else if(t>1){t=1;s=THREE.MathUtils.clamp((B-D)/A,0,1);}
 return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
}
function triangleDistance(a,b,A,B,C){
 const tri=new THREE.Triangle(A,B,C),direction=b.clone().sub(a),length=direction.length(),hit=new THREE.Ray(a,direction.normalize()).intersectTriangle(A,B,C,false,new THREE.Vector3());
 if(hit&&hit.distanceTo(a)<=length+1e-12)return 0;
 const temp=new THREE.Vector3();return Math.min(a.distanceTo(tri.closestPointToPoint(a,temp)),b.distanceTo(tri.closestPointToPoint(b,temp)),segmentDistance(a,b,A,B),segmentDistance(a,b,B,C),segmentDistance(a,b,C,A));
}
function posesFor(packet){
 const native=initialState(packet),all=[],seen=new Set();
 const add=(axes,probe)=>{const key=JSON.stringify([axes.x,axes.y,axes.z,probe]);if(!seen.has(key)){seen.add(key);all.push({axes,probe});}};
 for(const probe of ['attached','parked']){
  const bounds=(axes,axis)=>sourceControlBounds(packet,{...native,review_axes:axes,probe_state:probe},axis),zero={x:0,y:0,z:0},xb=bounds(zero,'x');
  for(const xf of [0,.25,.5,.75,1]){
   const x=xb.min+(xb.max-xb.min)*xf,yb=bounds({...zero,x},'y');
   for(const yf of [0,.25,.5,.75,1]){const xy={x,y:yb.min+(yb.max-yb.min)*yf,z:0},zb=bounds(xy,'z');for(const zf of [0,.5,1])add({...xy,z:zb.min+(zb.max-zb.min)*zf},probe);}
  }
  // Refine the two diagonal transitions until endpoint displacement is <=5 mm.
  // This is finite adaptive sampling, not a continuous-clearance certificate.
  const yb=bounds(zero,'y');
  for(const reverse of probe==='parked'?[false,true]:[]){
   const a={x:xb.min,y:reverse?yb.max:yb.min,z:0},b={x:xb.max,y:reverse?yb.min:yb.max,z:0},steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/5);
   for(let i=0;i<=steps;i++){const t=i/steps;add({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:0},probe);}
  }
  add(zero,probe);
 }
 return all;
}
export async function auditActualE3NGLoom(context,{extraInstances=e3ngSkirtFasteners}={}){
 const {packet:p,doc,recordMap,rawWorld,accessor,corrected}=context,route=p.source_loom306.route,started=performance.now(),radius=route.display_diameter_mm*.0005,cell=.02;
 const checkBudget=()=>assert(performance.now()-started<105000,'E3NG route actual-asset audit exceeded105s');
 const parents=new Map();doc.nodes.forEach((n,i)=>{for(const c of n.children??[])parents.set(c,i);});
 const owners=new Map(p.parts.map(r=>[r.actual_export.node,r.key])),rows=[];
 const isOtherFlex=key=>key!==route.key&&(p.routes??[]).some(r=>r.part_key===key)||key.startsWith('E3NG-derived-GT2-');
 for(let node=0;node<doc.nodes.length;node++){
  const n=doc.nodes[node];if(n.mesh===undefined)continue;let owner=node;while(!owners.has(owner)&&parents.has(owner))owner=parents.get(owner);const key=owners.get(owner);assert(key,'Unregistered exported source mesh');
  if(key===route.key||isOtherFlex(key))continue;
  for(const pr of doc.meshes[n.mesh].primitives){const a=doc.accessors[pr.attributes.POSITION];assert(a.min&&a.max&&a.type==='VEC3');rows.push({node,owner:key,pr,raw:rawWorld(node),ownerRaw:rawWorld(owner),localBox:new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max))});}
 }
 assert.equal(extraInstances.length,8,'Actual loom gate requires all eight installed fasteners');
 assert.equal(new Set(extraInstances.map(r=>r.key)).size,8,'Duplicate installed fastener route row');
 assert.deepEqual(extraInstances.map(r=>r.key).sort(),e3ngSkirtFasteners.map(r=>r.key).sort());
 for(const instance of extraInstances){
  const production=e3ngSkirtFasteners.find(r=>r.key===instance.key);assert.equal(instance.source_key,production.source_key);assert.equal(instance.source_id,production.source_id);assert.deepEqual(instance.world_m,production.world_m);
  const sourceRows=rows.filter(r=>r.owner===instance.source_key);assert(sourceRows.length>0,'Missing actual fastener prototype surface: '+instance.source_key);
  for(const row of sourceRows)rows.push({...row,owner:instance.key,instanceWorld:new THREE.Matrix4().fromArray(instance.world_m)});
 }
 const states=posesFor(p),key=(x,y,z)=>x+','+y+','+z,eachCell=(box,fn)=>{const lo=box.min.toArray().map(x=>Math.floor(x/cell)),hi=box.max.toArray().map(x=>Math.floor(x/cell));for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++)fn(key(x,y,z));};
 const samples=states.map(state=>{
  const hosts=route.hosts.map(h=>({position:new THREE.Vector3(...h.local_native_mm).applyMatrix4(new THREE.Matrix4().fromArray(recordMap.get(h.key).matrix)).add(new THREE.Vector3(...reviewWorldDelta(p,h.key,state.axes,state.probe)))})),curve=loomCurve(route,hosts),segments=curve.points.slice(1).map((b,i)=>({a:curve.points[i],b,box:new THREE.Box3().setFromPoints([curve.points[i],b]).expandByScalar(radius+.00002)})),grid=new Map();
  for(let i=0;i<segments.length;i++)eachCell(segments[i].box,k=>{if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
  return{...state,curve,segments,grid,box:new THREE.Box3().setFromPoints(curve.points).expandByScalar(radius+.00002)};
 });
 let triangles=0,tests=0,selectedRows=0,minimumClearance=Infinity;const failures=[];
 for(const row of rows){
  checkBudget();const original=recordMap.get(row.owner),base=original?.matrix,relative=row.ownerRaw.clone().invert().multiply(row.raw),baselines=new Map();
  for(const probe of ['attached','parked']){const overridden=probe==='parked'?p.source_probe_state303?.parked_world_by_key[row.owner]:null,ownerWorld=row.instanceWorld??(overridden?new THREE.Matrix4().fromArray(overridden):corrected.get(row.owner)??new THREE.Matrix4().fromArray(base)),matrix=ownerWorld.clone().multiply(relative);baselines.set(probe,{matrix,box:row.localBox.clone().applyMatrix4(matrix)});}
  const posed=[];
  for(const sample of samples){const baseline=baselines.get(sample.probe),host=row.owner===p.source_drive304?.companions?.PTFE?.key?'E3D-original-Revo-Voron-reference':row.owner,delta=reviewWorldDelta(p,host,sample.axes,sample.probe),box=baseline.box.clone().translate(new THREE.Vector3(...delta));if(!box.intersectsBox(sample.box))continue;const matrix=baseline.matrix.clone();for(let i=0;i<3;i++)matrix.elements[12+i]+=delta[i];posed.push({sample,matrix});}
  if(!posed.length)continue;selectedRows++;const pos=await accessor(row.pr.attributes.POSITION,false),idx=row.pr.indices!==undefined?await accessor(row.pr.indices,false):null,count=idx?.count??pos.count;assert(count%3===0);
  for(const {sample,matrix}of posed)for(let k=0;k<count;k+=3){
   if(k%24576===0)checkBudget();triangles++;const points=[0,1,2].map(j=>{const n=idx?idx.read(k+j):k+j;return new THREE.Vector3(pos.read(n,0),pos.read(n,1),pos.read(n,2)).applyMatrix4(matrix);}),box=new THREE.Box3().setFromPoints(points);if(!box.intersectsBox(sample.box))continue;
   const candidates=new Set();eachCell(box,k=>{for(const id of sample.grid.get(k)??[])candidates.add(id);});
   for(const id of candidates){const segment=sample.segments[id];if(!segment.box.intersectsBox(box))continue;tests++;const clearance=triangleDistance(segment.a,segment.b,...points)-radius;minimumClearance=Math.min(minimumClearance,clearance);if(clearance<-.0000001&&failures.length<24)failures.push({owner:row.owner,triangle:k/3,segment:id,axes:sample.axes,probe:sample.probe,clearance_m:clearance});}
  }
 }
 assert.equal(failures.length,0,'E3NG loom crosses actual rigid-source triangles: '+JSON.stringify(failures));
 return{passed:true,pose_samples:samples.length,additional_instance_owners:[...new Set(rows.filter(r=>r.instanceWorld).map(r=>r.owner))],additional_instance_rows:rows.filter(r=>r.instanceWorld).length,rigid_rows:selectedRows,triangles,triangle_segment_tests:tests,minimum_capsule_surface_clearance_m:Number.isFinite(minimumClearance)?minimumClearance:null,display_length_m:route.display_constant_length_m,minimum_sampled_bend_radius_m:Math.min(...samples.map(s=>s.curve.minimum_sampled_radius_m)),contact_numeric_threshold_m:1e-7,fitting_owner_exemptions:[],elapsed_ms:performance.now()-started,scope:'Finite adaptive source-surface/capsule samples, including all eight installed source fasteners; other flexible belts excluded. Source-anchored wire preview; no native-solid, material-stress, continuous-clearance or internal-PTFE-seat certification.'};
}
async function main(){
 const args=process.argv.slice(2),packet=args.shift(),options={};let output;
 assert(packet,'Packet path required');while(args.length){const flag=args.shift(),value=args.shift();assert(value);if(flag==='--origin')options.origin=value;else if(flag==='--local-map'){const m=JSON.parse(await fs.readFile(value,'utf8'));options.localMap=m.files??m;}else if(flag==='--out')output=value;else throw Error('Unknown argument');}
 // auditE3NGInstallations invokes the mandatory eight-fastener gate before
 // this callback; the same actual-source context then runs the whole loom gate.
 options.inspectSource=async context=>{assert(context.skirt_fasteners?.passed&&context.skirt_fasteners.instances===8,'Required fastener gate missing from release pipeline');return auditActualE3NGLoom(context);};
 const report=await auditE3NGInstallations(packet,options);if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,installed_owners:report.changed_owners,skirt_fasteners:report.skirt_fasteners,loom:report.additional}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});

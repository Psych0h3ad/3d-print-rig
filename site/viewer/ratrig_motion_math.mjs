// Pure, deterministic geometry/state contract, shared by renderer and QA.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,k)=>a.map(x=>x*k);
export const norm=a=>Math.hypot(...a);
export const distance=(a,b)=>norm(sub(a,b));
export const length=points=>points.slice(1).reduce((s,p,i)=>s+distance(p,points[i]),0);
export const cadToScene=p=>[p[0]*.001,p[2]*.001,-p[1]*.001];
export function delta(profile,pose,motion){
  const r=profile.reference_pose;
  if(motion==='bed')return [0,0,-(pose.z-r.z)];
  if(motion==='gantry')return [0,pose.y-r.y,0];
  if(motion==='tool0')return [pose.x0-r.x0,pose.y-r.y,0];
  if(motion==='tool1')return [pose.x1-r.x1,pose.y-r.y,0];
  return [0,0,0];
}
export function validatePose(profile,pose){
  if(profile.mode!=='idex'&&pose.x1!==null)throw new RangeError('Single carriage has no x1');
  const axes=['x0','y','z',...(profile.mode==='idex'?['x1']:[])];
  for(const axis of axes){
    const v=pose[axis],range=profile.limits[axis];
    if(!Number.isFinite(v)||v<range[0]-1e-6||v>range[1]+1e-6)throw new RangeError(`${axis} outside ${range}`);
  }
  if(profile.mode==='idex'&&pose.x1-pose.x0<profile.limits.safe_distance_mm-1e-6)throw new RangeError('Dual carriage separation below firmware safe_distance');
  if(pose.z<0&&pose.y>=0&&pose.y<=profile.size_mm&&[pose.x0,pose.x1].some(x=>Number.isFinite(x)&&x>=0&&x<=profile.size_mm))throw new RangeError('Negative Z would cross the print surface');
  return pose;
}
export function beltGeometry(profile,pose,belt){
  let perimeter=0,maxGap=0;
  const rings=[belt.boundary,...(belt.holes??[])].map(edges=>{
    const transformed=edges.map(edge=>{
      const pts=edge.points_mm.map((p,i)=>{
        const d=delta(profile,pose,edge.motion??edge.point_motion[i]);return [p[0]+d[0],p[1]+d[1]];
      });
      perimeter+=edge.kind==='CIRCLE'?edge.length_mm:distance(pts[0],pts.at(-1));
      return pts;
    });
    transformed.forEach((pts,i)=>{maxGap=Math.max(maxGap,distance(pts.at(-1),transformed[(i+1)%transformed.length][0]));});
    return transformed.flatMap(pts=>pts.slice(0,-1));
  });
  return {rings,perimeter_mm:perimeter,reference_perimeter_mm:belt.boundary_length_mm,length_error_mm:perimeter-belt.boundary_length_mm,max_gap_mm:maxGap,z_min_mm:belt.z_min_mm,z_max_mm:belt.z_max_mm};
}
export function minimumRadius(points){
  let min=Infinity;
  for(let i=1;i<points.length-1;i++){
    const a=sub(points[i],points[i-1]),b=sub(points[i+1],points[i]),c=sub(points[i+1],points[i-1]);
    const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const area2=norm(cross);if(area2>1e-8)min=Math.min(min,norm(a)*norm(b)*norm(c)/(2*area2));
  }
  return min;
}
const tubeCache=new WeakMap();
export function tubeGeometry(profile,pose,tube){
  let cached=tubeCache.get(tube);if(!cached){cached=new Map();tubeCache.set(tube,cached);}
  const policy=profile.cable_route_policy??'inextensible_proposal';
  const key=policy+':'+(tube.route_type==='hanging_u'?'z:'+pose.z:'xy:'+pose['x'+tube.head]+','+pose.y);
  if(cached.has(key))return cached.get(key);
  const result=policy==='continuous_kinematic'&&tube.route_type!=='hanging_u'?continuousTubeGeometry(profile,pose,tube):computeTubeGeometry(profile,pose,tube);if(cached.size>=256)cached.delete(cached.keys().next().value);cached.set(key,result);return result;
}
function continuousTubeGeometry(profile,pose,tube){
  const original=tube.reference_free_points_mm,move=delta(profile,pose,'tool'+tube.head),ds=[0];for(let i=1;i<original.length;i++)ds.push(ds.at(-1)+distance(original[i],original[i-1]));
  const usb=tube.name.includes('Umbilical'),first=usb?ds.findIndex(x=>x>=55):0,last=usb?ds.findLastIndex(x=>x<=ds.at(-1)-100):original.length-1;
  const weights=ds.map(d=>{const t=Math.max(0,Math.min(1,(d-ds[first])/(ds[last]-ds[first])));return t*t*t*(10+t*(-15+6*t));});
  const points=original.map((p,i)=>add(p,mul(move,weights[i]))),change=length(points)-tube.reference_free_length_mm;
  return {points_mm:[...tube.fixed_points_mm.slice(0,-1),...points],free_points_mm:points,source_point_weights:weights,radius_mm:tube.radius_mm,
    length_error_mm:change,length_change_from_authored_mm:change,proposed_slack_remaining_mm:tube.service_loop_extension_mm-change,
    minimum_radius_mm:minimumRadius(points),fixed_anchor_error_mm:distance(points[0],original[0]),moving_anchor_error_mm:distance(points.at(-1),add(original.at(-1),move)),
    model_policy:'continuous_kinematic',physical_inextensibility_verified:false};
}
function computeTubeGeometry(profile,pose,tube){
  if(tube.route_type==='hanging_u'){
    const start=tube.fixed_anchor_mm,end=add(tube.moving_anchor_mm,delta(profile,pose,tube.motion));
    const h=sub(end,start);h[2]=0;const d=norm(h),r=d/2,u=mul(h,1/d),mid=mul(add(start,end),.5);
    const bottom=(start[2]+end[2]+(Math.PI-2)*r-tube.length_mm)/2,z=bottom+r;
    if(z>Math.min(start[2],end[2])||bottom<tube.radius_mm+20)throw new RangeError('Bed harness cannot fit its hanging loop');
    const pts=[start],line=(a,b)=>{for(let i=1,n=Math.max(1,Math.ceil(distance(a,b)/4));i<=n;i++)pts.push(add(a,mul(sub(b,a),i/n)));};
    line(start,[start[0],start[1],z]);
    for(let i=1,n=Math.max(128,Math.ceil(Math.PI*r));i<=n;i++){const t=Math.PI+Math.PI*i/n;pts.push([mid[0]+u[0]*r*Math.cos(t),mid[1]+u[1]*r*Math.cos(t),z+r*Math.sin(t)]);}
    line(pts.at(-1),end);
    return {points_mm:pts,free_points_mm:pts,radius_mm:tube.radius_mm,length_error_mm:length(pts)-tube.length_mm,minimum_radius_mm:minimumRadius(pts),fixed_anchor_error_mm:distance(pts[0],start),moving_anchor_error_mm:distance(pts.at(-1),end),analytic_length_error_mm:0};
  }
  const original=tube.reference_free_points_mm,move=delta(profile,pose,'tool'+tube.head);
  const fullTarget=tube.reference_free_length_mm;
  let ds=[0];for(let i=1;i<original.length;i++)ds.push(ds.at(-1)+distance(original[i],original[i-1]));
  const usb=tube.name.includes('Umbilical');
  const first=usb?ds.findIndex(x=>x>=55):0;
  const last=usb?ds.findLastIndex(x=>x<=fullTarget-100):original.length-1;
  const start=original[first],end=add(original[last],move),target=ds[last]-ds[first]+(tube.service_loop_extension_mm??(usb?75:0));
  if(distance(start,end)>=target-.001)throw new RangeError('Authored cable is too short for this pose');
  const prefix=original.slice(0,first),suffix=original.slice(last+1).map(p=>add(p,move));
  const unit=v=>mul(v,1/(norm(v)||1));
  const u0=unit(sub(original[first+1],original[first])),u1=unit(sub(original[last],original[last-1]));
  const chord=sub(end,start),h=Math.hypot(chord[0],chord[1])||1,normal=[-chord[1]/h,chord[0]/h,0];
  const ceiling=profile.frame_ceiling_mm-tube.radius_mm-.25,maxX=profile.size_mm/2+150-tube.radius_mm-3;
  const n=Math.max(80,Math.ceil(target/4)),ts=Array.from({length:n+1},(_,i)=>i/n);
  let best=null,nearest=null;
  // Retain the authored arch rather than forcing every pose into a cubic.
  // Smoothstep deformation keeps both connector tangents and curvatures;
  // the fourth-power bow distributes the extra service length centrally.
  const span=ds[last]-ds[first],morph=original.slice(first,last+1).map((p,i)=>{
    const t=(ds[first+i]-ds[first])/span,w=t*t*t*(10+t*(-15+6*t));return add(p,mul(move,w));
  });
  if(length(morph)<=target){
    const bows=[[0,1,0],[0,-1,0],normal,[1,0,0],unit([normal[0],normal[1],-.5])];
    morphCandidates: for(const bow of bows)for(const sign of [1,-1])for(const skew of [0,-.6,.6]){
      const make=a=>morph.map((p,i)=>{const t=(ds[first+i]-ds[first])/span;return add(p,mul(bow,sign*a*Math.sin(Math.PI*t)**4*(1+skew*(2*t-1))));});
      let lo=0,hi=800;if(length(make(hi))<target)continue;
      for(let k=0;k<32;k++){let a=(lo+hi)/2;if(length(make(a))<target)lo=a;else hi=a;}
      const points=make((lo+hi)/2),all=[...prefix,...points,...suffix],radius=minimumRadius(all);
      const overflow=points.reduce((v,p)=>Math.max(v,p[2]-ceiling,Math.abs(p[0])-maxX),0);
      const penalty=overflow+Math.max(0,15-radius)*10;
      if(!nearest||penalty<nearest.penalty)nearest={penalty,overflow,radius,bow,sign,skew};
      if(overflow>.001||radius<Math.max(tube.radius_mm+.25,tube.minimum_model_bend_radius_mm??15)-.001)continue;
      // Prefer a fixed world-space bow and handedness across nearby poses.
      // A least-amplitude choice can flip a long service loop abruptly.
      const score=bows.indexOf(bow)*10000+(sign<0?1000:0)+Math.abs(skew)*100+hi*.02;
      if(!best||score<best.score)best={score,all,points,minimum_radius_mm:radius,tangent_length_mm:null,slack_bow_mm:sign*(lo+hi)/2};
      if(score<100)break morphCandidates;
    }
    const along=unit([chord[0],chord[1],0]);
    if(!best)for(const drop of [0,10,25,50])for(const turns of [1,2])for(const phase of Array.from({length:8},(_,i)=>i/4))for(const sign of [1,-1]){
      const make=a=>morph.map((p,i)=>{const t=(ds[first+i]-ds[first])/span,angle=Math.PI*(turns*t+phase),window=Math.sin(Math.PI*t)**4,w=a*window;return add(p,add(add(mul(normal,w*Math.cos(angle)),mul(along,sign*w*Math.sin(angle))),[0,0,-drop*window]));});
      let lo=0,hi=800;if(length(make(hi))<target)continue;
      for(let k=0;k<32;k++){const a=(lo+hi)/2;if(length(make(a))<target)lo=a;else hi=a;}
      const points=make((lo+hi)/2),all=[...prefix,...points,...suffix],radius=minimumRadius(all);
      const overflow=points.reduce((v,p)=>Math.max(v,p[2]-ceiling,Math.abs(p[0])-maxX),0);
      if(overflow>.001||radius<Math.max(tube.radius_mm+.25,tube.minimum_model_bend_radius_mm??15)-.001)continue;
      const score=100+hi*.02;if(!best||score<best.score)best={score,all,points,minimum_radius_mm:radius,tangent_length_mm:null,slack_bow_mm:sign*(lo+hi)/2};
    }
  }
  // Endpoint tangents and strain-relief necks remain fixed. A smooth service
  // loop carries the slack, with a constant sampled centreline length.
  if(!best)for(const power of [2,4])for(const bow of [normal,unit([normal[0],normal[1],-.5]),unit([normal[0],normal[1],-1]),[0,0,-1]])for(const tangentLength of [20,40,60,80,100,140,180,220,260,300,340,400])for(const endTangentLength of [20,40,60,80,100,140,180,220,260,300,340,400])for(const sign of [1,-1]){
    const c1=add(start,mul(u0,tangentLength)),c2=sub(end,mul(u1,endTangentLength));
    const base=ts.map(t=>add(add(mul(start,(1-t)**3),mul(c1,3*(1-t)**2*t)),add(mul(c2,3*(1-t)*t*t),mul(end,t**3))));
    if(length(base)>target)continue;
    const make=amplitude=>base.map((p,i)=>add(p,mul(bow,sign*amplitude*Math.sin(Math.PI*ts[i])**power)));
    let lo=0,hi=500;
    if(length(make(hi))<target)continue;
    for(let k=0;k<32;k++){const m=(lo+hi)/2;if(length(make(m))<target)lo=m;else hi=m;}
    const points=make((lo+hi)/2),all=[...prefix,...points,...suffix],radius=minimumRadius(all);
    const overflow=points.reduce((v,p)=>Math.max(v,p[2]-ceiling,Math.abs(p[0])-maxX),0);
    if(overflow>.001||radius<Math.max(tube.radius_mm+.25,tube.minimum_model_bend_radius_mm??15)-.001)continue;
    const score=Math.abs(tangentLength-140)+Math.abs(endTangentLength-140)+hi*.02+(bow===normal?0:30)+(power===2?0:10);
    if(!best||score<best.score)best={score,all,points,minimum_radius_mm:radius,tangent_length_mm:tangentLength,slack_bow_mm:sign*(lo+hi)/2};
  }
  if(!best)throw new RangeError('No inextensible cable route inside the roof/frame envelope: '+JSON.stringify(nearest));
  return {points_mm:[...tube.fixed_points_mm.slice(0,-1),...best.all],free_points_mm:best.all,
    length_error_mm:length(best.all)-fullTarget-(tube.service_loop_extension_mm??(usb?75:0)),minimum_radius_mm:best.minimum_radius_mm,
    fixed_anchor_error_mm:distance(best.all[0],original[0]),moving_anchor_error_mm:distance(best.all.at(-1),add(original.at(-1),move)),
    tangent_length_mm:best.tangent_length_mm,slack_bow_mm:best.slack_bow_mm,radius_mm:tube.radius_mm};
}
export function solveGeometry(profile,routes,pose){
  const belts=routes.belts.map(b=>beltGeometry(profile,pose,b));
  if(belts.some(b=>Math.abs(b.length_error_mm)>.01||b.max_gap_mm>.01))throw new RangeError('Belt topology or length changed');
  const tubes=routes.tubes.map(t=>tubeGeometry(profile,pose,t));
  return {belts,tubes};
}
export function createRigState(profile,routes){
  let pose={...profile.reference_pose,z:Math.max(0,profile.reference_pose.z)},mode='independent',copyOffset=profile.size_mm/2,mirrorSum=profile.size_mm;
  for(const axis of ['x0','y','z',...(profile.mode==='idex'?['x1']:[])])pose[axis]=Math.max(profile.limits[axis][0],Math.min(profile.limits[axis][1],pose[axis]));
  validatePose(profile,pose);
  let lights={chamber:profile.lights.chamber.default,vaoc:profile.lights.vaoc.default};
  let geometry=solveGeometry(profile,routes,pose);
  const snapshot=()=>({machine_id:profile.machine_id,pose:{...pose},mode,copy_offset_mm:copyOffset,mirror_sum_mm:mirrorSum,lights:{...lights}});
  const update=(next,nextMode=mode,nextOffset=copyOffset,nextMirror=mirrorSum)=>{
    if(Object.keys(next).some(k=>!['x0','x1','y','z'].includes(k)))throw new RangeError('Unknown pose axis');
    next={...pose,...next};
    if(nextMode==='copy')next.x1=next.x0+nextOffset;
    if(nextMode==='mirror')next.x1=nextMirror-next.x0;
    validatePose(profile,next);const solved=solveGeometry(profile,routes,next);
    pose=next;mode=nextMode;copyOffset=nextOffset;mirrorSum=nextMirror;geometry=solved;
    return {...snapshot(),geometry};
  };
  return {getSnapshot:snapshot,getGeometry:()=>geometry,setPose:update,
    setMode(next,options={}){
      if(!profile.supported_motion_modes.includes(next))throw new RangeError('Unsupported motion mode');
      const offset=options.copy_offset_mm??copyOffset;
      if(!Number.isFinite(offset)||offset<profile.limits.safe_distance_mm||offset>profile.size_mm)throw new RangeError('Invalid copy offset');
      const sum=options.mirror_sum_mm??mirrorSum;if(!Number.isFinite(sum)||sum<profile.limits.x0[0]+profile.limits.x1?.[0]||sum>profile.size_mm+ (profile.limits.x1?.[1]??profile.size_mm))throw new RangeError('Invalid mirror origin');
      return update(options.pose??(next==='independent'?{}:{x0:0}),next,offset,sum);
    },
    setLight(channel,value){
      if(!Object.hasOwn(lights,channel)||!profile.lights[channel].keys.length)throw new RangeError('Light channel is not installed');
      if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Light value outside 0..1');
      lights={...lights,[channel]:value};return snapshot();
    },
    restore(saved){
      if(saved.machine_id!==profile.machine_id)throw new RangeError('Configuration belongs to another machine');
      const newMode=saved.mode,newLights=saved.lights;
      if(!profile.supported_motion_modes.includes(newMode))throw new RangeError('Invalid saved mode');
      if(!Number.isFinite(saved.copy_offset_mm)||saved.copy_offset_mm<profile.limits.safe_distance_mm||saved.copy_offset_mm>profile.size_mm)throw new RangeError('Invalid saved copy offset');
      if(!newLights||Object.keys(newLights).sort().join(',')!=='chamber,vaoc')throw new RangeError('Missing saved light channels');
      for(const [k,v]of Object.entries(newLights))if(!Object.hasOwn(lights,k)||!Number.isFinite(v)||v<0||v>1)throw new RangeError('Invalid saved light');
      for(const [k,v]of Object.entries(newLights))if(!profile.lights[k].keys.length&&v!==0)throw new RangeError('Saved light is not installed');
      const sum=saved.mirror_sum_mm??profile.size_mm;if(!Number.isFinite(sum))throw new RangeError('Invalid saved mirror origin');
      const result=update(saved.pose,newMode,saved.copy_offset_mm,sum);lights={...newLights};return {...result,lights:{...lights}};
    }
  };
}

// Flexible display route, in native CAD millimetres. No native body is changed.
// Service length and bend radii are viewer design choices, not tube cut advice.
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),scale=(a,k)=>a.map(n=>n*k);
const norm=a=>Math.hypot(...a),tau=2*Math.PI;
function line(a,b,id){const d=sub(b,a),length_mm=norm(d);if(!(length_mm>0))throw Error('Empty PTFE line');return {id,type:'line',start:a,end:b,length_mm,point:t=>add(a,scale(d,t)),derivative:()=>d,atDistance:s=>s/length_mm};}
function directedApproach(a,b,r,headRadius){
 const choices=[];
 for(const turn of [-1,1]){
  const centre=[b[0]-turn*r,b[1]],v=sub(a,centre),d=norm(v);
  if(d<=r)continue;
  const base=Math.atan2(v[1],v[0]),offset=Math.acos(r/d),endAngle=turn===1?0:Math.PI;
  for(const theta of [base-offset,base+offset]){
   const tangent=[centre[0]+r*Math.cos(theta),centre[1]+r*Math.sin(theta)],delta=sub(tangent,a),distance=norm(delta),heading=scale(delta,1/distance);
   const direction=[-turn*Math.sin(theta),turn*Math.cos(theta)];
   if(heading.reduce((n,x,i)=>n+x*direction[i],0)<1-1e-10||distance<=headRadius)continue;
   let sweep=((turn*(endAngle-theta))%tau+tau)%tau;if(sweep>tau-1e-10)sweep=0;
   const straight=distance-headRadius,total=straight+r*sweep;
   choices.push({centre,theta,turn,sweep,heading,straight,total,tangent});
  }
 }
 choices.sort((x,y)=>x.total-y.total);const p=choices[0];
 if(!p||p.sweep>Math.PI+1e-8||p.heading[1]<=0)throw Error('PTFE approach outside supported tangent domain');
 const start=add(a,scale(p.heading,headRadius));
 return {...p,start,end:b,point(s){if(s<=0)return start.slice();if(s>=p.total)return b.slice();if(s<=p.straight)return add(start,scale(p.heading,s));const t=p.theta+p.turn*(s-p.straight)/r;return [p.centre[0]+r*Math.cos(t),p.centre[1]+r*Math.sin(t)];},direction(s){if(s<=p.straight)return p.heading.slice();const t=p.theta+p.turn*Math.min(p.sweep,(s-p.straight)/r);return [-p.turn*Math.sin(t),p.turn*Math.cos(t)];},curvature:s=>s<p.straight?0:1/r};
}
function elevation(run,rise,r,length=null){
 const sign=rise<0?-1:1,height=Math.abs(rise);let alpha=0,straight=run;
 if(height>1e-10){
  let lo=0,hi=Math.PI/2-1e-10;
  if(length===null){
   if(!(run>2*r))throw Error('PTFE elevation has insufficient horizontal space');
   for(let i=0;i<56;i++){const t=(lo+hi)/2,l=(run-2*r*Math.sin(t))/Math.cos(t),h=2*r*(1-Math.cos(t))+l*Math.sin(t);if(h<height)lo=t;else hi=t;}
   alpha=(lo+hi)/2;straight=(run-2*r*Math.sin(alpha))/Math.cos(alpha);
  }else{
   hi=Math.min(hi,length/(2*r));
   const maximum=2*r*(1-Math.cos(hi))+(length-2*r*hi)*Math.sin(hi);
   if(maximum<height)throw Error('PTFE service length cannot span elevation');
   for(let i=0;i<56;i++){const t=(lo+hi)/2,h=2*r*(1-Math.cos(t))+(length-2*r*t)*Math.sin(t);if(h<height)lo=t;else hi=t;}
   alpha=(lo+hi)/2;straight=length-2*r*alpha;run=2*r*Math.sin(alpha)+straight*Math.cos(alpha);
  }
 }else if(length!==null){run=length;straight=length;}
 const total=2*r*alpha+straight,arc=r*alpha;
 if(!(straight>=0&&run>0&&Number.isFinite(total)))throw Error('Nonfinite PTFE elevation');
 return {run,total,rise,at(s){
  if(s<=0)return {s:0,z:0,pitch:0,curvature:alpha?1/r:0};
  if(s>=total)return {s:run,z:rise,pitch:0,curvature:alpha?1/r:0};
  let x,z,beta,k;
  if(s<arc){beta=s/r;x=r*Math.sin(beta);z=r*(1-Math.cos(beta));k=1/r;}
  else if(s<=arc+straight){beta=alpha;const d=s-arc;x=r*Math.sin(alpha)+d*Math.cos(alpha);z=r*(1-Math.cos(alpha))+d*Math.sin(alpha);k=0;}
  else{beta=alpha-(s-arc-straight)/r;x=2*r*Math.sin(alpha)+straight*Math.cos(alpha)-r*Math.sin(beta);z=r*(1-Math.cos(alpha))+straight*Math.sin(alpha)+r*(Math.cos(beta)-Math.cos(alpha));k=1/r;}
  return {s:x,z:sign*z,pitch:sign*beta,curvature:k};
 }};
}
function lifted(plan,startZ,endZ,profile,id,minimumRadius){
 const start=[...plan.point(0),startZ],end=[...plan.point(plan.total),endZ],length_mm=profile.total;
 return {id,type:'elevated_planar',start,end,length_mm,minimum_design_radius_mm:minimumRadius,point(t){if(t<=0)return start.slice();if(t>=1)return end.slice();const p=profile.at(t*length_mm);return [...plan.point(p.s),startZ+p.z];},derivative(t){const p=profile.at(t*length_mm),d=plan.direction(p.s);return [d[0]*Math.cos(p.pitch)*length_mm,d[1]*Math.cos(p.pitch)*length_mm,Math.sin(p.pitch)*length_mm];},curvature(t){const p=profile.at(t*length_mm);return Math.hypot(plan.curvature(p.s)*Math.cos(p.pitch)**2,p.curvature);},atDistance:s=>s/length_mm};
}
function tailPlan(a,b,r,far){
 const dx=b[0]-a[0],first=far-a[1],across=dx-3*r,down=far-b[1]-r,quarter=Math.PI*r/2;
 if(!(first>=0&&across>0&&down>=0))throw Error('PTFE rear loop lacks clearance');
 const parts=[],push=(length,point,direction,curvature)=>{if(length>0)parts.push({length,point,direction,curvature});};
 push(first,s=>[a[0],a[1]+s],()=>[0,1],0);
 push(quarter,s=>{const t=s/r;return [a[0]+r-r*Math.cos(t),far+r*Math.sin(t)];},s=>[Math.sin(s/r),Math.cos(s/r)],1/r);
 push(across,s=>[a[0]+r+s,far+r],()=>[1,0],0);
 push(quarter,s=>{const t=s/r;return [b[0]-2*r+r*Math.sin(t),far+r*Math.cos(t)];},s=>[Math.cos(s/r),-Math.sin(s/r)],1/r);
 push(down,s=>[b[0]-r,far-s],()=>[0,-1],0);
 push(quarter,s=>{const t=s/r;return [b[0]-r*Math.cos(t),b[1]+r-r*Math.sin(t)];},s=>[Math.sin(s/r),-Math.cos(s/r)],1/r);
 const total=parts.reduce((n,p)=>n+p.length,0),locate=s=>{let q=Math.max(0,Math.min(total,s));for(const p of parts){if(q<=p.length)return [p,q];q-=p.length;}return [parts.at(-1),parts.at(-1).length];};
 return {total,point(s){if(s<=0)return a.slice();if(s>=total)return b.slice();const [p,q]=locate(s);return p.point(q);},direction(s){const [p,q]=locate(s);return p.direction(q);},curvature(s){return locate(s)[0].curvature;}};
}
export function fixedV24ServiceRoute(spec,displayXYZ,passage){
 // The pinned Main_Body ends at CAD Z215.294617 mm. Bending at the old
 // Z209.5 datum cut through its inlet wall. Leave that body before turning;
 // R20 also retains space below the existing closed-roof Z travel limit.
 const headRadius=20,headReleaseZ=215.4,turnRadius=50,pitchRadius=30,tailRadius=40;
 const delta=sub(displayXYZ,spec.reference_xyz_mm),start=add(spec.head_seat_reference_mm,delta),stem=[start[0],start[1],headReleaseZ+delta[2]],inner=spec.inner_feedthrough_mm.slice(),approach=sub(inner,[0,passage.approach_length_mm,0]);
 const xy=directedApproach(stem.slice(0,2),approach.slice(0,2),turnRadius,headRadius),headEnd=[...xy.start,stem[2]+headRadius],pitch=elevation(xy.total,approach[2]-headEnd[2],pitchRadius);
 const headArc={id:'head_toward_rear_inlet',type:'quarter_arc',start:stem,end:headEnd,length_mm:headRadius*Math.PI/2,minimum_design_radius_mm:headRadius,point:t=>add(stem,[headRadius*(1-Math.cos(t*Math.PI/2))*xy.heading[0],headRadius*(1-Math.cos(t*Math.PI/2))*xy.heading[1],headRadius*Math.sin(t*Math.PI/2)]),derivative:t=>[xy.heading[0]*headRadius*Math.PI/2*Math.sin(t*Math.PI/2),xy.heading[1]*headRadius*Math.PI/2*Math.sin(t*Math.PI/2),headRadius*Math.PI/2*Math.cos(t*Math.PI/2)],atDistance:s=>s/(headRadius*Math.PI/2)};
 const moving=lifted(xy,headEnd[2],approach[2],pitch,'moving_rear_approach',1/Math.hypot(1/turnRadius,1/pitchRadius));
 const exit=spec.connector_exit_mm.slice(),rearStart=add(exit,[0,8,0]),left=spec.holder_left_mm.slice(),right=spec.holder_right_mm.slice(),farMin=Math.max(rearStart[1],left[1]+tailRadius)+10;
 const minTail=tailPlan(rearStart.slice(0,2),left.slice(0,2),tailRadius,farMin),minPitch=elevation(minTail.total,left[2]-rearStart[2],tailRadius);
 // A conservative whole-travel length bound, not a finite pose-grid maximum.
 // The moving route is monotone in elevation; its spatial length <= run+|rise|.
 let planarBound=0,heightBound=0;
 for(const x of spec.preview_display_limits_mm.X)for(const y of spec.preview_display_limits_mm.Y)for(const turn of [-1,1]){
  const a=add(spec.head_seat_reference_mm,sub([x,y,0],spec.reference_xyz_mm));planarBound=Math.max(planarBound,Math.hypot(a[0]-(approach[0]-turn*turnRadius),a[1]-approach[1])+Math.PI*turnRadius-headRadius);
 }
 for(const z of spec.preview_display_limits_mm.Z)heightBound=Math.max(heightBound,Math.abs(approach[2]-(headReleaseZ+z-spec.reference_xyz_mm[2]+headRadius)));
 const fixed=[line(approach,inner,'fixed_panel_aperture_axis'),line(inner,exit,'fixed_housing_connector_axis'),line(exit,rearStart,'fixed_connector_outlet_lead')],lead=line(left,right,'fixed_holder_axis'),stemLine=line(start,stem,'moving_head_stem');
 const serviceLength=Math.ceil((stemLine.length_mm+headArc.length_mm+planarBound+heightBound+fixed.reduce((n,p)=>n+p.length_mm,0)+minPitch.total+lead.length_mm+25)/25)*25;
 const tailLength=serviceLength-stemLine.length_mm-headArc.length_mm-moving.length_mm-fixed.reduce((n,p)=>n+p.length_mm,0)-lead.length_mm;
 const tailPitch=elevation(null,left[2]-rearStart[2],tailRadius,tailLength),offset=minTail.total-2*farMin,far=(tailPitch.run-offset)/2;
 if(far<farMin-1e-7)throw Error('PTFE service loop exhausted');
 const tail=tailPlan(rearStart.slice(0,2),left.slice(0,2),tailRadius,far),rear=lifted(tail,rearStart[2],left[2],tailPitch,'rear_service_loop',tailRadius/Math.SQRT2);
 const segments=[stemLine,headArc,moving,...fixed,rear,lead],cumulative_mm=[0];for(const s of segments)cumulative_mm.push(cumulative_mm.at(-1)+s.length_mm);
 return {display_xyz_mm:displayXYZ.slice(),delta_xyz_mm:delta,start_mm:start,stem_mm:stem,head_arc_end_mm:headEnd,arc_end_mm:headEnd,panel_approach_mm:approach,inner_feedthrough_mm:inner,connector_exit_mm:exit,holder_left_mm:left,holder_right_mm:right,rear_panel_inside_y_mm:passage.inside_y_mm,panel_passage_source_sha256:passage.native_sha256,segments,cumulative_mm,total_length_mm:cumulative_mm.at(-1),service_length_mm:serviceLength,service_loop_far_y_mm:far,minimum_design_radius_mm:headRadius,length_mode:'constant_service_length_preview',route_version:'rear-directed-constant-service-v1',native_clearance_certified:false};
}

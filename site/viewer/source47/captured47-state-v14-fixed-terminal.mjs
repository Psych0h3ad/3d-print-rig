import {activeJointStep} from './active-joint-step.mjs';
// Original finite source link datums. Every update changes rigid matrices only.
const PI=Math.PI,add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),tr=m=>m[0].map((_,i)=>m.map(r=>r[i])),mv=(m,v)=>m.map(r=>dot(r,v)),mm=(a,b)=>a.map(r=>tr(b).map(c=>dot(r,c))),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function checksum(x){const d=new DataView(new ArrayBuffer(8));let h=2166136261;for(const v of x){d.setFloat64(0,v,true);for(let k=0;k<8;k++)h=Math.imul(h^d.getUint8(k),16777619)>>>0}return h.toString(16).padStart(8,'0')}
export function createCaptured47(input,size,{onApply=()=>{}}={}){
 const M=input.machines.find(m=>m.size===size);if(!M)throw Error('Missing actual source fixture');const lengths=M.source_links.map(s=>s.source_step_local_mm[0]),limit=input.stop_search_degrees*PI/180,reference={xy:[0,0],theta:M.reference_theta.slice()},binding={schema:input.schema,size,model_sha256:M.model_sha256,reference_pose_sha256:M.reference_pose_sha256};let current=structuredClone(reference),history=[structuredClone(reference)],pending=[],pendingReset=false,failure=null;
 const vector=f=>[...f.xy,...f.theta];
 // Fast exact-order projection measured 61 iterations in 2.797ms. The local
 // numeric work guard changes; source constraints and external 1CPU/512MiB/120s
 // caps do not. This guard is not a physical range or clearance condition.
 let planningIterations=0;const solveOriginalGuardLimit=50000;
 const countPlanning=()=>{if(++planningIterations>solveOriginalGuardLimit){const e=new Error('REALFAIL bounded source47 planning budget');e.source_plan_budget=true;throw e}};
 function isotonic(values){const blocks=[];for(let i=0;i<values.length;i++){blocks.push({sum:values[i],count:1});while(blocks.length>1){const a=blocks.at(-2),b=blocks.at(-1);if(a.sum/a.count<=b.sum/b.count)break;blocks.splice(-2,2,{sum:a.sum+b.sum,count:a.count+b.count})}}return blocks.flatMap(b=>Array(b.count).fill(b.sum/b.count))}
 function project(a){let x=a.map(v=>Math.max(0,Math.min(PI,v)));x[0]=PI;x[46]=0;const ordered=isotonic(x.map(v=>-v)).map(v=>-v);if(ordered.slice(0,-1).every((v,i)=>v<=ordered[i+1]+limit))return ordered;const corrections=Array.from({length:3},()=>Array(47).fill(0));for(let pass=0;pass<60;pass++){const before=x.slice();for(let kind=0;kind<3;kind++){const y=x.map((v,i)=>v+corrections[kind][i]);let z;if(kind===0)z=isotonic(y.map(v=>-v)).map(v=>-v);else if(kind===1)z=isotonic(y.map((v,i)=>v+i*limit)).map((v,i)=>v-i*limit);else{z=y.map(v=>Math.max(0,Math.min(PI,v)));z[0]=PI;z[46]=0}corrections[kind]=y.map((v,i)=>v-z[i]);x=z}if(same(before,x))break}x[0]=PI;x[46]=0;for(let pass=0;pass<8;pass++){for(let i=1;i<46;i++)x[i]=Math.min(x[i-1],Math.max(x[i-1]-limit,x[i]));for(let i=45;i>0;i--)x[i]=Math.max(x[i+1],Math.min(x[i+1]+limit,x[i]))}return x}
 function evaluate(frame){
  const p=add(M.reference_head_mm,[...frame.xy,0]),points=[p],matrices=[];let terminal_joint_residual_mm=null;
  for(let i=0;i<47;i++){
   const a=frame.theta[i],f=[[Math.cos(a),-Math.sin(a),0],[Math.sin(a),Math.cos(a),0],[0,0,1]],s=M.source_links[i];let R,t;
   if(i===46){const T=M.fixed_terminal_source_transform_CAD_mm;if(!T)throw Error('Missing exact fixed source46 baseline');R=T.slice(0,3).map(r=>r.slice(0,3));t=T.slice(0,3).map(r=>r[3]);terminal_joint_residual_mm=sub(points[i],add(mv(R,s.incoming_mm),t));}
   else{R=mm(f,tr(s.source_frame_columns));t=sub(points[i],mv(R,s.incoming_mm));}
   matrices.push([...R.map((row,k)=>[...row,t[k]]),[0,0,0,1]]);points.push(add(mv(R,s.outgoing_mm),t));
  }
  return{...frame,points,matrices,terminal_joint_residual_mm,endpoint_error_mm:sub(points[47],M.reference_rear_mm),binding,physical_fit_qualified:false};
 }
 function solve(xy,seed){
  let theta=seed.slice(),best=null;
  const target=sub(M.reference_rear_mm,add(M.reference_head_mm,[...xy,0]));
  for(let it=0;it<80;it++){
   countPlanning();const e=[dot(lengths,theta.map(Math.cos))-target[0],dot(lengths,theta.map(Math.sin))-target[1]],score=dot(e,e);
   if(!best||score<best.score)best={theta:theta.slice(),score,e,it};if(score<1e-22)break;
   const step=activeJointStep(theta,lengths,e,limit);if(!step)break;
   const scale=Math.min(1,.1/Math.max(Math.hypot(...step),1e-100));let accepted=false;
   for(const alpha of[1,.5,.25,.125,.0625,.015625,.00390625]){
    const prop=project(theta.map((a,i)=>a+step[i]*scale*alpha)),ee=[dot(lengths,prop.map(Math.cos))-target[0],dot(lengths,prop.map(Math.sin))-target[1]];
    if(dot(ee,ee)<score){theta=prop;accepted=true;break}
   }
   if(!accepted)break;
  }
  return{xy:xy.slice(),theta:best.theta,closure_numeric_error_mm:Math.sqrt(best.score),iterations:best.it};
 }
 function validate(f){if(!Array.isArray(f.xy)||f.xy.length!==2||!Array.isArray(f.theta)||f.theta.length!==47||!vector(f).every(Number.isFinite))throw Error('Malformed source vector');const xyz=f.xy.map((v,k)=>v+M.reference_xy_mm[k]);if(xyz.some((v,k)=>v<M.travel_mm[k][0]||v>M.travel_mm[k][1]))throw Error('Outside actual source travel');if(f.theta[0]!==PI||f.theta[46]!==0||f.theta.some(v=>v<0||v>PI)||f.theta.slice(0,-1).some((v,i)=>v<f.theta[i+1]||v>f.theta[i+1]+limit))throw Error('Outside numerical source stop search bounds');const row=evaluate(f);if(Math.max(Math.hypot(...row.endpoint_error_mm),Math.hypot(...row.terminal_joint_residual_mm))>1e-7)throw Error('Source endpoint closure not converged');return row}
 function planMove(dx,dy){planningIterations=0;const xyz=[dx+M.reference_xy_mm[0],dy+M.reference_xy_mm[1]];if(xyz.some((v,k)=>v<M.travel_mm[k][0]||v>M.travel_mm[k][1]))throw Error('Outside unchanged actual travel');let cursor=structuredClone(current),frames=[];const from=current.xy,n=Math.max(1,Math.ceil(Math.hypot(dx-from[0],dy-from[1])/1));function step(target,depth=0){let f;try{f=solve(target,cursor.theta)}catch(e){failure={requested_target:[dx,dy],rendered_source_vector:structuredClone(current),preceding_planning_source_vector:structuredClone(cursor),target,planning_iterations:planningIterations,budget_only:!!e.source_plan_budget};throw e}if(f.closure_numeric_error_mm>1e-7){if(depth>=18){failure={from:cursor.xy,preceding_planning_source_vector:structuredClone(cursor),target,raw:f};throw Error('REALFAIL source47 closure at '+target)}const mid=cursor.xy.map((v,k)=>(v+target[k])/2);step(mid,depth+1);step(target,depth+1);return}validate(f);frames.push({xy:f.xy,theta:f.theta});cursor=f}for(let i=1;i<=n;i++){planningIterations=0;step(i===n?[dx,dy]:[from[0]+(dx-from[0])*i/n,from[1]+(dy-from[1])*i/n])}pending=frames;pendingReset=false;failure=null;return pending.length}
 function applyNext(){if(!pending.length)return null;const next=pending[0],row=validate(next);onApply(row);pending.shift();current=structuredClone(next);if(pendingReset){if(history.length>1)history.pop();if(!pending.length){history=[structuredClone(reference)];pendingReset=false}}else history.push(structuredClone(next));return row}
 function reset(){pending=history.slice(0,-1).reverse().map(f=>structuredClone(f));if(!pending.length)pending=[structuredClone(reference)];pendingReset=true;return pending.length}
 function capture(){const packet={schema:'captured47-source-state-v13',binding,current:structuredClone(current),history:structuredClone(history),pending:structuredClone(pending),pending_reset:pendingReset,physical_fit_qualified:false};packet.bit_checksum=checksum([Number(packet.pending_reset),...vector(packet.current),...packet.history.flatMap(vector),...packet.pending.flatMap(vector)]);return packet}
 function restore(packet){if(packet?.schema!=='captured47-source-state-v13'||!same(packet.binding,binding)||!Array.isArray(packet.history)||packet.history.length<1||packet.history.length>65536||!Array.isArray(packet.pending)||packet.pending.length>65536||typeof packet.pending_reset!=='boolean'||!same(packet.history[0],reference))throw Error('Source state binding/reference changed');const h=packet.history.map(f=>({xy:f.xy,theta:f.theta})),p=packet.pending.map(f=>({xy:f.xy,theta:f.theta})),c={xy:packet.current.xy,theta:packet.current.theta};for(const f of[h[0],...h.slice(1),...p,c])validate(f);if(checksum([Number(packet.pending_reset),...vector(c),...h.flatMap(vector),...p.flatMap(vector)])!==packet.bit_checksum||!same(c,h.at(-1)))throw Error('Source rendered/pending state corrupted');onApply(validate(c));current=structuredClone(c);history=structuredClone(h);pending=structuredClone(p);pendingReset=packet.pending_reset;failure=null;return evaluate(current)}
 validate(reference);
 return{machine:M,binding,evaluate,solve,planMove,applyNext,planReset:reset,capture,restore,get current(){return structuredClone(current)},get target(){return structuredClone(pending.at(-1)||current)},get pendingCount(){return pending.length},get historyCount(){return history.length},get failure(){return failure},get row(){return evaluate(current)},signature:()=>checksum([...vector(current),...evaluate(current).matrices.flat(2)])};
}

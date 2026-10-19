// Source-derived preview controls. This is not a firmware/build-volume certificate.
// Whole millimetres are the declared control resolution, never a geometric EPS.
import {clipExactSourceHalfplanesSegment} from './source-assembly-runtime/source-XY-exact-clip310.mjs';
const axes=['x','y','z'];
const bits=new DataView(new ArrayBuffer(8));
function exact(v){
 if(!Number.isFinite(v))throw Error('Nonfinite preview position');
 if(v===0)return {n:0n,d:1n};
 bits.setFloat64(0,v,false);const b=bits.getBigUint64(0,false),e=Number((b>>52n)&2047n);
 let n=(b&((1n<<52n)-1n))+(e?1n<<52n:0n);if(b>>63n)n=-n;
 const power=(e?e-1023:-1022)-52;return power>=0?{n:n<<BigInt(power),d:1n}:{n,d:1n<<BigInt(-power)};
}
const compare=(a,b)=>{const v=a.n*b.d-b.n*a.d;return v<0n?-1:v>0n?1:0;};
const floor=q=>Number(q.n>=0n?q.n/q.d:-((-q.n+q.d-1n)/q.d));
const ceil=q=>-floor({n:-q.n,d:q.d});
const at=(v,lo,span)=>{const d=BigInt(v.denominator);return {n:BigInt(lo)*d+BigInt(span)*BigInt(v.numerator),d};};
function bound(packet){
 const c=packet.source_preview_limits6;if(!c)return false;
 if(c.model_sha256!==packet.model.sha256||c.inventory_sha256!==packet.inventory.sha256||c.control_step_mm!==1||c.firmware_or_build_volume_claim!==false||!c.evidence?.sha256)throw Error('Preview boundary binding changed');
 return c;
}
function separation(packet,pose){
 const r=packet.private_source_motion172;let gap=r.reference_nozzle_plate_gap_mm;
 for(const a of axes){const relative=Number(r.nozzle_motion_axes.includes(a))-Number(r.bed_motion_axes.includes(a));gap+=relative*pose[a]*r.axes[a].world_direction.reduce((s,v,i)=>s+v*r.bed_normal_world[i],0);}
 return gap;
}
export function sourceOperatingBounds(packet,pose,axis){
 if(!bound(packet))return null;
 const r=packet.private_source_motion172,d=r.axes[axis];
 if(!d||!axes.every(a=>Number.isFinite(pose[a])))throw Error('Invalid preview boundary request');
 let lo=Math.ceil(d.preview_support_displacement_min_mm),hi=Math.floor(d.preview_support_displacement_max_mm);
 const reasons=[{kind:'finite-source-guide',minimum_mm:d.preview_support_displacement_min_mm,maximum_mm:d.preview_support_displacement_max_mm}];
 if(axis==='x'){
  const receiver=packet.source_receiver_guard309;
  if(receiver){while(lo<=receiver.left_contact_mm)lo++;while(hi>=receiver.right_contact_mm)hi--;reasons.push({kind:'finite-source-receiver',minimum_open_mm:receiver.left_contact_mm,maximum_open_mm:receiver.right_contact_mm});}
 }
 // The nozzle/PEI reference contact is a conservative height guard throughout
 // the preview; it does not pretend that the infinite plane is a finite bed.
 const relative=Number(r.nozzle_motion_axes.includes(axis))-Number(r.bed_motion_axes.includes(axis));
 const coefficient=relative*d.world_direction.reduce((s,v,i)=>s+v*r.bed_normal_world[i],0);
 if(coefficient){
  const origin={...pose,[axis]:0},contact=-separation(packet,origin)/coefficient;
  if(coefficient<0)hi=Math.min(hi,Math.ceil(contact)-1);else lo=Math.max(lo,Math.floor(contact)+1);
  reasons.push({kind:'source-nozzle-print-surface-height',contact_mm:contact,strict_positive_separation:true});
 }
 if(axis!=='z'){
  const data=packet.source_fixed_XY309?.data;
  if(!data||data.model.sha256!==packet.model.sha256||data.inventory.sha256!==packet.inventory.sha256)throw Error('Preview finite-contact source binding changed');
  const start={...pose,[axis]:lo},end={...pose,[axis]:hi},span=hi-lo,current=exact(pose[axis]);
  for(const[index,domain]of data.domains.entries()){
   const hit=clipExactSourceHalfplanesSegment(domain.halfplanes,start,end);if(!hit.intersects)continue;
   const enter=at(hit.enter,start[axis],span),exit=at(hit.exit,start[axis],span);
   if(compare(exit,current)<0)lo=Math.max(lo,floor(exit)+1);
   else if(compare(enter,current)>0)hi=Math.min(hi,ceil(enter)-1);
   else throw Error('Current pose touches a retained finite source body');
   reasons.push({kind:'finite-source-contact-domain',domain:index,head_key:domain.head_key,target_key:domain.target_key,closed_interval_mm:[Number(enter.n)/Number(enter.d),Number(exit.n)/Number(exit.d)]});
  }
 }
 if(lo>hi)throw Error('No whole-millimetre preview interval at this position');
 return {min:lo,max:hi,step:1,axis,conditional_on:axes.filter(a=>a!==axis).map(a=>[a,pose[a]]),reasons};
}
export function validateSourceOperatingPreviewMotion(packet,pose){
 if(!bound(packet))return pose;
 for(const axis of axes){const b=sourceOperatingBounds(packet,pose,axis);if(pose[axis]<b.min||pose[axis]>b.max){const e=Error('Outside the source-based preview controls: '+axis);e.code='SOURCE_PREVIEW_BOUNDARY';throw e;}}
 return pose;
}

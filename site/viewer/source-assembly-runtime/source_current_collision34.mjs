import {validateRevisionProfileValues509} from './source_profile_values509.mjs?v=309aed8e010dad6894ce';
// Selected original finite source bodies only. No generic envelope or fit claim.
const acceptedModels=new Map([['63bfabf0faa4f8b8acdeef56345bc21847567d1b5c8d0cbb05e08070872ce206','2d754ae1efea4410aaa32ad815ed440de6caab320348e5ef96cb30d8b7fc4c79'],['d61a465b47f17d73f4b4c5c36b6da34539f0286112c33b60417acd34532f5e6e','fba4b77ea59b448cb6b4f916cc6783cb714c652ac6f697099424e26c53f611c9']]),id='e3ng_v12_revo_orbiter138_154R';
acceptedModels.set('864985644494b3bfa0fc0a5d761de375f2df66b76ca54f72c505e334f1ab3e04','acb6b407fa5c28929e925993879787ddb754217ffdce818e544683978284ff1f');
acceptedModels.set('1dad2900f881eec60fa16255c98628489443ea453086c79b7d0d6ac0e3e6bf3f','1fb17bae60800458c27ba5ffcd57d4987508f0fda5cec757cade3af60ef7fcca');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Q*M uses extra matrix products for the four unchanged authored case poses.
// Bound those arithmetic roundoff differences only; no contact EPS is applied.
const sameComputedPose=(a,b)=>Array.isArray(a)&&a.length===16&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<=128*Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs)));
function bound(p){
 if(p.id!==id||p.machine!=='e3ng')return null;
 if(p.head_only_subset){if(p.source_current_collision34)throw Error('Full collision profile in source head projection');return null;}
 const q=p.source_current_collision34,model=p.model.sha256;
 if(!q||q.schema!=='current499-source-finite-collision-and-selected-mates-v1'||acceptedModels.get(model)!==p.inventory.sha256||q.model_sha256!==model||q.inventory_sha256!==p.inventory.sha256||q.axis_stops.length!==2||q.finite_facet_barriers.length!==1||q.rigid_attachments.length!==4||q.whole_machine_clearance!==false||!q.evidence?.sha256)throw Error('Fresh current source collision binding required');
 validateRevisionProfileValues509(p);
 const records=new Map(p.parts.map(r=>[r.key,r]));
 const hosts=p.private_source_motion172?.target_axes_by_key;
 if(!hosts||records.size!==p.parts.length||Object.keys(hosts).length!==records.size||[...records.keys()].some(k=>!Object.hasOwn(hosts,k)||!Array.isArray(hosts[k])))throw Error('Missing/extra current source motion owner');
 if(model==='d61a465b47f17d73f4b4c5c36b6da34539f0286112c33b60417acd34532f5e6e'){
  const fixed=["RH3D-vent-latch-A-right-lower-184", "RH3D-vent-latch-A-right-upper-184", "RH3D-vent-latch-B-left-lower-184", "RH3D-vent-latch-B-left-upper-184", "RH3D-vent-latch-bottom-left-184", "RH3D-vent-latch-bottom-right-184"];
  if(records.size!==505||fixed.some(k=>!records.has(k)||hosts[k].length||records.get(k).motion_axes.length||records.get(k).source_preview_motion_axes?.length!==0))throw Error('Changed fixed 505 latch ownership');
 }
 for(const[k,b]of Object.entries(q.bindings)){const r=records.get(k);if(!r||r.source_id!==b.source_id||r.source_identity!==b.source_identity||!same(r.matrix,b.packet_matrix)||!same(p.private_source_motion172.target_axes_by_key[k]??[],b.required_source_hosts))throw Error('Current finite source body/host changed: '+k);}
 const probe=q.parked_probe_common_transport;
 if(!same(p.source_probe_state303.keys,probe.keys))throw Error('Current probe source group changed');
 for(const[k,m]of Object.entries(probe.expected_world_by_key))if(!sameComputedPose(p.source_probe_state303.parked_world_by_key[k],m))throw Error('Missing/stale common parked probe source transform: '+k);
 for(const r of q.rigid_attachments){const registered=p.rigid_attachments?.find(a=>a.id===r.id);if(!registered||!same(registered,r))throw Error('Verified selected wheel source mate missing: '+r.id);}
 return q;
}
function ratio(x){
 if(!Number.isFinite(x))throw Error('Nonfinite source guard value');if(x===0)return{n:0n,d:1n};const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x);const bits=b.getBigUint64(0),sign=bits>>63n?-1n:1n,exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n),mantissa=exponent?fraction+(1n<<52n):fraction,e=(exponent||1)-1023-52;return e>=0?{n:sign*(mantissa<<BigInt(e)),d:1n}:{n:sign*mantissa,d:1n<<BigInt(-e)};
}
function compare(a,b){const v=a.n*b.d-b.n*a.d;return v<0n?-1:v>0n?1:0;}
function stopRatio(s){return{n:BigInt(s.strict_contact_distance_rational.numerator),d:BigInt(s.strict_contact_distance_rational.denominator)};}
function score(row,v){const rr=[ratio(v.x),ratio(v.y),ratio(v.z)],D=rr[0].d*rr[1].d*rr[2].d;let n=BigInt(row[0])*D;for(let i=0;i<3;i++)n+=BigInt(row[i+1])*rr[i].n*(D/rr[i].d);return{n,d:D};}
function facetContact(b,v){return b.integer_halfspaces.every(row=>score(row,v).n>=0n);}
function facetPathContact(b,a,z){
 let lo={n:0n,d:1n},hi={n:1n,d:1n};
 for(const row of b.integer_halfspaces){const x=score(row,a),y=score(row,z);if(x.n<0n&&y.n<0n)return false;if(x.n>=0n&&y.n>=0n)continue;let t={n:-x.n*y.d,d:y.n*x.d-x.n*y.d};if(t.d<0n)t={n:-t.n,d:-t.d};if(x.n<0n){if(compare(t,lo)>0)lo=t;}else if(compare(t,hi)<0)hi=t;if(compare(lo,hi)>0)return false;}
 return compare(lo,hi)<=0;
}
export function validateCurrentSourceCollision34(p,values,probeState='attached'){
 const q=bound(p);if(!q)return values;
 for(const s of q.axis_stops)if(compare(ratio(-values[s.axis]),stopRatio(s))>=0){const e=Error('The source '+s.axis.toUpperCase()+' assembly reaches '+s.pair.join(' / '));e.code='SOURCE_CURRENT_FINITE_BOUNDARY';throw e;}
 for(const b of q.finite_facet_barriers)if(probeState===b.probe_state&&facetContact(b,values)){const e=Error('Attached probe reaches the source docking interface');e.code='SOURCE_CURRENT_FINITE_FACET';throw e;}
 return values;
}
export function validateCurrentSourceCollisionTransition34(p,previous,next){
 const q=bound(p);if(!q||previous?.probe_state!==next?.probe_state)return next;
 for(const b of q.finite_facet_barriers)if(next.probe_state===b.probe_state&&facetPathContact(b,previous.review_axes,next.review_axes)){const e=Error('This source path crosses the docking interface');e.code='SOURCE_CURRENT_FINITE_PATH';throw e;}
 return next;
}
export function currentSourceReviewBounds34(p,axis,raw){
 const q=bound(p);if(!q)return raw;const s=q.axis_stops.find(s=>s.axis===axis);if(!s)return raw;
 const minimum=(Math.floor(s.contact_axis_coordinate_mm/s.UI_resolution_mm)+1)*s.UI_resolution_mm;
 if(compare(ratio(-minimum),stopRatio(s))>=0)throw Error('Invalid source finite control boundary');return{...raw,min:Math.max(raw.min,minimum),source_contact_boundary_mm:s.contact_axis_coordinate_mm,source_boundary_exclusive:true,UI_resolution_mm:s.UI_resolution_mm};
}
export function validateActualCurrentSourceMates34(view,state){
 const q=bound(view.packet);if(!q)return;const p=view.packet;
 const check=(actual,expected,label)=>{const scale=Math.max(1,...actual.map(Math.abs),...expected.map(Math.abs)),roundoff=128*Number.EPSILON*scale;if(actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-expected[i])>roundoff))throw Error('Current source rigid mate detached: '+label);};
 for(const r of q.rigid_attachments){const part=view.parts.get(r.part_key).node,mate=view.parts.get(r.mate_key).node,m=mate.matrixWorld.clone().invert().multiply(part.matrixWorld);check(m.elements,r.source_relative_world_matrix,r.id);}
 for(const k of q.parked_probe_common_transport.keys){let expected=(state.probe_state==='parked'?q.parked_probe_common_transport.expected_world_by_key[k]:q.bindings[k].actual_source_binding.root_world_matrix).slice();if(state.probe_state!=='parked')for(const axis of p.private_source_motion172.target_axes_by_key[k]??[])for(let i=0;i<3;i++)expected[12+i]+=p.private_source_motion172.axes[axis].world_direction[i]*state.review_axes[axis]*.001;check(view.parts.get(k).node.matrixWorld.elements,expected,k);}
}
export const sourceCollision34Scope='Two complete finite-source axis first-contact pairs, one selected attached-dock facet barrier,4 verified wheel mates and9-part discrete probe rigidity. Other pairs/native fit/dock capture remain unqualified.';

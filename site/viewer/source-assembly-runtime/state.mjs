import {validateCurrentSourceCollision34,validateCurrentSourceCollisionTransition34} from './source_current_collision34.mjs?v=eb7f77c9b47abcc8b543';
import {validateSourceOperatingPreviewMotion} from '../source-operating-bounds6.mjs?v=1e6289b77e9233488baf';
import {validateFixedSourceXYMotion,validateFixedSourceXYTransition} from './source_XY309.mjs?v=9e7ad89598a23adcc9e0';
import {finiteSourceContactCoverage,continuousSourceContactSegment} from './finite_contact_domain.mjs?v=2eeca1145e8b24e9b955';
import {validateSelectedSourceReceiverMotion,sourceReviewBounds} from './receiver_guard309.mjs?v=e73d2df413e8fdcf045d';
export const stateSchema='priority-private-state-v1';
export function initialState(p){const s={schema:stateSchema,packet:p.id,model_sha256:p.model.sha256,inventory_sha256:p.inventory.sha256,variant:p.default_variant,axes:{x:0,y:0,z:0},groups:Object.fromEntries((p.visibility_groups||[]).filter(g=>g.default_visible===false).map(g=>[g.id,false])),palette:{M:'#245963',A:'#ed744c'},theme:'dark',lighting:'studio',lightIntensity:1,grid:false,language:'en',camera:null};if(p.private_source_motion172)s.review_axes={x:0,y:0,z:0};if(p.source_probe_state303)s.probe_state='attached';return s;}
export function motionFindings(p){
 const issues=[];
 for(const a of 'xyz'){const r=p.axes?.[a];if(!r||!Number.isFinite(r.min_mm)||!Number.isFinite(r.max_mm)||r.min_mm>0||r.max_mm<0||r.max_mm<=r.min_mm||r.direction?.length!==3||!r.direction.every(Number.isFinite)||Math.abs(Math.hypot(...r.direction)-1)>1e-8||!r.evidence?.sha256)issues.push('Source range missing: '+a);}
 if(p.machine==='virtu'){for(const a of 'xyz')if(p.axes?.[a]?.range_basis!=='source-mating-travel')issues.push('Geometric source-mating travel missing: '+a);const n=p.nozzle_origin;if(n?.verified!==true||!n.evidence?.sha256||n.point_world_mm?.length!==3||!n.point_world_mm.every(Number.isFinite)||!p.parts?.some(r=>r.key===n.part_key))issues.push('Geometric source nozzle origin missing');}
 for(const kind of ['belt','ptfe','can','chain']){const r=p.route_applicability?.[kind],f=p.source_flex181,preview=f&&({belt:5,chain:10,ptfe:2}[kind])&&f.added_keys.every(k=>p.parts.some(x=>x.key===k))||p.belts191B&&kind==='belt'&&p.belts191B.added_keys.every(k=>p.parts.some(x=>x.key===k))||kind==='ptfe'&&p.source_drive304?.companions&&p.parts.some(x=>x.key===p.source_drive304.companions.PTFE.key);if(!r&&!preview||r?.required===true&&!p.routes?.some(x=>x.kind===kind)&&!preview||r?.required===false&&!r.evidence?.sha256)issues.push('Source route missing: '+kind);}
 if(p.belts191B)issues.push('Belt clamp engagement, cut tails, loaded tooth phase and full clearance unverified',p.source_Z_idler196_selected?'Selected source Z idler frame/body and seat checks passed; belt tension, clamps and bearing-stack fit remain unverified':'Z belt idler tensioning pose is unqualified and not applied');
 if(p.source_flex181)issues.push(p.source_GT2_189?'Loaded tooth phase, finite clamp engagement and swept belt clearance unverified':p.source_GT2_186?'Tooth pitch deforms under weighted diagnostic motion; loaded phase and finite clamp engagement unverified':'Belt teeth, cut tails and finite clamp engagement unverified','Chain connector stops and full body clearance unverified','PTFE retention, collets and full route clearance unverified');
 if(!p.rigid_attachments?.length)issues.push('Source rigid attachment datums missing');else if(p.machine==='e3ng'&&p.rigid_attachment_scope34?.whole_machine_attachments_complete!==true)issues.push('Only selected source rigid mates registered; remaining attachments unverified');
 for(const r of p.routes||[]){if(!r.deformation?.evidence?.sha256||r.endpoints?.length<2||!r.endpoints)issues.push('Source attachment missing: '+r.part_key);const f=r.geometry_features;if(!f?.evidence?.sha256||r.kind==='belt'&&(!f.belt_width||!f.cut_ends?.length||!f.teeth)||r.kind==='chain'&&!f.links?.length||['ptfe','can','cpap','water'].includes(r.kind)&&!f.fittings?.length)issues.push('Actual route fit features missing: '+r.part_key);}
 return issues;
}
export function validateState(s,p){
 if(s?.schema!==stateSchema||s.packet!==p.id||s.model_sha256!==p.model.sha256||s.inventory_sha256!==p.inventory.sha256)throw Error('Configuration belongs to a different source revision');
 if(!p.variants.some(v=>v.id===s.variant))throw Error('Unavailable source configuration');
 if(Object.keys(s.axes||{}).sort().join()!=='x,y,z')throw Error('Invalid axis state');
 for(const a of 'xyz'){const v=s.axes[a],r=p.axes?.[a];if(!Number.isFinite(v)||v!==0&&(!r||motionFindings(p).length)||r&&(v<r.min_mm||v>r.max_mm))throw Error('Axis lacks source-backed travel: '+a);}
 if(p.source_probe_state303){if(!['attached','parked'].includes(s.probe_state??'attached'))throw Error('Invalid source probe state');}else if(s.probe_state!==undefined)throw Error('Source probe parking unavailable');
 if(p.private_source_motion172)validateReviewMotion(p,s.review_axes,s.probe_state??'attached');else if(s.review_axes!==undefined)throw Error('Source diagnostic movement unavailable');
 const groupIds=new Set((p.visibility_groups||[]).map(g=>g.id));if(!s.groups||Object.entries(s.groups).some(([k,v])=>!groupIds.has(k)||typeof v!=='boolean'))throw Error('Invalid source visibility group');
 if(p.source_loom305?.blocked_group_id&&s.groups[p.source_loom305.blocked_group_id]===true)throw Error('Loom preview held: actual body crossings and folded triangles');
 for(const k of ['M','A'])if(!/^#[a-f\d]{6}$/i.test(s.palette?.[k]))throw Error('Invalid printed palette');
 if(!['light','dark'].includes(s.theme)||!['studio','white','rgb','off'].includes(s.lighting)||!['en','ja','es','ko','ru','de'].includes(s.language)||typeof s.grid!=='boolean'||!Number.isFinite(s.lightIntensity)||s.lightIntensity<0||s.lightIntensity>2)throw Error('Invalid display settings');
 if(s.camera!==null){for(const k of ['position','target'])if(!Array.isArray(s.camera?.[k])||s.camera[k].length!==3||!s.camera[k].every(v=>Number.isFinite(v)&&Math.abs(v)<100))throw Error('Invalid camera');if(Math.hypot(...s.camera.position.map((v,i)=>v-s.camera.target[i]))<.001)throw Error('Invalid camera distance');}
 return s;
}
export function visibleKeys(p,s){const v=p.variants.find(v=>v.id===s.variant);if(!v)throw Error('Unknown source variant');const set=new Set(v.visible_keys);for(const g of p.visibility_groups||[])if(s.groups[g.id]===false)for(const k of g.keys)set.delete(k);for(const key of p.source_loom305?.held_keys||[])set.delete(key);return set;}
export function worldDelta(axes,groups,p){const source=[0,0,0];for(const a of groups){if(axes[a]===0)continue;const r=p.axes[a];if(!r)throw Error('Missing source direction '+a);for(let i=0;i<3;i++)source[i]+=axes[a]*r.direction[i];}return p.basis.map(row=>row.reduce((v,n,i)=>v+n*source[i],0)*p.unit_scale);}
export function adaptivePoses(p,maxVertexStepMm=2){
 if(motionFindings(p).length)throw Error(motionFindings(p).join('; '));
 if(!Number.isFinite(maxVertexStepMm)||maxVertexStepMm<=0)throw Error('Invalid adaptive step');
 const result=[{x:0,y:0,z:0}];
 // Bound actual translational movement including simultaneous axes by source directions.
 const events=[];for(const a of 'xyz'){const r=p.axes[a];for(const v of [r.min_mm,(r.min_mm+r.max_mm)/2,r.max_mm,r.min_mm,0])events.push({...result[0],[a]:v});}
 events.push(Object.fromEntries([... 'xyz'].map(a=>[a,p.axes[a].max_mm])),Object.fromEntries([... 'xyz'].map(a=>[a,p.axes[a].min_mm])),{x:0,y:0,z:0});
 for(const end of events){const start=result.at(-1),bound=[...'xyz'].reduce((sum,a)=>sum+Math.abs(end[a]-start[a]),0),n=Math.max(1,Math.ceil(bound/maxVertexStepMm));if(result.length+n>100000)throw Error('Adaptive pose budget exceeded');for(let i=1;i<=n;i++)result.push(Object.fromEntries([... 'xyz'].map(a=>[a,start[a]+(end[a]-start[a])*i/n])));}
 return result;
}

// Actual source guide support diagnostics; never firmware or collision-free travel.
const axes=['x','y','z'],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function reviewSeparation(packet,values){const r=packet.private_source_motion172;if(!r)throw Error('Source movement review missing');let gap=r.reference_nozzle_plate_gap_mm;for(const a of axes){const relative=(r.nozzle_motion_axes.includes(a)?1:0)-(r.bed_motion_axes.includes(a)?1:0);gap+=relative*values[a]*dot(r.axes[a].world_direction,r.bed_normal_world);}return gap;}
export function reviewProbeSeparation(packet,values,probeState='attached'){
 const r=packet.private_source_motion172,s=packet.source_probe_state303;if(!s)return null;
 if(!['attached','parked'].includes(probeState)||s.model_sha256!==packet.model.sha256||s.inventory_sha256!==packet.inventory.sha256)throw Error('Invalid source probe guard revision');
 if(probeState==='parked'){if(s.parked_bed_footprint_disjoint!==true||!s.evidence?.sha256)throw Error('Missing parked probe finite bed evidence');return null;}
 let gap=s.attached_probe_plate_gap_mm;for(const a of axes){const relative=(s.attached_axes.includes(a)?1:0)-(r.bed_motion_axes.includes(a)?1:0);gap+=relative*values[a]*dot(r.axes[a].world_direction,r.bed_normal_world);}return gap;
}
export function validateReviewMotion(packet,values,probeState='attached'){const r=packet.private_source_motion172;if(!r||r.model_sha256!==packet.model.sha256||r.consumer_inventory_sha256!==packet.inventory.sha256||r.operational_travel_qualified||r.whole_motion_verified||Object.keys(values||{}).sort().join()!=='x,y,z')throw Error('Invalid source diagnostic revision');for(const a of axes){const v=values[a],d=r.axes[a];if(!Number.isFinite(v)||v<d.preview_support_displacement_min_mm||v>d.preview_support_displacement_max_mm)throw Error('Outside source guide envelope: '+a);}validateCurrentSourceCollision34(packet,values,probeState);validateSelectedSourceReceiverMotion(packet,values);validateFixedSourceXYMotion(packet,values);validateSourceOperatingPreviewMotion(packet,values);if(!(reviewSeparation(packet,values)>0)&&!isFiniteOriginalNozzleReferenceContact(packet,values,probeState))throw Error('Source nozzle/'+(r.guard_surface==='source-print-surface'?'print-surface':'metal-bed')+' plane guard rejects this diagnostic pose');const probe=reviewProbeSeparation(packet,values,probeState);if(probe!==null&&!(probe>0))throw Error('Source attached-probe/bed plane guard rejects this diagnostic pose');return values;}
export function reviewWorldDelta(packet,key,values,probeState='attached'){const r=packet.private_source_motion172;if(!r)return[0,0,0];const result=[0,0,0],hosts=probeState==='parked'&&packet.source_probe_state303?.keys.includes(key)?[]:r.target_axes_by_key[key]||[];for(const a of hosts)for(let i=0;i<3;i++)result[i]+=values[a]*r.axes[a].world_direction[i]*.001;return result;}
export function adaptiveReviewPoses(packet,maxStepMm=2,probeState='attached'){const r=packet.private_source_motion172;if(!r||!Number.isFinite(maxStepMm)||maxStepMm<=0)throw Error('Missing source review or invalid step');const zero={x:0,y:0,z:0},result=[zero],rejected=[],rejectedPaths=[],events=[];for(const a of axes){const d=r.axes[a];for(const value of[sourceReviewBounds(packet,a).min,(sourceReviewBounds(packet,a).min+sourceReviewBounds(packet,a).max)/2,sourceReviewBounds(packet,a).max,sourceReviewBounds(packet,a).min,0])events.push({...zero,[a]:value});}for(const which of['maximum','minimum','midpoint'])events.push(Object.fromEntries(axes.map(a=>[a,which==='maximum'?sourceReviewBounds(packet,a).max:which==='minimum'?sourceReviewBounds(packet,a).min:(sourceReviewBounds(packet,a).min+sourceReviewBounds(packet,a).max)/2])));events.push(zero);for(const end of events){try{validateReviewMotion(packet,end,probeState);}catch(error){rejected.push({axes:end,reason:error.message});continue;}const start=result.at(-1);try{validateReviewTransition(packet,{review_axes:start,probe_state:probeState},{review_axes:end,probe_state:probeState});}catch(error){rejectedPaths.push({start:{...start},end:{...end},reason:error.message});continue;}const distance=axes.reduce((n,a)=>n+Math.abs(end[a]-start[a]),0),steps=Math.max(1,Math.ceil(distance/maxStepMm));for(let i=1;i<=steps;i++){const pose=i===steps?{...end}:Object.fromEntries(axes.map(a=>[a,start[a]+(end[a]-start[a])*i/steps]));validateReviewMotion(packet,pose,probeState);result.push(pose);}}return {poses:result,rejected_source_endpoints:rejected,rejected_source_transitions:rejectedPaths,complete_operational_motion_pass:false};}

export function isFiniteOriginalNozzleReferenceContact(packet,values,probeState){
 const r=packet.private_source_motion172,c=r?.finite_nozzle_reference_contact;
 if(c?.schema!=='finite-original-nozzle-continuous-XY-contact-v2'||c.assembly_id!==packet.id||c.model_sha256!==packet.model.sha256||c.inventory_sha256!==packet.inventory.sha256||probeState!=='parked'||c.native_nozzle_face!==49||c.native_XY_only!==false||c.source_reference_contact_only!==true||c.no_source_pose_or_geometry_offset!==true||!c.evidence?.sha256)return false;
 const nozzle=packet.parts.find(x=>x.key===c.nozzle_key),bed=packet.parts.find(x=>x.key===c.bed_key);
 if(nozzle?.source_id!==c.nozzle_source_id||bed?.source_id!==c.bed_source_id||!packet.source_probe_state303?.parked_bed_footprint_disjoint)return false;
 for(const a of 'xyz')if(JSON.stringify(r.axes[a].world_direction)!==JSON.stringify(c.required_world_directions[a]))return false;
 if(JSON.stringify(r.bed_normal_world)!==JSON.stringify(c.required_bed_normal_world)||Object.keys(r.target_axes_by_key).length!==Object.keys(c.required_motion_axes_by_key).length)return false;
 for(const [k,v] of Object.entries(c.required_motion_axes_by_key))if(JSON.stringify(r.target_axes_by_key[k])!==JSON.stringify(v))return false;
 return values.z===c.contact_domain.required_review_Z_mm&&values.z===-r.reference_nozzle_plate_gap_mm&&reviewSeparation(packet,values)===0&&finiteSourceContactCoverage(c,values).covered;
}

// UI bounds and contact action share the tested exact finite-coverage predicate.
export function sourceMinimumContext(packet,state){
 const r=packet?.private_source_motion172,c=r?.finite_nozzle_reference_contact;
 const z=c?.contact_domain?.required_review_Z_mm;
 const bound=c&&isFiniteOriginalNozzleReferenceContact(packet,{x:0,y:0,z},'parked');
 const enabled=!!bound&&state?.probe_state==='parked'&&isFiniteOriginalNozzleReferenceContact(packet,{...state.review_axes,z},'parked');
 const rail=r?.axes?.z,values={x:0,y:0,z:0,...state?.review_axes},probeState=state?.probe_state??'attached';
 let minimum=rail?.preview_support_displacement_min_mm,maximum=rail?.preview_support_displacement_max_mm;
 const constraints=[];
 // HTML controls need closed binary64 endpoints. The adjacent admitted value
 // encodes the existing strict plane inequality; it is no geometric clearance.
 function adjacent(value,up){if(value===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,value);let bits=v.getBigUint64(0);bits+=(value>0)===up?1n:-1n;v.setBigUint64(0,bits);return v.getFloat64(0);}
 if(r&&rail){
  const slope=hosts=>((hosts||[]).includes('z')?1:0)-(r.bed_motion_axes.includes('z')?1:0);
  const normalDot=r.axes.z.world_direction.reduce((sum,v,i)=>sum+v*r.bed_normal_world[i],0);
  const tests=[{surface:'nozzle',at:q=>reviewSeparation(packet,{...values,z:q}),coefficient:slope(r.nozzle_motion_axes)*normalDot,contact:q=>isFiniteOriginalNozzleReferenceContact(packet,{...values,z:q},probeState)}];
  if(packet.source_probe_state303&&probeState==='attached')tests.push({surface:'attached-probe',at:q=>reviewProbeSeparation(packet,{...values,z:q},probeState),coefficient:slope(packet.source_probe_state303.attached_axes)*normalDot,contact:()=>false});
  for(const test of tests){
   const gap=test.at(0),coefficient=test.coefficient;if(!Number.isFinite(gap)||!Number.isFinite(coefficient))throw Error('Nonfinite existing source plane constraint');
   if(coefficient===0){if(!(gap>0)&&!test.contact(0))throw Error('Current XY pose has no admitted source plane interval');continue;}
   const boundary=-gap/coefficient,accepted=q=>test.at(q)>0||test.contact(q);
   const inclusive=accepted(boundary);let endpoint=boundary;
   for(let steps=0;!accepted(endpoint);steps++){if(steps>=16)throw Error('No adjacent controller-admitted source plane endpoint');endpoint=adjacent(endpoint,coefficient>0);}
   if(coefficient>0)minimum=Math.max(minimum,endpoint);else maximum=Math.min(maximum,endpoint);
   constraints.push({surface:test.surface,boundary_z_mm:boundary,strict:!inclusive,coefficient,accepted_control_endpoint_z_mm:endpoint});
  }
  if(minimum>maximum)throw Error('Empty existing source plane interval');
 }
 return {bound:!!bound,enabled,minimum_z_mm:minimum,maximum_z_mm:maximum,
  diagnostic_rail_min_mm:rail?.preview_support_displacement_min_mm,diagnostic_rail_max_mm:rail?.preview_support_displacement_max_mm,source_plane_constraints:constraints,
  label:state?.probe_state==='attached'?'attachedProbeMinimum':enabled?'sourceNozzleMinimum':'sourceNozzleOutsideBed'};
}
export function sourceMinimumState(packet,state){
 validateState(state,packet);
 if(!sourceMinimumContext(packet,state).enabled)throw Error('Source nozzle contact requires parked Klicky and finite nozzle coverage by the source plate');
 const next=structuredClone(state);next.review_axes.z=packet.private_source_motion172.finite_nozzle_reference_contact.contact_domain.required_review_Z_mm;
 validateState(next,packet);return next;
}

export function validateReviewTransition(packet,previous,next){
 validateCurrentSourceCollisionTransition34(packet,previous,next);
 if(packet.source_fixed_XY309&&packet.private_source_motion172)validateFixedSourceXYTransition(packet,previous.review_axes,next.review_axes);
 const c=packet.private_source_motion172?.finite_nozzle_reference_contact;
 if(c?.schema!=='finite-original-nozzle-continuous-XY-contact-v2')return next;
 const a=previous?.review_axes,b=next?.review_axes;
 if(isFiniteOriginalNozzleReferenceContact(packet,a,previous.probe_state)&&isFiniteOriginalNozzleReferenceContact(packet,b,next.probe_state)&&!continuousSourceContactSegment(c,a,b).covered){
  const error=Error('Source contact path crosses a bed opening or edge');error.code='SOURCE_CONTACT_PATH';throw error;
 }
 return next;
}

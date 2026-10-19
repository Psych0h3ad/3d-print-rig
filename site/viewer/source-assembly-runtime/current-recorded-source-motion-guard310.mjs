// Exact retained source-triangle domains under original relative X/Y translation.
// Apply before changing model state for direct motion, rapid presets or save/load.
import {clipExactSourceHalfplanesSegment}from './source-XY-exact-clip310.mjs?v=e42678a5314a2d6c0676';
function binding(packet,data){
 if(packet.model.sha256!==data.model.sha256||packet.inventory.sha256!==data.inventory.sha256)throw Error('Recorded source guard requires current actual source-body rebind');
 const motion=packet.private_source_motion172,parts=new Map(packet.parts.map(p=>[p.key,p]));
 for(const a of ['x','y','z'])if(JSON.stringify(motion.axes[a].world_direction)!==JSON.stringify(data.source_axes[a]))throw Error('Source movement axis changed');
 for(const d of data.domains){
  if(parts.get(d.head_key)?.source_id!==d.head_source_id||parts.get(d.target_key)?.source_id!==d.target_source_id)throw Error('Retained original source part identity changed');
  for(const a of ['x','y','z']){
   const relative=Number((motion.target_axes_by_key[d.head_key]||[]).includes(a))-Number((motion.target_axes_by_key[d.target_key]||[]).includes(a));
   if(relative!==d.relative_axis_coefficients[a])throw Error('Original relative movement hosts changed');
  }
 }
}
function poseFinite(p){if(!p||!['x','y','z'].every(a=>Number.isFinite(p[a])))throw Error('Nonfinite source pose');}
function X(p,data){const [lo,hi]=data.strict_X_interval_mm;if(!(lo<p.x&&p.x<hi))throw Error('Source carriage contacts Y receiver at X limit');}
export function validateRecordedSourceMotion310(packet,pose,data){
 binding(packet,data);poseFinite(pose);X(pose,data);
 for(const d of data.domains)if(clipExactSourceHalfplanesSegment(d.halfplanes,pose,pose).intersects)throw Error('Retained source body contact: '+d.head_key+' / '+d.target_key);
 return pose;
}
export function validateRecordedSourceTransition310(packet,start,end,data){
 binding(packet,data);poseFinite(start);poseFinite(end);X(start,data);X(end,data);
 // The strict X interval is convex, so admitted endpoints contain the full X path.
 // Every source halfplane is clipped at exact rational 0<=t<=1; even a tangent fails.
 for(const d of data.domains)if(clipExactSourceHalfplanesSegment(d.halfplanes,start,end).intersects)throw Error('Retained source path crosses/touches body: '+d.head_key+' / '+d.target_key);
 return end;
}

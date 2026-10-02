/** Immutable program time -> XYZE. No renderer, firmware, wall clock or I/O. */
export function sampleGcode(program,seconds){
 if(!program?.complete||!Number.isFinite(seconds))throw Error('再生できる軌跡と有限の時刻が必要です');
 const time=Math.max(0,Math.min(program.duration_s,seconds)),events=program.events;
 let lo=0,hi=events.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].elapsed_s<=time)lo=mid+1;else hi=mid}
 const event=events[lo],last=events[lo-1];
 if(!event)return {time_s:time,index:lo,event:last||null,position:[...(last?.to||program.initial)],done:true};
 const start=event.elapsed_s-event.duration_s,f=event.duration_s?Math.max(0,Math.min(1,(time-start)/event.duration_s)):1;
 return {time_s:time,index:lo,event,position:event.from.map((v,i)=>v+(event.to[i]-v)*f),done:false};
}
/** Routes live in the bed's reference frame; Trident paths follow its moving bed. */
export function programPoint({nozzle_mm,reference_xyz_mm},xyz){
 return xyz.map((v,i)=>nozzle_mm[i]+v-reference_xyz_mm[i]);
}
export function programPathOffset({moving_bed_z=false,reference_xyz_mm},xyz){
 return [0,0,moving_bed_z?reference_xyz_mm[2]-xyz[2]:0];
}

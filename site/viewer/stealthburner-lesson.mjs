// A visual sequence, not a thermal / airflow / extrusion solver.
export const lessonDuration = 40;
export const lessonChapters = Object.freeze([
  {id:'feed', at:0, title:'cutaway.feed_title', text:'cutaway.feed_text'},
  {id:'heater', at:10, title:'cutaway.heater_title', text:'cutaway.heater_text'},
  {id:'break', at:20, title:'cutaway.break_title', text:'cutaway.break_text'},
  {id:'fan', at:30, title:'cutaway.fan_title', text:'cutaway.fan_text'},
]);
const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,Number.isFinite(Number(n))?Number(n):lo));
const smooth = n => {const x=clamp(n,0,1);return x*x*(3-2*x)};
export function lessonState(seconds,{heater=true,fan=true,feed=true}={}) {
  const time=clamp(seconds,0,lessonDuration);
  const hot=heater?smooth((time-4)/14):0;
  return {time,chapter:Math.min(3,Math.floor(time/10)),hot,
    sink:hot*(fan?.13:.6),break:hot*(fan?.38:.7),fan:!!fan,
    extrusion:feed&&hot>.78,feed:!!feed,heatCreep:!fan&&hot>.78};
}
export function sectionFraction(value){return clamp(value,0,100)/100;}
export function advanceLesson(seconds,delta,playing=true){
  return clamp(seconds+(playing?clamp(delta,0,.1):0),0,lessonDuration);
}

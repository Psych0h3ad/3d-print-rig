/** Time-based LED samples. Positions run from 0 to 1 along each physical stick. */
export const ledEffects=['static','flow','breath','chase'];
const wrap=n=>((n%1)+1)%1;
export function ledSample({color='white',effect='flow',position=0,seconds=0}={}){
 const t=Math.max(0,Math.min(1,Number(position)||0)),time=Number.isFinite(seconds)?seconds:0;
 let gain=1,hue=t*.82;
 if(effect==='flow'){hue+=time*.12;if(color!=='rainbow')gain=.25+.75*(.5+.5*Math.cos(2*Math.PI*(t-time*.18)))}
 if(effect==='breath')gain=.12+.88*(.5-.5*Math.cos(2*Math.PI*time/3));
 if(effect==='chase'){const d=Math.abs(t-wrap(time*.22)),distance=Math.min(d,1-d);gain=.03+.97*Math.exp(-distance*distance/.008)}
 return {hue:wrap(hue),gain,hex:color==='red'?0xff1838:color==='blue'?0x387dff:0xfff4e7,rainbow:color==='rainbow'};
}
/** One throttled loop, stopped whenever its owner is off or the page is hidden. */
export function createLedAnimator({active,rate=()=>1,draw,request=requestAnimationFrame,cancel=cancelAnimationFrame}={}){
 let pending=0,previous=null,lastDraw=null,seconds=0,disposed=false;
 function tick(now){pending=0;if(disposed||!active()){previous=lastDraw=null;return}
  if(previous!==null)seconds+=Math.max(0,Math.min(.1,(now-previous)/1000))*Math.max(0,Number(rate())||0);previous=now;
  if(lastDraw===null||now-lastDraw>=1000/30){lastDraw=now;draw(seconds)}
  pending=request(tick);
 }
 function stop(){if(pending)cancel(pending);pending=0;previous=lastDraw=null}
 function refresh(){stop();if(!disposed&&active())pending=request(tick)}
 function dispose(){disposed=true;refresh()}
 return {refresh,stop,dispose,get seconds(){return seconds},get running(){return !!pending}};
}

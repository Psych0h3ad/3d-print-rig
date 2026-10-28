import {openingFrame} from './layout-openings.mjs?v=205557f45ffa9cc712d2';

const distance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
};
function inside(point,polygon){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}

// The badge is drawn off the wall line and can sit above a window. Hit-test
// its actual plan outline first; a wall-span tie must not steal its clicks.
export function pickPlanOpening(room,pointer,project,primitives,tolerancePx=14){
  let badge=null;
  for(const path of primitives){
    if(path.role!=='vent-ring')continue;
    const polygon=path.pointsMm.map(project),center=polygon.reduce((p,q)=>[p[0]+q[0]/polygon.length,p[1]+q[1]/polygon.length],[0,0]);
    const edge=Math.min(...polygon.map((p,i)=>distance(pointer,p,polygon[(i+1)%polygon.length])));
    if(!inside(pointer,polygon)&&edge>tolerancePx)continue;
    const metric=Math.hypot(pointer[0]-center[0],pointer[1]-center[1]);
    if(!badge||metric<badge.metric||metric===badge.metric&&path.openingId<badge.id)badge={id:path.openingId,metric};
  }
  if(badge)return badge.id;
  let best=null;
  for(const o of room.openings??[]){
    const f=openingFrame(room,o),a=project(f.startMm),b=project(f.endMm),d=distance(pointer,a,b);
    if(d>tolerancePx)continue;
    const rank=o.type==='vent'?1:0;
    if(!best||d<best.distance||d===best.distance&&rank<best.rank)best={id:o.id,distance:d,rank};
  }
  return best?.id??null;
}

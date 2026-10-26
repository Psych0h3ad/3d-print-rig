import {polygonAreaSign,orient,polygonsOverlap} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

// Layout dimensions are millimetres. These are room-planning surfaces, not
// construction details or manufacturer door-clearance certificates.
export const MAX_ROOM_OPENINGS=64;
const common=['id','type','wallIndex','offsetMm','widthMm','heightMm','sillMm'];
const hingedFields=['motion','hinge','openAngleDeg'],slidingFields=['motion','slideDirection','openPercent'];
const plain=x=>x!==null&&typeof x==='object'&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(x)&&!['__proto__','prototype','constructor'].includes(x);
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const point=(a,u,d)=>[a[0]+u[0]*d,a[1]+u[1]*d];
export function wallFrame(room,index){
  const a=room.polygonMm[index],b=room.polygonMm[(index+1)%room.polygonMm.length];
  if(!a||!b)throw new RangeError('Invalid room wall');
  const dx=b[0]-a[0],dz=b[1]-a[1],lengthMm=Math.hypot(dx,dz),sign=polygonAreaSign(room.polygonMm);
  if(!lengthMm||!sign)throw new RangeError('Invalid room wall');
  const along=[dx/lengthMm,dz/lengthMm];
  return {index,startMm:[...a],endMm:[...b],lengthMm,along,inward:[-along[1]*sign,along[0]*sign]};
}
export function openingFrame(room,opening){
  const frame=wallFrame(room,opening.wallIndex),startMm=point(frame.startMm,frame.along,opening.offsetMm);
  return {...frame,wallIndex:opening.wallIndex,startMm,endMm:point(startMm,frame.along,opening.widthMm),
    centerMm:point(startMm,frame.along,opening.widthMm/2),widthMm:opening.widthMm,heightMm:opening.heightMm,
    sillMm:opening.sillMm,type:opening.type,motion:opening.motion??'hinged',hinge:opening.hinge,openAngleDeg:opening.openAngleDeg,
    slideDirection:opening.slideDirection,openPercent:opening.openPercent};
}
export function openingProblems(room){
  if(!Object.hasOwn(room,'openings'))return [];
  const errors=[],add=(code,path,params={})=>errors.push({code,path,params});
  if(!Array.isArray(room.openings)||room.openings.length>MAX_ROOM_OPENINGS){add('OPENING_COUNT','room.openings');return errors;}
  const good=[],ids=new Set();
  room.openings.forEach((o,i)=>{
    const path=`room.openings[${i}]`;
    if(!plain(o)){add('OPENING_INVALID',path);return;}
    const motion=o.motion??'hinged',allowed=o.type==='door'?[...common,...(motion==='sliding'?slidingFields:hingedFields)]:common;
    if(!['window','door'].includes(o.type)||Object.keys(o).some(k=>!allowed.includes(k))||!safeId(o.id)
      ||!['offsetMm','widthMm','heightMm','sillMm'].every(k=>finite(o[k]))
      ||o.widthMm<1||o.heightMm<1||o.offsetMm<0||o.sillMm<0
      ||(o.type==='door'&&(o.sillMm!==0||(Object.hasOwn(o,'motion')&&!['hinged','sliding'].includes(o.motion))||!['hinged','sliding'].includes(motion)
        ||(motion==='sliding'?(!['left','right'].includes(o.slideDirection)||!finite(o.openPercent)||o.openPercent<0||o.openPercent>100)
          :(!['left','right'].includes(o.hinge)||!finite(o.openAngleDeg)||o.openAngleDeg<0||o.openAngleDeg>120))))){add('OPENING_INVALID',path);return;}
    if(ids.has(o.id))add('DUPLICATE_ENTITY_ID',`${path}.id`);ids.add(o.id);
    if(!Number.isInteger(o.wallIndex)||o.wallIndex<0||o.wallIndex>=room.polygonMm.length){add('OPENING_WALL',`${path}.wallIndex`);return;}
    const frame=wallFrame(room,o.wallIndex);
    if(o.offsetMm+o.widthMm>frame.lengthMm||o.sillMm+o.heightMm>room.wallHeightMm){add('OPENING_OUT_OF_BOUNDS',path);return;}
    good.push({o,path});
  });
  for(let i=0;i<good.length;i++)for(let j=i+1;j<good.length;j++){
    const {o:a}=good[i],{o:b,path}=good[j];
    if(a.wallIndex===b.wallIndex&&Math.max(a.offsetMm,b.offsetMm)<Math.min(a.offsetMm+a.widthMm,b.offsetMm+b.widthMm)
      &&Math.max(a.sillMm,b.sillMm)<Math.min(a.sillMm+a.heightMm,b.sillMm+b.heightMm))add('OPENING_OVERLAP',path,{openingIds:[a.id,b.id]});
  }
  return errors;
}
// Partition each wall into disjoint rectangles, so no wall face crosses a hole.
export function wallPanels(room,index){
  const frame=wallFrame(room,index),holes=(room.openings??[]).filter(o=>o.wallIndex===index),h=room.wallHeightMm;
  const xs=[...new Set([0,frame.lengthMm,...holes.flatMap(o=>[o.offsetMm,o.offsetMm+o.widthMm])])].sort((a,b)=>a-b),panels=[];
  let previous=new Map();
  for(let i=0;i<xs.length-1;i++){
    const x=xs[i],right=xs[i+1],occupied=holes.filter(o=>o.offsetMm<right&&o.offsetMm+o.widthMm>x).sort((a,b)=>a.sillMm-b.sillMm);
    let bottom=0;const gaps=[];
    for(const hole of occupied){if(hole.sillMm>bottom)gaps.push([bottom,hole.sillMm]);bottom=Math.max(bottom,hole.sillMm+hole.heightMm);}
    if(bottom<h)gaps.push([bottom,h]);
    const current=new Map();
    for(const [lo,hi] of gaps){
      const key=`${lo}:${hi}`,old=previous.get(key);
      if(old){old.widthMm+=right-x;current.set(key,old);}
      else{const panel={offsetMm:x,bottomMm:lo,widthMm:right-x,heightMm:hi-lo};panels.push(panel);current.set(key,panel);}
    }
    previous=current;
  }
  return panels;
}
function hull(points){
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||!same(p,a[i-1]));
  if(sorted.length<3)return sorted;
  const half=values=>{const result=[];for(const p of values){while(result.length>1&&orient(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result;};
  const a=half(sorted),b=half([...sorted].reverse());return [...a.slice(0,-1),...b.slice(0,-1)];
}
export function doorPlan(room,opening){
  if(opening.motion==='sliding')return slidingDoorPlan(room,opening);
  const f=openingFrame(room,opening),frameMm=Math.min(35,opening.widthMm*.1,opening.heightMm*.1),leafWidthMm=opening.widthMm-2*frameMm;
  const closedDir=f.along.map(v=>v*(opening.hinge==='right'?-1:1));
  const base=opening.hinge==='right'?point(f.endMm,f.along,-frameMm):point(f.startMm,f.along,frameMm);
  const hingeMm=point(base,f.inward,-25),angle=opening.openAngleDeg*Math.PI/180;
  const at=a=>point(point(hingeMm,closedDir,leafWidthMm*Math.cos(a)),f.inward,leafWidthMm*Math.sin(a));
  const tipMm=at(angle),closedTipMm=at(0),axis=[(tipMm[0]-hingeMm[0])/leafWidthMm,(tipMm[1]-hingeMm[1])/leafWidthMm],normal=[-axis[1],axis[0]],thicknessMm=35;
  const leafPolygonMm=[point(hingeMm,normal,-17.5),point(tipMm,normal,-17.5),point(tipMm,normal,17.5),point(hingeMm,normal,17.5)];
  const steps=Math.max(1,Math.ceil(opening.openAngleDeg/10)),arcMm=Array.from({length:steps+1},(_,i)=>at(angle*i/steps));
  // Circumscribe the sector then expand it by a square containing the leaf's
  // half thickness. This is a conservative planning warning, not a fit test.
  const factor=1/Math.cos(angle/steps/2),sector=[hingeMm,...arcMm.map(p=>[hingeMm[0]+(p[0]-hingeMm[0])*factor,hingeMm[1]+(p[1]-hingeMm[1])*factor])];
  const sweepPolygonMm=hull(sector.flatMap(p=>[[-17.5,-17.5],[17.5,-17.5],[17.5,17.5],[-17.5,17.5]].map(d=>[p[0]+d[0],p[1]+d[1]])));
  return {motion:'hinged',hingeMm,tipMm,closedTipMm,arcMm,leafPolygonMm,sweepPolygonMm,leafWidthMm,frameMm,thicknessMm};
}
function slidingDoorPlan(room,opening){
  const f=openingFrame(room,opening),frameMm=Math.min(35,opening.widthMm*.1,opening.heightMm*.1),leafWidthMm=opening.widthMm,thicknessMm=35;
  // A single surface-mounted panel, with a 10mm gap to the clear wall face.
  const closedStartMm=point(f.startMm,f.inward,27.5),closedEndMm=point(closedStartMm,f.along,leafWidthMm);
  const direction=opening.slideDirection==='left'?-1:1,travelMm=direction*opening.widthMm*opening.openPercent/100;
  const startMm=point(closedStartMm,f.along,travelMm),endMm=point(closedEndMm,f.along,travelMm);
  const strip=(a,b,half)=>[point(a,f.inward,-half),point(b,f.inward,-half),point(b,f.inward,half),point(a,f.inward,half)];
  const leafPolygonMm=strip(startMm,endMm,17.5),sweepPolygonMm=hull([...leafPolygonMm,...strip(closedStartMm,closedEndMm,17.5)]);
  const railStartMm=direction<0?point(closedStartMm,f.along,-opening.widthMm):closedStartMm;
  const railEndMm=direction>0?point(closedEndMm,f.along,opening.widthMm):closedEndMm,railPolygonMm=strip(railStartMm,railEndMm,7.5);
  return {motion:'sliding',startMm,endMm,closedStartMm,closedEndMm,railStartMm,railEndMm,railPolygonMm,
    leafPolygonMm,sweepPolygonMm,leafWidthMm,frameMm,thicknessMm,arcMm:[],slideDirection:opening.slideDirection,openPercent:opening.openPercent,
    obstructionVolumes:[{polygonMm:sweepPolygonMm,bottomMm:0,topMm:opening.heightMm-frameMm},
      {polygonMm:railPolygonMm,bottomMm:opening.heightMm-frameMm,topMm:opening.heightMm}]};
}
export function withDoorMotion(opening,motion){
  if(opening.type!=='door'||!['hinged','sliding'].includes(motion))throw Object.assign(new Error('Invalid door motion'),{code:'OPENING_INVALID'});
  if((opening.motion??'hinged')===motion)return opening;
  const result=Object.fromEntries(common.map(k=>[k,opening[k]]));
  return {...result,motion,...(motion==='sliding'?{slideDirection:'left',openPercent:0}:{hinge:'left',openAngleDeg:90})};
}
export function newRoomOpening(room,{id,type,wallIndex}){
  if(!['door','window'].includes(type)||!safeId(id))throw Object.assign(new Error('Invalid opening'),{code:'OPENING_INVALID'});
  if(!Number.isInteger(wallIndex)||wallIndex<0||wallIndex>=room.polygonMm.length)throw Object.assign(new Error('Invalid wall'),{code:'OPENING_WALL'});
  const frame=wallFrame(room,wallIndex),heightMm=Math.min(type==='door'?2100:1000,room.wallHeightMm),sillMm=type==='door'?0:Math.min(900,room.wallHeightMm-heightMm);
  const occupied=(room.openings??[]).filter(o=>o.wallIndex===wallIndex&&Math.max(o.sillMm,sillMm)<Math.min(o.sillMm+o.heightMm,sillMm+heightMm)).map(o=>[o.offsetMm,o.offsetMm+o.widthMm]).sort((a,b)=>a[0]-b[0]);
  let last=0;const gaps=[];
  for(const [a,b] of occupied){if(a>last)gaps.push([last,a]);last=Math.max(last,b);}if(last<frame.lengthMm)gaps.push([last,frame.lengthMm]);
  gaps.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));const gap=gaps[0];
  if(!gap||gap[1]-gap[0]<100)throw Object.assign(new Error('Wall has no free span'),{code:'OPENING_NO_SPACE'});
  const widthMm=Math.min(type==='door'?900:1200,gap[1]-gap[0]);
  return {id,type,wallIndex,offsetMm:gap[0]+(gap[1]-gap[0]-widthMm)/2,widthMm,heightMm,sillMm,...(type==='door'?{hinge:'left',openAngleDeg:90}:{})};
}
export function doorWallConflicts(room,opening){
  const plan=doorPlan(room,opening),volumes=plan.obstructionVolumes??[{polygonMm:plan.sweepPolygonMm,bottomMm:0,topMm:opening.heightMm}],conflicts=[];
  for(let index=0;index<room.polygonMm.length;index++){
    if(index===opening.wallIndex)continue; // The hinge belongs to its own jamb.
    const f=wallFrame(room,index);
    if(wallPanels(room,index).some(p=>{
      const a=point(f.startMm,f.along,p.offsetMm),b=point(a,f.along,p.widthMm);
      const polygon=[a,b,point(b,f.inward,-50),point(a,f.inward,-50)];
      return volumes.some(v=>p.bottomMm<v.topMm&&p.bottomMm+p.heightMm>v.bottomMm&&polygonsOverlap(v.polygonMm,polygon));
    }))conflicts.push(index);
  }
  return conflicts;
}
export function retainRoomOpenings(previous,next){
  if(Object.hasOwn(next,'openings')||!Object.hasOwn(previous,'openings'))return next;
  const old=previous.polygonMm,poly=next.polygonMm;
  const direction=polygonAreaSign(old)===polygonAreaSign(poly)?1:-1,n=old.length;
  const changed=()=>{throw Object.assign(new Error('Opening wall changed'),{code:'OPENING_WALL_CHANGED'});};
  // One cyclic correspondence for the entire outline. Mixing exact edges with
  // an old-index fallback can send an edited edge to the opposite wall.
  let shift=0;
  if(n===poly.length&&previous.openings.length){
    const anchors=old.flatMap((p,i)=>{const j=poly.findIndex(q=>same(p,q));return j<0?[]:[{i,j}];});
    if(anchors.length){
      shift=(anchors[0].j-direction*anchors[0].i+n*2)%n;
      if(anchors.some(a=>(shift+direction*a.i+n*2)%n!==a.j))changed();
    }else if(direction<0)changed(); // No retained datum identifies the new start.
  }
  const openings=previous.openings.map(o=>{
    const a=old[o.wallIndex],b=old[(o.wallIndex+1)%old.length];
    let index,reversed=false;
    if(n===poly.length){reversed=direction<0;index=(shift+direction*(o.wallIndex+(reversed?1:0))+n*2)%n;}
    else{
      index=poly.findIndex((p,i)=>same(a,p)&&same(b,poly[(i+1)%poly.length]));
      if(index<0){index=poly.findIndex((p,i)=>same(b,p)&&same(a,poly[(i+1)%poly.length]));reversed=index>=0;}
      if(index<0)changed();
    }
    const result={...o,wallIndex:index};
    if(reversed){result.offsetMm=wallFrame(previous,o.wallIndex).lengthMm-(o.offsetMm+o.widthMm);if(o.type==='door'){
      if(o.motion==='sliding')result.slideDirection=o.slideDirection==='left'?'right':'left';else result.hinge=o.hinge==='left'?'right':'left';
    }}
    return result;
  });
  return {...next,openings};
}

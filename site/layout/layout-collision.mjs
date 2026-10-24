// Static planning envelopes, not furniture solids or a CAD clearance proof.
import {bounds,orient,triangulatePolygon,transformPolygon,rotateXZ,polygonContains} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';
import {boundaryTangents} from './layout-constraints.mjs?v=53e33561b2e7ce324016';

const polygons=new WeakMap(),scenes=new WeakMap(),motions=new WeakMap();
const immutablePolygon=p=>Object.isFrozen(p)&&p.every(Object.isFrozen);
function prepared(polygon){
  let p=polygons.get(polygon);
  if(!p){p={polygon,box:bounds(polygon),triangles:triangulatePolygon(polygon)};if(immutablePolygon(polygon))polygons.set(polygon,p);}
  return p;
}
const boxOverlap=(a,b)=>a.maxX>b.minX&&b.maxX>a.minX&&a.maxZ>b.minZ&&b.maxZ>a.minZ;
const heightOverlap=(a,b)=>Math.min(a.verticalRangeMm[1],b.verticalRangeMm[1])-Math.max(a.verticalRangeMm[0],b.verticalRangeMm[0]);
const companions=(a,b)=>a.parentId===b.id||b.parentId===a.id;
function convexOverlap(a,b){
  for(const [one,other]of [[a,b],[b,a]])for(let i=0;i<one.length;i++)
    if(other.every(p=>orient(one[i],one[(i+1)%one.length],p)<=0))return false;
  return true;
}
function overlaps(a,b){
  return boxOverlap(a.box,b.box)&&a.triangles.some(x=>b.triangles.some(y=>convexOverlap(x,y)));
}
function sceneIndex(scene){
  let index=scenes.get(scene);
  if(!index){
    const all=[...scene.furniture,...scene.printers];
    const byId=new Map(all.map(e=>[e.id,e])),shapes=new Map();
    index={all,byId,shapes:{get(id){let shape=shapes.get(id);if(!shape){shape=prepared(byId.get(id).worldEnvelopeMm);shapes.set(id,shape);}return shape;}}};
    if(Object.isFrozen(scene)&&Object.isFrozen(scene.furniture)&&Object.isFrozen(scene.printers)
      &&all.every(e=>Object.isFrozen(e)&&Object.isFrozen(e.verticalRangeMm)&&immutablePolygon(e.worldEnvelopeMm)))scenes.set(scene,index);
  }
  return index;
}
export function envelopeOverlaps(scene){
  const index=sceneIndex(scene),result=[];
  for(let i=0;i<index.all.length;i++)for(let j=i+1;j<index.all.length;j++){
    const a=index.all[i],b=index.all[j],heightOverlapMm=heightOverlap(a,b);
    if(!companions(a,b)&&heightOverlapMm>0&&overlaps(index.shapes.get(a.id),index.shapes.get(b.id)))
      result.push({code:'ENVELOPE_OVERLAP',entityIds:[a.id,b.id],params:{heightOverlapMm}});
  }
  return result;
}
function hull(points){
  const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
  const half=values=>{const r=[];for(const p of values){while(r.length>1&&orient(r.at(-2),r.at(-1),p)<=0)r.pop();r.push(p);}return r;};
  return [...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)];
}
// Imported overlaps remain loadable. Translation may preserve or reduce the
// nearest separating half-plane depth, never push farther into that half-plane.
// This continuous repair rule uses supporting projections of the actual source
// vertices, including concave footprints, not a tolerance on overlap area.
function escapes(a,b,dx,dz){
  let nearest=Infinity,allowed=false;
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],nx=q[1]-p[1],nz=p[0]-q[0],length=Math.hypot(nx,nz);
    const aa=a.map(p=>p[0]*nx+p[1]*nz),bb=b.map(p=>p[0]*nx+p[1]*nz);
    for(const [depth,direction]of [[Math.max(...bb)-Math.min(...aa),1],[Math.max(...aa)-Math.min(...bb),-1]]){
      const distance=depth/length,outward=direction*(dx*nx+dz*nz)>=0;
      if(distance<nearest){nearest=distance;allowed=outward;}else if(distance===nearest)allowed ||= outward;
    }
  }
  return allowed;
}
const samePolygon=(a,b)=>a.length===b.length&&a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1]);
function translation(a,b){
  if(a.length!==b.length)return null;
  const dx=b[0][0]-a[0][0],dz=b[0][1]-a[0][1];
  return a.every((p,i)=>p[0]+dx===b[i][0]&&p[1]+dz===b[i][1])?[dx,dz]:null;
}
function entityTranslation(a,b){
  if(typeof a.widthMm==='number'&&a.type===b.type&&a.machineId===b.machineId
    &&a.widthMm===b.widthMm&&a.depthMm===b.depthMm&&a.yawDeg===b.yawDeg)return [b.xMm-a.xMm,b.zMm-a.zMm];
  return translation(a.worldEnvelopeMm,b.worldEnvelopeMm);
}
// Endpoint checks also cover resize, attachment and machine changes. Rigid
// internal pairs are excluded only when the caller proves common rigid motion.
export function envelopeChange(before,after,ids,{rigid=false}={}){
  const old=sceneIndex(before),next=sceneIndex(after),wanted=new Set(ids);
  for(let i=0;i<next.all.length;i++)for(let j=i+1;j<next.all.length;j++){
    const a=next.all[i],b=next.all[j];
    if(!wanted.has(a.id)&&!wanted.has(b.id)||companions(a,b)||heightOverlap(a,b)<=0)continue;
    if(rigid&&wanted.has(a.id)&&wanted.has(b.id))continue;
    const x=old.byId.get(a.id),y=old.byId.get(b.id);
    const sa=x&&samePolygon(x.worldEnvelopeMm,a.worldEnvelopeMm)?old.shapes.get(a.id):next.shapes.get(a.id);
    const sb=y&&samePolygon(y.worldEnvelopeMm,b.worldEnvelopeMm)?old.shapes.get(b.id):next.shapes.get(b.id);
    if(!overlaps(sa,sb))continue;
    if(x&&y&&!companions(x,y)&&heightOverlap(x,y)>0&&overlaps(old.shapes.get(x.id),old.shapes.get(y.id))){
      const ta=entityTranslation(x,a),tb=entityTranslation(y,b);
      if(heightOverlap(a,b)<=heightOverlap(x,y)){
        if(ta&&tb&&escapes(x.worldEnvelopeMm,y.worldEnvelopeMm,ta[0]-tb[0],ta[1]-tb[1]))continue;
        if(samePolygon(x.worldEnvelopeMm,a.worldEnvelopeMm)&&samePolygon(y.worldEnvelopeMm,b.worldEnvelopeMm))continue;
        if(polygonContains(x.worldEnvelopeMm,a.worldEnvelopeMm)&&polygonContains(y.worldEnvelopeMm,b.worldEnvelopeMm))continue;
      }
    }
    return [a.id,b.id];
  }
  return null;
}
function hullOverlaps(poly,obstacle){
  return boxOverlap(bounds(poly),obstacle.box)&&obstacle.triangles.some(t=>convexOverlap(poly,t));
}
// Cache the static side and triangulated moving side once per gesture/prefix
// search. No fleet rebuilds inside the adaptive rotation or translation proof.
export function prepareCollisionMotion(scene,ids,origin,locals=null){
  origin={xMm:origin.xMm,zMm:origin.zMm,yawDeg:origin.yawDeg};
  const index=sceneIndex(scene),wanted=new Set(ids);
  let cache=motions.get(scene);
  const key=JSON.stringify([[...wanted],origin.xMm,origin.zMm,origin.yawDeg,locals?[...locals]:null]);
  if(cache?.has(key))return cache.get(key);
  const fixed=index.all.filter(e=>!wanted.has(e.id));
  const moving=index.all.filter(e=>wanted.has(e.id)).map(e=>{
    const supplied=locals?.get(e.id),local=supplied?supplied.map(p=>[...p]):e.worldEnvelopeMm.map(([x,z])=>rotateXZ([x-origin.xMm,z-origin.zMm],-origin.yawDeg));
    const radius=Math.max(...local.map(p=>Math.hypot(...p)));
    return {e,local,radius,triangles:triangulatePolygon(local),peers:fixed.filter(o=>!companions(e,o)&&heightOverlap(e,o)>0).map(o=>({e:o,shape:index.shapes.get(o.id)}))};
  });
  function accepts(end,endpoints=null){
    const dx=end.xMm-origin.xMm,dz=end.zMm-origin.zMm,delta=end.yawDeg-origin.yawDeg;
    for(const m of moving){
      const finish=endpoints?.get(m.e.id)??transformPolygon(m.local,end);
      const broad=delta===0?bounds([...m.e.worldEnvelopeMm,...finish]):{
        minX:Math.min(origin.xMm,end.xMm)-m.radius,maxX:Math.max(origin.xMm,end.xMm)+m.radius,
        minZ:Math.min(origin.zMm,end.zMm)-m.radius,maxZ:Math.max(origin.zMm,end.zMm)+m.radius};
      for(const o of m.peers){
        if(!boxOverlap(broad,o.shape.box))continue;
        const initially=overlaps(index.shapes.get(m.e.id),o.shape);
        if(initially){
          if(delta===0&&escapes(m.e.worldEnvelopeMm,o.e.worldEnvelopeMm,dx,dz))continue;
          return false;
        }
        if(overlaps(prepared(finish),o.shape))return false;
        if(delta===0){
          // The swept triangle prism is exactly this six-point planar hull.
          for(const triangle of index.shapes.get(m.e.id).triangles)
            if(hullOverlaps(hull([...triangle,...triangle.map(([x,z])=>[x+dx,z+dz])]),o.shape))return false;
          continue;
        }
        // Identical repeated turns need one full signed revolution. Translating
        // more than one turn is conservatively rejected within this bounded job.
        if(Math.abs(delta)>360&&(dx!==0||dz!==0))return false;
        const yaw=Math.sign(delta)*Math.min(360,Math.abs(delta)),pieces=Math.ceil(Math.abs(yaw)/90);
        let budget=512;
        const clear=(triangle,a,b,depth)=>{
          if(--budget<0)return false;
          const angleA=origin.yawDeg+yaw*a,angleB=origin.yawDeg+yaw*b,angleM=(angleA+angleB)/2;
          const cosine=Math.cos((angleB-angleA)*Math.PI/360),points=[];
          for(const p of triangle){
            const mid=rotateXZ(p,angleM),arc=[rotateXZ(p,angleA),rotateXZ(p,angleB),[mid[0]/cosine,mid[1]/cosine]];
            for(const q of arc)for(const t of [a,b])points.push([q[0]+origin.xMm+dx*t,q[1]+origin.zMm+dz*t]);
          }
          if(!hullOverlaps(hull(points),o.shape))return true;
          // The enclosure is a continuous upper bound. An unresolved cell is
          // blocked, never accepted by a finite pose grid or a gap tolerance.
          if(depth===12)return false;
          const middle=(a+b)/2;
          return clear(triangle,a,middle,depth+1)&&clear(triangle,middle,b,depth+1);
        };
        for(const triangle of m.triangles)for(let i=0;i<pieces;i++)if(!clear(triangle,i/pieces,(i+1)/pieces,0))return false;
      }
    }
    return true;
  }
  function tangents(pose){
    const result=[];
    for(const m of moving){
      const polygon=transformPolygon(m.local,pose);
      for(const o of m.peers){
        result.push(...boundaryTangents(o.e.worldEnvelopeMm,polygon));
        // Vertex/face contacts can put the moving face against an obstacle
        // corner; both sets of face directions are valid sliding candidates.
        result.push(...boundaryTangents(polygon,o.e.worldEnvelopeMm));
      }
    }
    return result;
  }
  const result={accepts,tangents};
  if(scenes.has(scene)){
    if(!cache){cache=new Map();motions.set(scene,cache);}if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,result);
  }
  return result;
}

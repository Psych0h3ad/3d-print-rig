import {BufferGeometry, Float32BufferAttribute} from './vendor/three.module.js';

// V0.2 and V0.2r1 share this XY drive. Coordinates are CAD millimetres.
// F623 running surface: radius 5; GT2 envelope: 1.38 thick, 6 wide.
// Smooth belt routing preview; teeth, pulley rotation and tension are not simulated.
export const BELT_THICKNESS = 1.38;
export const BELT_WIDTH = 6;
const TAU = 2 * Math.PI;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const center = row => row.bounds_mm[0].map((v,i)=>(v+row.bounds_mm[1][i])/2);

function bearing(parts, xy, moving) {
  const matches=parts.filter(p=>/^f623/i.test(p.name)&&p.motion===(moving?'y':'fixed')&&distance(center(p),xy)<.02);
  if(!matches.length)throw Error('V0 belt bearing registration mismatch: '+xy);
  return center(matches[0]).slice(0,2);
}

export function v0BeltCircles(manifest, name, dy=0) {
  const mirror=name==='B Belt'?-1:1;
  if(!['A Belt','B Belt'].includes(name))throw Error('Unknown V0 belt');
  const specs=[[-107.5,-1.1105056288,true,1],[96.12,-12.4905056288,true,-1],
    [107.5,-107.5,false,1],[107.5,87.5,false,1],
    [82.5,95.5,false,-1,'motor'],[107.5,107.5,false,1],[-107.5,107.5,false,1]];
  return specs.map(([x,y,moving,turn,motor])=>{
    let xy;
    if(motor){
      const p=manifest.parts.find(p=>/^Pulley(?: \(1\))?$/.test(p.name)&&distance(center(p),[x*mirror,y])<.02);
      if(!p)throw Error('V0 belt motor registration mismatch');
      xy=center(p).slice(0,2);
    }else xy=bearing(manifest.parts,[x*mirror,y],moving);
    return {x:xy[0],y:xy[1]+(moving?dy:0),r:motor?6.37:5+BELT_THICKNESS/2,turn:turn*mirror,moving};
  });
}

// Common tangents between oriented circles; opposite turns use an internal tangent.
export function circleBeltRoute(circles) {
  const spans=circles.map((a,i)=>{
    const b=circles[(i+1)%circles.length],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    const k=(a.turn*a.r-b.turn*b.r)/d;
    if(!Number.isFinite(k)||Math.abs(k)>=1)throw Error('Invalid belt tangent');
    const q=Math.sqrt(1-k*k),nx=k*dx/d+q*dy/d,ny=k*dy/d-q*dx/d;
    return {from:[a.x+a.turn*a.r*nx,a.y+a.turn*a.r*ny],
      to:[b.x+b.turn*b.r*nx,b.y+b.turn*b.r*ny],normal:[nx,ny]};
  });
  const points=[],normals=[],arcs=[];let length=0;
  circles.forEach((c,i)=>{
    const incoming=spans[(i+circles.length-1)%circles.length].to,outgoing=spans[i].from;
    const start=Math.atan2(incoming[1]-c.y,incoming[0]-c.x),end=Math.atan2(outgoing[1]-c.y,outgoing[0]-c.x);
    const sweep=((c.turn*(end-start))%TAU+TAU)%TAU;
    const steps=Math.max(1,Math.ceil(sweep/(Math.PI/64)-1e-9));
    arcs.push({center:[c.x,c.y],radius:c.r,start,sweep,turn:c.turn});
    for(let j=0;j<=steps;j++){
      const a=start+c.turn*sweep*j/steps,radial=[Math.cos(a),Math.sin(a)];
      points.push([c.x+c.r*radial[0],c.y+c.r*radial[1]]);
      normals.push(radial.map(v=>v*c.turn));
    }
    length+=c.r*sweep+distance(spans[i].from,spans[i].to);
  });
  return {points,normals,spans,arcs,length};
}

export function beltGeometry(route,z) {
  const vertices=[],indices=[],n=route.points.length;
  route.points.forEach(([x,y],i)=>{
    const [nx,ny]=route.normals[i];
    for(const [side,height] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      vertices.push((x+side*nx*BELT_THICKNESS/2)/1000,(z+height*BELT_WIDTH/2)/1000,-(y+side*ny*BELT_THICKNESS/2)/1000);
    }
  });
  for(let i=0;i<n;i++)for(let j=0;j<4;j++){
    const a=4*i+j,b=4*i+(j+1)%4,c=4*((i+1)%n)+j,d=4*((i+1)%n)+(j+1)%4;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function createV0Belts(nodes,manifest) {
  const belts=manifest.parts.filter(p=>/^[AB] Belt$/.test(p.name));
  if(belts.length!==2)throw Error('Expected two V0 XY belts');
  const entries=belts.map(row=>{
    const node=nodes.get(row.key),meshes=[];node.traverse(m=>{if(m.isMesh)meshes.push(m)});
    if(meshes.length!==1)throw Error('Unexpected V0 belt mesh structure');
    return {row,node,mesh:meshes[0],z:center(row)[2],circles:v0BeltCircles(manifest,row.name),route:null};
  });
  let lastY;
  function update(dy,visible){
    for(const entry of entries){
      if(dy!==lastY){
        const route=circleBeltRoute(entry.circles.map(c=>({...c,y:c.y+(c.moving?dy:0)})));
        const geometry=beltGeometry(route,entry.z);
        if(entry.route)entry.mesh.geometry.dispose();
        entry.mesh.geometry=geometry;entry.route=route;
      }
      entry.node.visible=Boolean(visible);
    }
    lastY=dy;
  }
  return {keys:new Set(belts.map(b=>b.key)),entries,update};
}

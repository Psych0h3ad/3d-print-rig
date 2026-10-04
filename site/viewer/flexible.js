import * as THREE from 'three';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cad=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
const rot=(p,c,a)=>{const x=p[0]-c[0],y=p[1]-c[1];return [c[0]+x*Math.cos(a)-y*Math.sin(a),c[1]+x*Math.sin(a)+y*Math.cos(a),p[2]]};

// Centreline length is conserved for this U-route. Reject negative straight
// sections instead of stretching links or inventing a route through the frame.
export function chainRoute(start,end,total,pitch){
 const radius=(end[1]-start[1])/2,leg=(total-Math.PI*radius-(end[0]-start[0]))/2;
 const tail=leg+end[0]-start[0];
 if(radius<25||leg<0||tail<0)return null;
 const turn=start[0]-leg,cy=(start[1]+end[1])/2;
 const points=[],angles=[];
 for(let j=0;j<47;j++){
  let t=j*pitch,p,a;
  if(t<leg){p=[start[0]-t,start[1],start[2]];a=Math.PI}
  else if((t-=leg)<Math.PI*radius){const theta=-Math.PI/2-t/radius;p=[turn+radius*Math.cos(theta),cy+radius*Math.sin(theta),start[2]];a=theta-Math.PI/2}
  else{t-=Math.PI*radius;p=[turn+t,end[1],end[2]];a=0}
  points.push(p);angles.push(a);
 }
 if(points.some(p=>p[0]<-245||p[0]>245||p[1]<-240||p[1]>250))return null;
 return {points,angles,radius,leg,tail};
}

export function beltWeights(x,y){
 const soft=(value,lo,hi)=>{const s=8,L=hi-lo,t=clamp(value-lo,0,L),A=L-s;return (t<s?t*t/(2*s):t>L-s?A-(L-t)*(L-t)/(2*s):t-s/2)/A};
 let wx=0,wy=0;
 if(y>=-4.6&&y<=2.1&&x>=-226&&x<=213){
  wy=1;
  wx=x<-18.75?soft(x,-225.7454,-18.75):x>19.15?1-soft(x,19.15,212.9146):1;
 }
 if(x<=-225.7454&&x>-235&&y>=-4.6&&y<=10){wy=1;wx=0}
 if(x<-231&&x>-235&&y>=10&&y<=224.2541)wy=1-soft(y,10,222);
 if(x>=212.9146&&x<222&&y>=-7.5&&y<=2.1){wy=1;wx=0}
 if(x>218&&x<222&&y<=-7.5&&y>=-231.2459)wy=soft(y,-229,-7.5);
 return [wx,wy];
}

export function setupFlexible(scene,meshes,manifest,routes){
 const byKey=new Map(meshes.map(o=>[o.userData.partKey,o])),base=routes.chain_centres;
 const restRoute=chainRoute(base[0],base.at(-1),46*routes.chain_pitch_mm,routes.chain_pitch_mm);
 const belts=['580','Upper_Belt'].map(key=>{
  const mesh=byKey.get(key),attr=mesh.geometry.attributes.position,original=attr.array.slice(),weights=new Float32Array(attr.count*2);
  for(let i=0;i<attr.count;i++){
   let x=original[i*3]*1000,y=-original[i*3+2]*1000;
   if(key==='Upper_Belt')x=.431373-x;
   weights.set(beltWeights(x,y),i*2);
  }
  mesh.material.color.set('#202327');mesh.material.metalness=0;mesh.material.roughness=.85;
  attr.setUsage(THREE.DynamicDrawUsage);return {mesh,attr,original,weights};
 });
 const clips=manifest.parts.filter(r=>r.chain_link_index!==undefined).map(r=>({mesh:byKey.get(r.key),index:r.chain_link_index}));
 const links=base.map((p,j)=>({mesh:byKey.get('chain_'+String(j).padStart(2,'0')),index:j}));
 // These links contain placed CAD vertices and rotate around remote pivots.
 // Keep the small articulated set in the draw list at every camera angle.
 for(const {mesh} of [...links,...clips])mesh.frustumCulled=false;
 for(const {mesh} of links){mesh.material.color.set('#24272c');mesh.material.metalness=0;mesh.material.roughness=.8}
 const tube=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xd2d9df,roughness:.53,metalness:0,side:THREE.DoubleSide}));tube.name='PTFE_motion_preview';tube.frustumCulled=false;scene.add(tube);
 const cable=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0x22262c,roughness:.8}));cable.name='CAN_motion_preview';cable.frustumCulled=false;scene.add(cable);
 const sourcePoints=manifest.flexible_assembly_notes.PTFE_points;
 const lastFixed=sourcePoints.length-6;
 const bindings=sourcePoints.map((p,i)=>i<3?'head':i>=lastFixed?'fixed':base.reduce((j,c,k)=>Math.hypot(c[0]-p[0],c[1]-p[1])<Math.hypot(base[j][0]-p[0],base[j][1]-p[1])?k:j,0));
 const diagnostics={};let last='';
 const replaceTube=(mesh,points,radius)=>{mesh.geometry.dispose();mesh.geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(cad),false,'centripetal'),160,radius,8,false)};
 return {
  diagnostics,
  update(dx,dy,z,enabled,variant=null){
   const rest=Math.abs(dx)+Math.abs(dy)+Math.abs(z)<.001;
   const key=[dx.toFixed(2),dy.toFixed(2),z.toFixed(2),enabled,variant?.id||'stock',!!variant?.disableToolheadRouting].join(',');if(key===last)return diagnostics;last=key;
   for(const {mesh,attr,original,weights} of belts){
    if(variant?.includeStockBelts===false){mesh.visible=false;continue}
    mesh.visible=enabled;
    for(let i=0;i<attr.count;i++){attr.array[i*3]=original[i*3]+dx*weights[i*2]/1000;attr.array[i*3+2]=original[i*3+2]-dy*weights[i*2+1]/1000}
    attr.needsUpdate=true;mesh.geometry.computeBoundingSphere();
   }
   if(variant?.disableToolheadRouting){
    for(const {mesh} of [...links,...clips])mesh.visible=false;
    byKey.get('PTFE_tube').visible=false;byKey.get('CAN_cable').visible=false;
    tube.visible=false;cable.visible=false;
    Object.assign(diagnostics,{belts:enabled&&variant.includeStockBelts!==false,ptfe:false,chain:false,chainRouteValid:false,chainLinks:0,chainCulledLinks:0,static:rest,scope:'Registered gantry belts only; toolhead routing is not registered.'});
    return diagnostics;
   }
   if(variant){
    for(const {mesh} of [...links,...clips])mesh.visible=false;
    byKey.get('PTFE_tube').visible=false;byKey.get('CAN_cable').visible=false;
    tube.visible=enabled;cable.visible=enabled;
    if(enabled){
     const h=variant.filament_inlet_mm,f=sourcePoints[lastFixed],c=variant.can_inlet_mm;
     replaceTube(tube,[[h[0]+dx,h[1]+dy,h[2]],[h[0]+dx,h[1]+dy,h[2]+32],[h[0]+dx-18,h[1]+dy+30,470],[(h[0]+dx+f[0])/2-35,(h[1]+dy+f[1])/2,484],f,...sourcePoints.slice(lastFixed+1)],.002);
     replaceTube(cable,[[c[0]+dx,c[1]+dy,c[2]],[c[0]+dx,c[1]+dy+10,467],[(c[0]+dx+212)/2,(c[1]+dy+247)/2,479],[212,247,464],[212,247,444]],.0018);
    }
    Object.assign(diagnostics,{belts:enabled,ptfe:enabled,chain:false,chainRouteValid:false,static:rest,scope:'Xol umbilical routing preview; stock toolhead chain not attached.'});
    return diagnostics;
   }
   const start=[base[0][0]+dx,base[0][1]+dy,base[0][2]],route=chainRoute(start,base.at(-1),46*routes.chain_pitch_mm,routes.chain_pitch_mm);
   for(const {mesh,index} of [...links,...clips]){
    mesh.visible=enabled;
    if(!route){mesh.quaternion.identity();mesh.position.set(0,0,0);continue}
    const delta=route.angles[index]-restRoute.angles[index];mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),delta);
    mesh.position.copy(cad(route.points[index])).sub(cad(base[index]).applyQuaternion(mesh.quaternion));
   }
   tube.visible=enabled&&!rest;cable.visible=enabled&&!rest;
   if(enabled&&!rest){
    let pts;
    if(route){
     pts=sourcePoints.map((p,i)=>{
      const bind=bindings[i];
      if(bind==='head')return [p[0]+dx,p[1]+dy,p[2]];
      if(bind==='fixed')return p;
      const q=rot(p,base[bind],route.angles[bind]-restRoute.angles[bind]);return q.map((v,j)=>v+route.points[bind][j]-base[bind][j]);
     });
     const cp=[[-16+dx,23+dy,414],[-16+dx,24+dy,439],start,...route.points.filter((_,i)=>i%3===0),base.at(-1),[212,247,444]];
     replaceTube(cable,cp,.0018);
    }else{
     const h=sourcePoints[0],f=sourcePoints[lastFixed];
     pts=[[h[0]+dx,h[1]+dy,h[2]],[h[0]+dx,h[1]+dy,454],[h[0]+dx-22,h[1]+dy+35,477],
      [(h[0]+dx+f[0])/2-55,(h[1]+dy+f[1])/2,487],f,...sourcePoints.slice(lastFixed+1)];
     replaceTube(cable,[[-16+dx,23+dy,414],[-16+dx,24+dy,467],[(dx+196)/2,(dy+270)/2,479],[212,247,464],[212,247,444]],.0018);
    }
    replaceTube(tube,pts,.002);
   }
   byKey.get('PTFE_tube').visible=enabled&&rest;byKey.get('CAN_cable').visible=enabled&&rest;
   Object.assign(diagnostics,{belts:enabled,ptfe:enabled,chain:enabled,chainRouteValid:!!route,chainReferenceFallback:!route,chainRadiusMm:route?.radius??null,chainLinks:links.filter(p=>p.mesh.visible).length,chainCulledLinks:links.filter(p=>p.mesh.frustumCulled).length,static:rest,scope:route?'Routing preview; straight-run teeth phase, PTFE fixed length/bend limits and chain hinge constraints are not physical simulation.':'Chain retained at native reference shape; this pose exceeds the registered chain routing envelope. Wiring is an unverified routing preview.'});
   return diagnostics;
  }
 };
}

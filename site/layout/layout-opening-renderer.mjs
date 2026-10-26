import * as THREE from '../viewer/vendor-r180/three.module.js';
import {wallFrame,openingFrame,wallPanels,doorPlan} from './layout-openings.mjs?v=8fab3154ec519f37f666';
import {wallSurfaceGeometry} from './layout-surfaces.mjs?v=0e7f271c883eb7ec8844';

// Architectural planning geometry, in metres. The room polygon is the clear
// inner wall face; the 50 mm wall and the door hinge are outside that boundary.
const MM=.001,DEPTH=50;
const point=(f,d,n=0)=>[f.startMm[0]+f.along[0]*d+f.inward[0]*n,f.startMm[1]+f.along[1]*d+f.inward[1]*n];
const frameWidth=o=>Math.min(35,o.widthMm*.1,o.heightMm*.1);

export function createLayoutOpeningRenderer({surfaces}){
  const boxGeometry=new THREE.BoxGeometry(1,1,1),geometries=new Set();let disposed=false;
  const frame=new THREE.MeshStandardMaterial({color:'#deded7',roughness:.76,metalness:.05});frame.name='layout-opening-frame';
  const leaf=new THREE.MeshStandardMaterial({color:'#ad9475',roughness:.78});leaf.name='layout-door-leaf';
  const glass=new THREE.MeshStandardMaterial({color:'#a9c9d5',roughness:.18,metalness:0,transparent:true,opacity:.28,depthWrite:false});glass.name='layout-window-glass';
  function box(root,f,offset,bottom,width,height,depth,normal,mat,role,id){
    const mesh=new THREE.Mesh(boxGeometry,mat),p=point(f,offset+width/2,normal);
    mesh.position.set(p[0]*MM,(bottom+height/2)*MM,p[1]*MM);mesh.rotation.y=-Math.atan2(f.along[1],f.along[0]);mesh.scale.set(width*MM,height*MM,depth*MM);
    mesh.userData.openingRole=role;if(id)mesh.userData.openingId=id;mesh.receiveShadow=mat!==glass;root.add(mesh);return mesh;
  }
  function prism(root,polygon,bottom,height,mat,role,id){
    const shape=new THREE.Shape(polygon.map(([x,z])=>new THREE.Vector2(x*MM,-z*MM)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height*MM,bevelEnabled:false,steps:1,curveSegments:1});geometry.rotateX(-Math.PI/2);geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.y=bottom*MM;mesh.userData.openingId=id;mesh.userData.openingRole=role;mesh.receiveShadow=true;root.add(mesh);return mesh;
  }
  function makeWall(room,index,finish){
    if(disposed)throw Error('Layout opening renderer disposed');
    const f=wallFrame(room,index),root=new THREE.Group();root.userData.openingWall=true;root.userData.wallIndex=index;
    root.userData.inward=[...f.inward];root.userData.innerPoint=point(f,f.lengthMm/2).map(v=>v*MM);
    for(const p of wallPanels(room,index)){
      const geometry=wallSurfaceGeometry(p.widthMm*MM,p.heightMm*MM,DEPTH*MM);geometries.add(geometry);
      const mesh=box(root,f,p.offsetMm,p.bottomMm,p.widthMm,p.heightMm,DEPTH,-DEPTH/2,finish,'wall-panel');mesh.geometry=geometry;mesh.userData.wallPanel={...p};
      // No baseboard crosses a floor-level door opening. Windows retain the
      // painted trim beneath their sill; this is borrowed surface material.
      if(p.bottomMm===0){const h=Math.min(75,room.wallHeightMm*.2,p.heightMm);
        const trim=box(root,f,p.offsetMm,0,p.widthMm,h,12,-5.8,surfaces.trim(),'baseboard');trim.userData.baseboard=true;
      }
    }
    for(const o of room.openings??[]){
      if(o.wallIndex!==index)continue;
      const f=openingFrame(room,o),w=frameWidth(o),s=o.sillMm,h=o.heightMm;
      box(root,f,0,s,w,h,DEPTH,-25,frame,'frame-jamb',o.id);
      box(root,f,o.widthMm-w,s,w,h,DEPTH,-25,frame,'frame-jamb',o.id);
      box(root,f,w,s+h-w,o.widthMm-2*w,w,DEPTH,-25,frame,'frame-head',o.id);
      if(o.type==='window'){
        box(root,f,w,s,o.widthMm-2*w,w,DEPTH,-25,frame,'frame-sill',o.id);
        box(root,f,w,s+w,o.widthMm-2*w,h-2*w,6,-25,glass,'window-glass',o.id);
      }else{
        const plan=doorPlan(room,o),mesh=prism(root,plan.leafPolygonMm,0,h-plan.frameMm,leaf,'door-leaf',o.id);
        mesh.userData.doorMotion=plan.motion??'hinged';
        if(plan.motion==='sliding')prism(root,plan.railPolygonMm,s+h-plan.frameMm,plan.frameMm,frame,'door-track',o.id);
        else mesh.userData.hingeMm=[...plan.hingeMm];
      }
    }
    return root;
  }
  function clear(){for(const g of geometries)g.dispose();geometries.clear();}
  return {makeWall,clear,dispose(){if(disposed)return;disposed=true;clear();boxGeometry.dispose();frame.dispose();leaf.dispose();glass.dispose();}};
}

// Both native top view and flat PNG use these same source-mm paths. Symbols
// remain present with 3D walls disabled. Hinged doors use the inward swing;
// sliding doors use their translated leaf, full track and direction arrow.
export function openingPlanPrimitives(room){
  const paths=[];
  const add=(role,pointsMm,openingId,closed=false)=>paths.push({role,pointsMm,openingId,closed});
  for(let i=0;i<room.polygonMm.length;i++){
    const f=wallFrame(room,i),spans=(room.openings??[]).filter(o=>o.wallIndex===i).map(o=>[o.offsetMm,o.offsetMm+o.widthMm]).sort((a,b)=>a[0]-b[0]);
    let end=0;
    for(const [a,b]of spans){if(a>end)add('wall',[point(f,end),point(f,a)]);end=Math.max(end,b);}
    if(end<f.lengthMm)add('wall',[point(f,end),f.endMm]);
  }
  for(const o of room.openings??[]){
    const f=openingFrame(room,o),w=frameWidth(o);
    for(const x of [0,o.widthMm-w])add('frame',[point(f,x),point(f,x+w),point(f,x+w,-DEPTH),point(f,x,-DEPTH)],o.id,true);
    if(o.type==='window'){
      for(const n of [-19,-31])add('window-line',[point(f,w,n),point(f,o.widthMm-w,n)],o.id);
    }else{
      const p=doorPlan(room,o);add('door-leaf',p.leafPolygonMm,o.id,true);
      if(p.motion==='sliding'){
        add('door-track',[p.railStartMm,p.railEndMm],o.id);
        const center=p.closedStartMm.map((v,i)=>(v+p.closedEndMm[i])/2),direction=f.along.map(v=>v*(p.slideDirection==='left'?-1:1));
        const length=Math.min(160,p.leafWidthMm*.25),head=length*.3;
        const back=center.map((v,i)=>v-direction[i]*length/2),tip=center.map((v,i)=>v+direction[i]*length/2);
        add('door-slide-direction',[back,tip],o.id);
        add('door-slide-arrow',[tip.map((v,i)=>v-direction[i]*head+f.inward[i]*head*.5),tip,tip.map((v,i)=>v-direction[i]*head-f.inward[i]*head*.5)],o.id);
      }else add('door-arc',p.arcMm,o.id);
    }
  }
  return paths;
}
export function drawOpeningPlan(ctx,{room,project,dark=false,pixelScale=1}){
  const paths=openingPlanPrimitives(room),scale=Math.max(1,Math.min(8,pixelScale));
  ctx.save();
  for(const p of paths){
    ctx.beginPath();p.pointsMm.forEach((v,i)=>{const xy=project(...v);if(!xy.every(Number.isFinite))throw Error('Invalid opening plan projection');i?ctx.lineTo(...xy):ctx.moveTo(...xy);});if(p.closed)ctx.closePath();
    ctx.strokeStyle=dark?'#d2e2e8':'#344c5a';ctx.lineWidth=(p.role==='wall'?1.5:1)*scale;
    if(p.closed){ctx.fillStyle=p.role==='door-leaf'?'#ad9475':dark?'#69808b':'#deded7';ctx.fill();}ctx.stroke();
  }
  ctx.restore();return paths;
}

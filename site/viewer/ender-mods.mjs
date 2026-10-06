import * as THREE from './vendor-r180/three.module.js';
// Routing envelopes, including visible cut ends and 2 mm pitch tooth markers.
// The author CAD supplies the 6 mm backing and all pulleys; tension is not simulated.
export function beltedZWeight([,y,z]){
 if(z>=-7.5)return 0;
 if(y<=164.14509)return Math.max(0,Math.min(1,(y-53.748)/(164.14509-53.748)));
 if(y>=202.85409)return Math.max(0,Math.min(1,(485.305738-y)/(485.305738-202.85409)));
 return 1;
}
export function installationFor(profile,selection){
 const row=Object.entries(profile.configurations||{}).find(([,c])=>c.selection&&Object.entries(selection).every(([k,v])=>c.selection[k]===v));
 if(!row)throw Error('Unavailable installation combination');return row[0];
}
export function createBeltedZTeeth(root,profile){
 if(profile.machine_id!=='ender3_stock_220'||!profile.mod_controls)return {update(){},meshes:[]};
 const points=z=>{
  const p=[[202.85409+z,-15.224992],[485.305738,-15.224992]];
  for(let i=1;i<=24;i++){const a=Math.PI*(1-i/24);p.push([485.305738+6.424999*Math.sin(a),-8.799993-6.424999*Math.cos(Math.PI-a)])}
  p.push([53.748,-2.375]);
  for(let i=1;i<=24;i++){const a=Math.PI*i/24;p.push([53.748-5.317*Math.sin(a),-7.692+5.317*Math.cos(a)])}
  p.push([164.14509+z,-13.009]);return p;
 };
 // Pitch marks on the outer backing surface, not invented physical GT2 teeth.
 // The upstream smooth belt CAD does not contain a manufactured tooth profile.
 const section=new THREE.Shape();section.moveTo(-.58,0);section.lineTo(.58,0);section.lineTo(.42,.02);section.quadraticCurveTo(0,.04,-.42,.02);section.closePath();
 const shape=new THREE.ExtrudeGeometry(section,{depth:6,bevelEnabled:false,steps:1,curveSegments:3});shape.rotateY(Math.PI/2);shape.translate(-3,0,0);
 // The shape's local Y is the inward tooth direction, Z is belt tangent.
 const geometry=shape;const material=new THREE.MeshStandardMaterial({color:0x41464a,roughness:.8,metalness:0});
 const meshes=[-144.999228,144.999228].map(x=>{const m=new THREE.InstancedMesh(geometry,material,520);m.frustumCulled=false;m.userData.routing_preview=true;m.userData.belt_width_mm=6;m.userData.pitch_mm=2;m.userData.native_x=x;root.add(m);return m});
 const matrix=new THREE.Matrix4(),rotation=new THREE.Matrix4();
 function update(axes,visible){
  const path=points(axes.z);const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));const total=lengths.reduce((a,b)=>a+b,0);
  for(const m of meshes){m.visible=visible;let segment=0,before=0,count=0;
   for(let at=1;at<total;at+=2){while(segment<lengths.length-1&&at>before+lengths[segment])before+=lengths[segment++];const a=path[segment],b=path[segment+1],u=(at-before)/lengths[segment],dy=(b[0]-a[0])/lengths[segment],dz=(b[1]-a[1])/lengths[segment];
    rotation.makeBasis(new THREE.Vector3(1,0,0),new THREE.Vector3(0,dz,-dy),new THREE.Vector3(0,dy,dz));matrix.copy(rotation);matrix.setPosition(m.userData.native_x/1000,(a[0]+u*(b[0]-a[0])+.315*dz)/1000,(a[1]+u*(b[1]-a[1])-.315*dy)/1000);matrix.scale(new THREE.Vector3(.001,.001,.001));m.setMatrixAt(count++,matrix);
   }m.count=count;m.instanceMatrix.needsUpdate=true;
  }
 }
 return {update,meshes};
}

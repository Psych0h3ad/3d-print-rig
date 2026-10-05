import * as THREE from './vendor-r180/three.module.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const phase=(p,a,b)=>{const u=clamp((p-a)/(b-a));return u*u*(3-2*u)};
const v=values=>new THREE.Vector3(...values).multiplyScalar(.001);
const move=values=>new THREE.Matrix4().makeTranslation(...values.map(x=>x*.001));
const rotation=(axis,angle)=>new THREE.Matrix4().makeRotationAxis(axis,angle);
const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const around=(point,matrix)=>move(point).multiply(matrix).multiply(move(point.map(x=>-x)));
const blend=(from,to,amount)=>{const a=new THREE.Vector3(),b=new THREE.Vector3(),qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),scale=new THREE.Vector3();from.decompose(a,qa,scale);to.decompose(b,qb,scale);return new THREE.Matrix4().compose(a.lerp(b,amount),qa.slerp(qb,amount),new THREE.Vector3(1,1,1))};

// The two dowels travel in the native J-shaped CNC slots before rotation.
// Hand-carried parts use explicit demonstration paths, outside the hinge.
export function positronFoldTransforms(profile,percent){
 if(typeof percent!=='number'||!Number.isFinite(percent)||percent<0||percent>100)throw Error('Invalid folding position');
 const f=profile.fold,p=percent/100,identity=()=>new THREE.Matrix4(),matrices=Object.fromEntries(['fixed','column','carriage','latch','head','beam','glass','holder','bed_screw','column_screw','spool','screen'].map(k=>[k,identity()]));
 const slide=phase(p,0,.10),setAside=phase(p,.10,.18);
 matrices.glass=move([350*setAside,-151*setAside,230*slide+30*setAside]);
 const bedUnscrew=phase(p,.18,.205),bedPlace=phase(p,.205,.225),bedSettle=phase(p,.225,.25);
 matrices.bed_screw=move([225*bedPlace,35*bedUnscrew-180*bedSettle,230*bedPlace]).multiply(around(f.holder_pivot_mm,rotation(X,Math.PI/2*bedSettle)));
 const holderOut=phase(p,.25,.35),holderSet=phase(p,.54,.58),holderAside=phase(p,.50,.54);
 const holderPivot=f.holder_pivot_mm;
 const holderFinal=new THREE.Quaternion().setFromRotationMatrix(rotation(X,THREE.MathUtils.degToRad(f.storage?.holder_flip_degrees||0)).multiply(rotation(Z,-Math.PI/2)).multiply(rotation(X,-Math.PI/2)));
 const holderQ=new THREE.Quaternion().slerp(holderFinal,holderSet);
 const holderRotation=new THREE.Matrix4().makeRotationFromQuaternion(holderQ);
 // The V stays in a plane parallel to the front of the Z rail, as in the
 // author's folding guide. The mouth faces the column, with the arms tucked
 // underneath it and the apex extending over the left side of the base.
 matrices.holder=move([-230*holderAside,40*holderOut*(1-holderSet)-30*holderSet,20*holderOut*(1-holderSet)-23*holderSet]).multiply(around(holderPivot,holderRotation));
 const holderApex=v(f.holder_apex_mm).applyMatrix4(matrices.holder).multiplyScalar(1000).toArray();
 matrices.holder=around(holderApex,rotation(Y,THREE.MathUtils.degToRad(-8)*holderSet)).multiply(matrices.holder);
 const columnOut=phase(p,.35,.375),columnLift=phase(p,.375,.39),columnPlace=phase(p,.39,.42);
 // Pull the shaft out along its axis before carrying it above the rear
 // panel. The loose screw stays behind the printer, clear of the display.
 matrices.column_screw=move([200*columnPlace,100*columnLift,-45*columnOut]);
 matrices.latch=around(f.latch_pivot_mm,rotation(X,-Math.PI*phase(p,.35,.42)));
 let pin=v(f.dowel_source_mm);
 const track=phase(p,.62,.72),start=v(f.slot_start_mm),center=v(f.slot_center_mm),end=v(f.slot_end_mm),radius=f.slot_radius_mm*.001;
 if(track>0){
  if(track<.35)pin=v(f.dowel_source_mm).lerp(new THREE.Vector3(center.x,center.y-radius,center.z),track/.35);
  else if(track<.85){const t=(track-.35)/.5*Math.PI/2;pin=new THREE.Vector3(center.x,center.y-radius*Math.cos(t),center.z-radius*Math.sin(t))}
  else pin=new THREE.Vector3(center.x,center.y,center.z-radius).lerp(end,(track-.85)/.15);
 }
 const angle=Math.PI/2*phase(p,.78,.92),source=v(f.dowel_source_mm);
 const column=new THREE.Matrix4().makeTranslation(pin.x,pin.y,pin.z).multiply(rotation(X,angle)).multiply(new THREE.Matrix4().makeTranslation(-source.x,-source.y,-source.z));
 matrices.column=column;matrices.carriage=column.clone().multiply(move([0,f.carriage_dz_mm*phase(p,.42,.50),0]));
 matrices.latch=column.clone().multiply(matrices.latch);
 // The detached V holder is held upright, then carried down with the column.
 if(p>.62){
  // Keep the loose holder clear of the hinge base while the dowels move
  // through the J slots. This hand-carried path is illustrative.
  matrices.holder=move([0,60*Math.sin(Math.PI*track),0]).multiply(column).multiply(matrices.holder);
 }
 const dx=f.park_head_dx_mm*phase(p,.42,.50)+(f.stow_head_dx_mm-f.park_head_dx_mm)*phase(p,.92,1);
 const beamMove=(f.park_beam_dz_mm||0)*phase(p,.42,.50);
 matrices.beam=move([0,0,beamMove]);matrices.head=move([dx,0,beamMove]);
 // The detached bed holder is seated over the left storage hole. The removed
 // thumb screws are put through the holder and the right storage hole last.
 // These are the author's storage pins, not additional assembly hardware.
 if(f.storage){
  const s=f.storage;
  const holderTilt=s.holder_tilt_axis?rotation(new THREE.Vector3(...s.holder_tilt_axis).normalize(),THREE.MathUtils.degToRad(s.holder_slope_degrees||0)):rotation(Z,THREE.MathUtils.degToRad(s.holder_slope_degrees||0));
  const bedStored=move(s.holder_hole_top_mm).multiply(holderTilt).multiply(rotation(Y,THREE.MathUtils.degToRad(90+(s.holder_yaw_degrees||0)))).multiply(move(s.holder_source_hole_top_mm.map(x=>-x)));
  // Turn the V over: its spring retainers face upward in the storage guide.
  // The removed screw keeps its downward insertion direction independently.
  const center=[...s.holder_hole_top_mm];center[1]-=(s.holder_thickness_mm||0)/2;
  const holderStored=around(center,rotation(X,THREE.MathUtils.degToRad(s.holder_flip_degrees||0))).multiply(bedStored);
  // Register the V beside the upright column before folding, following
  // guide steps 7–8. Carry both together rather than forcing the V through
  // the folded rail after the column has already been laid down.
  const columnEnd=move(f.slot_end_mm).multiply(rotation(X,Math.PI/2)).multiply(move(f.dowel_source_mm.map(x=>-x)));
  const besideColumn=move([0,30,70]).multiply(columnEnd.clone().invert()).multiply(holderStored);
  if(p>=.58){
   const held=matrices.holder,anchor=v(s.holder_source_hole_top_mm).applyMatrix4(held).multiplyScalar(1000).toArray();
   const raised=move([0,400,0]).multiply(held),targetRotation=besideColumn.clone().setPosition(0,0,0);
   const turned=move([anchor[0],anchor[1]+400,anchor[2]]).multiply(targetRotation).multiply(move(s.holder_source_hole_top_mm.map(x=>-x)));
   const above=move([0,400,100]).multiply(besideColumn),inFront=move([0,0,100]).multiply(besideColumn);
   if(p<.59)matrices.holder=blend(held,raised,phase(p,.58,.59));
   else if(p<.60)matrices.holder=blend(raised,turned,phase(p,.59,.60));
   else if(p<.608)matrices.holder=blend(turned,above,phase(p,.60,.608));
   else if(p<.616)matrices.holder=blend(above,inFront,phase(p,.608,.616));
   else if(p<.62)matrices.holder=blend(inFront,besideColumn,phase(p,.616,.62));
   else matrices.holder=column.clone().multiply(move([0,-30*phase(p,.72,.74),-70*phase(p,.74,.78)])).multiply(besideColumn);
  }
  // The original column screw is dropped vertically into the storage bore.
  // Its depth is registered separately from the detached holder's rotation.
  const columnStored=move(s.column_screw_seat_mm).multiply(rotation(X,Math.PI/2)).multiply(move(s.column_screw_source_seat_mm.map(x=>-x)));
  // Handle the screws after the V has been seated. Turn them above the
  // assembly, translate over their respective bores, and only then insert.
  const placeScrew=(loose,stored,sourcePoint)=>{
   const a=v(sourcePoint).applyMatrix4(loose).multiplyScalar(1000).toArray();
   const b=v(sourcePoint).applyMatrix4(stored).multiplyScalar(1000).toArray();
   const up=move([0,250-a[1],0]).multiply(loose);
   const orientation=stored.clone().setPosition(0,0,0);
   const upright=move([a[0],250,a[2]]).multiply(orientation).multiply(move(sourcePoint.map(x=>-x)));
   const over=move([0,250-b[1],0]).multiply(stored);
   if(p<.968)return blend(loose,up,phase(p,.96,.968));
   if(p<.974)return blend(up,upright,phase(p,.968,.974));
   if(p<.985)return blend(upright,over,phase(p,.974,.985));
   return blend(over,stored,phase(p,.985,1));
  };
  matrices.bed_screw=placeScrew(matrices.bed_screw,bedStored,s.holder_source_hole_top_mm);
  matrices.column_screw=placeScrew(matrices.column_screw,columnStored,s.column_screw_source_seat_mm);
 }
 const steps=[.18,.25,.35,.42,.50,.62,.72,.92,.96,1];const step=steps.findIndex(t=>p<t);
 return {percent,step:step<0?10:step,angleDegrees:angle*180/Math.PI,pin_mm:pin.toArray().map(n=>n*1000),matrices};
}

export function createPositronAdapter(root,manifest,profile){
 const records=new Map(manifest.parts.map(r=>[r.key,r])),nodes=new Map(),initial=new Map();
 root.traverse(n=>{if(n.userData?.part_key){if(nodes.has(n.userData.part_key))throw Error('Duplicate Positron part');nodes.set(n.userData.part_key,n)}});
 if(nodes.size!==manifest.native_leaf_count||nodes.size!==records.size)throw Error('Incomplete Positron assembly');
 root.updateMatrixWorld(true);
 for(const[k,n]of nodes){initial.set(k,n.matrix.clone());if(!records.get(k))throw Error('Unknown Positron part')}
 let percent=0;
 function setFold(next){const pose=positronFoldTransforms(profile,next);for(const[k,n]of nodes){n.matrixAutoUpdate=false;n.matrix.copy(pose.matrices[records.get(k).group]).multiply(initial.get(k));n.matrixWorldNeedsUpdate=true}root.updateMatrixWorld(true);percent=next;return pose}
 function setPalette(palette){for(const[k,n]of nodes){const role=records.get(k).appearance_role;if(!palette[role])continue;if(!/^#[0-9a-f]{6}$/i.test(palette[role]))throw Error('Invalid Positron color');n.traverse(mesh=>{if(mesh.isMesh)for(const m of [].concat(mesh.material))m.color.set(palette[role])})}}
 function setAccessoriesVisible(visible){for(const[k,n]of nodes)if(['screen','spool'].includes(records.get(k).group))n.visible=Boolean(visible)}
 return {nodes,records,setFold,setPalette,setAccessoriesVisible,getFold:()=>percent};
}

import {Vector3,Curve,TubeGeometry,Mesh,MeshStandardMaterial} from './vendor-r180/three.module.js';
import {communityConfiguration} from './community-state.mjs?v=460b3fa78cc503ddb6e6';
import {enderBowdenShapes} from './ender-bowden-shapes.mjs';

// Native pneumatic-joint end faces. The source's D4/ID2 tube sample is 50 mm,
// not a complete hose. 450 mm is a display assumption, not a factory cut length.
export const enderBowdenSpec={
 length_mm:450,radius_mm:2,minimum_bend_radius_mm:30,
 head_key:'00131',head:[6.112061443398004,211.388931744161,63.6999999999979],
 stock_key:'00090',stock:[-84.17249999999962,241.91036372880058,-30.29700000000281],
 belted_key:'belted_565',belted:[-85.06495622543252,229.247694852173,-28.323526418304]
};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const GX=[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526];
const GW=[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538];
const H=enderBowdenShapes.harmonics||4;
const FREQ=Array.from({length:H},(_,i)=>Math.PI*(i+1));
const END_WEIGHTS=FREQ.map((n,i)=>n*(i%2?-1:1)*-1);
// A single smooth bow replaces the joined circular bends. The up-going
// +270 degree end orientation selects the continuous arch branch.
function tangent(v,t){
 let theta=1.5*Math.PI*t,phi=0,dt=1.5*Math.PI,dp=0;
 for(let k=0;k<H;k++){const s=Math.sin(FREQ[k]*t),c=Math.cos(FREQ[k]*t);theta+=v[k]*s;phi+=v[k+H]*s;dt+=v[k]*FREQ[k]*c;dp+=v[k+H]*FREQ[k]*c;}
 const ct=Math.cos(theta),st=Math.sin(theta),cp=Math.cos(phi),sp=Math.sin(phi);
 return {d:[ct*cp,st*cp,sp],dd:[-st*cp*dt-ct*sp*dp,ct*cp*dt-st*sp*dp,cp*dp],theta:[-st*cp,ct*cp,0],phi:[-ct*sp,-st*sp,cp]};
}
function integrate(v,lo,hi,jacobian=false,intervals=1){
 const p=[0,0,0],J=jacobian?Array.from({length:3},()=>Array(2*H).fill(0)):null;
 const step=(hi-lo)/intervals,L=enderBowdenSpec.length_mm;
 for(let n=0;n<intervals;n++)for(let g=0;g<4;g++){
  const t=lo+step*(n+(GX[g]+1)/2),w=GW[g]*step*L/2,r=tangent(v,t);
  for(let a=0;a<3;a++){
   p[a]+=w*r.d[a];
   if(J)for(let k=0;k<H;k++){const b=w*Math.sin(FREQ[k]*t);J[a][k]+=r.theta[a]*b;J[a][k+H]+=r.phi[a]*b;}
  }
 }
 return {p,J};
}
function solve3(A,b){
 const m=A.map((r,i)=>[...r,b[i]]);
 for(let k=0;k<3;k++){
  let at=k;for(let i=k+1;i<3;i++)if(Math.abs(m[i][k])>Math.abs(m[at][k]))at=i;
  [m[k],m[at]]=[m[at],m[k]];if(Math.abs(m[k][k])<1e-10)throw Error('Degenerate Ender-3 tube bow');
  const d=m[k][k];for(let j=k;j<4;j++)m[k][j]/=d;
  for(let i=0;i<3;i++)if(i!==k){const c=m[i][k];for(let j=k;j<4;j++)m[i][j]-=c*m[k][j];}
 }
 return m.map(r=>r[3]);
}
function bracket(grid,n){let i=0;while(i<grid.length-2&&n>grid[i+1])i++;return [i,Math.max(0,Math.min(1,(n-grid[i])/(grid[i+1]-grid[i])))];}
function coefficients(x,z,belted,target){
 const table=enderBowdenShapes[belted?'belted':'stock'],[ix,u]=bracket(enderBowdenShapes.x_mm,x),[iz,w]=bracket(enderBowdenShapes.z_mm,z);
 const v=table[iz][ix].map((_,k)=>(1-w)*((1-u)*table[iz][ix][k]+u*table[iz][ix+1][k])+w*((1-u)*table[iz+1][ix][k]+u*table[iz+1][ix+1][k]));
 // Interpolated directions retain length and the fitting axes. Close the small
 // remaining endpoint error without stretching the hose or splicing a segment.
 for(let it=0;it<8;it++){
  const {p,J}=integrate(v,0,1,true,32),error=target.map((a,i)=>a-p[i]);
  // Preserve the source neck constraints during endpoint correction.
  const norm=END_WEIGHTS.reduce((a,n)=>a+n*n,0);
  for(const row of J)for(const block of [0,H]){const k=END_WEIGHTS.reduce((a,n,i)=>a+n*row[block+i],0)/norm;for(let i=0;i<H;i++)row[block+i]-=k*END_WEIGHTS[i];}
  if(Math.hypot(...error)<1e-7)return v;
  const A=J.map(a=>J.map(b=>a.reduce((s,n,k)=>s+n*b[k],0))),q=solve3(A,error);
  for(let k=0;k<2*H;k++)v[k]+=J.reduce((s,row,i)=>s+row[k]*q[i],0);
 }
 throw Error('Ender-3 tube endpoint closure failed');
}
class BowdenBow extends Curve{
 constructor(v,start,end,point,direction){
  super();this.v=v;this.start=start;this.end=end;this.point=point;this.direction=direction;this.prefix=[[0,0,0]];
  for(let i=0;i<128;i++)this.prefix.push(add(this.prefix[i],integrate(v,i/128,(i+1)/128).p));
 }
 getPoint(t,target=new Vector3()){
  if(t===0)return target.copy(this.point(this.start));if(t===1)return target.copy(this.point(this.end));
  const i=Math.min(127,Math.floor(t*128)),delta=add(this.prefix[i],integrate(this.v,i/128,t).p);
  return target.copy(this.point(add(this.start,delta)));
 }
 getDerivative(t,target=new Vector3()){return target.copy(this.direction(tangent(this.v,t).d)).multiplyScalar(enderBowdenSpec.length_mm);}
 getSecondDerivative(t,target=new Vector3()){return target.copy(this.direction(tangent(this.v,t).dd)).multiplyScalar(enderBowdenSpec.length_mm);}
 getTangent(t,target=new Vector3()){if(t===0)return target.copy(this.direction([1,0,0])).normalize();if(t===1)return target.copy(this.direction([0,-1,0])).normalize();return this.getDerivative(t,target).normalize();}
 getLength(){return enderBowdenSpec.length_mm/1000;}
 getUtoTmapping(u){return u;}
}
function usesBowden(configuration){const mode=configuration.filament_path??'bowden';if(!['bowden','direct'].includes(mode))throw Error('Unknown Ender-3 filament path');return mode==='bowden';}
export function enderBowdenRoute(axes,profile,configuration='stock'){
 if(profile.machine_id!=='ender3_stock_220'||!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
 const c=communityConfiguration(profile,configuration),belted=c.selection?.z==='belted',s=enderBowdenSpec;
 if(!usesBowden(c))return null;
 const head=add(add(s.head,[axes.x,axes.z,0]),c.rest_offsets_mm?.[s.head_key]||[0,0,0]);
 const extruder=add(add(belted?s.belted:s.stock,[0,axes.z,0]),c.rest_offsets_mm?.[belted?s.belted_key:s.stock_key]||[0,0,0]);
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const direction=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*p[i],0)/1000));
 const v=coefficients(axes.x,axes.z,belted,head.map((n,i)=>n-extruder[i]));
 const curve=new BowdenBow(v,extruder,head,point,direction);
 return {curve,endpoints_mm:[extruder,head],straight_sections_mm:[],radius_mm:s.radius_mm,length_mm:s.length_mm,service_length_mm:s.length_mm,minimum_bend_radius_mm:s.minimum_bend_radius_mm};
}
export function createEnderBowden(root,profile){
 if(profile.machine_id!=='ender3_stock_220')return {update(){},meshes:[]};
 const material=new MeshStandardMaterial({color:'#e3e5e2',roughness:.65,metalness:0}),mesh=new Mesh(undefined,material);
 mesh.name='Ender3_native_profile_Bowden_route';mesh.frustumCulled=false;mesh.userData.routing_preview=true;
 root.add(mesh);
 let shapeKey=null,route;
 function update(axes,configuration){
  if(!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
  if(!usesBowden(communityConfiguration(profile,configuration))){
   mesh.visible=false;delete mesh.userData.endpoints_mm;delete mesh.userData.length_mm;return;
  }
  const key=JSON.stringify([axes.x,axes.z,configuration]);
  if(key!==shapeKey){
   route=enderBowdenRoute(axes,profile,configuration);
   const geometry=new TubeGeometry(route.curve,192,.002,12,false);
   mesh.geometry?.dispose();mesh.geometry=geometry;shapeKey=key;
  }
  mesh.position.set(0,0,0);
  mesh.userData.endpoints_mm=route.endpoints_mm;mesh.userData.length_mm=route.length_mm;
  mesh.visible=true;
 }
 return {update,meshes:[mesh]};
}

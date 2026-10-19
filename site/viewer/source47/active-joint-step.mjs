// Constrained numerical Newton step. Not a clearance model or geometric EPS.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function minimumNorm(rows,rhs){
 const Q=[],L=[],h=[];
 for(let i=0;i<rows.length;i++){
  const norm=Math.hypot(...rows[i]);if(!norm)return null;
  const g=rows[i].map(v=>v/norm),v=g.slice(),l=[];
  for(let j=0;j<Q.length;j++){l[j]=dot(v,Q[j]);for(let k=0;k<v.length;k++)v[k]-=l[j]*Q[j][k]}
  // Reorthogonalize equation rows; geometry data is never changed.
  for(let j=0;j<Q.length;j++){const r=dot(v,Q[j]);l[j]+=r;for(let k=0;k<v.length;k++)v[k]-=r*Q[j][k]}
  const n=Math.hypot(...v);if(n<1e-12)return null;
  l.push(n);L.push(l);Q.push(v.map(x=>x/n));h.push(rhs[i]/norm);
 }
 const a=[];for(let i=0;i<h.length;i++)a.push((h[i]-dot(L[i].slice(0,i),a))/L[i][i]);
 const multipliers=Array(h.length).fill(0);for(let i=h.length-1;i>=0;i--){let v=a[i];for(let j=i+1;j<h.length;j++)v-=L[j][i]*multipliers[j];multipliers[i]=v/L[i][i]}
 const step=Array(rows[0].length).fill(0);for(let j=0;j<Q.length;j++)for(let k=0;k<step.length;k++)step[k]+=Q[j][k]*a[j];
 return {step,multipliers};
}
export function activeJointStep(theta,lengths,error,limit){
 const jx=theta.slice(1,46).map((a,k)=>-lengths[k+1]*Math.sin(a)),jy=theta.slice(1,46).map((a,k)=>lengths[k+1]*Math.cos(a));
 const A=[],b=[];
 for(let side=0;side<2;side++)for(let i=0;i<46;i++){
  const a=Array(45).fill(0),sgn=side===0?1:-1;
  if(i>0)a[i-1]=sgn;if(i+1<46)a[i]=-sgn;
  const bend=theta[i]-theta[i+1];A.push(a);b.push(side===0?-bend:bend-limit);
 }
 const active=[];
 for(let iteration=0;iteration<200;iteration++){
  const solution=minimumNorm([jx,jy,...active.map(i=>A[i])],[-error[0],-error[1],...active.map(i=>b[i])]);if(!solution)return null;
  const {step,multipliers}=solution;let worst=Infinity,index=-1;
  for(let i=0;i<A.length;i++){const s=dot(A[i],step)-b[i];if(s<worst){worst=s;index=i}}
  // Algebraic solver termination only. Final source capture checks use raw
  // finite polygons and retain any negative material/cavity witnesses.
  if(worst < -1e-11){if(active.includes(index))return null;active.push(index);continue}
  if(active.length){let k=0;for(let i=1;i<active.length;i++)if(multipliers[i+2]<multipliers[k+2])k=i;if(multipliers[k+2] < -1e-11){active.splice(k,1);continue}}
  return [0,...step,0];
 }
 return null;
}

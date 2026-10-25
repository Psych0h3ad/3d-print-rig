// Independent one-sided curvature at actual CurvePath joins (positions in m).
export function joinCurvatureJump(curve){
 const curvature=(c,end)=>{
  if(c.isLineCurve3)return 0;
  if(c.getDerivative&&c.getSecondDerivative){const a=c.getDerivative(end),b=c.getSecondDerivative(end);return a.clone().cross(b).length()/a.length()**3/1000;}
  const h=.0005,t=end?1-2*h:0,a=c.getPoint(t),b=c.getPoint(t+h),d=c.getPoint(t+2*h),u=b.clone().sub(a),v=d.clone().sub(b),area=u.clone().cross(v).length();
  return area?2*area/(u.length()*v.length()*d.distanceTo(a))/1000:0;
 };
 const spans=curve.curves??[];return Math.max(0,...spans.slice(1).map((c,i)=>Math.abs(curvature(spans[i],1)-curvature(c,0))));
}

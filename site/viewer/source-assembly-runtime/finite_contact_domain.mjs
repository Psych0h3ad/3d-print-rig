// Exact finite query enclosure; no geometry, source pose or tolerance modifications.
export function finiteSourceContactCoverage(c,axes){
 const d=c?.contact_domain;
 if(!d||!Number.isFinite(axes?.x)||!Number.isFinite(axes?.y))return {covered:false,reason:'Missing finite source contact domain'};
 const center=d.tip_center_in_bed_local_mm.map((v,i)=>v+(i===0?axes.x:axes.y)),lo=center.map((v,i)=>v+d.footprint_relative_min_mm[i]),hi=center.map((v,i)=>v+d.footprint_relative_max_mm[i]),l=d.plate_line_limits_mm;
 const points=[[lo[0],lo[1]],[lo[0],hi[1]],[hi[0],lo[1]],[hi[0],hi[1]]];
 for(const p of points){
  if(!(p[0]>l.x_min&&p[0]<l.x_max&&p[1]>l.y_min&&p[1]<l.y_max))return {covered:false,reason:'Finite nozzle footprint reaches outside source plate'};
  for(const corner of d.plate_corner_circles){const q=p.map((v,i)=>(v-corner.center_mm[i])*corner.quadrant[i]);if(q[0]>0&&q[1]>0&&!(Math.hypot(...q)<corner.radius_mm))return {covered:false,reason:'Finite nozzle footprint reaches source rounded corner'};}
  const polygon=d.actual_export_outer_boundary_CCW_mm;if(!polygon?.length||polygon.some((a,i)=>cross(a,polygon[(i+1)%polygon.length],p)<=0))return {covered:false,reason:'Finite nozzle footprint reaches original exported outer boundary'};
 }
 const openingMargins=d.plate_top_openings.map(h=>{const q=h.center_mm.map((v,i)=>Math.max(lo[i]-v,0,v-hi[i]));return {source_bound:h.bound,margin_mm:Math.hypot(...q)-Math.max(h.radius_mm,h.render_void_enclosure_radius_mm)};});
 if(openingMargins.some(v=>!(v.margin_mm>0)))return {covered:false,reason:'Finite nozzle footprint reaches original plate opening',openingMargins};
 return {covered:true,reason:'Original finite nozzle face is fully covered by original source plate face',center_mm:center,footprint_min_mm:lo,footprint_max_mm:hi,openingMargins};
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points){const p=points.toSorted((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],hi=[];for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}for(const q of p.toReversed()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=0)hi.pop();hi.push(q);}return lo.slice(0,-1).concat(hi.slice(0,-1));}
function distanceToSegment(p,a,b){const v=b.map((x,i)=>x-a[i]),w=p.map((x,i)=>x-a[i]),n=v[0]**2+v[1]**2,t=n===0?0:Math.max(0,Math.min(1,(w[0]*v[0]+w[1]*v[1])/n));return Math.hypot(...p.map((x,i)=>x-a[i]-t*v[i]));}
export function continuousSourceContactSegment(c,start,end){
 const a=finiteSourceContactCoverage(c,start),b=finiteSourceContactCoverage(c,end);
 if(!a.covered||!b.covered)return {covered:false,reason:'Endpoint finite coverage fails'};
 // The rounded outer face is convex. Endpoint footprint inclusion proves all
 // intermediate translated footprint inclusion; four voids require swept proof.
 const points=[a,b].flatMap(q=>[[q.footprint_min_mm[0],q.footprint_min_mm[1]],[q.footprint_min_mm[0],q.footprint_max_mm[1]],[q.footprint_max_mm[0],q.footprint_min_mm[1]],[q.footprint_max_mm[0],q.footprint_max_mm[1]]]),polygon=hull(points);
 const openingMargins=c.contact_domain.plate_top_openings.map(h=>{const p=h.center_mm,inside=polygon.every((a,i)=>cross(a,polygon[(i+1)%polygon.length],p)>=0),dist=inside?0:Math.min(...polygon.map((a,i)=>distanceToSegment(p,a,polygon[(i+1)%polygon.length])));return {source_bound:h.bound,margin_mm:dist-Math.max(h.radius_mm,h.render_void_enclosure_radius_mm)};});
 return {covered:openingMargins.every(v=>v.margin_mm>0),reason:'Analytic convex swept finite footprint and four exact source circle exclusions',openingMargins,pose_grid_as_proof:false};
}

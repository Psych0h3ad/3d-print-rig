import * as THREE from './vendor/three.module.js';
// Flexible viewer route; original native solids and STEP remain unchanged.
const layouts={"voron_trident_500_custom":{"machine_id":"voron_trident_500_custom","part_key":"voron_trident_350_base_1409","start_mm":[0,-35.880961,432.660258],"end_mm":[345.1625295410766,171.98175283421568,515.8999999999962],"holder_part_key":"voron_trident_350_base_1393","holder_bore_axis":[4.977943102828792e-15,0.9396926207859085,-0.3420201433256684],"radius_mm":2,"inner_radius_mm":1.5,"plane_z_mm":475.00615174620117,"roof_guide_xy_mm":[0,260],"storage_start_mm":[0,260,508.25615174620117],"storage_end_mm":[345.1625295410766,300,508.25615174620117],"holder_lead_length_mm":16,"tail_length_mm":131.47248803727712,"minimum_design_radius_mm":20,"cut_length_mm":1410,"reference_xyz_mm":[249.60606718710815,251.63501757013745,0],"display_limits_mm":{"X":[0,500],"Y":[0,500],"Z":[0,250]},"exterior_turn_radius_mm":20,"tail_segments_mm":[{"kind":"cubic","controls_mm":[[345.1625295410766,300,508.25615174620117],[345.1625295410766,300,500.2608260574174],[345.1625295410766,296.17583785072844,492.7477951540479],[345.1625295410766,289.71137813923013,488.04290477188795]],"length_mm":23.541391171513823},{"kind":"cubic","controls_mm":[[345.1625295410766,289.71137813923013,488.04290477188795],[345.1625295410766,283.2469184277318,483.338014389728],[345.1625295410766,274.92206064296704,482.00888220580225],[345.1625295410766,267.31397174043343,484.4669741733395]],"length_mm":23.54139117151383},{"kind":"line","controls_mm":[[345.1625295410766,267.31397174043343,484.4669741733395],[345.16252954107665,187.88131009036536,510.1308156535716]],"length_mm":83.47562815778433},{"kind":"cubic","controls_mm":[[345.16252954107665,187.88131009036536,510.1308156535716],[345.16252954107665,187.59136664395953,510.22449327298176],[345.16252954107665,187.30316004663473,510.3234638276042],[345.16252954107665,187.01683476679023,510.4276777067855]],"length_mm":0.9140775364651261}]},"voron_trident_1000_custom":{"machine_id":"voron_trident_1000_custom","part_key":"voron_trident_350_base_1409","holder_part_key":"voron_trident_350_base_1393","start_mm":[0,-35.880961,1182.6602579999999],"end_mm":[595.1625295410765,171.98175283421568,1265.8999999999962],"holder_bore_axis":[4.977943102828792e-15,0.9396926207859085,-0.3420201433256684],"radius_mm":2,"inner_radius_mm":1.5,"reference_xyz_mm":[499.6060671871081,501.63501757013745,0],"display_limits_mm":{"X":[0,1000],"Y":[0,1000],"Z":[0,1000]},"plane_z_mm":1224.9999999999998,"roof_guide_xy_mm":[0,510],"storage_start_mm":[0,510,1258.2499999999998],"storage_end_mm":[595.1625295410765,550,1258.2499999999998],"tail_length_mm":378.42794914001126,"holder_lead_length_mm":16,"minimum_design_radius_mm":20,"cut_length_mm":2600,"exterior_turn_radius_mm":25,"tail_segments_mm":[{"kind":"cubic","controls_mm":[[595.1625295410765,550,1258.2499999999998],[595.1625295410765,550,1251.2820848264366],[595.1625295410765,547.0919957702571,1244.6303243521395],[595.1625295410765,541.9771323163314,1239.8985156373174]],"length_mm":20.60707278347546},{"kind":"cubic","controls_mm":[[595.1625295410765,541.9771323163314,1239.8985156373174],[595.1625295410765,536.8622688624058,1235.1667069224952],[595.1625295410765,530.004698825879,1232.7842419800977],[595.1625295410765,523.057841734898,1233.3255537418922]],"length_mm":20.60707278347531},{"kind":"line","controls_mm":[[595.1625295410765,523.057841734898,1233.3255537418922],[595.1625295410767,193.62518008482994,1258.9955469683257]],"length_mm":330.43127441889243},{"kind":"cubic","controls_mm":[[595.1625295410767,193.62518008482994,1258.9955469683257],[595.1625295410767,191.36770692366653,1259.1714533901895],[595.1625295410767,189.14459605103283,1259.6532359336973],[595.1625295410767,187.01683476679023,1260.4276777067855]],"length_mm":6.78252915416804}]}};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s);
const world=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
const gx=[-.9894009349916499,-.9445750230732326,-.8656312023878318,-.755404408355003,-.6178762444026438,-.4580167776572274,-.2816035507792589,-.09501250983763745,.09501250983763745,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const gw=[.027152459411754095,.062253523938647706,.09515851168249259,.12462897125553387,.14959598881657674,.16915651939500262,.18260341504492358,.1894506104550685,.1894506104550685,.18260341504492358,.16915651939500262,.14959598881657674,.12462897125553387,.09515851168249259,.062253523938647706,.027152459411754095];
function integral(fn,lo,hi,steps=8){let sum=0;for(let j=0;j<steps;j++){const a=lo+(hi-lo)*j/steps,b=lo+(hi-lo)*(j+1)/steps,h=(b-a)/2,m=(a+b)/2;for(let i=0;i<gx.length;i++)sum+=h*gw[i]*fn(m+h*gx[i]);}return sum;}
const ellipseLength=(a,h)=>integral(t=>Math.hypot(a*Math.sin(t),h*Math.cos(t)),0,Math.PI);
const bezierDerivative=(p,t)=>add(add(scale(sub(p[1],p[0]),3*(1-t)**2),scale(sub(p[2],p[1]),6*(1-t)*t)),scale(sub(p[3],p[2]),3*t*t));
const bezierLength=p=>integral(t=>Math.hypot(...bezierDerivative(p,t)),0,1);
function nativeCurve(point,tangent,length){const c=new THREE.Curve();c.arcLengthDivisions=2048;c.getPoint=t=>world(point(t));c.getTangent=t=>world(tangent(t)).normalize();c.getLength=()=>length/1000;return c;}
function matched(path){
 const lengths=path.getCurveLengths(),total=lengths.at(-1);
 path.getPointAt=path.getPoint.bind(path);
 path.getTangentAt=(u,target=new THREE.Vector3())=>{
  const distance=u*total;let last;
  for(let i=0;i<path.curves.length;i++){const c=path.curves[i],l=c.getLength();if(l<=0)continue;last=c;if(distance<=lengths[i])return target.copy(c.getTangentAt(Math.max(0,Math.min(1,1-(lengths[i]-distance)/l))));}
  return target.copy(last.getTangentAt(1));
 };
 path.getTangent=path.getTangentAt;return path;
}
function route(spec,dx,dy){
 const start=add(spec.start_mm,[dx,dy,0]),z=spec.plane_z_mm,rh=20,r=20,rg=25,turn=spec.exterior_turn_radius_mm;
 const stem=[start[0],start[1],z-rh],headEnd=[start[0]+rh,start[1],z],guideStart=[0,spec.roof_guide_xy_mm[1]+rg,z],guideEnd=[0,spec.roof_guide_xy_mm[1],z+rg];
 const c0=add(headEnd,[0,r,0]),c1=add(guideStart,[r,0,0]),delta=sub(c1,c0),distance=Math.hypot(...delta),unit=scale(delta,1/distance),angle=Math.atan2(unit[1],unit[0]),offset=scale([unit[1],-unit[0],0],r),t0=add(c0,offset),t1=add(c1,offset);
 if(!(stem[2]>start[2]&&angle>0&&angle<Math.PI&&distance>2*r+4))throw Error('PTFE tangent domain changed');
 const inner=z-rh-start[2]+Math.PI*rh/2+distance+3*Math.PI*r/2+Math.PI*rg/2+spec.storage_start_mm[2]-(z+rg);
 const span=sub(spec.storage_end_mm,spec.storage_start_mm),a=Math.hypot(...span)/2,d=scale(span,1/(2*a)),normal=[d[1],-d[0],0];
 const target=spec.cut_length_mm-inner-spec.tail_length_mm-spec.holder_lead_length_mm-Math.PI*turn;
 let lo=Math.sqrt(a*20),hi=a*a/20;
 if(target<ellipseLength(a,lo)||target>ellipseLength(a,hi))return {failed:'unreachable constant length',target,range:[ellipseLength(a,lo),ellipseLength(a,hi)],inner};
 for(let i=0;i<56;i++){const mid=(lo+hi)/2;if(ellipseLength(a,mid)<target)lo=mid;else hi=mid;}
 const h=(lo+hi)/2;
 return {start,stem,headEnd,guideStart,guideEnd,c0,c1,distance,angle,t0,t1,inner,a,h,d,normal,
  loopStart:add(spec.storage_start_mm,add(scale(normal,turn),[0,0,turn])),
  loopEnd:add(spec.storage_end_mm,add(scale(normal,turn),[0,0,turn])),
  total_length_mm:inner+spec.tail_length_mm+spec.holder_lead_length_mm+Math.PI*turn+ellipseLength(a,h)};
}
function curve(spec,f){
 const p=new THREE.CurvePath(),line=(a,b)=>p.add(new THREE.LineCurve3(world(a),world(b)));
 const arc=(c,r,t0,sweep)=>p.add(nativeCurve(t=>add(c,[r*Math.cos(t0+sweep*t),r*Math.sin(t0+sweep*t),0]),t=>[-Math.sin(t0+sweep*t),Math.cos(t0+sweep*t),0],r*sweep));
 line(f.start,f.stem);
 p.add(nativeCurve(t=>add(f.stem,[20*(1-Math.cos(t*Math.PI/2)),0,20*Math.sin(t*Math.PI/2)]),t=>[Math.sin(t*Math.PI/2),0,Math.cos(t*Math.PI/2)],20*Math.PI/2));
 arc(f.c0,20,-Math.PI/2,f.angle);line(f.t0,f.t1);arc(f.c1,20,f.angle-Math.PI/2,3*Math.PI/2-f.angle);
 p.add(nativeCurve(t=>add(f.guideStart,[0,-25*Math.sin(t*Math.PI/2),25*(1-Math.cos(t*Math.PI/2))]),t=>[0,-Math.cos(t*Math.PI/2),Math.sin(t*Math.PI/2)],25*Math.PI/2));
 line(f.guideEnd,spec.storage_start_mm);
 const turn=spec.exterior_turn_radius_mm;
 p.add(nativeCurve(t=>add(spec.storage_start_mm,add(scale(f.normal,turn*(1-Math.cos(t*Math.PI/2))),[0,0,turn*Math.sin(t*Math.PI/2)])),t=>add(scale(f.normal,Math.sin(t*Math.PI/2)),[0,0,Math.cos(t*Math.PI/2)]),turn*Math.PI/2));
 p.add(nativeCurve(t=>add(f.loopStart,add(scale(f.d,f.a*(1-Math.cos(t*Math.PI))),scale(f.normal,f.h*Math.sin(t*Math.PI)))),t=>add(scale(f.d,f.a*Math.sin(t*Math.PI)),scale(f.normal,f.h*Math.cos(t*Math.PI))),ellipseLength(f.a,f.h)));
 p.add(nativeCurve(t=>add(spec.storage_end_mm,add(scale(f.normal,turn*(1-Math.sin(t*Math.PI/2))),[0,0,turn*Math.cos(t*Math.PI/2)])),t=>add(scale(f.normal,-Math.cos(t*Math.PI/2)),[0,0,-Math.sin(t*Math.PI/2)]),turn*Math.PI/2));
 for(const seg of spec.tail_segments_mm){
  if(seg.kind==='line')line(...seg.controls_mm);
  else {const tail=new THREE.CubicBezierCurve3(...seg.controls_mm.map(world));tail.arcLengthDivisions=2048;tail.getLength=()=>seg.length_mm/1000;tail.getTangent=t=>world(bezierDerivative(seg.controls_mm,t)).normalize();p.add(tail);}
 }
 line(spec.tail_segments_mm.at(-1).controls_mm.at(-1),spec.end_mm);return matched(p);
}

export function isRoofTubeSource(source){return Object.hasOwn(layouts,source.machine_id)}
export function roofTubeLayout(source){
 const spec=layouts[source.machine_id];
 if(!spec||source.part_key!==spec.part_key||source.holder_part_key!==spec.holder_part_key||source.radius_mm!==2||source.inner_radius_mm!==1.5)throw Error('Unsupported roof PTFE source');
 if(source.route_type&&source.cut_length_mm!==spec.cut_length_mm)throw Error('Roof PTFE source cut length changed');
 for(const key of ['start_mm','end_mm','reference_xyz_mm'])if(!Array.isArray(source[key])||source[key].length!==3||source[key].some((v,i)=>!Number.isFinite(v)||Math.abs(v-spec[key][i])>1e-8))throw Error('Roof PTFE native datum changed');
 for(const axis of ['X','Y','Z'])if(JSON.stringify(source.display_limits_mm?.[axis])!==JSON.stringify(spec.display_limits_mm[axis]))throw Error('Roof PTFE native travel changed');
 return spec;
}
export function roofCustomTubeRoute(source,dx=0,dy=0){
 const spec=roofTubeLayout(source);
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Non-finite PTFE pose');
 for(const [i,a]of ['X','Y'].entries()){const x=spec.reference_xyz_mm[i]+[dx,dy][i],limits=spec.display_limits_mm[a];if(x<limits[0]-1e-8||x>limits[1]+1e-8)throw Error('PTFE pose outside source travel')}
 const f=route(spec,dx,dy);if(f.failed)throw Error('PTFE cut length cannot reach this pose');
 return {...f,storageRadiusMm:f.a,storageHeightMm:f.h,storageAxis:f.d,totalLengthMm:f.total_length_mm};
}
export function roofCustomTubeCurve(source,dx=0,dy=0){return curve(roofTubeLayout(source),roofCustomTubeRoute(source,dx,dy))}

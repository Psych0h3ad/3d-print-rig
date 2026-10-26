// Independent current-packet numerical regression; no binary model or body audit.
// Optional flags: --root for the source checkout and --report for a JSON result.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const root=path.resolve(option('--root')??fileURLToPath(new URL('../',import.meta.url)));
const reportPath=option('--report'),started=performance.now(),failures=[],coverage=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const runtimePath=path.join(root,'site/viewer/source-assembly-runtime/source_loom306.mjs');
const packetPath=path.join(root,'site/source-assembly-assets/packet-rh3d_e3ng_v12_235.json');
const runtimeBytes=fs.readFileSync(runtimePath),packetBytes=fs.readFileSync(packetPath);
process.on('uncaughtException',error=>{
 const emergency={passed:false,aborted:true,runtime_sha256:hash(runtimeBytes),packet_sha256:hash(packetBytes),
  error:error.message,elapsed_ms:performance.now()-started,rss_bytes:process.memoryUsage().rss,
  completed_checks:typeof checks==='undefined'?null:checks,failures};
 if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(emergency,null,2)+'\n');
 console.error(JSON.stringify(emergency));process.exit(1);
});
const packet=JSON.parse(packetBytes),route=packet.source_loom306.route;
const checks={passed:0,failed:0},joinDiagnostics=[],metrics={maximum_length_error_m:0,maximum_quadrature_refinement_m:0,
 minimum_independent_radius_m:Infinity,maximum_tangent_error:0,maximum_nonuniform_join_curvature:0,
 maximum_observed_chord_deviation_m:0,nonadjacent_segment_pairs:0,reset_cycles:0};
const sourceRows=new Map(packet.parts.map(r=>[r.key,r]));
let peakRSS=0;
function budget(){peakRSS=Math.max(peakRSS,process.memoryUsage().rss);assert(performance.now()-started<55000,'55 s internal work budget');assert(peakRSS<=96*1024*1024,'96 MiB process RSS budget');}
function check(name,fn){try{fn();checks.passed++;}catch(error){checks.failed++;failures.push({name,message:error.message});}}
function close(a,b,tolerance,label){assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} vs ${b}, tolerance ${tolerance}`);}
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b)),unit=a=>mul(a,1/norm(a));
const arrays=curve=>curve.points.map(p=>p.toArray());
const signature=curve=>hash(Buffer.from(new Float64Array(arrays(curve).flat()).buffer));

registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:pathToFileURL(path.join(root,'site/viewer/vendor-r180/three.module.js')).href,shortCircuit:true}:next(specifier,context);}});
const THREE=await import('three');
const {loomCurve,tubeGeometry,createHeadLoom306,loomPreviewPolicy:policy}=await import(pathToFileURL(runtimePath).href);
const {sourceControlBounds}=await import(pathToFileURL(path.join(root,'site/viewer/source-control-bounds.mjs')).href);

// A degree-seven interpolant is recovered from OUTPUT POINTS. No production bow
// coefficients, analytic derivatives, Gauss nodes or returned length are used.
// Additional actual vertices must agree with it before it is used as an oracle.
function interpolant(curve,n){
 assert.equal(n%7,0);const nodes=Array.from({length:8},(_,i)=>i/7);
 const coefficients=[0,1,2].map(axis=>{
  const c=nodes.map((_,i)=>curve.points[1+i*n/7].getComponent(axis));
  for(let degree=1;degree<8;degree++)for(let i=7;i>=degree;i--)c[i]=(c[i]-c[i-1])/(nodes[i]-nodes[i-degree]);
  return c;
 });
 return t=>{
  const position=[],first=[],second=[];
  for(const c of coefficients){let p=c[7],d=0,dd=0;
   for(let k=6;k>=0;k--){dd=dd*(t-nodes[k])+2*d;d=d*(t-nodes[k])+p;p=p*(t-nodes[k])+c[k];}
   position.push(p);first.push(d);second.push(dd);
  }return{position,first,second};
 };
}
function simpsonSpeed(at,n){
 let sum=0;for(let i=0;i<=n;i++)sum+=(i===0||i===n?1:i%2?4:2)*norm(at(i/n).first);
 return sum/(3*n);
}
function radius(first,second){const c=norm(cross(first,second));return c<1e-13?Infinity:norm(first)**3/c;}
function circumCurvature(a,b,c){const ab=sub(b,a),bc=sub(c,b),ac=sub(c,a);return 2*norm(cross(ab,bc))/(norm(ab)*norm(bc)*norm(ac));}
// Exact rational arithmetic on the emitted binary64 coordinates distinguishes
// a floating cross-product error from a real three-point cancellation. This
// diagnostic is evaluated only for a join needing adaptive refinement.
function rational(n,d=1n){if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return{n:n/(a||1n),d:d/(a||1n)};}
const radd=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d),rneg=a=>({n:-a.n,d:a.d});
const rsub=(a,b)=>radd(a,rneg(b)),rmul=(a,b)=>rational(a.n*b.n,a.d*b.d),rdiv=(a,b)=>rational(a.n*b.d,a.d*b.n);
function exactDouble(value){const buf=new DataView(new ArrayBuffer(8));buf.setFloat64(0,value);const bits=buf.getBigUint64(0),e=Number((bits>>52n)&2047n);let n=(bits&((1n<<52n)-1n))+(e?1n<<52n:0n);if(bits>>63n)n=-n;const shift=(e?e-1023:-1022)-52;return shift<0?rational(n,1n<<BigInt(-shift)):rational(n<<BigInt(shift));}
function exactCircumCurvatureSquared(a,b,c){
 const aa=a.map(exactDouble),bb=b.map(exactDouble),cc=c.map(exactDouble),ab=bb.map((v,i)=>rsub(v,aa[i])),bc=cc.map((v,i)=>rsub(v,bb[i])),ac=cc.map((v,i)=>rsub(v,aa[i]));
 const rd=(u,v)=>u.reduce((s,x,i)=>radd(s,rmul(x,v[i])),rational(0n));
 const x=[rsub(rmul(ab[1],bc[2]),rmul(ab[2],bc[1])),rsub(rmul(ab[2],bc[0]),rmul(ab[0],bc[2])),rsub(rmul(ab[0],bc[1]),rmul(ab[1],bc[0]))];
 const q=rdiv(rmul(rational(4n),rd(x,x)),rmul(rmul(rd(ab,ab),rd(bc,bc)),rd(ac,ac)));
 const digits=42,scaled=q.n*10n**BigInt(digits)/q.d,decimal=scaled.toString().padStart(digits+1,'0');
 return{exact_numerator:q.n.toString(),exact_denominator:q.d.toString(),decimal_m_minus_2:decimal.slice(0,-digits)+'.'+decimal.slice(-digits)};
}
function fdFromActual(points,i,h){
 const first=[0,1,2].map(k=>(points[i-2][k]-8*points[i-1][k]+8*points[i+1][k]-points[i+2][k])/(12*h));
 const second=[0,1,2].map(k=>(-points[i-2][k]+16*points[i-1][k]-30*points[i][k]+16*points[i+1][k]-points[i+2][k])/(12*h*h));
 return{first,second};
}
function longestStraightRun(points){
 let run=0,longest=0;
 for(let i=1;i<points.length;i++){
  const segment=sub(points[i],points[i-1]),length=norm(segment);
  if(i===1||norm(cross(unit(sub(points[i-1],points[i-2])),unit(segment)))<1e-7)run+=length;
  else run=length;
  longest=Math.max(longest,run);
 }return longest;
}
function assertFreeBow(points,label){
 // Only the declared 15 mm exits have a source/display reason to be straight.
 // 5% is a numerical shape-review margin, not a new physical dimension.
 assert(longestStraightRun(points)<=policy.straight_exit_m*1.05,`${label}: unsupported long straight leg or flat crown`);
}
function segmentDistance(a,b,c,d){
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),A=dot(u,u),B=dot(u,v),C=dot(v,v),D=dot(u,w),E=dot(v,w);
 if(A===0||C===0)throw Error('Degenerate segment in independent self-contact check');
 const den=A*C-B*B;let sn,sd=den,tn,td=den;
 if(den<1e-24){sn=0;sd=1;tn=E;td=C;}else{sn=B*E-C*D;tn=A*E-B*D;if(sn<0){sn=0;tn=E;td=C;}else if(sn>sd){sn=sd;tn=E+B;td=C;}}
 if(tn<0){tn=0;if(-D<0)sn=0;else if(-D>A)sn=sd;else{sn=-D;sd=A;}}
 else if(tn>td){tn=td;if(-D+B<0)sn=0;else if(-D+B>A)sn=sd;else{sn=-D+B;sd=A;}}
 return norm(add(w,sub(mul(u,Math.abs(sn)<1e-24?0:sn/sd),mul(v,Math.abs(tn)<1e-24?0:tn/td))));
}
function selfContact(points,diameter,chordDeviation=0){
 const arc=[0];for(let i=1;i<points.length;i++)arc.push(arc.at(-1)+distance(points[i],points[i-1]));
 const threshold=diameter+2*chordDeviation;let pairs=0,minimum=Infinity;
 for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++){
  // Exclude only a local arc neighbourhood (two source display diameters),
  // never a fixed number of vertices: actual join samples are nonuniform.
  if(arc[j]-arc[i+1]<=2*diameter)continue;
  const a=points[i],b=points[i+1],c=points[j],d=points[j+1];
  if([0,1,2].some(k=>Math.max(a[k],b[k])+threshold<Math.min(c[k],d[k])||Math.max(c[k],d[k])+threshold<Math.min(a[k],b[k])))continue;
  pairs++;const value=segmentDistance(a,b,c,d);minimum=Math.min(minimum,value);
  if(value<=threshold)return{ok:false,pairs,minimum,pair:[i,j]};
 }return{ok:true,pairs,minimum};
}
function hostsAt(pose){
 return route.hosts.map(h=>{
  const record=sourceRows.get(h.key),matrix=new THREE.Matrix4().fromArray(record.actual_export.world_matrix_m);
  for(const axis of packet.private_source_motion172.target_axes_by_key[h.key]??[])for(let i=0;i<3;i++)matrix.elements[12+i]+=pose[axis]*packet.private_source_motion172.axes[axis].world_direction[i]*.001;
  // These packet review poses are translations only. Their independent
  // expected world exit direction is the declared native world direction.
  return{position:new THREE.Vector3(...h.local_native_mm).applyMatrix4(matrix),outward:new THREE.Vector3(...h.outward_unit_world)};
 });
}
const poseList=[];
function append(probe,pose,label){poseList.push({probe,pose:{...pose},label});}
for(const probe of ['attached','parked']){
 const zero={x:0,y:0,z:0},state=pose=>({review_axes:pose,probe_state:probe});append(probe,zero,'native');
 for(const axis of 'xyz'){
  const bounds=sourceControlBounds(packet,state(zero),axis);
  for(const fraction of [0,.25,.5,.75,1,.5,0,1])append(probe,{...zero,[axis]:bounds.min+(bounds.max-bounds.min)*fraction},`${axis}:${fraction}`);
  append(probe,zero,`${axis}:return`);
 }
 const xb=sourceControlBounds(packet,state(zero),'x'),grid=[];
 for(const xf of [0,.5,1]){
  const x=xb.min+(xb.max-xb.min)*xf,yb=sourceControlBounds(packet,state({...zero,x}),'y');
  for(const yf of [0,.5,1]){
   const xy={x,y:yb.min+(yb.max-yb.min)*yf,z:0},zb=sourceControlBounds(packet,state(xy),'z');
   for(const zf of [0,.5,1])grid.push({...xy,z:zb.min+(zb.max-zb.min)*zf});
  }
 }
 for(const pose of grid)append(probe,pose,'conditional-grid-forward');
 for(const pose of [...grid].reverse())append(probe,pose,'conditional-grid-reverse');
 append(probe,zero,'native-return');
}

check('packet exact current scope',()=>assert.equal(hash(packetBytes),'67703b976a5e3fb4c98453b99c12c56f81f6b6ab65ed949397930d8020c48ece'));
check('source preview policy is explicit',()=>{assert.equal(policy.straight_exit_m,.015);assert.equal(policy.shoulder_spread_m,.07);assert.equal(policy.minimum_bend_radius_m,.03);assert.match(policy.radius_scope,/not a manufacturer/i);});
check('declared host tangent directions',()=>{for(const h of route.hosts)assert.deepEqual(h.outward_unit_world,[0,1,0]);});

const seen=new Map(),refined=new Set();
for(const {probe,pose,label} of poseList){
 budget();const key=JSON.stringify([pose.x,pose.y]),hosts=hostsAt(pose);let curve;
 check(`route ${probe}/${label}/${JSON.stringify(pose)}`,()=>{
  curve=loomCurve(route,hosts,224);const pts=arrays(curve);
  assert.equal(pts.length,227);assert.equal(curve.tangents.length,pts.length);
  assert(pts.flat().every(Number.isFinite));
  for(let i=0;i<2;i++)assert(distance(pts[i?pts.length-1:0],hosts[i].position.toArray())<1e-12,'actual source endpoint');
  for(const t of curve.tangents)close(t.length(),1,1e-10,'unit analytic tangent');
  close(pts[1][1]-pts[0][1],policy.straight_exit_m,1e-12,'start source-axis exit');
  close(pts.at(-2)[1]-pts.at(-1)[1],policy.straight_exit_m,1e-12,'end source-axis exit');
  for(const k of [0,2]){close(pts[1][k],pts[0][k],1e-12,'start source-axis position');close(pts.at(-2)[k],pts.at(-1)[k],1e-12,'end source-axis position');}
  assertFreeBow(pts,'current actual curve');
  if(seen.has(key))assert.equal(signature(curve),seen.get(key),'reverse/Z/probe state must not change the same XY loom');else seen.set(key,signature(curve));
 });
 coverage.push({probe,axes:pose,event:label,route_returned:!!curve});
 if(!curve||refined.has(key))continue;refined.add(key);
 check(`independent derivatives/length/radius ${key}`,()=>{
  const at=interpolant(curve,224),pts=arrays(curve),h=1/224;let sampledMin=Infinity;
  for(let i=0;i<=224;i++)assert(distance(at(i/224).position,pts[i+1])<2e-11,'independent polynomial must match unused actual samples');
  for(let i=2;i<=222;i++){
   const fd=fdFromActual(pts,i+1,h),derived=at(i/224),tangentError=distance(unit(fd.first),curve.tangents[i+1].toArray());
   metrics.maximum_tangent_error=Math.max(metrics.maximum_tangent_error,tangentError);
   assert(tangentError<3e-6,'reported first derivative disagrees with actual-point finite differences');
   assert(distance(fd.second,derived.second)<2e-5,'second derivative disagrees with actual-point finite differences');
  }
  for(let i=0;i<=224;i++)sampledMin=Math.min(sampledMin,radius(at(i/224).first,at(i/224).second));
  close(curve.minimum_sampled_radius_m,sampledMin,2e-8,'reported radius vs output-derived derivatives');
  const lengths=[256,512,1024].map(n=>simpsonSpeed(at,n)+2*policy.straight_exit_m);
  const refinement=Math.abs(lengths[2]-lengths[1]),error=Math.abs(lengths[2]-route.display_constant_length_m);
  metrics.maximum_quadrature_refinement_m=Math.max(metrics.maximum_quadrature_refinement_m,refinement);
  metrics.maximum_length_error_m=Math.max(metrics.maximum_length_error_m,error);
  assert(refinement<2e-9,'independent Simpson quadrature not converged');
  assert(error<2e-7,`Gauss/root service-length error ${error} m`);
  close(curve.actual_length_m,lengths[2],2e-7,'reported length must match independently integrated speed');
  // Uniform 4096 output-derived probes plus quarter/midpoints around the best
  // interval are independent of the generator's 224 radius samples.
  let min=Infinity,index=0;
  for(let i=0;i<=4096;i++){const q=at(i/4096),r=radius(q.first,q.second);if(r<min){min=r;index=i;}}
  for(let i=Math.max(0,index-2)*4;i<=Math.min(4096,index+2)*4;i++){const q=at(i/16384);min=Math.min(min,radius(q.first,q.second));}
  metrics.minimum_independent_radius_m=Math.min(metrics.minimum_independent_radius_m,min);
  assert(min>=policy.minimum_bend_radius_m-1e-6,`independent curvature below declared preview radius: ${min} m`);
  const refinedCurve=loomCurve(route,hosts,448),fineCurve=loomCurve(route,hosts,896),middle=arrays(refinedCurve),fine=arrays(fineCurve);
  for(let i=0;i<=224;i++){assert(distance(pts[i+1],middle[1+2*i])<1e-12);assert(distance(pts[i+1],fine[1+4*i])<1e-12);}
  for(const n of [224,448,896]){
   const actual=n===224?pts:n===448?middle:fine;
   assert(distance(actual[1],hosts[0].position.clone().add(new THREE.Vector3(0,policy.straight_exit_m,0)).toArray())<1e-12);
   assert(distance(actual.at(-2),hosts[1].position.clone().add(new THREE.Vector3(0,policy.straight_exit_m,0)).toArray())<1e-12);
  }
  for(const end of [false,true]){
   const endT=end?1:0,endpoint=at(endT),endpointNormalCurvature=norm(cross(endpoint.first,endpoint.second))/norm(endpoint.first)**3;
   const span=sub(hosts[1].position.toArray(),hosts[0].position.toArray());span[1]=0;
   const planeNormal=unit(cross(unit(span),[0,1,0]));
   const diagnostic={xy:JSON.parse(key),end:end?'fixed':'moving',endpoint_normal_curvature_m_minus_1:endpointNormalCurvature,
    projected_cubic_coefficient_m:10*norm(span)-64*policy.shoulder_spread_m,rows:[],adaptive:false};
   // Keep rows BEFORE any assertion. A failure must retain its measured data.
   joinDiagnostics.push(diagnostic);
   assert(endpointNormalCurvature<2e-7,'output-derived polynomial has nonzero endpoint normal curvature');
   function sampleRow(p,n){
    const b=end?p.length-2:1,s=end?-1:1,window=[p[b-s],p[b],p[b+s],p[b+2*s]],signs=new Set();
    // Search the exact local polynomial at linear and geometrically clustered
    // parameters. Ignore only the endpoint interpolation's numerical floor.
    const offsets=[...Array.from({length:64},(_,i)=>2*(i+1)/(64*n)),...Array.from({length:32},(_,i)=>2**(-i)/n)].sort((a,b)=>a-b);
    for(const offset of offsets){const q=at(end?1-offset:offset),signed=dot(cross(q.first,q.second),planeNormal)/norm(q.first)**3;if(Math.abs(signed)>2e-7)signs.add(Math.sign(signed));}
    return{n,cross:circumCurvature(...window.slice(0,3)),one:circumCurvature(...window.slice(1)),
     inflection_in_first_two_cells:signs.size>1,actual_window_m:window.map(p=>[...p])};
   }
   diagnostic.rows.push(sampleRow(pts,224),sampleRow(middle,448),sampleRow(fine,896));
   const contracts=(a,b)=>['cross','one'].every(field=>b[field]<=.75*a[field]+1e-5);
   function resolved(){const last=diagnostic.rows.slice(-3);return last.every(row=>!row.inflection_in_first_two_cells)&&contracts(last[0],last[1])&&contracts(last[1],last[2]);}
   if(!resolved()){
    diagnostic.adaptive=true;
    // No global tolerance relaxation: a failed coarse estimate must have a
    // detected local inflection, zero endpoint curvature, and subsequently
    // pass TWO original contraction checks in inflection-free finer windows.
    assert(diagnostic.rows.some(row=>row.inflection_in_first_two_cells),'nonconvergent join has no independently detected inflection explanation');
    for(const row of diagnostic.rows){row.cross_squared_exact=exactCircumCurvatureSquared(...row.actual_window_m.slice(0,3));row.one_squared_exact=exactCircumCurvatureSquared(...row.actual_window_m.slice(1));}
    global.gc?.();
    for(const n of [1792,3584,7168]){
     budget();const q=loomCurve(route,hosts,n),row=sampleRow(arrays(q),n);
     row.cross_squared_exact=exactCircumCurvatureSquared(...row.actual_window_m.slice(0,3));row.one_squared_exact=exactCircumCurvatureSquared(...row.actual_window_m.slice(1));diagnostic.rows.push(row);
     if(resolved())break;
    }
    assert(resolved(),'adaptive nonuniform actual join samples did not resolve the inflection and converge');
   }
   metrics.maximum_nonuniform_join_curvature=Math.max(metrics.maximum_nonuniform_join_curvature,diagnostic.rows.at(-1).cross);
  }
  let deviation=0;for(let i=0;i<224;i++)for(const f of [.25,.5,.75])deviation=Math.max(deviation,distance(at((i+f)/224).position,add(pts[i+1],mul(sub(pts[i+2],pts[i+1]),f))));
  metrics.maximum_observed_chord_deviation_m=Math.max(metrics.maximum_observed_chord_deviation_m,deviation);
  const self=selfContact(pts,route.display_diameter_mm*.001,deviation);metrics.nonadjacent_segment_pairs+=self.pairs;
  assert(self.ok,`nonadjacent displayed tube contact: ${JSON.stringify(self)}`);
 });
}

// Frozen legacy construction, used only as a rejected fixture. It is not a
// competing route proposal. Test its flat/straight shape separately from radius.
function oldRectangle(hosts,R){
 const [a,d]=hosts.map(h=>h.position.toArray()),span=sub(d,a);span[1]=0;const D=norm(span),u=unit(span),L=route.display_constant_length_m;
 const H=(L+a[1]+d[1]-D-(Math.PI-4)*R)/2,A=H-R-a[1],B=D-2*R,C=H-R-d[1],Q=Math.PI*R/2,points=[];
 const boundaries=[0,A,A+Q,A+Q+B,A+2*Q+B,L];
 function at(s){if(s<=A)return add(a,[0,s,0]);s-=A;if(s<=Q){const t=Math.PI-s/R,c=add(a,mul(u,R));c[1]=H-R;return add(add(c,mul(u,R*Math.cos(t))),[0,R*Math.sin(t),0]);}s-=Q;if(s<=B){const p=add(a,mul(u,R+s));p[1]=H;return p;}s-=B;if(s<=Q){const t=Math.PI/2-s/R,c=add(d,mul(u,-R));c[1]=H-R;return add(add(c,mul(u,R*Math.cos(t))),[0,R*Math.sin(t),0]);}s-=Q;return add(d,[0,C-s,0]);}
 for(const [i,start]of boundaries.entries()){if(i===boundaries.length-1)break;for(let j=0;j<32;j++)points.push(at(start+(boundaries[i+1]-start)*j/32));}points.push(d);return points;
}
check('legacy 12 mm rectangle rejected by shape',()=>assert.throws(()=>assertFreeBow(oldRectangle(hostsAt({x:0,y:0,z:0}),route.corner_radius_m),'old rectangle'),/straight|crown/));
check('legacy rectangle remains rejected above radius floor',()=>assert.throws(()=>assertFreeBow(oldRectangle(hostsAt({x:0,y:0,z:0}),policy.minimum_bend_radius_m),'rounded rectangle'),/straight|crown/));
check('self-contact detector rejects nonlocal crossing',()=>{const p=arrays(loomCurve(route,hostsAt({x:0,y:0,z:0}),224));p[150]=[...p[35]];assert.equal(selfContact(p,route.display_diameter_mm*.001).ok,false);});

const nativeHosts=hostsAt({x:0,y:0,z:0});
for(const [name,edit]of [
 ['NaN endpoint',(r,h)=>{h[0].position.x=NaN;}],['infinite second endpoint',(r,h)=>{h[1].position.z=Infinity;}],
 ['negative infinite endpoint',(r,h)=>{h[0].position.y=-Infinity;}],['infinite length',r=>{r.display_constant_length_m=Infinity;}],
 ['NaN length',r=>{r.display_constant_length_m=NaN;}],['negative length',r=>{r.display_constant_length_m=-1;}],
 ['insufficient length',r=>{r.display_constant_length_m=.02;}],['zero diameter',r=>{r.display_diameter_mm=0;}],
 ['negative diameter',r=>{r.display_diameter_mm=-1;}],['NaN diameter',r=>{r.display_diameter_mm=NaN;}],
 ['infinite diameter',r=>{r.display_diameter_mm=Infinity;}],['negative infinite diameter',r=>{r.display_diameter_mm=-Infinity;}],
 ['coincident endpoints',(r,h)=>{h[1].position.copy(h[0].position);}],['zero horizontal span',(r,h)=>{h[1].position.x=h[0].position.x;h[1].position.z=h[0].position.z;}],
 ])check(`invalid ${name}`,()=>{const r=structuredClone(route),h=nativeHosts.map(x=>({position:x.position.clone(),outward:x.outward.clone()}));edit(r,h);assert.throws(()=>loomCurve(r,h,224));});
for(const outward of [[NaN,1,0],[0,Infinity,0],[0,-Infinity,0],[0,0,0],[1,0,0],[1,1,0],[0,-1,0]])
 for(const host of [0,1])check(`invalid exit axis host ${host}/${outward}`,()=>{
  const h=nativeHosts.map(x=>({position:x.position.clone(),outward:x.outward.clone()}));h[host].outward.set(...outward);
  assert.throws(()=>loomCurve(route,h,224),/exit-axis/);
 });
for(const n of [-1,0,31,32.5,8193,Number.MAX_SAFE_INTEGER,NaN,Infinity])check(`invalid samples ${n}`,()=>assert.throws(()=>loomCurve(route,nativeHosts,n)));
check('missing endpoint rejected',()=>assert.throws(()=>loomCurve(route,[],224)));
check('missing tangents rejected',()=>assert.throws(()=>tubeGeometry(nativeHosts.map(x=>x.position),.003)));
function rejectTube(edit){
 const f={points:[0,1,2].map(i=>new THREE.Vector3(0,i*policy.straight_exit_m,0)),
  tangents:[0,1,2].map(()=>new THREE.Vector3(0,1,0)),radius:route.display_diameter_mm*.0005,radial:route.radial_segments,origin:new THREE.Vector3()};
 edit(f);let geometry;
 try{assert.throws(()=>{geometry=tubeGeometry(f.points,f.radius,f.radial,f.tangents,f.origin);});}finally{geometry?.dispose();}
}
for(const value of [-Infinity,-1,0,NaN,Infinity])check(`invalid tube radius ${value}`,()=>rejectTube(f=>{f.radius=value;}));
for(const radial of [-1,0,2,3.5,65,Number.MAX_SAFE_INTEGER,NaN,Infinity])check(`invalid radial count ${radial}`,()=>rejectTube(f=>{f.radial=radial;}));
for(const value of [NaN,Infinity,-Infinity]){
 for(const point of [0,1,2])check(`nonfinite tube point ${point}/${value}`,()=>rejectTube(f=>{f.points[point].z=value;}));
 for(const tangent of [0,1,2])check(`nonfinite tube tangent ${tangent}/${value}`,()=>rejectTube(f=>{f.tangents[tangent].x=value;}));
 check(`nonfinite tube origin ${value}`,()=>rejectTube(f=>{f.origin.y=value;}));
}
for(const tangent of [[0,0,0],[0,2,0],[0,-1,0]])check(`invalid tube tangent ${tangent}`,()=>rejectTube(f=>{f.tangents[1].set(...tangent);}));
check('empty tube rejected',()=>rejectTube(f=>{f.points=[];f.tangents=[];}));
check('single point tube rejected',()=>rejectTube(f=>{f.points=f.points.slice(0,1);f.tangents=f.tangents.slice(0,1);}));
check('mismatched tangent count rejected',()=>rejectTube(f=>{f.tangents.pop();}));
for(const sign of [-1,1])check(`X tangent radial seed ${sign}`,()=>{
 const radius=route.display_diameter_mm*.0005,radial=route.radial_segments,points=[0,1,2].map(i=>new THREE.Vector3(sign*i*policy.straight_exit_m,0,0)),tangents=points.map(()=>new THREE.Vector3(sign,0,0));
 const geometry=tubeGeometry(points,radius,radial,tangents);try{
  const positions=geometry.attributes.position,normals=geometry.attributes.normal;
  assert([...positions.array,...normals.array].every(Number.isFinite),'X tangent seed produced nonfinite geometry');
  for(let j=0;j<points.length;j++)for(let k=0;k<radial;k++){
   const i=j*radial+k,p=new THREE.Vector3().fromBufferAttribute(positions,i),n=new THREE.Vector3().fromBufferAttribute(normals,i);
   close(p.distanceTo(points[j]),radius,2e-9,'X tangent ring radius');close(n.length(),1,2e-6,'X tangent ring unit normal');close(n.dot(tangents[j]),0,1e-7,'X tangent ring perpendicular normal');
  }
  for(let i=0;i<geometry.index.count;i+=3){
   const p=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,geometry.index.getX(i+j)));
   assert(p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).lengthSq()>0,'X tangent seed collapsed a tube/cap triangle');
  }
 }finally{geometry.dispose();}
});

check('actual controller reset/cache/disposal and source side effects',()=>{
 const scene=new THREE.Group(),parts=new Map(),owned=new Set(),events=new Map(),generated=new Set();
 for(const h of route.hosts){
  const record=sourceRows.get(h.key),node=new THREE.Group();node.matrix.fromArray(record.actual_export.world_matrix_m);node.matrixAutoUpdate=false;scene.add(node);
  // Retain the COMPLETE actual packet record, including its native baseline
  // matrix. Clone only to isolate negative identity tests from the packet.
  parts.set(h.key,{node,record:structuredClone(record)});assert.deepEqual(parts.get(h.key).record,record);
 }
 // A nonidentity real source matrix exercises parent/local conversion. This
 // is a transform-only mock; the sentinel box is not replacement hardware.
 const container=new THREE.Group();container.matrix.fromArray(sourceRows.get(route.key).actual_export.world_matrix_m);container.matrixAutoUpdate=false;scene.add(container);
 const original=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial({color:0x123456}),mesh=new THREE.Mesh(original,material);container.add(mesh);parts.set(route.key,{node:container,record:sourceRows.get(route.key)});
 const rigid=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xabcdef}));scene.add(rigid);
 const sideEffects=()=>JSON.stringify({hosts:route.hosts.map(h=>parts.get(h.key).node.matrix.toArray()),sourceBaselines:route.hosts.map(h=>parts.get(h.key).record.matrix),rigid:rigid.matrix.toArray(),positions:[...rigid.geometry.attributes.position.array],colors:[material.color.getHex(),rigid.material.color.getHex()],visible:[mesh.visible,container.visible,rigid.visible]});
 const watch=g=>{if(!events.has(g)){events.set(g,0);g.addEventListener('dispose',()=>events.set(g,events.get(g)+1));}return g;};watch(original);
 const controller=createHeadLoom306({parts,root:scene},route,owned);
 function pose(p){for(const h of route.hosts){const record=sourceRows.get(h.key),node=parts.get(h.key).node;node.matrix.fromArray(record.actual_export.world_matrix_m);for(const axis of packet.private_source_motion172.target_axes_by_key[h.key]??[])for(let i=0;i<3;i++)node.matrix.elements[12+i]+=p[axis]*packet.private_source_motion172.axes[axis].world_direction[i]*.001;}scene.updateMatrixWorld(true);}
 function update(reset){const before=sideEffects(),c=controller.update(reset);watch(mesh.geometry);generated.add(mesh.geometry);assert.equal(sideEffects(),before,'route update mutated rigid nodes/materials/visibility');const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;for(const x of positions.array)assert(Number.isFinite(x));for(let i=0;i<normals.count;i++)close(new THREE.Vector3().fromBufferAttribute(normals,i).length(),1,2e-6,'tube unit normal');const radial=route.radial_segments;for(const end of [0,1]){const centre=new THREE.Vector3();for(let k=0;k<radial;k++)centre.add(new THREE.Vector3().fromBufferAttribute(positions,(end?(c.points.length-1)*radial:0)+k));centre.multiplyScalar(1/radial).applyMatrix4(mesh.matrixWorld);assert(centre.distanceTo(c.points[end?c.points.length-1:0])<2e-8,'generated tube ring detached from transformed actual source anchor');}assert(owned.size<=3,'unbounded geometry retention');return c;}
 pose({x:0,y:0,z:0});const initial=update(true),cached=mesh.geometry,cachedHash=hash(Buffer.from(mesh.geometry.attributes.position.array.buffer));assert.notEqual(cached,original,'reset revived rectangular native geometry');assertFreeBow(arrays(initial),'initial reset');
 const cycle=poseList.filter(x=>x.probe==='attached').slice(0,20);
 for(let iteration=0;iteration<3;iteration++)for(const row of cycle){budget();pose(row.pose);const previous=mesh.geometry;update(false);assert.notEqual(mesh.geometry,previous);if(previous!==cached)assert.equal(events.get(previous),1,'superseded geometry not disposed exactly once');pose({x:0,y:0,z:0});update(true);assert.equal(mesh.geometry,cached,'native reset cache not reused');assert.equal(hash(Buffer.from(mesh.geometry.attributes.position.array.buffer)),cachedHash,'native cache changed');assert.notEqual(mesh.geometry,original);assertFreeBow(arrays(controller.curve),'repeated reset');metrics.reset_cycles++;}
 const before=mesh.geometry,h=route.hosts[0],saved=parts.get(h.key).record.source_id;parts.get(h.key).record.source_id='wrong-source';assert.throws(()=>controller.update());assert.equal(mesh.geometry,before);parts.get(h.key).record.source_id=saved;
 const savedPart=parts.get(h.key);parts.delete(h.key);assert.throws(()=>controller.update());assert.equal(mesh.geometry,before);parts.set(h.key,savedPart);
 for(const host of route.hosts){
  pose({x:0,y:0,z:0});const part=parts.get(host.key),baseline=part.node.matrix.clone(),anchor=new THREE.Vector3(...host.local_native_mm).applyMatrix4(baseline),geometryBefore=mesh.geometry,countBefore=owned.size;
  // Rotate about the EXACT source attachment point: the point stays fixed,
  // while the declared source-up axis becomes horizontal. Rejection must be
  // caused by the rotated axis, not by insufficient span/slack or detachment.
  const rotation=new THREE.Matrix4().makeTranslation(...anchor.toArray()).multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)).multiply(new THREE.Matrix4().makeTranslation(...anchor.clone().negate().toArray()));
  part.node.matrix.multiplyMatrices(rotation,baseline);scene.updateMatrixWorld(true);
  assert(new THREE.Vector3(...host.local_native_mm).applyMatrix4(part.node.matrixWorld).distanceTo(anchor)<1e-12,'rotation fixture moved its source attachment');
  try{assert.throws(()=>controller.update(),/exit-axis/);assert.equal(mesh.geometry,geometryBefore,'rejected source rotation replaced geometry');assert.equal(owned.size,countBefore,'rejected source rotation leaked owned geometry');}
  finally{part.node.matrix.copy(baseline);scene.updateMatrixWorld(true);}
  assert.deepEqual(part.record.matrix,sourceRows.get(host.key).matrix,'rotation rewrote the native baseline record');
 }
 assert.equal(events.get(original),0,'original disposed while controller owns it');assert.equal(events.get(cached),0,'cached reset disposed before teardown');
 // Production assembly.dispose() uses this owned-set contract. Dispose once,
 // then verify every generated geometry plus the superseded original is freed.
 for(const g of owned)g.dispose();for(const g of new Set([original,...generated]))assert.equal(events.get(g),1,'owned geometry leak or double disposal');
 rigid.geometry.dispose();rigid.material.dispose();material.dispose();
});
check('missing/duplicate route meshes rejected',()=>{
 const empty=new THREE.Group(),parts=new Map([[route.key,{node:empty}]]);assert.throws(()=>createHeadLoom306({parts,root:empty},route,new Set()));
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();empty.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));assert.throws(()=>createHeadLoom306({parts,root:empty},route,new Set()));geometry.dispose();material.dispose();
});
check('runtime bytes stayed pinned during the run',()=>assert.equal(hash(fs.readFileSync(runtimePath)),hash(runtimeBytes)));
check('packet not mutated by pure curve/controller',()=>assert.equal(JSON.stringify(packet),JSON.stringify(JSON.parse(packetBytes))));
global.gc?.();budget();
const report={schema:'e3ng-independent-loom-route-regression-v1',passed:checks.failed===0,checks,
 packet_sha256:hash(packetBytes),runtime_sha256:hash(runtimeBytes),test_script_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),policy,metrics,failures,join_diagnostics:joinDiagnostics,
 coverage,unique_XY_curves:refined.size,elapsed_ms:performance.now()-started,peak_rss_bytes:peakRSS,
 scope:{production_curve_and_controller:true,actual_packet_anchors:true,production_conditional_control_bounds:true,
 independent_output_interpolation_and_finite_differences:true,independent_Simpson_quadrature:true,
 nonuniform_actual_join_samples:true,centerline_self_contact_sampled:true,complete_exported_model_loaded:false,
 mesh_body_clearance:false,native_clearance:false,browser_review:false,manufacturer_rating:false}};
if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks,poses:coverage.length,unique_XY_curves:refined.size,metrics,failures:failures.slice(0,12),scope:report.scope}));
process.exitCode=report.passed?0:1;

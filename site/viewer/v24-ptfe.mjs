// External PTFE route preview measured from the native VORON assembly.
// Inject the viewer's THREE instance; this module has no native/kernel dependency.
import { hollowTubeGeometry } from './custom-voron-tube.mjs?v=55f4f1c021b4cd4a9880';
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/norm(a));
const GX=[-.9894009349916499,-.9445750230732326,-.8656312023878318,-.755404408355003,-.6178762444026438,-.4580167776572274,-.2816035507792589,-.09501250983763745,.09501250983763745,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
const GW=[.027152459411754095,.062253523938647706,.09515851168249259,.12462897125553387,.14959598881657674,.16915651939500262,.18260341504492358,.1894506104550685,.1894506104550685,.18260341504492358,.16915651939500262,.14959598881657674,.12462897125553387,.09515851168249259,.062253523938647706,.027152459411754095];
export function cubicPoint(p,t){const s=1-t;return p[0].map((_,i)=>s*s*s*p[0][i]+3*s*s*t*p[1][i]+3*s*t*t*p[2][i]+t*t*t*p[3][i]);}
export function cubicDerivative(p,t){return add(add(mul(sub(p[1],p[0]),3*(1-t)**2),mul(sub(p[2],p[1]),6*t*(1-t))),mul(sub(p[3],p[2]),3*t*t));}
export function cubicSecondDerivative(p,t){return add(mul(add(sub(p[2],mul(p[1],2)),p[0]),6*(1-t)),mul(add(sub(p[3],mul(p[2],2)),p[1]),6*t));}
function integral(fn,lo,hi){const half=(hi-lo)/2,mid=(hi+lo)/2;let v=0;for(let i=0;i<16;i++)v+=half*GW[i]*fn(mid+half*GX[i]);return v;}
function parameter(u){if(!Number.isFinite(u)||u<0||u>1)throw Error('Preview curve parameter outside [0,1]');return u;}
function line(a,b,id){const d=sub(b,a);return {id,type:'line',start:a,end:b,point:t=>add(a,mul(d,t)),derivative:()=>d,length_mm:norm(d),atDistance:s=>s/norm(d)};}
function bezier(p,id){
 const speed=t=>norm(cubicDerivative(p,t)),N=128,table=[0];
 for(let i=0;i<N;i++)table.push(table.at(-1)+integral(speed,i/N,(i+1)/N));
 return {id,type:'cubic',controls_mm:p,start:p[0],end:p[3],point:t=>cubicPoint(p,t),derivative:t=>cubicDerivative(p,t),length_mm:table.at(-1),
  // The same integration defines segment length AND the inversion table.
  atDistance(s){if(s<=0)return 0;if(s>=table.at(-1))return 1;let lo=0,hi=N;while(hi-lo>1){const m=(lo+hi)>>1;if(table[m]>s)hi=m;else lo=m;}
   const base=lo/N;let a=base,b=hi/N,t=a+(b-a)*(s-table[lo])/(table[hi]-table[lo]);
   for(let k=0;k<8;k++){const residual=table[lo]+integral(speed,base,t)-s;if(Math.abs(residual)<1e-10)return t;if(residual>0)b=t;else a=t;const q=t-residual/speed(t);t=q>a&&q<b?q:(a+b)/2;}return t;
  },arc_length_mapping:'128-cell Gauss16 integration; bounded 8-step bracketed Newton inversion; numerical preview, not a proof of material length'};
}
export function guardV24Sources(manifest,profile,spec){
 if(manifest.machine_id!==spec.machine_id||profile.machine_id!==spec.machine_id)throw Error('Wrong native machine for V24 preview');
 for(const [key,sha]of Object.entries(spec.native_mate_guards))if(manifest.parts.find(p=>p.key===key)?.native_sha256!==sha)throw Error(`V24 preview native guard changed: ${key}`);
 for(let i=0;i<3;i++)if(profile.display_reference_xyz_mm[i]!==spec.reference_xyz_mm[i])throw Error('V24 preview reference datum changed');
 for(const key of [spec.cw2_part_key,spec.internal_tube_part_key])if(JSON.stringify(manifest.parts.find(p=>p.key===key)?.motion_axes)!==JSON.stringify(['X','Y','Z']))throw Error(`Moving native endpoint axes changed: ${key}`);
 for(const key of [spec.connector_part_key,spec.holder_part_key])if(manifest.parts.find(p=>p.key===key)?.motion_axes?.length)throw Error(`Fixed native endpoint moves: ${key}`);
 return true;
}
export function v24PtfeRoute(spec,displayXYZ=spec.reference_xyz_mm){
 const supported=spec.machine_id==='voron_v24_500_custom'&&spec.schema==='v24-external-ptfe-runtime-preview-94-v4'||spec.machine_id==='voron_v24_1000_custom'&&spec.schema==='v24-external-ptfe-runtime-preview-95';
 if(!supported||spec.maximum_bend_radius_mm!==25||spec.stem_top_reference_z_mm!==209.5||spec.cubic_y_handle_fraction!==0.75)throw Error('Unsupported V24 PTFE preview law');
 if(!Array.isArray(displayXYZ)||displayXYZ.length!==3||!displayXYZ.every(Number.isFinite))throw Error('Nonfinite V24 XYZ');
 // Match the motion adapter's numeric tolerance at interpolated end stops.
 // Canonicalize only roundoff; a requested pose beyond travel still fails.
 displayXYZ=displayXYZ.map((v,i)=>{const k=['X','Y','Z'][i],[a,b]=spec.preview_display_limits_mm[k];if(v<a-1e-8||v>b+1e-8)throw Error(`Preview ${k} outside explicitly limited travel`);return Math.max(a,Math.min(b,v));});
 const delta=sub(displayXYZ,spec.reference_xyz_mm),start=add(spec.head_seat_reference_mm,delta);
 const stem=[start[0],start[1],spec.stem_top_reference_z_mm+delta[2]],R=spec.maximum_bend_radius_mm;
 if(!(R>spec.cross_section.outer_diameter_mm/2))throw Error('V24 adaptive arc loses section regularity');
 const headArcEnd=add(stem,[-R,0,R]),turnR=spec.planar_turn_radius_mm,arcEnd=add(headArcEnd,[-turnR,turnR,0]),inner=spec.inner_feedthrough_mm.slice(),gap=inner[1]-arcEnd[1];
 if(!(gap>0&&stem[2]>start[2]))throw Error('V24 monotone-Y/positive stem domain changed');
 const h=spec.cubic_y_handle_fraction*gap;
 const controls=[arcEnd,add(arcEnd,[0,h,0]),sub(inner,[0,h,0]),inner];
 const exit=spec.connector_exit_mm.slice(),left=spec.holder_left_mm.slice(),right=spec.holder_right_mm.slice();
 const tailControls=[exit,add(exit,[0,80,0]),sub(left,[80,0,0]),left];
 const arc={id:'head_fixed_R25_minus_X_arc',type:'quarter_arc',start:stem,end:headArcEnd,length_mm:R*Math.PI/2,
  point:t=>add(stem,[-R*(1-Math.cos(t*Math.PI/2)),0,R*Math.sin(t*Math.PI/2)]),
  derivative:t=>[-R*Math.PI/2*Math.sin(t*Math.PI/2),0,R*Math.PI/2*Math.cos(t*Math.PI/2)],atDistance:s=>s/(R*Math.PI/2)};
 const turn={id:'XY_fixed_R25_to_plusY',type:'quarter_arc',start:headArcEnd,end:arcEnd,length_mm:turnR*Math.PI/2,point:t=>add(headArcEnd,[-turnR*Math.sin(t*Math.PI/2),turnR*(1-Math.cos(t*Math.PI/2)),0]),derivative:t=>[-turnR*Math.PI/2*Math.cos(t*Math.PI/2),turnR*Math.PI/2*Math.sin(t*Math.PI/2),0],atDistance:s=>s/(turnR*Math.PI/2)};
 const segments=[line(start,stem,'moving_head_stem'),arc,turn,bezier(controls,'moving_monotone_Y'),line(inner,exit,'fixed_housing_connector_axis'),bezier(tailControls,'fixed_connector_to_holder'),line(left,right,'fixed_holder_axis')];
 const cumulative_mm=[0];for(const seg of segments)cumulative_mm.push(cumulative_mm.at(-1)+seg.length_mm);
 const route={display_xyz_mm:displayXYZ.slice(),delta_xyz_mm:delta,start_mm:start,stem_mm:stem,head_arc_end_mm:headArcEnd,planar_turn_radius_mm:turnR,arc_end_mm:arcEnd,inner_feedthrough_mm:inner,connector_exit_mm:exit,holder_left_mm:left,holder_right_mm:right,
  controls_mm:controls,tail_controls_mm:tailControls,gap_y_mm:gap,segments,cumulative_mm,total_length_mm:cumulative_mm.at(-1),
  // C'(t)=[6 dx q,3h+6(gap-3h)q,6 dz q], q=t(1-t).
  // Monotone Y: dy/dt >= 1.5*(gap-h) = 0.375*gap > 0.
  bend_radius_mm:R,y_handle_mm:h,moving_cubic_min_y_derivative_mm:1.5*(gap-h),length_mode:'variable_runtime_preview',native_clearance_certified:false};
 route.locate=function(u){parameter(u);const s=u*this.total_length_mm;let i=0;while(i<this.segments.length-1&&s>this.cumulative_mm[i+1])i++;const segment=this.segments[i],t=segment.atDistance(s-this.cumulative_mm[i]);return {segment,index:i,t};};
 route.pointAt=function(u){const {segment,t}=this.locate(u);return segment.point(t);};
 route.tangentAt=function(u){const {segment,t}=this.locate(u);return unit(segment.derivative(t));};
 return route;
}
export function createV24PtfeCurve(THREE,spec,displayXYZ){
 const route=v24PtfeRoute(spec,displayXYZ),curve=new THREE.Curve();
 const world=(p,out)=>out.set(p[0]/1000,p[2]/1000,-p[1]/1000);
 // getPoint and getPointAt both use normalized route distance. Do not apply a second Curve LUT.
 curve.getPoint=curve.getPointAt=(u,out=new THREE.Vector3())=>world(route.pointAt(u),out);
 curve.getTangent=curve.getTangentAt=(u,out=new THREE.Vector3())=>world(route.tangentAt(u),out).normalize();
 curve.getUtoTmapping=(u,distance=null)=>distance===null?parameter(u):parameter(distance/(route.total_length_mm/1000));
 curve.getLength=()=>route.total_length_mm/1000;
 curve.getLengths=(n=200)=>Array.from({length:n+1},(_,i)=>i*curve.getLength()/n);
 curve.route=route;return curve;
}
export function v24PtfePreviewGeometry(THREE,spec,displayXYZ,{segments=768,sides=32}={}){
 if(spec.cross_section.outer_diameter_mm!==4||spec.cross_section.inner_diameter_mm!==1.9)throw Error('Native preview section changed');
 if(!Number.isInteger(segments)||segments<64||!Number.isInteger(sides)||sides<16)throw Error('Invalid preview tessellation');
 const curve=createV24PtfeCurve(THREE,spec,displayXYZ);
 const geometry=hollowTubeGeometry(curve,{radius_mm:2,inner_radius_mm:0.95},segments,sides);
 geometry.userData={external_ptfe_preview:true,display_xyz_mm:displayXYZ.slice(),variable_length_mm:curve.route.total_length_mm,native_step_part:false};return geometry;
}
export function createV24PtfePreview(THREE,root,manifest,profile,spec,options={}){
 guardV24Sources(manifest,profile,spec);let source;root.traverse(n=>{if(n.isMesh&&n.userData?.part_key===spec.internal_tube_part_key)source=n;});
 if(!source||Array.isArray(source.material))throw Error('Exact internal PTFE material source missing/ambiguous');
 // Reuse the purchased native PTFE material without palette mutation. No source mesh is replaced.
 const mesh=new THREE.Mesh(v24PtfePreviewGeometry(THREE,spec,spec.reference_xyz_mm,options),source.material);mesh.name='V24_EXTERNAL_PTFE_RUNTIME_PREVIEW_94';mesh.userData={external_ptfe_preview:true,native_step_part:false,appearance_role:'hardware',native_material_source:spec.internal_tube_part_key};mesh.frustumCulled=false;root.add(mesh);let last=spec.reference_xyz_mm.slice();
 return {mesh,setPose(xyz,visible=true){const route=v24PtfeRoute(spec,xyz);if(xyz.some((v,i)=>v!==last[i])){const next=v24PtfePreviewGeometry(THREE,spec,xyz,options);mesh.geometry.dispose();mesh.geometry=next;last=xyz.slice();}mesh.visible=visible;return {display_xyz_mm:xyz.slice(),variable_length_mm:route.total_length_mm,preview_only:true};},reset(){return this.setPose(spec.reference_xyz_mm,true);},dispose(){root.remove(mesh);mesh.geometry.dispose();}};
}

export const V24_PTFE_SPEC = {"schema":"v24-external-ptfe-runtime-preview-94-v4","machine_id":"voron_v24_500_custom","version":"fixed-R25-minus-X-then-XY-R25-to-plusY-maxZ469-h075-v4","preview_only":true,"native_step_part":false,"reference_xyz_mm":[249.99958314925166,254.09979116960076,27.009292523210483],"preview_display_limits_mm":{"X":[0,500],"Y":[0,500],"Z":[0,469]},"cw2_part_key":"v24_00125","internal_tube_part_key":"v24_00107","connector_part_key":"v24_01416","holder_part_key":"v24_01391","native_mate_guards":{"v24_00125":"f85bc08e71455ccfae108dc4ded7996bab0ca1a5a51740756354d65b736c9579","v24_00107":"de5cb84563811eb9f6e6e6c10013c6f83e9fa5c86fabc8f16194f61b64f689fd","v24_01329":"8bb92d9af1092748027d4d237988cf8c76f519cc120d171dd120f6410e6acde7","v24_01416":"84fa4e588f66d53cc47226c2f8e2240e3f504c5807c3fa5de5c15ae8f65ae4d5","v24_01417":"07b5dcb3d0733f17591557615cb227c934de57f1ae24d68563070ba129e05e2e","v24_01391":"8edf9d58ce0b50f8a97e2c3a1c10beebc6ee56c43be13cae74f165162e823928"},"head_seat_reference_mm":[-0.00040922494540797226,-36.10025621134396,208.622451],"head_start_scope":"Actual upper polygon-ring fitted axis at Z208.622451; fitted circle is not a closed analytic socket or axial-retention proof","stem_top_reference_z_mm":209.5,"maximum_bend_radius_mm":25,"arc_end_cap_cad_z_mm":676.5,"bend_law":"Two fixed R25 quarter arcs: +Z to -X, then -X to +Y","inner_feedthrough_mm":[8.054999516104999e-05,354,645.2201133804933],"inner_feedthrough_scope":"Parent supplied housing launch Y354 on measured connector axis; finite passage fit remains unqualified","cubic_y_handle_fraction":0.75,"connector_exit_mm":[8.054999516104999e-05,394.49959664828725,645.2201133804933],"holder_left_mm":[198.40008055018785,360.00007616308494,679.5000000000034],"holder_right_mm":[221.6000805501879,360.00007616308494,679.5000000000034],"fixed_tail_controls_rule":"P1 = connector + [0,80,0]; P2 = holder_left - [80,0,0]; endpoint tangents +Y / +X","cross_section":{"outer_diameter_mm":4,"inner_diameter_mm":1.9,"radius_mm":2,"inner_radius_mm":0.95,"source_part_key":"v24_00107","source_native_sha256":"de5cb84563811eb9f6e6e6c10013c6f83e9fa5c86fabc8f16194f61b64f689fd","scope":"Exact internal source section used for a separately identified external runtime preview. Existing source internal tube/chamfers retained; no externally supplied tube or source cut-length assertion"},"radius_mm":2,"inner_radius_mm":0.95,"length_mode":"variable_runtime_preview","constant_physical_cut_length_certified":false,"material_minimum_bend_radius_certified":false,"retention_certified":false,"full_native_continuous_clearance_certified":false,"roof":{"bottom_z_mm":681.0000000000979,"scope":"Moving stem/arc/cubic centerline cap only; fixed tail is outside roof XY projection. Not a whole-native-clearance certificate"},"coordinate_mapping":"CAD mm -> Three metres [x,z,-y]*0.001","pose_api":"absolute display XYZ; include Z delta from original profile reference; reset equals reference","notices":["External PTFE is a flexible viewer preview and is not included in the native STEP assembly.","Preview length changes with pose; no physical tube cut length, retention, material bend limit or whole-route clearance has been verified."],"planar_turn_radius_mm":25,"arc_law":"First: stem+[-25(1-cos(theta)),0,25sin(theta)]; second: firstEnd+[-25sin(theta),25(1-cos(theta)),0]","qualification":{"native_selected_route_passed":false,"native_continuous_clearance_certified":false,"body_fit":"Only first R25/-X head arc has parent selected native common0. Additional XY arc and the rest of V4 have not been tested against native bodies.","previous_candidate":"V3 fixedR25 h110 cubic failed local sweep regularity and actual runtime triangle winding; unchanged failure preserved"},"operating_range_notice":"Preview Z maximum469; original source/native STEP authored480 retained. Production profile changes belong to parent."};

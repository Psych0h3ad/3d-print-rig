import * as THREE from './vendor/three.module.js';

const records=new WeakMap();
const key=p=>p.join(',');
const floatBits=new DataView(new ArrayBuffer(4));
function float32Parts(value){
 if(!Number.isFinite(value)||Math.fround(value)!==value)throw Error('Expected literal binary32 source coordinates');
 floatBits.setFloat32(0,value,false);const bits=floatBits.getUint32(0,false),exponent=(bits>>>23)&255;
 return {n:BigInt((bits&0x7fffff)+(exponent?0x800000:0))*(bits>>>31?-1n:1n),e:exponent?exponent-150:-149,bits};
}
// Exact integer arithmetic on the source binary32 values. No area threshold,
// tolerance or normal magnitude is used to decide whether a facet is zero.
export function sphinxSourceTriangleIsExactlyZero(points){
 const parts=points.map(p=>p.map(float32Parts)),nonzero=parts.flat().filter(p=>p.n!==0n),e=nonzero.length?Math.min(...nonzero.map(p=>p.e)):0;
 const q=parts.map(p=>p.map(v=>v.n===0n?0n:v.n<<BigInt(v.e-e))),a=q[1].map((v,k)=>v-q[0][k]),b=q[2].map((v,k)=>v-q[0][k]);
 return a[1]*b[2]===a[2]*b[1]&&a[2]*b[0]===a[0]*b[2]&&a[0]*b[1]===a[1]*b[0];
}
const profile=cut=>{
 const p=cut?.source_attachment;
 if(!p)return null;
 if(p.schema!=='sphinx-tricorn-finite-belt-land-v1'||p.source_body_sha256!=='be0e04eb0510452dca127f7f19fa183f701a9db28d2fad356c6b8536079cf08f'
  ||!cut.x_mm?.every(Number.isFinite)||cut.x_mm.length!==2||cut.x_mm[0]>=cut.x_mm[1]
  ||!p.source_translation_mm?.every(Number.isFinite)||p.source_translation_mm.length!==3
  ||!p.finite_support_faces?.every((v,i)=>v===[7904,7908,8095,8099][i])||p.finite_support_faces.length!==4
  ||!cut.x_mm.every((v,i)=>v===[-22.7409998177714,22.7409998177714][i]+p.source_translation_mm[0])
  ||p.support_backing_y_mm!==-9.74+p.source_translation_mm[1])
  throw Error('Sphinx finite belt attachment source changed');
 return p;
};

// Clip the actual toothed export, then cap its finite source-supported ends.
// Original triangles outside the head region and their encoded attributes stay
// unchanged. This never substitutes a smooth box for an exported toothed belt.
export function sphinxBeltAttachmentGeometry(native,cut){
 if(!profile(cut))return native;
 const pos=native.getAttribute('position'),normal=native.getAttribute('normal');
 if(!pos||Object.keys(native.attributes).some(k=>!['position','normal'].includes(k)))throw Error('Unknown Sphinx source belt attributes');
 const index=native.index,vertices=[],normals=[],edges=[[],[]],intersections=new Map(),zeroWitnesses=[];
 const at=i=>({p:[pos.getX(i),pos.getY(i),pos.getZ(i)],n:normal?[normal.getX(i),normal.getY(i),normal.getZ(i)]:null});
 const boundary=cut.x_mm.map(x=>x*.001),y=cut.y_mm.map(v=>v*.001);
 const intersection=(a,b,x)=>{
  const endpoints=[a,b].sort((u,v)=>key(u.p).localeCompare(key(v.p))),cache=x+'|'+key(endpoints[0].p)+'|'+key(endpoints[1].p);
  const [u,v]=endpoints,t=(x-u.p[0])/(v.p[0]-u.p[0]);
  const p=intersections.get(cache)||u.p.map((c,i)=>i===0?x:c+(v.p[i]-c)*t),n=u.n.map((c,i)=>c+(v.n[i]-c)*t),length=Math.hypot(...n);
  // Adjacent faces share positions, not their shading normals.
  intersections.set(cache,p);return {p,n:length?n.map(c=>c/length):u.n,generatedIntersection:true};
 };
 const clip=(tri,x,sign)=>{
  const out=[];
  for(let i=0;i<tri.length;i++){
   const a=tri[i],b=tri[(i+1)%tri.length],inside=sign*(a.p[0]-x)>=0,next=sign*(b.p[0]-x)>=0;
   if(inside)out.push(a);
   if(inside!==next)out.push(intersection(a,b,x));
  }
  return out;
 };
 const emit=polygon=>{for(let i=1;i<polygon.length-1;i++){const tri=[polygon[0],polygon[i],polygon[i+1]];
  if(tri.some(v=>v.generatedIntersection)&&sphinxSourceTriangleIsExactlyZero(tri.map(v=>v.p.map(Math.fround))))throw Error('Positive Sphinx clipped facet collapsed in binary32');
  for(const v of tri){vertices.push(...v.p);normals.push(...v.n)}
 }};
 for(let i=0;i<(index?.count??pos.count);i+=3){
  const sourceIndices=[0,1,2].map(j=>index?index.getX(i+j):i+j),triangle=sourceIndices.map(at);
  if(sphinxSourceTriangleIsExactlyZero(triangle.map(v=>v.p))){
   zeroWitnesses.push({source_triangle_index:i/3,source_vertex_indices:sourceIndices,positions_m:triangle.map(v=>[...v.p]),position_bits_u32:triangle.map(v=>v.p.map(c=>float32Parts(c).bits)),exact_scaled_integer_cross:['0','0','0']});
   continue;
  }
  if(!normal){const a=new THREE.Vector3(...triangle[1].p).sub(new THREE.Vector3(...triangle[0].p)),b=new THREE.Vector3(...triangle[2].p).sub(new THREE.Vector3(...triangle[0].p)),n=a.cross(b).normalize().toArray();for(const v of triangle)v.n=n}
  if(triangle.every(v=>v.p[0]<=boundary[0])||triangle.every(v=>v.p[0]>=boundary[1])||triangle.every(v=>v.p[2]<=-y[1])||triangle.every(v=>v.p[2]>=-y[0])){emit(triangle);continue}
  // No other native span crosses this local source receiver. Reject an
  // unexpected source route rather than clipping through another belt run.
  if(!triangle.every(v=>v.p[2]>-y[1]&&v.p[2]<-y[0]))throw Error('Sphinx source belt span crosses the attachment region');
  for(const [side,x]of boundary.entries()){
   const polygon=clip(triangle,x,side===0?-1:1);emit(polygon);
   const line=polygon.filter(v=>v.p[0]===x);
   if(line.length===2&&key(line[0].p)!==key(line[1].p))edges[side].push(line.map(v=>v.p));
  }
 }
 const capLoops=[];
 for(const [side,segments]of edges.entries()){
  const adj=new Map(),points=new Map();
  for(const [a,b]of segments){const ka=key(a),kb=key(b);points.set(ka,a);points.set(kb,b);for(const [u,v]of [[ka,kb],[kb,ka]]){if(!adj.has(u))adj.set(u,new Set());adj.get(u).add(v)}}
  if(!adj.size||[...adj.values()].some(v=>v.size!==2))throw Error('Sphinx source cut has an open or ambiguous cap');
  const first=adj.keys().next().value,loop=[];let prev=null,current=first;
  do{loop.push(points.get(current));const next=[...adj.get(current)].find(v=>v!==prev);prev=current;current=next;if(loop.length>adj.size)throw Error('Sphinx cap loop is not simple')}while(current!==first);
  if(loop.length!==adj.size)throw Error('Sphinx source cut has multiple cap contours');
  const contour=loop.map(p=>new THREE.Vector2(p[1],p[2])),indices=THREE.ShapeUtils.triangulateShape(contour,[]),desired=side===0?1:-1;
  for(const ids of indices){const q=ids.map(i=>loop[i]),a=new THREE.Vector3().subVectors(new THREE.Vector3(...q[1]),new THREE.Vector3(...q[0])),b=new THREE.Vector3().subVectors(new THREE.Vector3(...q[2]),new THREE.Vector3(...q[0]));if(a.cross(b).x*desired<0)[q[1],q[2]]=[q[2],q[1]];
   if(sphinxSourceTriangleIsExactlyZero(q.map(p=>p.map(Math.fround))))throw Error('Sphinx generated cap facet is exactly zero');
   for(const p of q){vertices.push(...p);normals.push(desired,0,0)}
  }
  capLoops.push({x_mm:boundary[side]*1000,points:loop.length,triangles:indices.length,outward_x:desired});
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.computeBoundingBox();g.computeBoundingSphere();g.userData={...native.userData,sphinxSourceAttachment:cut.source_attachment,sourceCapLoops:capLoops,
  sourceExactZeroDrawOmissions:{schema:'sphinx-source-exact-zero-draw-omissions-v1',source_position_encoding:'literal Float32 metres',source_triangles:(index?.count??pos.count)/3,count:zeroWitnesses.length,witnesses:zeroWitnesses,positive_area_omission_threshold:null,original_source_geometry_modified:false}};return g;
}

// Used only by the fixed Sphinx runtime. The tooth display is the existing
// approved Monolith 2 mm/.75 mm/.63 mm display profile, not a belt SKU model.
export function sphinxMovingBeltGeometry(route){
 const p=profile({source_attachment:route.source_attachment,x_mm:route.attachment_x_mm});
 if(!p)throw Error('Missing Sphinx finite belt attachment');
 const points=route.points,n=route.normals,stations=[0];
 for(let i=1;i<points.length;i++)stations.push(stations.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 const length=stations.at(-1),samples=[...stations];
 // Keep every source span endpoint. Suppress only optional display-profile
 // samples too close to a source knot to survive binary32 coordinates.
 const encodingSeparationMm=4*Math.max(...points.flat().map(Math.abs))*2**-23;
 for(let s=.125;s<length;s+=.125)if(stations.every(k=>Math.abs(k-s)>encodingSeparationMm))samples.push(s);
 samples.sort((a,b)=>a-b);const clean=samples.filter((s,i)=>!i||s!==samples[i-1]),vertices=[],indices=[];
 let span=0;const teethSide=Math.sign(n[0][1]),handedness=(points[1][0]-points[0][0])*n[0][1]-(points[1][1]-points[0][1])*n[0][0];
 if(!teethSide||!Number.isFinite(handedness)||!handedness)throw Error('Sphinx source tooth side is unbound');
 for(const station of clean){
  while(span<stations.length-2&&station>stations[span+1])span++;
  const t=(station-stations[span])/(stations[span+1]-stations[span]),point=points[span].map((v,k)=>v+(points[span+1][k]-v)*t),nn=n[span].map((v,k)=>v+(n[span+1][k]-v)*t),nl=Math.hypot(...nn);nn.forEach((v,i)=>nn[i]=v/nl);
  const depth=.375*(1+Math.cos(Math.PI*station))*Math.min(1,station/.125,(length-station)/.125);
  for(const [side,height]of [[-1,-1],[1,-1],[1,1],[-1,1]]){
   const offset=side*(route.thickness/2-(side===teethSide?depth:0));vertices.push((point[0]+nn[0]*offset)/1000,(route.z+height*route.width/2)/1000,-(point[1]+nn[1]*offset)/1000);
  }
 }
 for(let i=0;i<clean.length-1;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=b+4,d=a+4;indices.push(a,b,c,a,c,d)}
 const end=(clean.length-1)*4;indices.push(0,2,1,0,3,2,end,end+1,end+2,end,end+2,end+3);
 if(handedness<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));indexed.setIndex(indices);
 // Source tooth shoulders and cut caps are sharp faces. Averaging their
 // normals across those edges can point against a neighbouring small facet.
 const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData={sphinxSourceAttachment:route.source_attachment,displayToothPitchMm:2,displayToothHeightMm:.75,displayBackingMm:.63,manufacturingToothProfile:false,loadedToothPhaseVerified:false,sourceEndCaps:2};return g;
}

export function setSphinxBeltAttachment(mesh,cut){
 let record=records.get(mesh);
 if(!record){record={native:mesh.geometry,prepared:new Map(),originalWitnessOwn:Object.hasOwn(mesh.userData,'sphinx_draw_omissions'),originalWitness:mesh.userData.sphinx_draw_omissions};records.set(mesh,record)}
 if(!profile(cut)){mesh.geometry=record.native;if(record.originalWitnessOwn)mesh.userData.sphinx_draw_omissions=record.originalWitness;else delete mesh.userData.sphinx_draw_omissions;return false}
 const signature=JSON.stringify(cut);if(!record.prepared.has(signature))record.prepared.set(signature,sphinxBeltAttachmentGeometry(record.native,cut));mesh.geometry=record.prepared.get(signature);
 // Mesh extras survive normal scene exports; the untouched source geometry
 // and its original extras are restored for other heads and native reset.
 mesh.userData.sphinx_draw_omissions={...mesh.geometry.userData.sourceExactZeroDrawOmissions,source_part_key:String(mesh.userData.part_key??mesh.name)};return true;
}

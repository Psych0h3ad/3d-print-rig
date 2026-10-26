// Required actual-source eight-instance gate. Reuses the bounded, hash-verified
// source accessor context; no GLTFLoader, CAD execution, supplier/thread claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3} from 'three';
import {e3ngSkirtFasteners} from '../site/viewer/source-assembly-runtime/e3ng-skirt-fastener-data.mjs';

const fixtureURL=new URL('./fixtures/e3ng-skirt-fasteners-source.json',import.meta.url);
const fixtureSHA='e93f992fd29cae40f18e699770f30dfdc5eddfe11b5cdde67bd46e31927faf20';
const sha=b=>createHash('sha256').update(b).digest('hex');
const finiteMatrix=a=>Array.isArray(a)&&a.length===16&&a.every(Number.isFinite);
const matrix=a=>{assert(finiteMatrix(a),'Missing/nonfinite source world');return new Matrix4().fromArray(a);};
const mm=(m,p)=>{const v=new Vector3(...p).applyMatrix4(m);return [v.x*1000,-v.z*1000,v.y*1000];};
function near(a,b,t,label){assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=t,`${label}: ${a} / ${b}`);}
function vectorNear(a,b,t,label){assert.equal(a.length,b.length,label);a.forEach((v,i)=>near(v,b[i],t,`${label}[${i}]`));}
function inXY(p,tri){
  const [a,b,c]=tri,cross=(u,v)=>u[0]*v[1]-u[1]*v[0],sub=(u,v)=>[u[0]-v[0],u[1]-v[1]],den=cross(sub(b,a),sub(c,a));
  if(Math.abs(den)<1e-12)return false;
  const u=cross(sub(p,a),sub(c,a))/den,v=cross(sub(b,a),sub(p,a))/den;
  return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7;
}

export async function auditE3NGSkirtFasteners(actualSource,{instances=e3ngSkirtFasteners}={}){
  assert(actualSource?.packet&&actualSource.doc&&actualSource.manifest&&actualSource.recordMap&&
    actualSource.corrected&&typeof actualSource.rawWorld==='function'&&typeof actualSource.accessor==='function',
    'Complete bounded actualSource context required');
  const size=await fs.stat(fixtureURL);assert(size.size<=128*1024,'Fastener fixture exceeds bound');
  const raw=await fs.readFile(fixtureURL);assert.equal(sha(raw),fixtureSHA,'Source/native fastener fixture changed');
  const f=JSON.parse(raw),{packet:p,doc,manifest,recordMap,rawWorld,accessor,corrected}=actualSource;
  assert.equal(f.schema,'e3ng-eight-skirt-fasteners-native-pose-v1');assert(!p.head_only_subset);
  assert.equal(p.model.sha256,f.model_sha256);assert.equal(p.inventory.sha256,f.inventory_sha256);
  assert.equal(p.chunk_delivery.manifest.sha256,f.manifest_sha256,'Exact exported-source manifest required');
  assert.equal(manifest.model_sha256,f.model_sha256);assert.equal(manifest.source_inventory_sha256,f.inventory_sha256);
  assert.equal(instances.length,8,'All four screws and four nuts are required');
  assert.equal(new Set(instances.map(r=>r.key)).size,8,'Duplicate installed fastener key');
  assert.equal(f.instances.length,8);assert.equal(new Set(f.instances.map(r=>r.key)).size,8);
  assert.deepEqual(instances.map(r=>r.key).sort(),f.instances.map(r=>r.key).sort(),'Missing/unexpected installed fastener');
  const worldTol=f.tolerances.world_m,surfaceTol=f.tolerances.surface_mm,axisTol=f.tolerances.axis_mm;
  const installed=new Map(instances.map(r=>[r.key,r])),chunks=new Map(manifest.chunks.map(c=>[c.ordinal,c]));
  const t0=performance.now();const budget=()=>assert(performance.now()-t0<20000,'20 s eight-fastener actual-asset budget exceeded');
  const geometry=new Map();
  // Mandatory selected geometry bindings, never a missing-geometry skipped pass.
  for(const [key,pin]of Object.entries(f.owners)){
    budget();const r=recordMap.get(key),n=doc.nodes[pin.node];assert(r&&n,`Missing source owner ${key}`);
    assert.equal(r.source_id,pin.source_id);assert.equal(r.source_identity,pin.source_identity);assert.equal(r.kind,pin.kind);
    assert.equal(r.actual_export.node,pin.node);assert.equal(n.extras?.part_key,key);assert.equal(n.mesh,pin.mesh);
    assert.equal((n.children??[]).length,0,'Fresh direct source-mesh binding required');
    vectorNear(r.matrix,pin.raw_world_m,worldTol,`packet source pose ${key}`);
    vectorNear(rawWorld(pin.node).elements,pin.raw_world_m,worldTol,`exported source pose ${key}`);
    const mesh=doc.meshes[pin.mesh];assert.equal(mesh?.primitives.length,1);const pr=mesh.primitives[0];assert.equal(pr.mode??4,4);
    const attributes={};
    for(const [semantic,binding]of Object.entries(pin.accessors)){
      assert.equal(semantic==='indices'?pr.indices:pr.attributes[semantic],binding.id,`Missing source accessor ${key}/${semantic}`);
      const a=doc.accessors[binding.id];assert.deepEqual(a,binding.descriptor);assert(!a.sparse&&!a.normalized);
      assert.deepEqual(doc.bufferViews[a.bufferView],binding.view);
      const mapping=manifest.buffer_view_chunks[a.bufferView];assert.deepEqual(mapping,binding.mapping);
      assert.equal(chunks.get(mapping.chunk)?.sha256,binding.chunk_sha256,'Source view chunk differs');
      const data=await accessor(binding.id,false);
      assert.equal(data.id,binding.id,'Actual accessor must expose its binding ID');
      assert.equal(data.count,a.count);assert.match(data.sha256,/^[0-9a-f]{64}$/,'Missing actual accessor-byte hash');
      if(binding.raw_sha256)assert.equal(data.sha256,binding.raw_sha256,`Original source bytes changed: ${key}/${semantic}`);
      attributes[semantic]=data;
    }
    const pos=attributes.POSITION,ix=attributes.indices;assert(pos&&ix&&ix.count>0&&ix.count%3===0);
    const receipt=f.prototype_receipts[key];
    if(receipt){
      assert.equal(receipt.node,pin.node);assert.equal(receipt.mesh,pin.mesh);assert.equal(receipt.vertex_count,pos.count);
      assert.equal(pos.sha256,receipt.actual_POSITION_sha256);assert.equal(ix.sha256,receipt.actual_INDEX_sha256);
      const compared=receipt.all_source_oriented_triangles_compared??654;
      assert.equal(ix.count/3,compared,'Native-source triangle comparison scope changed');
      const encoding=receipt.maximum_encoding_error_mm??receipt.all654_native_triangles_maximum_encoding_error_mm;
      assert(Number.isFinite(encoding)&&encoding>=0&&encoding<1e-6,'Native-to-exported prototype comparison missing');
    }
    for(let i=0;i<pos.count;i++)for(let j=0;j<3;j++)assert(Number.isFinite(pos.read(i,j)),'Nonfinite original source vertex');
    for(let i=0;i<ix.count;i++){const v=ix.read(i);assert(Number.isInteger(v)&&v>=0&&v<pos.count,'Invalid source triangle index');}
    const local=i=>[pos.read(i,0),pos.read(i,1),pos.read(i,2)];
    const triangle=(i,world)=>[0,1,2].map(j=>{const q=local(ix.read(3*i+j));return world?mm(world,q):q;});
    geometry.set(key,{attributes,local,triangle,triangles:ix.count/3});
  }
  const skirtKey='RH3D-original-front-skirt-190',barKey='E3NG-exact-donor-member-05';
  const skirtWorld=corrected.get(skirtKey);assert(skirtWorld,'Corrected installed skirt is required');
  vectorNear(skirtWorld.elements,f.installed_skirt_world_m,worldTol,'Native-datum installed skirt');
  assert(!corrected.has(barKey),'Native front bar must remain unchanged');
  const skirt=geometry.get(skirtKey),facet=skirt.attributes._SOURCE_FACET_ID;assert(facet&&facet.count===skirt.attributes.POSITION.count);
  assert.equal(f.seat_plane_original_facet_ids?.length,1996,'Complete source-backed opposite-wall seat required');
  const wanted=new Set([...f.seat_plane_original_facet_ids,...f.bores.flatMap(b=>b.original_facet_ids)]),facets=new Map(),completeSeat=[];
  for(let i=0;i<skirt.triangles;i++){
    const ids=[0,1,2].map(j=>facet.read(skirt.attributes.indices.read(3*i+j)));
    assert(ids.every(Number.isInteger)&&ids.every(v=>v===ids[0]),'Mixed/invalid original skirt facet identity');
    const tri=skirt.triangle(i,skirtWorld);
    if(tri.every(v=>Math.abs(v[2]-f.seat_plane_z_mm)<=surfaceTol))completeSeat.push(ids[0]);
    if(wanted.has(ids[0])){assert(!facets.has(ids[0]),'Duplicate original skirt facet');facets.set(ids[0],tri);}
  }
  assert.equal(new Set(completeSeat).size,completeSeat.length,'Duplicate full-plane source facet');
  assert.deepEqual(completeSeat.sort((a,b)=>a-b),f.seat_plane_original_facet_ids,'Actual complete mounting plane differs from pinned source evidence');
  for(const id of wanted)assert(facets.has(id),`Missing finite skirt source facet ${id}`);
  const certificate=f.native_certificate;assert.equal(certificate.passed,true);
  assert.equal(certificate.selected.angle_degrees,0);near(certificate.selected.offset_mm,-0.06380730867385864,1e-14,'Selected internal seating offset');
  assert.deepEqual(certificate.internal_search_window_mm,[-.5,.5]);
  assert(certificate.selected.offset_mm>=-.5&&certificate.selected.offset_mm<=.5);
  assert.equal(certificate.verification.length,4);assert.deepEqual(certificate.verification.map(v=>v.instance).sort(),[0,1,2,3]);
  assert.deepEqual(certificate.source_ids,[
    f.owners[f.instances.find(r=>r.key.includes('M3Tnut')).source_key].source_id,
    f.owners[f.instances.find(r=>r.key.includes('M3x8')).source_key].source_id,f.owners[barKey].source_id]);
  const results=[];
  for(const expected of f.instances){
    budget();const spec=installed.get(expected.key),source=recordMap.get(expected.source_key),g=geometry.get(expected.source_key);
    assert(source&&g,'Missing actual purchased fastener geometry');assert.equal(source.kind,'purchased');
    assert(!recordMap.has(expected.key),'Runtime instance collides with a raw source owner');
    for(const name of ['source_key','source_id','parent_key'])assert.equal(spec[name],expected[name],`Changed native instance binding ${expected.key}/${name}`);
    assert.equal(expected.parent_key,skirtKey);assert.equal(source.source_id,expected.source_id);
    vectorNear(spec.expected_source_world_m,f.owners[expected.source_key].raw_world_m,worldTol,'Expected purchased donor pose');
    vectorNear(spec.world_m,expected.world_m,worldTol,`Final native-certified installed world ${expected.key}`);
    const world=matrix(spec.world_m),bore=f.bores.find(b=>b.index===expected.bore_index);assert(bore);
    const xy=bore.axis_point_world_mm.slice(0,2);
    if(expected.key.includes('M3x8')){
      const head=mm(world,f.screw.head_axis_local_mm),tip=mm(world,f.screw.tip_axis_local_mm);
      vectorNear(head,bore.head_seat_world_mm,axisTol,'Original underhead plane/axis');
      near(head[2],17,axisTol,'Source underhead height');near(tip[2],25,axisTol,'Original 8 mm screw tip');
      vectorNear(tip.slice(0,2),xy,axisTol,'Screw axis XY');vectorNear(tip.map((v,i)=>(v-head[i])/8),bore.axis_unit_world,axisTol,'Screw axis direction');
      let minZ=Infinity,maxZ=-Infinity,headTriangles=0;
      for(let i=0;i<g.attributes.POSITION.count;i++){const q=g.local(i);minZ=Math.min(minZ,q[2]);maxZ=Math.max(maxZ,q[2]);}
      vectorNear([minZ,maxZ],f.screw.native_z_bounds_mm,surfaceTol,'Actual source screw length/head retained');
      for(let i=0;i<g.triangles;i++){
        const local=g.triangle(i);if(!local.every(v=>Math.abs(v[2]+8)<=surfaceTol))continue;
        const ring=local.map(v=>Math.hypot(v[0],v[1]));
        assert(ring.every(r=>r>=f.screw.shank_radius_mm-surfaceTol&&r<=f.screw.head_outer_radius_mm+surfaceTol),'Changed finite underhead annulus');
        for(const v of g.triangle(i,world))near(v[2],head[2],surfaceTol,'Actual installed screw head face');headTriangles++;
      }
      assert(headTriangles>0,'Missing actual screw head-seat triangles');
      assert.equal(bore.original_facet_ids.length,288,'Original lower full-round wall is required');
      assert(bore.observed_angular_span_radians>6.23,'Partial upper curved patches cannot substitute for full-round lower bores');
      const seats=f.seat_plane_original_facet_ids.map(id=>facets.get(id));
      for(const tri of seats)for(const v of tri)near(v[2],head[2],surfaceTol,'Actual finite skirt head-seat plane');
      assert(!seats.some(tri=>inXY(head,tri)),'Skirt mounting hole is filled at the screw axis');
      for(let k=0;k<f.tolerances.ring_samples;k++){
        const a=2*Math.PI*k/f.tolerances.ring_samples,r=f.tolerances.seat_ring_radius_mm;
        const point=[head[0]+r*Math.cos(a),head[1]+r*Math.sin(a)];
        assert(seats.some(tri=>inXY(point,tri)),'Screw head ring lacks finite skirt seat support: '+JSON.stringify({key:expected.key,k,point,head,seats:seats.length}));
      }
      const axial=bore.finite_through_wall_ends_world_mm.map(v=>v[2]);
      assert(axial[0]>=head[2]-surfaceTol&&axial[1]<tip[2],'Wrong finite skirt wall/shaft direction');
      let minR=Infinity,maxR=0;
      for(const id of bore.original_facet_ids)for(const v of facets.get(id)){
        const r=Math.hypot(v[0]-xy[0],v[1]-xy[1]);minR=Math.min(minR,r);maxR=Math.max(maxR,r);
        near(r,1.6,surfaceTol,'Actual finite skirt bore wall radius');
        assert(v[2]>=axial[0]-surfaceTol&&v[2]<=axial[1]+surfaceTol,'Skirt bore escaped original finite wall');
      }
      assert(minR>f.screw.shank_radius_mm,'Source shank exceeds finite skirt bore');
      results.push({key:expected.key,triangles:g.triangles,head_triangles:headTriangles,head_world_mm:head,tip_world_mm:tip,
        bore_radius_range_mm:[minR,maxR],finite_seat_ring_samples:f.tolerances.ring_samples});
    }else{
      assert(expected.key.includes('M3Tnut'),'Unexpected fastener type');
      const nativeFace=g.attributes._SOURCE_FACE;assert(nativeFace&&nativeFace.count===g.attributes.POSITION.count);
      // Retained source mesh coordinates have their own exact radial interval.
      // The original analytic cylinder is a separate native-solid feature.
      let boreVertices=0,minRadius=Infinity,maxRadius=-Infinity;
      for(let i=0;i<nativeFace.count;i++)if(nativeFace.read(i)===f.nut.bore_native_face){
        const q=g.local(i),r=Math.hypot(q[0],q[2]+8);
        minRadius=Math.min(minRadius,r);maxRadius=Math.max(maxRadius,r);boreVertices++;
      }
      assert.equal(boreVertices,f.nut.retained_native_face_mesh_vertices,'Changed original nut bore mesh');
      vectorNear([minRadius,maxRadius],f.nut.retained_native_face_mesh_radius_range_mm,1e-6,'Actual retained native-face tessellation interval');
      assert(minRadius>f.screw.shank_radius_mm,'Retained bore tessellation crosses the source shank');
      const ends=f.nut.bore_axis_points_local_mm.map(q=>mm(world,q));
      for(const q of ends)vectorNear(q.slice(0,2),xy,axisTol,'Installed nut bore coaxial with source skirt/screw');
      assert(ends[1][2]>ends[0][2],'Nut source bore orientation reversed');
      const native=certificate.verification.find(v=>v.instance===expected.bore_index);assert(native);
      for(const key of ['nut_vs_bar_volume_mm3','screw_vs_bar_volume_mm3','screw_vs_nut_volume_mm3'])
        assert(Number.isFinite(native[key])&&native[key]>=0&&native[key]<certificate.common_volume_limit_mm3,'Pinned native solid-common result failed');
      assert(Number.isFinite(native.nut_vs_bar_distance_mm)&&native.nut_vs_bar_distance_mm>=0&&native.nut_vs_bar_distance_mm<certificate.contact_distance_limit_mm);
      assert(native.screw_vs_nut_distance_mm>0,'Native smooth-source bore separation missing');
      results.push({key:expected.key,triangles:g.triangles,bore_vertices:boreVertices,bore_axis_ends_world_mm:ends,
        native_pose_certificate:native,physical_threads_qualified:false});
    }
  }
  assert.equal(results.length,8);budget();
  return {passed:true,instances:8,source_geometry_owners:geometry.size,fixture_sha256:fixtureSHA,
    source_receipts:f.source_receipts,native_selected:certificate.selected,results,
    native_input_hashes:certificate.native_source_inputs,
    maximum_pinned_nut_bar_common_mm3:Math.max(...certificate.verification.map(v=>v.nut_vs_bar_volume_mm3)),
    scope:f.scope,native_certificate_scope:certificate.scope,native_job_rerun:false,physical_threads_qualified:false,
    elapsed_ms:performance.now()-t0};
}

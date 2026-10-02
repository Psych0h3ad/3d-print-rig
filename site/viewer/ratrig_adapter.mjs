import {createRigState,delta,cadToScene} from './ratrig_motion_math.mjs';
export function createRatRigAdapter(root,manifest,profile,routes,THREE){
  if(manifest.machine_id!==profile.machine_id)throw new Error('Machine identity mismatch');
  const records=new Map(manifest.parts.map(p=>[p.key,p])),nodes=new Map(),origins=new Map();
  root.traverse(node=>{const key=node.userData?.part_key;if(records.has(key)){
    if(nodes.has(key))throw new Error('Duplicate CAD part: '+key);
    nodes.set(key,node);origins.set(key,node.position.clone());
    node.traverse(mesh=>{if(mesh.isMesh){mesh.material=mesh.material.clone();if(mesh.material.transparent)mesh.material.depthWrite=false;}});
  }});
  if(nodes.size!==records.size)throw new Error('Missing CAD part nodes');
  const state=createRigState(profile,routes),dynamic=new THREE.Group();dynamic.name='RatRig_Dynamic_Routes';root.add(dynamic);
  let flexibleVisible=true,enclosureVisible=true;
  let palette={...profile.appearance.palette_defaults};
  function validatePalette(p){if(!p||Object.entries(p).some(([k,v])=>!['base','accent','frame'].includes(k)||typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))throw new RangeError('Invalid appearance palette');}
  function setPalette(p){validatePalette(p);palette={...palette,...p};for(const [key,node]of nodes){const role=records.get(key).appearance_role;if(!p[role])continue;node.traverse(mesh=>{if(mesh.isMesh)mesh.material.color.set(p[role]);});}}
  function snapshot(){return {...state.getSnapshot(),appearance:{palette:{...palette},flexible_visible:flexibleVisible,enclosure_visible:enclosureVisible}};}
  const yAxis=new THREE.Vector3(0,1,0);
  const beltMeshes=routes.belts.map((_,i)=>{const mesh=new THREE.Mesh(undefined,new THREE.MeshStandardMaterial({color:0x171819,roughness:.82}));mesh.name='dynamic_belt_'+i;dynamic.add(mesh);return mesh;});
  const tubeMeshes=routes.tubes.map((t,i)=>{const mesh=new THREE.Mesh(undefined,new THREE.MeshStandardMaterial({color:t.name.includes('PTFE')?0xe7e8db:t.name==='bed_heater'?0xc06f31:t.name==='vaoc_harness'?0x396ea0:0x27282b,roughness:.7}));mesh.name='dynamic_tube_'+i;dynamic.add(mesh);return mesh;});
  const lamps=[];
  for(const channel of ['chamber','vaoc'])for(const key of profile.lights[channel].keys){
    const rec=records.get(key),lamp=new THREE.PointLight(0xfff6de,0,channel==='chamber'?.8:.2,2);lamp.userData.channel=channel;lamp.userData.part_key=key;
    lamp.userData.anchor_mm=rec.bounds_mm[0].map((v,i)=>(v+rec.bounds_mm[1][i])/2);root.add(lamp);lamps.push(lamp);
  }
  function beltMesh(data){
    const shapes=data.rings.map(r=>r.map(p=>new THREE.Vector2(p[0],p[1])));
    const shape=new THREE.Shape(shapes[0]);for(const ring of shapes.slice(1))shape.holes.push(new THREE.Path(ring));
    const g=new THREE.ExtrudeGeometry(shape,{depth:data.z_max_mm-data.z_min_mm,bevelEnabled:false,steps:1});
    const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const p=cadToScene([pos.getX(i),pos.getY(i),pos.getZ(i)+data.z_min_mm]);pos.setXYZ(i,...p);}
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
  function tubeMesh(data){
    // Piecewise linear CAD-space samples are already smooth centreline samples.
    const pts=data.points_mm.map(p=>new THREE.Vector3(...cadToScene(p)));
    const curve=new THREE.CurvePath();for(let i=1;i<pts.length;i++)curve.add(new THREE.LineCurve3(pts[i-1],pts[i]));
    const g=new THREE.TubeGeometry(curve,Math.max(80,pts.length*2),data.radius_mm*.001,8,false);g.computeBoundingBox();return g;
  }
  function applyLights(){
    const snap=state.getSnapshot();
    for(const lamp of lamps){
      const channel=lamp.userData.channel,key=lamp.userData.part_key,value=snap.lights[channel],rec=records.get(key);
      lamp.position.set(...cadToScene(lamp.userData.anchor_mm.map((x,i)=>x+delta(profile,snap.pose,rec.motion)[i])));lamp.intensity=value*(channel==='chamber'?1.8:.04);
      nodes.get(key).traverse(mesh=>{if(mesh.isMesh){mesh.material.emissive.set(0xfff3cf);mesh.material.emissiveIntensity=value*.75;}});
    }
  }
  function apply(){
    const snap=state.getSnapshot(),g=state.getGeometry();
    for(const [key,node]of nodes){const rec=records.get(key),d=cadToScene(delta(profile,snap.pose,rec.motion)),base=origins.get(key);
      node.position.set(base.x+d[0],base.y+d[1],base.z+d[2]);
      if(rec.rotation){
        const pivot=new THREE.Vector3(...cadToScene(rec.rotation.pivot_mm)),angle=(snap.pose.z-profile.reference_pose.z)*2*Math.PI/rec.rotation.pitch_mm;
        node.quaternion.setFromAxisAngle(yAxis,angle);
        const correction=pivot.clone().sub(pivot.clone().applyQuaternion(node.quaternion));node.position.add(correction);
      }
      node.visible=['flex_reference','source_reference'].includes(rec.motion)?false:!rec.source_path[1].startsWith('Panel Assembly')||enclosureVisible;
    }
    g.belts.forEach((b,i)=>{beltMeshes[i].geometry.dispose();beltMeshes[i].geometry=beltMesh(b);});
    g.tubes.forEach((t,i)=>{tubeMeshes[i].geometry.dispose();tubeMeshes[i].geometry=tubeMesh(t);});
    dynamic.visible=flexibleVisible;applyLights();root.updateMatrixWorld(true);
    return {...snap,flexible_visible_count:flexibleVisible?beltMeshes.length+tubeMeshes.length:0};
  }
  setPalette(palette);apply();
  return {nodes,records,state,dynamic,lamps,beltMeshes,tubeMeshes,
    setPose(pose){state.setPose(pose);return apply();},setMode(mode,options){state.setMode(mode,options);return apply();},
    setLight(channel,value){state.setLight(channel,value);applyLights();return state.getSnapshot();},
    restore(saved){const a=saved.appearance;if(a){validatePalette(a.palette);if(typeof a.flexible_visible!=='boolean'||typeof a.enclosure_visible!=='boolean')throw new RangeError('Invalid saved visibility');}state.restore(saved);if(a){setPalette(a.palette);flexibleVisible=a.flexible_visible;enclosureVisible=a.enclosure_visible;}apply();return snapshot();},getSnapshot:snapshot,
    setFlexibleVisible(value){flexibleVisible=Boolean(value);dynamic.visible=flexibleVisible;},
    setEnclosureVisible(value){enclosureVisible=Boolean(value);for(const [key,node]of nodes)if(records.get(key).source_path[1].startsWith('Panel Assembly'))node.visible=enclosureVisible;},
    setPalette,
    getSummary:()=>({machine_id:profile.machine_id,part_count:nodes.size,dynamic_belt_count:beltMeshes.length,dynamic_tube_count:tubeMeshes.length,light_count:lamps.length,firmware_emulation:false}),
    dispose(){dynamic.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});for(const lamp of lamps)lamp.removeFromParent();dynamic.removeFromParent();}
  };
}

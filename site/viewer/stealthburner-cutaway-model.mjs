import * as THREE from 'three';
import {cutawaySource,nativeToDisplay} from './stealthburner-cutaway-source.mjs';
import {sectionFraction} from './stealthburner-lesson.mjs';
import {sourceNozzleGeometry} from './stealthburner-nozzle-source.mjs';

const materials = mesh => [].concat(mesh.material);
export function createCutawayAssembly(assets,{source=cutawaySource,nozzle}={}) {
  const root=new THREE.Group(),cut=new THREE.Plane(new THREE.Vector3(1,0,0),0),rows=new Map(),caps=[];
  root.name='Stealthburner_CW2_V6_cutaway';
  const origin=new THREE.Vector3(...nativeToDisplay(source.nozzle_mm));
  let replacedNozzles=0;
  for(const {gltf,meta,spec}of assets){
    if(meta.id!==spec.id||meta.parts.length!==spec.parts)throw Error('Cutaway source manifest mismatch');
    const identities=new Map(meta.parts.map(p=>[String(p.key),p]));
    if(identities.size!==spec.parts)throw Error('Duplicate cutaway part identity');
    gltf.scene.updateMatrixWorld(true);
    const seen=new Set();
    gltf.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const key=mesh.userData.part_key||mesh.name.match(/^P([^_]+)__/u)?.[1]||mesh.name;
      const part=identities.get(key);if(!part)throw Error('Unregistered cutaway mesh: '+key);
      if(source.nozzle_mesh&&key==='sb_v6_hot_83'){
        if(!nozzle||spec.id!=='sb_v6'||replacedNozzles++)throw Error('Missing or duplicate original nozzle surface');
        const previous=mesh.geometry;
        mesh.geometry=sourceNozzleGeometry(nozzle,mesh,source.nozzle_mesh);
        previous.dispose();
      }
      seen.add(key);mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
      const entries=materials(mesh).map(m=>({material:m,color:m.color.clone(),emissive:m.emissive?.clone(),intensity:m.emissiveIntensity,
        side:m.side,clip:m.clippingPlanes}));
      for(const m of materials(mesh)){m.clippingPlanes=[cut];m.clipShadows=true;m.side=THREE.DoubleSide;}
      mesh.renderOrder=100;
      if(!rows.has(key))rows.set(key,{key,part,meshes:[],entries:[]});
      rows.get(key).meshes.push(mesh);rows.get(key).entries.push(...entries);
    });
    if(seen.size!==identities.size)throw Error('Missing exported cutaway part');
    gltf.scene.position.sub(origin);root.add(gltf.scene);
  }
  if(source.nozzle_mesh&&replacedNozzles!==1)throw Error('Missing original CAD nozzle');
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root);
  // Stencil caps use original surfaces on BOTH sides. Bores, cavities and
  // fin gaps stay open; no bounding-box fill or substitute hotend solid.
  const stencilRoot=new THREE.Group();root.add(stencilRoot);
  let order=1;
  for(const key of source.cap_keys){
    const row=rows.get(key);if(!row)throw Error('Missing cutaway cap source '+key);
    const b=new THREE.Box3();row.meshes.forEach(m=>b.expandByObject(m));
    if(b.min.x>0||b.max.x<0)continue;
    const size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
    const group=new THREE.Group();stencilRoot.add(group);
    for(const original of row.meshes){
      for(const [side,operation]of [[THREE.BackSide,THREE.IncrementWrapStencilOp],[THREE.FrontSide,THREE.DecrementWrapStencilOp]]){
        const material=new THREE.MeshBasicMaterial({side,colorWrite:false,depthWrite:false,depthTest:false,
          clippingPlanes:[cut],stencilWrite:true,stencilFunc:THREE.AlwaysStencilFunc,
          stencilFail:operation,stencilZFail:operation,stencilZPass:operation});
        const stencil=new THREE.Mesh(original.geometry,material);stencil.matrixAutoUpdate=false;
        stencil.matrix.copy(original.matrixWorld);stencil.renderOrder=order;group.add(stencil);
      }
    }
    const capMaterial=row.entries[0].material.clone();
    Object.assign(capMaterial,{clippingPlanes:null,side:THREE.DoubleSide,
      stencilWrite:true,stencilRef:0,stencilFunc:THREE.NotEqualStencilFunc,
      stencilFail:THREE.ReplaceStencilOp,stencilZFail:THREE.ReplaceStencilOp,stencilZPass:THREE.ReplaceStencilOp});
    const cap=new THREE.Mesh(new THREE.PlaneGeometry(size.z+.002,size.y+.002),capMaterial);
    cap.rotation.y=-Math.PI/2;cap.position.set(0,center.y,center.z);cap.renderOrder=order+1;
    cap.onAfterRender=renderer=>renderer.clearStencil();group.add(cap);
    caps.push({key,group,cap,originalColor:capMaterial.color.clone()});order+=2;
  }
  let section=100,thermal=true;
  function setSection(value){
    section=sectionFraction(value)*100;
    // 0 = complete original model; 100 = plane THROUGH the filament axis.
    const x=THREE.MathUtils.lerp(box.min.x-.001,0,section/100);cut.constant=x===0?0:-x;
    for(const {group,cap}of caps){group.visible=section>0;cap.position.x=x;}
    return x;
  }
  function colorFor(key,state){
    const gain=source.hot_keys.includes(key)?state.hot:key===source.heatbreak_key?state.break:key===source.sink_key?state.sink:0;
    return {gain,color:new THREE.Color().lerpColors(new THREE.Color('#4fb6c8'),new THREE.Color('#ed5734'),gain)};
  }
  function update(state,{heatColors=thermal}={}){
    thermal=heatColors;
    for(const [key,row]of rows){
      const active=heatColors&&(source.hot_keys.includes(key)||[source.heatbreak_key,source.sink_key].includes(key));
      const heat=colorFor(key,state);
      for(const entry of row.entries){const m=entry.material;
        m.color.copy(entry.color);m.emissive?.copy(entry.emissive);m.emissiveIntensity=entry.intensity;
        if(active){m.color.lerp(heat.color,.8);m.emissive.copy(heat.color);m.emissiveIntensity=heat.gain*.42;}
      }
      for(const cap of caps.filter(c=>c.key===key)){
        cap.cap.material.color.copy(cap.originalColor);cap.cap.material.emissive.set(0);cap.cap.material.emissiveIntensity=0;
        if(active){cap.cap.material.color.lerp(heat.color,.8);cap.cap.material.emissive.copy(heat.color);cap.cap.material.emissiveIntensity=heat.gain*.42;}
      }
    }
  }
  function reset(){setSection(100);update({hot:0,break:0,sink:0},{heatColors:false});}
  function restore(){
    for(const row of rows.values())for(const entry of row.entries){const m=entry.material;m.color.copy(entry.color);m.emissive?.copy(entry.emissive);m.emissiveIntensity=entry.intensity;m.side=entry.side;m.clippingPlanes=entry.clip;}
    for(const {group}of caps)group.visible=false;
  }
  setSection(100);
  return {root,rows,caps,cut,box,origin,setSection,update,reset,restore,
    point:point=>new THREE.Vector3(...nativeToDisplay(point)).sub(origin),
    partBox:key=>{const row=rows.get(key);if(!row)throw Error('Missing part '+key);const b=new THREE.Box3();row.meshes.forEach(m=>b.expandByObject(m));return b},
  };
}

// Radius samples follow the actual nozzle/heatbreak bore. The colored core is
// illustrative filament, never replacement hardware or a melt-flow prediction.
export function filamentMeltProfile(assembly,{samples=48}={}){
  const nozzle=assembly.partBox('sb_v6_hot_83'),end=assembly.point([0,-28.76,330]).y;
  const ray=new THREE.Raycaster(),points=[];
  for(let i=0;i<=samples;i++){
    const y=THREE.MathUtils.lerp(nozzle.min.y+.0000001,end,i/samples);
    const key=y<=nozzle.max.y?'sb_v6_hot_83':cutawaySource.heatbreak_key;
    ray.set(new THREE.Vector3(0,y,0),new THREE.Vector3(1,0,0));
    const hit=ray.intersectObjects(assembly.rows.get(key).meshes,false)[0];
    if(!hit||!Number.isFinite(hit.distance)||hit.distance<=0)throw Error('Missing source filament bore '+key);
    points.push([Math.min(.000875,hit.distance*.96),y]);
  }
  return points;
}

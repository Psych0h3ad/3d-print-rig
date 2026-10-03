import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {loadModel} from './model-loader.js?v=trident-clearance-35';
import {partKey} from './head-assembly.js?v=trident-clearance-35';
import {appearanceRole} from './appearance-role.mjs?v=trident-clearance-35';
import {withMonolithMachines,monolithPartDelta} from './monolith-machine-model.mjs?v=sphinx-report-45';
import {monolithBeltRoute,monolithBeltGeometry,monolithBeltTravelLimits} from './monolith-belts.mjs?v=trident-clearance-35';

const point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
let machineData;
export async function loadMonolithData(){
 machineData||=Promise.all(['GANTRY_CONFIGURATIONS.json','MONOLITH_MACHINE_REGISTRATIONS.json','MONOLITH_BELT_ROUTES.json'].map(async name=>{
  const response=await fetch('../'+name,{cache:'no-cache'});if(!response.ok)throw Error('Monolithの機体データを取得できません');return response.json();
 })).catch(error=>{machineData=null;throw error});
 return machineData;
}
export async function loadMonolithMachines(catalog,headData){
 let data;try{data=await loadMonolithData()}catch(error){return {...catalog,monolith_unavailable:error.message}}
 const [gantries,registrations,routes]=data,result=withMonolithMachines(catalog,headData.heads,headData.registry,gantries,registrations);
 if(result.monolith){
  result.monolith.belt_routes=routes;
  for(const variant of result.variants.filter(v=>v.machine_gantry)){
   const g=variant.machine_gantry,sources=g.modules.filter(id=>id.startsWith('monolith_belts_')).flatMap(id=>routes.routes[id.replace(/_(250|300|350)$/,'')]||[]);
   if(!sources.length)throw Error('Monolithのベルト経路が未登録です');
   const belt=monolithBeltTravelLimits(sources,g.size_mm,variant.fit?.machine_mount?.belt_preview_cut);
   for(const key of ['x_delta_limits_mm','y_delta_limits_mm']){
    const guide=g[key]||[-Infinity,Infinity];g[key]=[Math.max(guide[0],belt[key][0]),Math.min(guide[1],belt[key][1])];
    if(!g[key].every(Number.isFinite)||g[key][0]>g[key][1])throw Error('Monolithのベルト可動範囲が不正です');
   }
  }
 }
 return result;
}

export function createMonolithGantry(scene,catalog){
 const root=new THREE.Group();root.name='Installed_Monolith_Gantry';root.visible=false;scene.add(root);
 const cache=new Map();let active=null,delta=[0,0,0],belts=[],palette={},flexibleVisible=true;
 async function asset(id){
  if(cache.has(id))return cache.get(id);
  const spec=catalog.assets[id];if(!spec)throw Error('未登録のMonolith部品：'+id);
  const promise=Promise.all([fetch('../'+spec.meta,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error(spec.meta);return r.json()}),loadModel(new GLTFLoader(),'../'+spec.glb)]).then(([meta,g])=>{
   const rows=new Map(meta.parts.map(p=>[String(p.key),p])),entries=[];g.scene.visible=false;
   g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const row=rows.get(String(partKey(mesh)));if(!row)throw Error('Monolithの部品対応が不正です');
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of materials){m.side=THREE.DoubleSide;if(m.transparent)m.depthWrite=false}
    entries.push({mesh,row,origin:mesh.position.clone(),role:appearanceRole(row),materials,colors:materials.map(m=>m.color.clone())});
   });root.add(g.scene);promise.loaded={id,root:g.scene,entries};return promise.loaded;
  }).catch(e=>{cache.delete(id);throw e});cache.set(id,promise);return promise;
 }
 function setPalette(value){palette={...palette,...value};for(const p of cache.values())for(const e of p.loaded?.entries||[])for(const [i,m] of e.materials.entries()){if(palette[e.role])m.color.set(palette[e.role]);else m.color.copy(e.colors[i]);if(['base','accent'].includes(e.role)){m.metalness=0;m.roughness=.58}}}
 function setFlexibleVisible(value){flexibleVisible=Boolean(value);for(const b of belts)b.mesh.visible=flexibleVisible}
 function setDelta(value){
  delta=[...value];if(!active)return;
  const g=active.machine_gantry;root.position.copy(point(g.translation_mm));
  for(const id of g.modules){const a=cache.get(id)?.loaded;if(!a)continue;
   for(const e of a.entries){const motion=monolithPartDelta(id,e.row,delta,g.family),offset=g.part_offsets_mm?.[e.row.key]||[0,0,0];e.mesh.position.copy(e.origin).add(point(motion.map((v,i)=>v+offset[i])))}
  }
  for(const b of belts){
   if(b.dx!==delta[0]||b.dy!==delta[1]){b.route=monolithBeltRoute(b.source,g.size_mm,delta[0],delta[1],active.fit?.machine_mount?.belt_preview_cut);const geometry=monolithBeltGeometry(b.route);b.mesh.geometry.dispose();b.mesh.geometry=geometry;b.dx=delta[0];b.dy=delta[1]}
   b.mesh.position.copy(point([0,0,g.family==='V2'?delta[2]:0]));
  }
  root.updateMatrixWorld(true);
 }
 async function install(variant){
  const g=variant?.machine_gantry;
  if(!g){active=null;root.visible=false;return}
  const ids=g.modules.filter(id=>!id.startsWith('monolith_belts_'));
  await Promise.all(ids.map(asset));
  const next=[];
  for(const id of g.modules.filter(id=>id.startsWith('monolith_belts_'))){
   const sources=catalog.monolith?.belt_routes.routes[id.replace(/_(250|300|350)$/,'')];if(!sources)throw Error('Monolithのベルト経路が未登録です');
   for(const source of sources){const route=monolithBeltRoute(source,g.size_mm,delta[0],delta[1],variant.fit?.machine_mount?.belt_preview_cut),mesh=new THREE.Mesh(monolithBeltGeometry(route),new THREE.MeshStandardMaterial({color:'#111419',roughness:.85,side:THREE.DoubleSide}));mesh.name=id+'_'+source.source_key;mesh.visible=flexibleVisible;next.push({mesh,route,source,dx:delta[0],dy:delta[1]})}
  }
  for(const b of belts){root.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose()}belts=next;root.add(...belts.map(b=>b.mesh));
  const hidden=new Set(g.hidden_module_keys||[]);
  for(const p of cache.values())if(p.loaded){const a=p.loaded;a.root.visible=ids.includes(a.id);for(const e of a.entries)e.mesh.visible=!hidden.has(e.row.key)}
  active=variant;root.visible=true;setPalette(palette);setDelta(delta);
 }
 return {root,cache,install,setDelta,setPalette,setFlexibleVisible,get active(){return active},get belts(){return belts}};
}

export function stockGantryVisibility(nodes){
 let previous=new Map(),keys=[];
 return {
  install(variant){for(const [key,visible] of previous){const node=nodes.get(key);if(node)node.visible=visible}keys=variant?.machine_gantry?.stock_hidden_keys||[];previous=new Map(keys.filter(key=>nodes.has(key)).map(key=>[key,nodes.get(key).visible]));this.update()},
  update(){for(const key of keys){const node=nodes.get(key);if(node)node.visible=false}},
 };
}

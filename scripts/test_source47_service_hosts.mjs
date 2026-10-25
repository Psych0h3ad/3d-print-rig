import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as THREE from '../site/viewer/vendor/three.module.js';
register('./three-test-loader.mjs',import.meta.url);
const {createSourceServiceRoutes}=await import('../site/viewer/source47/source-service-routes.mjs');
const input=JSON.parse(fs.readFileSync(new URL('../site/viewer/source47/data/SOURCE_SERVICE_ROUTE_BINDINGS.json',import.meta.url)));
export function exerciseServiceHosts(create,stock,head,model){
 const service=create({model,meshes:stock,input,getHead:()=>head}),sourcePoint=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000),origins=head.entries.map(e=>e.mesh.matrix.clone());
 const snapshots=[];
 for(const delta of [[0,0,0],[.04,.02,-.03],[-.015,.05,.06],[0,0,0]]){
  for(const [i,e]of head.entries.entries()){e.mesh.matrixAutoUpdate=false;e.mesh.matrix.copy(origins[i]);e.mesh.matrix.elements[12]+=delta[0];e.mesh.matrix.elements[13]+=delta[1];e.mesh.matrix.elements[14]+=delta[2];}
  model.updateMatrixWorld(true);const diagnostics=service.update(true);assert(diagnostics.service_route_endpoint_max_error_mm<.001);
  for(const row of service.definitions){const binding=row.bindings[0],mesh=head.entries.find(e=>String(e.key)===binding.host).mesh;
   const expected=sourcePoint(binding.point_CAD_mm).applyMatrix4(binding.inverse).applyMatrix4(mesh.matrixWorld);assert(row.world[0].distanceTo(expected)<1e-10,'Service endpoint used stale removed-stock head instead of retained installed head');
   assert(row.mesh.geometry.attributes.position.array.every(Number.isFinite));assert(row.mesh.geometry.attributes.normal.array.every(Number.isFinite));}
  snapshots.push(service.definitions.map(r=>Array.from(r.mesh.geometry.attributes.position.array)));
  service.update(false);assert.deepEqual(service.visibility(),{PTFE:false,CAN:false});service.update(true);
 }
 assert.deepEqual(snapshots.at(-1),snapshots[0],'A-to-B-to-A host movement must restore route bytes');service.deactivate();return {source_hosts:['578','556'],poses:4,reset_geometry_exact:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
const model=new THREE.Group(),stock=[];
for(const key of [...Object.keys(input.source_reference_matrices),'PTFE_tube','CAN_cable']){
 // Identity-only transform fixtures, deliberately no substitute hardware solids.
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());mesh.userData.originalKey=key;model.add(mesh);stock.push(mesh);
}
const head={entries:['556','578'].map(key=>{const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());model.add(mesh);return {key,mesh}})};
assert(exerciseServiceHosts(createSourceServiceRoutes,stock,head,model));
const source=fs.readFileSync(new URL('../site/viewer/source47/source-service-routes.mjs',import.meta.url),'utf8');
const broken=source.replace(/const host=key=>[^\n]+/,"const host=key=>stock.get(key)||getHead()?.entries.find(e=>String(e.key)===key)?.mesh;");assert.notEqual(broken,source);
const old=await import('data:text/javascript;base64,'+Buffer.from(broken).toString('base64'));
assert.throws(()=>exerciseServiceHosts(old.createSourceServiceRoutes,stock,head,model),/stale removed-stock/);
console.log('Source47 installed CW2 PTFE/CAN host precedence, reverse movement/reset, toggles and stale-stock negative control passed. Transform fixtures only; full curve/body fit remains open.');
}

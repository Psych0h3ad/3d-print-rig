// Narrow actual-asset regression for installed/removed-stock host precedence.
// This deliberately does not pass the unresolved source47 whole-curve clearance.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {register} from 'node:module';
import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {exerciseServiceHosts} from './test_source47_service_hosts.mjs';
register('./three-test-loader.mjs',import.meta.url);
const {GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
const {createSourceServiceRoutes}=await import('../site/viewer/source47/source-service-routes.mjs');
const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v.slice(2),a[i+1]]],[]));
assert(args.site&&args.bindings&&args.report);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p)),map=read(args.bindings),approved=read(path.join(args.site,'APPROVED_DELIVERY.json'));
const pins={},approvedPin=name=>Array.isArray(approved.files)?approved.files.find(r=>r.path===name):approved.files[name];
async function model(name,pin,catalog){
 const row=map.find(r=>r.path===name&&r.sha256===pin.sha256&&r.catalog===catalog);assert(row,'Missing current pinned explicit asset '+name);
 let raw=fs.readFileSync(row.actual_path);assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);
 let decoded=name.endsWith('.gz')?gunzipSync(raw):raw;raw=null;const decodedHash=hash(decoded);if(pin.decoded_sha256)assert.equal(decodedHash,pin.decoded_sha256);
 pins[name]={actual_path:row.actual_path,sha256:pin.sha256,decoded_sha256:decodedHash,bytes:pin.bytes};
 const root=(await new GLTFLoader().parseAsync(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength),'')).scene;decoded=null;global.gc?.();return root;
}
const sourceFile=new URL('../site/viewer/source47/source-service-routes.mjs',import.meta.url),beforeHash=hash(fs.readFileSync(sourceFile));
const stockRoot=await model('SIBOOR_Trident_350.glb.gz',approvedPin('SIBOOR_Trident_350.glb.gz'),'APPROVED_DELIVERY.json');
const heads=read(path.join(args.site,'TOOLHEAD_CONFIGURATIONS.json')),headPath='ace_hf_source40_8c7810f878cb/model.glb.gz';
function findPin(value){if(!value||typeof value!=='object')return null;if(value.path===headPath&&value.sha256)return value;for(const v of Object.values(value)){const found=findPin(v);if(found)return found;}return null;}
const headPin=findPin(heads);assert(headPin,'Missing actual source40 catalog transport');const source40Root=await model(headPath,headPin,'TOOLHEAD_CONFIGURATIONS.json');
const basePath=heads.base_assets.stealthburner.glb+'.gz',headRoot=await model(basePath,approvedPin(basePath),'APPROVED_DELIVERY.json');
assert.equal(pins[headPath].decoded_sha256,'8c7810f878cb6e2e954cec6544fb6bdb20e54aa8d2e206beda4948c56f7197e9');
const modelRoot=new THREE.Group();modelRoot.add(stockRoot,headRoot,source40Root);const meshes=[],entries=[];
stockRoot.traverse(o=>{if(o.isMesh){const key=String(o.userData.part_key||o.name.slice(1).split('__')[0]);o.userData.originalKey=key;meshes.push(o);}});
headRoot.traverse(o=>{if(o.isMesh){const key=String(o.userData.part_key||o.userData.originalKey||o.name.slice(1).split('__')[0]);entries.push({key,mesh:o});}});
for(const key of ['556','578']){assert(meshes.some(m=>m.userData.originalKey===key),'Missing actual stock CW2 leaf '+key);assert(entries.some(e=>e.key===key),'Missing actual retained source40 CW2 leaf '+key);}
modelRoot.updateMatrixWorld(true);const result=exerciseServiceHosts(createSourceServiceRoutes,meshes,{entries},modelRoot);
const source=fs.readFileSync(sourceFile,'utf8'),broken=source.replace(/const host=key=>[^\n]+/,"const host=key=>stock.get(key)||getHead()?.entries.find(e=>String(e.key)===key)?.mesh;");assert.notEqual(broken,source);
const old=await import('data:text/javascript;base64,'+Buffer.from(broken).toString('base64'));assert.throws(()=>exerciseServiceHosts(old.createSourceServiceRoutes,meshes,{entries},modelRoot),/stale removed-stock/);
assert.equal(hash(fs.readFileSync(sourceFile)),beforeHash,'Service route source changed during actual audit');
const report={schema:'source47-actual-cw2-service-host-regression-v1',passed:true,inputs:pins,source_sha256:beforeHash,actual_stock_meshes:meshes.length,actual_retained_CW2_base_meshes:entries.length,...result,negative_control_rejected:true,
 scope:'Checksum-pinned SIBOOR350, retained CW2 base, and source40 transport; actual base 556/578 meshes, same-key stale-stock negative control, four installed-host transform poses, exact A-B-A route bytes, visibility toggles and finite positions/normals. This is a host attachment regression, not a full source40 composition test. Whole-curve bend, service length, source guide axes and body/native-solid clearance remain OPEN.',native_solid_clearance_verified:false,browser_review:false};
fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

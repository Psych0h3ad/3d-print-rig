// Production renderer and real GLBs. This tests relative motion, palette and
// switching; native machine mounting datums are verified separately.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {monolithHeadCatalog} from '../site/viewer/monolith-head-model.mjs';
const [base,overlay,report,native]=process.argv.slice(2).map(p=>path.resolve(p));
async function bytes(file){for(const root of [native,overlay,base].filter(Boolean)){try{return await fs.readFile(path.join(root,file))}catch{}if(file.endsWith('.glb.gz'))try{return gzipSync(await fs.readFile(path.join(root,file.slice(0,-3))))}catch{}}throw Error('Missing asset '+file)}
const read=async file=>JSON.parse(await bytes(file));
globalThis.location={href:'https://assets.test/viewer/'};
globalThis.fetch=async input=>{
 let file=String(input).split('?')[0];if(file.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});
 file=file.startsWith('http')?new URL(file).pathname.slice(1):file.replace(/^\.\.\//,'');
 try{return new Response(await bytes(file))}catch{return new Response('',{status:404})}
};
const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
const {stockGantryVisibility}=await import('../site/viewer/monolith-machine.js');
const data=await loadMachineHeadCatalog(),gantries=await read('GANTRY_CONFIGURATIONS.json');
const catalog=monolithHeadCatalog(data.heads,data.registry,gantries);catalog.assets={...catalog.assets,...gantries.assets};catalog.monolith={belt_routes:await read('MONOLITH_BELT_ROUTES.json')};
const scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog);
let installs=0,positions=0,protectedColors=0,painted=0,pulleyAxes=0,maxPulleyAxisErrorMm=0;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const g of gantries.variants){
 const hardware=(await Promise.all(g.modules.filter(id=>!id.startsWith('monolith_belts_')).map(async id=>(await read(catalog.assets[id].meta)).parts.filter(p=>/bearing|pulley/i.test(p.name))))).flat();
 for(const mount of ['fixed','stealthchanger']){
  const original=catalog.variants.find(v=>v.gantry===g.id&&v.mount===mount);assert(original);
  const v={...original,machine_gantry:{id:g.id,modules:g.modules,family:g.machine,size_mm:g.size_mm,translation_mm:[0,0,0]}};
  rig.setDelta([0,0,0]);await rig.install(v);assert(rig.gantry.root.visible);installs++;
  if(mount==='fixed')for(const b of rig.gantry.belts)for(const segment of b.route.segments.filter(s=>s.kind==='circle')){
   const axes=hardware.filter(p=>p.bounds_mm[0][2]<b.source.z+.6&&p.bounds_mm[1][2]>b.source.z-.6).map(p=>p.bounds_mm[0].map((n,i)=>(n+p.bounds_mm[1][i])/2));
   const error=Math.min(...axes.map(p=>Math.hypot(p[0]-segment.center[0],p[1]-segment.center[1])));
   // Symmetric exported pulley/bearing envelopes locate the real CAD axes.
   // Check the rest pose: setDelta below separately checks moving hardware.
   assert(error<.002,g.id+' pulley axis '+error);maxPulleyAxisErrorMm=Math.max(maxPulleyAxisErrorMm,error);pulleyAxes++;
  }
  for(const delta of [[0,0,0],[-g.size_mm/2,-g.size_mm/2,25],[g.size_mm/2,g.size_mm/2,100],[12,-24,0]]){
   rig.setDelta(delta);
   for(const [id,promise] of rig.gantry.cache){const a=promise.loaded;if(!a?.root.visible)continue;assert(g.modules.includes(id));
    for(const e of a.entries){
     const x=id.startsWith('monolith_x_frame_')&&e.row.name==='_MGN12H',y=id.startsWith('monolith_x_')||id.startsWith('monolith_y_frame_')&&e.row.name==='_MGN9H';
     near(e.mesh.position.x-e.origin.x,x?delta[0]/1000:0);near(e.mesh.position.z-e.origin.z,y?-delta[1]/1000:0);near(e.mesh.position.y-e.origin.y,g.machine==='V2'?delta[2]/1000:0);positions++;
    }
   }
   assert.equal(rig.gantry.belts.length,2);for(const b of rig.gantry.belts){assert(b.mesh.geometry.attributes.position.array.every(Number.isFinite));near(b.mesh.position.y,g.machine==='V2'?delta[2]/1000:0)}
  }
  rig.gantry.setFlexibleVisible(false);assert(rig.gantry.belts.every(b=>!b.mesh.visible));rig.gantry.setFlexibleVisible(true);assert(rig.gantry.belts.every(b=>b.mesh.visible));
  const palette={base:'#123456',accent:'#fedcba',frame:'#778899'};rig.setPalette(palette);
  for(const p of rig.gantry.cache.values())for(const e of p.loaded?.entries||[])for(const [i,m] of e.materials.entries())if(palette[e.role]){assert.equal('#'+m.color.getHexString(),palette[e.role]);painted++}else{assert(m.color.equals(e.colors[i]));protectedColors++}
  await rig.install(null);assert.equal(rig.gantry.root.visible,false);assert.equal(rig.gantry.active,null);
 }
 console.log(g.id+' fixed/SC, motion, palette and removal passed');
}
const old=new Map([['beam',{visible:true}],['frame',{visible:true}],['hidden',{visible:false}]]),visibility=stockGantryVisibility(old);
visibility.install({machine_gantry:{stock_hidden_keys:['beam','hidden']}});assert.equal(old.get('beam').visible,false);old.get('beam').visible=true;visibility.update();assert.equal(old.get('beam').visible,false);visibility.install(null);assert.equal(old.get('beam').visible,true);assert.equal(old.get('hidden').visible,false);assert.equal(old.get('frame').visible,true);
const result={gantries:gantries.variants.length,installs,positions,painted,protectedColors,pulleyAxes,maxPulleyAxisErrorMm,mountingDatumsVerified:false,passed:true};await fs.writeFile(report,JSON.stringify(result,null,2));console.log(JSON.stringify(result));

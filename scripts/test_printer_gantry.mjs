import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {withPrinterGantry,createPrinterBelts} from '../site/viewer/printer-gantry.mjs';

// The extra-extruder rows shipped without the R2 module or CNC removals.
const kit={id:'kit',gantry:'siboor_awd',toolhead:'stealthburner',hotend:'uhf',extruder:'cw2',probe:'none',removed_stock_keys:['shared-head'],modules:[]};
const base={...kit,id:'r2',gantry:'trident_r2',removed_stock_keys:['shared-head','cnc-motor','stock-belt'],modules:[{id:'trident_r2_gantry_350',translation_mm:[0,0,0]},{id:'carriage'}]};
const galileo={...base,id:'galileo',extruder:'galileo2',removed_stock_keys:['old-extruder'],modules:[{id:'galileo'}]};
const catalog={gantries:[{id:'siboor_awd'},{id:'trident_r2'}],variants:[kit,base,galileo]};
const snapshot=JSON.stringify(catalog),fixed=withPrinterGantry(catalog),repaired=fixed.variants[2];
assert.deepEqual(repaired.modules.map(m=>m.id),['trident_r2_gantry_350','galileo']);
assert.deepEqual(repaired.removed_stock_keys,['old-extruder','cnc-motor','stock-belt']);
assert.equal(JSON.stringify(catalog),snapshot,'Repair must not alter the source catalog');
assert.deepEqual(withPrinterGantry(fixed),fixed,'A second expansion must not duplicate the gantry');
assert.equal(withPrinterGantry({...catalog,gantries:[{id:'trident_r2'}]}).variants,catalog.variants,'Native Trident catalogs own their separate gantry loader');

const geometry=()=>new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.226,.36,0,0,.36,0,.226,.36,.2],3));
const mesh=key=>{const m=new THREE.Mesh(geometry(),new THREE.MeshStandardMaterial());m.userData.partKey=key;return m};
const stock=['580','Upper_Belt'].map(mesh),parts=new Map(stock.map(m=>[m.userData.partKey,m]));
const belts=createPrinterBelts(parts),r2=['A_Belt','B_Belt'].map(mesh);
for(const m of r2)assert(belts.register(m,{name:m.userData.partKey,flex_belt:true}),'Manifest-only belt flag must work when GLB extras are absent');
assert.equal(belts.register(mesh('bolt'),{name:'bolt'}),false);
const references=r2.map(m=>m.geometry.attributes.position.array.slice());

// Execute the real flexible renderer with the repository's Three runtime.
const source=(await readFile(new URL('../site/viewer/flexible.js',import.meta.url),'utf8')).replace("from 'three'",`from '${new URL('../site/viewer/vendor/three.module.js',import.meta.url).href}'`);
const {setupFlexible,chainRoute}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const route=chainRoute([60,0,400],[180,50,400],460,10);assert(route);
const links=route.points.map((_,i)=>mesh('chain_'+String(i).padStart(2,'0'))),tubes=['PTFE_tube','CAN_cable'].map(mesh);
const scene=new THREE.Scene(),flexible=setupFlexible(scene,[...stock,...links,...tubes],{parts:[],flexible_assembly_notes:{PTFE_points:Array.from({length:12},(_,i)=>[i*10,20,400])}},{chain_centres:route.points,chain_pitch_mm:10});
for(const head of ['stealthburner','xol','sphinx','jabberwocky','indx'])for(const mount of ['fixed','stealthchanger','madmax']){
  for(const gantry of ['trident_r2','siboor_awd','monolith'])for(const enabled of [true,false,true])for(const [dx,dy] of [[0,0],[80,-65],[-110,90],[0,0]]){
    const variant={id:head+'_'+mount+'_'+gantry,toolhead:head,mount,gantry,machine_head:{},...(gantry==='monolith'?{machine_gantry:{}}:{})};
    const stockOwner=gantry==='siboor_awd';
    const state=flexible.update(dx,dy,150,enabled,{id:variant.id,includeStockBelts:stockOwner,disableToolheadRouting:true});
    assert.equal(state.ptfe,false);assert.equal(state.chain,false);
    assert(links.every(m=>!m.visible)&&tubes.every(m=>!m.visible),'Unregistered head routes must stay hidden independently of belts');
    // Head visibility and palette refresh can run between motion frames.
    stock.forEach(m=>m.visible=false);r2.forEach(m=>m.visible=false);
    const result=belts.update(variant,dx,dy,enabled);
    assert(stock.every(m=>m.visible===(enabled&&stockOwner)));
    assert(r2.every(m=>m.visible===(enabled&&gantry==='trident_r2')));
    assert.equal(result.visible_meshes,enabled&&gantry!=='monolith'?2:0);
    for(const m of r2){assert([...m.geometry.attributes.position.array].every(Number.isFinite));if(gantry==='trident_r2')assert(Number.isFinite(m.geometry.boundingSphere.radius));}
  }
}
belts.update(base,0,0,true);
r2.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,references[i],'Repeated travel must return to the native belt vertices without drift'));
const root=new THREE.Group();root.add(r2[0],r2[1]);root.visible=false;
assert.equal(belts.setVisible(base,true).visible_meshes,0,'Diagnostics must include ancestor visibility, not only the mesh flag');
root.visible=true;assert.equal(belts.setVisible(base,true).visible_meshes,2);
console.log('Printer gantry retention and manifest-only belt registration passed; 540 head/mount/gantry/motion/toggle cases retain the correct 6/9 mm belts without inventing head routes.');

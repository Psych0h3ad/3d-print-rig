import assert from 'node:assert/strict';
import {changerChoice,changerChoices,changerPlacement} from '../site/viewer/toolchanger-model.js';
const c={assets:{},variants:[]};
for(const system of ['stealthchanger','tapchanger'])for(const iface of system==='stealthchanger'?['standard_6','standard_9','monolith_6','monolith_9']:['source'])for(const toolhead of system==='stealthchanger'?['sb','xol','dragon']:['sb_rods','liftbar']){
 const id=[system,iface,toolhead].join('_');c.assets[id]={meta:id+'.json',glb:id+'.glb'};
 c.variants.push({id,system,interface:iface,toolhead,probe_travel_mm:system==='stealthchanger'?[0,3]:null,modules:[{id,role:system==='stealthchanger'?'tool':'reference',translation_mm:[0,-5.6,0]}]});
}
for(const v of c.variants){
 assert.equal(changerChoice(c,v),v);
 for(const key of ['system','interface','toolhead'])for(const choice of changerChoices(c,v,key)){
  const next=changerChoice(c,{...v,[key]:choice},key);assert.equal(next[key],choice);assert(c.variants.includes(next));
 }
 const entry=v.modules[0],original=[...entry.translation_mm];
 assert.deepEqual(changerPlacement(v,entry),original);
 if(v.probe_travel_mm){
  assert.deepEqual(changerPlacement(v,entry,{probe:3,explode:20}),[0,-25.6,13]);
  for(const role of ['shuttle','dock','reference'])assert.deepEqual(changerPlacement(v,{...entry,role},{probe:3,explode:20}),original);
  assert.throws(()=>changerPlacement(v,entry,{probe:3.01}));
 }else assert.throws(()=>changerPlacement(v,entry,{probe:1}));
 assert.deepEqual(entry.translation_mm,original);
 for(const options of [{probe:NaN},{probe:-1},{explode:-1},{explode:50.01},{explode:Infinity}])assert.throws(()=>changerPlacement(v,entry,options));
 assert.throws(()=>changerChoice({...c,assets:{}},v));
}
assert.throws(()=>changerChoice(c,{system:'missing'},'system'));
assert.throws(()=>changerChoice(c,{toolhead:'unknown'},'toolhead'));
assert.equal(changerChoice(c,{...c.variants[0],system:'tapchanger'},'system').interface,'source');
assert.equal(changerChoice(c,{...c.variants.at(-1),system:'stealthchanger'},'system').system,'stealthchanger');
console.log('Toolchanger selections, asset completeness and declared probe/explode motion passed.');

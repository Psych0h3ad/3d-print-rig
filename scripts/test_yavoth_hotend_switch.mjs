import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const {assertYavothHardware}=await import('./audit_loaded_heads.mjs');

const root={visible:true,parent:null};
const part=(key,component,parent=root)=>({key,component,mesh:{visible:true,parent}});
const cowl=part('cowl','printed_toolhead');
const hotend=part('hotend','hotend'),extruder=part('extruder','extruder');
const fans=[part('4010-left','fan'),part('4010-right','fan'),part('2510','fan')];
const v={id:'yavoth-hotend-change',toolhead:'yavoth'};
const assets=entries=>[['actual-source',{root,entries}]];
assert.throws(()=>assertYavothHardware(v,assets([cowl])),/hotend hardware/,'A printable cowl is not an assembled hotend');
assert.throws(()=>assertYavothHardware(v,assets([cowl,hotend,...fans])),/extruder hardware/);
assert.throws(()=>assertYavothHardware(v,assets([cowl,hotend,extruder,...fans.slice(1)])),/cooling hardware/);
assertYavothHardware(v,assets([cowl,hotend,extruder,...fans]));
const all=[cowl,hotend,extruder,...fans];
for(const row of [hotend,extruder,...fans]){
 row.mesh.visible=false;
 assert.throws(()=>assertYavothHardware(v,assets(all)),/missing/,'A hidden companion cannot satisfy the requirement');
 row.mesh.visible=true;
}
const hiddenGroup={visible:false,parent:root};hotend.mesh.parent=hiddenGroup;
assert.throws(()=>assertYavothHardware(v,assets(all)),/hotend hardware/);
hotend.mesh.parent=root;
const cachedRoot={visible:false,parent:null};
assert.throws(()=>assertYavothHardware(v,[...assets([cowl]),['old-head',{root:cachedRoot,entries:all}]]),/hotend hardware/,'Cached old parts cannot satisfy a new selection');
assertYavothHardware(v,assets(all));
assertYavothHardware({...v,toolhead:'another-family'},assets([]));
console.log('Yavoth source-BOM companions required after switching; printed-only, hidden, detached and cached hardware rejected.');

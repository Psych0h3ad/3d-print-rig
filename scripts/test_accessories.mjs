import assert from 'node:assert/strict';
import {AccessorySelection,accessoryIds} from '../site/viewer/accessories.js';
const catalog={accessories:[{id:'bedfans',module:'bedfans'},{id:'other',module:'other'}]};
const fan={root:{visible:false,userData:{},position:{set(...p){this.value=p}}}};
let updates=0;
const state=new AccessorySelection(catalog,async id=>{if(id==='other')throw Error('Failed download');return fan},()=>updates++);
assert.deepEqual(state.saved(),{accessories:[]});
await state.apply({accessories:['bedfans','bedfans']});
assert.deepEqual(state.saved(),{accessories:['bedfans']});
assert.equal(fan.root.visible,true);assert.equal(fan.root.userData.headModule,false);
// Installing another head resets loaded roots; the accessory choice survives.
fan.root.visible=false;fan.root.position.set(1,2,3);state.refresh();
assert.equal(fan.root.visible,true);assert.deepEqual(fan.root.position.value,[0,0,0]);
await assert.rejects(state.apply({accessories:['other']}));
assert.equal(fan.root.visible,true);assert.deepEqual(state.saved(),{accessories:['bedfans']});
await state.apply({});assert.equal(fan.root.visible,false);assert.equal(updates,2);
assert.throws(()=>accessoryIds(catalog,{accessories:['https://example.com/model.glb']}));
assert.throws(()=>accessoryIds(catalog,{accessories:'bedfans'}));
console.log('Accessory selection passed: toggle, head switch, JSON round trip, failed asset preservation and whitelist.');

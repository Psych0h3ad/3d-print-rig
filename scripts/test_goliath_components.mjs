import assert from 'node:assert/strict';
import {componentViews,resolveComponentView,componentViewKeys} from '../site/viewer/v0-mod-library.mjs';
// Water must initially show the native body and both fittings together.
for(const id of ['goliath_air','goliath_water','goliath_short_wc']){
 const parts=Array.from({length:id==='goliath_air'?1:id==='goliath_water'?3:15},(_,i)=>({key:`native_${i}`,name:i?'Native fitting / extruder':'Goliath'}));
 const views=componentViews({id,select_parts:true},parts),initial=resolveComponentView(views,{});
 assert.equal(views.length,1);assert.equal(initial.part,'all');assert.deepEqual(componentViewKeys(initial.view,initial.part),parts.map(p=>p.key));
 for(const p of parts){const selection=resolveComponentView(views,{part:p.key});assert.deepEqual(componentViewKeys(selection.view,selection.part),[p.key])}
 const restored=resolveComponentView(views,{view:'missing',part:'missing'});assert.equal(restored.part,'all');
}
console.log('Goliath Air/Water/Short: complete source view, individual part selection and invalid-query fallback passed.');

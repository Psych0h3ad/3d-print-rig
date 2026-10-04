
import assert from 'node:assert/strict';
import {sceneLightingState} from '../site/viewer/scene-lighting-state.mjs';
for(const darkUI of [false,true])for(const roomDark of [false,true])for(const ledAvailable of [false,true]){
 const room=sceneLightingState({darkUI,roomDark,ledAvailable});assert.equal(room.darkRoom,roomDark&&ledAvailable);
 assert.equal(room.daylightScale,roomDark&&ledAvailable?0:1);
 assert.equal(room.ambientIntensity,roomDark&&ledAvailable?.008:.25);
 assert.equal(room.background,darkUI||roomDark&&ledAvailable?'#101820':'#edf1f5');
}
assert.deepEqual({...sceneLightingState({darkUI:true}),background:''},{...sceneLightingState({darkUI:false}),background:''});
console.log('Workspace dark mode preserves inspection lights; explicit room darkness requires an installed LED.');

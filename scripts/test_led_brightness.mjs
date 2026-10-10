import assert from 'node:assert/strict';
import {discoLightLuminance,sceneLightingState} from '../site/viewer/scene-lighting-state.mjs';
import {lightingState} from '../site/viewer/lighting-state.mjs';
import {ledSample} from '../site/viewer/lighting-animation.mjs';

// Two 350 x 6 mm source strip surfaces, divided into three area lights each.
// Guard useful chamber illumination independently of the visible lens emission.
const area=2*.35*.006;
const whiteFlux75=Math.PI*area*discoLightLuminance*.75;
assert(whiteFlux75>=10&&whiteFlux75<=100,'The small source strips must light the chamber without excessive luminance');
for(const effect of ['static','flow','breath','chase'])for(const color of ['white','red','blue','rainbow']){
 for(const seconds of [0,.37,1,2.5])for(const level of [0,25,75,100,75,25,0]){
  const state=lightingState({installed:true,power:true,night:true,ready:true,level});
  const sample=ledSample({color,effect,seconds,position:.5});
  const intensity=state.on?discoLightLuminance*state.value*sample.gain:0;
  assert(Number.isFinite(intensity)&&intensity>=0&&intensity<=discoLightLuminance);
  if(!level)assert.equal(intensity,0,'Zero brightness must turn off projected light');
 }
}
for(const unavailable of [{installed:false},{ready:false},{failed:true},{power:false}]){
 const state=lightingState({installed:true,ready:true,power:true,level:75,...unavailable});
 assert.equal(state.on,false,'Unavailable or switched-off lighting must not illuminate');
}
const dark=sceneLightingState({roomDark:true,ledAvailable:true}),day=sceneLightingState();
assert.equal(dark.daylightScale,0,'Dark-room comparison must not secretly enable daylight');
assert(dark.ambientIntensity>=.025&&dark.ambientIntensity<day.ambientIntensity/4,'Keep a dim fill so black silhouettes remain readable');
assert(dark.environmentIntensity>=.015&&dark.environmentIntensity<day.environmentIntensity/4);
for(const ledAvailable of [false,true]){
 assert.deepEqual({...sceneLightingState({darkUI:true,ledAvailable}),background:''},{...sceneLightingState({darkUI:false,ledAvailable}),background:''},'Site dark mode must preserve scene illumination');
}
console.log('LED readability: source strip luminance, zero/off, bounded RGB effects, dim dark-room fill and independent site theme passed.');

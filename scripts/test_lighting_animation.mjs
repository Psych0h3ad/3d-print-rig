import assert from 'node:assert/strict';
import {ledSample,createLedAnimator} from '../site/viewer/lighting-animation.mjs';
for(const color of ['white','red','blue','rainbow'])for(const effect of ['static','flow','breath','chase'])for(const position of [0,.4,1]){
 const a=ledSample({color,effect,position,seconds:0}),b=ledSample({color,effect,position,seconds:1});
 assert(a.gain>=0&&a.gain<=1&&Number.isFinite(a.hue));
 assert(effect==='static'?JSON.stringify(a)===JSON.stringify(b):JSON.stringify(a)!==JSON.stringify(b),color+' '+effect);
}
assert.deepEqual(ledSample({color:'rainbow',effect:'flow',seconds:0}),ledSample({color:'rainbow',effect:'flow',seconds:25}));
let on=true,speed=1,next=1,frames=[],callbacks=new Map();
const animator=createLedAnimator({active:()=>on,rate:()=>speed,draw:s=>frames.push(s),request:f=>{const id=next++;callbacks.set(id,f);return id},cancel:id=>callbacks.delete(id)});
const tick=t=>{assert.equal(callbacks.size,1);const [id,f]=callbacks.entries().next().value;callbacks.delete(id);f(t)};
animator.refresh();animator.refresh();assert.equal(callbacks.size,1);
tick(0);tick(16);tick(34);assert.equal(frames.length,2);assert.equal(animator.seconds,.034);
speed=2;tick(84);assert(Math.abs(animator.seconds-.134)<1e-9);
on=false;animator.refresh();assert.equal(callbacks.size,0);const paused=animator.seconds;
on=true;animator.refresh();tick(10000);assert.equal(animator.seconds,paused);tick(10050);assert(Math.abs(animator.seconds-paused-.1)<1e-9);
animator.stop();assert.equal(callbacks.size,0);animator.refresh();tick(20000);assert(animator.running);animator.dispose();animator.refresh();assert.equal(callbacks.size,0);
console.log('RGB: four timed effects, color samples, throttling, one loop, rate changes, off/hidden pause and resume passed.');

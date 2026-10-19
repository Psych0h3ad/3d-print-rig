// Rapid edits must compose against the outstanding command, not rendered progress.
// This exercises the actual input event body and original source47 solver. DOM
// value fields are stand-ins; browser rendering and native fit remain separate.
import fs from'node:fs';
import assert from'node:assert/strict';
import{createCaptured47}from'../site/viewer/source47/captured47-state-v14-fixed-terminal.mjs';
const root=new URL('../',import.meta.url),app=fs.readFileSync(new URL('site/viewer/app.js',root),'utf8'),input=JSON.parse(fs.readFileSync(new URL('site/viewer/source47/data/ROUTE350_CAPTURE_BINDINGS_V2.json',root)));
const machine=input.machines.find(m=>m.size===350),ref=machine.reference_xy_mm;
const event=app.split('\n').find(s=>s.startsWith("for(const a of ['x','y','z'])")&&s.includes('.oninput='));assert(event);
function exercise(eventBody){
 const fields=new Map(['x','y','z'].map((a,i)=>['#'+a,{value:[...ref,0][i]}])),get=id=>fields.get(id);let z=0,zPending=[],goalZ=0;
 const source=createCaptured47(input,350,{onApply:frame=>{for(const[a,v]of[['x',frame.xy[0]+ref[0]],['y',frame.xy[1]+ref[1]],['z',z]])get('#'+a).value=v}});
 const router={matches:()=>true,get requestedPose(){return[...source.target.xy.map((v,i)=>v+ref[i]),goalZ]}};
 const setPose=(x,y,zz)=>{const n=source.planMove(x-ref[0],y-ref[1]);goalZ=zz;zPending=Array.from({length:n},(_,i)=>i===n-1?zz:z+(zz-z)*(i+1)/n)};
 const tick=()=>{z=zPending.shift();source.applyNext()},drain=()=>{while(source.pendingCount)tick()},fill=(axis,value)=>{get('#'+axis).value=value;get('#'+axis).oninput()};
 new Function('$','stop','unfocus','setPose','source47','activeConfig',eventBody)(get,()=>{},()=>{},setPose,router,{});
 setPose(0,0,0);drain();fill('x',350);tick();fill('y',360);tick();fill('z',230);drain();const first=['x','y','z'].map(a=>+get('#'+a).value);
 if(first[0]===350&&first[1]===360){fill('z',0);tick();fill('y',0);tick();fill('x',0);drain();assert.deepEqual(['x','y','z'].map(a=>+get('#'+a).value),[0,0,0]);fill('y',360);tick();fill('z',115);tick();fill('x',350);drain();assert.deepEqual(['x','y','z'].map(a=>+get('#'+a).value),[350,360,115]);}
 return first;
}
const old="for(const a of ['x','y','z'])$('#'+a).oninput=()=>{stop();unfocus();setPose(+$('#x').value,+$('#y').value,+$('#z').value)};";
const negative=exercise(old);assert(negative[0]<10&&negative[1]<10&&negative[2]===230);
assert.deepEqual(exercise(event),[350,360,230]);
console.log('Source47 rapid-axis requested-target source regression passed; retained old-event negative reproduced.');

// The actual source47 frame must own the matching installed head's display
// origin. The stock endstop origin below is an independent native CAD datum,
// from approved stock assembly_manifest.json (model96309090...), not a second
// name for this captured chain assembly reference.
const full=fs.readFileSync(new URL('site/viewer/source47/source47-full-machine.mjs',root),'utf8'),getter=full.match(/get referencePose\(\)\{([^}]+)\}/u)?.[1],referenceLine=app.split('\n').find(s=>s.includes('if(source47?.matches(v))')&&s.includes('referencePose'));
assert(getter&&referenceLine);const nativeStockRef=[177.60659839971922,186.4322470735584],token={source:'exact-ACE3509'},routeReference=new Function('M',getter)(machine),router={matches:v=>v===token,referencePose:routeReference};
const select=new Function('source47','v','refX','refY',referenceLine+';return [refX,refY]');assert.deepEqual(select(router,token,...nativeStockRef),ref);assert.deepEqual(select(router,{},...nativeStockRef),nativeStockRef);
const view=e=>({world47:e.row.matrices,points:e.row.points,signature:e.signature(),xy:e.current.xy,theta:e.current.theta});
const e=createCaptured47(input,350),drain=e=>{while(e.pendingCount)e.applyNext()};
e.planMove(nativeStockRef[0]-ref[0],nativeStockRef[1]-ref[1]);drain(e);const oldInitial=view(e);e.planReset();drain(e);assert.notDeepEqual(oldInitial.world47,e.row.matrices);assert.notDeepEqual(oldInitial.xy,e.current.xy);
const nativeInitial=createCaptured47(input,350);nativeInitial.planMove(routeReference[0]-ref[0],routeReference[1]-ref[1]);drain(nativeInitial);const canonical=view(nativeInitial);nativeInitial.planMove(350-ref[0],360-ref[1]);nativeInitial.applyNext();const pending=nativeInitial.capture(),restored=createCaptured47(input,350);restored.restore(JSON.parse(JSON.stringify(pending)));assert.deepEqual(restored.capture(),pending);drain(restored);restored.planReset();drain(restored);assert.deepEqual(view(restored),canonical);
const rebound=createCaptured47(input,350);rebound.planMove(routeReference[0]-ref[0],routeReference[1]-ref[1]);drain(rebound);assert.deepEqual(view(rebound),canonical);
console.log('Source-backed initial/reference/reset/A-B-A/pending-state frame regression passed; unrelated head retains stock endstop frame.');

import assert from 'node:assert/strict';
import {captureViewAppearance,transferViewAppearance} from '../site/viewer/source-assembly-runtime/view_appearance.mjs';
const packet={id:'source-view-test',model:{sha256:'a'.repeat(64)},inventory:{sha256:'b'.repeat(64)}};
const fresh=()=>({packet:packet.id,model_sha256:packet.model.sha256,inventory_sha256:packet.inventory.sha256,axes:{x:0,y:0,z:0},review_axes:{x:0,y:0,z:0},probe_state:'attached',camera:null,variant:'native',groups:{references:false},palette:{M:'#245963',A:'#ed744c'},theme:'dark',lighting:'studio',lightIntensity:1,grid:false});
const A={palette:{M:'#ffff00',A:'#0055ff'},theme:'light',lighting:'rgb',lightIntensity:1.25,grid:true},B={palette:{M:'#0055ff',A:'#ffff00'},theme:'dark',lighting:'off',lightIntensity:0,grid:false};
let current=structuredClone({...fresh(),...A,review_axes:{x:50,y:-50,z:-50},probe_state:'parked',camera:{position:[1,2,3],target:[0,0,0]},variant:'other',groups:{references:true}});
const original=structuredClone(current),captured=captureViewAppearance(current,packet);
current.palette.M='#123456';assert.deepEqual(captured.appearance.palette,A.palette,'Capture must not retain mutable state aliases');
for(const target of ['head','full']){
 const initialized=fresh();if(target==='head'){delete initialized.review_axes;delete initialized.probe_state;}
 const next=transferViewAppearance(initialized,packet,captured);
 for(const [k,v]of Object.entries(A))assert.deepEqual(next[k],v);
 for(const k of ['axes','review_axes','probe_state','camera','variant','groups'])assert.deepEqual(next[k],initialized[k],k+' must remain from the new view');
 assert.equal('purchased_appearance'in next,false,'Do not create an unavailable purchased display setting');
 assert.deepEqual(initialized,freshWithScope(target),'Transfer must not mutate the initialized view');
}
function freshWithScope(target){const s=fresh();if(target==='head'){delete s.review_axes;delete s.probe_state;}return s;}
for(const purchased_appearance of ['physical','cad'])for(const style of [A,B,A]){
 const c=captureViewAppearance({...fresh(),...style,purchased_appearance},packet),next=transferViewAppearance(fresh(),packet,c);
 for(const[k,v]of Object.entries({...style,purchased_appearance}))assert.deepEqual(next[k],v);
}
for(const k of ['packet','model_sha256','inventory_sha256']){assert.throws(()=>captureViewAppearance({...original,[k]:'stale'},packet),/revision mismatch/);assert.throws(()=>transferViewAppearance(fresh(),packet,{...captured,[k]:'stale'}),/revision mismatch/);}
assert.throws(()=>captureViewAppearance({...fresh(),palette:{M:'orange',A:'#000000'}},packet),/Invalid/);
assert.throws(()=>captureViewAppearance({...fresh(),purchased_appearance:'invalid'},packet),/Invalid/);
assert.deepEqual(transferViewAppearance(fresh(),packet,null),fresh());
console.log('PASS source view display A-B-A, identity guards, no motion/probe/camera/variant/group transfer.');

import assert from 'node:assert/strict';
import {installationFor,installationOptionAvailable} from '../site/viewer/ender-mods.mjs';
const profile={configurations:{}};
for(const head of ['stock','hydra'])for(const z of ['stock','belted'])for(const probe of ['none','klack']){
 const selection={head,z,probe};profile.configurations[[head,z,probe].join('__')]={selection};
}
for(const head of ['ng','ng_revo'])profile.configurations[head]={selection:{head,z:'stock',probe:'none'}};
for(const [id,{selection}] of Object.entries(profile.configurations)){
 assert.equal(installationFor(profile,selection),id);
 for(const next of ['ng','ng_revo']){
  assert.equal(installationFor(profile,{...selection,head:next},{changed:'head'}),next);
  assert.deepEqual(profile.configurations[next].selection,{head:next,z:'stock',probe:'none'});
 }
 assert.equal(installationFor(profile,{...selection,head:'stock'},{changed:'head'}),['stock',selection.z,selection.probe].join('__'));
 for(const [key,value] of Object.entries(selection))assert.equal(installationOptionAvailable(profile,key,value,selection),true);
}
const ng={head:'ng',z:'stock',probe:'none'};
assert.equal(installationOptionAvailable(profile,'z','belted',ng),false);
assert.equal(installationOptionAvailable(profile,'probe','klack',ng),false);
assert.equal(installationOptionAvailable(profile,'head','hydra',ng),true);
assert.throws(()=>installationFor(profile,{...ng,z:'belted'}),/Unavailable installation/);
assert.throws(()=>installationFor(profile,{...ng,probe:'klack'},{changed:'probe'}),/Unavailable installation/);
assert.throws(()=>installationFor(profile,{...ng,head:'missing'},{changed:'head'}),/Unavailable installation/);
assert.equal(installationFor(profile,{head:'hydra',z:'belted',probe:'klack'},{changed:'head'}),'hydra__belted__klack');
assert.throws(()=>installationFor({configurations:{}},ng,{changed:'head'}),/Unavailable installation/);
console.log('Ender head changes select only registered companion sets; existing Z/probe combinations are preserved.');

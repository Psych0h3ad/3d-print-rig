import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// A previously hashed body has not necessarily had its imports traversed.
export function createPinnedModuleClosure({pin,viewer,SourceTextModule=vm.SourceTextModule}){
 assert.equal(typeof pin,'function');
 assert(SourceTextModule,'Use node --experimental-vm-modules for exact production import closure');
 const visited=new Set();
 return async function pinClosure(url){
  const clean=new URL(url);clean.search='';clean.hash='';
  if(visited.has(clean.href))return;
  const source=(await pin(fileURLToPath(clean))).toString('utf8');
  visited.add(clean.href);
  for(const spec of new SourceTextModule(source).dependencySpecifiers){
   if(spec.startsWith('node:'))continue;
   if(spec==='three'){await pinClosure(new URL('vendor/three.module.js',viewer));continue}
   assert(spec.startsWith('.'),'Unregistered audit dependency: '+spec);
   await pinClosure(new URL(spec,clean));
  }
 };
}

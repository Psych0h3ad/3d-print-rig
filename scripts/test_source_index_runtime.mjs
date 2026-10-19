import fs from 'node:fs';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {sourceAssemblyMachines} from '../site/viewer/source-assembly-registry.mjs';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {loadSourceIndex}=await import('../site/viewer/source-assembly-loader.mjs');
const originalFetch=globalThis.fetch;
const actual=JSON.parse(fs.readFileSync(new URL('../site/SOURCE_ASSEMBLIES.json',import.meta.url),'utf8'));
try{
 globalThis.fetch=async()=>Response.json(actual);
 const loaded=await loadSourceIndex();
 assert.deepEqual(loaded,actual);
 assert.deepEqual(loaded.models.map(r=>r.id).sort(),sourceAssemblyMachines.map(r=>r.id).sort());
 let rejected=0;
 for(const change of [
  x=>x.schema='unknown',
  x=>delete x.models,
  x=>x.models=[],
  x=>x.models.push(structuredClone(x.models[0])),
  x=>x.models[0].id='unregistered-machine',
  x=>x.models.push({...x.models[0],id:'unregistered-machine'}),
 ]){
  const bad=structuredClone(actual);change(bad);
  globalThis.fetch=async()=>Response.json(bad);
  await assert.rejects(loadSourceIndex(),/Source index identity changed/);rejected++;
 }
 console.log(JSON.stringify({passed:true,actual_registered_index_loaded:true,models:loaded.models.map(r=>r.id),rejected_malformed_or_unregistered_indices:rejected,scope:'Production async index loader and actual current registration; no model/GPU or native-fit claim.'}));
}finally{globalThis.fetch=originalFetch;}

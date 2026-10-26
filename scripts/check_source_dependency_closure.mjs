// Execute normal controller imports with the page's import map and a disposed
// workspace scope. The shared probe rejects every network/model request.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {sourceAssemblyMachines} from '../site/viewer/source-assembly-registry.mjs';
import {machineChoices} from '../site/viewer/machines.js';
import {layoutMachineRecipes} from '../site/viewer/layout-machine-recipes.mjs';

export function checkSourceDependencyClosure(){
 const base=new URL('../site/viewer/',import.meta.url),index=JSON.parse(readFileSync(new URL('../SOURCE_ASSEMBLIES.json',base)));
 const ids=sourceAssemblyMachines.map(row=>row.id),unique=rows=>{assert.equal(new Set(rows).size,rows.length,'Duplicate source registration');return [...rows].sort();};
 assert(ids.length>0);assert.deepEqual(unique(index.models.map(row=>row.id)),unique(ids));
 assert.deepEqual(unique(layoutMachineRecipes.filter(row=>row.category==='source').map(row=>row.machine_id)),unique(ids),'Source recipes differ from registry');
 const files=new Map(),routes=[];
 for(const id of ids){
  assert.equal(machineChoices.filter(row=>row.id===id&&row.available!==false).length,1,'Source selector missing or duplicated');
  const recipe=layoutMachineRecipes.find(row=>row.machine_id===id);
  assert.equal(recipe.page,'viewer/community.html');assert.equal(recipe.controller,'viewer/community.js');
  const probe=spawnSync(process.execPath,['--max-old-space-size=192',fileURLToPath(new URL('./test_community_import_boundary.mjs',import.meta.url)),'--probe',JSON.stringify({machines:[id]})],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(probe.status,0,probe.stderr||probe.error?.message||'Controller import probe failed');
  const loaded=JSON.parse(probe.stdout.trim()).snapshots[0].loaded;
  for(const required of ['source-assembly.mjs','source-assembly-loader.mjs','source-assembly-runtime/assembly.mjs','source-assembly-runtime/state.mjs','source-assembly-runtime/loading.mjs','source-assembly-runtime/chunk_loader.mjs'])assert(loaded.includes(required),'Normal route missed '+required);
  for(const name of loaded){
   assert(!name.includes('..')&&!name.startsWith('/'),'Unexpected module location');
   const body=readFileSync(new URL(name,base));files.set('site/viewer/'+name,{path:'site/viewer/'+name,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});
  }
  routes.push({id,controller:recipe.controller,modules:loaded.length,network_or_geometry_requested:false});
 }
 return {passed:true,routes,files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),scope:'Normal source controller import closure and selector/index/recipe identities using the page import map. The disposed-scope boundary prevents renderer and model startup. Exported assets, movement, browser behavior and native fit require separate checks.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(checkSourceDependencyClosure()));

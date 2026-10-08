// One sequential software process; no browser, native CAD, downloads or jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {v0Slots,createV0Installations,v0TophatMaxAngle,stockV0Mods,validateV0State,readV0ModsURL,v0ModsURL,v0ConfigurationSchema,v0ModsParameter,createV0StateRestorer} from './v0-state-test-runtime.mjs';
import {v0ModCategories} from '../site/viewer/v0-mod-library.mjs';
import {pageShareData,xShareURL} from '../site/viewer/workspace-share.mjs';
import {embedURL,embedTarget} from '../site/viewer/embed-contract.mjs';
import {fixtureProfile,makeV0Fixture,modStates,conflicts} from './v0-state-fixtures.mjs';
const registration=JSON.parse(await fs.readFile(new URL('../site/V0_INSTALLATIONS.json',import.meta.url),'utf8'));
const base='https://example.test/rig/viewer/v0.html?lang=ja&embed=1&component=v0mod_mailbox_v5#inspectorTabs';
const summary={workers:1,valid:0,rejected:0,roundTrips:0,composed:0,reversals:0,resets:0,poses:0,negativeCases:0,races:0,machines:[]};
const reject=fn=>{assert.throws(fn);summary.negativeCases++};
const configuration=(profile,mods)=>({schema:v0ConfigurationSchema,machine_id:profile.machine_id,mods,pose:[0,60,120],palette:{base:'#ff0033',accent:'#00FFCC',frame:null},enclosure:false,belts:false,grid:true,door_angle_deg:110,tophat_angle_deg:0});
const hashState=value=>JSON.stringify(value);
for(const [machine_id,registry]of Object.entries(registration.machines)){
 const profile=fixtureProfile(machine_id),context={machine_id,registry},stateContext={profile,registry},fixture=makeV0Fixture(registry,profile);
 const installations=await createV0Installations({...fixture,profile,registry});
 let committed,commits=0,busy=false;const restorer=createV0StateRestorer({profile,registry,installations,commit:value=>{committed=value;commits++},busy:v=>{busy=v}});
 const valid=[],invalid=[],seen=new Set();
 for(const mods of modStates(registry,v0Slots)){
  if(conflicts(registry,mods)){reject(()=>v0ModsURL(base,context,mods));reject(()=>validateV0State(stateContext,configuration(profile,mods)));invalid.push(mods);summary.rejected++;continue}
  valid.push(mods);summary.valid++;for(const [slot,id]of Object.entries(mods))seen.add(slot+':'+id);
  const url=v0ModsURL(base,context,mods),params=new URL(url).searchParams;
  assert.equal(params.get('component'),'v0mod_mailbox_v5');assert.equal(params.get('lang'),'ja');assert.equal(params.get('embed'),'1');
  assert.deepEqual(readV0ModsURL(url,context),mods);summary.roundTrips++;
  const share=pageShareData(url,'V0');assert.deepEqual(readV0ModsURL(share.url,context),mods);assert.deepEqual(readV0ModsURL(new URL(xShareURL(share)).searchParams.get('url'),context),mods);
  assert.deepEqual(readV0ModsURL(embedTarget(embedURL(url)).url.href,context),mods);
  const file=configuration(profile,mods);file.tophat_angle_deg=v0TophatMaxAngle(registry,mods);
  const restored=validateV0State(stateContext,JSON.parse(JSON.stringify(file)));assert.deepEqual(restored,file);summary.roundTrips++;
  assert.equal(await restorer.restore(restored),true);assert.equal(busy,false);assert.deepEqual(installations.getState(),mods);assert.deepEqual(committed,file);summary.composed++;
  // Assert the actual production composition: active wrappers, exact source
  // keys (including composed Cat Flap + Lift-Off) and native replacement masks.
  const hidden=new Set(registry.options.filter(o=>mods[o.slot]===o.id).flatMap(o=>o.replace_keys));
  for(const [key,node]of fixture.adapter.nodes)assert.equal(node.visible,!hidden.has(key)&&!(key==='fixture-stock-adxl'&&mods.accelerometer==='none'));
  for(const [id,rows]of installations.roots){const selected=mods[rows[0].option.slot]===id;for(const row of rows){assert.equal(row.wrapper.visible,selected);if(selected&&row.spec.module){const visible=[];row.model.traverse(n=>{if(n.userData.part_key&&n.parent?.userData.part_key!==n.userData.part_key&&n.visible)visible.push(n.userData.part_key)});assert.deepEqual(visible.sort(),[...row.spec.keys].sort())}}}
  for(const pose of [[0,0,0],[120,120,120],[60,37,85],[120,0,60],[0,120,0]]){installations.setPose(pose);for(const rows of installations.roots.values())for(const row of rows)assert(row.wrapper.position.toArray().concat(row.wrapper.quaternion.toArray()).every(Number.isFinite));summary.poses++}
  assert.equal(await restorer.setMods(stockV0Mods()),true);assert.deepEqual(installations.getState(),stockV0Mods());assert.equal(await restorer.setMods(mods),true);summary.reversals++;
  assert.equal(await restorer.setMods(stockV0Mods()),true);summary.resets++;
 }
 assert.equal(valid.length,1152);assert.equal(invalid.length,768);
 for(const [slot]of v0Slots){assert(seen.has(slot+':stock'));if(slot==='accelerometer')assert(seen.has(slot+':none'));for(const option of registry.options.filter(o=>o.slot===slot))assert(seen.has(slot+':'+option.id))}
 assert.equal(readV0ModsURL(base,context),null);
 const older={accelerometer:'adxl-0',strain_relief:'picobilical-plate',handles:'stealth-handles',tophat:'cat-flap'};
 const old=configuration(profile,older);delete old.door_angle_deg;delete old.tophat_angle_deg;
 const migrated=validateV0State(stateContext,old);assert.deepEqual(migrated.mods,{...stockV0Mods(),...older});assert.equal(migrated.door_angle_deg,0);assert.equal(migrated.tophat_angle_deg,0);assert.equal(await restorer.restore(old),true);
 const legacy=new URL(base);legacy.searchParams.set('machine',machine_id);legacy.searchParams.set(v0ModsParameter,JSON.stringify(older));assert.deepEqual(readV0ModsURL(legacy.href,context),migrated.mods);
 for(const payload of ['', '{', 'null', '[]', '"stock"', '{}', 'x'.repeat(4097)]){const url=new URL(base);url.searchParams.set(v0ModsParameter,payload);reject(()=>readV0ModsURL(url.href,context))}
 const canonical=v0ModsURL(base,context,stockV0Mods());const duplicate=new URL(canonical);duplicate.searchParams.append(v0ModsParameter,'{}');reject(()=>readV0ModsURL(duplicate.href,context));duplicate.searchParams.delete(v0ModsParameter);duplicate.searchParams.set(v0ModsParameter,JSON.stringify(stockV0Mods()));duplicate.searchParams.append('machine',machine_id);reject(()=>readV0ModsURL(duplicate.href,context));
 const other=new URL(canonical);other.searchParams.set('machine','voron_v24_350_printed');reject(()=>readV0ModsURL(other.href,context));
 const good=configuration(profile,stockV0Mods());
 const bad=[null,[],{}, {...good,schema:'v0-configuration-v2'},{...good,machine_id:'other'},{...good,mods:null},{...good,mods:{}},{...good,mods:{...good.mods,extra:'stock'}},{...good,palette:{...good.palette,extra:'#000000'}},{...good,palette:[]},{...good,pose:[]},{...good,pose:[0,60,121]}];
 for(const n of [null,true,'60',NaN,Infinity,-1,121])bad.push({...good,pose:[0,n,0]});
 for(const key of ['enclosure','belts','grid'])for(const value of [undefined,null,0,'true'])bad.push({...good,[key]:value});
 for(const key of ['door_angle_deg','tophat_angle_deg'])for(const value of [null,NaN,Infinity,-1,'0',111])bad.push({...good,[key]:value});
 for(const role of ['base','accent','frame'])for(const value of [undefined,0,'bad','#fffff',{}])bad.push({...good,palette:{...good.palette,[role]:value}});
 for(const value of bad){const before=hashState(installations.getState()),count=commits;reject(()=>restorer.restore(value));assert.equal(hashState(installations.getState()),before);assert.equal(commits,count);assert.equal(busy,false)}
 for(const category of v0ModCategories)for(const mod of category.mods)for(const [slot]of v0Slots)reject(()=>v0ModsURL(base,context,{...stockV0Mods(),[slot]:'v0mod_'+mod}));
 for(const [slot]of v0Slots)for(const option of registry.options.filter(o=>o.slot!==slot&&o.id!=='stock'))reject(()=>v0ModsURL(base,context,{...stockV0Mods(),[slot]:option.id}));
 // The restorer snapshots caller-owned arrays/maps before asynchronous work.
 const detached=configuration(profile,valid.at(-1)),pending=restorer.restore(detached);detached.mods.handles='unsupported';detached.pose[0]=99;detached.palette.base='#000000';assert.equal(await pending,true);assert.equal(committed.pose[0],0);assert.equal(committed.palette.base,'#ff0033');assert.notEqual(committed.mods.handles,'unsupported');
 await restorer.setMods(stockV0Mods());installations.dispose();fixture.dispose();summary.machines.push({machine_id,valid:valid.length,rejected:invalid.length,registeredOptions:registry.options.length,selectionIdentities:[...seen].sort()});
}
// Deterministic newest-request races, without another process or timers.
const machine_id=Object.keys(registration.machines)[0],registry=registration.machines[machine_id],profile=fixtureProfile(machine_id),queue=[],committed=[],errors=[],flags=[];
const installations={setState:mods=>new Promise((resolve,reject)=>queue.push({mods,resolve,reject}))};
const controller=createV0StateRestorer({profile,registry,installations,commit:v=>committed.push(v),busy:v=>flags.push(v),error:e=>errors.push(e.message)});
let first=controller.restore(configuration(profile,stockV0Mods())),second=controller.setMods({...stockV0Mods(),handles:'stealth-handles'});queue[1].resolve(true);assert.equal(await second,true);queue[0].resolve(true);assert.equal(await first,false);assert.deepEqual(committed,[undefined]);assert.deepEqual(flags,[true,true,false]);summary.races++;
first=controller.setMods(stockV0Mods());second=controller.restore(configuration(profile,{...stockV0Mods(),tophat:'cat-flap-lift-off'}));queue[3].resolve(true);assert.equal(await second,true);queue[2].resolve(false);assert.equal(await first,false);assert.equal(committed.at(-1).mods.tophat,'cat-flap-lift-off');summary.races++;
first=controller.restore(configuration(profile,stockV0Mods()));reject(()=>controller.restore({...configuration(profile,stockV0Mods()),pose:[null,0,0]}));queue[4].resolve(true);assert.equal(await first,true);summary.races++;
first=controller.restore(configuration(profile,stockV0Mods()));second=controller.setMods(stockV0Mods());queue[5].reject(Error('older source failure'));await assert.rejects(first,/older source failure/);assert.equal(errors.length,0);queue[6].resolve(true);assert.equal(await second,true);summary.races++;
first=controller.restore(configuration(profile,stockV0Mods()));queue[7].reject(Error('source hash mismatch'));await assert.rejects(first,/source hash mismatch/);assert.deepEqual(errors,['source hash mismatch']);assert.equal(flags.at(-1),false);summary.races++;
first=controller.restore(configuration(profile,stockV0Mods()));const count=committed.length;queue[8].resolve(false);assert.equal(await first,false);assert.equal(committed.length,count);assert.equal(flags.at(-1),false);summary.races++;
console.log(JSON.stringify({result:'PASS',scope:'Production registries/controllers with keyed state fixtures; no native solids, exported-model audit or browser review.',...summary},null,2));

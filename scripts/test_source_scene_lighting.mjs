// Execute production light functions; GPU appearance and asset fit have separate evidence.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {sceneLightingState} from '../site/viewer/scene-lighting-state.mjs';
import {sourceMessages,sourceText} from '../site/viewer/source-assembly-messages.mjs';
import {sourceRevision} from './build_locales.mjs';
const source=await fs.readFile(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
const messages=await fs.readFile(new URL('../site/viewer/source-assembly-messages.mjs',import.meta.url),'utf8');
const revision=body=>createHash('sha256').update(body.replaceAll('\r\n','\n')).digest('hex').slice(0,20);
let cacheChecks=0;
for(const[entry,target]of [
 ['source-assembly.mjs','source-assembly-messages.mjs'],
 ['source-assembly.mjs','source-assembly-ui-text.mjs'],
 ['source-assembly-ui-text.mjs','source-assembly-messages.mjs'],
 ['community-renderer.mjs','source-assembly.mjs'],
]){
 const parent=new URL('../site/viewer/'+entry,import.meta.url),child=new URL('./'+target,parent);
 const code=await fs.readFile(parent,'utf8'),expected=revision(await fs.readFile(child,'utf8'));
 const check=body=>{
  const match=[...body.matchAll(/(['"])(\.{1,2}\/[^'"\s?#]+\.(?:mjs|js))(?:\?v=([^'"\s]+))?\1/g)]
   .find(m=>new URL(m[2],parent).href===child.href);
  assert(match,'missing served dependency '+entry+' -> '+target);
  assert.equal(match[3],expected,'stale served dependency '+entry+' -> '+target);return match;
 };
 const match=check(code);assert.throws(()=>check(code.replace(match[0],match[0].replace(match[3],'obsolete'))));cacheChecks++;
}
const fn=(s,name)=>{const code=new RegExp('function '+name+'\\([^\\n]+').exec(s)?.[0];assert(code,name);return code;};
assert(!fn(source,'display').includes('visibleBounds'));
assert(!fn(source,'display').includes('placeSceneFill'));
assert(!fn(source,'placeSceneFill').includes('visibleBounds'));
assert.equal((source.match(/placeSceneFill\(/g)||[]).length,2);
assert(source.includes('grid.position.set(center.x,b.min.y-.0019,center.z);placeSceneFill(b);sync();view();'));
assert(source.includes("if(active?.snapshot().lighting==='rgb')chamber.color.setHSL((time/15000)%1,.65,.5)"));
assert(source.includes('scene.environment=environment.texture'));
const make=(code,box)=>{
 let walks=0,renders=0;
 const scene=new THREE.Scene(),environment={exactStudioEnvironment:true};scene.environment=environment;
 const light={value:'studio'},night={checked:false},gridControl={checked:false},grid={visible:false},renderer={};
 const initial=code.match(/const ambient=[^\n]+/)[0];
 const factory=new Function('THREE','scene','sceneLightingState','active','light','$','renderer','grid','document','render','visibleBounds',
   initial+'\n'+fn(code,'placeSceneFill')+'\n'+fn(code,'display')+'\nreturn {chamber,ambient,sun,placeSceneFill,display};');
 const actual=factory(THREE,scene,sceneLightingState,{snapshot:()=>({})},light,id=>id==='night'?night:gridControl,
   renderer,grid,{body:{dataset:{}}},()=>{renders++;},()=>{walks++;return box;});
 return {actual,scene,environment,light,night,grid,gridControl,renderer,walks:()=>walks,renders:()=>renders,
   load:()=>{actual.placeSceneFill(box);scene.updateMatrixWorld(true);}};
};
const direction=new THREE.Vector3(-.6,.85,1).normalize();
let displays=0;
const cases=[];
for(const scale of [.001,1,1000])for(const span of [.12,.7]){
 const center=new THREE.Vector3(12,-8,5).multiplyScalar(scale);
 const box=new THREE.Box3(center.clone().addScalar(-span*scale),center.clone().addScalar(span*scale));
 const c=make(source,box);c.load();
 assert(c.actual.chamber.isDirectionalLight);
 assert(!('distance'in c.actual.chamber)&&!('decay'in c.actual.chamber));
 assert(c.scene.children.includes(c.actual.chamber.target));
 const arithmetic=64*Number.EPSILON*Math.max(1,...center.toArray().map(Math.abs));
 assert(c.actual.chamber.target.position.distanceTo(center)<=arithmetic);
 const originalDirection=new THREE.Vector3().subVectors(c.actual.chamber.position,c.actual.chamber.target.position).normalize();
 assert(originalDirection.distanceTo(direction)<=arithmetic);
 for(let i=0;i<1000;i++){
  // Axis/source-root translations do not trigger another bounds walk in sync/display.
  box.translate(new THREE.Vector3(.0001,-.00005,.00002));
  c.light.value=['white','rgb','studio','off'][i%4];c.night.checked=Boolean(i%2);c.gridControl.checked=Boolean(i%3);
  c.actual.display();displays++;
  const settings=sceneLightingState({darkUI:c.night.checked});
  assert.equal(c.actual.chamber.intensity,['white','rgb'].includes(c.light.value)?.3:0);
  assert.strictEqual(c.scene.environment,c.environment,'Studio environment object was replaced');
  assert.equal(c.scene.environmentIntensity,c.light.value==='off'?0:settings.environmentIntensity);
  assert.equal(c.renderer.toneMappingExposure,settings.exposure);
  assert.equal(c.actual.ambient.intensity,c.light.value==='off'?.12:settings.ambientIntensity);
  assert.equal(c.actual.sun.intensity,c.light.value==='off'?0:1.4);
  assert.equal(c.grid.visible,c.gridControl.checked);
  assert(new THREE.Vector3().subVectors(c.actual.chamber.position,c.actual.chamber.target.position).normalize().distanceTo(originalDirection)<=arithmetic);
 }
 assert.equal(c.walks(),0,'sync/display traversed source bounds');
 cases.push({physical_scale:scale,scene_span:span,display_events:1000,bounds_walks:c.walks()});
}
const empty=make(source,new THREE.Box3()),emptyPosition=empty.actual.chamber.position.toArray();
empty.load();assert.deepEqual(empty.actual.chamber.position.toArray(),emptyPosition);
const pointMutant=source.replace('chamber=new THREE.DirectionalLight(0xffffff,0)','chamber=new THREE.PointLight(0xffffff,0,3)')
 .replace('scene.add(ambient,sun,chamber,chamber.target)','scene.add(ambient,sun,chamber)');
assert.notEqual(pointMutant,source);
assert.throws(()=>assert(make(pointMutant,new THREE.Box3()).actual.chamber.isDirectionalLight),'old distance-attenuated light escaped');
const walkMutant=source.replace('function display(){','function display(){placeSceneFill(visibleBounds());');
assert.notEqual(walkMutant,source);
const badWalk=make(walkMutant,new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)));
for(let i=0;i<1000;i++)badWalk.actual.display();
assert.equal(badWalk.walks(),1000);assert.throws(()=>assert.equal(badWalk.walks(),0));
const labels={
 en:{light:'Scene lighting',white:'White fill',rgb:'Color cycle (fill)'},
 ja:{light:'シーン照明',white:'白色の補助光',rgb:'補助光の色循環'},
 es:{light:'Iluminación de escena',white:'Luz auxiliar blanca',rgb:'Ciclo de color auxiliar'},
 ko:{light:'장면 조명',white:'흰색 보조광',rgb:'보조광 색상 순환'},
 ru:{light:'Освещение сцены',white:'Белый заполняющий свет',rgb:'Смена цвета подсветки'},
 de:{light:'Szenenbeleuchtung',white:'Weißes Fülllicht',rgb:'Farbwechsel (Fülllicht)'},
};
const central=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
const centralIDs={light:'source_assembly.scene_lighting',white:'source_assembly.white_fill',rgb:'source_assembly.color_fill'};
for(const[key,id]of Object.entries(centralIDs)){
 assert.equal(central.entries[id].ja,labels.ja[key]);assert.equal(central.entries[id].en,labels.en[key]);
 for(const language of ['es','ko','ru','de']){
  const d=JSON.parse(await fs.readFile(new URL('../localization/'+language+'.json',import.meta.url),'utf8'));
  assert.equal(d.messages[id].text,labels[language][key]);
  assert.equal(d.messages[id].source_revision,sourceRevision(central.entries[id]));
 }
}
const dataModule=body=>import('data:text/javascript;base64,'+Buffer.from(body).toString('base64'));
let futureCases=0;
for(const[language,row]of Object.entries(labels))for(const[key,value]of Object.entries(row)){
 assert.equal(sourceText(key,language),value);assert(Object.hasOwn(sourceMessages[language],key));
 const future='Future '+language+' '+key;
 assert.equal(messages.split(JSON.stringify(value)).length,2,'stable label has a duplicate assignment');
 const revised=messages.replace(JSON.stringify(value),JSON.stringify(future));
 const next=await dataModule(revised);assert.equal(next.sourceText(key,language),future);
 assert.deepEqual(Object.keys(next.sourceMessages[language]).sort(),Object.keys(sourceMessages[language]).sort());
 const stale=await dataModule(revised+'\nObject.assign(sourceMessages.'+language+',{'+key+':"obsolete"});');
 assert.throws(()=>assert.equal(stale.sourceText(key,language),future),'stale appended translation override escaped');futureCases++;
}
console.log(JSON.stringify({passed:true,source_light_scale_cases:cases,display_events:displays,sync_bounds_walks:0,served_dependency_cache_checks:cacheChecks,
 stable_language_rows:18,future_revision_cases:futureCases,negative_controls:['point attenuation','1000 sync walks','18 stale language overrides'],
 scope:'Exact production functions with actual Three light objects. Fixture scale/pose invariants, Studio state and stable message lookup only; actual model rendering and native fit are separate.'}));

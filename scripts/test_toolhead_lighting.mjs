import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {createToolheadLedRig,normalizeToolheadLedLevel,TOOLHEAD_LED_MAX_LEVEL,TOOLHEAD_LED_DEFAULT_LEVEL}=await import('../site/viewer/toolhead-lighting.mjs');
const {cloneNativeLedTree}=await import('../site/viewer/led-emission-surface.mjs');
const {sourceLedIdentity}=await import('../site/viewer/toolhead-led-identities.mjs');
const {lightingState}=await import('../site/viewer/lighting-state.mjs');

assert.equal(TOOLHEAD_LED_MAX_LEVEL,300);
assert.equal(TOOLHEAD_LED_DEFAULT_LEVEL,100);
const normalizationCases=[
 [0,0],[50,50],[100,100],[200,200],[300,300],[12.5,12.5],
 [' 200 ',200],['300',300],[null,0],['',0],[false,0],[true,1],
 [[],0],[[50],50],[{valueOf:()=>200},200],
 [-1,0],[-Number.MAX_VALUE,0],[301,300],[Number.MAX_VALUE,300],
 [undefined,0],[NaN,0],[Infinity,0],[-Infinity,0],['Infinity',0],['NaN',0],['invalid',0],[{},0]
];
for(const [value,expected]of normalizationCases){
 const normalized=normalizeToolheadLedLevel(value);
 assert.equal(normalized,expected,'Toolhead brightness must convert finite inputs and clamp 0..300');
 assert(Number.isFinite(normalized));
}

// Synthetic controller fixtures exercise coercion and lifecycle only. The actual
// exported SB stock / Rapido 2 HF / Xol geometry is checked by audit_led_lighting.
const brightnessScene=new THREE.Scene(),brightnessHead=new THREE.Group();brightnessScene.add(brightnessHead);
const brightnessMaterial=new THREE.MeshStandardMaterial({color:0xc5c2a3,metalness:.17,roughness:.45,emissive:0x091a2b,emissiveIntensity:.27});
const brightnessMeshes=['logo','nozzle','nozzle','guide'].map((kind,i)=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(.005,.005,.001),brightnessMaterial);
 mesh.name='brightness-fixture-'+kind+'-'+i;brightnessHead.add(mesh);return mesh;
});
const fixtureSource=new Map(brightnessMeshes.map(mesh=>[mesh,{geometry:mesh.geometry,material:mesh.material,
 positions:mesh.geometry.attributes.position.array.slice(),normals:mesh.geometry.attributes.normal.array.slice(),index:mesh.geometry.index.array.slice()}]));
const brightnessRig=createToolheadLedRig(brightnessScene,{
 identify:mesh=>{const i=brightnessMeshes.indexOf(mesh);return i>=0&&i<3?{id:'brightness-fixture-'+i,normal:[0,0,1],kind:i?'nozzle':'logo'}:null},
 apertureFor:()=>null,guideFor:mesh=>mesh===brightnessMeshes[3]?{id:'brightness-guide-fixture',emitter_id:'brightness-fixture-0'}:null
});
function checkNativeGuideOff(entry){
 assert.equal(entry.optical.enabled,0,'No matching powered LED may enable the guide response');
 for(const [i,m]of entry.materials.entries()){
  const native=[].concat(entry.originalMaterial)[i];
  assert(m.emissive.equals(native.emissive));assert.equal(m.emissiveIntensity,native.emissiveIntensity);
  assert(m.color.equals(native.color));assert.equal(m.metalness,native.metalness);assert.equal(m.roughness,native.roughness);
 }
}
const checkBrightness=(level,expected,{power=true}={})=>{
 const counts=brightnessRig.update({level,power,color:'red',effect:'static'}),gain=power?expected/100:0;
 assert.deepEqual(counts,{installed:3,lit:gain>0?3:0,registered:3});
 for(const e of brightnessRig.emitters){
  assert.equal(e.light.intensity,(e.identity.kind==='nozzle'?.004:.0015)*gain);
  assert(Number.isFinite(e.light.intensity));
  assert.equal(e.light.color.getHex(),e.identity.kind==='nozzle'?0xffffff:0xff1838);
  for(const m of e.surface.materials){assert.equal(m.emissiveIntensity,3.2*gain);assert(Number.isFinite(m.emissiveIntensity));assert(m.emissive.equals(e.light.color));}
 }
 const emitter=brightnessRig.emitters.find(e=>e.identity.id==='brightness-fixture-0');
 for(const g of brightnessRig.guides){if(gain>0){assert.equal(g.optical.enabled,1);for(const m of g.materials){assert.equal(m.emissiveIntensity,emitter.surface.materials[0].emissiveIntensity);assert(m.emissive.equals(emitter.light.color));}}else checkNativeGuideOff(g);}
 return brightnessRig.emitters.map(e=>({point:e.light.intensity,emissive:e.surface.materials[0].emissiveIntensity}));
};
const defaultCounts=brightnessRig.update();assert.equal(defaultCounts.lit,3);
for(const e of brightnessRig.emitters){assert.equal(e.surface.materials[0].emissiveIntensity,3.2);assert.equal(e.light.intensity,e.identity.kind==='nozzle'?.004:.0015);}
const prepared=new Map(brightnessMeshes.map(mesh=>[mesh,{geometry:mesh.geometry,material:mesh.material,
 positions:mesh.geometry.attributes.position.array.slice(),normals:mesh.geometry.attributes.normal.array.slice(),
 mask:mesh.geometry.attributes.ledEmissionMask?.array.slice()}]));
const samples=new Map();let previous;
for(const level of [0,50,100,200,300,100,0]){
 const current=checkBrightness(level,level);
 if(!samples.has(level)&&level>0)for(let i=0;i<current.length;i++){
  assert(current[i].point>previous[i].point,'Actual PointLight intensity must rise with the control');
  assert(current[i].emissive>previous[i].emissive,'Lens emission must rise with the control');
 }
 if(samples.has(level))assert.deepEqual(current,samples.get(level),'Reversed brightness must restore the same values');
 else samples.set(level,current);
 for(const [mesh,source]of prepared){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);
  assert.deepEqual(mesh.geometry.attributes.position.array,source.positions);assert.deepEqual(mesh.geometry.attributes.normal.array,source.normals);
  assert.deepEqual(mesh.geometry.attributes.ledEmissionMask?.array,source.mask);assert.equal(mesh.material.color.getHex(),brightnessMaterial.color.getHex());
  assert.equal(mesh.material.metalness,.17);assert.equal(mesh.material.roughness,.45);}
 previous=current;
}
for(let i=0;i<3;i++){assert.equal(samples.get(300)[i].point,samples.get(100)[i].point*3);assert.equal(samples.get(300)[i].emissive,samples.get(100)[i].emissive*3);}
for(const [value,expected]of normalizationCases)checkBrightness(value,value===undefined?TOOLHEAD_LED_DEFAULT_LEVEL:expected);
let conversions=0;checkBrightness({valueOf(){conversions++;return conversions===1?300:0}},300);assert.equal(conversions,1,'Normalize once for all emitters and lit status');
checkBrightness(300,300,{power:false});checkBrightness(300,300);
for(const delta of [[.04,.12,.08],[-.04,-.12,.08],[0,0,0]]){
 brightnessHead.position.set(...delta);brightnessScene.updateMatrixWorld(true);checkBrightness(300,300);
 for(const e of brightnessRig.emitters)assert(e.light.getWorldPosition(new THREE.Vector3()).equals(e.light.position.clone().add(brightnessHead.position)));
}
for(const mesh of brightnessMeshes.slice(0,3)){
 mesh.visible=false;assert.equal(brightnessRig.update({level:300}).lit,2);
 const e=brightnessRig.emitters.find(e=>e.mesh===mesh);assert.equal(e.light.intensity,0);assert.equal(e.surface.materials[0].emissiveIntensity,0);
 if(e.identity.kind==='logo')checkNativeGuideOff(brightnessRig.guides[0]);
 mesh.visible=true;checkBrightness(300,300);
}
brightnessHead.visible=false;assert.equal(brightnessRig.update({level:300}).lit,0);for(const e of brightnessRig.emitters)assert.equal(e.light.intensity,0);
checkNativeGuideOff(brightnessRig.guides[0]);brightnessHead.visible=true;
brightnessScene.remove(brightnessHead);assert.deepEqual(brightnessRig.update({level:300}),{installed:0,lit:0,registered:0});assert.equal(brightnessRig.guides.length,0);
for(const [mesh,source]of fixtureSource){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);assert(!mesh.userData.ledSurface&&!mesh.userData.ledGuide);assert.equal(mesh.children.length,0);}
brightnessScene.add(brightnessHead);checkBrightness(300,300);brightnessRig.dispose();brightnessRig.dispose();
assert.equal(brightnessRig.emitters.length,0);assert.equal(brightnessRig.guides.length,0);
for(const [mesh,source]of fixtureSource){assert.equal(mesh.geometry,source.geometry);assert.equal(mesh.material,source.material);
 assert.deepEqual(mesh.geometry.attributes.position.array,source.positions);assert.deepEqual(mesh.geometry.attributes.normal.array,source.normals);assert.deepEqual(mesh.geometry.index.array,source.index);assert.equal(mesh.children.length,0);}
const disco100=lightingState({installed:true,power:true,night:true,ready:true,level:100});
assert.equal(disco100.value,1);assert.deepEqual(lightingState({installed:true,power:true,night:true,ready:true,level:300}),disco100,'Disco keeps its independent 100% cap');

const scene=new THREE.Scene(),parent=new THREE.Group();scene.add(parent);
const mesh=new THREE.Mesh(new THREE.BoxGeometry(.005,.005,.001),new THREE.MeshStandardMaterial({color:0xc5c2a3}));mesh.name='fixture-native-logo';parent.add(mesh);
const original=mesh.geometry,originalMaterial=mesh.material;
const rig=createToolheadLedRig(scene,{identify:o=>o===mesh?{id:'fixture-source-disc',normal:[0,0,1],kind:'logo'}:null,apertureFor:()=>null});
assert.deepEqual(rig.update({power:true,color:'red'}),{installed:1,lit:1,registered:1});assert.equal(mesh.children.filter(o=>o.isPointLight).length,1);
assert.deepEqual(rig.emitters[0].light.matrixWorld.elements.slice(12,15),rig.emitters[0].light.position.toArray(),'The first render must use the attached LED position before another scene matrix update');
const initial=mesh.material.emissive.clone();rig.update({color:'rainbow',effect:'flow',seconds:0});const a=mesh.material.emissive.clone();rig.update({color:'rainbow',effect:'flow',seconds:1});assert(!mesh.material.emissive.equals(a));
for(const delta of [[0,0,0],[.08,.12,.2],[-.04,0,0],[0,0,0]]){parent.position.set(...delta);scene.updateMatrixWorld(true);const e=rig.emitters[0],actual=e.light.getWorldPosition(new THREE.Vector3());assert(actual.equals(e.light.position.clone().add(parent.position)));assert.equal(rig.update().installed,1);}
parent.visible=false;assert.equal(rig.update().installed,0);assert.equal(rig.emitters[0].light.intensity,0);assert.equal(mesh.material.emissiveIntensity,0);
parent.visible=true;assert.equal(rig.update({power:false}).lit,0);assert.equal(rig.emitters[0].light.intensity,0);assert.equal(rig.update({power:true}).lit,1);
assert.equal(sourceLedIdentity(new THREE.Mesh(new THREE.BoxGeometry(.005,.005,.001),originalMaterial)),null,'Unknown purchased object must not become an LED');
const optical=new THREE.Mesh(new THREE.BoxGeometry(.005,.005,.001),originalMaterial);optical.name='a4t106_led_diffuser';assert.equal(sourceLedIdentity(optical),null,'A4T printed diffuser is not an installed LED');
parent.remove(mesh);assert.equal(rig.update().registered,0);assert.equal(mesh.geometry,original);assert.equal(mesh.material,originalMaterial);assert.equal(mesh.children.length,0);
parent.add(mesh);assert.equal(rig.update().installed,1,'Reattached native emitter must be registered again');assert.equal(mesh.children.filter(o=>o.isPointLight).length,1);
rig.dispose();assert.equal(rig.emitters.length,0);
const guide=new THREE.Mesh(new THREE.BoxGeometry(.002,.002,.001),originalMaterial),parked=new THREE.Group();parked.add(guide);scene.add(parked);
const bank=new THREE.Group();scene.add(bank);bank.add(parent,parked);
const guided=createToolheadLedRig(scene,{identify:o=>o===mesh?{id:'fixture-source-disc',normal:[0,0,1],kind:'logo'}:null,apertureFor:()=>null,guideFor:o=>o===guide?{id:'fixture-source-guide',emitter_id:'fixture-source-disc'}:null});
guided.update();checkNativeGuideOff(guided.guides[0]);
parent.add(guide);guided.update();assert(guide.material.emissiveIntensity>0);assert(guide.material.emissive.equals(mesh.material.emissive));
originalMaterial.color.set('#00ffff');guided.update();assert.equal(guide.material.color.getHexString(),'00ffff','A printed optical guide must keep following its palette');
const nativeClone=cloneNativeLedTree(parent),clonedEmitter=nativeClone.children.find(o=>o.name===mesh.name),clonedGuide=nativeClone.children.find(o=>o.isMesh&&o!==clonedEmitter);assert.equal(clonedEmitter.geometry,original);assert.equal(clonedEmitter.children.length,0);assert(!clonedEmitter.userData.ledSurface);assert(!clonedGuide.userData.ledGuide);assert.equal(clonedGuide.material,originalMaterial);assert(mesh.userData.ledSurface);assert(guide.userData.ledGuide);assert.equal(mesh.children.filter(o=>o.isPointLight).length,1);
guided.update({power:false});checkNativeGuideOff(guided.guides[0]);assert.equal(guide.material.color.getHex(),originalMaterial.color.getHex());
guided.dispose();assert.equal(guide.material,originalMaterial);assert.equal(mesh.geometry,original);
console.log('Toolhead LED controller: 0..300 normalization, default 100, exact 3x point/lens/guide brightness, reverse/zero/off, source-only targeting, RGB timing, motion, hidden/obsolete roots, material/mask isolation and teardown passed. Fixture tests only; no physical photometric certification.');

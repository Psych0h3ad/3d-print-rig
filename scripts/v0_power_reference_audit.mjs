// Independent original-source ownership and actual controller lifecycle checks.
// Visibility, source frames and material restoration do not certify mounting.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const raw=fs.readFileSync(new URL('../site/viewer/data/v0-power-references.source.json',import.meta.url));
export const reviewedPowerSHA256='f4b455722cd1878a7de8d6566cd4ab2bd8f5c3f6b5fb0de37625cd468a4ceded';
assert.equal(createHash('sha256').update(raw).digest('hex'),reviewedPowerSHA256,'Reviewed source power references changed');
const review=JSON.parse(raw);
const names=['electronics-psu-voltage','electronics-psu','electronics-mains','electronics-mains-acdc','electronics-mains-inlet-prewire','electronics-mains-inlet-install','electronics-mains-psu','electronics-dc','electronics-dc-hotend','electronics-dc-motors','electronics-dc-controller','electronics-dc-pi','electronics-guard'];
export function reviewedPower(id){assert(Object.hasOwn(review,id));return structuredClone(review[id]);}
export function auditPowerOwnership({id,spec,manifest,references}){
 const r=reviewedPower(id),parts=new Map(manifest.parts.map(p=>[p.key,p]));
 assert.equal(parts.size,manifest.parts.length);assert.deepEqual(references[id],r,'Received data must match independent reviewed source');
 assert.equal(spec.model_sha256,r.model);assert.equal(spec.manifest_sha256,r.manifest);assert.deepEqual(spec.manual,r.manual);
 assert.deepEqual(r.operations.map(o=>o.id),names);const at=n=>spec.stages.findIndex(s=>s.id===n),refs=new Set();let owned=0;
 assert.deepEqual(spec.stages.slice(at(names[0]),at(names.at(-1))+1).map(s=>s.id),[...names.slice(0,2),'electronics-fan',...names.slice(2)]);
 for(const o of r.operations){const s=spec.stages[at(o.id)];assert.equal(spec.stages.filter(s=>s.id===o.id).length,1);for(const k of ['title','title_ja','page_start','page_end','part_keys','operation_part_keys','note'])assert.deepEqual(s[k],o[k]);owned+=o.part_keys.length;assert.equal(o.sourceElectricalConnectionAccepted,false);
  for(const key of o.operation_part_keys){refs.add(key);const p=parts.get(key),d=r.descriptors[key];assert(p&&d,'Missing exact source owner '+key);assert.equal(p.name,d.name);assert.deepEqual(p.source,d.source);}
 }
 const key=n=>(id==='voron_v02r1_120'?'v02r1_':'v02_')+String(n).padStart(5,'0'),r1=id==='voron_v02r1_120';
 assert.deepEqual(spec.stages[at('electronics-psu-voltage')].part_keys,[key(r1?1677:1652)]);
 assert.deepEqual(spec.stages[at('electronics-mains-inlet-prewire')].part_keys,[key(r1?589:582)]);
 assert.deepEqual(spec.stages[at('electronics-guard')].part_keys,[key(r1?1676:1651)]);assert.equal(owned,3);
 assert.deepEqual(spec.stages[at('electronics-mains-inlet-install')].operation_part_keys,[key(r1?589:582),key(r1?602:581)]);
 assert.deepEqual(spec.stages[at('electronics-dc-controller')].operation_part_keys,spec.stages[at('electronics-control-board')].part_keys);
 assert.equal(spec.stages[at('electronics-dc-controller')].operation_part_keys.length,739);
 return {operations:13,introducedSourceKeys:owned,referencedSourceKeys:refs.size,purchasedControllerLeaves:739,exactManualAndSourceOwners:true,electricalQualified:false,physicalFitQualified:false};
}
export function applyReviewedPowerMask({id,index,spec,keys,result}){
 const at=n=>spec.stages.findIndex(s=>s.id===n),r=review[id],row=r.operations.find(o=>o.id===spec.stages[index].id),psu=r.operations[0].part_keys[0],inlet=r.operations[4].part_keys[0];
 const isolated=row&&['electronics-psu-voltage','electronics-mains-inlet-prewire'].includes(row.id);
 for(const k of keys)if(isolated?!row.operation_part_keys.includes(k):(k===psu&&index<at('electronics-psu'))||(k===inlet&&index<at('electronics-mains-inlet-install')))keys.delete(k);
 if(row){assert.equal(result.subassembly,!!isolated);assert.deepEqual(result.operation_part_keys,row.operation_part_keys);assert.equal(result.presentation_label,isolated?'Prepared power component reference':'Power and wiring reference');assert.equal(result.underside,['electronics-psu','electronics-guard'].includes(row.id));}
 return row;
}
export async function auditActualPowerDisplay({THREE,id,module,adapter,manifest,spec,receipts,companions,scene,geometryPins,createAssemblyStageEmphasis,assemblySourceMaterial,registry}){
 const options={nodes:adapter.nodes,manifest,machine:spec,receipts,companions,manualPreparation:true,sourceDerivedFastenerSeating:true};
 options.m2SeatingReceipt=await module.prepareV0AssemblyM2Seating(options);
 const c=module.createV0AssemblyStages(options),emphasis=createAssemblyStageEmphasis(),at=n=>spec.stages.findIndex(s=>s.id===n),reviewed=review[id],observations=[];
 const mats=n=>n.material?(Array.isArray(assemblySourceMaterial(n))?assemblySourceMaterial(n):[assemblySourceMaterial(n)]):[],values=m=>[m.color?.getHex(),m.opacity,m.transparent,m.depthWrite,m.metalness,m.roughness,m.emissive?.getHex(),m.emissiveIntensity];
 scene.updateMatrixWorld(true);const baseline=[];scene.traverse(n=>baseline.push({n,parent:n.parent,children:[...n.children],position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),world:n.matrixWorld.toArray(),geometry:n.geometry,material:n.material,mats:mats(n),values:mats(n).map(values),visible:n.visible}));
 const byNode=new Map(baseline.map(r=>[r.n,r])),geometry=geometryPins(scene),native=new Map([...adapter.nodes].map(([k,n])=>[k,n.visible])),companionKeys=new Set(companions.flatMap(c=>c.part_keys));
 c.setStage(at('mid-panel-alignment'));scene.updateMatrixWorld(true);const manual=new Map(baseline.map(r=>[r.n,{position:r.n.position.toArray(),quaternion:r.n.quaternion.toArray(),scale:r.n.scale.toArray(),world:r.n.matrixWorld.toArray()}]));
 const selected=new Set(reviewed.operations.flatMap(o=>o.operation_part_keys));for(const k of selected)adapter.nodes.get(k).traverse(n=>{for(const f of ['position','quaternion','scale','world'])assert.deepEqual(manual.get(n)[f],byNode.get(n)[f],'Power source frame changed '+k);});
 function structure(inGuide){scene.updateMatrixWorld(true);for(const r of baseline){const expected=inGuide?manual.get(r.n):r;assert.equal(r.n.parent,r.parent);assert.deepEqual(r.n.children,r.children);assert.equal(r.n.geometry,r.geometry);for(const f of ['position','quaternion','scale'])assert.deepEqual(r.n[f].toArray(),expected[f]);assert.deepEqual(r.n.matrixWorld.toArray(),expected.world);assert.deepEqual(mats(r.n),r.mats);}}
 c.leave();structure(false);
 const psu=reviewed.operations[0].part_keys[0],inlet=reviewed.operations[4].part_keys[0];
 function visit(name,gray=false){const i=at(name),stage=spec.stages[i],refs=stage.operation_part_keys,keys=new Set(spec.stages.slice(0,i+1).flatMap(s=>s.part_keys));
  // These operations follow all mount/cleat/board installations. The prepared
  // fan remains stored until its unchanged intervening installation operation.
  if(i<at('electronics-fan'))for(const k of spec.stages[at('electronics-fan-inserts')].part_keys)keys.delete(k);
  const state=c.setStage(i);applyReviewedPowerMask({id,index:i,spec,keys,result:state});const expected=[...keys].filter(k=>native.get(k)||companionKeys.has(k));
  assert.deepEqual(new Set(c.getVisibleKeys()),new Set(expected));for(const k of c.getBoundsKeys())assert(expected.includes(k));
  for(const k of registry.machines[id].native_alternatives.excluded_keys)assert.equal(adapter.nodes.get(k).visible,false);
  if(['electronics-psu-voltage','electronics-mains-inlet-prewire'].includes(name))assert.deepEqual(expected,refs,'Keep complete purchased unit isolated');
  if(i<at('electronics-mains-inlet-install')&&name!=='electronics-mains-inlet-prewire')assert(!expected.includes(inlet));
  assert(state.camera_direction.length===3&&state.camera_direction.every(Number.isFinite));assert.equal(state.camera_distance_floor,state.subassembly?.05:.24);
  emphasis.update({parts:c.getDisplayedParts(),currentKeys:refs,enabled:gray});let dimmed=0;
  for(const p of c.getDisplayedParts())for(const root of p.nodes)root.traverse(n=>{if(!n.isMesh)return;if(refs.includes(p.key))assert.equal(n.material,assemblySourceMaterial(n),'Current/reused power reference must retain source material');else if(gray){assert.notEqual(n.material,assemblySourceMaterial(n));dimmed++;}});
  structure(true);emphasis.clear();for(const r of baseline)assert.equal(r.n.material,r.material);
  return {id:name,shown:expected.length,operationRefs:refs.length,gray,isolated:state.subassembly,earlierMeshesDimmed:dimmed};
 }
 for(const name of names)observations.push(visit(name));for(const name of [...names].reverse())visit(name);
 for(const name of ['electronics-psu','electronics-mains-inlet-install','electronics-guard'])assert(visit(name,true).earlierMeshesDimmed>0);
 // A source visibility failure must leave the previously committed operation.
 visit('electronics-guard');const previous=c.getVisibleKeys(),node=adapter.nodes.get(psu),descriptor=Object.getOwnPropertyDescriptor(node,'visible');Object.defineProperty(node,'visible',{...descriptor,writable:false});
 try{assert.throws(()=>c.setStage(at('electronics-mains-inlet-prewire')),/Native visibility/);}finally{Object.defineProperty(node,'visible',descriptor);}
 assert.equal(c.current().id,'electronics-guard');assert.deepEqual(c.getVisibleKeys(),previous);structure(true);c.leave();
 const purchased=new Set([psu,inlet,...spec.stages[at('electronics-control-board')].part_keys,...spec.stages[at('electronics-pi-board')].part_keys]);for(const k of purchased)assert(!['base','accent'].includes(adapter.records.get(k).appearance_role));
 for(const palette of [{base:'#17385d',accent:'#f2ca37'},{base:'#f2ca37',accent:'#17385d'},{base:'#92cbb4',accent:'#542646'}]){adapter.setPalette(palette);for(const k of selected)adapter.nodes.get(k).traverse(n=>{if(!n.isMesh)return;const r=byNode.get(n),role=adapter.records.get(k).appearance_role;for(let j=0;j<r.mats.length;j++){const m=r.mats[j];if(!m.color)continue;if(palette[role])assert.equal(m.color.getHex(),new THREE.Color(palette[role]).getHex());else assert.equal(m.color.getHex(),r.values[j][0],'Purchased power color changed '+k);}});visit('electronics-guard',true);c.leave();}
 for(const r of baseline)for(let j=0;j<r.mats.length;j++)if(r.mats[j].color)r.mats[j].color.setHex(r.values[j][0]);
 structure(false);assert.deepEqual(geometryPins(scene),geometry);for(const r of baseline){assert.equal(r.n.visible,r.visible);assert.equal(r.n.material,r.material);assert.deepEqual(mats(r.n).map(values),r.values);}emphasis.dispose();
 return {observations,operationsForward:13,operationsReverse:13,grayJumps:3,separatePalettes:3,visibilityFailureCases:1,selectedSourceKeys:selected.size,purchasedSourceKeys:purchased.size,allSelectedFramesEqualOriginal:true,allNativeMatricesMaterialsVisibilityRestored:true,fullGeometryBuffersUnchanged:true,electricalQualified:false,physicalFitQualified:false,scope:'Thirteen source power operations and reversed visits, three gray jumps and three separate guard palettes, one reversible visibility failure; unchanged source frames and complete restoration. No insertion, retention, electrical completion, native clearance or Cartesian-product claim.'};
}

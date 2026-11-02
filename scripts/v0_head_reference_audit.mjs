import assert from 'node:assert/strict';

// Independently reviewed official V0.2 pp151–182 and V0.2r1 pp157–188.
// Canonical integers are V0.2 original source occurrence keys. These are
// reference masks/identities, not insertion, thread or native-contact proof.
export function reviewedHeadKey(id,n){const r1=id==='voron_v02r1_120';assert(r1||id==='voron_v02_120');return(r1?'v02r1_':'v02_')+String(n+(r1?(n<=345?8:9):0)).padStart(5,'0')}
export function reviewedHeadCohort(id){const start=id==='voron_v02r1_120'?349:341,count=id==='voron_v02r1_120'?100:99,prefix=id==='voron_v02r1_120'?'v02r1_':'v02_';return Array.from({length:count},(_,i)=>prefix+String(start+i).padStart(5,'0'))}
// Explicitly synthetic metadata for controller lifecycle fixtures. Actual
// release jobs must use received model manifests, never this helper.
export function attachHeadFixtureMetadata(parts,id){const cohort=new Set(reviewedHeadCohort(id));for(const p of parts)if(cohort.has(p.key))p.source={assembly_path:['Mini Stealthburner:1']};return parts}
export function reviewedHeadViews(id){
 const k=n=>reviewedHeadKey(id,n),cowling=[351,352,394,399,401],shuttle=[341,408],spacers=[346,347,398,402,405,407],midbody=[344,364,395,397,400,403,404],guidler=[343,356,357,358,359,373],plate=[350,392,360],hotend=[349,412,413,414,415,416,417],views=new Map();let core=[];
 const row=(name,page,{show,add=[],isolated=true}={})=>{core=[...new Set([...core,...add])];views.set(name,{page:page+(id==='voron_v02r1_120'?6:0),isolated,shown:new Set((show||core).map(k))})};
 row('head-prep',151,{show:cowling});row('head-shuttle-prep',151,{show:shuttle});row('head-spacers-prep',151,{show:spacers});row('head-midbody-prep',152,{show:midbody});
 row('head-carriage-review',152,{show:[345,396,406]});if(id==='voron_v02r1_120')views.get('head-carriage-review').shown.add('v02r1_00354');
 row('head-guidler',153,{show:guidler});row('head-shaft-check',154,{show:[362,360,363]});row('head-motorplate-prep',155,{show:plate});
 row('head-front-bearing',156,{add:[...cowling,363]});row('head-shuttle-install',156,{add:shuttle});row('head-guidler-install',156,{add:guidler});row('head-latch-install',156,{add:[342]});
 row('head-midbody-join',157,{add:[...midbody,371,369,385,386,387]});row('head-drive-gear',158,{add:[361,362]});row('head-motorplate-close',159,{add:[...plate,377,378,382]});
 row('head-gear-spacing',160);row('head-drive-align',161);row('head-tension',162,{add:[354,355]});row('head-latch-check',163);row('head-feed-check',164);
 row('head-fan-first',165,{add:[410]});row('head-fan-axial',166,{add:[409]});row('head-fan-second',167,{add:[411]});row('head-led-supplement',167,{add:Array.from({length:14},(_,i)=>418+i)});
 row('head-motor',168,{add:[353,384]});row('head-motor-slot',169,{add:[383]});row('head-open-latch',170);row('head-backlash',171);row('head-motor-tighten',172);row('head-hotend-choice',173);
 row('head-hotend',174,{show:hotend.filter(n=>n!==417)});row('head-hotend-tube',174,{show:hotend});row('head-tube-length',175,{show:hotend});row('head-tube-jig',176,{show:hotend});row('head-close',177,{add:[...hotend,372,388]});
 row('head-install',178,{isolated:false});row('head-rear-fixing',179,{isolated:false});row('head-strain-relief',180,{isolated:false});row('head-wire-ties',181,{isolated:false});row('head-wire-path',182,{isolated:false});row('head-adxl-supplement',182,{isolated:false});
 assert.equal(views.size,41);return {views,spacers:new Set(spacers.map(k))};
}
export function auditHeadOwnership({id,spec,manifest}){
 const k=n=>reviewedHeadKey(id,n),heads=spec.stages.filter(s=>s.id.startsWith('head-')),r=reviewedHeadViews(id),owner=n=>heads.find(s=>s.part_keys.includes(k(n)))?.id;
 assert.deepEqual(heads.map(s=>s.id),[...r.views.keys()]);assert.equal(new Set(heads.flatMap(s=>s.part_keys)).size,86);
 for(const s of heads){assert.equal(s.page_start,r.views.get(s.id).page);assert.equal(s.page_end,s.page_start)}
 for(const n of [369,385,371,386,387])assert.equal(owner(n),'head-midbody-join','Original lower M3x10 and three M3x25 at the Midbody operation');
 for(const n of [377,378,382])assert.equal(owner(n),'head-motorplate-close','Plate M3x10 is separate from lower Cowling screws');
 assert.equal(owner(384),'head-motor');assert.equal(owner(383),'head-motor-slot');
 assert.deepEqual(spec.stages.find(s=>s.id==='head-install').part_keys,[],'Front head screws are reused, not added twice');for(const n of [372,388,345])assert(spec.stages.find(s=>s.id==='head-install').operation_part_keys.includes(k(n)));
 const actual=manifest.parts.filter(p=>p.source?.assembly_path?.includes('Mini Stealthburner:1')).map(p=>p.key).sort();assert.deepEqual(actual,reviewedHeadCohort(id));
 return {operations:41,originalSourceCohort:actual.length,originalHeadOperationLeaves:86,referenceOnly:true,physicalFitCertified:false};
}
export function applyReviewedHeadMask({id,index,spec,keys,result}){
 const {views,spacers}=reviewedHeadViews(id),view=views.get(spec.stages[index].id);if(!view)return null;
 const before=new Set(keys),strain=spec.stages.findIndex(s=>s.id==='head-strain-relief');for(const key of keys)if(view.isolated?!view.shown.has(key):index<strain&&spacers.has(key))keys.delete(key);
 assert.equal(result.subassembly,view.isolated);assert.deepEqual(new Set(result.stored_keys),new Set([...before].filter(k=>!keys.has(k))));
 return view;
}
export async function auditActualHeadDisplay({id,module,adapter,manifest,spec,receipts,companions,scene,installed,geometryPins,createAssemblyStageEmphasis,assemblySourceMaterial}){
 const original=new Map(),values=new Map();scene.updateMatrixWorld(true);scene.traverse(n=>{original.set(n,{visible:n.visible,position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),material:n.material});for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])if(!values.has(m))values.set(m,m.color?.clone())});const geometry=geometryPins(scene);
 const options={nodes:adapter.nodes,manifest,machine:spec,receipts,companions,manualPreparation:true,sourceDerivedFastenerSeating:true};const token=await module.prepareV0AssemblyM2Seating(options),c=module.createV0AssemblyStages({...options,m2SeatingReceipt:token}),display=createAssemblyStageEmphasis(),visits=[];
 const currentMeshes=keys=>{const out=new Set();for(const p of c.getDisplayedParts())if(keys.includes(p.key))for(const n of p.nodes)n.traverse(n=>{if(n.isMesh)out.add(n)});return out};
 for(const name of ['head-motor','head-motor-slot','head-install']){
  const i=spec.stages.findIndex(s=>s.id===name);c.setStage(i);const keys=spec.stages[i].operation_part_keys,parts=c.getDisplayedParts(),current=currentMeshes(keys);display.update({parts,currentKeys:keys,enabled:true});let dim=0,source=0;
  for(const p of parts)for(const root of p.nodes)root.traverse(n=>{if(!n.isMesh)return;if(current.has(n)){assert.equal(n.material,assemblySourceMaterial(n));source++}else{assert.notEqual(n.material,assemblySourceMaterial(n));for(const m of Array.isArray(n.material)?n.material:[n.material]){assert.equal(m.color.getHex(),0x9ba2aa);assert(m.opacity<=.24)}dim++}});
  assert(source>0&&dim>0);c.current();display.clear();for(const[n,r]of original)assert.equal(n.material,r.material);visits.push({id:name,currentSourceMeshes:source,dimmedEarlierMeshes:dim});
 }
 c.leave();
 const palettes=[{base:'#173c68',accent:'#edd13e'},{base:'#edd13e',accent:'#173c68'},{base:'#a4d2bc',accent:'#602843'}];for(const palette of palettes){adapter.setPalette(palette);installed.setPalette(palette);const i=spec.stages.findIndex(s=>s.id==='head-motor-slot');c.setStage(i);display.update({parts:c.getDisplayedParts(),currentKeys:spec.stages[i].operation_part_keys,enabled:true});c.current();display.clear();c.leave()}
 installed.setPalette({});for(const[m,color]of values)if(color)m.color.copy(color);for(const[n,r]of original){assert.equal(n.material,r.material);assert.equal(n.visible,r.visible);assert.deepEqual(n.position.toArray(),r.position);assert.deepEqual(n.quaternion.toArray(),r.quaternion);assert.deepEqual(n.scale.toArray(),r.scale)}assert.deepEqual(geometryPins(scene),geometry);display.dispose();
 return{visits,separatePalettes:palettes.length,originalRestored:true,originalSourceMaterialsRetained:true,fullGeometryContentRetained:true,scope:'Three selected head display operations and three separate palettes on current original model/stock companion. Not their Cartesian product, full trim/contact or physical assembly certification.'};
}

import assert from 'node:assert/strict';

// Run against the received complete source model and stock companion. This
// checks the manual-only reference transform, not threads or physical fit.
export async function auditV0M2Reference({module,adapter,manifest,spec,receipts,companions,scene,geometryPins,createAssemblyStageEmphasis,assemblySourceMaterial}){
 const r1=manifest.machine_id==='voron_v02r1_120',key=n=>(r1?'v02r1_':'v02_')+String(n).padStart(5,'0');
 const ids=(r1?[271,274,275,276,300,301,302,303]:[269,272,273,274,295,296,297,298]).map(key),moves=new Map(ids.map((k,i)=>[k,i<4?.0001:.0009]));
 const baseline=()=>{scene.updateMatrixWorld(true);return new Map([...adapter.nodes].map(([k,n])=>[k,{position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),world:n.matrixWorld.toArray(),geometry:n.geometry,material:n.material,visible:n.visible}]))};
 const original=baseline(),geometry=geometryPins(scene),options={nodes:adapter.nodes,manifest,machine:spec,receipts,companions,manualPreparation:true,sourceDerivedFastenerSeating:true};
 const token=await module.prepareV0AssemblyM2Seating(options),note=spec.stages[0].note;spec.stages[0].note=(note||'')+' stale';assert.throws(()=>module.createV0AssemblyStages({...options,m2SeatingReceipt:token}),/Missing current exact/);if(note===undefined)delete spec.stages[0].note;else spec.stages[0].note=note;
 const c=module.createV0AssemblyStages({...options,m2SeatingReceipt:token});assert.throws(()=>module.createV0AssemblyStages({...options,m2SeatingReceipt:token}),/Missing current exact/);
 const installed=spec.stages.findIndex(s=>s.id==='x-install'),visits=[...spec.stages.keys(),...spec.stages.keys()].map((i,j)=>j<spec.stages.length?i:spec.stages.length-1-i),observations=[];
 for(const i of visits){
  const current=c.setStage(i);scene.updateMatrixWorld(true);assert.equal(current.manual_fastener_reference,i>=installed);
  // Before installation, the independent preparation policies can move their
  // own original source cohorts. The eight M2 fasteners are disjoint.
  for(const[k,delta]of moves){const n=adapter.nodes.get(k),before=original.get(k);assert.equal(n.geometry,before.geometry);assert.equal(n.material,before.material);for(let j=0;j<16;j++)assert(Math.abs(n.matrixWorld.elements[j]-before.world[j]-(i>=installed&&j===12?delta:0))<1e-12,'Exact manual-only source fastener translation '+k)}
  assert.deepEqual(geometryPins(scene),geometry);observations.push({id:current.id,index:i,manualFastenerReference:current.manual_fastener_reference,visible:current.visible_count});
 }
 c.setStage(installed-1);const previous=baseline(),victim=adapter.nodes.get(ids[2]),update=victim.updateMatrix;let injected=false;
 victim.updateMatrix=function(){if(!injected&&Math.abs(this.position.x-original.get(ids[2]).position[0])>1e-7){injected=true;throw Error('Controlled manual fastener update failure')}return update.call(this)};
 assert.throws(()=>c.setStage(installed),/Controlled manual fastener/);victim.updateMatrix=update;assert(injected);assert.equal(c.current().index,installed-1);assert.deepEqual(baseline(),previous);
 c.setStage(installed);const display=createAssemblyStageEmphasis(),beforeDisplay=baseline();display.update({parts:c.getDisplayedParts(),currentKeys:spec.stages[installed].part_keys,enabled:true});
 assert.equal(c.current().id,'x-install');for(const k of ids)assert.equal(adapter.nodes.get(k).material,original.get(k).material,'Current source fasteners retain original hardware material');
 const receiver=adapter.nodes.get(key(r1?56:54)),displayMaterial=receiver.material;assert.notEqual(displayMaterial,original.get(key(r1?56:54)).material);assert.equal(assemblySourceMaterial(receiver),original.get(key(r1?56:54)).material);
 receiver.material=displayMaterial.clone();const foreign=receiver.material;assert.throws(()=>c.current(),/outside its owner/);receiver.material=displayMaterial;foreign.dispose();c.current();display.dispose();assert.deepEqual(baseline(),beforeDisplay);
 c.leave();assert.deepEqual(baseline(),original);assert.deepEqual(geometryPins(scene),geometry);
 return{sourceFasteners:8,receivedSourceTargets:12,states:observations,staleStageRejected:true,oneUseReceipt:true,partialFailureWholeSourceRollback:true,controlledEarlierPartDisplayLease:true,currentFastenersOriginalHardwareMaterial:true,foreignDisplayReplacementRejected:true,originalTransformsMaterialsGeometryVisibilityRestored:true,physicalFitCertified:false};
}

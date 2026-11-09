import {Box3,Vector3} from './vendor-r180/three.module.js';
import {tridentPanelProfile,tridentPanelPresentationID} from './trident-panel-manual.mjs?v=2fda5c71863db6cdf37d';
const fail=s=>{throw Error('Trident panel presentation: '+s)};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
// These are source-rigid preparation diagrams, never insertion trajectories.
// Disjoint display slots do not qualify internal mating/contact or retention.
export function createTridentPanelStagePresentation(profile,loaded,scene,snapshots){
 const spec=tridentPanelProfile();
 if(profile!==tridentPanelPresentationID||loaded?.source?.machineId!==spec.machine||loaded.source.configuration!==spec.configuration||loaded.root.parent!==scene||loaded.inspection.active()!==true)fail('Unregistered or inactive source profile');
 const c=loaded.inspection.components.find(c=>c.path===spec.component);
 if(!c||['bytes','sha256'].some(k=>c.metadata[k]!==spec.metadata[k]||c.model[k]!==spec.model[k]))fail('Received source profile changed');
 const prefix=spec.component+'#'+spec.machine+'_base_',owned=new Map(),byKey=new Map(snapshots.map(s=>[s.key,s]));
 for(const p of spec.parts){const key=spec.component+'#'+p.key,s=byKey.get(key);if(!s||owned.has(key)||!equal(s.matrix,identity)||!equal(s.n.matrix.elements,identity)||!equal(s.n.parent.matrixWorld.elements,identity)||s.n.children.length||!s.n.matrixAutoUpdate)fail('Source frame or occurrence changed');owned.set(key,s)}
 if(owned.size!==150)fail('Incomplete original panel sources');
 const allBox=new Box3();for(const s of snapshots)allBox.union(new Box3().setFromObject(s.n));
 if(allBox.isEmpty()||![...allBox.min.toArray(),...allBox.max.toArray()].every(Number.isFinite))fail('Nonfinite source extent');
 const stageIndex=new Map(spec.stages.map((s,i)=>[s.id,i]));
 const boxes=new Map(),cohorts=spec.cohorts.map(c=>({...c,keys:c.sourceIDs.map(id=>prefix+id)})),doors={};
 const boxFor=keys=>{const box=new Box3();for(const key of keys){const s=owned.get(key);if(!s)fail('Unknown preparation source');box.union(new Box3().setFromObject(s.n))}if(box.isEmpty())fail('Empty preparation cohort');return box};
 const claimed=new Set();for(const c of cohorts){for(const key of c.keys){if(claimed.has(key))fail('Source appears in two preparation cohorts');claimed.add(key)}boxes.set(c.id,boxFor(c.keys));if(!stageIndex.has(c.intro)||!stageIndex.has(c.install)||stageIndex.get(c.intro)>=stageIndex.get(c.install))fail('Invalid preparation lifecycle')}
 if(claimed.size!==150)fail('Unassigned preparation source');
 for(const side of ['right','left']){const keys=spec.doorGroups[side].map(id=>prefix+id);doors[side]={keys,box:boxFor(keys),slot:side==='right'?10:11};boxes.set('door-'+side,doors[side].box)}
 const maxSize=new Vector3();for(const box of boxes.values())maxSize.max(box.getSize(new Vector3()));
 const gap=.04,strideX=maxSize.x+gap,strideY=maxSize.y+gap,centre=allBox.getCenter(new Vector3());
 const offset=(box,slot)=>{const source=box.getCenter(new Vector3()),target=new Vector3(centre.x+((slot%4)-1.5)*strideX,allBox.min.y+gap+Math.floor(slot/4)*strideY+maxSize.y/2,allBox.max.z+gap+maxSize.z/2);return target.sub(source).toArray()};
 const prepared=new Map(cohorts.map(c=>[c.id,offset(boxes.get(c.id),c.slot)]));
 const joined=new Map(['right','left'].map(side=>[side,offset(doors[side].box,doors[side].slot)]));
 let offsets=new Map([...owned].map(([key])=>[key,[0,0,0]])),revision=0,failed=false;
 const updateRoot=loaded.root.updateMatrixWorld;
 const methods=new Map([...owned].map(([key,s])=>[key,{position:s.n.position,set:s.n.position.set,update:s.n.updateMatrix}]));
 function preflight(){if(failed)fail('Preparation transaction is retired');if(loaded.root.parent!==scene||loaded.inspection.active()!==true||loaded.root.updateMatrixWorld!==updateRoot)fail('Preparation owner or update method changed');for(const[key,s]of owned){const n=s.n,m=methods.get(key);if(n.parent!==s.parent||n.position!==m.position||!n.matrixAutoUpdate||n.position.set!==m.set||n.updateMatrix!==m.update||!equal(n.parent.matrixWorld.elements,identity)||!equal(n.quaternion.toArray(),[0,0,0,1])||!equal(n.scale.toArray(),[1,1,1]))fail('Unowned pose mutation');for(const axis of ['x','y','z']){const d=Object.getOwnPropertyDescriptor(n.position,axis);if(!d||!('value'in d)||!d.writable)fail('Unwritable preparation pose')}}}
 function expected(s){const d=offsets.get(s.key);if(!d)return s.matrix;const a=s.matrix.slice();a[12]+=d[0];a[13]+=d[1];a[14]+=d[2];return a}
 function plan(stage){const result=new Map([...owned].map(([key])=>[key,[0,0,0]]));if(stage===null||!stageIndex.has(stage))return result;const i=stageIndex.get(stage);for(const c of cohorts){if(i<stageIndex.get(c.intro)||i>=stageIndex.get(c.install))continue;const d=c.join&&i>=stageIndex.get(c.join)?joined.get(c.door):prepared.get(c.id);for(const key of c.keys)result.set(key,d)}
 const current=spec.stages[i];if(current.comparison_cohort){
  const peer=cohorts.find(c=>c.id===current.comparison_cohort),handle=cohorts.find(c=>c.intro===stage);if(!peer||!handle||i<stageIndex.get(peer.intro)||i>=stageIndex.get(peer.install))fail('Unavailable comparison cohort');
  const hb=boxes.get(handle.id).clone().translate(new Vector3(...prepared.get(handle.id))),pb=boxes.get(peer.id),target=hb.getCenter(new Vector3());target.x+=(hb.getSize(new Vector3()).x+pb.getSize(new Vector3()).x)/2+.02;const d=target.sub(pb.getCenter(new Vector3())).toArray();for(const key of peer.keys)result.set(key,d);
 }return result}
 function writeOffsets(next){
  for(const[key,s]of owned){const d=next.get(key),m=methods.get(key);m.set.call(s.n.position,...d);m.update.call(s.n)}
  updateRoot.call(loaded.root,true);offsets=next;
  for(const s of owned.values())if(!equal(s.n.matrixWorld.elements,expected(s)))fail('Preparation frame could not be committed');
 }
 function prepareStage(stage){
  if(stage!==null&&(typeof stage!=='string'||!stageIndex.has(stage)&&!spec.nativeStageIDs.includes(stage)))fail('Invalid stage request');
  preflight();const next=plan(stage),previous=offsets,preparedRevision=revision;let changed=false,status='prepared',committedRevision;
  for(const[key,d]of next){if(!d.every(Number.isFinite))fail('Nonfinite preparation pose');changed||=!equal(d,previous.get(key))}
  function commit(){
   if(status!=='prepared'||revision!==preparedRevision||offsets!==previous)fail('Stale preparation transaction');preflight();status='committing';
   try{if(changed)writeOffsets(next);else offsets=next;committedRevision=++revision;status='committed';return changed}
   catch(error){
    try{writeOffsets(previous);revision++;status='rolled-back'}
    catch(rollbackError){failed=true;status='failed';throw new AggregateError([error,rollbackError],'Trident panel preparation rollback failed')}
    throw error;
   }
  }
  function rollback(){
   if(status==='prepared'){status='cancelled';return false}
   if(status==='rolled-back'||status==='cancelled')return false;
   if(status!=='committed'||revision!==committedRevision||offsets!==next)fail('Stale preparation rollback');
   try{if(changed)writeOffsets(previous);else offsets=previous;revision++;status='rolled-back';return changed}
   catch(error){failed=true;status='failed';throw error}
  }
  return Object.freeze({changed,commit,rollback});
 }
 function applyStage(stage){return prepareStage(stage).commit()}

 return Object.freeze({expectedMatrix:expected,prepareStage,applyStage});
}

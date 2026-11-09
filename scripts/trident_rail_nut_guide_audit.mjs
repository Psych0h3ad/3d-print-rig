import assert from 'node:assert/strict';

// Original Z-rail receiver occurrences, shared by the three source sizes.
// These are source identities, not a name filter or a hardware replacement.
const leaves=['1085','1075','1079','1077','1074','1078','1076','1073','1080','1081','1082','1091','1086','1088','1087','1084','1116','1117','1118','1119','1120','1121','1122','1123'];
const previousStages={
 voron_trident_250:'ccd9458d8d6cdf9556584cb9f0a16de0f8752233b2eb106a57d72278bcf34491',
 voron_trident_300:'6c21c832f0639c7342fd7b39e1897791382f438379910c490af3d9edfc6440c9',
 voron_trident_350:'cd6391c01f33d6c7dc24055800312dfe5f737e960228d61764e57beaa8fcb0cc',
};
export function auditTridentRailNutGuide(guide,loaded,{createAssemblyProgress,validateAssemblyProgress}){
 const machine=guide.identity.machine;if(!previousStages[machine])return null;
 const component='machines/'+machine+'/assembly_manifest.json',metadata=loaded.inspection.components.find(c=>c.path===component);
 assert.ok(metadata,'Original base metadata required');
 const parts=leaves.map(leaf=>{
  const matches=metadata.meta.parts.filter(p=>String(p.source_leaf)===leaf);
  assert.equal(matches.length,1,'Unique original source occurrence');const p=matches[0],key=component+'#'+p.key;
  assert.equal(p.group,'Frame');assert.equal(p.motion,'fixed');assert.ok(p.source_component.includes('/T-Nuts:'));
  assert.equal(guide.owner(key).id,'zaxis','Rail receiver nut must first appear with Z rails');
  assert.ok(!guide.stage('frame').part_keys.includes(key));return key;
 });
 for(const id of ['frame','drives','zaxis']){
  const state=guide.setStage(id),visible=new Set(state.visible_keys);
  for(const key of parts)assert.equal(visible.has(key),id==='zaxis','Cumulative rail-nut visibility');
 }
 const priorChapters=['frame','drives','gantry','zaxis','xaxis','belts','bed','head','wiring','skirts','panels','filament'];
 const refinedPanelStages={"voron_trident_250":"2cc066a75495be1d960cf8e0ca3092e9c75f957a62a21fb8bc527ec01979fa54","voron_trident_300":"7744a7ce6c16c807d2a84f72fa4bf1923925f0299928892b71f96d5d98074cea","voron_trident_350":"353f8ef228a28e270113cda02fa13bbe1cee7cb49575a96c7c650b3446c9da85"};
 const panelRefinement=guide.identity.stages_sha256===refinedPanelStages[machine];
 const requiredRechecks=['zaxis',...(panelRefinement?['wiring','panels','filament']:[])];
 const current=createAssemblyProgress(guide).snapshot(),allParts=guide.stages.flatMap(s=>s.part_keys),old={...current,identity:{...current.identity,stages_sha256:previousStages[machine]},current_stage:'zaxis',checked_stages:priorChapters,checked_parts:allParts};
 const input=JSON.stringify(old),migrated=validateAssemblyProgress(guide,JSON.parse(input));
 assert.equal(JSON.stringify(old),input,'Input progress must not be mutated');
 assert.deepEqual(new Set(migrated.checked_parts),new Set(allParts));
 assert.deepEqual(migrated.checked_stages,old.checked_stages.filter(id=>!requiredRechecks.includes(id)));
 const legacy={...old,schema:'assembly-workbench-progress-v1'};delete legacy.checked_parts;
 assert.deepEqual(validateAssemblyProgress(guide,legacy).checked_parts,[],'v1 must not invent part checks');
 const resumed=createAssemblyProgress(guide,migrated);resumed.toggle('zaxis');
 assert.ok(validateAssemblyProgress(guide,JSON.parse(JSON.stringify(resumed.snapshot()))).checked_stages.includes('zaxis'),'Confirmed current stage must survive reload');
 let rejected=0;
 for(const field of ['source_documents_sha256','source_state_sha256','manual_sha256','stages_sha256']){
  const bad={...old,identity:{...old.identity,[field]:'0'.repeat(64)}};
  assert.throws(()=>validateAssemblyProgress(guide,bad));rejected++;
 }
 guide.restore();
 return {sourceNutKeys:parts,sourceIdentityBound:true,frameAndDrivesExcluded:true,zaxisIncluded:true,partChecksPreserved:allParts.length,onlyRevisedStageRechecked:!panelRefinement,requiredStageRechecks:requiredRechecks,priorChapterProgressUsed:true,v1ChecksNotInvented:true,currentReconfirmationPreserved:true,unrelatedIdentityNegatives:rejected,scope:'Original source receiver identities and exact prior chapter progress; refined panel/filament operations require their own review. No native mating or physical-fit qualification.'};
}

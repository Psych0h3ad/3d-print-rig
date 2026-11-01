// Exact stock V0 manual operations. Storage/inspection masks preserve original
// geometry and matrices; they do not simulate insertion or certify engagement.
const sources={
 voron_v02_120:{prefix:'v02_',offset:-9,manual:'69f989092ea63b60a15407ce1c4b4f9e260702330ae00416a059eb705d5170fe',model:'da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9',manifest:'16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c'},
 voron_v02r1_120:{prefix:'v02r1_',offset:0,manual:'5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f',model:'d89064824fa67ed6e7c78e90c642620afe62c3b4520255f6c626181754b7d29d',manifest:'3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea'},
};
const rear=[458,470,471,472,475,478,482,485],rearNuts=[491,492,494,496,497,499,502,503],body=[523,526,527,528];
const prep=[454,462,512,514,520,521,531],front=[476,477,479,481,483,484,498,501,505,506,523,527,528],preload=[491,492,493,494,495,496,497,499,500,502,503],rail=[453,459,460,461,463,465,466,467],lead=[518,457,473,486];
const mounted=[...body,519,520,...rear,...rearNuts],preparedCarrier=[...front,526,...preload],preparedMounts=[...prep,519];
const operations=[
 ['bed-carrier-prep',[36,37],prep,prep,prep,'Prepare the right rear mount and chain end',[1,.55,-1],true],
 ['bed-carrier-frame',[38,38],front,front,front,'Assemble the F extrusions and front',[.65,.55,1],true],
 ['bed-carrier-crossbar',[39,39],[526],[526,527,528,481,484,501,505],[...front,526],'Join the G extrusion',[.65,.55,1],true],
 ['bed-carrier-preload',[40,40],preload,[526,...preload],preparedCarrier,'Preload the carrier slot nuts',[.65,.7,-1],true],
 ['bed-mounts',[41,41],[519,...rear],mounted,[...preparedCarrier,...preparedMounts,...rear],'Temporarily fit the rear mounts',[.3,.3,-1],true],
 ['bed-mount-flatness',[42,42],[],[519,520],[...preparedCarrier,...preparedMounts,...rear],'Inspect the two rail mounting faces',[0,.04,-1],true],
 ['bed-mounts-separate',[43,43],[],[519,520,...rear],preparedMounts,'Inspect the removed mounts; carrier and screws are set aside',[.65,.4,-1],true],
 ['bed-mounts-rail',[44,44],rail,[519,520,...rail],[...preparedMounts,...rail],'Fasten the mounts to the Z rail blocks',[.15,.18,1],false],
 ['bed-carrier-install',[45,46],[],mounted,null,'Refit the prepared carrier',[.3,.5,1],false],
 ['leadnut',[92,92],lead,lead,lead,'Assemble the leadscrew nut holder',[.65,.45,-1],true],
 ['leadnut-install',[93,93],[474,480],[...lead,474,480,493,500,526],null,'Attach the prepared leadscrew nut holder',[.3,.3,-1],false],
];
const fail=s=>{throw Error('V0 bed assembly: '+s)};
const equalSet=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(k=>b.includes(k));
const pairNote='These nearby nut occurrences are distinct original CAD references. Their separate purpose is unresolved; follow the manual quantity, not the model item count.';
export function createV0BedAssembly(spec,machineId){
 const source=sources[machineId];
 if(!source||spec.manual.sha256!==source.manual||spec.model_sha256!==source.model||spec.manifest_sha256!==source.manifest)fail('Unreviewed source/manual identity');
 const keys=values=>values.map(n=>source.prefix+String(n+source.offset).padStart(5,'0')),cohort=new Set(keys([...new Set(operations.flatMap(r=>r[2]))])),rows=new Map();
 for(const[id,pages,introduced,referenced,display,status,direction,isolated]of operations){
  const stage=spec.stages.find(s=>s.id===id),own=keys(introduced),refs=keys(referenced);
  if(!stage||stage.page_start!==pages[0]||stage.page_end!==pages[1]||!equalSet(stage.part_keys,own)||!equalSet(stage.operation_part_keys||stage.part_keys,refs))fail('Changed manual/source operation: '+id);
  rows.set(id,Object.freeze({id:'bed-'+id,isolated,operation:status,status:isolated?'Subassembly reference view':'Installation reference view',direction:Object.freeze([...direction]),keys:display?Object.freeze(keys(display)):null,
   notes:Object.freeze(id==='bed-carrier-preload'?[pairNote]:isolated?['Only the current bed subassembly is shown at the original source locations. Other assemblies are set aside; this inspection view does not show an insertion path.']:[]),
   partNotes:Object.freeze(id==='bed-carrier-preload'?Object.fromEntries(keys([492,495]).map(k=>[k,pairNote])):{}),
  }));
 }
 const row=index=>{if(!Number.isSafeInteger(index)||!spec.stages[index])fail('Unknown manual operation');return rows.get(spec.stages[index].id)||null};
 return Object.freeze({
  at:row,
  filter(index,shown){const work=row(index);if(!work?.keys)return shown;const allowed=new Set(work.keys);return new Set([...shown].filter(k=>work.isolated?allowed.has(k):!cohort.has(k)||allowed.has(k)))},
  focus(index){const work=row(index);return work?work.keys?[...work.keys]:[...(spec.stages[index].operation_part_keys||spec.stages[index].part_keys)]:[]},
  stored(index,shown){const work=row(index);return work?.keys?[...shown].filter(k=>cohort.has(k)&&!work.keys.includes(k)):[]},
 });
}

// Official V0.2/r1 manuals pp69-81. Isolated subassembly inspection uses the
// original source placement; it never moves hardware or invents an insertion.
const sources={
 voron_v02_120:{prefix:'v02_',a:155,b:198,manual:'69f989092ea63b60a15407ce1c4b4f9e260702330ae00416a059eb705d5170fe',model:'da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9',manifest:'16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c'},
 voron_v02r1_120:{prefix:'v02r1_',a:157,b:200,manual:'5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f',model:'d89064824fa67ed6e7c78e90c642620afe62c3b4520255f6c626181754b7d29d',manifest:'3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea'},
};
const fail=s=>{throw Error('V0 drive assembly: '+s)};
const frameMounts={voron_v02_120:{a:[169,170],b:[212,214]},voron_v02r1_120:{a:[171,172],b:[214,216]}};
const operations={
 prep:'Identify the A/B markings. Seat the outer heat-set inserts below the printed surface, fully in their holes.',
 stack:'Inspect this subassembly upside down. Use the specified F623 bearings, printed spacers and 0.5 mm shims; check an 18 mm total stack. Temporary M3 nuts mentioned in the manual are not permanent source parts.',
 motorA:'Set the A motor pulley with the manual jig to 8.5 mm. Follow the manual and the threadlocker product instructions for the grub screws.',
 motorB:'Set the B motor pulley with the manual jig to 17.5 mm. Follow the manual and the threadlocker product instructions for the grub screws.',
 close:'Keep the motor wires facing inward. Compare pulley teeth with the bearing races before installing the completed drive.',
 install:'Install B on the left and A on the right. Rear screws use the threaded frame ends; front screws use the preloaded nuts. Remove any temporary M3 nuts before mounting.',
};
export function createV0DriveAssembly(spec,machineId){
 const d=sources[machineId];
 if(!d||spec.manual.sha256!==d.manual||spec.model_sha256!==d.model||spec.manifest_sha256!==d.manifest)fail('Unreviewed source/manual identity');
 const stages=spec.stages,rows=new Map(),all=[];
 for(const letter of ['a','b']){
  const complete=Array.from({length:40},(_,i)=>d.prefix+String(d[letter]+i).padStart(5,'0'));
  // This M3x10 fastens the later upper B member (manual p123/129),
  // not the prepared drive or its p81 frame mounts.
  const lateTop=d.prefix+String(d[letter]+9).padStart(5,'0');
  const mounts=frameMounts[machineId][letter].map(n=>d.prefix+String(n).padStart(5,'0')),expected=complete.filter(k=>!mounts.includes(k)&&k!==lateTop);
  const ids=['prep','stack','motor','close'].map(s=>letter+'-drive-'+s),group=ids.map(id=>stages.find(s=>s.id===id));
  const start=letter==='a'?69:75,pages=[[start,start],[start+1,start+2],[start+3,start+3],[start+4,start+5]],counts=[6,15,8,8];
  if(group.some((s,i)=>!s||s.page_start!==pages[i][0]||s.page_end!==pages[i][1]||s.part_keys.length!==counts[i]))fail('Changed manual operation');
  const actual=group.flatMap(s=>s.part_keys);
  if(new Set(actual).size!==37||actual.some(k=>!expected.includes(k)))fail('Changed original drive cohort');
  all.push(...complete);
  for(const[i,s]of group.entries())rows.set(s.id,Object.freeze({id:'drive-'+letter+(i===1?'-underside':'-upright'),letter,keys:Object.freeze([...expected]),underside:i===1,note:operations[i===2?(letter==='a'?'motorA':'motorB'):['prep','stack','motor','close'][i]]}));
 }
 const install=stages.find(s=>s.id==='drives-install');
 const mountKeys=Object.values(frameMounts[machineId]).flat().map(n=>d.prefix+String(n).padStart(5,'0'));
 if(!install||install.page_start!==81||install.page_end!==81||install.part_keys.length!==4||new Set(install.part_keys).size!==4||install.part_keys.some(k=>!mountKeys.includes(k)))fail('Changed installation stage');
 return Object.freeze({
  at(index){if(!Number.isSafeInteger(index)||!stages[index])fail('Unknown manual stage');return rows.get(stages[index].id)||null},
  filter(index,shown){const row=this.at(index);return row?new Set([...shown].filter(k=>row.keys.includes(k))):shown},
  focus(index){const row=this.at(index);return row?[...row.keys]:stages[index].id==='drives-install'?[...all]:[]},
  note(index){return this.at(index)?.note||(stages[index].id==='drives-install'?operations.install:'')},
 });
}

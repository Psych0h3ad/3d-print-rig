// RC8 source identities and motion bindings, not a fit or retention approval.
const machine='micron_plus_r1_180',commit='f76aa28767211ddfee2e30290aadcea3c45f8513';
const sourceStep='sources/micron/CAD/180_R1_Assembly_RC8/180_R1_Assembly.step';
const bindings={
 m180_00411:{start:['m180_01415','m180_01416'],end:['m180_00340','m180_00344'],endMotion:'fixed'},
 m180_01768:{start:['m180_01765','m180_01766','m180_01421'],end:['m180_01767'],endMotion:'z_gantry'}
};
const axes={reference_flexible:[],fixed:[],xyz_head:['X','Y','Z'],z_gantry:['Z']};
const denseEqual=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>Object.hasOwn(a,i)&&a[i]===v);
function invalid(key){throw Error('Micron tube source binding mismatch: '+key);}
export function validateMicronTubeBindings(nodes,records,specs){
 if(!Array.isArray(specs)||specs.length!==Object.keys(bindings).length)invalid('routes');
 const usedNodes=new Set(),keys=new Set();
 function check(key,motion){
  const row=records.get(key),node=nodes.get(key),s=row?.source;
  if(!row||!node||row.key!==key||node.userData?.part_key!==key||usedNodes.has(node)||
     row.motion!==motion||!denseEqual(row.motion_axes,axes[motion])||
     s?.repository!=='PrintersForAnts/Micron'||s.commit!==commit||s.cache_machine!==machine||
     s.source_key!==key.slice(5)||s.source_step!==sourceStep||s.transplanted_head!==false||
     !denseEqual(s.translation_to_world_mm,[0,0,135]))invalid(key);
  let meshes=0;node.traverse(o=>{if(o.isMesh)meshes++;});
  if(!meshes)invalid(key);
  usedNodes.add(node);
 }
 for(let i=0;i<specs.length;i++){
  if(!Object.hasOwn(specs,i))invalid('routes');
  const spec=specs[i],binding=bindings[spec?.key];
  if(!binding||keys.has(spec.key)||!denseEqual(spec.start_attachment,binding.start)||
     !denseEqual(spec.end_attachment,binding.end)||spec.end_motion!==binding.endMotion)invalid(spec?.key);
  keys.add(spec.key);check(spec.key,'reference_flexible');
  for(const key of binding.start)check(key,'xyz_head');
  for(const key of binding.end)check(key,binding.endMotion);
 }
}

// Outer circular rim centers of the placed public source cable, BREP
// 66cd8e67770d7de48c75eaabde8c04515cdaa255f5adf3341eeb76ed6e2d1463.
// These annular cap datums do not specify a free boundary or gripping length.
export function micronNativeTubeEndpoints(key){
 if(key!=='m180_01768')return null;
 return [[20.132155866669876,16.964916233959276,184.79862459683233],
         [75.83447820320578,138.03515200420597,166.7916868833239]];
}

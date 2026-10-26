export function attachIllustrativeLatchDisplay(assembly, profile) {
  const fail=(ok,message)=>{if(!ok)throw Error(message)};
  fail(profile?.schema==='e3ng-illustrative-loaded-latch-v1','Missing fitted-display profile');
  fail(profile.model_sha256===assembly.packet.model.sha256,'Fitted-display model identity mismatch');
  fail(profile.base_preserved===true&&profile.topology_preserved===true&&profile.physical_simulation===false&&profile.hinge_and_screw_transforms_unchanged===true,'Incorrect fitted-display scope');
  const keys=new Set(profile.owner_keys);
  fail(keys.size===6&&profile.owner_keys.length===6,'Expected six original cam owners');
  const roots=new Map([...assembly.parts].map(([key,value])=>[value.node,key]));
  const ownerOf=node=>{for(let n=node;n;n=n.parent)if(roots.has(n))return roots.get(n);return null};
  const meshes=[],protectedTransforms=[];
  for(const [key,value]of assembly.parts){
    protectedTransforms.push({node:value.node,matrix:value.node.matrix.elements.slice()});
    if(!keys.has(key))continue;
    fail(value.record.kind==='printed','Fitted display cannot replace hardware');
    const owned=[];
    value.node.traverse(node=>{if(node.isMesh&&ownerOf(node)===key)owned.push(node)});
    fail(owned.length>0,'Missing cam source mesh: '+key);
    for(const mesh of owned){
      const positions=mesh.geometry.morphAttributes.position;
      fail(mesh.geometry.morphTargetsRelative===true&&positions?.length===1&&positions[0].count===mesh.geometry.attributes.position.count&&mesh.morphTargetInfluences?.length===1,'Wrong source-relative cam topology: '+key);
      meshes.push(mesh);
    }
  }
  for(const key of keys)fail(assembly.parts.has(key),'Missing fitted-display owner: '+key);
  let current=1;
  const assertWeight=value=>fail(value===0||value===1,'Display weight must be original 0 or assembled 1');
  function setWeight(value){
    assertWeight(value);
    // Capture current normal-controller transforms; fitted display changes only
    // morph weights. This also works after ordinary axis/configuration changes.
    for(const entry of protectedTransforms)entry.matrix=entry.node.matrix.elements.slice();
    for(const mesh of meshes)mesh.morphTargetInfluences[0]=value;
    for(const entry of protectedTransforms)fail(entry.matrix.every((v,i)=>v===entry.node.matrix.elements[i]),'Display altered a source transform');
    current=value;
    return snapshot();
  }
  function snapshot(){return {...assembly.snapshot(),illustrative_latch_display:{model_sha256:profile.model_sha256,weight:current}}}
  function apply(state){
    const {illustrative_latch_display:display,...normal}=state;
    // Older compatible saved states restore the assembled default. Existing
    // normal-runtime revision/variant/axis guards still validate normal state.
    const weight=display?.weight??1;
    assertWeight(weight);
    fail(!display||display.model_sha256===profile.model_sha256,'Saved display belongs to another model');
    assembly.apply(normal);
    return setWeight(weight);
  }
  function reset(){assembly.reset();return setWeight(1)}
  setWeight(1);
  return {
    ...assembly,
    get flexState(){return assembly.flexState},
    snapshot,apply,reset,
    setRawSourceDisplay:raw=>{fail(typeof raw==='boolean','Raw display selection must be boolean');return setWeight(raw?0:1)},
    illustrativeLatchDisplay:{notice:profile.notice,ownerKeys:[...keys],assembledDefaultWeight:1,rawSourceWeight:0,physicalSimulation:false}
  };
}

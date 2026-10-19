import {createSourceServiceRoutes} from './source-service-routes.mjs';
import *as THREE from 'three';
import {createCaptured47} from './captured47-state-v14-fixed-terminal.mjs';
const F=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1),Fi=F.clone().invert();
const cad=t=>F.clone().multiply(new THREE.Matrix4().set(...t.flat().map((v,i)=>[3,7,11].includes(i)?v/1000:v))).multiply(Fi);
const point=p=>new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
const SOURCE='ace_hf__siboor_awd__stealthburner__cw2__fixed__none';
export function createFullMachineSource47({model,meshes,manifest,input,reference,serviceInput,getHead,onPose,onCommit=()=>{}}){
 const service=createSourceServiceRoutes({model,meshes,input:serviceInput,getHead});
 const M=input.machines.find(m=>m.size===350);if(!M)throw Error('Missing exact350 source route');
 const byKey=new Map(meshes.filter(m=>m.userData.stock!==false).map(m=>[String(m.userData.originalKey||m.userData.partKey),m]));
 const group=new THREE.Group();group.name='Source47_350_fixed_model_host';model.add(group);
 let active=false,head=null,applying=false,row=null,z=0,zHistory=[0],zPending=[],resetting=false,originalMode=false,latest=null,requested=[...M.reference_xy_mm,0];
 const capture=o=>{if(!o)throw Error('Missing actual source part');o.updateMatrix();return {mesh:o,parent:o.parent,local:o.matrix.clone(),auto:o.matrixAutoUpdate,visible:o.visible}};
 const links=Array.from({length:47},(_,i)=>({...capture(byKey.get('chain_'+String(i).padStart(2,'0'))),key:'chain_'+String(i).padStart(2,'0'),index:i}));
 const rear=Object.keys(M.setup_rear).map(key=>({...capture(byKey.get(key)),key}));
 const clips=manifest.parts.filter(p=>p.chain_link_index!==undefined&&!p.key.startsWith('chain_')).map(p=>({...capture(byKey.get(p.key)),key:p.key,index:p.chain_link_index}));
 let headParts=[];
 function setWorld(o,W){o.parent.updateWorldMatrix(true,false);o.matrix.copy(o.parent.matrixWorld.clone().invert().multiply(W));o.matrixAutoUpdate=false;o.updateWorldMatrix(false,true)}
 function restore(r){r.parent.add(r.mesh);r.mesh.matrix.copy(r.local);r.local.decompose(r.mesh.position,r.mesh.quaternion,r.mesh.scale);r.mesh.matrixAutoUpdate=r.auto;r.mesh.visible=r.visible;r.mesh.updateWorldMatrix(true,true)}
 const refs=new Map(reference.nodes.map(n=>[n.part_key,n]));
 const sourceWorld=key=>new THREE.Matrix4().fromArray(refs.get(key).source_original_world_matrix);
 const referenceWorld=key=>new THREE.Matrix4().fromArray(refs.get(key).reference_viewer_matrix);
 function matches(v){return v?.source_head_configuration===SOURCE&&v.machine_head?.source_variant===SOURCE&&v.source_evidence?.actual_module_sha256==='8c7810f878cb6e2e954cec6544fb6bdb20e54aa8d2e206beda4948c56f7197e9'&&v.gantry==='siboor_awd'&&v.belt_width_mm===9&&v.mount==='fixed'&&v.extruder==='cw2'&&v.probe==='none'&&v.board==='ebb2209_stock'&&v.cooling==='source'&&v.machine_head.base==='stealthburner'&&JSON.stringify(v.machine_head.translation)==='[0,0,0]'&&!v.machine_head.hidden.includes('578')}
 const onFrame=next=>{row=next;applying=true;try{onPose(next.xy[0]+M.reference_xy_mm[0],next.xy[1]+M.reference_xy_mm[1],z)}finally{applying=false}};
 let engine=createCaptured47(input,350,{onApply:onFrame});
 function activate(){if(active)return;head=getHead();if(!head?.root)throw Error('Actual retained CW2 not loaded');headParts=Object.keys(M.setup_head).map(key=>{const mesh=head.entries.find(e=>String(e.key)===key)?.mesh;return {...capture(mesh),key}});for(const r of [...links,...rear,...clips])group.attach(r.mesh);active=true;row=engine.row;}
 function deactivate(){if(!active)return;service.deactivate();for(const r of [...headParts,...links,...rear,...clips])restore(r);headParts=[];head=null;active=false;originalMode=false;z=0;zHistory=[0];zPending=[];resetting=false;requested=[...M.reference_xy_mm,0];engine=createCaptured47(input,350,{onApply:onFrame});row=null;}
 function requestPose(x,y,zz){if(![x,y,zz].every(Number.isFinite)||zz<0||zz>230)throw Error("Outside unchanged source XYZ travel");activate();originalMode=false;const n=engine.planMove(x-M.reference_xy_mm[0],y-M.reference_xy_mm[1]);zPending=Array.from({length:n},(_,i)=>i===n-1?zz:z+(zz-z)*(i+1)/n);requested=[...engine.target.xy.map((v,i)=>v+M.reference_xy_mm[i]),zz];resetting=false;if(latest){latest.pending=n;latest.requested_xyz=requested.slice();onCommit(latest)}return n}
 function tick(){if(!active||!engine.pendingCount||originalMode)return false;z=zPending.shift();if(!Number.isFinite(z))throw Error('Missing exact savedZ continuation');engine.applyNext();if(resetting){if(zHistory.length>1)zHistory.pop()}else zHistory.push(z);if(latest){latest.routing_state_signature=engine.signature();latest.routing_history_count=engine.historyCount;latest.pending=engine.pendingCount;onCommit(latest)}return true}
 function updatePose({enabled=true}={}){
  if(!active||!row)return {chain:false,ptfe:false,chainLinks:0};model.updateWorldMatrix(true,true);const root=model.matrixWorld;
  for(const r of links){const W=originalMode?sourceWorld(r.key):r.index===46?referenceWorld(r.key):cad(row.matrices[r.index]).multiply(sourceWorld(r.key));setWorld(r.mesh,root.clone().multiply(W));r.mesh.visible=enabled;r.mesh.frustumCulled=false;}
  for(const r of rear)setWorld(r.mesh,root.clone().multiply(originalMode?sourceWorld(r.key):referenceWorld(r.key)));
  for(const r of clips){const d=r.index===46?cad(M.fixed_terminal_source_transform_CAD_mm):cad(row.matrices[r.index]);setWorld(r.mesh,root.clone().multiply(originalMode?sourceWorld(r.key):d.multiply(sourceWorld(r.key))));r.mesh.visible=enabled;}
  const delta=new THREE.Matrix4().makeTranslation(row.xy[0]/1000,0,-row.xy[1]/1000);
  for(const r of headParts)setWorld(r.mesh,root.clone().multiply(delta).multiply(originalMode?sourceWorld(r.key):referenceWorld(r.key)));
  const f=(key,p)=>point(p).applyMatrix4(sourceWorld(key).invert()).applyMatrix4(byKey.get(key).matrixWorld);
  // Actual loaded source mesh features, not virtual endpoint-to-endpoint data.
  const headMesh=head.entries.find(e=>String(e.key)==='559').mesh;
  const headSource=sourceWorld('559').invert(),actualHead=point(reference.original_head_pin_mm).applyMatrix4(headSource).applyMatrix4(headMesh.matrixWorld);
  const h=f('chain_00',M.source_links[0].incoming_mm).distanceTo(actualHead)*1000;
  const t=f('chain_46',M.source_links[46].outgoing_mm).distanceTo(f('588',reference.original_rear_cavity_mm))*1000;
  const services=service.update(enabled);
  latest={...services,source_constructor:originalMode?'original-imported-reference-comparison':'v14-fixed46-full-machine-v15',chain:true,ptfe:services.ptfe,can:services.can,chainLinks:47,chainReferenceFallback:false,chain_effective_visible_count:links.filter(r=>r.mesh.visible&&group.visible).length,head_attachment_error_mm:h,fixed_attachment_error_mm:t,closure_error_mm:Math.hypot(...row.terminal_joint_residual_mm),native_solid_clearance:false,routing_state_signature:engine.signature(),routing_history_count:engine.historyCount,pending:engine.pendingCount,requested_xyz:requested.slice(),reset_reference:originalMode?'EXACT_IMPORTED_REFERENCE_LEGACY_FIT_UNQUALIFIED':'EXACT_V14_SOURCE_MATED_REFERENCE_NOT_FACTORY_ASSEMBLY',scope:'Original47 rigid links/full machine; selected mesh finite capture only. Shoulder/stopper/Tnut and physical service length/bend and full-body clearance remain OPEN.'};return latest;
 }
 function visibilitySnapshot(){const visible=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return true};return{chain_links:links.filter(r=>visible(r.mesh)).length,...service.visibility()}}
 function setVisible(v){if(active){for(const r of [...links,...clips])r.mesh.visible=!!v;service.update(!!v)}return visibilitySnapshot()}
 function planReset(){activate();originalMode=false;engine.planReset();zPending=zHistory.slice(0,-1).reverse();if(!zPending.length)zPending=[0];requested=[...M.reference_xy_mm,0];resetting=true;if(latest){latest.pending=engine.pendingCount;latest.requested_xyz=requested.slice();onCommit(latest)}return engine.pendingCount}
 function originalReference(){activate();engine=createCaptured47(input,350,{onApply:onFrame});originalMode=true;row=engine.row;z=0;zHistory=[0];zPending=[];resetting=false;requested=[...M.reference_xy_mm,0];applying=true;try{onPose(...M.reference_xy_mm,0)}finally{applying=false}}
 function refreshRenderedPose(){if(!active||!row)return;applying=true;try{onPose(row.xy[0]+M.reference_xy_mm[0],row.xy[1]+M.reference_xy_mm[1],z)}finally{applying=false}}
 function saveState(){return {schema:'source47-full350-v21',binding:reference.binding,route:engine.capture(),z,z_history:zHistory.slice(),z_pending:zPending.slice(),requested_xyz:requested.slice(),resetting,original_source_mode:originalMode}}
 function validateState(packet){if(!['source47-full350-v15','source47-full350-v21'].includes(packet?.schema)||JSON.stringify(packet.binding)!==JSON.stringify(reference.binding)||!Array.isArray(packet.z_history)||!Array.isArray(packet.z_pending)||packet.z_history.length!==packet.route.history.length||packet.z_pending.length!==packet.route.pending.length||![packet.z,...packet.z_history,...packet.z_pending].every(v=>Number.isFinite(v)&&v>=0&&v<=230))throw Error('Source47 full-machine state binding invalid');const check=createCaptured47(input,350);check.restore(packet.route);const tail=check.target,expected=[...tail.xy.map((v,i)=>v+M.reference_xy_mm[i]),packet.z_pending.at(-1)??packet.z];if(packet.schema==='source47-full350-v21'&&JSON.stringify(packet.requested_xyz)!==JSON.stringify(expected))throw Error('Source47 requested target does not match saved pending route');return true}
 function restoreState(packet){validateState(packet);activate();z=packet.z;zHistory=packet.z_history.slice();zPending=packet.z_pending.slice();resetting=packet.resetting;originalMode=packet.original_source_mode;const tail=packet.route.pending.at(-1)||packet.route.current;requested=[...tail.xy.map((v,i)=>v+M.reference_xy_mm[i]),packet.z_pending.at(-1)??packet.z];engine.restore(packet.route);if(latest){latest.routing_state_signature=engine.signature();latest.routing_history_count=engine.historyCount;latest.pending=engine.pendingCount;onCommit(latest)}return {xyz:[...engine.current.xy.map((v,i)=>v+M.reference_xy_mm[i]),z]}}
 return{matches,refreshRenderedPose,visibilitySnapshot,service,requestPose,tick,updatePose,setVisible,planReset,originalReference,saveState,validateState,restoreState,deactivate,get active(){return active},get referencePose(){return [...M.reference_xy_mm,0]},get requestedPose(){return requested.slice()},get applying(){return applying},get pendingCount(){return active?engine.pendingCount:0},get diagnostics(){return latest},get engine(){return engine},get links(){return links},get rear(){return rear}};
}

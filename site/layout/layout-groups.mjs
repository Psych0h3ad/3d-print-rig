// Farm units use the same static planning envelopes as individual objects.
// A group never duplicates source CAD or changes printer/support attachments.
import {LIMITS,LayoutValidationError,createDefaultLayout,deriveScene,resolvePrinterEquipment,
  validatePlacement,parseLayout,serializeLayout} from './layout-state.mjs?v=156b82f412caf708ab4e';
import {rootPose,groupRootPose} from './layout-group-data.mjs?v=298837e53f6daea54c7c';
import {bounds,rectangle,rotateXZ,transformPolygon,polygonContains,orient} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';
import {rigidMotionStaysInside,boundaryTangents} from './layout-constraints.mjs?v=53e33561b2e7ce324016';
import {prepareCollisionMotion,envelopeChange} from './layout-collision.mjs?v=1a7a6f204f8ed66b33ed';

const clone=x=>JSON.parse(JSON.stringify(x));
const problem=(code,path='group',params={})=>new LayoutValidationError([{code,path,params}]);
const fail=(...args)=>{throw problem(...args);};
const named=name=>typeof name==='string'&&!!name.trim()&&name.length<=80&&!/[\u0000-\u001f\u007f]/.test(name);
const finite=(v,max=LIMITS.maxCoordinateMm)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max;
const catalogRows=c=>Array.isArray(c)?c:c?.entries??[];
const checked=(state,catalog)=>parseLayout(serializeLayout(state,catalogRows(catalog)),catalogRows(catalog));
const groupOf=(state,id)=>state.groups?.find(g=>g.id===id)??null;
const requireGroup=(state,id)=>groupOf(state,id)||fail('UNKNOWN_ENTITY','group.id');
const samePose=(a,b)=>['xMm','zMm','yawDeg'].every(k=>a[k]===b[k]);

export function groupingForEntity(state,id){
  const parent=state.printers.find(p=>p.id===id)?.attachment.parentId;
  return state.groups?.find(g=>g.memberIds.includes(parent??id))??null;
}
export function groupEntityIds(state,id){
  const g=groupOf(state,id);if(!g)return [];
  return [...g.memberIds,...state.printers.filter(p=>p.attachment.parentId!==null&&g.memberIds.includes(p.attachment.parentId)).map(p=>p.id)];
}
export function groupInfo(state,id,catalog=[]){
  catalog=catalogRows(catalog);
  const g=groupOf(state,id);if(!g)return null;
  const ids=new Set(groupEntityIds(state,id)),scene=deriveScene(state,catalog);
  const entities=[...scene.furniture,...scene.printers].filter(e=>ids.has(e.id));
  const local=entities.flatMap(e=>e.worldEnvelopeMm.map(([x,z])=>rotateXZ([x-g.pose.xMm,z-g.pose.zMm],-g.pose.yawDeg)));
  const box=bounds(local),widthMm=box.maxX-box.minX,depthMm=box.maxZ-box.minZ;
  return {...g,...g.pose,type:'group',widthMm,depthMm,heightMm:Math.max(0,...entities.map(e=>e.verticalRangeMm[1])),
    centerOffsetMm:{xMm:(box.minX+box.maxX)/2,zMm:(box.minZ+box.maxZ)/2},
    worldEnvelopeMm:transformPolygon([[box.minX,box.minZ],[box.maxX,box.minZ],[box.maxX,box.maxZ],[box.minX,box.maxZ]],g.pose),
    entityIds:[...ids],printerCount:entities.filter(e=>e.type==='printer').length,furnitureCount:entities.filter(e=>e.type!=='printer').length};
}
export function createGroup(state,{id,name,memberIds},catalog=[]){
  catalog=catalogRows(catalog);
  checked(state,catalog);
  if(!named(name))fail('GROUP_NAME');
  if(!Array.isArray(memberIds)||!memberIds.length||new Set(memberIds).size!==memberIds.length)fail('GROUP_MEMBERS');
  if((state.groups?.length??0)>=LIMITS.maxGroups)fail('GROUP_LIMIT');
  for(const member of memberIds){
    if(!rootPose(state,member))fail('GROUP_ROOT_REQUIRED');
    if(groupingForEntity(state,member))fail('GROUP_MEMBER_ASSIGNED');
  }
  const ids=new Set([...memberIds,...state.printers.filter(p=>memberIds.includes(p.attachment.parentId)).map(p=>p.id)]);
  const scene=deriveScene(state,catalog),points=[...scene.furniture,...scene.printers].filter(e=>ids.has(e.id)).flatMap(e=>e.worldEnvelopeMm),b=bounds(points);
  const pose={xMm:(b.minX+b.maxX)/2,zMm:(b.minZ+b.maxZ)/2,yawDeg:0};
  const group={id,name:name.trim(),memberIds:[...memberIds],pose,originPose:{...pose},memberPoses:memberIds.map(id=>({id,pose:{...rootPose(state,id)}}))};
  return checked({...state,groups:[...(state.groups??[]),group]},catalog);
}
export function renameGroup(state,id,name,catalog=[]){
  requireGroup(state,id);if(!named(name))fail('GROUP_NAME');
  return checked({...state,groups:state.groups.map(g=>g.id===id?{...g,name:name.trim()}:g)},catalog);
}
export function ungroup(state,id,catalog=[]){
  requireGroup(state,id);return checked({...state,groups:state.groups.filter(g=>g.id!==id)},catalog);
}
export function removeGroup(state,id,catalog=[]){
  const ids=new Set(groupEntityIds(state,requireGroup(state,id).id));
  return checked({...state,furniture:state.furniture.filter(e=>!ids.has(e.id)),printers:state.printers.filter(e=>!ids.has(e.id)),groups:state.groups.filter(g=>g.id!==id)},catalog);
}
function movedState(state,group,pose,catalog){
  if(samePose(group.pose,pose))return state;
  const roots=new Set(group.memberIds),next={...state,
    furniture:state.furniture.map(f=>roots.has(f.id)?{...f,pose:groupRootPose(group,f.id,pose)}:f),
    printers:state.printers.map(p=>roots.has(p.id)?{...p,attachment:{...p.attachment,...groupRootPose(group,p.id,pose)}}:p),
    groups:state.groups.map(g=>g.id===group.id?{...g,pose:{...pose}}:g)};
  return checked(next,catalog);
}
function prepareMotion(state,id,catalog){
  catalog=catalogRows(catalog);
  const g=requireGroup(state,id),ids=new Set(groupEntityIds(state,id)),scene=deriveScene(state,catalog);
  const entities=[...scene.furniture,...scene.printers].filter(e=>ids.has(e.id));
  const polygons=entities.map(e=>e.worldEnvelopeMm.map(([x,z])=>rotateXZ([x-g.pose.xMm,z-g.pose.zMm],-g.pose.yawDeg)));
  const contained=entities.every(e=>polygonContains(state.room.polygonMm,e.worldEnvelopeMm));
  const room=state.room.polygonMm,turns=room.map((p,i)=>orient(p,room[(i+1)%room.length],room[(i+2)%room.length])).filter(Boolean);
  const convex=turns.length>0&&turns.every(t=>t===turns[0]);
  let endpoints;
  const actualEndpointInside=pose=>{
    endpoints=new Map();
    const poses=new Map(g.memberIds.map(id=>[id,groupRootPose(g,id,pose)]));
    for(const f of state.furniture)if(ids.has(f.id)){
      const polygon=transformPolygon(rectangle(f.widthMm,f.depthMm),poses.get(f.id));endpoints.set(f.id,polygon);
      if(!polygonContains(state.room.polygonMm,polygon))return false;
    }
    for(const p of state.printers)if(ids.has(p.id)){
      const a=p.attachment,parent=a.parentId===null?null:poses.get(a.parentId);
      const local=parent&&rotateXZ([a.xMm,a.zMm],parent.yawDeg);
      const world=parent?{xMm:parent.xMm+local[0],zMm:parent.zMm+local[1],yawDeg:parent.yawDeg+a.yawDeg}:poses.get(p.id);
      const profile=resolvePrinterEquipment(state,p,catalog);
      const polygon=transformPolygon(profile.footprintMm,world);endpoints.set(p.id,polygon);
      if(!polygonContains(state.room.polygonMm,polygon))return false;
    }
    return true;
  };
  const inside=pose=>{
    if(!['xMm','zMm','yawDeg'].every(k=>finite(pose[k],k==='yawDeg'?LIMITS.maxYawDeg:LIMITS.maxCoordinateMm)))return false;
    if(!actualEndpointInside(pose))return false;
    const delta=pose.yawDeg-g.pose.yawDeg;
    if(Math.abs(delta)>360)return false;
    // In a convex room, the full translation of each contained footprint is
    // the convex hull of its start/end footprints. Endpoint containment is an
    // exact complete path proof here, avoiding192 redundant sweep builds.
    if(contained&&convex&&delta===0)return true;
    // Preserve complete signed turns; the underlying <=90 degree proof must
    // never treat +360 as an unchanged endpoint across a blocked arc.
    const pieces=Math.max(1,Math.ceil(Math.abs(delta)/90));
    let previous=g.pose;
    for(let i=1;i<=pieces;i++){
      const end=i===pieces?pose:{xMm:g.pose.xMm+(pose.xMm-g.pose.xMm)*i/pieces,zMm:g.pose.zMm+(pose.zMm-g.pose.zMm)*i/pieces,yawDeg:g.pose.yawDeg+delta*i/pieces};
      for(const polygon of polygons){
        if(contained?!rigidMotionStaysInside(state.room.polygonMm,polygon,previous,end):!polygonContains(state.room.polygonMm,transformPolygon(polygon,end)))return false;
      }
      previous=end;
    }
    return true;
  };
  const collision=prepareCollisionMotion(scene,ids,g.pose,new Map(entities.map((e,i)=>[e.id,polygons[i]])));
  const accepts=pose=>inside(pose)&&collision.accepts(pose,endpoints);
  return {g,polygons,contained,accepts,inside,collision,scene,ids};
}
export function transformGroup(state,id,patch,catalog=[]){
  catalog=catalogRows(catalog);
  checked(state,catalog);
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['xMm','zMm','yawDeg'].includes(k)))fail('INVALID_ACTION');
  const motion=prepareMotion(state,id,catalog),pose={...motion.g.pose,...patch};
  if(!motion.accepts(pose))fail(motion.inside(pose)?'ENVELOPE_OVERLAP':'ROOM_OUT_OF_BOUNDS');
  const next=movedState(state,motion.g,pose,catalog);
  if(envelopeChange(motion.scene,deriveScene(next,catalog),motion.ids,{rigid:true}))fail('ENVELOPE_OVERLAP');
  if(validatePlacement(next,catalog).some(e=>e.code==='ROOM_OUT_OF_BOUNDS'&&groupEntityIds(next,id).includes(e.entityIds[0])))fail('ROOM_OUT_OF_BOUNDS');
  return next;
}
function prefix(motion,from,target){
  if(motion.accepts(target))return target;
  let low=0,high=1,best=from;
  for(let i=0;i<52;i++){
    const t=low+(high-low)/2;if(t===low||t===high)break;
    const pose={xMm:from.xMm+(target.xMm-from.xMm)*t,zMm:from.zMm+(target.zMm-from.zMm)*t,yawDeg:from.yawDeg+(target.yawDeg-from.yawDeg)*t};
    if(motion.accepts(pose)){low=t;best=pose;}else high=t;
  }
  return best;
}
export function resolveGroupMove(state,{id,x,z},catalog=[],{snapMm=10,snapOrigin=null}={}){
  if(!finite(x)||!finite(z)||![0,10].includes(snapMm))return false;
  const m=prepareMotion(state,id,catalog),from=m.g.pose;
  const snap=(n,base)=>snapMm?base+Math.round((n-base)/snapMm)*snapMm:n;
  const target={...from,xMm:snap(x,snapOrigin?.xMm??from.xMm),zMm:snap(z,snapOrigin?.zMm??from.zMm)};
  if(!m.contained&&!m.accepts(target))return false;
  let best=prefix(m,from,target),limited=!samePose(best,target);
  if(limited){
    // A two-leg contact then slide, each with its own continuous swept proof.
    const contact=best,contactState=movedState(state,m.g,contact,catalog),slide=prepareMotion(contactState,id,catalog);
    let score=(best.xMm-target.xMm)**2+(best.zMm-target.zMm)**2;
    const seen=[];
    const directions=[...m.polygons.flatMap(local=>boundaryTangents(state.room.polygonMm,transformPolygon(local,contact))),...m.collision.tangents(contact)];
    for(const direction of directions){
      if(seen.some(t=>Math.abs(t[0]*direction[1]-t[1]*direction[0])<1e-12))continue;seen.push(direction);
      const distance=(target.xMm-contact.xMm)*direction[0]+(target.zMm-contact.zMm)*direction[1];
      const end=prefix(slide,contact,{...contact,xMm:contact.xMm+direction[0]*distance,zMm:contact.zMm+direction[1]*distance});
      const nextScore=(end.xMm-target.xMm)**2+(end.zMm-target.zMm)**2;
      if(nextScore<score){best=end;score=nextScore;}
    }
    // Keep the accepted dogleg. Do not validate it as a new direct chord.
    const resultState=movedState(contactState,slide.g,best,catalog);
    return Object.freeze({x:best.xMm,z:best.zMm,state:resultState,boundaryLimited:true,pointerRemainder:{x:x-target.xMm,z:z-target.zMm}});
  }
  return Object.freeze({x:best.xMm,z:best.zMm,state:movedState(state,m.g,best,catalog)});
}
export function resolveGroupRotation(state,{id,yawDeg},catalog=[],{snapDeg=15,snapOrigin=null}={}){
  if(!finite(yawDeg,2*LIMITS.maxYawDeg)||![0,1,15].includes(snapDeg))return false;
  const m=prepareMotion(state,id,catalog);if(!m.contained)return false;
  const from=m.g.pose,origin=snapOrigin??from.yawDeg;
  const snapped=snapDeg?origin+Math.round((yawDeg-origin)/snapDeg)*snapDeg:yawDeg;
  const yaw=yawDeg===from.yawDeg||(yawDeg-from.yawDeg)*(snapped-from.yawDeg)<0?from.yawDeg:snapped;
  if(Math.abs(yaw-from.yawDeg)>360)return false;
  const target={...from,yawDeg:yaw},best=prefix(m,from,target),limited=!samePose(best,target);
  return Object.freeze({yawDeg:best.yawDeg,state:movedState(state,m.g,best,catalog),
    ...(limited?{boundaryLimited:true}:{pointerRemainderDeg:yawDeg-snapped})});
}

export const GROUP_LIBRARY_LIMIT=24;
export function validateGroupTemplate(template,catalog=[]){
  catalog=catalogRows(catalog);
  if(!template||typeof template!=='object'||Array.isArray(template)||Object.keys(template).some(k=>!['format','version','name','furniture','printers'].includes(k))
    ||template.format!=='3d-print-rig-layout-set'||template.version!==1||!named(template.name)
    ||!Array.isArray(template.furniture)||!Array.isArray(template.printers))fail('GROUP_TEMPLATE');
  const state=createDefaultLayout({furniture:template.furniture,printers:template.printers},catalog);
  if(!state.furniture.length&&!state.printers.length)fail('GROUP_MEMBERS');
  return state;
}
export function groupTemplateInfo(template,catalog=[]){
  catalog=catalogRows(catalog);
  const state=validateGroupTemplate(template,catalog),scene=deriveScene(state,catalog),all=[...scene.furniture,...scene.printers],box=bounds(all.flatMap(e=>e.worldEnvelopeMm));
  return {width:box.maxX-box.minX,depth:box.maxZ-box.minZ,height:Math.max(0,...all.map(e=>e.verticalRangeMm[1])),
    centerOffsetMm:{xMm:(box.minX+box.maxX)/2,zMm:(box.minZ+box.maxZ)/2},printerCount:state.printers.length,furnitureCount:state.furniture.length};
}
export function captureGroupTemplate(state,id,catalog=[]){
  catalog=catalogRows(catalog);
  checked(state,catalog);const g=requireGroup(state,id),ids=new Set(groupEntityIds(state,id));
  const issues=validatePlacement(state,catalog).filter(e=>e.entityIds.some(id=>ids.has(id)));
  if(issues.length)throw new LayoutValidationError(issues.map(e=>({code:e.code,path:'group',params:e.params})));
  const local=pose=>{const [xMm,zMm]=rotateXZ([pose.xMm-g.pose.xMm,pose.zMm-g.pose.zMm],-g.pose.yawDeg);return {xMm,zMm,yawDeg:pose.yawDeg-g.pose.yawDeg};};
  const template={format:'3d-print-rig-layout-set',version:1,name:g.name,
    furniture:state.furniture.filter(f=>ids.has(f.id)).map(f=>({...clone(f),pose:local(f.pose)})),
    printers:state.printers.filter(p=>ids.has(p.id)).map(p=>({...clone(p),...(p.attachment.parentId===null?{attachment:{...p.attachment,...local(p.attachment)}}:{})}))};
  validateGroupTemplate(template,catalog);return template;
}
export function instantiateGroupTemplate(state,template,{id,xMm,zMm,yawDeg=0},catalog=[]){
  catalog=catalogRows(catalog);
  checked(state,catalog);const source=validateGroupTemplate(template,catalog),names=new Map();
  source.furniture.forEach((f,i)=>names.set(f.id,`${id}:f${i+1}`));source.printers.forEach((p,i)=>names.set(p.id,`${id}:p${i+1}`));
  const world=pose=>{const [x,z]=rotateXZ([pose.xMm,pose.zMm],yawDeg);return {xMm:xMm+x,zMm:zMm+z,yawDeg:pose.yawDeg+yawDeg};};
  const furniture=source.furniture.map(f=>({...clone(f),id:names.get(f.id),pose:world(f.pose)}));
  const printers=source.printers.map(p=>({...clone(p),id:names.get(p.id),attachment:{...p.attachment,
    ...(p.attachment.parentId===null?world(p.attachment):{parentId:names.get(p.attachment.parentId)})}}));
  const memberIds=[...furniture.map(f=>f.id),...printers.filter(p=>p.attachment.parentId===null).map(p=>p.id)];
  const pose={xMm,zMm,yawDeg},assembled={...state,furniture:[...state.furniture,...furniture],printers:[...state.printers,...printers]};
  const group={id,name:template.name,memberIds,pose,originPose:{...pose},memberPoses:memberIds.map(id=>({id,pose:{...rootPose(assembled,id)}}))};
  const next=checked({...assembled,groups:[...(state.groups??[]),group]},catalog),ids=new Set([...furniture,...printers].map(e=>e.id));
  const issues=validatePlacement(next,catalog).filter(e=>e.entityIds.some(id=>ids.has(id)));
  if(issues.length)throw new LayoutValidationError(issues.map(e=>({code:e.code,path:'placement',params:e.params})));
  return next;
}
export function proposeGroupPlacement(state,input,catalog=[]){
  let sizeMm={width:0,depth:0,height:0};
  const {id,template}=input,world={xMm:finite(input.xMm)?input.xMm:0,yMm:0,zMm:finite(input.zMm)?input.zMm:0,yawDeg:finite(input.yawDeg,LIMITS.maxYawDeg)?input.yawDeg:0};
  const rejected=issues=>({kind:'group',valid:false,state:null,id,world:{...world},sizeMm,issues,guides:[]});
  if(!finite(input.xMm)||!finite(input.zMm)||!finite(input.yawDeg,LIMITS.maxYawDeg)||![0,10].includes(input.snapMm??10))return rejected([{code:'NUMBER_OUT_OF_RANGE',path:'placement',params:{}}]);
  try{sizeMm=groupTemplateInfo(template,catalog);}catch(e){return rejected(e.errors??[]);}
  if(input.snapMm!==0)for(const axis of ['xMm','zMm'])world[axis]=Math.round(world[axis]/10)*10||0;
  try{return {kind:'group',valid:true,state:instantiateGroupTemplate(state,template,{id,...world},catalog),id,world:{...world},sizeMm,issues:[],guides:[]};}
  catch(e){return rejected(e.errors??[{code:'GROUP_TEMPLATE',path:'placement',params:{}}]);}
}
export function parseGroupLibrary(text,catalog=[]){
  if(typeof text!=='string'||text.length>LIMITS.maxJsonChars)fail('JSON_SIZE_LIMIT');
  let items;try{items=JSON.parse(text);}catch{fail('JSON_PARSE_ERROR');}
  if(!Array.isArray(items)||items.length>GROUP_LIBRARY_LIMIT)fail('GROUP_LIBRARY_LIMIT');
  const ids=new Set();
  for(const item of items){
    if(!item||Object.keys(item).some(k=>!['id','template'].includes(k))||typeof item.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,100}$/.test(item.id)||ids.has(item.id))fail('GROUP_TEMPLATE');
    ids.add(item.id);validateGroupTemplate(item.template,catalog);
  }
  return clone(items);
}

// Persisted group anchors keep repeated turns and A-to-B-to-A moves from drifting.
import {rotateXZ} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

const samePose=(a,b)=>['xMm','zMm','yawDeg'].every(k=>a?.[k]===b?.[k]);
export function rootPose(state,id){
  const furniture=state.furniture.find(e=>e.id===id);
  if(furniture)return furniture.pose;
  const a=state.printers.find(e=>e.id===id)?.attachment;
  return a?.parentId===null?{xMm:a.xMm,zMm:a.zMm,yawDeg:a.yawDeg}:null;
}
export function groupRootPose(group,id,pose=group.pose){
  const original=group.memberPoses.find(e=>e.id===id)?.pose;
  if(!original)return null;
  if(samePose(pose,group.originPose))return {...original};
  const delta=pose.yawDeg-group.originPose.yawDeg;
  const [x,z]=rotateXZ([original.xMm-group.originPose.xMm,original.zMm-group.originPose.zMm],delta);
  return {xMm:pose.xMm+x,zMm:pose.zMm+z,yawDeg:original.yawDeg+delta};
}
// Ordinary item edits remain possible. Re-anchor only the groups whose root
// changed; resizing a desk or adding a child does not discard its exact anchor.
export function rebaseLayoutGroups(previous,next){
  if(!previous.groups)return undefined;
  return previous.groups.flatMap(group=>{
    const memberIds=group.memberIds.filter(id=>rootPose(next,id));
    if(!memberIds.length)return [];
    const changed=memberIds.some(id=>!samePose(rootPose(previous,id),rootPose(next,id)));
    return [{...group,memberIds,
      ...(changed?{originPose:{...group.pose},memberPoses:memberIds.map(id=>({id,pose:{...rootPose(next,id)}}))}
        :{memberPoses:group.memberPoses.filter(e=>memberIds.includes(e.id))})}];
  });
}

// Keep sub-millimetre source layers distinct at metre-scale viewing distances.
// No source vertices, normals, materials or placements are changed.
export function referenceDepthRange(distance,diagonal){
 if(!Number.isFinite(distance)||distance<=0||!Number.isFinite(diagonal)||diagonal<=0)throw Error('Invalid assembly camera bounds');
 return {near:Math.max(.0001,distance*.01),far:Math.max(10,distance+diagonal*3)};
}

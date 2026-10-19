import {sourceOperatingBounds} from './source-operating-bounds6.mjs';
import {sourceReviewBounds} from './source-assembly-runtime/receiver_guard309.mjs';
import {sourceMinimumContext} from './source-assembly-runtime/state.mjs';
export function sourceControlBounds(packet,state,axis){
 const bounds=sourceOperatingBounds(packet,state.review_axes,axis)??sourceReviewBounds(packet,axis);
 if(axis!=='z')return bounds;
 const z=sourceMinimumContext(packet,state);
 return {...bounds,min:Math.max(bounds.min,z.minimum_z_mm??bounds.min),max:Math.min(bounds.max,z.maximum_z_mm??bounds.max)};
}

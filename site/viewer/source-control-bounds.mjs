import {sourceOperatingBounds} from './source-operating-bounds6.mjs?v=1e6289b77e9233488baf';
import {sourceReviewBounds} from './source-assembly-runtime/receiver_guard309.mjs?v=e73d2df413e8fdcf045d';
import {sourceMinimumContext} from './source-assembly-runtime/state.mjs?v=b5247a9c87c6a42703d7';
export function sourceControlBounds(packet,state,axis){
 const bounds=sourceOperatingBounds(packet,state.review_axes,axis)??sourceReviewBounds(packet,axis);
 if(axis!=='z')return bounds;
 const z=sourceMinimumContext(packet,state);
 return {...bounds,min:Math.max(bounds.min,z.minimum_z_mm??bounds.min),max:Math.min(bounds.max,z.maximum_z_mm??bounds.max)};
}

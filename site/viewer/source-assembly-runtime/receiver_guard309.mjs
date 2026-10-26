import {currentSourceReviewBounds34} from './source_current_collision34.mjs?v=eb7f77c9b47abcc8b543';
// Necessary source-body boundary; the broader guide envelope remains diagnostic.
export function validateSelectedSourceReceiverMotion(packet,pose){
 const c=packet.source_receiver_guard309;if(!c)return pose;
 if(c.model_sha256!==packet.model.sha256||c.inventory_sha256!==packet.inventory.sha256||c.selected_pair_count!==36||c.whole_head_clearance!==false)throw Error('Receiver source binding changed');
 const host=packet.private_source_motion172.target_axes_by_key;
 for(const [key,axes]of Object.entries(c.required_hosts))if((host[key]||[]).slice().sort().join()!==axes.slice().sort().join())throw Error('Receiver source host changed');
 if(!Number.isFinite(pose.x)||pose.x<=c.left_contact_mm||pose.x>=c.right_contact_mm){const error=Error('The X carriage reaches a printed receiver.');error.code='SOURCE_RECEIVER_BOUNDARY';throw error;}
 return pose;
}
function adjacent(value,up){const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);let bits=data.getBigUint64(0);bits+=(value>0)===up?1n:-1n;data.setBigUint64(0,bits);return data.getFloat64(0);}
export function sourceReviewBounds(packet,axis){const d=packet?.private_source_motion172?.axes[axis];if(!d)return{min:packet?.axes?.[axis]?.min_mm??0,max:packet?.axes?.[axis]?.max_mm??0};const c=packet.source_receiver_guard309;return currentSourceReviewBounds34(packet,axis,{min:axis==='x'&&c?Math.max(d.preview_support_displacement_min_mm,adjacent(c.left_contact_mm,true)):d.preview_support_displacement_min_mm,max:axis==='x'&&c?Math.min(d.preview_support_displacement_max_mm,adjacent(c.right_contact_mm,false)):d.preview_support_displacement_max_mm});}

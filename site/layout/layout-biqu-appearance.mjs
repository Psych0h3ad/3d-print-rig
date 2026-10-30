// Display finishes from official product photographs. The supplied source CAD
// has no material assignments; this is not an exact paint/material specification.
export const BIQU_FINISH_SOURCE=Object.freeze({id:'biqu-photo-finish-v1',
 modelSHA256:'cd531f04bf1db39af6826aa658fe30a2e9efaafd1209e5d61ff4548c4970c83b',
 reference:'https://biqu.equipment/products/biqu-popstation-mini-sealed-dual-drawer-storage-cabinet-for-4-filament-spools',
 manual:'https://neo.bttwiki.com/en/docs/more-series/pop-module/popstation-mini/'});
export const BIQU_FINISH_STYLES=Object.freeze(Object.fromEntries(Object.entries({
 coated:{color:'#eeede8',metalness:.04,roughness:.65,opacity:1},
 metal:{color:'#afb5bd',metalness:.72,roughness:.3,opacity:1},
 seal:{color:'#292c30',metalness:0,roughness:.9,opacity:1},
 handle:{color:'#1c1e22',metalness:0,roughness:.6,opacity:1},
 window:{color:'#687376',metalness:0,roughness:.22,opacity:.3},
 unassigned:{color:'#adadad',metalness:0,roughness:.64,opacity:1}
}).map(([key,value])=>[key,Object.freeze(value)])));
// Exact authored occurrence identities, including anonymous purchased leaves.
// Unconfirmed interior finishes retain neutral gray rather than inheriting paint.
export const BIQU_FINISH_LEAVES=Object.freeze([
 [0,"0:1:1:3","0:1:1:2:1","coated"],
 [1,"0:1:1:4","0:1:1:2:2","metal"],
 [2,"0:1:1:5","0:1:1:1:2","unassigned"],
 [3,"0:1:1:7","0:1:1:6:1","coated"],
 [4,"0:1:1:8","0:1:1:6:2","metal"],
 [5,"0:1:1:10","0:1:1:9:1","unassigned"],
 [6,"0:1:1:14","0:1:1:13:1","coated"],
 [7,"0:1:1:15","0:1:1:13:2","metal"],
 [8,"0:1:1:15","0:1:1:13:3","metal"],
 [9,"0:1:1:15","0:1:1:13:4","metal"],
 [10,"0:1:1:15","0:1:1:13:5","metal"],
 [11,"0:1:1:15","0:1:1:13:6","metal"],
 [12,"0:1:1:15","0:1:1:13:7","metal"],
 [13,"0:1:1:15","0:1:1:13:8","metal"],
 [14,"0:1:1:15","0:1:1:13:9","metal"],
 [15,"0:1:1:15","0:1:1:13:10","metal"],
 [16,"0:1:1:15","0:1:1:13:11","metal"],
 [17,"0:1:1:15","0:1:1:13:12","metal"],
 [18,"0:1:1:15","0:1:1:13:13","metal"],
 [19,"0:1:1:16","0:1:1:13:14","metal"],
 [20,"0:1:1:17","0:1:1:13:15","metal"],
 [21,"0:1:1:18","0:1:1:12:2","seal"],
 [22,"0:1:1:18","0:1:1:12:3","seal"],
 [23,"0:1:1:19","0:1:1:12:4","seal"],
 [24,"0:1:1:19","0:1:1:12:5","seal"],
 [25,"0:1:1:20","0:1:1:11:2","seal"],
 [26,"0:1:1:21","0:1:1:11:3","seal"],
 [27,"0:1:1:21","0:1:1:11:4","seal"],
 [28,"0:1:1:22","0:1:1:11:5","seal"],
 [29,"0:1:1:23","0:1:1:11:6","window"],
 [30,"0:1:1:24","0:1:1:11:7","handle"],
 [31,"0:1:1:25","0:1:1:11:8","metal"],
 [32,"0:1:1:25","0:1:1:11:9","metal"],
 [33,"0:1:1:26","0:1:1:11:10","metal"],
 [34,"0:1:1:26","0:1:1:11:11","metal"],
 [35,"0:1:1:26","0:1:1:11:12","metal"],
 [36,"0:1:1:26","0:1:1:11:13","metal"],
 [37,"0:1:1:26","0:1:1:11:14","metal"],
 [38,"0:1:1:26","0:1:1:11:15","metal"],
 [39,"0:1:1:26","0:1:1:11:16","metal"],
 [40,"0:1:1:26","0:1:1:11:17","metal"],
 [41,"0:1:1:26","0:1:1:11:18","metal"],
 [42,"0:1:1:26","0:1:1:11:19","metal"],
 [43,"0:1:1:26","0:1:1:11:20","metal"],
 [44,"0:1:1:26","0:1:1:11:21","metal"],
 [45,"0:1:1:27","0:1:1:1:6","unassigned"],
 [46,"0:1:1:27","0:1:1:1:7","unassigned"],
 [47,"0:1:1:27","0:1:1:1:8","unassigned"],
 [48,"0:1:1:27","0:1:1:1:9","unassigned"],
 [49,"0:1:1:28","0:1:1:1:10","unassigned"],
 [50,"0:1:1:28","0:1:1:1:11","unassigned"],
 [51,"0:1:1:29","0:1:1:1:12","unassigned"],
 [52,"0:1:1:29","0:1:1:1:13","unassigned"],
 [53,"0:1:1:30","0:1:1:1:14","coated"],
 [54,"0:1:1:31","0:1:1:1:15","coated"],
 [55,"0:1:1:33","0:1:1:32:1","coated"],
 [56,"0:1:1:34","0:1:1:32:2","unassigned"],
 [57,"0:1:1:34","0:1:1:32:3","unassigned"],
 [58,"0:1:1:34","0:1:1:32:4","unassigned"],
 [59,"0:1:1:34","0:1:1:32:5","unassigned"],
 [60,"0:1:1:35","0:1:1:1:17","metal"],
 [61,"0:1:1:35","0:1:1:1:18","metal"],
 [62,"0:1:1:35","0:1:1:1:19","metal"],
 [63,"0:1:1:35","0:1:1:1:20","metal"],
 [64,"0:1:1:35","0:1:1:1:21","metal"],
 [65,"0:1:1:35","0:1:1:1:22","metal"],
 [66,"0:1:1:35","0:1:1:1:23","metal"],
 [67,"0:1:1:36","0:1:1:1:24","metal"],
 [68,"0:1:1:37","0:1:1:1:25","unassigned"],
 [69,"0:1:1:38","0:1:1:1:26","coated"],
].map(Object.freeze));
export function biquFinishLeaf(index,definition,instance){
 const row=BIQU_FINISH_LEAVES[index];
 if(!Number.isSafeInteger(index)||!row||row[0]!==index||row[1]!==definition||row[2]!==instance)
  throw Object.assign(new Error('BIQU appearance source identity changed'),{code:'LAYOUT_BIQU_APPEARANCE'});
 return Object.freeze({index,role:row[3],style:BIQU_FINISH_STYLES[row[3]],materialIndex:index===53||index===54?3:row[3]==='metal'?1:row[3]==='window'?2:0});
}
export function createBiquFinishMaterial(material,role,{vertexColors=false}={}){
 if(!material?.isMaterial||typeof material.clone!=='function'||!BIQU_FINISH_STYLES[role])throw Error('Invalid BIQU finish material');
 const copy=material.clone(),style=BIQU_FINISH_STYLES[role];
 if(role!=='unassigned'||vertexColors){copy.color.set(style.color);copy.metalness=style.metalness;copy.roughness=style.roughness;copy.opacity=style.opacity;copy.transparent=style.opacity<1;copy.depthWrite=style.opacity===1;}
 copy.vertexColors=vertexColors;
 if(vertexColors)copy.color.setRGB(1,1,1);
 copy.userData={...copy.userData,biquFinish:role,biquFinishReference:BIQU_FINISH_SOURCE.id};
 return copy;
}

import {ShaderLib} from 'three';

const MARK='native-source-optical-response-v1';
const visible=o=>Boolean(o?.visible)&&(!o.parent||visible(o.parent));
export function opticalHeadOwner(mesh,scene){
 for(let p=mesh;p&&p!==scene;p=p.parent)if(p.userData?.ledSourceAsset)return p;
 return mesh?.parent&&mesh.parent!==scene?mesh.parent:null;
}
export function pairedOpticalEmitter(entry,emitters,scene){
 const owner=opticalHeadOwner(entry.mesh,scene),ids=entry.guide.led_ids||[entry.guide.emitter_id];
 if(!owner||!visible(entry.mesh))return null;
 const matches=emitters.filter(e=>ids.includes(e.identity.id)&&e.identity.kind!=='nozzle'&&visible(e.mesh)&&opticalHeadOwner(e.mesh,scene)===owner);
 return matches.length===1?matches[0]:null;
}

// Display response for an identified native light guide, after tone mapping.
// This is not photometry. Native CAD, PBR properties and electrical LED gains
// are untouched; disabled/zero-emission output follows the original shader.
export function opticalDisplayColorCPU(mapped,emission,enabled=true){
 for(const rgb of [mapped,emission])if(!Array.isArray(rgb)||rgb.length!==3||!rgb.every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid optical radiance');
 const peak=Math.max(...emission);if(!enabled||peak===0)return [...mapped];
 const weight=-Math.expm1(-peak);
 return mapped.map((c,i)=>c*(1-weight)+(emission[i]/peak*weight)*weight);
}
export const OPTICAL_FRAGMENT=String.raw`
float sourceOpticalPeak = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
if (sourceOpticalEnabled > 0.5 && sourceOpticalPeak > 0.0) {
  float sourceOpticalWeight = 1.0 - exp(-sourceOpticalPeak);
  vec3 sourceOpticalColor = (totalEmissiveRadiance / sourceOpticalPeak) * sourceOpticalWeight;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, sourceOpticalColor, sourceOpticalWeight);
}
`;
function supported(fragment){
 const tone='#include <tonemapping_fragment>',space='#include <colorspace_fragment>';
 if(typeof fragment!=='string'||fragment.split(tone).length!==2||fragment.split(space).length!==2||!fragment.includes('vec3 totalEmissiveRadiance = emissive;')||fragment.indexOf(tone)>fragment.indexOf(space))throw Error('Unsupported native optical shader');
}
export function prepareOpticalGuideResponse(entry,{guideFor,scene}={}){
 const {mesh,guide,materials}=entry,identity=guideFor?.(mesh);
 if(!identity||typeof identity.id!=='string'||!identity.id.trim()||typeof guide?.id!=='string'||!guide.id.trim()||identity.id!==guide.id||JSON.stringify(identity)!==JSON.stringify(guide)||!opticalHeadOwner(mesh,scene))throw Error('Unidentified source optical guide');
 if(mesh.userData?.ledGuide?.originalMaterial!==entry.originalMaterial||[].concat(mesh.material).some((m,i)=>m!==materials[i])||[].concat(mesh.material).length!==materials.length||!materials.length)throw Error('Optical guide material ownership mismatch');
 if(materials.some(m=>m.type!=='MeshStandardMaterial'||m.userData.sourceOpticalResponse))throw Error('Unsupported optical guide material');
 supported(ShaderLib.standard.fragmentShader);
 const held=materials.map(m=>({m,compile:m.onBeforeCompile,cache:m.customProgramCacheKey,key:m.customProgramCacheKey()})),shaders=new Set();
 let enabled=0,disposed=false;
 for(const h of held){
  h.m.onBeforeCompile=function(shader,renderer){
   h.compile.call(this,shader,renderer);supported(shader.fragmentShader);
   if(Object.hasOwn(shader.uniforms,'sourceOpticalEnabled'))throw Error('Duplicate optical shader hook');
   shader.uniforms.sourceOpticalEnabled={value:enabled};shaders.add(shader);
   shader.fragmentShader='uniform float sourceOpticalEnabled;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>','#include <tonemapping_fragment>\n'+OPTICAL_FRAGMENT);
  };
  h.m.customProgramCacheKey=function(){return h.key+'|'+MARK;};
  h.m.userData.sourceOpticalResponse={guide_id:guide.id};h.m.needsUpdate=true;
 }
 return {
  update(emitter){
   if(disposed)throw Error('Disposed optical guide');
   if([].concat(mesh.material).length!==materials.length||[].concat(mesh.material).some((m,i)=>m!==materials[i]))throw Error('Stale current optical material');
   enabled=emitter&&visible(mesh)&&visible(emitter.mesh)&&opticalHeadOwner(mesh,scene)===opticalHeadOwner(emitter.mesh,scene)&&(guide.led_ids||[guide.emitter_id]).includes(emitter.identity.id)&&emitter.identity.kind!=='nozzle'&&emitter.surface.materials[0].emissiveIntensity>0?1:0;
   for(const shader of shaders)shader.uniforms.sourceOpticalEnabled.value=enabled;
   return enabled;
  },
  get enabled(){return enabled;},
  dispose(){if(disposed)return;disposed=true;for(const h of held){h.m.onBeforeCompile=h.compile;h.m.customProgramCacheKey=h.cache;delete h.m.userData.sourceOpticalResponse;h.m.needsUpdate=true;}shaders.clear();}
 };
}

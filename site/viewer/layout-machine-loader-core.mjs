// No DOM, renderer, storage, network or model side effects on module import.
export function createLayoutMachineLoader({recipes,loadRecipe,normalize}) {
 const byId=new Map(recipes.map(r=>[r.machine_id,r]));
 if(byId.size!==69||recipes.length!==69)throw Error('Layout catalog must bind all 69 available machines');
 let owned=null;
 return async function loadLayoutMachine(machineId,{signal,onProgress=()=>{}}={}) {
  const recipe=byId.get(machineId);
  if(!recipe)throw Object.assign(Error('Unknown layout machine: '+machineId),{code:'LAYOUT_UNKNOWN_MACHINE'});
  signal?.throwIfAborted();
  if(owned)throw Object.assign(Error('Dispose the previous layout machine before loading another'),{code:'LAYOUT_MODEL_STILL_OWNED'});
  const lease={};owned=lease;let value,disposed=false;
  const emit=event=>{if(!disposed&&!signal?.aborted)onProgress(typeof event==='string'?{phase:'assembly',message:event,percent:null}:event)};
  const dispose=()=>{if(disposed)return;disposed=true;const previous=value;value=null;try{previous?.dispose()}finally{if(owned===lease)owned=null}};
  try {
   emit({phase:'recipe',machineId,percent:null});
   value=await loadRecipe(recipe,{signal,onProgress:emit});
   signal?.throwIfAborted();
   if(!value?.root?.isObject3D||typeof value.dispose!=='function'||!value.source)throw Error('Incomplete layout assembly contract');
   const result=normalize(value.root,recipe);
   signal?.throwIfAborted();
   // The root wrapper belongs to this load. A consumer retaining panels must
   // deep-clone their geometry/materials/textures before dispose().
   const release=value.dispose;value.dispose=()=>{result.root.removeFromParent();try{release()}finally{result.root.clear()}};
   emit({phase:'ready',machineId,percent:100});
   return {root:result.root,dimensions:result.dimensions,source:{...value.source,machineId,category:recipe.category,normalization:result.normalization},manifest:value.manifest,profile:value.profile,dispose};
  } catch(error) {dispose();throw error}
 };
}

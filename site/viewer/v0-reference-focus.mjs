const contextReferences=new Set(['reference-belt-paths','reference-tophat-profiles','reference-startup-docs']);
// Text-only context references may frame currently visible source parts; they
// do not assign parts, move hardware or infer mounting/clearance.
export function getV0AssemblyFocus(controller){
 const own=controller.getBoundsKeys(),context=contextReferences.has(controller.current()?.id)&&own.length===0;
 return {keys:[...(context?controller.getVisibleKeys():own)],text:context?'Focus visible assembly':'Focus added parts',context};
}

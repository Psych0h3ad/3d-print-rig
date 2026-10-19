// Match the source-assembly page's r180 import map in this actual-asset job.
export async function resolve(specifier,context,nextResolve){
 if(specifier==='three')return {url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}

// Match the browser's r180 scope using the actual assembled artifact's vendor
// directory. Never substitute a different checkout's Three implementation.
export async function resolve(specifier,context,nextResolve){
  if(specifier==='three'&&context.parentURL){
    const parent=new URL(context.parentURL),mark='/viewer/vendor-r180/',at=parent.pathname.lastIndexOf(mark);
    if(parent.protocol==='file:'&&at>=0){
      parent.pathname=parent.pathname.slice(0,at+mark.length)+'three.module.js';
      parent.search='';parent.hash='';return {url:parent.href,shortCircuit:true};
    }
  }
  return nextResolve(specifier,context);
}

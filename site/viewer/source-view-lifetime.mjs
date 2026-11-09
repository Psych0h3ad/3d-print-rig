// This view owns its resources until a real page exit. BFCache retains them.
export function createSourceViewLifetime({onClose,abort,cleanup=[],reportError}){
 let closed=false;const accepted=new WeakSet(),rejected=new WeakSet(),actions=[onClose,abort,...cleanup].filter(Boolean),failures=[];
 function report(errors){if(errors.length){failures.push(...errors);reportError?.(new AggregateError(errors,'Source view cleanup failed'))}}
 function close(event={}){
  if(event.persisted||closed)return false;closed=true;const errors=[];
  for(const action of actions)try{action()}catch(error){errors.push(error)}
  report(errors);return true;
 }
 function acceptLoaded(model){
  if(!model||typeof model.dispose!=='function')throw Error('Source view requires a disposable received model');
  if(!closed){accepted.add(model);return true}
  if(!accepted.has(model)&&!rejected.has(model)){rejected.add(model);try{model.dispose()}catch(error){report([error])}}
  return false;
 }
 return Object.freeze({get closed(){return closed},close,acceptLoaded,acceptIndex:()=>!closed,errors:()=>[...failures]});
}

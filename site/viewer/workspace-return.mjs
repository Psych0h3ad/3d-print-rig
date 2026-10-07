import {normalizeLanguage} from './languages.mjs?v=ba6a5cd8e1d86849ca34';
import {machinePage} from './machines.js?v=9a3eae7a7c53d576c80d';

export const workspaceReturnKey='3d-print-rig-workspace-return';
export function workspaceKindFor(page){
 if(page==='e3ng.html')return 'toolchangers';
 return ['toolheads.html','gantries.html','components.html','toolchangers.html'].includes(page)?page.replace('.html',''):'printer';
}
export function printerWorkspaceURL(current,remembered){
 const here=new URL(current),q=here.searchParams;
 const make=(id,configuration)=>{const page=machinePage(id);if(!page)return null;const url=new URL(page,here);url.searchParams.set('machine',id);if(configuration&&configuration.length<1024)url.searchParams.set('configuration',configuration);return url};
 const samePage=(url,canonical)=>url.pathname===canonical.pathname||(canonical.pathname.endsWith('/')&&url.pathname===canonical.pathname+'index.html');
 let target=make(q.get('return_machine'),q.get('return_configuration'));
 if(!target&&machinePage(q.get('machine'))){
  target=make(q.get('machine'),q.get('configuration'));
  if(samePage(here,target))target=new URL(here);
 }
 if(!target&&remembered)try{
  const saved=new URL(remembered,here),canonical=make(saved.searchParams.get('machine'));
  if(canonical&&saved.origin===here.origin&&samePage(saved,canonical))target=saved;
 }catch{}
 target ||= new URL('./',here);
 const lang=q.get('lang');if(normalizeLanguage(lang))target.searchParams.set('lang',normalizeLanguage(lang));
 return target.href;
}

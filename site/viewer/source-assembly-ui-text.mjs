import{sourceText}from './source-assembly-messages.mjs?v=18064021df3d80b39318';
import{sourceCreditPresentation}from './source-credit-format.mjs';
export const sourceCreditLabel=source=>sourceCreditPresentation(source).label;
export function createSourceUIText(language){
 const bindings=new Map(),t=key=>sourceText(key,language());
 const dynamic=(node,format)=>{bindings.set(node,format);node.dataset.i18n='off';node.textContent=format(t);return node;};
 return{t,dynamic,set:(node,key,suffix='')=>dynamic(node,t=>t(key)+suffix),clear:node=>{bindings.delete(node);node.textContent='';},refresh:()=>{for(const[node,format]of bindings)node.textContent=format(t);}};
}
export function sourceCreditNote(source,t){const p=sourceCreditPresentation(source),terms=source.license_variants??[source.license],licenses=terms.map(v=>v==='No license stated in the public CAD download.'?t('unknownLicense'):v),license=p.repository_license?t('repositoryLicense')+': '+p.repository_license+(terms.some(v=>v!==p.repository_license)?'; '+t('componentLicense')+': '+licenses.join(' / '):''):licenses.join(' / ');return ' · '+(p.revision??t('unknownRevision'))+' · '+license;}

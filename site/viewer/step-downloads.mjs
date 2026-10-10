import {formatMessage} from './i18n.mjs?v=d6d7a630d8514cd1463d';
// Only published baseline assemblies; a selected head or Mod never changes a URL.
export function assemblyDownloadEntries(catalog) {
const entries=[],seen=new Set();
for (const item of catalog.defaults || []) {
const id=item.machine_id || item.id;
if (!id || seen.has(id) || item.release_verified !== true) continue;
let url;
try { url=new URL(item.step_zip?.path || item.url); } catch { continue; }
if (url.protocol !== 'https:' || url.username || url.password || !/\.(?:zip|step|stp)$/i.test(url.pathname)) continue;
seen.add(id);
entries.push({id,url:url.href,name:item.display_name || `${item.brand} ${item.model} / ${item.size} mm`,
configuration:item.configuration,revision:item.revision,custom:item.custom_reference === true,
filename:item.step_zip?.filename || decodeURIComponent(url.pathname.split('/').pop()),
bytes:item.step_zip?.bytes,upstream:item.upstream_url});
}
return entries;
}
export function filterAssemblyDownloads(entries,query='') {
const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
return entries.filter(item=>terms.every(term=>`${item.name} ${item.configuration} ${item.revision}`.toLocaleLowerCase().includes(term)));
}
const element=(tag,id,className)=>{
const node=document.createElement(tag);
if (className) node.className=className;
if (id) { node.dataset.i18nId=id; node.textContent=formatMessage(id,{},document.documentElement.lang || 'en'); }
return node;
};
const nativeText=(tag,text)=>{
const node=element(tag); node.dataset.i18n='off'; node.textContent=text || ''; return node;
};
export function mountStepDownloadLibrary(container,entries,machineId) {
container.replaceChildren();
container.append(element('p','text.0364','step-scope'));
if (machineId && !entries.some(item=>item.id === machineId)) container.append(element('p','step.unavailable','step-unavailable'));
const label=element('label','step.search'); label.htmlFor='stepDownloadSearch';
const search=element('input'); search.id='stepDownloadSearch'; search.type='search';
container.append(label,search);
const list=element('div',null,'step-download-list'),rows=new Map();
for (const item of [...entries].sort((a,b)=>Number(b.id === machineId) - Number(a.id === machineId))) {
const row=element('article',null,'step-download-row'); row.dataset.stepMachine=item.id;
if (item.id === machineId) { row.classList.add('is-current'); row.append(element('span','step.current','step-current-label')); }
row.append(nativeText('h3',item.name),nativeText('p',item.configuration));
const metadata=nativeText('p',[item.revision,item.bytes ? `ZIP · ${Math.ceil(item.bytes / 1048576)} MB` : 'STEP · ZIP'].filter(Boolean).join(' · '));
metadata.className='step-file-info'; row.append(metadata);
if (item.custom) row.append(element('p','step.custom','step-reference-notice'));
const actions=element('div',null,'step-download-actions');
const link=element('a','step.download','step-download-link'); link.href=item.url; link.download=item.filename;
const name=nativeText('span',` — ${item.name}`); name.className='language-label'; link.append(name);
actions.append(link);
if (item.upstream) { const source=element('a','text.0365','step-source-link'); source.href=item.upstream; source.target='_blank'; source.rel='noopener'; actions.append(source); }
row.append(actions); list.append(row); rows.set(item.id,row);
}
const empty=element('p','step.empty'); empty.hidden=entries.length > 0;
const update=()=>{
const visible=new Set(filterAssemblyDownloads(entries,search.value).map(item=>item.id));
for (const [id,row] of rows) row.hidden=!visible.has(id);
empty.hidden=visible.size > 0;
};
search.addEventListener('input',update);
container.append(list,empty);
return {search,update};
}

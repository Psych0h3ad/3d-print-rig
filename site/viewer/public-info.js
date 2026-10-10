import {workspaceTask,workspaceListen,WorkspaceMutationObserver} from './workspace-lifecycle.mjs?v=823ad76bd9034ec8d6ff';
import {setupProductDirectory} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {assemblyDownloadEntries,mountStepDownloadLibrary} from './step-downloads.mjs?v=18d8cc0100032c414a37';
import {messageSource} from './i18n.mjs?v=d6d7a630d8514cd1463d';
const $=s=>document.querySelector(s);
function dialog(id,title){const d=document.createElement('dialog');d.id=id;d.innerHTML=`<div class="dialog-head"><h2>${title}</h2><button class="close" aria-label="閉じる"></button></div><div class="dialog-body"></div>`;document.body.append(d);d.querySelector('.close').onclick=()=>d.close();return d}
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
const link=(text,url)=>{const a=node('a',text);a.href=url;a.target='_blank';a.rel='noopener';return a};
export async function setupPublicInfo({includeDownloads=true,machineId=null}={}){return workspaceTask(async()=>{
 setupProductDirectory();
 const sources=dialog('sourcesDialog','出典・ライセンス'),downloads=dialog('downloadsDialog',messageSource('ui.step_downloads'));
 downloads.classList.add('step-download-dialog');downloads.setAttribute('aria-labelledby','stepDownloadsTitle');downloads.querySelector('h2').id='stepDownloadsTitle';downloads.querySelector('h2').dataset.i18nId='ui.step_downloads';
 $('#openSources').onclick=()=>sources.showModal();let downloadButton=$('#openDownloads');
 if(!downloadButton){downloadButton=node('button','');downloadButton.id='openDownloads';$('.header-actions').append(downloadButton)}
 downloadButton.hidden=false;downloadButton.disabled=true;downloadButton.textContent='STEP';downloadButton.setAttribute('aria-label',messageSource('ui.step_downloads'));downloadButton.setAttribute('title',messageSource('ui.step_downloads'));downloadButton.setAttribute('aria-haspopup','dialog');
 const sb=sources.querySelector('.dialog-body'),db=downloads.querySelector('.dialog-body');
 sb.append(node('p','コミュニティCADを組み合わせた非公式ビューアーです。各データの作者・ライセンスは個別に適用されます。'));
 let entries=[];
 const currentMachine=()=>document.body.dataset.workspaceKind==='printer'?(document.body.dataset.machineId||machineId):null;
 const openDownloads=()=>{mountStepDownloadLibrary(db,entries,currentMachine());const credits=node('button','出典・ライセンス');credits.onclick=()=>{downloads.close();sources.showModal()};db.append(credits);downloads.showModal()};
 downloadButton.onclick=openDownloads;
 const updateShortcut=()=>{const shortcut=$('#machineStepDownloads');if(shortcut){shortcut.hidden=!entries.some(item=>item.id===currentMachine());shortcut.setAttribute('aria-haspopup','dialog');shortcut.onclick=openDownloads}};
 new WorkspaceMutationObserver(updateShortcut).observe(document.body,{attributes:true,attributeFilter:['data-machine-id']});
 const loadCatalog=async()=>{downloadButton.disabled=true;try{
  const response=await fetch('../PUBLIC_CATALOG.json?v=a90a9316c88c2f1c3f92',{cache:'no-cache'});if(!response.ok)throw Error('カタログを取得できません');const catalog=await response.json();
  const assemblyDownload=$('#assemblyDownload');if(assemblyDownload)assemblyDownload.hidden=true;
  sb.append(node('p','ビューアー版：'+catalog.viewer_version));
  if(catalog.model_source_url)sb.append(link('表示モデルの編集用データ',catalog.model_source_url));
  for(const archive of catalog.source_archives||[]){const p=node('p','');p.append(link('編集用データ：'+archive.label,archive.url));sb.append(p)}
  for(const s of catalog.sources){const row=node('article','');row.className='source-item';row.append(node('strong',s.label),node('p',s.author),link(s.repository||'配布元',s.url));
   const version=node('p','');version.append(node('code',[s.commit,s.version].filter(Boolean).join(' / ')));row.append(version,node('p','適用範囲：'+s.scope),node('p',s.license),node('p',s.changes));
   if(s.license_url)row.append(link('ライセンス原文',s.license_url));if(s.cad_url)row.append(link('元の組立CAD',s.cad_url));if(s.notice_url)row.append(link('変更と部品の出典',s.notice_url));if(s.component_license_url)row.append(link('部品別ライセンス',s.component_license_url));if(s.notice)row.append(node('p',s.notice));sb.append(row)}
  // The library is global even on a page without its own STEP; never export Mods.
  entries=assemblyDownloadEntries(catalog);updateShortcut();downloadButton.disabled=false;downloadButton.onclick=openDownloads;
  document.body.dataset.publicCatalogVersion=catalog.viewer_version;
 }catch(e){downloadButton.disabled=false;const failed=()=>{db.replaceChildren();const notice=node('p',messageSource('step.error'));notice.dataset.i18nId='step.error';const retry=node('button',messageSource('step.retry'));retry.dataset.i18nId='step.retry';retry.onclick=()=>workspaceTask(async()=>{await loadCatalog();if(entries.length)openDownloads()});db.append(notice,retry);downloads.showModal()};downloadButton.onclick=failed;sb.append(node('p',e.message))}};
 await loadCatalog();downloadButton.onclick=entries.length?openDownloads:downloadButton.onclick;
 workspaceListen(window,'rig-language-change',updateShortcut);
});}

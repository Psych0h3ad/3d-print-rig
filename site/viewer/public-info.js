import {setupProductDirectory} from './product-links.js?v=public-v18-motion1';
const $=s=>document.querySelector(s);
function dialog(id,title){const d=document.createElement('dialog');d.id=id;d.innerHTML=`<div class="dialog-head"><h2>${title}</h2><button class="close" aria-label="閉じる">×</button></div><div class="dialog-body"></div>`;document.body.append(d);d.querySelector('.close').onclick=()=>d.close();return d}
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
const link=(text,url)=>{const a=node('a',text);a.href=url;a.target='_blank';a.rel='noopener';return a};
export async function setupPublicInfo({includeDownloads=true}={}){
 setupProductDirectory();
 const sources=dialog('sourcesDialog','出典・ライセンス'),downloads=dialog('downloadsDialog','標準構成のSTEP');
 $('#openSources').onclick=()=>sources.showModal();const downloadButton=$('#openDownloads');downloadButton.hidden=true;downloadButton.onclick=()=>downloads.showModal();
 const sb=sources.querySelector('.dialog-body'),db=downloads.querySelector('.dialog-body');
 sb.append(node('p','コミュニティCADを組み合わせた非公式ビューアーです。各データの作者・ライセンスは個別に適用されます。'));
 db.append(node('p','STEPはメーカー／VORONの標準構成のみ。画面で選んだMod・色・可動姿勢は含みません。'));
 try{
  const response=await fetch('../PUBLIC_CATALOG.json?v=public-v18-motion1',{cache:'no-cache'});if(!response.ok)throw Error('カタログを取得できません');const catalog=await response.json();
  sb.append(node('p','ビューアー版：'+catalog.viewer_version));
  if(catalog.model_source_url)sb.append(link('表示モデルの編集用データ',catalog.model_source_url));
  for(const archive of catalog.source_archives||[]){const p=node('p','');p.append(link('編集用データ：'+archive.label,archive.url));sb.append(p)}
  for(const s of catalog.sources){const row=node('article','');row.className='source-item';row.append(node('strong',s.label),node('p',s.author),link(s.repository||'配布元',s.url));
   const version=node('p','');version.append(node('code',[s.commit,s.version].filter(Boolean).join(' / ')));row.append(version,node('p','適用範囲：'+s.scope),node('p',s.license),node('p',s.changes));
   if(s.license_url)row.append(link('ライセンス原文',s.license_url));if(s.notice)row.append(node('p',s.notice));sb.append(row)}
  const table=node('table','');table.className='download-table';const head=node('thead','');head.innerHTML='<tr><th>機種 / サイズ</th><th>構成</th><th>STEP</th></tr>';table.append(head);const body=node('tbody','');
  for(const item of catalog.defaults||[]){
   const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname),url=local&&item.local_url?item.local_url:item.url;if(!url)continue;
   if(!includeDownloads)continue;
   const row=node('tr',''),name=node('td',`${item.brand} ${item.model} / ${item.size} mm`);name.append(node('small',item.revision));const config=node('td',item.configuration),action=node('td','');
   const a=link(local&&item.local_url?'ローカルSTEP':item.upstream?'公式データ':'ダウンロード',url);if(!item.upstream||local&&item.local_url){a.removeAttribute('target');a.download=''}action.append(a);
   if(local&&item.local_url&&item.local_note)action.append(node('small',item.local_note));if(item.note)action.append(node('small',item.note));row.append(name,config,action);body.append(row)}table.append(body);if(body.children.length){downloadButton.hidden=false;db.append(table)}document.body.dataset.publicCatalogVersion=catalog.viewer_version;
 }catch(e){sb.append(node('p',e.message));db.append(node('p',e.message))}
}

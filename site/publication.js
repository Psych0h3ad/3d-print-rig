const element=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
function externalLink(label,url){
  const parsed=new URL(url,location.href);
  if(!['https:','http:'].includes(parsed.protocol))throw Error('Unsupported source URL');
  const anchor=element('a',label);anchor.href=parsed.href;anchor.target='_blank';anchor.rel='noopener noreferrer';return anchor;
}
async function loadCatalog(){
  const container=document.querySelector('#sourceList'),downloads=document.querySelector('#defaultDownloads');
  try{
    const response=await fetch('./PUBLIC_CATALOG.json');if(!response.ok)throw Error('Catalog unavailable');
    const catalog=await response.json();container.replaceChildren();
    document.querySelector('#sourceCount').textContent=`${catalog.sources.length} 件`;
    for(const source of catalog.sources){
      const article=element('article','');article.className='source';
      article.append(element('h3',source.label));const detail=element('div','');
      detail.append(element('p',source.author),externalLink(source.repository||'配布元',source.url));
      const version=element('p',[source.commit,source.version].filter(Boolean).join(' / '));version.className='source-version';
      detail.append(version,element('p',`適用範囲：${source.scope}`),element('p',source.license),element('p',source.changes));
      if(source.license_url)detail.append(externalLink('ライセンス原文',new URL(source.license_url,new URL('./viewer/',location.href))));
      if(source.notice){const notice=element('p',source.notice);notice.className='source-notice';detail.append(notice);}
      article.append(detail);container.append(article);
    }
    for(const item of catalog.defaults){
      if(item.upstream&&item.url)downloads.append(externalLink(`${item.brand} ${item.model} / ${item.size} mm — 公式STEP ZIP ↗`,item.url));
    }
    if(!downloads.children.length)downloads.append(element('p','標準STEPのダウンロードは準備中です。機種・サイズごとの検証と配布条件の確認後に有効にします。'));
    document.body.dataset.catalogReady='true';document.body.dataset.sourceCount=catalog.sources.length;
  }catch{
    container.replaceChildren(element('p','出典情報を読み込めませんでした。PUBLIC_CATALOG.jsonを確認してください。'));
    downloads.replaceChildren(element('p','ダウンロード情報を読み込めませんでした。'));
    document.body.dataset.catalogReady='false';
  }
}
loadCatalog();

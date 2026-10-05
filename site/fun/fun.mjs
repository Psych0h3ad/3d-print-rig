import {applyDisplay,displayKey,setupHeaderThemeToggle} from '../viewer/display-preferences.mjs?v=9860960509e28d17f3fd';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),form=$('filters');
const language=query.get('lang') || (navigator.language.startsWith('ja')?'ja':'en'),ja=language==='ja';
$('language').value=ja?'ja':'en';document.documentElement.lang=ja?'ja':'en';
setupHeaderThemeToggle(document.querySelector('header nav'),ja?'ダークモード':'Dark mode');
window.addEventListener('storage',event=>{if(event.key===displayKey)applyDisplay();});
const words=ja?{experimental:'壁紙ダウンロードはテスト公開中、埋め込み機能はアルファテスト段階です。開発中のため、表示や操作が変わる場合があります。',back:'ビューアーを開く ↗',intro:'本物のマシンとCADを、いつもと違う見方で。',explore:'壁紙を見る ↓',collectionTitle:'ものづくりの、ひと休み。',about:'機体や部品を並べた図集、画面いっぱいに敷き詰める総柄、組立図・分解図・フィラメント経路の断面図。元CADの太い外形と、構造を伝える内部線。',packTitle:'まとめてダウンロード',formatLabel:'画面サイズ',paletteLabel:'配色',kindLabel:'図の種類',embedTitle:'あなたのサイトにも、3Dを。',embedInfo:'埋め込み機能はアルファテスト段階です。マシンを開いて「共有」から埋め込みコードをコピー。訪問者は、そのページでモデルを回転して見ることができます。',embedLink:'マシンを選ぶ ↗',credits:'元のCAD・作者・ライセンス',notice:'作品ごと・部品ごとの利用条件が適用されます。再配布時も元のクレジットを保持してください。',save:'PNGを保存',all:'すべて',collection:'一覧・図集',pattern:'総柄',pickCollection:'一覧・図集を見る',pickPattern:'総柄を見る',newNote:'12図柄・108枚を追加',new:'今回追加した壁紙',sourceLabel:'元CAD・作者',assembly:'組立図',exploded:'分解図',section:'断面図',phone:'スマホ',desktop:'デスクトップ',ultrawide:'ウルトラワイド',failure:'壁紙一覧を読み込めませんでした。ページを再読み込みしてください。'}:{save:'Download PNG',all:'All drawings',collection:'Collection sheets',pattern:'Repeating patterns',new:'New wallpapers',sourceLabel:'Original CAD / Authors',assembly:'Assembly',exploded:'Exploded',section:'Section',phone:'Phone',desktop:'Desktop',ultrawide:'Ultrawide',failure:'Could not load wallpapers. Please reload this page.'};
// Translate only copy targets; a category name can also be a section ID.
for(const id of ['experimental','back','intro','explore','collectionTitle','about','packTitle','formatLabel','paletteLabel','kindLabel','embedTitle','embedInfo','embedLink','credits','notice','pickCollection','pickPattern','newNote'])if(words[id])$(id).textContent=words[id];
for(const option of form.elements.kind.options)option.textContent=words[option.value];
$('language').onchange=()=>{const u=new URL(location.href);u.searchParams.set('lang',$('language').value);location.href=u.href;};
for(const a of document.querySelectorAll('a[href="../viewer/"]'))a.href='../viewer/?lang='+(ja?'ja':'en');
form.elements.format.value=query.get('format') || (matchMedia('(max-width:600px)').matches?'phone':'desktop');
form.elements.palette.value=query.get('palette') || 'paper';form.elements.kind.value=query.get('kind') || 'all';
for(const name of ['format','palette','kind'])if(!form.elements[name].value)form.elements[name].selectedIndex=0;
const make=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
const size=bytes=>(bytes/1e6).toFixed(1)+' MB';
try{
  const response=await fetch('./wallpapers.json',{cache:'no-cache'});if(!response.ok)throw Error('Catalog unavailable');const catalog=await response.json();
  const designs=new Set(catalog.wallpapers.map(r=>r.series)).size;
  $('summary').textContent=ja?`${designs}図柄 · 3配色 · 3サイズ`:`${designs} drawings · 3 palettes · 3 sizes`;
  const hero=catalog.wallpapers.find(r=>r.series==='toolhead-field'&&r.palette==='paper'&&r.format==='desktop');
  $('heroImage').src=hero.preview;
  for(const pack of catalog.packs){const a=make('a','','pack');a.href=pack.download;a.append(make('span',(pack.format==='all'?(ja?'全図柄':'Complete collection'):words[pack.format])+' · '+pack.count),make('small','ZIP / '+size(pack.bytes)+' ↓'));$('packs').append(a);}
  function update(){
    const {format,palette,kind}=Object.fromEntries(new FormData(form));
    const rows=catalog.wallpapers.filter(r=>r.format===format&&r.palette===palette&&(kind==='all'||r.kind===kind)).sort((a,b)=>b.no-a.no);
    for(const button of document.querySelectorAll('[data-kind]'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
    const fragment=document.createDocumentFragment();
    for(const row of rows){
      const card=make('article'),preview=make('a','','preview');preview.href=row.download;preview.setAttribute('aria-label',row.title+' / '+words.save);
      const image=make('img');image.src=row.preview;image.alt=row.title+' / '+words[row.kind];image.loading='lazy';image.decoding='async';image.width=row.width;image.height=row.height;preview.append(image);
      const info=make('div','','info');info.append(make('div',String(row.no).padStart(2,'0')+' / '+words[row.kind],'number'),make('h3',row.title),make('span',row.width+' × '+row.height+' · '+size(row.bytes)+(row.view_count?' · '+row.view_count+(ja?'図':' views'):''),'dimensions'));
      const download=make('a','','download');download.href=row.download;download.append(make('span',words.save),make('span','↓'));info.append(download);
      const source=make(row.sources.length>2?'details':'div','','source');
      source.append(make(row.sources.length>2?'summary':'span',words.sourceLabel+(row.sources.length>2?' ('+row.sources.length+')':'')));
      for(const[url,label]of row.sources){const a=make('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener';source.append(a);}info.append(source);card.append(preview,info);fragment.append(card);
    }
    $('grid').replaceChildren(fragment);$('grid').setAttribute('aria-busy','false');$('count').textContent=rows.length+(ja?' 図柄':' drawings');
    const url=new URL(location.href);for(const key of ['format','palette','kind'])url.searchParams.set(key,form.elements[key].value);history.replaceState(null,'',url);
  }
  for(const button of document.querySelectorAll('[data-kind]'))button.onclick=()=>{form.elements.kind.value=button.dataset.kind;update();};
  form.onchange=update;form.onsubmit=e=>e.preventDefault();update();
}catch{ $('grid').setAttribute('aria-busy','false');$('error').textContent=words.failure;$('error').hidden=false; }

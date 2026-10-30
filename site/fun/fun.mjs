import {funWords,formatFunMessage} from './fun-language.mjs?v=f8396e9bb7a5b7e9ccfe';
import {applyDisplay,displayKey,setupHeaderThemeToggle} from '../viewer/display-preferences.mjs?v=8f347468def25922153c';
import {chooseLanguage,languageURL,supportedLanguages,languageNames} from '../viewer/languages.mjs?v=2e376566920474c0f57c';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),form=$('filters');
let stored;try{stored=window.localStorage.getItem('3d-print-rig-language')}catch{}
const language=chooseLanguage({query:query.get('lang'),stored}),ja=language==='ja';
const picker=$('language');
for(const value of supportedLanguages)if(![...picker.options].some(option=>option.value===value)){
  const option=document.createElement('option');option.value=value;option.textContent=languageNames[value];picker.append(option);
}
picker.value=language;
const words=funWords(language),message=(key,values={})=>formatFunMessage(key,values,language);
document.documentElement.lang=language;
document.title=words.pageTitle;
picker.setAttribute('aria-label',words.language);
history.replaceState(null,'',languageURL(location.href,language));
setupHeaderThemeToggle(document.querySelector('header nav'),words.dark);
window.addEventListener('storage',event=>{if(event.key===displayKey)applyDisplay();});
for(const id of ['experimental','back','intro','explore','collectionTitle','about','packTitle','formatLabel','paletteLabel','kindLabel','embedTitle','embedInfo','embedLink','credits','notice','pickCollection','pickPattern','newNote','heroEyebrow','collectionEyebrow','embedEyebrow','heroArtLabel','brandSection'])$(id).textContent=words[id];
$('heroTitle').replaceChildren(document.createTextNode(words.heroFirst),document.createElement('br'),document.createTextNode(words.heroSecond),Object.assign(document.createElement('span'),{textContent:'.'}));
document.querySelector('.collection-picks').setAttribute('aria-label',words.collectionAria);
for(const meta of document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]'))meta.content=words.description;
for(const meta of document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]'))meta.content=document.title;
for(const meta of document.querySelectorAll('meta[property="og:locale"]'))meta.content={en:'en_US',ja:'ja_JP',es:'es_ES',ko:'ko_KR',ru:'ru_RU',de:'de_DE'}[language];
for(const option of form.elements.kind.options)option.textContent=words[option.value];
const dimensions={phone:'1440 × 3120',desktop:'3840 × 2160',ultrawide:'5120 × 2160'};
for(const option of form.elements.format.options)option.textContent=words[option.value]+' · '+dimensions[option.value];
for(const option of form.elements.palette.options)option.textContent=words[{paper:'palettePaper',blueprint:'paletteBlueprint',graphite:'paletteGraphite'}[option.value]];
picker.onchange=()=>{
  const next=chooseLanguage({query:picker.value});
  try{window.localStorage.setItem('3d-print-rig-language',next)}catch{}
  location.href=languageURL(location.href,next);
};
for(const a of document.querySelectorAll('a[href="../viewer/"], a.brand[href="../"]'))a.href=languageURL(new URL(a.getAttribute('href'),location.href).href,language);
form.elements.format.value=query.get('format') || (matchMedia('(max-width:600px)').matches?'phone':'desktop');
form.elements.palette.value=query.get('palette') || 'paper';form.elements.kind.value=query.get('kind') || 'all';
for(const name of ['format','palette','kind'])if(!form.elements[name].value)form.elements[name].selectedIndex=0;
const make=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
const size=bytes=>(bytes/1e6).toFixed(1)+' MB';
try{
  const response=await fetch('./wallpapers.json',{cache:'no-cache'});if(!response.ok)throw Error('Catalog unavailable');const catalog=await response.json();
  const designs=new Set(catalog.wallpapers.map(r=>r.series)).size;
  $('summary').textContent=message('summary',{0:designs});
  const hero=catalog.wallpapers.find(r=>r.series==='toolhead-field'&&r.palette==='paper'&&r.format==='desktop');
  $('heroImage').src=hero.preview;
  for(const pack of catalog.packs){const a=make('a','','pack');a.href=pack.download;a.append(make('span',(pack.format==='all'?words.completeCollection:words[pack.format])+' · '+pack.count),make('small','ZIP / '+size(pack.bytes)+' ↓'));$('packs').append(a);}
  function update(){
    const {format,palette,kind}=Object.fromEntries(new FormData(form));
    const rows=catalog.wallpapers.filter(r=>r.format===format&&r.palette===palette&&(kind==='all'||r.kind===kind)).sort((a,b)=>b.no-a.no);
    for(const button of document.querySelectorAll('[data-kind]'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
    const fragment=document.createDocumentFragment();
    for(const row of rows){
      const card=make('article'),preview=make('a','','preview');preview.href=row.download;preview.setAttribute('aria-label',row.title+' / '+words.save);
      const image=make('img');image.src=row.preview;image.alt=row.title+' / '+words[row.kind];image.loading='lazy';image.decoding='async';image.width=row.width;image.height=row.height;preview.append(image);
      const info=make('div','','info');info.append(make('div',String(row.no).padStart(2,'0')+' / '+words[row.kind],'number'),make('h3',row.title),make('span',row.width+' × '+row.height+' · '+size(row.bytes)+(row.view_count?' · '+message('views',{0:row.view_count}):''),'dimensions'));
      const download=make('a','','download');download.href=row.download;download.append(make('span',words.save),make('span','↓'));info.append(download);
      const source=make(row.sources.length>2?'details':'div','','source');
      source.append(make(row.sources.length>2?'summary':'span',words.sourceLabel+(row.sources.length>2?' ('+row.sources.length+')':'')));
      for(const[url,label]of row.sources){const a=make('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener';source.append(a);}info.append(source);card.append(preview,info);fragment.append(card);
    }
    $('grid').replaceChildren(fragment);$('grid').setAttribute('aria-busy','false');$('count').textContent=message('count',{0:rows.length});
    const url=new URL(location.href);for(const key of ['format','palette','kind'])url.searchParams.set(key,form.elements[key].value);history.replaceState(null,'',url);
  }
  for(const button of document.querySelectorAll('[data-kind]'))button.onclick=()=>{form.elements.kind.value=button.dataset.kind;update();};
  form.onchange=update;form.onsubmit=e=>e.preventDefault();update();
}catch{ $('grid').setAttribute('aria-busy','false');$('error').textContent=words.failure;$('error').hidden=false; }

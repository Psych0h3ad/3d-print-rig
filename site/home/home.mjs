import {homeMessages} from './locale-data.mjs?v=a5e6ff78ccedcc66b9a5';
import {chooseLanguage,languageNames} from '../viewer/languages.mjs?v=2e376566920474c0f57c';
import {setupHeaderThemeToggle} from '../viewer/display-preferences.mjs?v=8f347468def25922153c';
import {startHomeAnalytics} from './usage.mjs?v=0c49acb3d710bfca61a2';

// The root used to be a viewer entry. Keep explicit model/configuration links
// on the same-origin viewer, while ordinary visits now stay on the home page.
export function legacyViewerURL(href){
 const url=new URL(href);
 if(!['machine','configuration'].some(key=>url.searchParams.has(key)))return null;
 const target=new URL('./viewer/',url);target.search=url.search;target.hash=url.hash;return target.href;
}
export function homeDestination(href,current,language){
 const url=new URL(href,current),page=new URL(current);
 if(url.origin!==page.origin||href.startsWith('#'))return url.href;
 url.searchParams.set('lang',language);
 if(page.searchParams.getAll('analytics').includes('off'))url.searchParams.set('analytics','off');
 return url.href;
}
export function setupHome({document=globalThis.document,window=globalThis.window}={}){
 if(!document?.querySelector||!window?.location)return;
 const legacy=legacyViewerURL(window.location.href);if(legacy){window.location.replace(legacy);return;}
 let stored;try{stored=window.localStorage.getItem('3d-print-rig-language');}catch{}
 let language=chooseLanguage({query:new URL(window.location.href).searchParams.get('lang'),stored});
 const select=document.getElementById('homeLanguage');
 const theme=setupHeaderThemeToggle(document.querySelector('.header-tools'),'Dark mode');
 const links=[...document.querySelectorAll('a[href]')].map(node=>[node,node.getAttribute('href')]);
 function render(){
  const copy=homeMessages[language];document.documentElement.lang=language;
  document.title='3D Print Rig · '+copy.heroTitle;
  for(const node of document.querySelectorAll('[data-home-copy]'))node.textContent=copy[node.dataset.homeCopy];
  for(const node of document.querySelectorAll('[data-home-label]'))node.setAttribute('aria-label',copy[node.dataset.homeLabel]);
  if(language==='ja'){const heading=document.querySelector('h1'),tail=document.createElement('span');tail.textContent='3Dで確かめる。';tail.style.display='inline-block';heading.replaceChildren(document.createTextNode('組む前に、'),tail);}
  theme.setAttribute('aria-label',copy.darkMode);theme.title=copy.darkMode;
  select.value=language;select.setAttribute('aria-label',copy.language);
  for(const [node,href]of links)if(!href.startsWith('#'))node.href=homeDestination(href,window.location.href,language);
 }
 select.addEventListener('change',()=>{
  language=chooseLanguage({query:select.value});
  try{window.localStorage.setItem('3d-print-rig-language',language);}catch{}
  const url=new URL(window.location.href);url.searchParams.set('lang',language);window.history.replaceState(null,'',url);render();
 });
 for(const [value,label]of Object.entries(languageNames)){const option=select.querySelector('option[value="'+value+'"]');if(option)option.textContent=label;}
 render();startHomeAnalytics({window,document});
}
if(typeof document!=='undefined')setupHome();

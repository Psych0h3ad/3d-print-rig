import {embedTarget} from '../viewer/embed-contract.mjs';
import {machineChoices} from '../viewer/machines.js';
const $=id=>document.getElementById(id);
const language=new URL(location.href).searchParams.get('lang') || navigator.language.split('-')[0];
const ja=language==='ja';
// This small shell loads no CAD until the visitor activates the viewer.
const words=ja?{load:'3Dモデルを表示',intro:'マシンを回転して、構造を見てみよう。',detail:'ドラッグで回転 · ピンチ・ホイールで拡大縮小',open:'3D Print Rigで開く ↗',live:'Live · 更新を自動反映',error:'指定された機種・埋め込み形式は現在利用できません。元のサイトで確認してください。',unavailable:'接続できませんでした。元のサイトで開いてください。'}:{load:'Load 3D model',intro:'Explore the machine in 3D.',detail:'Drag to orbit · Pinch or scroll to zoom',open:'Open in 3D Print Rig ↗',live:'Live · Updates automatically',error:'This machine or embed format is unavailable. Check the original site.',unavailable:'Could not connect. Open the viewer on the original site.'};
words.error=ja?'指定された機種・構成・埋め込み形式は現在利用できません。元のサイトで確認してください。':'This machine, configuration or embed format is unavailable. Check the original site.';
document.documentElement.lang=ja?'ja':'en';
for(const[id,text]of Object.entries({load:words.load,intro:words.intro,detail:words.detail,openViewer:words.open,policy:(ja?'アルファテスト · ':'Alpha test · ')+words.live}))$(id).textContent=text;
$('experimental').textContent=ja?'アルファテスト段階の機能です。開発中のため、表示や操作が変わる場合があります。':'Alpha test: appearance and controls may change during development.';
$('openViewer').href=new URL('../viewer/',location.href);
try {
  const {url,theme}=embedTarget(location.href),machine=url.searchParams.get('machine');
  if(machine){
    const selected=machineChoices.find(row=>row.id===machine && row.available!==false);
    if(!selected)throw Error('Unknown machine');
    const expected=new URL(selected.page,new URL('../viewer/',location.href));
    if(expected.pathname.endsWith('/'))expected.pathname+='index.html';
    if(url.pathname!==expected.pathname)throw Error('Machine and controller do not match');
    $('modelName').textContent=selected.label.split(' · ')[0];
  }
  const dark=theme==='dark'||theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  $('openViewer').href=url.href;$('load').disabled=false;
  $('load').onclick=()=>{
    const child=new URL(url);child.searchParams.set('embed','1');child.searchParams.set('embed_theme',dark?'dark':'light');
    const frame=document.createElement('iframe');frame.title=$('modelName').textContent;frame.allow='fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';
    const showError=message=>{const error=document.createElement('p');error.id='error';error.setAttribute('role','alert');error.textContent=message;$('embedStage').replaceChildren(error);};
    frame.src=child.href;frame.onerror=()=>showError(words.unavailable);
    frame.onload=()=>{
      const doc=frame.contentDocument;
      if(!doc?.querySelector('.workspace')){showError(words.unavailable);return;}
      const check=()=>{if(doc.documentElement.dataset.embedError){observer.disconnect();showError(words.error);}};
      const observer=new MutationObserver(check);observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-embed-error']});check();
    };
    $('embedStage').replaceChildren(frame);
  };
} catch {
  $('error').textContent=words.error;$('error').hidden=false;$('load').hidden=true;
}

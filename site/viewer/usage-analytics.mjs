// Optional, consent-gated Google tag. The caller owns consent UI/persistence.
const ORIGIN='https://psych0h3ad.github.io';
const BASE='/3d-print-rig/';
const VIEWERS=new Set([
 'annex','cleaning','community','components','crossant','custom-voron','e3ng',
 'gantries','kit-reference','machines','micron','positron','ratrig','remorph',
 'stealthburner-cutaway','toolchangers','toolheads','trident','v0','v24','v24-reference',
]);
const TITLE='3D Print Rig viewer';
const localHost=name=>/^(?:localhost|127(?:\.\d+){3}|\[::1\])$/i.test(name.replace(/\.$/,''))||name.toLowerCase().endsWith('.localhost');
const DENIED=Object.freeze({analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
const GRANTED=Object.freeze({...DENIED,analytics_storage:'granted'});

// The optional second argument is a browser-shaped {window,document,navigator}
// fixture. No global browser objects are touched at module import time.
export function createUsageAnalytics({measurementId,productionOrigin=ORIGIN,basePath=BASE,excluded=false}={},env=globalThis){
 let win,doc,nav,origin,viewerRoot,validConfig=false;
 let reviewExcluded=excluded===true;
 let state='denied',allowed=false,disposed=false,loaded=false,configured=false;
 let script=null,layer=null,tag=null,pending=null,lastSent=null,epoch=0;
 const id=typeof measurementId==='string'&&/^G-[A-Z0-9]{10}$/.test(measurementId)?measurementId:null;
 try{
  win=env.window??env;doc=env.document??win.document;nav=env.navigator??win.navigator;
  const u=new URL(productionOrigin);
  validConfig=typeof productionOrigin==='string'&&productionOrigin===u.origin&&u.protocol==='https:'&&
   !localHost(u.hostname)&&
   typeof basePath==='string'&&/^\/(?:[A-Za-z0-9_-]+\/)+$/.test(basePath);
  origin=u.origin;viewerRoot=basePath+'viewer/';
 }catch{ /* Disabled below; optional analytics must not break viewer startup. */ }

 function contextReason(){
  // Review/automation exclusion overrides a remembered consent grant. Latch it
  // for this controller, including an actual query marker later stripped by
  // same-document navigation. Only the caller persists it across documents.
  if(reviewExcluded)return 'disabled-excluded';
  let actual;
  try{
   if(nav?.webdriver===true){reviewExcluded=true;return 'disabled-excluded'}
   actual=win?.location?.href?new URL(win.location.href):null;
   if(actual?.searchParams.getAll('analytics').includes('off')){reviewExcluded=true;return 'disabled-excluded'}
  }catch{return 'disabled-browser'}
  if(!id)return 'disabled-id';
  if(!validConfig)return 'disabled-config';
  try{
   if(!win||!doc||!nav||typeof doc.createElement!=='function'||!doc.head||win.self!==win)return 'disabled-browser';
   if(win.top!==win.self)return 'disabled-iframe';
   if(actual.origin!==origin||actual.protocol!=='https:'||localHost(actual.hostname))return 'disabled-origin';
   if(nav.globalPrivacyControl===true||nav.doNotTrack==='1'||win.doNotTrack==='1'||nav.msDoNotTrack==='1')return 'disabled-privacy';
   return null;
  }catch{return 'disabled-browser'}
 }
 function normalize(value){
  try{
   if(typeof value!=='string'&&!(value instanceof URL))return null;
   const u=new URL(value,win.location.href);
   if(u.origin!==origin||u.username||u.password)return null;
   if(u.pathname===viewerRoot.slice(0,-1)||u.pathname===viewerRoot||u.pathname===viewerRoot+'index.html')return viewerRoot;
   if(!u.pathname.startsWith(viewerRoot))return null;
   const leaf=u.pathname.slice(viewerRoot.length);
   return leaf.endsWith('.html')&&VIEWERS.has(leaf.slice(0,-5))?viewerRoot+leaf:null;
  }catch{return null}
 }
 function disable(){try{if(id&&win)win['ga-disable-'+id]=true}catch{ /* fail closed */ }}
 function removeScript(){
  if(!script)return;
  script.onload=null;script.onerror=null;
  try{script.remove()}catch{ /* A detached node needs no cleanup. */ }
  script=null;
 }
 function revoke(reason){
  allowed=false;pending=null;disable();state=reason;
  if(layer){
   // This layer is exclusively owned; do not leave an unprocessed grant/view.
   try{layer.length=0;tag('consent',loaded?'update':'default',{...DENIED});if(!loaded)tag('js',new Date())}catch{ /* optional */ }
  }
 }
 function fail(){epoch++;removeScript();revoke('error')}
 function ownsGlobals(){return !layer||(win.dataLayer===layer&&win.gtag===tag)}
 function check(){
  const reason=contextReason();
  if(reason){revoke(reason);return false}
  if(!ownsGlobals()){revoke('disabled-existing-tag');return false}
  return true;
 }
 function fields(path){return {page_location:origin+path,page_referrer:'',page_title:TITLE}}
 function flush(){
  if(disposed||!allowed||!loaded||!check()||!pending)return;
  const path=pending;pending=null;
  if(path===lastSent)return;
  try{
   const safe=fields(path);
   // Also protect SDK-generated event context; never let defaults read URL,
   // document.title or document.referrer. Property Enhanced Measurement must
   // separately be OFF; send_page_view alone cannot suppress history events.
   tag('set',{...safe,allow_google_signals:false,allow_ad_personalization_signals:false});
   if(!configured){
    tag('consent','update',{...GRANTED});
    tag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_domain:'none',cookie_path:basePath,cookie_expires:15552000,cookie_update:false,...safe});
    configured=true;
   }
   tag('event','page_view',{send_to:id,...safe});
   lastSent=path;
  }catch{fail()}
 }
 function start(){
  if(loaded)return;
  if(script){state='loading';return}
  try{
   if(!layer){
    // Do not adopt or overwrite an unrelated tag/data layer on this document.
    if(win.gtag!==undefined||win.dataLayer!==undefined||doc.querySelector?.('script[src*="googletagmanager.com/gtag/js"]')){
     revoke('disabled-existing-tag');return;
    }
    layer=[];
    tag=function(){layer.push(arguments)};
    win.dataLayer=layer;win.gtag=tag;
   }
   tag('consent','default',{...DENIED});
   tag('js',new Date());
   const generation=++epoch,node=doc.createElement('script');script=node;
   node.async=true;node.referrerPolicy='no-referrer';
   node.src='https://www.googletagmanager.com/gtag/js?id='+id;
   node.onload=()=>{
    if(disposed||loaded||generation!==epoch)return;
    loaded=true;node.onload=null;node.onerror=null;
    if(!allowed)return; // A late load after deny must never configure/send.
    if(check()){state='ready';flush()}
   };
   node.onerror=()=>{if(!disposed&&!loaded&&generation===epoch)fail()};
   state='loading';doc.head.appendChild(node);
  }catch{fail()}
 }
 const initial=contextReason();if(initial)state=initial;
 return Object.freeze({
  // Last observed state only; never an assertion of live GA ingestion.
  get status(){return state},
  allow(){
   if(disposed||!check())return false;
   if(allowed)return state==='loading'||state==='ready';
   const path=normalize(win.location.href);
   if(!path){revoke('disabled-path');return false}
   allowed=true;pending=path;
   try{win['ga-disable-'+id]=false}catch{fail();return false}
   if(loaded){
    // Consent may be restored without creating another script/config target.
    try{tag('consent','update',{...GRANTED})}catch{fail();return false}
    state='ready';flush();
   }else start();
   return allowed&&(state==='loading'||state==='ready');
  },
  deny(){if(!disposed)revoke(contextReason()==='disabled-excluded'?'disabled-excluded':'denied')},
  page(url){
   if(disposed||!check()||!allowed)return false;
   const path=normalize(url);
   pending=path; // Invalid/outside routes also discard a stale loading view.
   if(!path)return false;
   flush();return allowed&&state!=='error';
  },
  dispose(){
   if(disposed)return;
   revoke('disposed');disposed=true;epoch++;removeScript();
   // The downloaded library cannot be unloaded. Retain the per-ID disable
   // flag; delete only our own public entry points, never another owner's.
   try{if(tag&&win.gtag===tag)delete win.gtag;if(layer&&win.dataLayer===layer)delete win.dataLayer}catch{ /* optional */ }
  },
 });
}

import {createUsageAnalytics} from '../viewer/usage-analytics.mjs?v=a686f7c8e70e907ce276';
import {usageAnalyticsConfig} from '../viewer/usage-analytics-config.mjs?v=54e6c921795b1e6b18ff';
import {statisticsPreference,statisticsConsentKey,statisticsReviewKey,storeStatisticsConsent} from '../viewer/statistics-preference.mjs?v=bee995128ef463ee128f';

// Share the viewer's consent record without loading its model or locale graph.
export function startHomeAnalytics({window,document},create=createUsageAnalytics){
 let storage,session;try{storage=window.localStorage;session=window.sessionStorage;}catch{}
 const url=new URL(window.location.href);
 let excluded=window.navigator.webdriver===true||url.searchParams.getAll('analytics').includes('off');
 try{if(excluded)session?.setItem(statisticsReviewKey,'off');excluded ||= session?.getItem(statisticsReviewKey)==='off';}catch{}
 const tracker=create({...usageAnalyticsConfig,excluded},{window,document});
 const configured=/^G-[A-Z0-9]{10}$/u.test(usageAnalyticsConfig.measurementId||'');
 const eligible=url.origin===usageAnalyticsConfig.productionOrigin
  && [usageAnalyticsConfig.basePath,usageAnalyticsConfig.basePath+'index.html'].includes(url.pathname)
  && window.self===window&&window.top===window;
 const blocked=()=>excluded||!eligible||window.navigator.globalPrivacyControl===true
  ||window.navigator.doNotTrack==='1'||window.doNotTrack==='1'||window.navigator.msDoNotTrack==='1';
 let timer,sessionRecord=null,storageSnapshot=null,disposed=false;const listeners=new Set();
 const preference=()=>{
  const saved=statisticsPreference(storage);
  if(sessionRecord&&JSON.stringify(saved)!==storageSnapshot)sessionRecord=null;
  return sessionRecord?.expiresAt>Date.now()?sessionRecord:saved;
 };
 const refresh=()=>{
  if(disposed)return;
  window.clearTimeout(timer);const record=preference();
  if(record?.choice==='granted'&&!blocked()){tracker.allow();tracker.page(window.location.href);}
  else {tracker.deny();for(const name of ['_ga','_ga_'+usageAnalyticsConfig.measurementId.slice(2)])document.cookie=`${name}=; Max-Age=0; Path=${usageAnalyticsConfig.basePath}; Secure; SameSite=Lax`;}
  if(record)timer=window.setTimeout(refresh,Math.min(record.expiresAt-Date.now()+1,2147483647));
  for(const listener of listeners)listener();
 };
 const changed=event=>{if(event.key===statisticsConsentKey||event.key===null){sessionRecord=null;refresh();}};
 const dispose=()=>{if(disposed)return;disposed=true;window.clearTimeout(timer);window.removeEventListener('storage',changed);window.removeEventListener('pageshow',refresh);window.removeEventListener('pagehide',hidden);listeners.clear();tracker.dispose();};
 const hidden=event=>{if(!event.persisted)dispose();};
 window.addEventListener('pageshow',refresh);window.addEventListener('storage',changed);window.addEventListener('pagehide',hidden);
 refresh();return Object.freeze({
  get choice(){return preference()?.choice??null;},get blocked(){return blocked();},
  get configured(){return configured;},get excluded(){return excluded;},
  choose(value){
   if(disposed||!configured||!['granted','denied'].includes(value)||(value==='granted'&&blocked()))return false;
   const record=storeStatisticsConsent(storage,value),saved=statisticsPreference(storage);
   storageSnapshot=JSON.stringify(saved);
   sessionRecord=storageSnapshot===JSON.stringify(record)?null:record;
   refresh();return true;
  },
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},dispose,
 });
}

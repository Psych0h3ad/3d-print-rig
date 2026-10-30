import {createUsageAnalytics} from '../viewer/usage-analytics.mjs?v=a686f7c8e70e907ce276';
import {usageAnalyticsConfig} from '../viewer/usage-analytics-config.mjs?v=54e6c921795b1e6b18ff';
import {statisticsPreference,statisticsConsentKey,statisticsReviewKey} from '../viewer/statistics-preference.mjs?v=bee995128ef463ee128f';

// The existing privacy page owns the choice UI. On this lightweight entry page
// a visitor's current opt-in is honored; no choice means no Google request.
export function startHomeAnalytics({window,document},create=createUsageAnalytics){
 let storage,session;try{storage=window.localStorage;session=window.sessionStorage;}catch{}
 const url=new URL(window.location.href);
 let excluded=window.navigator.webdriver===true||url.searchParams.getAll('analytics').includes('off');
 try{if(excluded)session?.setItem(statisticsReviewKey,'off');excluded ||= session?.getItem(statisticsReviewKey)==='off';}catch{}
 const tracker=create({...usageAnalyticsConfig,excluded},{window,document});
 let timer;
 const refresh=()=>{
  window.clearTimeout(timer);const record=statisticsPreference(storage);
  if(record?.choice==='granted'){tracker.allow();tracker.page(window.location.href);}
  else {tracker.deny();for(const name of ['_ga','_ga_'+usageAnalyticsConfig.measurementId.slice(2)])document.cookie=`${name}=; Max-Age=0; Path=${usageAnalyticsConfig.basePath}; Secure; SameSite=Lax`;}
  if(record)timer=window.setTimeout(refresh,Math.min(record.expiresAt-Date.now()+1,2147483647));
 };
 const changed=event=>{if(event.key===statisticsConsentKey||event.key===null)refresh();};
 window.addEventListener('pageshow',refresh);window.addEventListener('storage',changed);window.addEventListener('pagehide',event=>{if(!event.persisted){window.clearTimeout(timer);window.removeEventListener('storage',changed);window.removeEventListener('pageshow',refresh);tracker.dispose();}});
 refresh();return tracker;
}

// Lightweight first-visit choice; the viewer uses the same versioned record.
export function setupHomeConsent({window,document,analytics,copy}){
 const footer=document.querySelector('.footer-links');
 if(!footer||!analytics.configured||window.self!==window||window.top!==window)return null;
 const labels=new Map();
 function element(tag,key){const node=document.createElement(tag);if(key)labels.set(node,key);return node;}
 const open=element('button','statisticsTitle');open.type='button';open.className='usage-statistics-open';open.setAttribute('aria-haspopup','dialog');
 const dialog=element('dialog');dialog.className='usage-statistics-dialog home-consent';dialog.setAttribute('aria-labelledby','homeStatisticsTitle');dialog.setAttribute('aria-describedby','homeStatisticsDescription');
 const heading=element('h2','statisticsTitle');heading.id='homeStatisticsTitle';heading.tabIndex=-1;
 const description=element('p','statisticsDescription');description.id='homeStatisticsDescription';
 const status=element('p');status.setAttribute('role','status');
 const policy=element('a','privacy');policy.href=new URL('../viewer/privacy.html',import.meta.url).href;policy.className='usage-statistics-policy';
 const actions=element('div');actions.className='usage-statistics-actions';
 const deny=element('button','statisticsDeny'),allow=element('button','statisticsAllow'),close=element('button','statisticsClose');
 for(const node of [deny,allow,close])node.type='button';
 actions.append(deny,allow,close);dialog.append(heading,description,status,policy,actions);footer.append(open);document.body.append(dialog);
 let disposed=false;
 const render=()=>{
  const messages=copy();for(const [node,key]of labels)node.textContent=messages[key];
  status.textContent=messages[analytics.excluded?'statisticsExcluded':analytics.blocked?'statisticsPrivacySignal':analytics.choice==='granted'?'statisticsEnabled':'statisticsDisabled'];
  allow.disabled=analytics.blocked;deny.disabled=false;
  const url=new URL(policy.href);url.searchParams.set('lang',document.documentElement.lang||'en');if(analytics.excluded)url.searchParams.set('analytics','off');policy.href=url.href;
 };
 const show=()=>{if(disposed)return;render();if(!dialog.open){dialog.showModal();heading.focus();}};
 const choose=value=>{if(analytics.choose(value))dialog.close();};
 const allowed=()=>choose('granted'),denied=()=>choose('denied'),closed=()=>dialog.close();
 const refresh=()=>{render();if(analytics.choice!==null)dialog.close();};
 const unsubscribe=analytics.subscribe(refresh);
 open.addEventListener('click',show);allow.addEventListener('click',allowed);deny.addEventListener('click',denied);close.addEventListener('click',closed);
 function hidden(event){if(!event.persisted)dispose();}
 function dispose(){
  if(disposed)return;disposed=true;unsubscribe();window.removeEventListener('pagehide',hidden);
  open.removeEventListener('click',show);allow.removeEventListener('click',allowed);deny.removeEventListener('click',denied);close.removeEventListener('click',closed);dialog.close();dialog.remove();open.remove();
 }
 window.addEventListener('pagehide',hidden);render();
 if(analytics.choice===null&&!analytics.blocked)show();
 return {dialog,open,render,dispose};
}

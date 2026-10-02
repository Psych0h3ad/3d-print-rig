import {renderProductLinks} from './product-links.js?v=public-v18';
export const machineChoices=[
 {id:'siboor_trident_350',label:'SIBOOR Trident 350 · CNC AWD',page:'./'},
 {id:'voron_trident_350',label:'VORON Trident 350 · 標準プリント構造',page:'./trident.html'},
 {id:'siboor_v24_350',label:'VORON V2.4 350 · Modを比較',page:'./v24.html'},
 {id:'voron_v24_250_printed',label:'VORON V2.4 250 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_250_ldo_cnc',label:'VORON V2.4 250 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v24_300_printed',label:'VORON V2.4 300 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_300_ldo_cnc',label:'VORON V2.4 300 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v24_350_printed',label:'VORON V2.4 350 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_350_ldo_cnc',label:'VORON V2.4 350 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v02r1_120',label:'VORON V0.2r1 120 · Mini Stealthburner',page:'./v0.html'},
 {id:'voron_v02_120',label:'VORON V0.2 120 · Mini Stealthburner',page:'./v0.html'},
 {id:'siboor_v24_aug_350',label:'SIBOOR V2.4 AUG CNC 350 · CAD未取得',available:false},
 {id:'fysetc_v24_250_pro',label:'FYSETC V2.4 R2 Pro · 公式CAD / 250',page:'./kit-reference.html'},
 ...[300,350].map(size=>({id:`fysetc_v24_${size}_pro`,label:`FYSETC V2.4 R2 Pro ${size} · サイズ別CAD未取得`,available:false,unavailable_reason:'取得した公式CADは250 mm基準です。このサイズの組立データは未登録です。'})),
 ...[250,300,350].map(size=>({id:`fysetc_trident_${size}`,label:`FYSETC Trident ${size} · 組立CAD未取得`,available:false,unavailable_reason:'FYSETC公式Trident資料を確認しましたが、組立CADはまだ取得できていません。'})),
];
const vendors={voron:'VORON / 標準',siboor:'SIBOOR',ldo:'LDO',fysetc:'FYSETC'};
const families={trident:'VORON Trident',v24:'VORON V2.4',v0:'VORON V0'};
for(const row of machineChoices){
 row.family=row.id.includes('trident')?'trident':row.id.includes('v24')?'v24':'v0';
 row.vendor=row.id.startsWith('fysetc_')?'fysetc':row.id==='siboor_v24_350'?'voron':row.id.startsWith('siboor_')?'siboor':row.id.endsWith('_ldo_cnc')?'ldo':'voron';
 row.size=Number(row.id.match(/(?:^|_)(120|250|300|350)(?:_|$)/)?.[1]);
}
export const machineFamilies=families;
export const machineVendors=vendors;
export function machineOptions(selection,dimension){
 const prefix={family:[],vendor:['family'],size:['family','vendor'],id:['family','vendor','size']}[dimension];
 const rows=machineChoices.filter(row=>prefix.every(key=>row[key]===selection[key]));
 return [...new Set(rows.map(row=>row[dimension]))];
}
export function resolveMachine(selection,changed){
 const rows=machineChoices.filter(row=>row[changed]===selection[changed]);
 return rows.sort((a,b)=>{
  const score=row=>['family','vendor','size','id'].reduce((n,key,i)=>n+(row[key]===selection[key]?2**(4-i):0),0)+(row.available!==false?.1:0);
  return score(b)-score(a);
 })[0];
}
export function machinePage(id){return machineChoices.find(row=>row.id===id&&row.available!==false)?.page}
export function setupMachineNavigation(machine){
 const select=document.querySelector('#machineConfig');
 if(!select)throw Error('マシン選択欄がありません');if(select.dataset.initialized==='true')return;select.dataset.initialized='true';
 const current=machineChoices.find(row=>row.id===machine);if(!current)throw Error('未登録のマシン');
 let choice=current,navigating=false;
 const controls={};
 for(const [key,label] of [['family','機種'],['vendor','ベンダー'],['size','造形サイズ']]){
  const element=document.createElement('select'),caption=document.createElement('label');element.id='machine'+key[0].toUpperCase()+key.slice(1);caption.htmlFor=element.id;caption.textContent=label;select.before(caption,element);controls[key]=element;
 }
 const caption=document.querySelector('label[for="machineConfig"]');if(caption){caption.textContent='仕様';select.before(caption)}
 const status=document.createElement('p');status.className='foot';status.setAttribute('aria-live','polite');select.after(status);
 const products=document.createElement('div');products.id='machineProductLinks';status.after(products);
 const show=document.createElement('button');show.id='showMachine';show.textContent='このマシンを表示';show.className='primary';status.before(show);
 function menus(){
  for(const [key,element] of Object.entries({...controls,id:select})){
   element.replaceChildren(...machineOptions(choice,key).map(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=key==='family'?families[value]:key==='vendor'?vendors[value]:key==='size'?value+' mm':machineChoices.find(row=>row.id===value).label;return option}));element.value=String(choice[key]);
  }
  status.textContent=choice.available===false?(choice.unavailable_reason||'この仕様の組立CADは未登録です。')+' 現在の表示：'+current.label+'。':choice.id===machine?'表示中：'+current.label:'選択中：'+choice.label+'。ボタンで表示を切り替えます。';status.classList.toggle('notice',choice.available===false);
  show.disabled=choice.available===false||choice.id===machine;
  renderProductLinks(products,{machine:choice.id});
 }
 function choose(next){if(!next)return;choice=next;menus()}
 function navigate(){
  const page=machinePage(choice.id);if(navigating||!page||choice.id===machine)return;navigating=true;show.disabled=true;for(const element of Object.values({...controls,id:select}))element.disabled=true;show.textContent='読み込み中…';status.textContent=choice.label+'を読み込み中…';
  try{localStorage.setItem('3d-print-rig-last-configuration-'+machine,new URL(location.href).searchParams.get('configuration')||'')}catch{}
  const target=new URL(page,location.href);target.searchParams.set('machine',choice.id);
  const language=new URL(location.href).searchParams.get('lang');if(['ja','en'].includes(language))target.searchParams.set('lang',language);
  try{const previous=localStorage.getItem('3d-print-rig-last-configuration-'+choice.id);if(previous&&previous.length<200)target.searchParams.set('configuration',previous)}catch{}
  if(choice.id!==machine)location.assign(target);
 }
 for(const [key,element] of Object.entries(controls))element.addEventListener('change',()=>choose(resolveMachine({...choice,[key]:key==='size'?Number(element.value):element.value},key)));
 show.onclick=navigate;
 menus();
 document.body.dataset.machineId=machine;
 const url=new URL(location.href);url.searchParams.set('machine',machine);history.replaceState(null,'',url);
 select.addEventListener('change',()=>choose(machineChoices.find(row=>row.id===select.value)));
}

import {normalizeLanguage} from './languages.mjs?v=ba6a5cd8e1d86849ca34';
import {annexMachines} from './annex-machines.mjs?v=extra-machines-55';
import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {navigateWorkspace} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {renderProductLinks} from './product-links.js?v=ba0e9d9c9326819ea0fb';
import {ratRigMachines} from './ratrig-machines.mjs?v=workspace-belts-1';
export const machineChoices=[
 {id:'tictac_21_120',label:'TicTac 2.1 · 120 / Native CAD',page:'./community.html',family:'tictac',vendor:'squirrelbrain',size:120},
 {id:'the100_v11_165',label:'THE 100 v1.1 · 165 / Native CAD',page:'./community.html',family:'the100',vendor:'mszturc',size:165},
 {id:'rook_mk2_120',label:'Rook MK2 · 120 / Native CAD',page:'./community.html',family:'rook',vendor:'rolohaun',size:120},
 {id:'satsuma180_v10',label:'Satsuma 180 v1.0 / Native CAD',page:'./community.html',family:'satsuma',vendor:'squirrelbrain',size:180},
 {id:'sovol_sv08_350',label:'SOVOL SV08 · 350 / Official CAD',page:'./community.html',family:'sovol_sv08',vendor:'sovol',size:350},
 {id:'lh_stinger_200',label:'LH Stinger 1.0 · 200 / Orbiter V2.0 / Dragon HF',page:'./community.html',family:'lh_stinger',vendor:'lhndo',size:200},
 {id:'antithesis_aether_mk11',label:'Antithesis Aether MK1.1 · Aluminum / Conch / Galileo 2',page:'./community.html',family:'aether',vendor:'antithesis',size:130},
 {id:'ratrig_vminion_180',label:'Rat Rig V-Minion 1.0 · 180 / EVA / LGX Lite',page:'./community.html',family:'vminion',vendor:'ratrig',size:180},
 {id:'snakeoil_xy_180',label:'SnakeOil XY · 180 / Mosquito / Sherpa Mini',page:'./community.html',family:'snakeoil_xy',vendor:'snakeoil',size:180},
 {id:'snakeoil_xy_idex',label:'SnakeOil XY · IDEX / Dual Mosquito / Sherpa Mini',page:'./community.html',family:'snakeoil_xy',vendor:'snakeoil',size:250},
 {id:'snakeoil_3s_kp3s_180',label:'SnakeOil XY-3S · KP3S / V6 / Sherpa Mini',page:'./community.html',family:'snakeoil_3s',vendor:'snakeoil',size:180},
 {id:'snakeoil_proosaxy',label:'ProosaXY · Triple Z / V6 / Sherpa Mini',page:'./community.html',family:'proosaxy',vendor:'snakeoil',size:250},
 {id:'mercury_one1_235',label:'Mercury One.1 · Ender-5 / 235 CAD',page:'./community.html',family:'mercury',vendor:'zerog',size:235},
 {id:'mercury_one1_370',label:'Mercury One.1 · Ender-5 Plus / 370 CAD',page:'./community.html',family:'mercury',vendor:'zerog',size:370},
 {id:'vzbot_330_printed',label:'VzBot 330 · Printed AWD / Goliath / Vz-HextrudORT',page:'./community.html',family:'vzbot',vendor:'vzbot',size:330},
 {id:'ender3_stock_220',label:'Ender-3 · Creality / Original',page:'./community.html',family:'ender3',vendor:'creality',size:220},
 {id:'siboor_sboom_220',label:'SIBOOR S-BOOM · January 2026 / CoreXZ',page:'./community.html',family:'sboom',vendor:'siboor',size:220},
 {id:'positron_v322',label:'Positron V3.2.2 · LDO / 180',page:'./positron.html',family:'positron',vendor:'positron_ldo',size:180},
 ...annexMachines,
 {id:'remorph_beta1_307',label:'Remorph Beta 1 · 307 / LGX Pro / Rapido UHF / Beacon Rev. H',page:'./remorph.html',family:'remorph',vendor:'remorph',size:307},
 ...[300,350].map(size=>({id:`siboor_trident_${size}`,label:`SIBOOR Trident ${size} · CNC AWD`,page:'./'})),
 ...[250,300,350].map(size=>({id:`voron_trident_${size}`,label:`VORON Trident ${size} · 標準プリント構造`,page:'./trident.html'})),
 {id:'voron_trident_500_custom',label:'VORON Trident 500 × 500 × 250 · Custom',page:'./custom-voron.html',family:'trident',vendor:'voron',size:500},
 {id:'voron_trident_1000_custom',label:'VORON Trident 1000 × 1000 × 994 · Custom',page:'./custom-voron.html',family:'trident',vendor:'voron',size:1000},
 {id:'voron_trident_350_half_z',label:'VORON Trident 350 × 350 × 125 · Half Z',page:'./custom-voron.html',family:'trident',vendor:'voron',size:350},
 {id:'siboor_v24_350',label:'VORON V2.4 350 · Modを比較',page:'./v24.html'},
 {id:'voron_v24_250_printed',label:'VORON V2.4 250 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_250_ldo_cnc',label:'VORON V2.4 250 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v24_300_printed',label:'VORON V2.4 300 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_300_ldo_cnc',label:'VORON V2.4 300 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v24_350_printed',label:'VORON V2.4 350 · R2標準プリント構造',page:'./v24-reference.html'},
 {id:'voron_v24_500_custom',label:'VORON V2.4 500 × 500 × 469 · Custom',page:'./custom-voron.html',family:'v24',vendor:'voron',size:500},
 {id:'voron_v24_1000_custom',label:'VORON V2.4 1000 × 1000 × 969 · Custom',page:'./custom-voron.html',family:'v24',vendor:'voron',size:1000},
 {id:'voron_v24_350_half_z',label:'VORON V2.4 350 × 350 × 165 · Half Z',page:'./custom-voron.html',family:'v24',vendor:'voron',size:350},
 {id:'voron_v24_350_ldo_cnc',label:'VORON V2.4 350 · LDO CNC AWD参照',page:'./v24-reference.html'},
 {id:'voron_v02r1_120',label:'VORON V0.2r1 120 · Mini Stealthburner',page:'./v0.html'},
 {id:'voron_v02_120',label:'VORON V0.2 120 · Mini Stealthburner',page:'./v0.html'},
 {id:'micron_r1_120',label:'Micron 120 · R1 / AntHead / WWG2 / Revo Voron',page:'./micron.html'},
 {id:'micron_plus_r1_180',label:'Micron Plus 180 · R1 RC8 / AntHead / WWG2 / Revo Voron',page:'./micron.html'},
 {id:'siboor_v24_aug_350',label:'SIBOOR V2.4 AUG CNC 350 · CAD未取得',available:false},
 {id:'fysetc_v24_250_pro',label:'FYSETC V2.4 R2 Pro · 公式CAD / 250',page:'./kit-reference.html'},
 ...[300,350].map(size=>({id:`fysetc_v24_${size}_pro`,label:`FYSETC V2.4 R2 Pro ${size} · サイズ別CAD未取得`,available:false,unavailable_reason:'取得した公式CADは250 mm基準です。このサイズの組立データは未登録です。'})),
 ...[250,300,350].map(size=>({id:`fysetc_trident_${size}`,label:`FYSETC Trident ${size} · 組立CAD未取得`,available:false,unavailable_reason:'FYSETC公式Trident資料を確認しましたが、組立CADはまだ取得できていません。'})),
 {id:'crossant_235_v06_leadscrew',label:'Crossant-235 · Leadscrew Z / Sherpa Mini / Goliath',page:'./crossant.html',family:'crossant',vendor:'pole',size:220},
 ...ratRigMachines,
];
const vendors={squirrelbrain:'Squirrelbrain',mszturc:'Matt The Printing Nerd',rolohaun:'Rolohaun Design',sovol:'SOVOL',lhndo:'LH Stinger / lhndo',antithesis:"Antithesis Engineering",snakeoil:"SnakeOilXY",zerog:"ZeroG",vzbot:"VzBot",creality:"Creality",positron_ldo:'Positron 3D / LDO',voron:'VORON / 標準',siboor:'SIBOOR',ldo:'LDO',fysetc:'FYSETC',pfa:'Printers for Ants',ratrig:'Rat Rig',pole:'Pole Engineering',remorph:'Lex Reman / Remorph',annex:'Annex Engineering'};
const families={tictac:'TicTac',the100:'THE 100',rook:'Rook',satsuma:'Satsuma',sovol_sv08:'SOVOL SV08',lh_stinger:'LH Stinger',aether:"Antithesis Aether",vminion:"V-Minion",snakeoil_xy:"SnakeOil XY",snakeoil_3s:"SnakeOil XY-3S",proosaxy:"ProosaXY",mercury:"Mercury One.1",vzbot:"VzBot",ender3:"Ender-3",sboom:"S-BOOM",positron:'Positron',trident:'VORON Trident',v24:'VORON V2.4',v0:'VORON V0',micron:'Micron',vcore4:'V-Core 4',crossant:'Crossant-235',remorph:'Remorph',annex_k1:'Annex K1',annex_k2:'Annex K2',annex_k3:'Annex K3'};
for(const row of machineChoices){
 if(row.family&&row.vendor&&row.size)continue;
 row.family=row.id.startsWith('micron_')?'micron':row.id.includes('trident')?'trident':row.id.includes('v24')?'v24':'v0';
 row.vendor=row.id.startsWith('micron_')?'pfa':row.id.startsWith('fysetc_')?'fysetc':row.id==='siboor_v24_350'?'voron':row.id.startsWith('siboor_')?'siboor':row.id.endsWith('_ldo_cnc')?'ldo':'voron';
 row.size=Number(row.id.match(/(?:^|_)(120|180|250|300|350)(?:_|$)/)?.[1]);
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
 async function navigate(){
  const page=machinePage(choice.id);if(navigating||!page||choice.id===machine)return;navigating=true;show.disabled=true;for(const element of Object.values({...controls,id:select}))element.disabled=true;show.textContent='読み込み中…';status.textContent=choice.label+'を読み込み中…';
  try{localStorage.setItem('3d-print-rig-last-configuration-'+machine,new URL(location.href).searchParams.get('configuration')||'')}catch{}
  const target=new URL(page,location.href);target.searchParams.set('machine',choice.id);
  const language=new URL(location.href).searchParams.get('lang');if(normalizeLanguage(language))target.searchParams.set('lang',normalizeLanguage(language));
  try{const previous=localStorage.getItem('3d-print-rig-last-configuration-'+choice.id);if(previous&&previous.length<1024)target.searchParams.set('configuration',previous)}catch{}
  try{if(choice.id!==machine)await navigateWorkspace(target)}finally{navigating=false;for(const element of Object.values({...controls,id:select}))element.disabled=false;show.textContent='このマシンを表示';menus()}
 }
 for(const [key,element] of Object.entries(controls))element.addEventListener('change',()=>choose(resolveMachine({...choice,[key]:key==='size'?Number(element.value):element.value},key)));
 show.onclick=navigate;
 menus();
 document.body.dataset.machineId=machine;
 const url=new URL(location.href);url.searchParams.set('machine',machine);replaceWorkspaceURL(null,'',url);
 select.addEventListener('change',()=>choose(machineChoices.find(row=>row.id===select.value)));
}

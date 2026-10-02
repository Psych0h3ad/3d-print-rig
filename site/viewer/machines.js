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
];
export function machinePage(id){return machineChoices.find(row=>row.id===id&&row.available!==false)?.page}
export function setupMachineNavigation(machine){
 const select=document.querySelector('#machineConfig');
 select.replaceChildren(...machineChoices.map(row=>{const option=document.createElement('option');option.value=row.id;option.textContent=row.label;option.disabled=row.available===false;return option}));
 select.value=machine;
 document.body.dataset.machineId=machine;
 const url=new URL(location.href);url.searchParams.set('machine',machine);history.replaceState(null,'',url);
 select.addEventListener('change',()=>{
  try{localStorage.setItem('3d-print-rig-last-configuration-'+machine,new URL(location.href).searchParams.get('configuration')||'')}catch{}
  const page=machinePage(select.value);if(!page)return;
  const next=new URL(page,location.href);next.searchParams.set('machine',select.value);
  try{const previous=localStorage.getItem('3d-print-rig-last-configuration-'+select.value);if(previous&&previous.length<200)next.searchParams.set('configuration',previous)}catch{}
  location.assign(next);
 });
}

const trident='siboor_trident_350',v24='siboor_v24_350';
const memory='siboor-last-trident-configuration-v1';
export function setupMachineNavigation(machine){
 const select=document.querySelector('#machineConfig');select.value=machine;
 document.body.dataset.machineId=machine;
 const url=new URL(location.href);url.searchParams.set('machine',machine);history.replaceState(null,'',url);
 select.addEventListener('change',()=>{
  if(machine===trident){try{localStorage.setItem(memory,new URL(location.href).searchParams.get('configuration')||'')}catch{}}
  const next=new URL(select.value===v24?'./v24.html':'./',location.href);next.searchParams.set('machine',select.value);
  if(select.value===trident){try{const previous=localStorage.getItem(memory);if(previous&&previous.length<200)next.searchParams.set('configuration',previous)}catch{}}
  location.assign(next);
 });
}

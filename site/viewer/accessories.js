export function accessoryIds(catalog,data={}){
 const ids=data.accessories??[];
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!catalog.accessories?.some(a=>a.id===id)))throw Error('未登録の追加Modが含まれています。');
 return [...new Set(ids)];
}

export class AccessorySelection{
 constructor(catalog,load,update){this.catalog=catalog;this.load=load;this.update=update;this.selected=new Set();this.loaded=new Map()}
 async apply(data){
  const ids=accessoryIds(this.catalog,data);
  const loaded=await Promise.all(ids.map(async id=>[id,await this.load(this.catalog.accessories.find(a=>a.id===id).module)]));
  for(const [id,asset] of loaded)this.loaded.set(id,asset);
  this.selected=new Set(ids);this.refresh();this.update();
 }
 refresh(){
  for(const [id,asset] of this.loaded){asset.root.userData.headModule=false;asset.root.position.set(0,0,0);asset.root.visible=this.selected.has(id)}
 }
 saved(){return {accessories:[...this.selected]}}
}

export function setupAccessories(catalog,{load,update}){
 const container=document.querySelector('#accessoryOptions'),status=document.querySelector('#accessoryStatus');
 const state=new AccessorySelection(catalog,load,update),inputs=new Map();
 let busy=false;
 function sync(){for(const [id,input] of inputs){input.checked=state.selected.has(id);input.disabled=busy}}
 async function apply(data){
  if(busy)throw Error('追加Modを読み込み中です。');busy=true;sync();status.textContent='追加Modを読み込み中…';
  try{await state.apply(data);status.textContent=state.selected.size?'ベッドに固定 · Z移動に追従':'追加Modなし'}
  catch(e){status.textContent='追加Modを読み込めませんでした。';throw e}
  finally{busy=false;sync()}
 }
 for(const row of catalog.accessories||[]){
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.mod=row.id;
  label.append(input,document.createTextNode(row.label));container.append(label);inputs.set(row.id,input);
  input.onchange=async()=>{const ids=[...state.selected].filter(id=>id!==row.id);if(input.checked)ids.push(row.id);try{await apply({accessories:ids})}catch(e){console.error(e)}};
  const note=document.createElement('p');note.className='foot';note.textContent=row.notes;container.append(note);
 }
 return {refresh:()=>{state.refresh();sync()},getExtras:()=>state.saved(),applyExtras:apply,validateExtras:data=>accessoryIds(catalog,data)};
}

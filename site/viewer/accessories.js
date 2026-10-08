import {workspaceTask,workspaceListen} from './workspace-lifecycle.mjs';
import {formatMessage} from './i18n.mjs?v=7e910562e2ba90f2768b';
export function accessoryIds(catalog,data={}){
 const ids=data.accessories??[];
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!catalog.accessories?.some(a=>a.id===id)))throw Error('未登録の追加Modが含まれています。');
 const unique=[...new Set(ids)],groups=new Set();
 for(const id of unique){const group=catalog.accessories.find(a=>a.id===id).exclusive_group;if(group){if(groups.has(group))throw Error('同時に選べない外装Modが含まれています。');groups.add(group)}}
 return unique;
}
export function accessoryAvailable(row,variant){return (!row.gantry_ids||row.gantry_ids.includes(variant?.gantry))&&Object.entries(row.compatible_selection||{}).every(([key,value])=>variant?.[key]===value)}

export class AccessorySelection{
 constructor(catalog,load,update,stockNodes=new Map(),getVariant=()=>null){this.catalog=catalog;this.load=load;this.update=update;this.stockNodes=stockNodes;this.getVariant=getVariant;this.selected=new Set();this.loaded=new Map();this.stockVisibility=new Map()}
 async apply(data){return workspaceTask(async()=>{
  const ids=accessoryIds(this.catalog,data);
  for(const id of ids)if(!accessoryAvailable(this.catalog.accessories.find(a=>a.id===id),this.getVariant()))throw Error('この追加Modは現在の構成に未登録です。');
  for(const id of ids)for(const key of this.catalog.accessories.find(a=>a.id===id).hidden_stock_keys||[])if(!this.stockNodes.has(key))throw Error('外装の置換対象が見つかりません：'+key);
  const loaded=await Promise.all(ids.map(async id=>{return workspaceTask(async()=>{const row=this.catalog.accessories.find(a=>a.id===id);return [id,await Promise.all((row.modules||[row.module]).map(module=>this.load(module)))];});}));
  for(const [id,asset] of loaded)this.loaded.set(id,asset);
  this.selected=new Set(ids);this.refresh();this.update();
 });}
 refresh(){
  for(const id of this.selected)if(!accessoryAvailable(this.catalog.accessories.find(row=>row.id===id),this.getVariant()))this.selected.delete(id);
  const active=new Set();
  for(const id of this.selected){const row=this.catalog.accessories.find(r=>r.id===id);for(const key of row.hidden_stock_keys||[])active.add(key);for(const asset of this.loaded.get(id)||[])active.add(asset)}
  for(const [id,assets] of this.loaded){const p=this.catalog.accessories.find(row=>row.id===id).translation_mm||[0,0,0];for(const asset of assets){asset.root.userData.headModule=false;asset.root.position.set(p[0]/1000,p[2]/1000,-p[1]/1000||0);asset.root.visible=active.has(asset)}}
  for(const [key,visible] of this.stockVisibility)if(!active.has(key)){this.stockNodes.get(key).visible=visible;this.stockVisibility.delete(key)}
  for(const key of active)if(typeof key==='string'){const mesh=this.stockNodes.get(key);if(!this.stockVisibility.has(key))this.stockVisibility.set(key,mesh.visible);mesh.visible=false}
 }
 saved(){return {accessories:[...this.selected]}}
}

export function setupAccessories(catalog,{load,update,stockNodes,getVariant=()=>null}){
 const container=document.querySelector('#accessoryOptions'),status=document.querySelector('#accessoryStatus');
 const state=new AccessorySelection(catalog,load,update,stockNodes,getVariant),inputs=new Map();
 let busy=false;
 function sync(){for(const [id,input] of inputs){input.checked=state.selected.has(id);input.disabled=busy||!accessoryAvailable(catalog.accessories.find(row=>row.id===id),getVariant())}}
 function selectedStatus(){return [...state.selected].map(id=>{const row=catalog.accessories.find(row=>row.id===id);return row.label_id?formatMessage(row.label_id,{},document.documentElement.lang):row.label}).join(' ／ ')}
 if(globalThis.window)workspaceListen(window,'rig-language-change',()=>{if(!busy&&state.selected.size)status.textContent=selectedStatus()});
 async function apply(data){return workspaceTask(async()=>{
  if(busy)throw Error('追加Modを読み込み中です。');busy=true;sync();status.textContent='追加Modを読み込み中…';
  try{await state.apply(data);status.textContent=state.selected.size?selectedStatus():'追加Modなし'}
  catch(e){status.textContent='追加Modを読み込めませんでした。';throw e}
  finally{busy=false;sync()}
 });}
 for(const row of catalog.accessories||[]){
 const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.mod=row.id;
  if(row.label_id)label.setAttribute('data-i18n-id',row.label_id);
  label.append(input,document.createTextNode(row.label));container.append(label);inputs.set(row.id,input);
  input.onchange=async()=>{return workspaceTask(async()=>{const ids=[...state.selected].filter(id=>id!==row.id&&(!input.checked||!row.exclusive_group||catalog.accessories.find(a=>a.id===id).exclusive_group!==row.exclusive_group));if(input.checked)ids.push(row.id);try{await apply({accessories:ids})}catch(e){console.error(e)}});};
 const note=document.createElement('p');note.className='foot';note.textContent=row.notes;container.append(note);
  if(row.notice_id)note.setAttribute('data-i18n-id',row.notice_id);
 }
 return {refresh:()=>{state.refresh();sync();if(!busy)status.textContent=state.selected.size?selectedStatus():'追加Modなし'},getExtras:()=>state.saved(),applyExtras:apply,validateExtras:data=>{const ids=accessoryIds(catalog,data),variant=catalog.variants?.find(row=>row.id===data.configuration)||getVariant();for(const id of ids)if(!accessoryAvailable(catalog.accessories.find(row=>row.id===id),variant))throw Error('この追加Modは指定された構成に未登録です。');return ids}};
}

import {createDefaultLayout,createDesk,createShelf,createCatalog,applyAction,deriveScene,worldTransform,validatePlacement,serializeLayout,parseLayout} from './layout-state.mjs?v=3eb0d016bfa22bdbbcfd';
import {createLayoutRenderer} from './layout-renderer.mjs?v=6ebab440aa3979a18849';
import {createLayoutUI} from './layout-ui.mjs?v=38f0cb2e294453cdbc22';
import {setupLayoutLanguage} from './layout-language.mjs?v=eed4cc1fdcc07a673cd3';
import {readDisplay,saveDisplay,applyDisplay} from '../viewer/display-preferences.mjs?v=56b29930754451d8193c';

const storageKey='3d-print-rig-layout-v1',maxFileBytes=2*1024*1024;
const $=selector=>document.querySelector(selector);
let state,catalog,rows,ui,view,language,selected=null,busy=false,roomEditing=false,operation=null,disposed=false,renderURL=null;
const past=[],future=[];let nextId=1;
const id=prefix=>{let value;do value=`${prefix}-${nextId++}`;while([...state.furniture,...state.printers].some(e=>e.id===value));return value;};
const clone=value=>JSON.parse(JSON.stringify(value));
const t=(key,params)=>language?.t(key,params)||key;
function store(){try{localStorage.setItem(storageKey,serializeLayout(state,catalog));}catch{}}
function message(text,error=false){$('#layout-status').hidden=false;$('#layout-status').textContent=text;ui?.setStatus({canUndo:past.length>0,canRedo:future.length>0,busy,message:text,error});}
function humanError(error){
  const code=error?.errors?.[0]?.code||error?.code;
  if(code)try{const key=`layout.error.${code}`,translated=t(key);if(translated!==key)return translated;}catch{}
  return t('layout.error.generic');
}
function sync(){
  if(disposed)return;const issues=validatePlacement(state,catalog).map(issue=>({...issue,message:t(`layout.warning.${issue.code}`,issue.params)}));
  if(![...state.furniture,...state.printers].some(e=>e.id===selected))selected=null;
  ui.update(state,selected,issues);view.setState(state,selected,issues);
  ui.setStatus({canUndo:past.length>0,canRedo:future.length>0,busy});
  document.body.dataset.layoutObjects=String(state.furniture.length+state.printers.length);document.body.dataset.layoutPrinters=String(state.printers.length);
}
function commit(next,{history=true}={}){
  if(busy)return;if(history){past.push(state);if(past.length>80)past.shift();future.length=0;}
  state=next;sync();store();
}
function select(value){if(busy)return;selected=value;sync();}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function makeDefault(){
  let result=createDefaultLayout();
  result=applyAction(result,{type:'ADD_FURNITURE',furniture:createDesk({id:'desk-1',widthMm:1600,depthMm:850,heightMm:750,pose:{xMm:0,zMm:-650,yawDeg:0}})},catalog);
  const row=rows.find(r=>r.id==='siboor_trident_350')||rows[0];
  if(row){
    const desk=result.furniture[0];
    result=applyAction(result,{type:'UPDATE_FURNITURE',id:desk.id,patch:{depthMm:Math.max(850,row.depthMm+100),widthMm:Math.max(1600,row.widthMm+100)}} ,catalog);
    result=applyAction(result,{type:'ADD_PRINTER',printer:{id:'printer-1',machineId:row.id,configurationId:null,attachment:{parentId:desk.id,surfaceId:'top',xMm:0,zMm:0,yawDeg:0}}},catalog);
  }
  return result;
}
function worldMove({id:entityId,x,z}){
  const furniture=state.furniture.find(e=>e.id===entityId);
  const snap=n=>Math.round(n/10)*10;
  if(furniture)return act({type:'UPDATE_FURNITURE',id:entityId,patch:{pose:{xMm:snap(x),zMm:snap(z)}}});
  const printer=state.printers.find(e=>e.id===entityId);if(!printer)return;
  const parent=state.furniture.find(e=>e.id===printer.attachment.parentId);
  if(parent){const a=parent.pose.yawDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-parent.pose.xMm,dz=z-parent.pose.zMm;return act({type:'UPDATE_PRINTER',id:entityId,patch:{attachment:{xMm:snap(c*dx-s*dz),zMm:snap(s*dx+c*dz)}}});}
  return act({type:'UPDATE_PRINTER',id:entityId,patch:{attachment:{xMm:snap(x),zMm:snap(z)}}});
}
async function render(){
  if(busy)return;busy=true;operation=new AbortController();ui.setStatus({busy:true,canUndo:false,canRedo:false});
  document.body.dataset.layoutRendering='loading';$('#layout-status').hidden=false;$('#layout-status').textContent=t('layout.render.loading');
  try{
    // Genuine CAD and its loaders are intentionally absent from the placement path.
    const {loadLayoutMachine}=await import('./layout-machine-loader.mjs?v=d7fdb38dad0b7dc3259d');
    let lastPercent=0;
    const result=await view.exportImage({loadMachine:loadLayoutMachine,width:1920,signal:operation.signal,onProgress:p=>{
      const complete=p.index||0,total=p.total||state.printers.length;
      const count=complete+(p.phase==='rendering'?0:Math.max(0,Math.min(.95,Number(p.ratio)||0)));
      const percent=lastPercent=Math.max(lastPercent,Math.max(0,Math.min(100,Math.floor(100*count/Math.max(1,total)))));
      ui.setStatus({busy:true,renderProgress:{phase:p.phase,loaded:percent,total:100},message:t('layout.render.progress',{current:Math.min(complete+1,total),total,percent})});
      $('#layout-status').textContent=t('layout.render.progress',{current:Math.min(complete+1,total),total,percent});
    }});
    if(operation.signal.aborted)return;
    if(renderURL)URL.revokeObjectURL(renderURL);renderURL=URL.createObjectURL(result.blob);
    let dialog=$('#layout-render-result');if(!dialog){dialog=document.createElement('dialog');dialog.id='layout-render-result';dialog.className='layout-render-result';document.body.append(dialog);}
    dialog.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=t('layout.render.result');
    const image=document.createElement('img');image.src=renderURL;image.alt=t('layout.render.alt');
    const save=document.createElement('a');save.className='layout-button';save.href=renderURL;save.download='3d-print-rig-layout.png';save.textContent=t('layout.render.download');
    const close=document.createElement('button');close.type='button';close.textContent=t('common.close');close.addEventListener('click',()=>dialog.close());
    const note=document.createElement('p');note.textContent=t('layout.render.currentView');dialog.append(heading,image,note,save,close);dialog.showModal();
    document.body.dataset.layoutRendering='complete';message(t('layout.render.complete',{width:result.width,height:result.height}));
  }catch(error){
    document.body.dataset.layoutRendering=error.name==='AbortError'?'cancelled':'failed';message(error.name==='AbortError'?t('layout.render.cancelled'):humanError(error),error.name!=='AbortError');
  }finally{busy=false;operation=null;ui.setStatus({busy:false,canUndo:past.length>0,canRedo:future.length>0});}
}
async function act(action){
  if(action.type==='cancel'){operation?.abort();return;}
  if(busy||roomEditing)return;
  try{
    switch(action.type){
      case 'select':select(action.id);return;
      case 'undo':if(past.length){future.push(state);state=past.pop();sync();store();}return;
      case 'redo':if(future.length){past.push(state);state=future.pop();sync();store();}return;
      case 'reset':selected=null;commit(createDefaultLayout());view.view('perspective');return;
      case 'add':{
        if(action.kind==='printer'){
          const machine=rows.find(r=>r.id===action.machineId);if(!machine)throw Error('Unknown printer');
          const furniture=state.furniture.find(e=>e.id===selected),parentId=furniture?.id||null,surfaceId=furniture?(furniture.type==='desk'?'top':furniture.levels[0].id):'floor';
          const entityId=id('printer');const printer={id:entityId,machineId:machine.id,configurationId:null,attachment:{parentId,surfaceId,xMm:0,zMm:0,yawDeg:0}};
          selected=entityId;commit(applyAction(state,{type:'ADD_PRINTER',printer},catalog));
        }else{
          const entityId=id(action.kind),furniture=action.kind==='desk'?createDesk({id:entityId}):createShelf({id:entityId});selected=entityId;commit(applyAction(state,{type:'ADD_FURNITURE',furniture},catalog));
        }
        return;
      }
      case 'delete':{
        const isFurniture=state.furniture.some(e=>e.id===action.id);commit(applyAction(state,isFurniture?{type:'REMOVE_FURNITURE',id:action.id,detachChildren:action.detachChildren===true}:{type:'REMOVE_PRINTER',id:action.id},catalog));return;
      }
      case 'duplicate':{
        const furniture=state.furniture.find(e=>e.id===action.id);
        if(furniture){const copy=clone(furniture);copy.id=id(copy.type);copy.pose.xMm+=100;copy.pose.zMm+=100;selected=copy.id;commit(applyAction(state,{type:'ADD_FURNITURE',furniture:copy},catalog));}
        else {const printer=clone(state.printers.find(e=>e.id===action.id));if(!printer)return;printer.id=id('printer');printer.attachment.xMm+=100;printer.attachment.zMm+=100;selected=printer.id;commit(applyAction(state,{type:'ADD_PRINTER',printer},catalog));}return;
      }
      case 'export':download(new Blob([serializeLayout(state,catalog)],{type:'application/json'}),'3d-print-rig-layout.json');message(t('layout.saved'));return;
      case 'import':{
        if(!action.file||action.file.size>maxFileBytes)throw Object.assign(Error('Layout file too large'),{code:'FILE_TOO_LARGE'});
        const text=await action.file.text(),next=parseLayout(text,catalog);selected=null;commit(next);view.view('perspective');message(t('layout.loaded'));return;
      }
      case 'render':await render();return;
      case 'edit-room':case 'import-svg':{
        roomEditing=true;
        try{const {openRoomEditor}=await import('./layout-room-editor.mjs?v=4b9512d7f4969b245237'),nextRoom=await openRoomEditor({room:state.room,file:action.type==='import-svg'?action.file:undefined,t:language.t});
          if(nextRoom&&!disposed){commit(applyAction(state,{type:'SET_ROOM',room:nextRoom},catalog));view.view('perspective');}
        }finally{roomEditing=false;}return;
      }
      case 'add-level':{
        const shelf=state.furniture.find(e=>e.id===action.id&&e.type==='shelf');if(!shelf)return;
        const tops=[0,...shelf.levels.map(l=>l.topMm)].sort((a,b)=>a-b);let low=0,high=shelf.heightMm;
        for(let i=1;i<tops.length;i++)if(tops[i]-tops[i-1]>high-low||i===1){low=tops[i-1];high=tops[i];}
        let levelId;let n=1;do levelId=`level-${n++}`;while(shelf.levels.some(l=>l.id===levelId));
        commit(applyAction(state,{type:'UPDATE_FURNITURE',id:shelf.id,patch:{levels:[...shelf.levels,{id:levelId,topMm:(low+high)/2}].sort((a,b)=>a.topMm-b.topMm)}},catalog));return;
      }
      case 'remove-level':{
        const shelf=state.furniture.find(e=>e.id===action.id);if(!shelf)return;commit(applyAction(state,{type:'UPDATE_FURNITURE',id:shelf.id,patch:{levels:shelf.levels.filter(l=>l.id!==action.levelId)}},catalog));return;
      }
      default:commit(applyAction(state,action,catalog));
    }
  }catch(error){message(humanError(error),true);sync();}
}
function updateLanguage(){
  ui?.setLocale(language.t);if(ui)sync();
  language.refresh();
}
async function start(){
  language=setupLayoutLanguage({document,window,onChange:updateLanguage});
  applyDisplay(readDisplay().dark);
  const dark=()=>document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='night';
  $('#layout-theme')?.addEventListener('click',()=>{if(busy)return;saveDisplay({dark:!dark()});applyDisplay();view?.setOptions({dark:dark(),walls:$('#layout-walls')?.checked??true,grid:$('#layout-grid')?.checked??true});});
  if(window.matchMedia('(hover: none) and (pointer: coarse)').matches&&!window.matchMedia('(any-pointer: fine)').matches){
    document.querySelector('.layout-workspace').hidden=true;
    const notice=document.createElement('section');notice.className='layout-desktop-notice';
    const heading=document.createElement('h2'),text=document.createElement('p'),link=document.createElement('a');
    heading.dataset.layoutI18n='layout.desktopOnlyTitle';text.dataset.layoutI18n='layout.desktopOnlyText';link.dataset.layoutI18n='layout.openViewer';link.dataset.layoutLink='';link.href='../viewer/machines.html';
    notice.append(heading,text,link);$('#layout-app').append(notice);language.refresh();document.body.dataset.layoutReady='desktop-only';return;
  }
  const response=await fetch(new URL('./layout-catalog.json?v=b5389602751893d9cb66',import.meta.url));if(!response.ok)throw Error('Catalog unavailable');const raw=await response.json();
  if(raw.schema!=='3d-print-rig-layout-catalog'||!Array.isArray(raw.machines)||!raw.machines.length)throw Error('Invalid catalog');
  rows=raw.machines.map(r=>({...r,widthMm:r.dimensionsMm.width,depthMm:r.dimensionsMm.depth,heightMm:r.dimensionsMm.height}));
  catalog=createCatalog(rows.map(r=>({id:r.id,widthMm:r.widthMm,depthMm:r.depthMm,heightMm:r.heightMm,baseOffsetMm:r.baseOffsetMm||0,...(r.footprintMm?{footprintMm:r.footprintMm}:{})})));
  state=makeDefault();try{const saved=localStorage.getItem(storageKey);if(saved&&saved.length<=maxFileBytes)state=parseLayout(saved,catalog);}catch{message(t('layout.error.savedPlan'),true);}
  ui=createLayoutUI({container:$('#layout-sidebar'),onAction:act,t:language.t,catalog:rows});
  view=createLayoutRenderer({container:$('#layout-scene'),catalog:rows,t:language.t,onSelect:select,onMove:worldMove,onError:error=>message(humanError(error),true)});
  sync();view.view('perspective');
  const setTool=tool=>{view.setTool(tool);for(const e of document.querySelectorAll('[data-layout-tool]'))e.setAttribute('aria-pressed',String(e.dataset.layoutTool===tool));const hint=$('#layout-scene-hint');hint.dataset.layoutI18n=`layout.hint.${tool}`;hint.textContent=t(`layout.hint.${tool}`);};
  for(const e of document.querySelectorAll('[data-layout-tool]'))e.addEventListener('click',()=>setTool(e.dataset.layoutTool));
  for(const e of document.querySelectorAll('[data-layout-view]'))e.addEventListener('click',()=>view.view(e.dataset.layoutView));
  for(const element of [$('#layout-grid'),$('#layout-walls')].filter(Boolean))element.addEventListener('change',()=>view.setOptions({grid:$('#layout-grid')?.checked??true,walls:$('#layout-walls')?.checked??true,dark:dark()}));
  view.canvas.addEventListener('keydown',event=>{
    if(busy||!selected)return;
    const e=state.furniture.find(e=>e.id===selected)||state.printers.find(e=>e.id===selected);if(!e)return;
    const attachment=e.pose||e.attachment;let patch=null;
    const amount=event.shiftKey?100:10;
    if(event.key==='ArrowLeft')patch={xMm:attachment.xMm-amount};if(event.key==='ArrowRight')patch={xMm:attachment.xMm+amount};if(event.key==='ArrowUp')patch={zMm:attachment.zMm-amount};if(event.key==='ArrowDown')patch={zMm:attachment.zMm+amount};if(event.key.toLowerCase()==='r')patch={yawDeg:attachment.yawDeg+90};
    if(patch){event.preventDefault();act(e.pose?{type:'UPDATE_FURNITURE',id:e.id,patch:{pose:patch}}:{type:'UPDATE_PRINTER',id:e.id,patch:{attachment:patch}});}
  });
  setTool('orbit');view.setOptions({dark:dark(),walls:$('#layout-walls')?.checked??true,grid:$('#layout-grid')?.checked??true});updateLanguage();document.body.dataset.layoutReady='true';
  if(Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4)message(t('layout.memoryHint'));
}
window.addEventListener('pagehide',()=>{disposed=true;operation?.abort();view?.dispose();ui?.dispose();language?.disconnect();if(renderURL)URL.revokeObjectURL(renderURL);},{once:true});
start().catch(error=>{document.body.dataset.layoutReady='failed';$('#layout-status').hidden=false;$('#layout-status').textContent=t('layout.error.start');console.error(error);});

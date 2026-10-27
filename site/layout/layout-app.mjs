import {createDefaultLayout,createDesk,createShelf,createPopStation,createCatalog,applyAction,applyWorldMove,resolveWorldMove,resolveWorldRotation,resolveSupportedPrinterRotation,placementViolations,deriveScene,worldTransform,validatePlacement,serializeLayout,parseLayout} from './layout-state.mjs?v=aaf3e2a50f2b27f89723';
import {equipmentRows,isLayoutEquipmentPreviewPrepared} from './layout-equipment.mjs?v=bd8e2772cabd6fd2564b';
import {prepareLayoutEquipmentPreview,needsEquipmentPreview} from './layout-equipment-preview.mjs?v=aface112775d91937ff3';
import {createLayoutUI} from './layout-ui.mjs?v=74ebfd7797aea46bb8de';
import {setupLayoutLanguage} from './layout-language.mjs?v=1a5d0727b99404779335';
import {proposePlacement} from './layout-placement.mjs?v=3e7200eba3adada5fa7e';
import {renameGroup,ungroup,removeGroup,groupInfo,transformGroup,resolveGroupMove,resolveGroupRotation,
  captureGroupTemplate,groupTemplateInfo,proposeGroupPlacement,parseGroupLibrary,GROUP_LIBRARY_LIMIT} from './layout-groups.mjs?v=34c055f72b5b436bbb49';
import {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard,regroupLayoutSelection} from './layout-clipboard.mjs?v=0a06dd9ca2c90b0ec46f';
import {placementStatus} from './layout-placement-feedback.mjs?v=00db043edfa600f7bd47';
import {readDisplay,saveDisplay,applyDisplay} from '../viewer/display-preferences.mjs?v=8f347468def25922153c';
import {createLayoutBuildToolbar} from './layout-build-toolbar.mjs?v=4bb33e8b1b37ddaab57a';
import {newRoomOpening} from './layout-openings.mjs?v=8fab3154ec519f37f666';

const storageKey='3d-print-rig-layout-v2',legacyStorageKey='3d-print-rig-layout-v1',maxFileBytes=2*1024*1024;
const groupLibraryKey='3d-print-rig-layout-sets-v1';let groupLibrary=[];
const $=selector=>document.querySelector(selector);
let state,catalog,rows,ui,view,language,selected=null,busy=false,roomEditing=false,operation=null,disposed=false,renderURL=null;
let interactionGeneration=0;
let startEmpty=false;
let placement=null,lastPlacementTarget=null,buildTools=null,activeOpeningTool=null;
let clipboardText='';
const past=[],future=[];let nextId=1;
const id=prefix=>{let value;do value=`${prefix}-${nextId++}`;while([...state.furniture,...state.printers,...(state.groups??[]),...groupLibrary,...state.room.openings??[]].some(e=>e.id===value||e.id.startsWith(value+':')));return value;};
const clone=value=>JSON.parse(JSON.stringify(value));
const t=(key,params)=>language?.t(key,params)||key;
function store(){try{localStorage.setItem(storageKey,serializeLayout(state,catalog));}catch{}}
function readSavedLayout(){const saved=localStorage.getItem(storageKey);return saved===null?localStorage.getItem(legacyStorageKey):saved;}
function message(value,error=false,details={}){
 const node=$('#layout-status'),format=typeof value==='function'?value:()=>value,text=String(format());
 node._layoutMessage={format,error};node.hidden=false;node.textContent=text;
 ui?.setStatus({canUndo:past.length>0,canRedo:future.length>0,busy,...details,message:text,error});ui?.refreshBuildTools?.();
}
function humanError(error){
  const boundary=error?.errors?.find(e=>e.code==='ROOM_OUT_OF_BOUNDS'||e.code==='SURFACE_OVERHANG');
  if(boundary)return t(`layout.error.${boundary.code}`);
  const code=error?.errors?.[0]?.code||error?.code;
  if(code)try{const key=`layout.error.${code}`,translated=t(key);if(translated!==key)return translated;}catch{}
  return t('layout.error.generic');
}
function sync(){
  if(disposed)return;const issues=validatePlacement(state,catalog).map(issue=>({...issue,message:t(`layout.warning.${issue.code}`,issue.params)}));
  if(![...state.furniture,...state.printers,...state.groups??[]].some(e=>e.id===selected))selected=null;
  if(selected!==null&&ui.getPickedRootIds?.().length)ui.setPickedRootIds([]);
  ui.update(state,selected,issues);view.setState(state,selected,issues);
  ui.setStatus({canUndo:past.length>0,canRedo:future.length>0,busy});ui?.refreshBuildTools?.();
  document.body.dataset.layoutObjects=String(state.furniture.length+state.printers.length);document.body.dataset.layoutPrinters=String(state.printers.length);
}
function commit(next,{history=true,selection=selected}={}){
  if(busy)return;
  if(next===state||serializeLayout(next,catalog)===serializeLayout(state,catalog)){
    if(selected!==selection){selected=selection;sync();}return;
  }
  if(history){past.push(state);if(past.length>80)past.shift();future.length=0;}
  state=next;selected=selection;delete $('#layout-status')._layoutMessage;$('#layout-status').hidden=true;$('#layout-status').textContent='';ui.setStatus({message:'',error:false});sync();store();
}
function select(value){if(busy)return;view?.setOpeningSelection?.(null);ui?.clearOpeningSelection?.();if(placement)cancelPlacement();interactionGeneration++;ui?.setPickedRootIds?.([]);selected=value;sync();ui?.focusSelection?.();}
function pick({ids,mode,seedIds=[]}){
  if(disposed||busy||roomEditing||placement)return;
  interactionGeneration++;
  const checked=ui.getPickedRootIds?.()||[],next=new Set(checked.length?checked:seedIds);
  const remove=mode==='toggle'&&ids.length&&ids.every(id=>next.has(id));
  for(const id of ids)if(remove)next.delete(id);else next.add(id);
  selected=null;ui.setPickedRootIds?.([...next]);sync();
}
function selectOpening(openingId){
  if(busy||roomEditing)return;
  view?.cancelOpening?.();
  select(null);ui.setOpeningSelection(openingId);view.setOpeningSelection(openingId);
}
function changeOpening({type,opening}){
  if(busy||roomEditing)return;
  try{
    const o=type==='add'?{...opening,id:id(opening.type)}:opening;
    commit(applyAction(state,type==='add'?{type:'ADD_ROOM_OPENING',opening:o}:{type:'UPDATE_ROOM_OPENING',id:o.id,patch:{offsetMm:o.offsetMm}},catalog),{selection:null});
    selectOpening(o.id);
  }catch(error){message(()=>humanError(error),true);}
}
async function ensureEquipmentPreview(value){
  if(!needsEquipmentPreview(value)||isLayoutEquipmentPreviewPrepared())return true;
  if(disposed||busy||roomEditing)return false;
  const source=state,generation=interactionGeneration,controller=new AbortController();let percent=0;
  busy=true;ui?.refreshBuildTools?.();operation=controller;document.body.dataset.layoutPreview='loading';
  const timer=setTimeout(()=>controller.abort(new DOMException('Preview preparation timed out','TimeoutError')),30000);
  try{
    message(()=>t('layout.preview.loading',{percent}),false,{renderProgress:{loaded:0,total:100}});
    await prepareLayoutEquipmentPreview({signal:controller.signal,onProgress:event=>{
      if(disposed||controller.signal.aborted||generation!==interactionGeneration||source!==state)return;
      percent=Math.max(percent,Math.min(100,Math.floor(Number(event.percent)||0)));
      message(()=>t('layout.preview.loading',{percent}),false,{renderProgress:{loaded:percent,total:100}});
    }});
    if(disposed||controller.signal.aborted||generation!==interactionGeneration||source!==state){
      if(!disposed)document.body.dataset.layoutPreview='cancelled';return false;
    }
    document.body.dataset.layoutPreview='ready';return true;
  }catch(error){
    if(!disposed)document.body.dataset.layoutPreview=error.name==='AbortError'?'cancelled':'failed';
    if(error.name==='AbortError')return false;throw error;
  }finally{
    clearTimeout(timer);
    const ownsOperation=operation===controller;
    if(ownsOperation){operation=null;busy=false;ui?.refreshBuildTools?.();}
    if(!disposed&&ownsOperation){
      const node=$('#layout-status');delete node._layoutMessage;node.hidden=true;node.textContent='';
      ui?.setStatus({busy:false,error:false,message:'',renderProgress:null,canUndo:past.length>0,canRedo:future.length>0});
    }
  }
}
function selectionIds(){const picked=ui?.getPickedRootIds?.()||[];return picked.length?picked:selected?[selected]:[];}
function copySelection(ids=selectionIds()){
  if(!ids.length)return null;
  const name=state.groups?.find(g=>ids.length===1&&g.id===ids[0])?.name||t('layout.group.defaultName');
  clipboardText=encodeLayoutClipboard(captureLayoutClipboard(state,ids,catalog,{name}),catalog);
  ui.setStatus({canPaste:true});message(()=>t('layout.clipboard.copied'));return clipboardText;
}
function pasteSelection(text=clipboardText){
  if(!text){message(()=>t('layout.clipboard.empty'));return;}
  let template;
  try{template=decodeLayoutClipboard(text,catalog);}catch(error){
    const code=error.errors?.[0]?.code;
    if(['JSON_SIZE_LIMIT','JSON_PARSE_ERROR','GROUP_TEMPLATE','UNKNOWN_FIELD','EXPECTED_OBJECT'].includes(code))
      throw Object.assign(Error('Invalid copied Layout set'),{code:code==='JSON_SIZE_LIMIT'?'CLIPBOARD_TOO_LARGE':'CLIPBOARD_INVALID'});
    throw error;
  }
  clipboardText=encodeLayoutClipboard(template,catalog);ui.setStatus({canPaste:true});
  if(template.furniture.length===0&&template.printers.length===1){
    const printer=template.printers[0];beginPlacement({kind:'printer',machineId:printer.machineId,copy:printer});
  }else if(template.furniture.length===1&&template.printers.length===0){
    const furniture=template.furniture[0];beginPlacement({kind:furniture.type,copy:furniture});
  }else beginPlacement({kind:'group',template});
}
async function readClipboardSelection(generation){
  const source=state;
  const current=()=>!disposed&&!busy&&!roomEditing&&generation===interactionGeneration&&source===state;
  let text,timer;
  try{
    if(typeof navigator.clipboard?.readText!=='function')throw Error('Clipboard read unavailable');
    text=await Promise.race([navigator.clipboard.readText(),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('Clipboard read timed out')),5000);
    })]);
  }catch{
    if(current())message(()=>t('layout.clipboard.pasteShortcut'),true);
    return;
  }finally{clearTimeout(timer);}
  if(!current())return;
  if(!text){message(()=>t('layout.clipboard.empty'));return;}
  pasteSelection(text);
}
function editingText(event){return !!event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog');}
function copyEvent(event){
  if(disposed||busy||roomEditing||event.defaultPrevented||editingText(event)||!event.clipboardData)return;
  try{const text=copySelection();if(!text)return;event.clipboardData.setData('text/plain',text);event.preventDefault();}
  catch(error){message(()=>humanError(error),true);}
}
function pasteEvent(event){
  if(disposed||busy||roomEditing||event.defaultPrevented||editingText(event)||!event.clipboardData)return;
  const text=event.clipboardData.getData('text/plain');if(!text)return;
  event.preventDefault();act({type:'paste',text});
}
function refreshGroupLibrary(){ui?.setGroupLibrary?.(groupLibrary.map(item=>({id:item.id,name:item.template.name,...groupTemplateInfo(item.template,catalog)})));}
function saveGroupLibrary(items){
  const text=JSON.stringify(items);parseGroupLibrary(text,catalog);
  try{localStorage.setItem(groupLibraryKey,text);}catch{throw Object.assign(Error('Saved set storage unavailable'),{code:'GROUP_LIBRARY_STORAGE'});}
  groupLibrary=items;refreshGroupLibrary();
}
function updatePlacementBar(proposal){
  ui?.refreshBuildTools?.();
  const bar=$('#layout-placement-bar');if(!bar)return;
  bar.hidden=!placement;if(!placement)return;
  const itemName=placement.kind==='popstation_mini'?'BIQU PopStation Mini':['printer','group'].includes(placement.kind)?placement.name:t(placement.kind==='desk'?'layout.desk':'layout.shelf');
  const name=t('layout.place.active',{name:itemName}),heading=$('#layout-placement-name');if(heading.textContent!==name)heading.textContent=name;
  bar.dataset.valid=String(proposal?.valid??false);
  const status=$('#layout-placement-status');if(status){const label=proposal?placementStatus(proposal,t):'';if(status.textContent!==label)status.textContent=label;status.dataset.valid=String(!!proposal?.valid);status.hidden=!proposal;}
}
function cancelPlacement(){view?.cancelOpening?.();interactionGeneration++;placement=null;lastPlacementTarget=null;view?.setPlacement(null);updatePlacementBar();}
function beginPlacement(spec){
  const {kind,machineId,copy,yawDeg,parentId,surfaceId,template}=spec;
  cancelPlacement();
  if(needsEquipmentPreview(spec)&&!isLayoutEquipmentPreviewPrepared()){
    void ensureEquipmentPreview(spec).then(ready=>{if(ready)beginPlacement(spec);})
      .catch(error=>{if(!disposed)message(()=>humanError(error),true);});
    return;
  }
  if(kind==='group'){
    const sizeMm=groupTemplateInfo(template,catalog);
    placement={kind,template:clone(template),id:id('unit'),name:template.name,yawDeg:yawDeg??0,parentId:null,surfaceId:'floor',sizeMm};
    view.setPlacement(placement);updatePlacementBar();view.canvas.focus?.({preventScroll:true});return;
  }
  const machine=kind==='printer'?rows.find(r=>r.id===machineId):null;
  if(kind==='printer'&&!machine)return;
  const entity=kind==='desk'?copy||createDesk():kind==='shelf'?copy||createShelf():kind==='popstation_mini'?copy||createPopStation():null;
  const support=parentId!==undefined?state.furniture.find(e=>e.id===parentId):state.furniture.find(e=>e.id===selected)||state.furniture.find(e=>e.id===copy?.attachment?.parentId);
  placement={kind,machineId,copy,id:id(kind),yawDeg:yawDeg??entity?.pose.yawDeg??copy?.attachment?.yawDeg??0,
    name:machine?.label||(kind==='popstation_mini'?'BIQU PopStation Mini':t(kind==='desk'?'layout.desk':'layout.shelf')),
    parentId:kind==='printer'?(support?.id||null):null,surfaceId:kind==='printer'&&support?(surfaceId??copy?.attachment?.surfaceId??(support.type==='shelf'?support.levels.at(-1).id:'top')):'floor',
    sizeMm:{width:entity?.widthMm??machine?.widthMm,depth:entity?.depthMm??machine?.depthMm,height:entity?.heightMm??machine?.heightMm}};
  if(yawDeg===undefined&&copy?.attachment?.parentId){const p=state.furniture.find(f=>f.id===copy.attachment.parentId);placement.yawDeg+=(p?.pose.yawDeg||0);}
  view.setPlacement(placement);updatePlacementBar();view.canvas.focus?.({preventScroll:true});
}
function previewPlacement(target){
  if(!placement||busy||roomEditing)return null;lastPlacementTarget=target;
  const propose=placement.kind==='group'?proposeGroupPlacement:proposePlacement;
  const result=propose(state,{...placement,...target,snapMm:target.altKey?0:10},catalog);
  updatePlacementBar(result);return result;
}
function placeProposal(proposal,{repeat=false}={}){
  if(!placement||busy||roomEditing||!lastPlacementTarget)return;
  // Resolve against the current state again; a queued pointer frame must never
  // commit a stale preview after undo, a room edit or another placement.
  const fresh=previewPlacement(lastPlacementTarget);if(!fresh?.valid||!fresh.state)return;
  const template=placement,target=lastPlacementTarget,keepPlacing=repeat||!!$('#layout-repeat')?.checked;cancelPlacement();commit(fresh.state,{selection:fresh.id});
  if(keepPlacing){
    const attachment=fresh.state.printers.find(p=>p.id===fresh.id)?.attachment;
    beginPlacement({...template,...(attachment?{parentId:attachment.parentId,surfaceId:attachment.surfaceId}:{})});lastPlacementTarget=target;view.refreshPlacement();
  }
}
function rotatePlacement(reverse=false){if(!placement)return;placement.yawDeg+=(reverse?-90:90);if(!view.refreshPlacement())updatePlacementBar();}
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
let pendingMove=null;
function constrainMove({id:entityId,x,z},context){
  if(busy||roomEditing||disposed)return false;
  const samePoint=(a,b)=>a&&b&&a.x===b.x&&a.z===b.z;
  const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
  let previousState=state,origin=null;
  if(context!==undefined){
    if(!finitePoint(context?.previous)||!finitePoint(context?.origin))return false;
    origin={x:context.origin.x,z:context.origin.z};
    // previous===origin starts/restarts a gesture, including after cancellation.
    // Otherwise accept continuation only from our own last accepted transaction.
    if(!samePoint(context.previous,origin)){
      if(!pendingMove||pendingMove.base!==state||pendingMove.id!==entityId||!samePoint(pendingMove.origin,origin)||!samePoint(pendingMove,context.previous))return false;
      previousState=pendingMove.state;
    }else pendingMove=null;
  }
  const source=state.groups?.find(e=>e.id===entityId)?.pose||state.furniture.find(e=>e.id===entityId)?.pose||state.printers.find(e=>e.id===entityId)?.attachment;
  if(!source)return false;
  const resolve=state.groups?.some(e=>e.id===entityId)?resolveGroupMove:resolveWorldMove;
  const result=resolve(previousState,{id:entityId,x,z},catalog,{snapOrigin:{xMm:source.xMm,zMm:source.zMm}});
  // Rejection keeps the last accepted transaction for pointerup; it must not
  // replace the safe dogleg by a new origin-to-end chord.
  if(!result)return false;
  pendingMove={...result,id:entityId,base:state,origin};
  return {x:result.x,z:result.z,...(result.boundaryLimited?{boundaryLimited:true,pointerRemainder:{...result.pointerRemainder}}:{})};
}
function worldMove({id:entityId,x,z}){
  if(busy||roomEditing||disposed)return false;
  try{
    const prepared=pendingMove;
    pendingMove=null;
    const next=prepared&&prepared.base===state&&prepared.id===entityId&&prepared.x===x&&prepared.z===z
      ?prepared.state:state.groups?.some(e=>e.id===entityId)?transformGroup(state,entityId,{xMm:x,zMm:z},catalog):applyWorldMove(state,{id:entityId,xMm:x,zMm:z},catalog);
    commit(next);return true;
  }
  catch(error){message(()=>humanError(error),true);sync();return false;}
}
let pendingRotation=null,discreteRotation=null;
function constrainRotate({id:entityId,yawDeg},context){
  if(busy||roomEditing||disposed)return false;
  const finite=p=>p&&Number.isFinite(p.yawDeg)&&((p.x===undefined&&p.z===undefined)||(Number.isFinite(p.x)&&Number.isFinite(p.z)));
  if(!finite(context?.origin)||!finite(context?.previous)||![1,15].includes(context.snapDeg))return false;
  const origin=context.origin.yawDeg;let previousState=state;
  const same=(a,b)=>a.yawDeg===b.yawDeg&&(a.x===undefined||b.x===undefined||a.x===b.x&&a.z===b.z);
  if(!same(context.previous,context.origin)){
    if(!pendingRotation||pendingRotation.base!==state||pendingRotation.id!==entityId||pendingRotation.origin!==origin||!same(pendingRotation,context.previous))return false;
    previousState=pendingRotation.state;
  }else pendingRotation=null;
  const group=state.groups?.find(e=>e.id===entityId),source=state.furniture.find(e=>e.id===entityId)?.pose||state.printers.find(e=>e.id===entityId)?.attachment;
  if(!group&&!source)return false;
  const world=group?.pose??worldTransform(state,entityId,catalog);
  if(origin!==world.yawDeg||context.origin.x!==undefined&&(context.origin.x!==world.xMm||context.origin.z!==world.zMm))return false;
  const resolve=group?resolveGroupRotation:resolveWorldRotation;
  const snapsToOrigin=origin+Math.round((yawDeg-origin)/context.snapDeg)*context.snapDeg===origin;
  const result=resolve(previousState,{id:entityId,yawDeg},catalog,{snapDeg:context.snapDeg,snapOrigin:origin,
    anchorPointMm:{xMm:context.origin.x??world.xMm,zMm:context.origin.z??world.zMm},
    ...(!group&&source.parentId!==undefined&&source.parentId!==null?{anchorLocalPointMm:{xMm:source.xMm,zMm:source.zMm}}:{}),
    ...(!group&&snapsToOrigin?{targetLocalYawDeg:source.yawDeg}:{})});if(!result)return false;
  pendingRotation={...result,id:entityId,base:state,origin};
  return {yawDeg:result.yawDeg,x:result.x,z:result.z,...(result.boundaryLimited?{boundaryLimited:true,pointerRemainderDeg:result.pointerRemainderDeg??0}:{})};
}
function worldRotate({id:entityId,yawDeg,deltaDeg,x,z,localYawDeg}){
  if(busy||roomEditing||disposed)return false;
  interactionGeneration++;
  try{
    const prepared=pendingRotation;pendingRotation=null;
    if((x!==undefined||z!==undefined)&&(!Number.isFinite(x)||!Number.isFinite(z)))return false;
    if(deltaDeg===undefined&&prepared&&prepared.base===state&&prepared.id===entityId&&prepared.yawDeg===yawDeg&&(x===undefined||prepared.x===x&&prepared.z===z)){discreteRotation=null;commit(prepared.state);return true;}
    const group=state.groups?.find(e=>e.id===entityId),furniture=state.furniture.find(e=>e.id===entityId),printer=state.printers.find(e=>e.id===entityId);
    if(!group&&!furniture&&!printer)return false;
    const parent=printer&&state.furniture.find(e=>e.id===printer.attachment.parentId);
    if(deltaDeg!==undefined&&![-90,-15,-1,1,15,90].includes(deltaDeg))return false;
    // Keep consecutive integer turns relative to their exact source angle.
    // Adding then subtracting 90 from a binary64 fraction can otherwise drift.
    const sourceYaw=group?.pose.yawDeg??furniture?.pose.yawDeg??printer.attachment.yawDeg;
    const world=group?.pose??worldTransform(state,entityId,catalog);
    const chain=deltaDeg===undefined?null:discreteRotation?.last===state&&discreteRotation.id===entityId?discreteRotation:{base:state,id:entityId,originYaw:sourceYaw,anchor:{xMm:world.xMm,zMm:world.zMm},localAnchor:parent?{xMm:printer.attachment.xMm,zMm:printer.attachment.zMm}:null,total:0};
    const total=chain?chain.total+deltaDeg:null,localYaw=chain?(total===0?chain.originYaw:chain.originYaw+total):localYawDeg??yawDeg-(parent?.pose.yawDeg||0);
    const target=localYaw+(parent?.pose.yawDeg||0),resolve=group?resolveGroupRotation:resolveWorldRotation;
    const pickup=printer&&parent&&(deltaDeg!==undefined||localYawDeg!==undefined);
    const result=pickup?resolveSupportedPrinterRotation(state,{id:entityId,yawDeg:localYaw,...(chain?.localAnchor?{anchorLocalPointMm:chain.localAnchor}:{})},catalog):resolve(state,{id:entityId,yawDeg:target},catalog,{snapDeg:0,...(chain?{anchorPointMm:chain.anchor}:{}),...(chain?.localAnchor?{anchorLocalPointMm:chain.localAnchor}:{}),...(!group?{targetLocalYawDeg:localYaw}:{})});
    if(!result)return false;
    let next=result.state;
    if(chain&&total===0&&result.yawDeg===target){
      // Validate the exact native datum after the accepted retreat/turn/return.
      // This also removes binary64 world/local round-trip drift on reversal.
      const original=chain.base.groups?.find(e=>e.id===entityId)?.pose||chain.base.furniture.find(e=>e.id===entityId)?.pose||chain.base.printers.find(e=>e.id===entityId)?.attachment;
      try{
        const restored=group?transformGroup(next,entityId,original,catalog):applyAction(next,furniture?{type:'UPDATE_FURNITURE',id:entityId,patch:{pose:original}}:{type:'UPDATE_PRINTER',id:entityId,patch:{attachment:original}},catalog);
        if(serializeLayout(restored,catalog)===serializeLayout(chain.base,catalog))next=chain.base;
      }catch{/* A changed contact may prevent exact return; retain the proven pose. */}
    }
    discreteRotation=chain&&result.yawDeg===target?{...chain,total,last:next}:null;
    commit(next);return true;
  }catch(error){message(()=>humanError(error),true);sync();return false;}
}
async function render(){
  if(busy)return;const floorplan=view.getView().projection==='orthographic-floorplan';
  if(!floorplan&&validatePlacement(state,catalog).some(issue=>issue.code==='ROOM_OUT_OF_BOUNDS'||issue.code==='SURFACE_OVERHANG')){message(()=>t('layout.repairBounds'),true);return;}
  busy=true;ui?.refreshBuildTools?.();operation=new AbortController();ui.setStatus({busy:true,canUndo:false,canRedo:false,renderProgress:null});
  document.body.dataset.layoutRendering='loading';message(()=>t(floorplan?'layout.render.planLoading':'layout.render.loading'));
  try{
    // Genuine CAD and its loaders are intentionally absent from the placement path.
    const loadLayoutMachine=floorplan?undefined:(await import('./layout-machine-loader.mjs?v=4b34c9cc7817cd412975')).loadLayoutMachine;
    let lastPercent=0;
    const result=await view.exportImage({loadMachine:loadLayoutMachine,width:1920,signal:operation.signal,onProgress:p=>{
      if(floorplan){message(()=>t('layout.render.planLoading'),false,{renderProgress:null});return;}
      const complete=p.index||0,total=p.total||state.printers.length;
      const count=complete+(p.phase==='rendering'?0:Math.max(0,Math.min(.95,Number(p.ratio)||0)));
      const percent=lastPercent=Math.max(lastPercent,Math.max(0,Math.min(100,Math.floor(100*count/Math.max(1,total)))));
      const values={current:Math.min(complete+1,total),total,percent};
      message(()=>t('layout.render.progress',values),false,{renderProgress:{phase:p.phase,loaded:percent,total:100}});
    }});
    if(operation.signal.aborted)return;
    if(renderURL)URL.revokeObjectURL(renderURL);renderURL=URL.createObjectURL(result.blob);
    let dialog=$('#layout-render-result');if(!dialog){dialog=document.createElement('dialog');dialog.id='layout-render-result';dialog.className='layout-render-result';document.body.append(dialog);}
    dialog.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=t('layout.render.result');
    const image=document.createElement('img');image.src=renderURL;image.alt=t(floorplan?'layout.render.planAlt':'layout.render.alt');
    const save=document.createElement('a');save.className='layout-button';save.href=renderURL;save.download='3d-print-rig-layout.png';save.textContent=t('layout.render.download');
    const close=document.createElement('button');close.type='button';close.textContent=t('common.close');close.addEventListener('click',()=>dialog.close());
    const note=document.createElement('p');note.textContent=t('layout.render.currentView');dialog.append(heading,image,note,save,close);dialog.showModal();
    document.body.dataset.layoutRendering='complete';message(()=>t('layout.render.complete',{width:result.width,height:result.height}));
  }catch(error){
    document.body.dataset.layoutRendering=error.name==='AbortError'?'cancelled':'failed';message(()=>error.name==='AbortError'?t('layout.render.cancelled'):humanError(error),error.name!=='AbortError');
  }finally{busy=false;ui?.refreshBuildTools?.();operation=null;ui.setStatus({busy:false,canUndo:past.length>0,canRedo:future.length>0});}
}
async function act(action){
  if(action.type==='cancel'){cancelPlacement();operation?.abort();return;}
  if(busy||roomEditing)return;
  if(placement&&!['add','duplicate','group-place','copy','paste'].includes(action.type))cancelPlacement();
  if(action.type!=='room-opening-place')view?.cancelOpening?.();
  const generation=++interactionGeneration;let importCommitted=false;
  try{
    switch(action.type){
      case 'select':select(action.id);return;
      case 'select-tool':cancelPlacement();view.canvas.focus?.({preventScroll:true});return;
      case 'open-printer-catalog':cancelPlacement();ui.openPrinterCatalog?.();return;
      case 'undo':if(past.length){future.push(state);commit(past.pop(),{history:false});}return;
      case 'redo':if(future.length){past.push(state);commit(future.pop(),{history:false});}return;
      case 'reset':commit(createDefaultLayout(),{selection:null});view.view('perspective');view.view('fit');return;
      case 'room-opening-place':{const frameRoom=!activeOpeningTool;cancelPlacement();selected=null;ui.setPickedRootIds?.([]);sync();view.beginOpening(action.kind,{motion:action.motion,frameRoom});return;}
      case 'room-opening-select':view?.cancelOpening?.();return;
      case 'room-opening-add':commit(applyAction(state,{type:'ADD_ROOM_OPENING',opening:newRoomOpening(state.room,{id:id(action.kind),type:action.kind,wallIndex:action.wallIndex})},catalog));return;
      case 'add':{
        beginPlacement(action);
        return;
      }
      case 'copy':{
        const text=copySelection(action.selectionIds||selectionIds());
        if(text)try{if(typeof navigator.clipboard?.writeText!=='function')throw Error('Clipboard write unavailable');await navigator.clipboard.writeText(text);}catch{if(!disposed&&generation===interactionGeneration)message(()=>t('layout.clipboard.copyShortcut'),true);}
        return;
      }
      case 'paste':if(Object.hasOwn(action,'text'))pasteSelection(action.text);else await readClipboardSelection(generation);return;
      case 'group-create':{
        const groupId=id('group');commit(regroupLayoutSelection(state,{id:groupId,name:action.name||t('layout.group.defaultName'),selectionIds:action.memberIds||selectionIds()},catalog),{selection:groupId});ui.setPickedRootIds?.([]);return;
      }
      case 'group-rename':commit(renameGroup(state,action.id,action.name,catalog));return;
      case 'group-transform':
        if(action.patch&&Object.keys(action.patch).length===1&&Number.isFinite(action.patch.yawDeg)&&Math.abs(action.patch.yawDeg)<=360000){worldRotate({id:action.id,yawDeg:action.patch.yawDeg});sync();return;}
        commit(transformGroup(state,action.id,action.patch,catalog));return;
      case 'group-ungroup':commit(ungroup(state,action.id,catalog),{selection:null});return;
      case 'group-save':{
        if(groupLibrary.length>=GROUP_LIBRARY_LIMIT)throw Object.assign(Error('Saved set limit'),{code:'GROUP_LIBRARY_LIMIT'});
        saveGroupLibrary([...groupLibrary,{id:id('saved'),template:captureGroupTemplate(state,action.id,catalog)}]);message(()=>t('layout.group.saved'));return;
      }
      case 'group-place':{
        const item=groupLibrary.find(e=>e.id===action.templateId);if(!item)throw Object.assign(Error('Saved set missing'),{code:'GROUP_TEMPLATE'});
        beginPlacement({kind:'group',template:item.template});return;
      }
      case 'group-template-remove':saveGroupLibrary(groupLibrary.filter(e=>e.id!==action.templateId));return;
      case 'move-world':commit(state.groups?.some(e=>e.id===action.id)?transformGroup(state,action.id,{xMm:action.xMm,zMm:action.zMm},catalog):applyWorldMove(state,{id:action.id,xMm:action.xMm,zMm:action.zMm},catalog));return;
      case 'UPDATE_PRINTER':
      case 'UPDATE_FURNITURE':{
        const printer=action.type==='UPDATE_PRINTER'?state.printers.find(p=>p.id===action.id):null;
        const furniture=action.type==='UPDATE_FURNITURE'?state.furniture.find(f=>f.id===action.id):null;
        const key=printer?'attachment':'pose',pose=action.patch?.[key];
        // Numeric angles are support-local for printers. Share the same safe
        // retreat/turn/return transaction as scene handles and quarter turns.
        // Mixed edits retain the strict general action contract.
        if((printer||furniture)&&action.patch&&Object.keys(action.patch).length===1&&pose&&Object.keys(pose).length===1&&Number.isFinite(pose.yawDeg)&&Math.abs(pose.yawDeg)<=360000){
          const parent=printer&&state.furniture.find(f=>f.id===printer.attachment.parentId);
          worldRotate({id:action.id,yawDeg:pose.yawDeg+(parent?.pose.yawDeg??0),localYawDeg:pose.yawDeg});sync();return;
        }
        commit(applyAction(state,action,catalog));return;
      }
      case 'rotate-world':worldRotate({id:action.id,deltaDeg:action.deltaDeg});return;
      case 'delete':{
        if(state.groups?.some(e=>e.id===action.id)){commit(removeGroup(state,action.id,catalog),{selection:null});return;}
        const isFurniture=state.furniture.some(e=>e.id===action.id);commit(applyAction(state,isFurniture?{type:'REMOVE_FURNITURE',id:action.id,detachChildren:action.detachChildren===true}:{type:'REMOVE_PRINTER',id:action.id},catalog));return;
      }
      case 'duplicate':{
        if(action.selectionIds?.length||state.groups?.some(e=>e.id===action.id)){beginPlacement({kind:'group',template:captureLayoutClipboard(state,action.selectionIds||[action.id],catalog,{name:state.groups?.find(g=>g.id===action.id)?.name||t('layout.group.defaultName')})});return;}
        const furniture=state.furniture.find(e=>e.id===action.id);
        if(furniture){
          if(state.printers.some(p=>p.attachment.parentId===furniture.id))beginPlacement({kind:'group',template:captureLayoutClipboard(state,[furniture.id],catalog,{name:t('layout.group.defaultName')})});
          else beginPlacement({kind:furniture.type,copy:clone(furniture)});
        }
        else {const printer=state.printers.find(e=>e.id===action.id);if(printer)beginPlacement({kind:'printer',machineId:printer.machineId,copy:clone(printer)});}return;
      }
      case 'export':download(new Blob([serializeLayout(state,catalog)],{type:'application/json'}),'3d-print-rig-layout.json');message(()=>t('layout.saved'));return;
      case 'import':{
        if(!action.file||action.file.size>maxFileBytes)throw Object.assign(Error('Layout file too large'),{code:'FILE_TOO_LARGE'});
        const source=state,text=await action.file.text();
        if(disposed||generation!==interactionGeneration||state!==source||busy||roomEditing)return;
        const next=parseLayout(text,catalog);
        if(!await ensureEquipmentPreview(next)||disposed||generation!==interactionGeneration||state!==source)return;
        importCommitted=true;commit(next,{selection:null});view.view('perspective');view.view('fit');message(()=>t('layout.loaded'));return;
      }
      case 'render':await render();return;
      case 'edit-room':case 'import-svg':{
        roomEditing=true;ui?.refreshBuildTools?.();
        try{const {openRoomEditor}=await import('./layout-room-editor.mjs?v=5eeee3b12a669f19c237'),nextRoom=await openRoomEditor({room:state.room,file:action.type==='import-svg'?action.file:undefined,t:language.t});
          if(nextRoom&&!disposed){commit(applyAction(state,{type:'SET_ROOM',room:nextRoom},catalog));view.view('perspective');view.view('fit');}
        }finally{roomEditing=false;ui?.refreshBuildTools?.();}return;
      }
      case 'add-level':{
        const shelf=state.furniture.find(e=>e.id===action.id&&e.type==='shelf');if(!shelf)return;
        const thickness=shelf.boardThicknessMm,tops=shelf.levels.map(l=>l.topMm);
        // Feasible board-top intervals include the bay above the highest board.
        // Existing boards and their stable surface IDs remain unchanged.
        let ranges=tops.map((top,i)=>[i?tops[i-1]+thickness:thickness,top-thickness]);
        ranges.push([tops.at(-1)+thickness,shelf.heightMm]);
        ranges=ranges.filter(([low,high])=>low<=high);
        // A new full-width board must not cut through an attached printer's
        // catalog envelope. This is a planning constraint, not a body-fit proof.
        for(const printer of deriveScene(state,catalog).printers.filter(p=>p.parentId===shelf.id)){
          const [bottom,top]=printer.verticalRangeMm,upper=top+thickness;
          ranges=ranges.flatMap(([low,high])=>high<=bottom||low>=upper?[[low,high]]:
            [[low,Math.min(high,bottom)],[Math.max(low,upper),high]].filter(([a,b])=>a<=b));
        }
        ranges.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])||a[0]-b[0]);
        if(!ranges.length)throw Object.assign(Error('No free shelf interval'),{code:'SHELF_BOARDS_OVERLAP_OR_UNORDERED'});
        const [low,high]=ranges[0];
        let levelId;let n=1;do levelId=`level-${n++}`;while(shelf.levels.some(l=>l.id===levelId));
        commit(applyAction(state,{type:'UPDATE_FURNITURE',id:shelf.id,patch:{levels:[...shelf.levels,{id:levelId,topMm:low+(high-low)/2}].sort((a,b)=>a.topMm-b.topMm)}},catalog));return;
      }
      case 'remove-level':{
        const shelf=state.furniture.find(e=>e.id===action.id);if(!shelf)return;commit(applyAction(state,{type:'UPDATE_FURNITURE',id:shelf.id,patch:{levels:shelf.levels.filter(l=>l.id!==action.levelId)}},catalog));return;
      }
      default:commit(applyAction(state,action,catalog));
    }
  }catch(error){if(disposed||(action.type==='import'&&!importCommitted&&generation!==interactionGeneration))return;message(()=>humanError(error),true);sync();}
}
function updateViewPresentation({mode='perspective',projection='perspective-3d'}={}){
  const hint=$('#layout-scene-hint'),key=projection==='orthographic-floorplan'?'layout.hint.plan':'layout.hint.auto';
  hint.dataset.layoutI18n=key;hint.textContent=t(key);ui?.setProjection(projection);
  const measurements=$('#layout-measurements-control');if(measurements)measurements.hidden=projection!=='orthographic-floorplan';
  for(const element of document.querySelectorAll('[data-layout-view]'))if(element.dataset.layoutView!=='fit')element.setAttribute('aria-pressed',String(element.dataset.layoutView===mode));
}
function updateLanguage(){
  ui?.setLocale(language.t);buildTools?.setLocale(language.t);if(ui)sync();
  const node=$('#layout-status');if(node?._layoutMessage&&!node.hidden){const text=String(node._layoutMessage.format());node.textContent=text;ui?.setStatus({message:text,error:node._layoutMessage.error});}
  language.refresh();
  if(placement)updatePlacementBar(lastPlacementTarget?previewPlacement(lastPlacementTarget):null);
}
function placementKey(event){
  if(disposed||busy||roomEditing||event.defaultPrevented||event.repeat||event.altKey)return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog')&&!(placement&&event.target?.id==='layout-repeat'))return;
  if(ui?.handleBuildToolKey?.(event))return;
  const key=event.key.toLowerCase();
  if(key==='escape'){if(view?.cancelGesture?.()){event.preventDefault();return;}if(placement)event.preventDefault();cancelPlacement();if(ui.getPickedRootIds?.().length){event.preventDefault();ui.setPickedRootIds([]);}return;}
  if(placement){if(key==='r'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();rotatePlacement(event.shiftKey);}return;}
  if((event.ctrlKey||event.metaKey)&&key==='d'&&selectionIds().length){event.preventDefault();const picked=ui.getPickedRootIds?.()||[];act({type:'duplicate',id:selected,...(picked.length?{selectionIds:picked}:{})});return;}
  if((event.ctrlKey||event.metaKey)&&key==='a'){event.preventDefault();ui.setPickedRootIds?.([...state.furniture,...state.printers.filter(p=>p.attachment.parentId===null)].map(e=>e.id));return;}
  if((event.ctrlKey||event.metaKey)&&key==='g'){
    const group=state.groups?.find(g=>g.id===selected);
    if(event.shiftKey){if(group){event.preventDefault();act({type:'group-ungroup',id:group.id});}}
    else if(selectionIds().length){event.preventDefault();act({type:'group-create',memberIds:selectionIds(),name:group?.name});}
    return;
  }
  if(event.ctrlKey||event.metaKey)return;
  if(ui.getPickedRootIds?.().length){if(key==='f'&&view.focusSelected())event.preventDefault();return;}
  if(key==='/'&&ui.focusObjectSearch?.()){event.preventDefault();}
  else if((key==='delete'||key==='backspace')&&selected){event.preventDefault();act({type:'delete',id:selected});}
  else if(key==='r'&&selected){event.preventDefault();worldRotate({id:selected,deltaDeg:event.shiftKey?-90:90});}
  else if(key==='f'&&selected){if(view.focusSelected())event.preventDefault();}
}
function historyKey(event){
  if(disposed||busy||roomEditing||event.defaultPrevented||event.repeat||event.altKey||!(event.ctrlKey||event.metaKey))return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog'))return;
  const key=event.key.toLowerCase();
  const command=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'&&!event.shiftKey?'redo':null;
  if(!command||!(command==='undo'?past:future).length)return;
  event.preventDefault();act({type:command});
}
async function start(){
  if(!language){
  language=setupLayoutLanguage({document,window,onChange:updateLanguage});
  applyDisplay(readDisplay().dark);
  const dark=()=>document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='night';
  $('#layout-theme')?.addEventListener('click',()=>{if(busy)return;saveDisplay({dark:!dark()});applyDisplay();view?.setOptions({dark:dark(),walls:$('#layout-walls')?.checked??true,grid:$('#layout-grid')?.checked??true});});
  }
  const dark=()=>document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='night';
  document.body.dataset.layoutReady='loading';
  if(window.navigator?.userAgentData?.mobile===true||(window.matchMedia('(hover: none) and (pointer: coarse)').matches&&!window.matchMedia('(any-pointer: fine)').matches)){
    document.querySelector('.layout-workspace').hidden=true;
    const notice=document.createElement('section');notice.className='layout-desktop-notice';
    const heading=document.createElement('h2'),text=document.createElement('p'),link=document.createElement('a');
    heading.dataset.layoutI18n='layout.desktopOnlyTitle';text.dataset.layoutI18n='layout.desktopOnlyText';link.dataset.layoutI18n='layout.openViewer';link.dataset.layoutLink='';link.href='../viewer/machines.html';
    notice.append(heading,text,link);$('#layout-app').append(notice);
    const popup=document.createElement('dialog');popup.id='layout-desktop-popup';popup.className='layout-desktop-notice layout-desktop-popup';
    const popupHeading=document.createElement('h2'),popupText=document.createElement('p'),popupLink=document.createElement('a'),close=document.createElement('button');
    popupHeading.id='layout-desktop-popup-title';popupText.id='layout-desktop-popup-text';
    popupHeading.dataset.layoutI18n='layout.desktopOnlyTitle';popupText.dataset.layoutI18n='layout.desktopOnlyText';
    popupLink.dataset.layoutI18n='layout.openViewer';popupLink.dataset.layoutLink='';popupLink.href='../viewer/machines.html';
    close.type='button';close.dataset.layoutI18n='common.close';close.addEventListener('click',()=>popup.close());
    popup.setAttribute('aria-labelledby',popupHeading.id);popup.setAttribute('aria-describedby',popupText.id);
    popup.addEventListener('close',()=>link.focus());popup.append(popupHeading,popupText,popupLink,close);
    if(typeof popup.showModal==='function')document.body.append(popup);
    language.refresh();if(typeof popup.showModal==='function')popup.showModal();
    document.body.dataset.layoutReady='desktop-only';return;
  }
  const response=await fetch(new URL('./layout-catalog.json',import.meta.url));if(!response.ok)throw Error('Catalog unavailable');const raw=await response.json();
  if(raw.schema!=='3d-print-rig-layout-catalog'||!Array.isArray(raw.machines)||!raw.machines.length)throw Error('Invalid catalog');
  rows=[...raw.machines,...equipmentRows].map(r=>({...r,widthMm:r.dimensionsMm.width,depthMm:r.dimensionsMm.depth,heightMm:r.dimensionsMm.height}));
  catalog=createCatalog(rows.map(r=>({id:r.id,widthMm:r.widthMm,depthMm:r.depthMm,heightMm:r.heightMm,baseOffsetMm:r.baseOffsetMm||0,...(r.footprintMm?{footprintMm:r.footprintMm}:{}),...(r.supportFootprintMm?{supportFootprintMm:r.supportFootprintMm}:{})})));
  state=startEmpty?createDefaultLayout():makeDefault();
  if(!startEmpty)try{const saved=readSavedLayout();if(saved&&saved.length<=maxFileBytes){state=parseLayout(saved,catalog);store();}}catch{message(()=>t('layout.error.savedPlan'),true);}
  try{const saved=localStorage.getItem(groupLibraryKey);if(saved)groupLibrary=parseGroupLibrary(saved,catalog);}catch{message(()=>t('layout.group.libraryUnavailable'),true);}
  if(!await ensureEquipmentPreview(state)||disposed)return;
  const {createLayoutRenderer}=await import('./layout-renderer.mjs?v=639e9b49933a02eec748');
  ui=createLayoutUI({container:$('#layout-sidebar'),onAction:act,t:language.t,catalog:rows,
    onToolsRefresh:()=>buildTools?.setState({busy,roomEditing,placementKind:placement?.kind,openingTool:activeOpeningTool}),
    onBuildToolKey:event=>buildTools?.handleKey(event)??false,onPickedChange:ids=>{
    interactionGeneration++;
    if(ids.length&&selected!==null){selected=null;sync();}
    view?.setPickedRoots?.(ids);
  },onOpeningSelect:id=>selectOpening(id),onObjectSearchEscape:()=>view?.canvas.focus()});
  ui.setStatus({canPaste:true});
  refreshGroupLibrary();
  view=createLayoutRenderer({container:$('#layout-scene'),catalog:rows,t:language.t,onSelect:select,onPick:pick,onOpeningSelect:id=>selectOpening(id),onOpeningCommit:change=>changeOpening(change),onOpeningToolChange:tool=>{activeOpeningTool=tool;ui?.setOpeningTool?.(tool);ui?.refreshBuildTools?.();},onMove:worldMove,constrainMove,onRotate:worldRotate,constrainRotate,onPlacementMove:previewPlacement,onPlacementCommit:placeProposal,onViewChange:updateViewPresentation,onError:error=>message(()=>humanError(error),true)});
  if($('#layout-build-tools'))buildTools=createLayoutBuildToolbar({container:$('#layout-build-tools'),onAction:act,t:language.t});
  sync();view.view('perspective');document.addEventListener('keydown',historyKey);document.addEventListener('keydown',placementKey);document.addEventListener('copy',copyEvent);document.addEventListener('paste',pasteEvent);
  for(const button of document.querySelectorAll('[data-layout-placement]'))button.addEventListener('click',()=>{if(button.dataset.layoutPlacement==='rotate')rotatePlacement();else cancelPlacement();view.canvas.focus?.({preventScroll:true});});
  $('#layout-repeat')?.addEventListener('change',()=>view?.canvas.focus?.({preventScroll:true}));
  updateViewPresentation(view.getView());
  for(const e of document.querySelectorAll('[data-layout-view]'))e.addEventListener('click',()=>{if(!busy&&!roomEditing){if(e.dataset.layoutView!=='fit')view.cancelOpening?.();view.view(e.dataset.layoutView);}});
  for(const element of [$('#layout-grid'),$('#layout-walls'),$('#layout-measurements')].filter(Boolean))element.addEventListener('change',()=>view.setOptions({grid:$('#layout-grid')?.checked??true,walls:$('#layout-walls')?.checked??true,measurements:$('#layout-measurements')?.checked??true,dark:dark()}));
  view.canvas.addEventListener('keydown',event=>{
    if(busy||placement||!selected||ui.getPickedRootIds?.().length||event.ctrlKey||event.metaKey||event.altKey)return;
    const e=state.groups?.find(e=>e.id===selected)||state.furniture.find(e=>e.id===selected)||state.printers.find(e=>e.id===selected);if(!e)return;
    const attachment=e.pose||e.attachment;let patch=null;
    const amount=event.shiftKey?100:10,direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(direction){
      const world=state.groups?.some(g=>g.id===e.id)?e.pose:worldTransform(state,e.id,catalog);event.preventDefault();
      act({type:'move-world',id:e.id,xMm:world.xMm+direction[0]*amount,zMm:world.zMm+direction[1]*amount});return;
    }
  });
  view.setOptions({dark:dark(),walls:$('#layout-walls')?.checked??true,grid:$('#layout-grid')?.checked??true,measurements:$('#layout-measurements')?.checked??true});updateLanguage();document.body.dataset.layoutReady='true';
  if(Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4)message(()=>t('layout.memoryHint'));
}
function pageHide(event){
  cancelPlacement();operation?.abort();
  // A back/forward cache entry resumes this same document and its controls.
  if(event.persisted)return;
  disposed=true;document.removeEventListener('keydown',historyKey);document.removeEventListener('keydown',placementKey);document.removeEventListener('copy',copyEvent);document.removeEventListener('paste',pasteEvent);view?.dispose();ui?.dispose();buildTools?.dispose();language?.disconnect();if(renderURL)URL.revokeObjectURL(renderURL);
}
window.addEventListener('pagehide',pageHide);
window.addEventListener('pageshow',event=>{
  // No editing controls existed if the cached page left during initial setup.
  // Restart that incomplete startup; an initialized editor keeps its state.
  if(event.persisted&&!disposed&&!view)window.location.reload();
});
function startupFailed(error){
  document.body.dataset.layoutReady='failed';message(()=>t('layout.error.start'),true);console.error(error);
  if(disposed||ui||view)return;
  const panel=document.createElement('section');panel.id='layout-startup-recovery';panel.className='layout-section';
  const note=document.createElement('p');note.dataset.layoutI18n='layout.startup.recovery';panel.append(note);
  for(const [command,key]of [['retry','layout.startup.retry'],['save','layout.save'],['empty','layout.startup.empty']]){
    const button=document.createElement('button');button.type='button';button.className='layout-button';
    button.dataset.layoutRecovery=command;button.dataset.layoutI18n=key;
    button.addEventListener('click',()=>{
      if(command==='save'){
        try{const saved=readSavedLayout();if(saved)download(new Blob([saved],{type:'application/json'}),'3d-print-rig-layout.json');}catch{}
        return;
      }
      for(const control of panel.querySelectorAll('button'))control.disabled=true;
      const status=$('#layout-status');delete status._layoutMessage;status.hidden=true;status.textContent='';
      panel.remove();startEmpty=command==='empty';void start().catch(startupFailed);
    });panel.append(button);
  }
  $('#layout-sidebar').replaceChildren(panel);language?.refresh();
}
start().catch(startupFailed);

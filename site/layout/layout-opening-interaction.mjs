import {wallFrame,newRoomOpening,withDoorMotion,MAX_ROOM_OPENINGS,openingProblems} from './layout-openings.mjs?v=205557f45ffa9cc712d2';

// Free spans respect vertical overlap, just like the saved room contract.
export function openingSpans(room,opening){
  const length=wallFrame(room,opening.wallIndex).lengthMm;
  const occupied=(room.openings??[]).filter(o=>o.id!==opening.id&&o.wallIndex===opening.wallIndex
    &&Math.max(o.sillMm,opening.sillMm)<Math.min(o.sillMm+o.heightMm,opening.sillMm+opening.heightMm))
    .map(o=>[o.offsetMm,o.offsetMm+o.widthMm]).sort((a,b)=>a[0]-b[0]);
  let end=0;const spans=[];
  for(const [a,b] of occupied){if(a-end>=opening.widthMm)spans.push([end,a-opening.widthMm]);end=Math.max(end,b);}
  if(length-end>=opening.widthMm)spans.push([end,length-opening.widthMm]);return spans;
}
export function openingAt(room,opening,offsetMm,{drag=false}={}){
  if(!Number.isFinite(offsetMm))return null;
  let spans=openingSpans(room,opening);
  // A dragged opening stops at its neighbour; it cannot jump through it.
  if(drag)spans=spans.filter(([a,b])=>opening.offsetMm>=a-1e-7&&opening.offsetMm<=b+1e-7);
  let best=null,distance=Infinity;
  for(const [a,b]of spans){const value=Math.max(a,Math.min(b,offsetMm)),d=Math.abs(value-offsetMm);if(d<distance){distance=d;best={...opening,offsetMm:value};}}
  return best;
}

// Keep the opposite jamb fixed and stop at the first vertically overlapping
// neighbour. Resizing never jumps across another opening or changes its height.
export function resizeOpeningAt(room,opening,edge,alongMm){
  if(!['start','end'].includes(edge)||!Number.isFinite(alongMm))return null;
  const length=wallFrame(room,opening.wallIndex).lengthMm,start=opening.offsetMm,end=start+opening.widthMm;
  const anchor=edge==='start'?start:end;
  alongMm=anchor+Math.round(alongMm-anchor);
  let lower=0,upper=length;
  for(const other of room.openings??[]){
    if(other.id===opening.id||other.wallIndex!==opening.wallIndex||Math.max(other.sillMm,opening.sillMm)>=Math.min(other.sillMm+other.heightMm,opening.sillMm+opening.heightMm))continue;
    if(other.offsetMm+other.widthMm<=start)lower=Math.max(lower,other.offsetMm+other.widthMm);
    else if(other.offsetMm>=end)upper=Math.min(upper,other.offsetMm);
    else return null;
  }
  if(edge==='start'){
    if(end-lower<1)return null;
    const offsetMm=Math.max(lower,Math.min(end-1,alongMm));
    if(offsetMm===start)return opening;
    return {...opening,offsetMm,widthMm:opening.widthMm-(offsetMm-start)};
  }
  if(upper-start<1)return null;
  const nextEnd=Math.max(start+1,Math.min(upper,alongMm));
  if(nextEnd===end)return opening;
  return {...opening,widthMm:opening.widthMm+(nextEnd-end)};
}

// Event transaction controller. The renderer supplies screen/ray picking and a
// disposable visual preview. Only pointer-up writes to application history.
export function defaultOpeningDraft(room,type){
  if(!['window','door','vent'].includes(type))throw TypeError('Invalid opening tool');
  const heightMm=Math.min(type==='door'?2100:type==='vent'?300:1000,room.wallHeightMm);
  const longest=Math.max(...room.polygonMm.map((_,index)=>wallFrame(room,index).lengthMm));
  return {widthMm:Math.min(type==='door'?900:type==='vent'?300:1200,longest),heightMm,
    sillMm:type==='door'?0:Math.min(type==='vent'?1800:900,room.wallHeightMm-heightMm)};
}
function validDraft(draft,type){
  return draft&&['widthMm','heightMm','sillMm'].every(key=>typeof draft[key]==='number'&&Number.isFinite(draft[key]))
    &&draft.widthMm>=1&&draft.widthMm<=100000&&draft.heightMm>=1&&draft.heightMm<=100000
    &&draft.sillMm>=0&&draft.sillMm<=100000&&(type!=='door'||draft.sillMm===0);
}
export function createOpeningInteraction({room,locate,pick,pickResize=()=>null,preview,select,commit,changed=()=>{}}){
  let type=null,motion='hinged',gesture=null,shown=null,selected=null,draft=null,repeat=false,lastEvent=null;
  const show=value=>{shown=value;preview(value,selected);};
  function update(event){
    lastEvent=event;
    if(gesture?.room&&room()!==gesture.room){cancel();return null;}
    const r=room(),wall=locate(event,gesture?.opening?.wallIndex);
    if(!wall){show(null);return null;}
    let o=gesture?.opening;
    if(o){o=gesture.kind==='resize'?resizeOpeningAt(r,o,gesture.edge,wall.alongMm-gesture.grabMm):openingAt(r,o,wall.alongMm-gesture.grabMm,{drag:true});}
    else if(type){
      if(draft&&!validDraft(draft,type)){show(null);return null;}
      try{o=newRoomOpening({...r,openings:[]},{id:'opening-preview',type,wallIndex:wall.wallIndex});if(type==='door'&&motion==='sliding')o=withDoorMotion(o,motion);}
      catch(error){
        if(error?.code!=='OPENING_NO_SPACE')throw error;
        // Imported outlines may contain valid but sub-100mm wall segments.
        // Keep a finite red wall marker without allowing a click to commit it.
        show({opening:{id:'opening-preview',type,wallIndex:wall.wallIndex,offsetMm:0,widthMm:wallFrame(r,wall.wallIndex).lengthMm,heightMm:Math.max(1,Math.min(1000,r.wallHeightMm)),sillMm:0},valid:false});return null;
      }
      if(draft)o={...o,...draft};
      if(openingProblems({...r,openings:[{...o,offsetMm:0}]}).length){show({opening:{...o,offsetMm:0},valid:false});return null;}
      const candidate=openingAt(r,o,wall.alongMm-o.widthMm/2);
      if((r.openings??[]).length>=MAX_ROOM_OPENINGS||!candidate){show({opening:{...o,offsetMm:Math.max(0,Math.min(wallFrame(r,o.wallIndex).lengthMm-o.widthMm,wall.alongMm-o.widthMm/2))},valid:false});return null;}
      o=candidate;
    }else return null;
    show(o?{opening:o,valid:true}:null);return o;
  }
  function cancel(){const used=!!(type||gesture);type=null;gesture=null;draft=null;repeat=false;lastEvent=null;show(null);changed();return used;}
  return {
    begin(kind,options={}){cancel();type=kind;motion=options.motion==='sliding'?'sliding':'hinged';draft=options.draft?{...options.draft}:null;repeat=options.repeat===true;selected=null;show(null);changed();},
    configure({draft:next,repeat:keepPlacing=false}={}){
      if(!type||gesture)return false;
      draft={widthMm:next?.widthMm,heightMm:next?.heightMm,sillMm:next?.sillMm};repeat=keepPlacing===true;
      if(lastEvent)update(lastEvent);else show(null);changed();return validDraft(draft,type);
    },
    selection(id){selected=id;show(shown);},
    get tool(){return type?{kind:type,...(type==='door'?{motion}: {})}:null;},
    get settings(){return type?{draft:{...(draft??defaultOpeningDraft(room(),type))},repeat,valid:!draft||validDraft(draft,type)}:null;},
    get active(){return !!type;},get dragging(){return !!gesture;},
    down(event){
      if(event.button!==0||event.isPrimary===false)return false;
      if(type){gesture={kind:'place',room:room(),pointerId:event.pointerId,x:event.clientX,y:event.clientY};update(event);changed();return true;}
      if(event.shiftKey)return false;
      const edge=pickResize(event,selected),id=edge?selected:pick(event),r=room(),o=r.openings?.find(o=>o.id===id);if(!o)return false;
      const wall=locate(event,o.wallIndex);if(!wall)return false;
      selected=id;select(id);gesture={kind:edge?'resize':'move',edge,room:r,opening:o,grabMm:wall.alongMm-(edge==='end'?o.offsetMm+o.widthMm:o.offsetMm),pointerId:event.pointerId,x:event.clientX,y:event.clientY};show({opening:o,valid:true});changed();return true;
    },
    move(event){if(gesture&&event.pointerId!==gesture.pointerId)return false;if(!type&&!gesture)return false;update(event);return true;},
    up(event){
      if(!gesture||event.pointerId!==gesture.pointerId)return false;
      const g=gesture,o=update(event),click=Math.hypot(event.clientX-g.x,event.clientY-g.y)<=4;gesture=null;
      if(o&&(g.kind==='move'||g.kind==='resize'||click)){
        if(g.kind==='place'){const keepPlacing=repeat||event.shiftKey===true;if(!keepPlacing)type=null;show(null);commit({type:'add',opening:o,keepPlacing});}
        else{show(null);if(o.offsetMm!==g.opening.offsetMm||o.widthMm!==g.opening.widthMm)commit({type:g.kind,opening:o});}
      }else show(null);
      changed();return true;
    },cancel,
    resizeBy(edge,deltaMm){
      if(type||gesture||!Number.isFinite(deltaMm)||!['start','end'].includes(edge))return false;
      const r=room(),o=r.openings?.find(o=>o.id===selected);if(!o)return false;
      const at=(edge==='start'?o.offsetMm:o.offsetMm+o.widthMm)+deltaMm,next=resizeOpeningAt(r,o,edge,at);
      if(!next)return false;
      if(next.offsetMm!==o.offsetMm||next.widthMm!==o.widthMm)commit({type:'resize',opening:next});
      changed();return true;
    },
    refresh(){if(gesture?.room&&room()!==gesture.room){cancel();return;}if(selected&&!room().openings?.some(o=>o.id===selected))selected=null;show(shown);},
  };
}

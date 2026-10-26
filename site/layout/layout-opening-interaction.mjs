import {wallFrame,newRoomOpening,MAX_ROOM_OPENINGS,openingProblems} from './layout-openings.mjs?v=8fab3154ec519f37f666';

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

// Event transaction controller. The renderer supplies screen/ray picking and a
// disposable visual preview. Only pointer-up writes to application history.
export function createOpeningInteraction({room,locate,pick,preview,select,commit,changed=()=>{}}){
  let type=null,gesture=null,shown=null,selected=null;
  const show=value=>{shown=value;preview(value,selected);};
  function update(event){
    const r=room(),wall=locate(event,gesture?.opening?.wallIndex);
    if(!wall){show(null);return null;}
    let o=gesture?.opening;
    if(o){o=openingAt(r,o,wall.alongMm-gesture.grabMm,{drag:true});}
    else if(type){
      try{o=newRoomOpening({...r,openings:[]},{id:'opening-preview',type,wallIndex:wall.wallIndex});}
      catch(error){
        if(error?.code!=='OPENING_NO_SPACE')throw error;
        // Imported outlines may contain valid but sub-100mm wall segments.
        // Keep a finite red wall marker without allowing a click to commit it.
        show({opening:{id:'opening-preview',type,wallIndex:wall.wallIndex,offsetMm:0,widthMm:wallFrame(r,wall.wallIndex).lengthMm,heightMm:Math.max(1,Math.min(1000,r.wallHeightMm)),sillMm:0},valid:false});return null;
      }
      if(openingProblems({...r,openings:[o]}).length){show({opening:o,valid:false});return null;}
      const candidate=openingAt(r,o,wall.alongMm-o.widthMm/2);
      if((r.openings??[]).length>=MAX_ROOM_OPENINGS||!candidate){show({opening:{...o,offsetMm:Math.max(0,Math.min(wallFrame(r,o.wallIndex).lengthMm-o.widthMm,wall.alongMm-o.widthMm/2))},valid:false});return null;}
      o=candidate;
    }else return null;
    show(o?{opening:o,valid:true}:null);return o;
  }
  function cancel(){const used=!!(type||gesture);type=null;gesture=null;show(null);changed();return used;}
  return {
    begin(kind){cancel();type=kind;selected=null;show(null);changed();},
    selection(id){selected=id;show(shown);},
    get active(){return !!type;},get dragging(){return !!gesture;},
    down(event){
      if(event.button!==0||event.isPrimary===false)return false;
      if(type){gesture={kind:'place',pointerId:event.pointerId,x:event.clientX,y:event.clientY};update(event);changed();return true;}
      if(event.shiftKey)return false;
      const id=pick(event),o=room().openings?.find(o=>o.id===id);if(!o)return false;
      const wall=locate(event,o.wallIndex);if(!wall)return false;
      selected=id;select(id);gesture={kind:'move',opening:o,grabMm:wall.alongMm-o.offsetMm,pointerId:event.pointerId,x:event.clientX,y:event.clientY};show({opening:o,valid:true});changed();return true;
    },
    move(event){if(gesture&&event.pointerId!==gesture.pointerId)return false;if(!type&&!gesture)return false;update(event);return true;},
    up(event){
      if(!gesture||event.pointerId!==gesture.pointerId)return false;
      const g=gesture,o=update(event),click=Math.hypot(event.clientX-g.x,event.clientY-g.y)<=4;gesture=null;
      if(o&&(g.kind==='move'||click)){
        if(g.kind==='place'){type=null;show(null);commit({type:'add',opening:o});}
        else{show(null);if(o.offsetMm!==g.opening.offsetMm)commit({type:'move',opening:o});}
      }else show(null);
      changed();return true;
    },cancel,
    refresh(){if(selected&&!room().openings?.some(o=>o.id===selected))selected=null;show(shown);},
  };
}

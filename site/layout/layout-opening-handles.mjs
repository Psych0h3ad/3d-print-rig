// Screen-space controls only. Geometry, collision checks and history remain in
// the opening interaction controller; this component never edits the room.
export function createOpeningHandles({container,t,onDown,onResizeKey}){
  const document=container.ownerDocument,root=document.createElement('div');
  root.className='layout-opening-handles';root.hidden=true;container.append(root);
  const buttons=new Map(),listeners=[];
  let disposed=false;
  for(const edge of ['start','end']){
    const button=document.createElement('button');button.type='button';button.className='layout-opening-width-handle';button.dataset.openingResize=edge;
    const mark=document.createElement('span');mark.setAttribute('aria-hidden','true');button.append(mark);
    const down=event=>onDown(event),key=event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
      const delta=(event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:1)*(event.shiftKey?100:10);
      if(onResizeKey(edge,delta)){event.preventDefault();event.stopPropagation();}
    };
    button.addEventListener('pointerdown',down);button.addEventListener('keydown',key);listeners.push([button,down,key]);buttons.set(edge,button);root.append(button);
  }
  const label=document.createElement('output');label.className='layout-opening-width-value';label.setAttribute('aria-hidden','true');root.append(label);
  function hide(){root.hidden=true;}
  return {
    update({visible=false,start,end,widthMm}={}){
      if(disposed)return;
      const points=[start,end];if(!visible||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||!Number.isFinite(widthMm)){hide();return;}
      root.hidden=false;
      const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy)||1;
      for(const [i,edge]of ['start','end'].entries()){
        const button=buttons.get(edge),name=t('layout.openings.'+(edge==='start'?'resizeStart':'resizeEnd'));
        button.setAttribute('aria-label',name);button.title=t('layout.openings.resizeHint');button.style.left=points[i][0]+'px';button.style.top=points[i][1]+'px';
        button.style.cursor=Math.abs(dx)>=Math.abs(dy)?'ew-resize':'ns-resize';button.setAttribute('aria-description',t('layout.openings.resizeValue',{width:Math.round(widthMm*10)/10})+'. '+button.title);
      }
      label.textContent=t('layout.openings.resizeValue',{width:Math.round(widthMm*10)/10});
      label.style.left=((start[0]+end[0])/2-dy/length*25)+'px';label.style.top=((start[1]+end[1])/2+dx/length*25)+'px';
    },
    hit(event){
      if(disposed||root.hidden)return null;
      let best=null;
      for(const [edge,button]of buttons){
        const r=button.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)continue;
        const distance=Math.hypot(event.clientX-(r.left+r.right)/2,event.clientY-(r.top+r.bottom)/2);if(!best||distance<best.distance)best={edge,distance};
      }return best?.edge??null;
    },hide,
    dispose(){if(disposed)return;disposed=true;for(const [button,down,key]of listeners){button.removeEventListener('pointerdown',down);button.removeEventListener('keydown',key);}root.remove();},
  };
}

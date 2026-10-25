import {createRoomPolygon} from './layout-state.mjs?v=0119a2ef6745811fe1cb';
const NS='http://www.w3.org/2000/svg',clone=p=>p.map(q=>q.slice());
function bounds(points){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};}
function closestEdge(points,p){let best={index:points.length-1,distance:Infinity,point:p};for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),q=[a[0]+u*dx,a[1]+u*dz],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.distance)best={index:i,distance:d,point:q};}return best;}

export async function openRoomEditor({room,file,t}){
  let imported=null;
  if(file){
    if(file.size>2*1024*1024)throw Object.assign(Error('Floorplan file too large'),{code:'FILE_TOO_LARGE'});
    const {parseFloorplanSVG}=await import('./layout-svg.mjs?v=3adfeddb419a789e2fe4');imported=await parseFloorplanSVG(await file.text());
    if(!imported?.candidates?.length)throw Object.assign(Error('No closed room outline'),{code:'SVG_NO_OUTLINE'});
  }
  if(!document.querySelector('[data-layout-room-editor-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./layout-room-editor.css?v=7b7738d2be8d22a9e1a4',import.meta.url).href;link.dataset.layoutRoomEditorStyle='';document.head.append(link);}
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='layout-room-editor';
    const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
    const button=(key,handler)=>{const b=el('button',t(key));b.type='button';b.addEventListener('click',handler);return b;};
    const title=el('h2',t('layout.roomEditor.title'));title.id='layout-room-editor-title';dialog.setAttribute('aria-labelledby',title.id);
    const intro=el('p',t('layout.roomEditor.intro'),'room-editor-intro');
    const toolbar=el('div',null,'room-editor-toolbar'),buttons={};
    let points=clone(room.polygonMm),mode='edit',selected=-1,drag=null,result=null,closed=false,candidate=0,scaleConfirmed=!file,confirmScaleCheckbox;
    const past=[],future=[];
    const save=()=>{past.push(clone(points));if(past.length>60)past.shift();future.length=0;};
    const setMode=value=>{mode=value;for(const [key,b]of Object.entries(buttons))b.setAttribute('aria-pressed',String(key===value));draw();};
    buttons.edit=button('layout.roomEditor.move',()=>setMode('edit'));
    buttons.add=button('layout.roomEditor.add',()=>setMode('add'));
    buttons.pan=button('layout.roomEditor.pan',()=>setMode('pan'));
    toolbar.append(buttons.edit,buttons.add,buttons.pan,button('layout.roomEditor.new',()=>{save();points=[];selected=-1;setMode('draw');}),button('layout.roomEditor.undo',()=>{if(past.length){future.push(clone(points));points=past.pop();selected=-1;draw();}}),button('layout.roomEditor.redo',()=>{if(future.length){past.push(clone(points));points=future.pop();selected=-1;draw();}}));
    const controls=el('div',null,'room-editor-controls');
    const field=(key,value)=>{const label=el('label'),span=el('span',t(key)),input=el('input');input.type='number';input.step='any';input.required=true;input.value=String(value);label.append(span,input);controls.append(label);return input;};
    const currentBounds=bounds(points),width=field('layout.roomEditor.width',currentBounds.maxX-currentBounds.minX);width.min='30';width.max='100000';
    if(file){const label=el('label',null,'room-editor-scale-confirm');confirmScaleCheckbox=el('input');confirmScaleCheckbox.type='checkbox';label.append(confirmScaleCheckbox,el('span',t('layout.roomEditor.confirmScale')));controls.append(label);confirmScaleCheckbox.addEventListener('change',()=>{scaleConfirmed=confirmScaleCheckbox.checked&&width.checkValidity()&&Number.isFinite(width.valueAsNumber);applyButton.disabled=!scaleConfirmed;});}
    const xInput=field('layout.roomEditor.x',0),zInput=field('layout.roomEditor.z',0),remove=button('layout.roomEditor.remove',()=>{if(selected<0)return;if(points.length<=3){error.textContent=t('layout.roomEditor.minimum');return;}save();points.splice(selected,1);selected=-1;draw();});controls.append(remove);
    const svg=document.createElementNS(NS,'svg');svg.classList.add('room-editor-canvas');svg.setAttribute('role','application');svg.setAttribute('aria-label',t('layout.roomEditor.canvas'));svg.tabIndex=0;
    const error=el('p',null,'room-editor-error');error.setAttribute('role','status');
    const notice=el('p',file?t('layout.roomEditor.svgScale'):t('layout.roomEditor.keys'),'room-editor-note');
    const compoundNotice=imported?.candidates.some(c=>c.source?.subpathCount>1)?el('p',t('layout.roomEditor.separateOutlines'),'room-editor-note'):null;
    const candidates=el('div',null,'room-editor-candidates');
    let view;
    const frame=()=>{const b=points.length?bounds(points):{minX:-2000,maxX:2000,minZ:-1500,maxZ:1500},w=Math.max(500,b.maxX-b.minX),h=Math.max(500,b.maxZ-b.minZ);view={x:b.minX-w*.15,z:b.minZ-h*.15,w:w*1.3,h:h*1.3};};
    function svgNode(tag,attrs){const n=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));return n;}
    function draw(){
      if(closed)return;svg.replaceChildren();svg.setAttribute('viewBox',`${view.x} ${view.z} ${view.w} ${view.h}`);
      const step=Math.max(10,Math.pow(10,Math.floor(Math.log10(Math.max(view.w,view.h)/30)))),lineWidth=view.w/1200;
      const grid=svgNode('g',{stroke:'var(--room-grid)', 'stroke-width':lineWidth});
      for(let x=Math.ceil(view.x/step)*step;x<view.x+view.w;x+=step)grid.append(svgNode('line',{x1:x,y1:view.z,x2:x,y2:view.z+view.h}));
      for(let z=Math.ceil(view.z/step)*step;z<view.z+view.h;z+=step)grid.append(svgNode('line',{x1:view.x,y1:z,x2:view.x+view.w,y2:z}));svg.append(grid);
      if(points.length){const outline=svgNode(mode==='draw'?'polyline':'polygon',{points:points.map(p=>p.join(',')).join(' '),fill:mode==='draw'?'none':'var(--room-fill)',stroke:'var(--room-line)','stroke-width':lineWidth*3,'stroke-linejoin':'round'});svg.append(outline);}
      for(const [i,p]of points.entries()){const c=svgNode('circle',{cx:p[0],cy:p[1],r:view.w/95,fill:i===selected?'var(--room-selected)':'var(--room-point)',stroke:'var(--room-line)','stroke-width':lineWidth*2});c.dataset.vertex=String(i);svg.append(c);}
      for(const [i,p]of points.entries()){const label=svgNode('text',{x:p[0]+view.w/70,y:p[1]-view.w/90,fill:'var(--room-line)','font-size':view.w/70,'pointer-events':'none'});label.textContent=String(i+1);svg.append(label);}
      xInput.disabled=zInput.disabled=remove.disabled=selected<0;
      if(selected>=0){if(document.activeElement!==xInput)xInput.value=String(points[selected][0]);if(document.activeElement!==zInput)zInput.value=String(points[selected][1]);}
      for(const [key,b]of Object.entries(buttons))b.setAttribute('aria-pressed',String(key===mode));
      if(document.activeElement!==width&&points.length){const b=bounds(points);width.value=String(Math.round((b.maxX-b.minX)*10)/10);}
    }
    function point(event){const matrix=svg.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return [Math.round(p.x/10)*10,Math.round(p.y/10)*10];}
    function pickCandidate(index){
      const c=imported.candidates[index],raw=c.points||c.polygonMm;const b=bounds(raw),span=b.maxX-b.minX,w=Number(width.value);
      if(!Number.isFinite(w)||w<30||w>100000||span<=0){error.textContent=t('layout.roomEditor.scaleError');return;}
      save();candidate=index;scaleConfirmed=false;if(confirmScaleCheckbox)confirmScaleCheckbox.checked=false;applyButton.disabled=true;const scale=w/span,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;points=raw.map(p=>[(p[0]-cx)*scale,(p[1]-cz)*scale]);selected=-1;mode='edit';frame();draw();
      const approximate=typeof c.approximation==='object'?c.approximation.applied:Boolean(c.approximation||c.approximated);
      error.textContent=approximate?t('layout.roomEditor.approximate'):'';
    }
    if(imported){const label=el('label',t('layout.roomEditor.outline')),select=el('select');for(const [i,c]of imported.candidates.entries()){const o=el('option',`${i+1}${c.label?' · '+String(c.label).slice(0,100):''}`);o.value=String(i);select.append(o);}select.addEventListener('change',()=>pickCandidate(Number(select.value)));label.append(select);candidates.append(label);}
    width.addEventListener('change',()=>{
      const value=width.valueAsNumber,b=points.length?bounds(points):null,old=b?.maxX-b?.minX;
      if(!Number.isFinite(value)||value<30||value>100000||!old){scaleConfirmed=false;if(confirmScaleCheckbox)confirmScaleCheckbox.checked=false;applyButton.disabled=true;error.textContent=t('layout.roomEditor.scaleError');return;}
      save();scaleConfirmed=true;if(confirmScaleCheckbox)confirmScaleCheckbox.checked=true;applyButton.disabled=false;const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,scale=value/old;points=points.map(p=>[cx+(p[0]-cx)*scale,cz+(p[1]-cz)*scale]);frame();draw();
    });
    for(const [index,input]of [xInput,zInput].entries())input.addEventListener('change',()=>{const value=input.valueAsNumber;if(selected<0||!Number.isFinite(value)||Math.abs(value)>1000000){error.textContent=t('layout.roomEditor.invalid');return;}save();points[selected][index]=value;error.textContent='';draw();});
    svg.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;const p=point(event);if(!p)return;const vertex=event.target.dataset.vertex;
      if(mode==='pan'){drag={pointer:event.pointerId,pan:true,start:p,view:{...view}};svg.setPointerCapture(event.pointerId);return;}
      if(mode==='draw'){
        if(vertex==='0'&&points.length>=3){mode='edit';selected=0;draw();return;}
        if(points.length>=32){error.textContent=t('layout.roomEditor.maximum');return;}save();points.push(p);selected=points.length-1;draw();return;
      }
      if(mode==='add'){
        if(points.length>=32){error.textContent=t('layout.roomEditor.maximum');return;}if(points.length<2){save();points.push(p);selected=points.length-1;}else{const edge=closestEdge(points,p);save();selected=edge.index+1;points.splice(selected,0,edge.point);}mode='edit';draw();return;
      }
      if(vertex!==undefined){selected=Number(vertex);save();drag={pointer:event.pointerId,index:selected,original:points[selected].slice()};svg.setPointerCapture(event.pointerId);draw();}else{selected=-1;draw();}
    });
    svg.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const p=point(event);if(!p)return;if(drag.pan){view.x-=p[0]-drag.start[0];view.z-=p[1]-drag.start[1];}else points[drag.index]=p;draw();});
    svg.addEventListener('pointerup',event=>{if(drag?.pointer!==event.pointerId)return;drag=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);});
    svg.addEventListener('pointercancel',()=>{if(drag&&!drag.pan)points[drag.index]=drag.original;drag=null;draw();});
    svg.addEventListener('wheel',event=>{event.preventDefault();const factor=event.deltaY>0?1.12:1/1.12,newW=Math.max(100,Math.min(500000,view.w*factor)),ratio=newW/view.w;view.x+=view.w*(1-ratio)/2;view.z+=view.h*(1-ratio)/2;view.w=newW;view.h*=ratio;draw();},{passive:false});
    svg.addEventListener('keydown',event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove.click();}if(event.key==='Enter'&&mode==='draw'&&points.length>=3){event.preventDefault();mode='edit';draw();}});
    const footer=el('div',null,'room-editor-footer');
    const applyButton=button('layout.roomEditor.apply',()=>{
      if(file&&!scaleConfirmed){error.textContent=t('layout.roomEditor.confirmScale');return;}
      if(![width,xInput,zInput].filter(input=>!input.disabled).every(input=>input.checkValidity()&&Number.isFinite(input.valueAsNumber))){error.textContent=t('layout.roomEditor.invalid');return;}
      try{result=createRoomPolygon({polygonMm:points,wallHeightMm:room.wallHeightMm});dialog.close();}
      catch(e){const code=e.errors?.[0]?.code;try{error.textContent=t(`layout.error.${code}`);}catch{error.textContent=t('layout.roomEditor.invalid');}}
    });applyButton.disabled=!scaleConfirmed;
    footer.append(button('layout.roomEditor.fit',()=>{frame();draw();}),button('common.close',()=>dialog.close()),applyButton);
    dialog.append(title,intro,toolbar,candidates,controls,svg,notice);if(compoundNotice)dialog.append(compoundNotice);dialog.append(error,footer);document.body.append(dialog);
    dialog.addEventListener('close',()=>{closed=true;dialog.remove();resolve(result);},{once:true});
    frame();if(imported)pickCandidate(0);else draw();dialog.showModal();svg.focus();
  });
}

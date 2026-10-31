// Placement preferences only. The normal opening transaction owns plan/history.
export function createOpeningBlueprint({container,onAction,t}){
  if(!container?.ownerDocument||typeof onAction!=='function'||typeof t!=='function')throw TypeError('Opening blueprint requires a container, actions and translations');
  const doc=container.ownerDocument,cleanups=[],fields=new Map(),presets=new Map();let translate=t,current=null,disposed=false,presetKind=null;
  const el=(tag,className)=>{const e=doc.createElement(tag);if(className)e.className=className;return e;};
  const listen=(e,type,fn)=>{e.addEventListener(type,fn);cleanups.push(()=>e.removeEventListener(type,fn));};
  const root=el('div','layout-opening-blueprint');root.setAttribute('role','group');
  const title=el('h3','layout-opening-blueprint-title'),intro=el('p','layout-opening-blueprint-intro');root.append(title,intro);
  const presetLabel=el('fieldset','layout-opening-blueprint-presets'),presetText=el('legend'),presetOptions=el('div','layout-opening-blueprint-options');
  presetLabel.append(presetText,presetOptions);root.append(presetLabel);
  const dimensions=el('div','layout-opening-blueprint-fields');root.append(dimensions);
  for(const [prop,label]of [['widthMm','width'],['heightMm','height'],['sillMm','lowerEdgeHeight']]){
    const wrap=el('label','layout-opening-blueprint-field'),text=el('span'),control=el('span','layout-opening-blueprint-number'),input=el('input'),unit=el('span');
    input.type='number';input.min=prop==='sillMm'?'0':'1';input.max='100000';input.step='10';input.id='layout-opening-blueprint-'+prop;
    unit.textContent='mm';control.append(input,unit);wrap.append(text,control);dimensions.append(wrap);fields.set(prop,{input,text,wrap,label});listen(input,'input',emitDraft);
  }
  const repeatLabel=el('label','layout-opening-blueprint-repeat'),repeat=el('input'),repeatText=el('span');repeat.type='checkbox';repeat.id='layout-opening-blueprint-repeat';repeatLabel.append(repeat,repeatText);root.append(repeatLabel);
  const cancel=el('button','layout-opening-blueprint-cancel');cancel.type='button';cancel.id='layout-opening-blueprint-cancel';root.append(cancel);
  const hint=el('p','layout-opening-blueprint-hint'),error=el('p','layout-opening-blueprint-error');error.id='layout-opening-blueprint-error';error.setAttribute('role','status');root.append(hint,error);
  container.replaceChildren(root);container.hidden=true;
  const sizes=kind=>kind==='vent'?[[150,150],[200,200],[300,300]]:kind==='window'?[[600,600],[1200,1000],[1800,1200]]:[[800,2100],[900,2100],[1600,2100]];
  const number=input=>input.value.trim()===''?NaN:Number(input.value);
  function emitDraft(){
    if(disposed||!current?.tool)return;
    const draft=Object.fromEntries([...fields].map(([prop,{input}])=>[prop,prop==='sillMm'&&current.tool.kind==='door'?0:number(input)]));
    onAction({type:'room-opening-draft',draft,repeat:repeat.checked});
  }
  listen(repeat,'change',emitDraft);
  listen(cancel,'click',()=>onAction({type:'room-opening-select'}));
  listen(root,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onAction({type:'room-opening-select'});}});
  function setState(value){
    if(disposed)return;current=value?.tool?value:null;container.hidden=!current;if(!current)return;
    const {tool,draft={},valid=true}=current,key=tool.kind==='door'?tool.motion||'hinged':tool.kind;
    title.textContent=translate('layout.openings.'+key);intro.textContent=translate('layout.openings.beforePlace');root.setAttribute('aria-label',title.textContent);
    presetText.textContent=translate('layout.openings.sizePreset');
    if(presetKind!==tool.kind){
      presets.clear();presetOptions.replaceChildren();presetKind=tool.kind;
      for(const [width,height]of sizes(tool.kind)){
        const b=el('button','layout-opening-blueprint-preset');b.type='button';b.dataset.openingPreset=`${width}x${height}`;
        b.addEventListener('click',()=>{if(disposed||!current)return;fields.get('widthMm').input.value=String(width);fields.get('heightMm').input.value=String(height);emitDraft();});
        presets.set(b,{width,height});presetOptions.append(b);
      }
    }
    for(const [b,{width,height}]of presets){b.textContent=translate('layout.openings.sizeOption',{width,height});b.setAttribute('aria-pressed',String(valid&&width===draft.widthMm&&height===draft.heightMm));}
    for(const [prop,{input,text,wrap,label}]of fields){
      wrap.hidden=prop==='sillMm'&&tool.kind==='door';text.textContent=translate('layout.openings.'+label);
      if(doc.activeElement!==input)input.value=Number.isFinite(draft[prop])?String(draft[prop]):'';
    }
    repeat.checked=!!current.repeat;repeatText.textContent=translate('layout.place.repeat');repeatLabel.title=translate('layout.place.repeatHelp');
    cancel.textContent=translate('common.cancel')+' · Esc';hint.textContent=translate('layout.openings.placing',{type:translate('layout.openings.'+key)});
    error.hidden=valid;error.textContent=valid?'':translate('layout.error.OPENING_INVALID');
  }
  return Object.freeze({setState,setLocale(t){translate=t;if(current)setState(current);},dispose(){if(disposed)return;disposed=true;for(const off of cleanups)off();container.replaceChildren();container.hidden=true;}});
}

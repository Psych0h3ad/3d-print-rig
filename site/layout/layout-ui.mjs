// Presentation only. The application owns state, history, files and model loading.
import {createRoomRect,createRoomL,createRoomPolygon,resolvePrinterEquipment} from './layout-state.mjs?v=156b82f412caf708ab4e';
import {WALL_FINISHES,FLOOR_FINISHES,DEFAULT_ROOM_APPEARANCE} from './layout-finishes.mjs?v=001b62f9728770a12303';
const PRINTER_VIEWER_PAGES=new Set(['','index.html','annex.html','community.html','crossant.html','custom-voron.html','kit-reference.html','micron.html','positron.html','ratrig.html','remorph.html','trident.html','v0.html','v24-reference.html','v24.html']);
// Only a registered catalog destination is eligible; saved plan fields never supply URLs.
export function printerSourcesURL(row,href,language='en'){
  try{
    if(!row||!Object.hasOwn(row,'id')||typeof row.id!=='string'||['__proto__','prototype','constructor'].includes(row.id)||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(row.id)||!Object.hasOwn(row,'fullScene'))return null;
    const full=row.fullScene;
    if(!full||!Object.hasOwn(full,'page')||typeof full.page!=='string'||!full.page.trim()||!Object.hasOwn(full,'machineId')||full.machineId!==row.id)return null;
    const current=new URL(href),base=new URL('../viewer/',current),url=new URL(full.page,base);
    if(!['http:','https:'].includes(current.protocol)||url.origin!==current.origin||url.username||url.password||url.search||url.hash||!url.pathname.startsWith(base.pathname))return null;
    if(!PRINTER_VIEWER_PAGES.has(url.pathname.slice(base.pathname.length)))return null;
    url.searchParams.set('machine',row.id);url.searchParams.set('lang',language||'en');return url.href;
  }catch{return null;}
}
const PATHS = {
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  import: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  export: 'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',
  reset: 'M4 4v6h6M4 10a8 8 0 1 1 1 8',
  desk: 'M3 9h18M4 9V6h16v3M5 9v12M19 9v12',
  shelf: 'M4 3h16v18H4ZM4 9h16M4 15h16',
  popstation_mini: 'M4 4h16v17H4ZM4 7h16M7 10v7m10-7v7M12 7v14',
  printer: 'M5 3h14v18H5ZM5 7h14M8 17h8M12 7v6m-2 0h4l-2 3Z',
  plus: 'M12 5v14M5 12h14',
  duplicate: 'M8 8h13v13H8ZM4 16H3V3h13v1',
  paste: 'M9 4h6v4H9ZM9 6H5v15h14V6h-4M8 12h8M8 16h8',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  render: 'M4 5h16v14H4ZM4 15l5-5 4 4 3-3 4 4M16 8h.01',
  minus: 'M5 12h14',
  source:'M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7',
  edit:'m15 4 5 5M4 15l-1 6 6-1L21 8l-5-5Z',
  group:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  save:'M4 3h13l4 4v14H3V3Zm3 0v7h10V3M7 21v-7h10v7',
  ungroup:'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8Z'
};

export function createLayoutUI({container, onAction, t, catalog = []}) {
  if (!container?.ownerDocument || typeof onAction !== 'function' || typeof t !== 'function') {
    throw new TypeError('createLayoutUI requires container, onAction and t');
  }
  const doc = container.ownerDocument;
  let translate = t, state = null, selectedId = null, disposed = false, floorplan = false;
  let status = {canUndo: false, canRedo: false, busy: false};
  let currentIssues = [], editorKey = null, listKey = '';
  let roomMode='rectangle', roomAcceptedMode='rectangle', roomDraft=false, roomSignature=null;
  let farmKey='', libraryKey='', groupLibrary=[];
  const pickedRoots=new Set(), memberChecks=new Map();
  const cleanups = new Set(), fields = new Map();
  const entries = Array.isArray(catalog) ? catalog : catalog instanceof Map ? [...catalog.values()] : Array.isArray(catalog.entries) ? catalog.entries : Object.values(catalog);
  const machines = entries.filter(e => e && typeof e.id === 'string');
  const byMachine = new Map(machines.map(e => [e.id, e]));
  const tr = (key, values = {}) => String(translate(key, values));
  const el = (tag, className, text) => {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const copy = (node, key, values = {}) => {
    node.dataset.layoutI18n = key;
    node._layoutValues = values;
    node.textContent = tr(key, values);
    return node;
  };
  const listen = (node, event, fn) => {
    node.addEventListener(event, fn);
    const remove=()=>node.removeEventListener(event,fn);remove.node=node;cleanups.add(remove);
  };
  const icon = name => {
    const n = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('aria-hidden', 'true');
    const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', PATHS[name] || PATHS.plus); n.append(p); return n;
  };
  const feedback = el('p', 'layout-feedback');
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
  const showError = message => {
    if (disposed) return;
    feedback.textContent = message || tr('layout.actionFailed');
    feedback.dataset.error = 'true'; feedback.hidden = false;
  };
  function emit(action) {
    if (disposed || (status.busy && action.type !== 'cancel')) return;
    try {
      const result = onAction(action);
      if (result?.then) result.catch(error => showError(error?.message));
    } catch (error) { showError(error?.message); }
  }
  function button(key, action, image, {small = false, titleOnly = false} = {}) {
    const b = el('button', titleOnly ? 'layout-icon-button' : 'layout-button-label');
    b.type = 'button'; b.dataset.layoutCommand = typeof action === 'string' ? action : key;
    if (image) b.append(icon(image));
    b.append(copy(el('span', titleOnly ? 'layout-sr-only' : ''), key));
    b.setAttribute('aria-label', tr(key)); b.dataset.layoutLabel = key;
    if(titleOnly){b.title=tr(key);b.dataset.layoutTooltip=key;}
    if (small) b.classList.add('layout-small');
    listen(b, 'click', () => typeof action === 'function' ? action() : emit({type: action}));
    return b;
  }
  const root = el('div', 'layout-ui');
  root.append(feedback);
  const boundsNotice=copy(el('p','layout-feedback layout-bounds-notice'),'layout.repairBounds');boundsNotice.id='layout-bounds-notice';boundsNotice.hidden=true;boundsNotice.setAttribute('role','status');root.append(boundsNotice);
  const actions = el('div', 'layout-plan-actions');
  actions.setAttribute('role', 'toolbar'); actions.setAttribute('aria-label', tr('layout.planActions'));
  const undo = button('layout.undo', 'undo', 'undo', {titleOnly: true});
  const redo = button('layout.redo', 'redo', 'redo', {titleOnly: true});
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  const importButton = button('layout.import', () => { if (!status.busy) file.click(); }, 'import',{titleOnly:true});
  listen(file, 'change', () => {
    const chosen = file.files?.[0]; file.value = '';
    if (chosen) emit({type: 'import', file: chosen});
  });
  const copySelectionButton=button('layout.clipboard.copy','copy','duplicate',{titleOnly:true});
  const pasteSelectionButton=button('layout.clipboard.paste','paste','paste',{titleOnly:true});
  copySelectionButton.setAttribute('aria-keyshortcuts','Control+C Meta+C');pasteSelectionButton.setAttribute('aria-keyshortcuts','Control+V Meta+V');
  actions.append(undo, redo, copySelectionButton, pasteSelectionButton, el('span', 'layout-action-spacer'), importButton,
    button('layout.exportPlan', 'export', 'export', {titleOnly: true}),
    button('layout.reset', 'reset', 'reset', {titleOnly: true}), file);
  root.append(actions);
  const section = (key, parent = root) => {
    const n = el('section', 'layout-section'); n.append(copy(el('h2'), key)); parent.append(n); return n;
  };
  const roomSection = section('layout.room');
  const roomTools=el('div','layout-room-tools');
  const svgFile=el('input');svgFile.type='file';svgFile.accept='.svg,image/svg+xml';svgFile.hidden=true;svgFile.id='layout-svg-file';
  listen(svgFile,'change',()=>{const chosen=svgFile.files?.[0];svgFile.value='';if(chosen)emit({type:'import-svg',file:chosen});});
  roomTools.append(button('layout.editRoomOutline','edit-room','edit'),button('layout.importFloorplanSVG',()=>{if(!status.busy)svgFile.click();},'import'),svgFile);roomSection.append(roomTools);
  const shapeLabel=el('label','layout-field layout-room-shape');shapeLabel.append(copy(el('span'),'layout.room_shape'));
  const shapeSelect=el('select');shapeSelect.id='layout-room-shape';
  for(const [value,key]of [['rectangle','layout.rectangle'],['l','layout.l_shape'],['custom','layout.custom_shape']]){const o=copy(el('option'),key);o.value=value;shapeSelect.append(o);}
  shapeLabel.append(shapeSelect);roomSection.append(shapeLabel);
  const roomFields = el('div', 'layout-fields'); roomSection.append(roomFields);
  const roomNote = copy(el('p', 'layout-help'), 'layout.roomHelp'); roomSection.append(roomNote);

  function numberField(parent, key, name, {min, max, unit = 'mm', action} = {}) {
    const label = el('label', 'layout-field');
    label.append(copy(el('span'), key));
    const wrap = el('span', 'layout-input-unit'), n = el('input');
    n.type = 'number'; n.step = 'any'; n.inputMode = 'decimal'; n.id = `layout-field-${name}`;
    n.dataset.layoutField = name; n.dataset.mutable = 'true';n.dataset.rounded='true';
    if (min !== undefined) n.min = String(min);
    if (max !== undefined) n.max = String(max);
    n.required = true;
    const u = el('span', 'layout-unit', unit); u.setAttribute('aria-hidden', 'true');
    wrap.append(n, u); label.append(wrap); parent.append(label);
    fields.set(name, n);
    listen(n, 'input', () => { n._dirty = true; n.removeAttribute('aria-invalid'); });
    listen(n, 'change', () => {
      if(n.readOnly || (n.dataset.rounded==='true'&&!n._dirty))return;
      const value = n.valueAsNumber;
      if (!Number.isFinite(value) || !n.checkValidity()) {
        n.setAttribute('aria-invalid', 'true'); showError(tr('layout.validNumber')); return;
      }
      n._dirty = false;
      if (status.busy) return;
      if(Object.is(value,n._sourceValue))return;
      n._draftValue=value;
      if(!status.error){feedback.hidden=true;feedback.dataset.error='false';}
      action(value);
    });
    listen(n, 'blur', () => {
      n._dirty = false;
      if (state) refreshValues();
      const exact=Object.hasOwn(n,'_draftValue')?n._draftValue:n._sourceValue;
      if(Number.isFinite(exact))n.value=fixedOne(exact);
    });
    return n;
  }
  function roomBounds() {
    const p = state?.room?.polygonMm || [];
    if (!p.length) return null;
    const xs = p.map(v => v[0]), zs = p.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const rectangle = p.length === 4 && p.every(([x,z]) => (x === minX || x === maxX) && (z === minZ || z === maxZ));
    return {minX,maxX,minZ,maxZ,rectangle,widthMm:maxX-minX,depthMm:maxZ-minZ};
  }
  const resizeRoom = (axis, value) => {
    const b = roomBounds(); if(roomMode!=='rectangle'||!b?.rectangle||roomDraft){roomDraft=true;return;}
    if (value <= 0) return;
    const width = axis === 'width' ? value : b.widthMm, depth = axis === 'depth' ? value : b.depthMm;
    const x = (b.minX+b.maxX)/2, z = (b.minZ+b.maxZ)/2;
    emit({type:'SET_ROOM',room:{...state.room,polygonMm:[[x-width/2,z-depth/2],[x+width/2,z-depth/2],[x+width/2,z+depth/2],[x-width/2,z+depth/2]]}});
  };
  numberField(roomFields, 'layout.width', 'room-width', {min:1,action:v=>resizeRoom('width',v)});
  numberField(roomFields, 'layout.depth', 'room-depth', {min:1,action:v=>resizeRoom('depth',v)});
  numberField(roomFields, 'layout.height', 'room-height', {min:100,max:20000,action:v=>{if(roomDraft||roomMode!=='rectangle'){roomDraft=true;return;}emit({type:'SET_ROOM',room:{...state.room,wallHeightMm:v}});}});
  const cutFields=el('div','layout-fields layout-two layout-room-cuts');roomSection.append(cutFields);
  numberField(cutFields,'layout.cut_width','room-cut-width',{min:1,action:()=>{roomDraft=true;}});
  numberField(cutFields,'layout.cut_depth','room-cut-depth',{min:1,action:()=>{roomDraft=true;}});
  const custom=el('div','layout-room-custom'),pointsLabel=el('label','layout-field');pointsLabel.append(copy(el('span'),'layout.room_points'));
  const points=el('textarea');points.id='layout-room-points';points.rows=6;points.spellcheck=false;points.maxLength=8192;points.placeholder='-2000, -1500\n2000, -1500\n2000, 1500\n-2000, 1500';points.setAttribute('aria-describedby','layout-room-points-help');
  pointsLabel.append(el('span','layout-coordinate-format','X, Z · mm'),points);const pointsHelp=copy(el('p','layout-help'),'layout.invalid_room');pointsHelp.id='layout-room-points-help';custom.append(pointsLabel,pointsHelp);roomSection.append(custom);
  const applyRoom=button('layout.apply_room',()=>{
    if(!state)return;
    const roomNumbers=['room-width','room-depth','room-height','room-cut-width','room-cut-depth'];
    if(!roomDraft&&!roomNumbers.some(name=>fields.get(name)._dirty||Object.hasOwn(fields.get(name),'_draftValue')))return;
    try{
      const read=name=>{const n=fields.get(name),v=n._dirty?n.valueAsNumber:Object.hasOwn(n,'_draftValue')?n._draftValue:n._sourceValue;if(!Number.isFinite(v)||(n.min!==''&&n.min!==undefined&&v<Number(n.min))||(n.max!==''&&n.max!==undefined&&v>Number(n.max)))throw {errors:[{code:'NUMBER_OUT_OF_RANGE',params:{min:n.min,max:n.max}}]};return v;};
      const wallHeightMm=read('room-height');let room;
      const sameShape=roomMode===roomAcceptedMode&&(roomMode==='custom'?points.value===state.room.polygonMm.map(p=>p.join(', ')).join('\n'):['room-width','room-depth',...(roomMode==='l'?['room-cut-width','room-cut-depth']:[])].every(name=>Object.is(read(name),fields.get(name)._sourceValue)));
      if(sameShape){room=createRoomPolygon({polygonMm:state.room.polygonMm,wallHeightMm});}
      else if(roomMode==='custom'){
        const lines=points.value.trim().split(/\r?\n/).filter(line=>line.trim());
        const scalar='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
        const pair=new RegExp(`^\\s*(${scalar})\\s*,\\s*(${scalar})\\s*$`);
        if(points.value.length>8192||lines.some(line=>!pair.test(line)))throw {errors:[{code:'POLYGON_COORDINATE',params:{}}]};
        const polygonMm=lines.map(line=>pair.exec(line)).map(m=>[Number(m[1]),Number(m[2])]);
        room=createRoomPolygon({polygonMm,wallHeightMm});
      }else{
        const widthMm=read('room-width'),depthMm=read('room-depth'),b=roomBounds();
        const centered=roomMode==='l'?createRoomL({widthMm,depthMm,cutWidthMm:read('room-cut-width'),cutDepthMm:read('room-cut-depth'),wallHeightMm}):createRoomRect({widthMm,depthMm,wallHeightMm});
        const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
        room=createRoomPolygon({polygonMm:centered.polygonMm.map(([x,z])=>[x+cx,z+cz]),wallHeightMm});
      }
      room={...room,appearance:state.room.appearance??DEFAULT_ROOM_APPEARANCE};
      points.removeAttribute('aria-invalid');roomDraft=false;roomSignature=null;
      if(JSON.stringify(room)===JSON.stringify(state.room)){syncRoom();return;}
      emit({type:'SET_ROOM',room});
    }catch(error){points.setAttribute('aria-invalid','true');const problem=error?.errors?.[0];showError(problem?tr(`layout.error.${problem.code}`,problem.params||{}):tr('layout.actionFailed'));}
  });applyRoom.id='layout-room-apply';roomSection.append(applyRoom);
  const appearance=el('fieldset','layout-room-appearance');
  appearance.append(copy(el('legend'),'layout.room_appearance'));
  const finishSelects=new Map();
  for(const [surface,finishes]of [['wall',WALL_FINISHES],['floor',FLOOR_FINISHES]]){
    const label=el('label','layout-field'),select=el('select');
    label.append(copy(el('span'),`layout.appearance.${surface}`));
    select.id=`layout-room-${surface}-finish`;select.dataset.layoutField=`room-${surface}-finish`;
    for(const finish of finishes){const option=copy(el('option'),`layout.appearance.${surface}.${finish}`);option.value=finish;select.append(option);}
    listen(select,'change',()=>{
      if(!state)return;
      const current=state.room.appearance??DEFAULT_ROOM_APPEARANCE;
      if(select.value===current[surface])return;
      emit({type:'SET_ROOM',room:{...state.room,appearance:{...current,[surface]:select.value}}});
    });
    label.append(select);appearance.append(label);finishSelects.set(surface,select);
  }
  roomSection.append(appearance);
  const shapeVisibility=()=>{
    cutFields.hidden=roomMode!=='l';custom.hidden=roomMode!=='custom';
    for(const key of ['room-width','room-depth'])fields.get(key).readOnly=roomMode==='custom';
    copy(roomNote,roomMode==='custom'?'layout.customRoomHelp':'layout.roomHelp');
  };
  listen(shapeSelect,'change',()=>{roomMode=shapeSelect.value;roomDraft=true;shapeVisibility();});
  listen(points,'input',()=>{roomDraft=true;points.removeAttribute('aria-invalid');});
  function syncRoom(){
    // Appearance edits must not discard uncommitted shape/outline drafts.
    const signature=JSON.stringify([state.room.polygonMm,state.room.wallHeightMm]),b=roomBounds();
    for(const [surface,select]of finishSelects)select.value=(state.room.appearance??DEFAULT_ROOM_APPEARANCE)[surface];
    if(signature!==roomSignature){
      roomSignature=signature;roomDraft=false;
      const xs=[...new Set(state.room.polygonMm.map(p=>p[0]))].sort((a,b)=>a-b),zs=[...new Set(state.room.polygonMm.map(p=>p[1]))].sort((a,b)=>a-b);
      let isL=false;
      if(xs.length===3&&zs.length===3&&state.room.polygonMm.length===6){
        const expected=[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,zs[1]],[xs[1],zs[1]],[xs[1],b.maxZ],[b.minX,b.maxZ]];
        const edges=p=>new Set(p.map((v,i)=>[JSON.stringify(v),JSON.stringify(p[(i+1)%p.length])].sort().join('|')));
        const actual=edges(state.room.polygonMm);isL=[...edges(expected)].every(e=>actual.has(e));
      }
      roomMode=b.rectangle?'rectangle':isL?'l':'custom';roomAcceptedMode=roomMode;shapeSelect.value=roomMode;
      value('room-width',b.widthMm);value('room-depth',b.depthMm);value('room-height',state.room.wallHeightMm);
      value('room-cut-width',isL?b.maxX-xs[1]:b.widthMm/2);value('room-cut-depth',isL?b.maxZ-zs[1]:b.depthMm/2);
      points.value=state.room.polygonMm.map(p=>p.join(', ')).join('\n');
    }else if(!roomDraft){
      value('room-width',b.widthMm);value('room-depth',b.depthMm);value('room-height',state.room.wallHeightMm);
    }
    shapeVisibility();
  }

  const addSection = section('layout.add');
  const furnitureAdd = el('div', 'layout-add-furniture');
  furnitureAdd.append(button('layout.addDesk',()=>emit({type:'add',kind:'desk'}),'desk'),button('layout.addShelf',()=>emit({type:'add',kind:'shelf'}),'shelf'));
  furnitureAdd.append(button('layout.addPopStation',()=>emit({type:'add',kind:'popstation_mini'}),'popstation_mini'));
  addSection.append(furnitureAdd);
  const search = el('input', 'layout-catalog-search'); search.type = 'search';
  search.placeholder = tr('layout.searchPrinters'); search.setAttribute('aria-label', tr('layout.searchPrinters'));
  search.dataset.layoutPlaceholder = 'layout.searchPrinters';
  const printerAdd = el('div', 'layout-add-printer'), machineSelect = el('select');
  machineSelect.id = 'layout-machine'; machineSelect.setAttribute('aria-label',tr('layout.choosePrinter'));
  const addMachine = button('layout.addPrinter',()=>{if(byMachine.has(machineSelect.value))emit({type:'add',kind:'printer',machineId:machineSelect.value});},'plus',{titleOnly:true});
  function populateMachines() {
    const old = machineSelect.value, query = search.value.trim().toLocaleLowerCase();
    machineSelect.replaceChildren();
    for (const m of machines) {
      const label = machineLabel(m);
      if (query && !`${label} ${m.id}`.toLocaleLowerCase().includes(query)) continue;
      const o=el('option','',label);o.value=m.id;machineSelect.append(o);
    }
    if ([...machineSelect.options].some(o=>o.value===old)) machineSelect.value=old;
    if (!machineSelect.options.length) { const o=el('option','',tr('layout.noPrinters'));o.value='';machineSelect.append(o); }
    addMachine.disabled = status.busy || !byMachine.has(machineSelect.value);
  }
  listen(search,'input',populateMachines); printerAdd.append(machineSelect,addMachine);
  addSection.append(search,printerAdd);
  const manufacturerNote=el('aside','layout-manufacturer-note');
  manufacturerNote.append(copy(el('h3'),'layout.manufacturer.title'),copy(el('p'),'layout.manufacturer.message'));
  const manufacturerContacts=el('p','layout-manufacturer-contacts');
  const manufacturerEmail=el('a','','info@psych0h3ad.tech');manufacturerEmail.href='mailto:info@psych0h3ad.tech';
  const manufacturerX=el('a','','X (@Psych0h3ad)');manufacturerX.href='https://x.com/Psych0h3ad';manufacturerX.target='_blank';manufacturerX.rel='noopener noreferrer';
  manufacturerContacts.append(manufacturerEmail,manufacturerX);manufacturerNote.append(manufacturerContacts);addSection.append(manufacturerNote);
  const objectSection = section('layout.objects'), objectCount = el('span','layout-count');
  const objectHeading=el('div','layout-section-heading');objectHeading.append(objectSection.firstChild,objectCount);objectSection.append(objectHeading);
  const list=el('ul','layout-object-list'), empty=copy(el('p','layout-empty'),'layout.empty');
  list.id='layout-objects'; objectSection.append(list,empty);
  const farmSection=section('layout.farm'), farmSummary=el('p','layout-count');
  farmSection.id='layout-farm';
  const farmHelp=copy(el('p','layout-help'),'layout.group.help');farmHelp.id='layout-group-help';
  const createForm=el('form','layout-group-create'), nameLabel=el('label','layout-field');
  nameLabel.append(copy(el('span'),'layout.group.name'));
  const groupName=el('input');groupName.type='text';groupName.id='layout-group-name';groupName.required=true;groupName.maxLength=80;
  groupName.required=false;groupName.placeholder=tr('layout.group.defaultName');
  groupName.setAttribute('aria-describedby',farmHelp.id);nameLabel.append(groupName);
  const pickedSummary=el('p','layout-count');pickedSummary.id='layout-group-picked';
  const createGroup=button('layout.group.create',()=>{
    prunePickedRoots();
    if(status.busy||!pickedRoots.size)return;
    emit({type:'group-create',name:groupName.value.trim()||tr('layout.group.defaultName'),memberIds:[...pickedRoots]});
  },'group');
  createGroup.setAttribute('aria-describedby',pickedSummary.id);
  listen(createForm,'submit',event=>{event.preventDefault();if(!createGroup.disabled)createGroup.click();});
  listen(groupName,'keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!createGroup.disabled)createGroup.click();}});
  listen(groupName,'input',refreshGroupDraft);
  createForm.append(nameLabel,pickedSummary,createGroup);
  const groupList=el('ul','layout-object-list layout-group-list'), noGroups=copy(el('p','layout-help'),'layout.group.empty');
  groupList.id='layout-groups';
  const libraryHeading=copy(el('h3'),'layout.group.library'), libraryList=el('ul','layout-group-library');
  libraryList.id='layout-group-library';
  const noTemplates=copy(el('p','layout-help'),'layout.group.libraryEmpty');
  const bulkTools=el('div','layout-row layout-bulk-tools');
  bulkTools.append(button('layout.selection.all',()=>setPickedRootIds(roots().map(e=>e.id)),'group'),button('layout.selection.clear',()=>setPickedRootIds([]),'minus'),button('layout.selection.copy',()=>emit({type:'copy',selectionIds:[...pickedRoots]}),'duplicate'));
  const clipboardHelp=copy(el('p','layout-help'),'layout.clipboard.help');
  farmSection.append(farmSummary,farmHelp,bulkTools,createForm,clipboardHelp,groupList,noGroups,libraryHeading,libraryList,noTemplates);
  const editorSection=section('layout.selection'), editor=el('div','layout-editor'); editorSection.append(editor);
  const warningSection=section('layout.checks'), issueList=el('ul','layout-issues'); warningSection.append(issueList);
  const renderSection=section('layout.finalRender');
  const renderButton=button('layout.render','render','render');renderButton.classList.add('layout-primary','layout-render-button');renderButton.id='layout-render';
  const renderHelp=copy(el('p','layout-help'),'layout.renderHelp');
  const progress=el('progress','layout-render-progress');progress.hidden=true;
  const renderMessage=el('p','layout-render-message');renderMessage.setAttribute('role','status');renderMessage.setAttribute('aria-live','polite');
  const cancel=button('layout.cancel','cancel');cancel.classList.add('layout-cancel');cancel.hidden=true;
  renderSection.append(renderButton,renderHelp,progress,renderMessage,cancel);
  const scope=section('layout.about');scope.append(copy(el('p','layout-scope'),'layout.scope'));
  const shortcuts=el('div','layout-section-shortcuts');
  shortcuts.setAttribute('role','group');shortcuts.dataset.layoutLabel='layout.settings';shortcuts.setAttribute('aria-label',tr('layout.settings'));
  const jumps=[['layout.nav.room',roomSection],['layout.nav.add',addSection],['layout.nav.farm',farmSection],['layout.nav.objects',objectSection],['layout.nav.selection',editorSection]];
  let selectionJump;
  for(const [key,target]of jumps){
    target.id=key.replaceAll('.','-');
    const jump=button(key,()=>{
      const top=container.scrollTop+target.getBoundingClientRect().top-container.getBoundingClientRect().top-actions.getBoundingClientRect().height;
      container.scrollTo({top:Math.max(0,top),behavior:'instant'});
    });
    jump.dataset.layoutJump=target.id;jump.setAttribute('aria-controls',target.id);
    if(target===editorSection)selectionJump=jump;
    shortcuts.append(jump);
  }
  actions.append(shortcuts);
  container.replaceChildren(root);

  function machineLabel(m) { return String(m?.label || m?.name || m?.title || m?.id || ''); }
  function selectedSourceURL(m){return printerSourcesURL(m,doc.location?.href||doc.defaultView?.location?.href,doc.documentElement?.lang||'en');}
  function entities() { return [...(state?.furniture||[]),...(state?.printers||[])]; }
  function groups() { return Array.isArray(state?.groups)?state.groups:[]; }
  function isGroup(e) { return groups().some(g=>g.id===e.id); }
  function selected() { return groups().find(e=>e.id===selectedId)||entities().find(e=>e.id===selectedId); }
  function roots() { return [...(state?.furniture||[]),...(state?.printers||[]).filter(p=>p.attachment?.parentId===null&&p.attachment.surfaceId==='floor')]; }
  function assignedGroup(id) { return groups().find(g=>g.memberIds?.includes(id)); }
  function members(ids) {
    const rootIds=new Set(ids), furniture=(state?.furniture||[]).filter(f=>rootIds.has(f.id)), furnitureIds=new Set(furniture.map(f=>f.id));
    const printers=(state?.printers||[]).filter(p=>furnitureIds.has(p.attachment?.parentId)||(p.attachment?.parentId===null&&p.attachment.surfaceId==='floor'&&rootIds.has(p.id)));
    return [...furniture,...printers];
  }
  function counts(all) { return {furniture:all.filter(e=>!('machineId' in e)).length,printers:all.filter(e=>'machineId' in e).length}; }
  function prunePickedRoots() {
    const available=new Set(roots().map(e=>e.id));
    for(const id of pickedRoots)if(!available.has(id))pickedRoots.delete(id);
  }
  function refreshGroupDraft() {
    copy(pickedSummary,'layout.group.selection',{roots:pickedRoots.size,...counts(members(pickedRoots))});
    createGroup.disabled=!!status.busy||!state||!pickedRoots.size;
    copySelectionButton.disabled=!!status.busy||(!pickedRoots.size&&!selected());
    pasteSelectionButton.disabled=!!status.busy||!status.canPaste;
    const bulkCopy=bulkTools.querySelector('[data-layout-command="layout.selection.copy"]');if(bulkCopy)bulkCopy.disabled=!!status.busy||!pickedRoots.size;
    for(const check of memberChecks.values())check.checked=pickedRoots.has(check.dataset.layoutGroupMember);
  }
  function releaseDetachedControls() {
    for(const remove of cleanups)if(!root.contains(remove.node)){remove();cleanups.delete(remove);}
  }
  function title(e) {
    if(isGroup(e))return String(e.name);
    if ('machineId' in e) return machineLabel(byMachine.get(e.machineId)) || e.machineId;
    if(e.type==='popstation_mini')return 'BIQU PopStation Mini';
    const same=(state.furniture||[]).filter(v=>v.type===e.type), number=same.findIndex(v=>v.id===e.id)+1;
    return tr(e.type==='desk'?'layout.deskName':'layout.shelfName',{number});
  }
  function refreshList() {
    prunePickedRoots();
    const all=entities(), rootIds=new Set(roots().map(e=>e.id));
    const key=JSON.stringify(all.map(e=>[e.id,title(e),e.type||'printer',rootIds.has(e.id),assignedGroup(e.id)?.id,assignedGroup(e.id)?.name]));
    objectCount.textContent=String(all.length); empty.hidden=all.length>0;
    if(key!==listKey){
      listKey=key; list.replaceChildren();memberChecks.clear();
      for(const e of all){
        const li=el('li','layout-object-row'), b=button('layout.selectObject',()=>emit({type:'select',id:e.id}),e.type||'printer');
        b.className='layout-object-button'; b.dataset.layoutEntity=e.id;b.replaceChildren(icon(e.type||'printer'));
        const c=el('span','layout-object-copy');c.append(el('span','layout-object-name',title(e)));b.append(c);
        b.setAttribute('aria-label',title(e));
        if(rootIds.has(e.id)){
          const label=el('label','layout-group-pick'), check=el('input');check.type='checkbox';check.dataset.layoutGroupMember=e.id;
          const text=copy(el('span','layout-sr-only'),'layout.group.selectMember',{name:title(e)});label.append(check,text);li.append(label);memberChecks.set(e.id,check);
          check.setAttribute('aria-describedby',farmHelp.id);
          listen(check,'change',()=>{
            if(status.busy)return;
            if(check.checked)pickedRoots.add(e.id);else pickedRoots.delete(e.id);
            prunePickedRoots();refreshGroupDraft();
          });
          const assigned=assignedGroup(e.id);
          if(assigned){
            const note=copy(el('span','layout-object-detail'),'layout.group.assigned',{name:assigned.name});
            note.id=`layout-group-assigned-${memberChecks.size}`;c.append(note);check.setAttribute('aria-describedby',`${farmHelp.id} ${note.id}`);
          }
        }else li.classList.add('layout-object-child');
        li.append(b);list.append(li);
      }
    }
    for(const b of list.querySelectorAll('[data-layout-entity]'))b.setAttribute('aria-pressed',String(b.dataset.layoutEntity===selectedId));
  }
  function refreshFarm() {
    const all=groups(), key=JSON.stringify(all.map(g=>[g.id,g.name,counts(members(g.memberIds))]));
    copy(farmSummary,'layout.group.summary',{groups:all.length,...counts(entities())});
    noGroups.hidden=all.length>0;
    if(key!==farmKey){
      farmKey=key;groupList.replaceChildren();
      for(const group of all){
        const row=el('li'), b=button('layout.selectObject',()=>emit({type:'select',id:group.id}),'group');
        b.className='layout-object-button';b.dataset.layoutGroup=group.id;b.replaceChildren(icon('group'));
        const c=el('span','layout-object-copy');c.append(el('span','layout-object-name',group.name),copy(el('span','layout-object-detail'),'layout.group.counts',counts(members(group.memberIds))));
        b.append(c);b.setAttribute('aria-label',group.name);row.append(b);groupList.append(row);
      }
    }
    for(const b of groupList.querySelectorAll('[data-layout-group]'))b.setAttribute('aria-pressed',String(b.dataset.layoutGroup===selectedId));
    refreshGroupDraft();
  }
  function refreshLibrary() {
    const key=JSON.stringify(groupLibrary);noTemplates.hidden=groupLibrary.length>0;
    if(key===libraryKey)return;
    libraryKey=key;libraryList.replaceChildren();
    for(const [index,item]of groupLibrary.entries()){
      const row=el('li','layout-group-template');row.dataset.layoutTemplate=item.id;
      const c=el('div','layout-object-copy');c.append(el('span','layout-object-name',item.name),copy(el('span','layout-object-detail'),'layout.group.counts',{printers:item.printerCount,furniture:item.furnitureCount}));
      c.id=`layout-group-template-summary-${index+1}`;
      const controls=el('div','layout-row');
      controls.append(button('layout.group.place',()=>emit({type:'group-place',templateId:item.id}),'plus'),button('layout.group.removeTemplate',()=>emit({type:'group-template-remove',templateId:item.id}),'trash',{titleOnly:true}));
      for(const b of controls.children)b.setAttribute('aria-describedby',c.id);
      row.append(c,controls);libraryList.append(row);
    }
  }
  function setGroupLibrary(items) {
    if(disposed)return;
    groupLibrary=Array.isArray(items)?items.map(({id,name,printerCount,furnitureCount})=>({id,name,printerCount,furnitureCount})):[];
    refreshLibrary();refreshStatus();releaseDetachedControls();
  }
  function patchEntity(e, patch) { emit({type:'machineId' in e?'UPDATE_PRINTER':'UPDATE_FURNITURE',id:e.id,patch}); }
  function buildEditor() {
    const e=selected(), group=e&&isGroup(e);
    const nextKey=group?JSON.stringify(['group',e.id,members(e.memberIds).map(m=>[m.id,title(m)])]):e?`${e.id}:${e.type||'printer'}:${e.attachment?.parentId||''}:${JSON.stringify(e.levels?.map(l=>l.id)||[])}:${JSON.stringify(state.furniture.map(f=>[f.id,f.type,f.levels?.map(l=>l.id)]))}:${JSON.stringify(state.printers.map(p=>[p.id,p.machineId,p.attachment.parentId]))}`:'';
    if(nextKey===editorKey)return;
    editorKey=nextKey;
    for(const name of [...fields.keys()])if(!name.startsWith('room-'))fields.delete(name);
    editor.replaceChildren();
    if(!e){editor.append(copy(el('p','layout-empty'),'layout.selectHint'));return;}
    if(group){buildGroupEditor(e);return;}
    editor.append(el('p','layout-editor-subtitle',title(e)));
    const isPrinter='machineId' in e;
    if(!isPrinter&&e.type!=='popstation_mini'){
      const dims=el('div','layout-fields');editor.append(dims);
      for(const [key,prop] of [['layout.width','widthMm'],['layout.depth','depthMm'],['layout.height','heightMm']])numberField(dims,key,prop,{min:1,action:v=>patchEntity(e,{[prop]:v})});
      const thick=el('div','layout-fields layout-two');editor.append(thick);
      const prop=e.type==='desk'?'topThicknessMm':'boardThicknessMm';
      const thicknessField=numberField(thick,'layout.thickness',prop,{min:e.type==='desk'?30:5,max:e.type==='desk'?30:100,action:v=>patchEntity(e,{[prop]:v})});
      if(e.type==='desk')thicknessField.readOnly=true;
    }else if(isPrinter){
      const supportLabel=el('label','layout-field');supportLabel.append(copy(el('span'),'layout.support'));
      const supports=el('select');supports.dataset.layoutField='support';supports.id='layout-support';
      const addOption=(parentId,surfaceId,label)=>{const o=el('option','',label);o.value=JSON.stringify([parentId,surfaceId]);supports.append(o);};
      addOption(null,'floor',tr('layout.floor'));
      for(const f of state.furniture){
        if(f.type==='desk')addOption(f.id,'top',tr('layout.deskTop',{name:title(f)}));
        else if(f.type==='popstation_mini'){
          if(e.machineId==='snapmaker_u1_layout_reference'&&!state.printers.some(p=>p.id!==e.id&&p.attachment.parentId===f.id))addOption(f.id,'top',title(f));
        }else for(const [index,l]of f.levels.entries())addOption(f.id,l.id,tr('layout.shelfBoard',{name:title(f),number:index+1}));
      }
      supportLabel.append(supports);editor.append(supportLabel);
      listen(supports,'change',()=>{const [parentId,surfaceId]=JSON.parse(supports.value);emit({type:'SET_ATTACHMENT',id:e.id,attachment:{parentId,surfaceId,xMm:0,zMm:0,yawDeg:0}});});
      editor.append(copy(el('p','layout-help'),'layout.supportHelp'));
      const m=byMachine.get(e.machineId);
      const mounted=state.furniture.some(f=>f.id===e.attachment.parentId&&f.type==='popstation_mini');
      if(m){const profile=resolvePrinterEquipment(state,e,catalog);editor.append(el('p','layout-help',tr('layout.machineSize',{width:fixedOne(profile.widthMm),depth:fixedOne(profile.depthMm),height:fixedOne(profile.heightMm)})));}
      if(m?.id==='snapmaker_u1_layout_reference')editor.append(copy(el('p','layout-help'),mounted?'layout.u1Mounted':'layout.u1Standalone'),copy(el('p','layout-help'),'layout.u1OperatingHeight'));
      const href=selectedSourceURL(m);
      if(href){
        const link=el('a','layout-printer-source-link');link.href=href;link.target='_blank';link.rel='noopener noreferrer';
        link.dataset.layoutSourceLink='';link.dataset.layoutLink='';link.append(icon('source'),copy(el('span'),'layout.openPrinterSources'));editor.append(link);
      }
    }
    if(e.type==='popstation_mini')editor.append(el('p','layout-help','422 × 456 × 428 mm'),copy(el('p','layout-help'),'layout.popStationHelp'));
    if(e.machineId==='snapmaker_u1_layout_reference'||e.type==='popstation_mini'){
      const link=el('a','layout-printer-source-link');link.href='https://github.com/Psych0h3ad/3d-print-rig/blob/main/docs/LAYOUT_EQUIPMENT.md';link.target='_blank';link.rel='noopener noreferrer';
      link.append(icon('source'),copy(el('span'),'layout.equipmentSources'));editor.append(link);
    }
    const position=el('div');position.append(copy(el('p','layout-position-label'),isPrinter?'layout.surfacePosition':'layout.floorPosition'));
    const pose=el('div','layout-fields');position.append(pose);editor.append(position);
    for(const [key,prop,unit]of [['layout.positionX','xMm','mm'],['layout.positionZ','zMm','mm'],['layout.rotation','yawDeg','°']]){
      const field=numberField(pose,key,prop,{unit,action:v=>patchEntity(e,{[isPrinter?'attachment':'pose']:{[prop]:v}})});
      field.readOnly=!!(isPrinter&&state.furniture.some(f=>f.id===e.attachment.parentId&&f.type==='popstation_mini'));
    }
    const rotate=el('div','layout-row layout-rotate');
    for(const delta of [-90,90]){const control=button(delta<0?'layout.rotateLeft':'layout.rotateRight',()=>{const current=selected();if(current)patchEntity(current,{[isPrinter?'attachment':'pose']:{yawDeg:(current[isPrinter?'attachment':'pose'].yawDeg+delta)}});});if(isPrinter&&state.furniture.some(f=>f.id===e.attachment.parentId&&f.type==='popstation_mini'))control.dataset.mountLocked='true';rotate.append(control);}
    position.append(rotate);
    if(e.type==='shelf'){
      const boards=el('div');boards.append(copy(el('h3'),'layout.boards'));
      const rows=el('div','layout-board-list');
      e.levels.forEach((level,index)=>{
        const row=el('div','layout-board-row');row.append(el('span','',tr('layout.boardNumber',{number:index+1})));
        const height=numberField(row,'layout.boardHeight',`board-${level.id}`,{min:1,action:v=>{const current=selected();patchEntity(current,{levels:current.levels.map(l=>({...l,topMm:l.id===level.id?v:l.topMm}))});}});height.dataset.rounded='true';
        row.append(button('layout.removeBoard',()=>emit({type:'remove-level',id:e.id,levelId:level.id}),'minus',{titleOnly:true}));rows.append(row);
      });
      boards.append(rows,button('layout.addBoard',()=>emit({type:'add-level',id:e.id}),'plus'));editor.append(boards);
    }
    let detach=null;
    if(!isPrinter&&state.printers.some(p=>p.attachment.parentId===e.id)){
      const label=el('label','layout-check');detach=el('input');detach.type='checkbox';detach.id='layout-detach';
      label.append(detach,copy(el('span'),'layout.detachOnDelete'));editor.append(label);
    }
    const bottom=el('div','layout-editor-actions');
    bottom.append(button('layout.duplicate',()=>emit({type:'duplicate',id:e.id}),'duplicate'));
    const remove=button('layout.delete',()=>emit({type:'delete',id:e.id,detachChildren:!!detach?.checked}),'trash');remove.classList.add('layout-delete');
    if(detach){remove.disabled=true;listen(detach,'change',()=>{remove.disabled=status.busy||!detach.checked;});remove.dataset.requiresDetach='true';}
    bottom.append(remove);editor.append(bottom);
  }
  function buildGroupEditor(group) {
    const label=el('label','layout-field');label.append(copy(el('span'),'layout.group.name'));
    const name=el('input');name.type='text';name.required=true;name.maxLength=80;name.id='layout-group-edit-name';label.append(name);editor.append(label);
    listen(name,'input',()=>{name._dirty=true;name.removeAttribute('aria-invalid');});
    listen(name,'change',()=>{
      if(status.busy)return;
      const next=name.value.trim();
      if(!next){name.setAttribute('aria-invalid','true');showError(tr('layout.group.nameRequired'));return;}
      name._dirty=false;
      const current=selected();if(current&&isGroup(current)&&next!==current.name)emit({type:'group-rename',id:group.id,name:next});
    });
    listen(name,'blur',()=>{name._dirty=false;refreshValues();});
    editor.append(copy(el('p','layout-count'),'layout.group.counts',counts(members(group.memberIds))),copy(el('p','layout-position-label'),'layout.group.worldPosition'));
    const pose=el('div','layout-fields');editor.append(pose);
    for(const [key,prop,unit]of [['layout.positionX','xMm','mm'],['layout.positionZ','zMm','mm'],['layout.rotation','yawDeg','°']])numberField(pose,key,prop,{unit,action:v=>emit({type:'group-transform',id:group.id,patch:{[prop]:v}})});
    const bottom=el('div','layout-editor-actions layout-group-actions');
    bottom.append(button('layout.group.save',()=>emit({type:'group-save',id:group.id}),'save'),button('layout.duplicate',()=>emit({type:'duplicate',id:group.id}),'duplicate'),button('layout.group.ungroup',()=>emit({type:'group-ungroup',id:group.id}),'ungroup'));
    const remove=button('layout.delete',()=>emit({type:'delete',id:group.id}),'trash');remove.classList.add('layout-delete');bottom.append(remove);editor.append(bottom);
    editor.append(copy(el('h3'),'layout.group.members'));
    const list=el('ul','layout-object-list layout-group-members');
    for(const member of members(group.memberIds)){
      const row=el('li'), b=button('layout.selectObject',()=>emit({type:'select',id:member.id}),member.type||'printer');
      b.className='layout-object-button';b.dataset.layoutGroupObject=member.id;b.replaceChildren(icon(member.type||'printer'),el('span','layout-object-name',title(member)));b.setAttribute('aria-label',title(member));row.append(b);list.append(row);
    }
    editor.append(list);
  }
  function fixedOne(v){if(!Number.isFinite(v))return '';const text=v.toFixed(1);return text==='-0.0'?'0.0':text;}
  function value(name,v){const n=fields.get(name);if(n){n._sourceValue=v;if(!(doc.activeElement===n&&n._dirty)){delete n._draftValue;n.value=fixedOne(v);}}}
  function refreshValues(){
    if(!state)return;
    syncRoom();
    const e=selected();if(!e)return;
    const p=isGroup(e)?e.pose:e.attachment||e.pose;
    for(const key of ['xMm','zMm','yawDeg'])value(key,p[key]);
    if(isGroup(e)){
      const name=editor.querySelector('#layout-group-edit-name');if(name&&!(doc.activeElement===name&&name._dirty))name.value=e.name;
      return;
    }
    for(const key of ['widthMm','depthMm','heightMm','topThicknessMm','boardThicknessMm'])value(key,e[key]);
    for(const l of e.levels||[])value(`board-${l.id}`,l.topMm);
    const support=editor.querySelector('#layout-support');if(support)support.value=JSON.stringify([e.attachment.parentId,e.attachment.surfaceId]);
    const sourceLink=editor.querySelector('[data-layout-source-link]');if(sourceLink){const href=selectedSourceURL(byMachine.get(e.machineId));if(href)sourceLink.href=href;else sourceLink.remove();}
  }
  function refreshIssues(){
    issueList.replaceChildren();warningSection.hidden=currentIssues.length===0;
    for(const issue of currentIssues){
      const known=new Set(['ROOM_OUT_OF_BOUNDS','SURFACE_OVERHANG','SHELF_BOARD_INTERSECTION','ENVELOPE_OVERLAP']);
      const message=issue.message||(known.has(issue.code)?tr(`layout.issue.${issue.code}`,issue.params||{}):null);
      const objects=(issue.entityIds||[]).map(id=>entities().find(e=>e.id===id)).filter(e=>e&&(!('machineId'in e)||byMachine.has(e.machineId))).map(title).join(', ');
      const fallback=tr('layout.placementWarning',{objects});
      issueList.append(el('li','',message?(objects?`${objects}: ${message}`:message):fallback));
    }
  }
  function refreshStatus(){
    for(const n of root.querySelectorAll('button,input,select,textarea'))n.disabled=!!status.busy;
    for(const n of root.querySelectorAll('[data-mount-locked]'))n.disabled=true;
    for(const [id,check]of memberChecks){check.disabled=!!status.busy;check.checked=pickedRoots.has(id);}
    refreshGroupDraft();
    undo.disabled=status.busy||!status.canUndo;redo.disabled=status.busy||!status.canRedo;
    selectionJump.disabled=status.busy||!selected();
    addMachine.disabled=status.busy||!byMachine.has(machineSelect.value);
    const needsDetach=editor.querySelector('[data-requires-detach]');if(needsDetach)needsDetach.disabled=status.busy||!editor.querySelector('#layout-detach')?.checked;
    const boundaryInvalid=currentIssues.some(issue=>issue.code==='ROOM_OUT_OF_BOUNDS'||issue.code==='SURFACE_OVERHANG');
    boundsNotice.hidden=!boundaryInvalid;
    renderButton.disabled=status.busy||!state||(!floorplan&&(boundaryInvalid||(!state.printers?.length&&!state.furniture?.some(f=>f.type==='popstation_mini'))));
    cancel.hidden=!status.busy;cancel.disabled=false;
    progress.hidden=!status.busy;
    const p=status.renderProgress;
    if(p&&Number.isFinite(p.total)&&p.total>0&&Number.isFinite(p.loaded)){
      progress.max=p.total;progress.value=Math.min(p.total,Math.max(0,p.loaded));
    }else progress.removeAttribute('value');
    const humanProgress=typeof p?.message==='string'?p.message:typeof p?.humanMessage==='string'?p.humanMessage:'';
    renderMessage.textContent=status.busy?(humanProgress||status.message||tr('layout.rendering')):'';
    if(status.message||status.error){feedback.textContent=String(status.message||(typeof status.error==='string'?status.error:tr('layout.actionFailed')));feedback.dataset.error=String(!!status.error);feedback.hidden=false;}
  }
  function update(next,selection=null,issues=[]){
    if(disposed)return;
    state=next;selectedId=typeof selection==='object'?selection?.id:selection;currentIssues=Array.isArray(issues)?issues:[];
    refreshList();refreshFarm();buildEditor();refreshValues();refreshIssues();refreshStatus();
    // Rebuilt lists/editors must not retain detached controls or their closures.
    releaseDetachedControls();
  }
  function setStatus(next={}){if(disposed)return;status={...status,...next};if(Object.hasOwn(next,'error')&&!next.error){feedback.hidden=true;feedback.dataset.error='false';}refreshStatus();}
  function setProjection(projection){
    if(disposed)return;floorplan=projection==='orthographic-floorplan';
    const key=floorplan?'layout.render.plan':'layout.render';
    copy(renderButton.querySelector('[data-layout-i18n]'),key);renderButton.dataset.layoutLabel=key;renderButton.setAttribute('aria-label',tr(key));
    copy(renderHelp,floorplan?'layout.render.planHelp':'layout.renderHelp');refreshStatus();
  }
  function setLocale(next){
    if(disposed)return;if(typeof next!=='function')throw new TypeError('setLocale requires translator');
    translate=next;
    groupName.placeholder=tr('layout.group.defaultName');
    for(const n of root.querySelectorAll('[data-layout-i18n]'))n.textContent=tr(n.dataset.layoutI18n,n._layoutValues||{});
    for(const n of root.querySelectorAll('[data-layout-label]'))n.setAttribute('aria-label',tr(n.dataset.layoutLabel));
    for(const n of root.querySelectorAll('[data-layout-tooltip]'))n.title=tr(n.dataset.layoutTooltip);
    search.placeholder=tr('layout.searchPrinters');search.setAttribute('aria-label',tr('layout.searchPrinters'));machineSelect.setAttribute('aria-label',tr('layout.choosePrinter'));actions.setAttribute('aria-label',tr('layout.planActions'));
    listKey='';farmKey='';libraryKey='';editorKey=null;populateMachines();refreshLibrary();if(state)update(state,selectedId,currentIssues);else refreshStatus();
    releaseDetachedControls();
  }
  function dispose(){if(disposed)return;disposed=true;for(const remove of cleanups)remove();fields.clear();root.remove();state=null;}
  populateMachines();refreshStatus();
  function setPickedRootIds(ids){
    if(disposed||status.busy)return;
    pickedRoots.clear();for(const id of ids)if(typeof id==='string')pickedRoots.add(id);
    prunePickedRoots();refreshGroupDraft();
  }
  return Object.freeze({update,setStatus,setProjection,setLocale,setGroupLibrary,
    getPickedRootIds:()=>[...pickedRoots],setPickedRootIds,dispose});
}

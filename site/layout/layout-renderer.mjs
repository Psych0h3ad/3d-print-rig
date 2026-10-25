import * as THREE from '../viewer/vendor-r180/three.module.js';
import {OrbitControls} from '../viewer/vendor-r180/OrbitControls.js';
import {RoomEnvironment} from '../viewer/vendor-r180/RoomEnvironment.js';
import {deriveScene} from './layout-state.mjs?v=38da7e9cd1bcecf14474';
import {createLayoutSurfaces, resolveSurfaceAppearance, wallSurfaceGeometry} from './layout-surfaces.mjs?v=0e7f271c883eb7ec8844';
import {drawPlanMeasurements} from './layout-plan-measurements.mjs?v=ccb8d47a212b4279e38a';
import {groupInfo, groupingForEntity} from './layout-groups.mjs?v=0a9d77d6e07530349aa3';
import {groupLabel} from './layout-group-labels.mjs?v=1ff84a0cf5540fd3184b';
import {getLayoutEquipment,resolveLayoutEquipment} from './layout-equipment.mjs?v=bd8e2772cabd6fd2564b';
import {createEquipmentMeshCache} from './layout-equipment-mesh.mjs?v=81ae2cf27403863696cc';

const MM = .001;
const disposableMaterial = new THREE.MeshBasicMaterial({visible:false});
function materials(mesh) { return Array.isArray(mesh.material) ? mesh.material : [mesh.material]; }
function disposeTree(root) {
  const geometries=new Set(), mats=new Set(), textures=new Set();
  root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of o.material?materials(o):[]){if(m===disposableMaterial)continue;mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const m of mats)m.dispose();
}
function visibleMaterial(m) { return m && m.visible!==false && m.opacity!==0; }
function geometryBytes(g) { const a=new Set(Object.values(g.attributes).map(v=>v.array));if(g.index)a.add(g.index.array);return [...a].reduce((n,v)=>n+v.byteLength,0); }
function aborted(signal) { if(signal?.aborted)throw new DOMException('Cancelled','AbortError'); }
const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));

// These are placement symbols, not additional CAD or hardware. Existing source
// bounds stay intact; cues are kept inside the catalog's measured envelope.
function printerPreviewParts(row) {
  const d=row.dimensionsMm||{width:row.widthMm,depth:row.depthMm,height:row.heightMm};
  const [w,h,z]=[d.width,d.height,d.depth].map(v=>v*.001);
  if(![w,h,z].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid printer preview dimensions');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const style=['ender3','switchwire','sboom'].includes(row.family)?'moving-bed':
    ['vminion','tictac','rook','lh_stinger','snakeoil_3s'].includes(row.family)?'cantilever':
    row.family==='positron'?'inverted':'box-frame';
  const original=row.proxy?.parts||[];
  if(!Array.isArray(original)||original.length>128||original.some(p=>
    !Array.isArray(p.sizeM)||p.sizeM.length!==3||!p.sizeM.every(v=>Number.isFinite(v)&&v>0)||
    !Array.isArray(p.centerM)||p.centerM.length!==3||!p.centerM.every(Number.isFinite)))throw Error('Invalid printer preview parts');
  const parts=original.length?[...original]:[{wireframe:true,sizeM:[w,h,z],centerM:[0,h/2,0],color:'#718096'}];
  if(row.proxy?.appendGenericPrinterCues===false)return {style:'exterior',parts,simplePreview:true};
  const solids=original.filter(p=>!p.wireframe),has=role=>solids.some(p=>p.proxyRole===role);
  const frame=solids.filter(p=>!['bed','base','head'].includes(p.proxyRole)&&Math.max(...p.sizeM)>Math.min(w,h,z)*.3);
  const span=(axis,extent)=>{
    const lo=frame.length?Math.min(...frame.map(p=>p.centerM[axis]-p.sizeM[axis]/2)):-extent*.4;
    const hi=frame.length?Math.max(...frame.map(p=>p.centerM[axis]+p.sizeM[axis]/2)):extent*.4;
    const size=Math.min(extent,Math.max(hi-lo,extent*.72));
    return [clamp((lo+hi)/2,-(extent-size)/2,(extent-size)/2),size];
  };
  const [cx,bw]=span(0,w),[cz,bz]=span(2,z),foot=Math.min(w,z,h)*.035;
  const lower=frame.length?Math.min(...frame.map(p=>p.centerM[1]-p.sizeM[1]/2)):0;
  const baseTop=clamp(Math.max(lower,h*.12),foot*2,h*.2);
  const add=(role,size,center,color)=>{
    parts.push({sizeM:size,centerM:center,color,previewCue:true,proxyRole:role});
  };
  const fw=Math.min(bw*.09,.04),fd=Math.min(bz*.09,.04);
  for(const x of [-1,1])for(const q of [-1,1])
    add('contact-foot',[fw,foot,fd],[cx+x*(bw-fw)/2,foot/2,cz+q*(bz-fd)/2],'#253640');
  add('base-cue',[bw,baseTop-foot,bz],[cx,(baseTop+foot)/2,cz],'#536877');
  if(!has('bed')){
    const bh=Math.min(h*.016,.008),by=Math.max(baseTop+bh*2,h*(style==='inverted'?.75:.27));
    const zw=bz*.68,xw=bw*.68,bzCenter=clamp(cz+(style==='moving-bed'?bz*.1:0),-(z-zw)/2,(z-zw)/2);
    add('bed-cue',[xw,bh,zw],[cx,by,bzCenter],'#c5d8df');
    const rise=by-bh/2-baseTop,thick=Math.min(bw,bz)*.045;
    for(const side of [-1,1])add('bed-support-cue',[thick,rise,thick],
      [cx+side*xw*.35,baseTop+rise/2,bzCenter-zw*.3],'#718794');
  }
  const gantries=solids.filter(p=>p.proxyRole==='gantry'),existing=gantries.sort((a,b)=>b.centerM[1]-a.centerM[1])[0];
  const gy=existing?.centerM[1]??h*(style==='inverted'?.3:.72),gz=existing?.centerM[2]??cz;
  if(!has('gantry'))add('gantry-cue',[bw*.78,h*.035,bz*.07],[cx,gy,gz],'#367b85');
  if(!has('head')){
    const hh=h*.075,hw=bw*.12,hd=bz*.14;
    add('head-cue',[hw,hh,hd],[clamp(existing?.centerM[0]??cx,-(w-hw)/2,(w-hw)/2),
      clamp(gy-hh/2,hh/2,h-hh/2),clamp(gz+bz*.035,-(z-hd)/2,(z-hd)/2)],'#2d9b9b');
  }
  return {style,parts,simplePreview:true};
}

export function createLayoutRenderer({container,catalog,t=key=>key,onSelect=()=>{},onMove=()=>{},constrainMove=({x,z})=>({x,z}),onRotate=()=>{},constrainRotate=({yawDeg})=>({yawDeg}),onPlacementMove=()=>null,onPlacementCommit=()=>{},onError=()=>{},onViewChange=()=>{}}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.85;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',t('sceneLabel'));canvas.setAttribute('data-layout-i18n-aria-label','layout.sceneLabel');container.append(canvas);
  const measurementsCanvas=document.createElement('canvas');measurementsCanvas.className='layout-plan-measurements';measurementsCanvas.setAttribute('aria-hidden','true');measurementsCanvas.hidden=true;container.append(measurementsCanvas);
  const unitLabels=document.createElement('div');unitLabels.className='layout-unit-labels';container.append(unitLabels);
  const unitMarkers=new Map();
  const objectTools=document.createElement('div');objectTools.className='layout-object-tools';objectTools.hidden=true;objectTools.setAttribute('role','group');objectTools.setAttribute('data-layout-i18n-aria-label','layout.rotationControls');container.append(objectTools);
  const selectedSummary=document.createElement('div');selectedSummary.className='layout-selected-summary';
  const selectedName=document.createElement('strong'),selectedSize=document.createElement('span');selectedSummary.append(selectedName,selectedSize);objectTools.append(selectedSummary);
  const toolListeners=[];
  const listen=(element,type,handler)=>{element.addEventListener(type,handler);toolListeners.push([element,type,handler]);};
  function rotateButton(name,path,attribute='data-layout-rotation'){
    const b=document.createElement('button');b.type='button';b.setAttribute(attribute,name);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',path);svg.append(p);b.append(svg);objectTools.append(b);return b;
  }
  const rotateLeft=rotateButton('left','M3 10V4m0 0h6M3 4l4 4a8 8 0 1 1-1 9');
  const rotateHandle=rotateButton('handle','M4 8a8 8 0 0 1 14-2l3 3m0 0V3m0 6h-6M20 16a8 8 0 0 1-14 2l-3-3m0 0v6m0-6h6');rotateHandle.className='layout-rotation-handle';
  const rotationValue=document.createElement('output');rotationValue.setAttribute('aria-hidden','true');rotateHandle.append(rotationValue);
  const rotateRight=rotateButton('right','M21 10V4m0 0h-6m6 0-4 4a8 8 0 1 0 1 9');
  const focusButton=rotateButton('focus-selected','M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M9 12h6m-3-3v6','data-layout-action');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9edef');
  const planCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);planCamera.up.set(0,0,-1);
  const planControls=new OrbitControls(planCamera,canvas);planControls.enabled=false;planControls.enableRotate=false;planControls.enableDamping=false;planControls.screenSpacePanning=true;planControls.minZoom=.05;planControls.maxZoom=10000;
  planControls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  const perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,10000);
  const perspectiveControls=new OrbitControls(perspectiveCamera,canvas);perspectiveControls.enableDamping=false;perspectiveControls.maxPolarAngle=Math.PI*.495;perspectiveControls.minDistance=.15;perspectiveControls.maxDistance=10000;
  perspectiveControls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
  let camera=perspectiveCamera,controls=perspectiveControls;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=.7;
  const hemi=new THREE.HemisphereLight(0xffffff,0x879195,.85);scene.add(hemi);
  const keyLight=new THREE.DirectionalLight(0xffffff,1.4),fillLight=new THREE.DirectionalLight(0xffffff,.7);
  keyLight.position.set(3,6,4);fillLight.position.set(-4,3,-2);keyLight.castShadow=true;
  keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.bias=-.00015;keyLight.shadow.normalBias=.002;keyLight.shadow.radius=3;
  scene.add(keyLight,keyLight.target,fillLight);
  const content=new THREE.Group(),furnitureGroup=new THREE.Group(),printersGroup=new THREE.Group(),roomGroup=new THREE.Group(),contactGroup=new THREE.Group();
  content.add(roomGroup,furnitureGroup,printersGroup,contactGroup);scene.add(content);
  const planGroup=new THREE.Group(),planObjects=new Map();planGroup.visible=false;scene.add(planGroup);
  const grid=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8b9da8,transparent:true,opacity:.35,depthWrite:false}));grid.position.y=.0002;scene.add(grid);
  grid.userData.layoutGrid=true;
  const selectionBox=new THREE.Box3Helper(new THREE.Box3(),0xc35734);selectionBox.visible=false;scene.add(selectionBox);
  const planSelection=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xc35734,depthTest:false,depthWrite:false}));planSelection.visible=false;planSelection.renderOrder=30;scene.add(planSelection);
  const boxGeometry=new THREE.BoxGeometry(1,1,1),wireGeometry=new THREE.EdgesGeometry(boxGeometry),wireMaterial=new THREE.LineBasicMaterial({color:0x4d7186,transparent:true,opacity:.75}),palette=new Map(),objects=new Map(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const cylinderGeometry=new THREE.CylinderGeometry(.5,.5,1,24);
  const equipmentTubeGeometries=new Map();
  const equipmentMeshCache=createEquipmentMeshCache(THREE);
  const placementGroup=new THREE.Group(),placementBody=new THREE.Group();placementGroup.userData.layoutPlacementPreview=true;placementGroup.add(placementBody);scene.add(placementGroup);placementGroup.visible=false;
  const ghostMaterial=new THREE.MeshBasicMaterial({color:0x21a795,transparent:true,opacity:.4,depthWrite:false});
  const ghostLineMaterial=new THREE.LineBasicMaterial({color:0x21a795,transparent:true,opacity:.95,depthTest:false,depthWrite:false});
  const ghostOutline=new THREE.LineSegments(wireGeometry,ghostLineMaterial);placementBody.add(ghostOutline);
  const ghostFootprint=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x21a795,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));ghostFootprint.rotation.x=-Math.PI/2;ghostFootprint.position.y=.002;placementGroup.add(ghostFootprint);
  const placementGuides=new THREE.LineSegments(new THREE.BufferGeometry(),ghostLineMaterial);placementGuides.renderOrder=40;scene.add(placementGuides);placementGuides.visible=false;
  let placing=null,placementEvent=null,placementProposal=null,placementFrame=0,placementBounds=null,placementEquipmentVariant=null;
  const groupEntities=new Map();
  raycaster.params.Line.threshold=.01;
  let current,derived,selectedId=null,viewMode='perspective',planHalfHeight=2,perspectiveReady=false,planReady=false,drag=null,disposed=false,resourcesDisposed=false,exporting=false,exportAbort=null,frame=0,lastWidth=0,lastHeight=0,wallsVisible=true,measurementsVisible=false;
  const surfaces=createLayoutSurfaces({anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy?.()||1)});
  const planFloorMaterial=new THREE.MeshStandardMaterial({color:'#d9dfe1',roughness:.94,side:THREE.DoubleSide});
  const roomGeometries=new Set(),contactGeometries=new Set(),contacts=new Map(),contactPlaneGeometry=new THREE.PlaneGeometry(1,1);
  let roomKey=null,shadowRoomKey=null;
  const material=(color,opacity=1)=>{const key=opacity===1?color:`${color}:${opacity}`;if(!palette.has(key))palette.set(key,new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.02,opacity,transparent:opacity<1,depthWrite:opacity===1}));return palette.get(key);};
  function box(parent,size,position,color){const m=new THREE.Mesh(boxGeometry,material(color));m.scale.set(...size);m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  function previewPart(parent,p,override){
    const mat=override||material(p.color||'#465258',p.opacity??1);
    let part;
    if(p.shape==='mesh')part=new THREE.Mesh(equipmentMeshCache.get(p),mat);
    else if(p.wireframe){part=new THREE.LineSegments(wireGeometry,override?ghostLineMaterial:wireMaterial);part.scale.set(...p.sizeM);}
    else if(p.shape==='tube'){
      const key=JSON.stringify([p.pointsM,p.radiusM]);
      if(!equipmentTubeGeometries.has(key))equipmentTubeGeometries.set(key,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.pointsM.map(v=>new THREE.Vector3(...v))),Math.min(64,p.pointsM.length*3),p.radiusM,6,false));
      part=new THREE.Mesh(equipmentTubeGeometries.get(key),mat);
    }else if(p.shape==='cylinder'){
      part=new THREE.Mesh(cylinderGeometry,mat);
      if(p.axis==='x'){part.rotation.z=Math.PI/2;part.scale.set(p.sizeM[1],p.sizeM[0],p.sizeM[2]);}
      else if(p.axis==='z'){part.rotation.x=Math.PI/2;part.scale.set(p.sizeM[0],p.sizeM[2],p.sizeM[1]);}
      else part.scale.set(...p.sizeM);
    }else{part=new THREE.Mesh(boxGeometry,mat);part.scale.set(...p.sizeM);}
    if(p.shape!=='tube'&&p.shape!=='mesh')part.position.set(...p.centerM);part.castShadow=part.receiveShadow=!p.wireframe;part.userData.previewCue=!!p.previewCue;part.userData.proxyRole=p.proxyRole||'source-bounds';parent.add(part);return part;
  }
  function isPlan(){return viewMode==='top';}
  function getView(){return {mode:viewMode,projection:isPlan()?'orthographic-floorplan':'perspective-3d'};}
  function enableControls(){const manipulating=drag?.kind==='object'||drag?.kind==='rotate';perspectiveControls.enabled=!exporting&&!disposed&&!isPlan()&&!manipulating;planControls.enabled=!exporting&&!disposed&&isPlan()&&!manipulating;if(exporting||disposed){objectTools.hidden=true;unitLabels.hidden=true;}}
  function refreshWalls(forCamera=camera){
    const show=!isPlan()&&wallsVisible;
    if(show)forCamera.updateMatrixWorld(true);
    const near=show?[-1,1].flatMap(x=>[-1,1].map(y=>new THREE.Vector3(x,y,-1).unproject(forCamera))):[];
    for(const o of roomGroup.children)if(o.userData.wall){
      const n=o.userData.inward,p=o.userData.innerPoint;
      // The clear room ends at the inner face, not at the slab's centre.
      // A near-frustum corner crossing that face can expose the inside of an
      // opaque wall even before the camera eye crosses its centre plane.
      o.visible=show&&near.every(q=>n[0]*(q.x-p[0])+n[1]*(q.z-p[1])>=0);
    }
  }
  function planLabelLayout(g,forCamera=planCamera,pixelHeight=lastHeight){
    const unit=(forCamera.top-forCamera.bottom)/forCamera.zoom/Math.max(1,pixelHeight),points=g.userData.planPoints,xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    const width=Math.min(unit*192,(Math.max(...xs)-Math.min(...xs))*.9,(Math.max(...zs)-Math.min(...zs))*.9*8),height=width/8,screenWidth=width/unit;
    return {width,height,screenWidth,visible:!g.userData.planLabelSuppressed&&Number.isFinite(screenWidth)&&screenWidth>=48};
  }
  function updatePlanLabels(){for(const g of planObjects.values()){const layout=planLabelLayout(g);for(const o of g.children)if(o.userData.planLabel){o.scale.set(layout.width,layout.height,1);o.visible=layout.visible;}}}
  function syncContacts(){for(const [id,g]of contacts){const o=objects.get(id);if(o){g.position.copy(o.position);g.rotation.y=o.rotation.y;}}}
  function measurementOptions(forCamera,width,height){
    const selectedPolygonMm=selectionPolygon().map(([x,z])=>[x/MM,z/MM]);
    return {polygonMm:current.room.polygonMm,selectedPolygonMm,width,height,project:(x,z)=>{const p=new THREE.Vector3(x*MM,0,z*MM).project(forCamera);return [(p.x+1)*width/2,(1-p.y)*height/2];},formatLength:n=>`${Math.round(n*10)/10} ${t('common.mm')}`};
  }
  function updateMeasurements(){
    measurementsCanvas.hidden=!isPlan()||!measurementsVisible||exporting||!current;if(measurementsCanvas.hidden)return;
    const ratio=Math.min(devicePixelRatio||1,2),width=Math.max(1,Math.round(lastWidth*ratio)),height=Math.max(1,Math.round(lastHeight*ratio));
    if(measurementsCanvas.width!==width)measurementsCanvas.width=width;if(measurementsCanvas.height!==height)measurementsCanvas.height=height;
    const ctx=measurementsCanvas.getContext('2d');ctx.setTransform?.(ratio,0,0,ratio,0,0);ctx.clearRect?.(0,0,lastWidth,lastHeight);camera.updateMatrixWorld(true);drawPlanMeasurements(ctx,measurementOptions(camera,lastWidth,lastHeight));
  }
  function draw(){if(disposed||frame||exporting)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed||exporting)return;refreshWalls();syncContacts();if(isPlan())updatePlanLabels();updateObjectTools();updateUnitMarkers();renderer.render(scene,camera);updateMeasurements();});}
  const cameraChange=()=>{if(placing&&placementEvent)queuePlacement(placementEvent);draw();};
  perspectiveControls.addEventListener('change',cameraChange);planControls.addEventListener('change',cameraChange);
  function resize(){if(disposed||exporting)return;const r=container.getBoundingClientRect();if(!r.width||!r.height)return;lastWidth=r.width;lastHeight=r.height;renderer.setSize(r.width,r.height,false);perspectiveCamera.aspect=r.width/r.height;perspectiveCamera.updateProjectionMatrix();planCamera.left=-planHalfHeight*r.width/r.height;planCamera.right=-planCamera.left;planCamera.top=planHalfHeight;planCamera.bottom=-planHalfHeight;planCamera.updateProjectionMatrix();draw();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function resetGroup(g){for(const o of [...g.children])g.remove(o);}
  function record(e,g){g.userData.entityId=e.id;g.position.set(e.positionM.x,e.positionM.y,e.positionM.z);g.rotation.y=e.yawRad;objects.set(e.id,g);}
  function makeFurniture(e){
    const g=new THREE.Group();furnitureGroup.add(g);record(e,g);
    if(e.type==='popstation_mini'){
      const row=getLayoutEquipment('biqu_pop_station_mini_layout_reference',e.equipmentVariant||'empty');
      for(const p of row.proxy.parts)previewPart(g,p);
      g.userData.equipment=true;return g;
    }
    const w=e.widthMm*MM,d=e.depthMm*MM,h=e.heightMm*MM;
    for(const b of e.boards)box(g,[b.widthM,b.thicknessM,b.depthM],[0,b.localCenterYM,0],'#c7bda9');
    const leg=e.type==='desk'?.045:.035;
    const legHeight=e.type==='desk'?e.boards[0].localCenterYM-e.boards[0].thicknessM/2:h;
    for(const x of [-1,1])for(const z of [-1,1])box(g,[leg,legHeight,leg],[x*(w-leg)/2,legHeight/2,z*(d-leg)/2],'#535d61');
    return g;
  }
  function catalogMachine(id){const rows=Array.isArray(catalog)?catalog:catalog.machines;return rows.find(m=>(m.id||m.machineId)===id);}
  function footprint(e){
    const x=e.positionM.x,z=e.positionM.z;
    if(e.worldEnvelopeMm)return e.worldEnvelopeMm.map(([px,pz])=>[px*MM-x,pz*MM-z]);
    const row=e.machineId?catalogMachine(e.machineId):null,w=(e.widthMm??row?.widthMm??row?.dimensionsMm?.width)*MM,d=(e.depthMm??row?.depthMm??row?.dimensionsMm?.depth)*MM;
    const c=Math.cos(e.yawRad||0),s=Math.sin(e.yawRad||0);
    return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([px,pz])=>[c*px+s*pz,-s*px+c*pz]);
  }
  function planLabel(e){const row=e.machineId?catalogMachine(e.machineId):null;return typeof row?.label==='string'?row.label:e.type==='popstation_mini'?'BIQU PopStation Mini':e.id;}
  function selectedLabel(e){if(e.type==='group')return `${groupLabel(current,e.id)} · ${e.name||e.id}`;if(e.machineId||e.type==='popstation_mini')return planLabel(e);const same=(current.furniture||derived.furniture||[]).filter(f=>f.type===e.type);return t(e.type==='desk'?'layout.deskName':'layout.shelfName',{number:same.findIndex(f=>f.id===e.id)+1});}
  function makePlan(e,warning){
    const points=footprint(e),g=new THREE.Group();g.userData.entityId=e.id;g.userData.planProjection=true;g.userData.planPoints=points;g.userData.planLabel=planLabel(e);g.userData.planColor=warning?'#bf6d48':e.type==='printer'?'#6489a3':'#c2a379';
    g.userData.planLabelSuppressed=derived.printers.some(p=>p.parentId===e.id);
    // These are drawing layers, independent of the real support/board/printer heights.
    g.position.set(e.positionM.x,e.type==='printer'?.008:.004,e.positionM.z);planObjects.set(e.id,g);planGroup.add(g);
    const geometry=new THREE.ShapeGeometry(new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)))),fill=new THREE.MeshBasicMaterial({color:g.userData.planColor,side:THREE.DoubleSide,transparent:true,opacity:.8});
    const face=new THREE.Mesh(geometry,fill);face.rotation.x=-Math.PI/2;face.userData.planFootprint=true;g.add(face);
    const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,.0001,z))),new THREE.LineBasicMaterial({color:'#344c5a'}));g.add(outline);
    const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=64;const ctx=labelCanvas.getContext('2d');
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(0,0,512,64);ctx.fillStyle='#1f3542';ctx.font='32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(g.userData.planLabel,256,32,496);
    const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,toneMapped:false,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));label.visible=!g.userData.planLabelSuppressed;
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);label.position.set((Math.min(...xs)+Math.max(...xs))/2,.002,(Math.min(...zs)+Math.max(...zs))/2);label.rotation.x=-Math.PI/2;label.renderOrder=20;label.userData.planLabel=true;g.add(label);
  }
  function entityInfo(id){return groupEntities.get(id)||[...derived.furniture,...derived.printers].find(e=>e.id===id);}
  function selectionIds(id=selectedId){
    if(!id||!derived)return [];
    const group=groupEntities.get(id);
    return group?[...new Set(group.entityIds)]:[id,...derived.printers.filter(p=>p.parentId===id).map(p=>p.id)].filter(id=>objects.has(id));
  }
  function selectionBounds(id=selectedId){const bounds=new THREE.Box3();for(const key of selectionIds(id)){const node=objects.get(key);if(node)bounds.union(new THREE.Box3().setFromObject(node));}return bounds;}
  function clearUnitMarkers(){
    for(const {button,click}of unitMarkers.values())button.removeEventListener('click',click);
    unitMarkers.clear();unitLabels.replaceChildren();
  }
  function buildUnitMarkers(){
    const focused=[...unitMarkers].find(([,entry])=>document.activeElement===entry.button)?.[0];
    clearUnitMarkers();
    for(const [id,group]of groupEntities){
      const button=document.createElement('button'),label=groupLabel(current,id);button.type='button';button.className='layout-unit-marker';
      button.dataset.layoutUnitId=id;button.textContent=label;button.title=`${label} · ${group.name}`;button.setAttribute('aria-label',button.title);
      const click=()=>{if(!disposed&&!exporting&&!placing&&!drag){onSelect(id);if(!disposed)canvas.focus?.({preventScroll:true});}};button.addEventListener('click',click);unitLabels.append(button);
      unitMarkers.set(id,{button,click,label,ids:selectionIds(id),bounds:selectionBounds(id)});
    }
    if(focused)unitMarkers.get(focused)?.button.focus({preventScroll:true});
  }
  function unitMarkerPoint(id,entry,forCamera=camera,width=lastWidth,height=lastHeight,plan=isPlan()){
    const box=drag&&(drag.id===id||entry.ids.includes(drag.id))?selectionBounds(id):entry.bounds;
    if(box.isEmpty())return null;
    const center=box.getCenter(new THREE.Vector3()),p=new THREE.Vector3(plan?box.min.x:center.x,plan?0:box.max.y+.05,plan?box.min.z:center.z).project(forCamera);
    if(!Number.isFinite(p.x+p.y+p.z)||p.z< -1||p.z>1||Math.abs(p.x)>1.08||Math.abs(p.y)>1.08)return null;
    const halfWidth=Math.max(28,entry.button.offsetWidth||14+entry.label.length*9)/2+4;
    const markerHeight=Math.max(28,entry.button.offsetHeight||28)+4;
    return {x:Math.max(halfWidth,Math.min(width-halfWidth,(p.x+1)*width/2)),y:Math.max(markerHeight,Math.min(height-10,(1-p.y)*height/2-4))};
  }
  function updateUnitMarkers(){
    unitLabels.hidden=disposed||exporting;
    for(const [id,entry]of unitMarkers){
      const point=unitMarkerPoint(id,entry);entry.button.hidden=!point;entry.button.disabled=!!placing;
      entry.button.style.pointerEvents=placing?'none':'';entry.button.setAttribute('aria-pressed',String(id===selectedId));
      if(point){entry.button.style.left=`${point.x}px`;entry.button.style.top=`${point.y}px`;}
    }
  }
  function drawUnitMarkers(ctx,width,height,forCamera){
    const scale=Math.max(1,width/Math.max(1,lastWidth));
    for(const [id,entry]of unitMarkers){
      const point=unitMarkerPoint(id,entry,forCamera,width,height,true);if(!point)continue;
      const w=Math.max(28,12+entry.label.length*9)*scale,h=26*scale,x=Math.max(0,Math.min(width-w,point.x-w/2)),y=Math.max(0,Math.min(height-h,point.y-h));
      ctx.fillStyle='#f2f7f9';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#246f82';ctx.lineWidth=scale;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();ctx.stroke();
      ctx.fillStyle='#1f3542';ctx.font=`600 ${13*scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(entry.label,x+w/2,y+h/2,w-6*scale);
    }
  }
  function selectionPolygon(){
    const ids=groupEntities.has(selectedId)?selectionIds():objects.has(selectedId)?[selectedId]:[],points=[];
    for(const id of ids){const flat=planObjects.get(id);if(!flat)continue;flat.updateMatrixWorld(true);for(const [x,z]of flat.userData.planPoints){const p=new THREE.Vector3(x,0,z).applyMatrix4(flat.matrixWorld);points.push([p.x,p.z]);}}
    if(ids.length<=1||!points.length)return points;
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...zs),d=Math.max(...zs);
    return [[a,c],[b,c],[b,d],[a,d]];
  }
  function followers(id){return selectionIds(id).filter(key=>key!==id).map(snapshotPose);}
  function snapshotPose(id){const solid=objects.get(id),flat=planObjects.get(id);return {id,origin:solid.position.clone(),originYawRad:solid.rotation.y,planOrigin:flat?.position.clone(),planYawRad:flat?.rotation.y};}
  function updateSelection(){
    const selected=objects.get(selectedId),bounds=groupEntities.has(selectedId)?selectionBounds():selected?new THREE.Box3().setFromObject(selected):new THREE.Box3();selectionBox.visible=!isPlan()&&!bounds.isEmpty();selectionBox.box.copy(bounds);
    const polygon=selectionPolygon();planSelection.visible=isPlan()&&polygon.length>0;if(polygon.length)planSelection.geometry.setFromPoints(polygon.map(([x,z])=>new THREE.Vector3(x,.03,z)));
    updateObjectTools();
  }
  function updateObjectTools(){
    const g=objects.get(selectedId);objectTools.hidden=exporting||disposed||!!placing||!g;if(objectTools.hidden)return;
    camera.updateMatrixWorld(true);g.updateMatrixWorld(true);
    const box=selectionBounds();if(box.isEmpty()){objectTools.hidden=true;return;}
    const center=groupEntities.has(selectedId)?box.getCenter(new THREE.Vector3()):g.position;
    const anchor=new THREE.Vector3(center.x,isPlan()?0:box.max.y+.08,center.z).project(camera);
    if(!Number.isFinite(anchor.x+anchor.y+anchor.z)||anchor.z< -1||anchor.z>1||Math.abs(anchor.x)>1.4||Math.abs(anchor.y)>1.4){objectTools.hidden=true;return;}
    const width=lastWidth||container.getBoundingClientRect().width,height=lastHeight||container.getBoundingClientRect().height;
    const half=Math.min(width/2,120);objectTools.style.left=`${Math.max(half,Math.min(width-half,(anchor.x+1)*width/2))}px`;
    let bottom=(1-anchor.y)*height/2-12;
    const polygon=selectionPolygon();
    if(isPlan()&&polygon.length){
      const pixels=polygon.map(([x,z])=>{const p=new THREE.Vector3(x,0,z).project(camera);return (1-p.y)*height/2;});
      const toolHeight=objectTools.offsetHeight||96;bottom=Math.min(...pixels)-36;
      if(bottom<toolHeight+8)bottom=Math.max(...pixels)+36+toolHeight;
    }
    objectTools.style.top=`${Math.max(Math.min(100,height),Math.min(height-12,bottom))}px`;
    const entity=entityInfo(selectedId),row=entity?.machineId?catalogMachine(entity.machineId):null,dimensions=row?.dimensionsMm;
    const mountLocked=entity?.type==='printer'&&derived.furniture.some(f=>f.id===entity.parentId&&f.type==='popstation_mini');
    for(const button of [rotateLeft,rotateRight,rotateHandle])button.disabled=!!mountLocked;
    if(entity){selectedName.textContent=selectedLabel(entity);selectedName.title=selectedName.textContent;selectedSize.textContent=[entity.widthMm??row?.widthMm??dimensions?.width,entity.depthMm??row?.depthMm??dimensions?.depth,entity.heightMm??row?.heightMm??dimensions?.height].map(n=>Math.round(n)).join(' × ')+` ${t('common.mm')}`;selectedSize.title=t('layout.dimensions');}
    objectTools.setAttribute('aria-label',t('layout.rotationControls'));objectTools.title=t('layout.rotationHint');
    for(const [button,key]of [[rotateLeft,'layout.rotateLeft'],[rotateRight,'layout.rotateRight'],[rotateHandle,'layout.rotateHandle'],[focusButton,'layout.focusSelected']]){button.setAttribute('aria-label',t(key));button.title=t(key);}
    const yaw=drag?.kind==='rotate'?drag.accepted.yawDeg:g.rotation.y*180/Math.PI;
    const angle=((yaw%360)+360)%360;rotationValue.textContent=`${Math.abs(angle-360)<.05||Math.abs(angle)<.05?0:Math.round(angle*10)/10}°`;
  }
  function presentView(){furnitureGroup.visible=!isPlan();printersGroup.visible=!isPlan();contactGroup.visible=!isPlan();planGroup.visible=isPlan();placementBody.visible=!isPlan();renderer.shadowMap.enabled=!isPlan();grid.material.opacity=isPlan()?.35:.12;for(const o of roomGroup.children)if(o.userData.roomOwned)o.material=isPlan()?planFloorMaterial:o.userData.finishMaterial;enableControls();refreshWalls();updateSelection();}
  function makePrinter(e){
    const g=new THREE.Group();printersGroup.add(g);record(e,g);
    const row=resolveLayoutEquipment(catalogMachine(e.machineId),e.equipmentVariant);if(!row)throw Error('Unknown layout printer');
    // Catalog proxy parts already use a normalized contact plane. The scene
    // position may include a native base offset needed only by other recipes.
    g.position.y=Number.isFinite(e.supportYM)?e.supportYM:e.positionM.y-(row.baseOffsetMm||0)*MM;
    const preview=printerPreviewParts(row);g.userData.simplePreview=true;g.userData.previewStyle=preview.style;
    for(const p of preview.parts){
      let part;
      if(p.wireframe){part=new THREE.LineSegments(wireGeometry,wireMaterial);part.scale.set(...p.sizeM);part.position.set(...p.centerM);g.add(part);}
      else {const role=p.proxyRole||'',color=row.proxy?.appendGenericPrinterCues===false?p.color:role.includes('head')?'#36818b':role.includes('bed')&&!role.includes('support')?'#b7bfbb':role.includes('gantry')?'#647981':role==='contact-foot'?'#343d41':role.includes('base')?'#59666d':p.color||'#465258';part=previewPart(g,{...p,color});}
      part.userData.previewCue=!!p.previewCue;part.userData.proxyRole=p.proxyRole||'source-bounds';
    }
    return g;
  }
  // Soft envelope occlusion only: no native-footprint or CAD shadow claim. It
  // lives outside the proxy group so hiding proxies for streamed export keeps
  // the same cheap contact cues without retaining any full printer geometry.
  function makeContact(e){
    const object=objects.get(e.id),g=new THREE.Group(),yaw=e.yawRad||0,c=Math.cos(yaw),s=Math.sin(yaw);
    const points=footprint(e).map(([x,z])=>[c*x-s*z,s*x+c*z]);
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),minZ=Math.min(...zs),w=Math.max(...xs)-minX,d=Math.max(...zs)-minZ;
    if(!(w>0&&d>0))return;
    const geometry=new THREE.ShapeGeometry(new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)))),uv=geometry.attributes.uv,p=geometry.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)-minX)/w,(-p.getY(i)-minZ)/d);
    contactGeometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,surfaces.occlusion(e.type==='printer'?'printer':'furniture'));
    mesh.rotation.x=-Math.PI/2;mesh.position.y=.0006;mesh.renderOrder=2;g.add(mesh);
    if(e.type!=='printer'&&e.type!=='popstation_mini'){
      const leg=e.type==='desk'?.045:.035;
      for(const x of [-1,1])for(const z of [-1,1]){
        const foot=new THREE.Mesh(contactPlaneGeometry,surfaces.occlusion('foot'));
        foot.rotation.x=-Math.PI/2;foot.scale.set(leg*1.5,leg*1.5,1);
        foot.position.set(x*(w-leg*1.5)/2,.0008,z*(d-leg*1.5)/2);foot.renderOrder=3;g.add(foot);
      }
    }
    g.userData.contactEntityId=e.id;g.userData.contactScope='envelope-occlusion';
    g.position.copy(object.position);g.rotation.y=object.rotation.y;contacts.set(e.id,g);contactGroup.add(g);
  }
  function clearContacts(){for(const geometry of contactGeometries)geometry.dispose();contactGeometries.clear();contacts.clear();resetGroup(contactGroup);}
  function clearRoom(){for(const geometry of roomGeometries)geometry.dispose();roomGeometries.clear();resetGroup(roomGroup);}
  function fitFurnitureShadow(roomState){
    const key=JSON.stringify([roomState.polygonMm,roomState.wallHeightMm]);if(key===shadowRoomKey)return;shadowRoomKey=key;
    const xs=roomState.polygonMm.map(p=>p[0]*MM),zs=roomState.polygonMm.map(p=>p[1]*MM);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),height=roomState.wallHeightMm*MM;
    const span=Math.max(maxX-minX,maxZ-minZ,height,1),pad=.15+span*.04;
    keyLight.target.position.set((minX+maxX)/2,0,(minZ+maxZ)/2);keyLight.position.copy(keyLight.target.position).add(new THREE.Vector3(span*.6,span*1.2,span*.8));
    keyLight.updateMatrixWorld(true);keyLight.target.updateMatrixWorld(true);keyLight.shadow.updateMatrices(keyLight);
    const camera=keyLight.shadow.camera,bounds=new THREE.Box3();
    for(const x of [minX,maxX])for(const y of [-.003,height])for(const z of [minZ,maxZ])bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    camera.left=bounds.min.x-pad;camera.right=bounds.max.x+pad;camera.bottom=bounds.min.y-pad;camera.top=bounds.max.y+pad;
    camera.near=Math.max(.01,-bounds.max.z-pad);camera.far=Math.max(camera.near+.1,-bounds.min.z+pad);camera.updateProjectionMatrix();
    keyLight.shadow.needsUpdate=true;
  }
  function makeRoom(roomState){
    const appearance=resolveSurfaceAppearance(roomState.appearance),key=JSON.stringify([roomState.polygonMm,roomState.wallHeightMm,appearance]);
    if(key===roomKey)return;roomKey=key;clearRoom();fitFurnitureShadow(roomState);const polygon=roomState.polygonMm;
    const lines=[],xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),step=Math.max(100,Math.ceil(Math.max(maxX-minX,maxZ-minZ)/10000)*100);
    for(const axis of [0,1]){
      const min=axis===0?minX:minZ,max=axis===0?maxX:maxZ;
      for(let v=Math.ceil(min/step)*step;v<max;v+=step){
        const cuts=[];
        for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if((a[axis]<=v&&b[axis]>v)||(b[axis]<=v&&a[axis]>v))cuts.push(a[1-axis]+(b[1-axis]-a[1-axis])*(v-a[axis])/(b[axis]-a[axis]));}
        cuts.sort((a,b)=>a-b);for(let i=1;i<cuts.length;i+=2)if(axis===0)lines.push(v*MM,0,cuts[i-1]*MM,v*MM,0,cuts[i]*MM);else lines.push(cuts[i-1]*MM,0,v*MM,cuts[i]*MM,0,v*MM);
      }
    }
    grid.geometry.dispose();grid.geometry=new THREE.BufferGeometry();grid.geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
    const shape=new THREE.Shape(polygon.map(([x,z])=>new THREE.Vector2(x*MM,-z*MM)));
    const geometry=new THREE.ShapeGeometry(shape);roomGeometries.add(geometry);const floor=new THREE.Mesh(geometry,surfaces.finish(appearance.floor));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.003;floor.receiveShadow=true;floor.userData.roomOwned=true;floor.userData.finishMaterial=floor.material;roomGroup.add(floor);
    const height=roomState.wallHeightMm*MM,area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(area);
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=(b[0]-a[0])*MM,dz=(b[1]-a[1])*MM,len=Math.hypot(dx,dz);
      const inward=[-dz*sign,dx*sign],wallGeometry=wallSurfaceGeometry(len,height,.05),wall=new THREE.Mesh(wallGeometry,surfaces.finish(appearance.wall));roomGeometries.add(wallGeometry);
      wall.scale.set(len,height,.05);wall.position.set((a[0]+b[0])*MM/2-inward[0]/len*.025,height/2,(a[1]+b[1])*MM/2-inward[1]/len*.025);roomGroup.add(wall);
      wall.rotation.y=-Math.atan2(dz,dx);wall.visible=wallsVisible;wall.userData.wall=true;wall.userData.inward=inward;
      wall.userData.innerPoint=[(a[0]+b[0])*MM/2,(a[1]+b[1])*MM/2];
      wall.receiveShadow=true;wall.castShadow=false;
      // A shallow painted trim follows its wall's cutaway mask. Almost all of
      // its thickness stays inside the existing wall, preserving usable space.
      const trimHeight=Math.min(.075,height*.2),trim=new THREE.Mesh(boxGeometry,surfaces.trim());
      trim.scale.set(1,trimHeight/height,.012/.05);trim.position.set(0,-.5+trimHeight/(2*height),sign*(.5-.006/.05+.0002/.05));trim.receiveShadow=true;trim.userData.baseboard=true;wall.add(trim);
    }
  }
  function setState(state,id,issues=[]){
    if(exporting)throw Error('Layout is rendering');
    // Selection callbacks can synchronously echo the same state during a gesture.
    // Keep the transient physical transforms and the original rollback snapshot.
    if(drag&&groupEntities.has(drag.id)&&state===current&&id===selectedId){updateSelection();draw();return;}
    if(drag&&(state!==current||id!==selectedId))cancel();
    current=state;selectedId=id;derived=deriveScene(state,catalog);
    clearContacts();resetGroup(furnitureGroup);resetGroup(printersGroup);objects.clear();groupEntities.clear();makeRoom(state.room);
    for(const e of derived.furniture)makeFurniture(e);for(const e of derived.printers)makePrinter(e);
    for(const e of [...derived.furniture,...derived.printers])makeContact(e);
    // Detached anchors carry only the pivot. They never enter the scene, plan,
    // contacts, raycast targets or streamed-model/export inventories.
    for(const record of state.groups||[]){const e=groupInfo(state,record.id,catalog);if(!e)continue;groupEntities.set(e.id,e);const anchor=new THREE.Object3D();anchor.position.set(e.xMm*MM,0,e.zMm*MM);anchor.rotation.y=e.yawDeg*Math.PI/180;objects.set(e.id,anchor);}
    buildUnitMarkers();
    disposeTree(planGroup);resetGroup(planGroup);planObjects.clear();
    const warned=new Set(issues.flatMap(i=>i.entityIds||[i.entityId||i.id]).filter(Boolean));
    for(const [entityId,g]of objects){g.userData.warning=warned.has(entityId);}
    for(const e of [...derived.furniture,...derived.printers])makePlan(e,warned.has(e.id));
    presentView();
    scene.updateMatrixWorld(true);draw();
  }
  function view(mode='perspective'){
    if(exporting||disposed||!current)return;
    cancel();const fit=mode==='fit';viewMode=fit?viewMode:mode==='top'?'top':mode==='front'?'front':'perspective';
    camera=isPlan()?planCamera:perspectiveCamera;controls=isPlan()?planControls:perspectiveControls;
    const refit=fit||(isPlan()?!planReady:!perspectiveReady||mode==='front');
    if(isPlan()&&refit){
      const points=[...current.room.polygonMm.map(([x,z])=>[x*MM,z*MM]),...[...planObjects.values()].flatMap(g=>g.userData.planPoints.map(([x,z])=>[x+g.position.x,z+g.position.z]))];
      const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),aspect=lastWidth/Math.max(1,lastHeight);
      planHalfHeight=Math.max(maxZ-minZ,(maxX-minX)/aspect,.3)*.55;planCamera.zoom=1;controls.target.set((minX+maxX)/2,0,(minZ+maxZ)/2);planCamera.position.set(controls.target.x,10,controls.target.z);planCamera.lookAt(controls.target);planReady=true;resize();
    }else if(!isPlan()&&refit){
    const bounds=new THREE.Box3().setFromObject(content),center=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty())center.set(0,0,0);
    const size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.z,size.y,1),distance=span*1.45;
    controls.target.copy(center);controls.target.y=Math.min(center.y,.8);
    if(viewMode==='front')camera.position.copy(controls.target).add(new THREE.Vector3(0,distance*.25,distance*1.1));
    else camera.position.copy(controls.target).add(new THREE.Vector3(distance*.72,distance*.72,distance));
    camera.lookAt(controls.target);perspectiveReady=true;
    }
    if(refit)controls.update();camera.updateMatrixWorld(true);presentView();draw();onViewChange(getView());return getView();
  }
  // Camera-only framing: never changes the selected object's pose or history.
  function focusSelected(){
    if(disposed||exporting||drag||!current||!(isPlan()?planReady:perspectiveReady))return false;
    const g=objects.get(selectedId);if(!g)return false;
    scene.updateMatrixWorld(true);
    const ids=selectionIds(),bounds=new THREE.Box3();
    for(const id of ids){
      const flat=planObjects.get(id),solid=objects.get(id);
      if(isPlan()&&flat){flat.updateMatrixWorld(true);for(const [x,z]of flat.userData.planPoints)bounds.expandByPoint(new THREE.Vector3(x,0,z).applyMatrix4(flat.matrixWorld));}
      else if(!isPlan()&&solid)bounds.union(new THREE.Box3().setFromObject(solid));
    }
    if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))return false;
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    if(isPlan()){
      const aspect=lastWidth/Math.max(1,lastHeight);planHalfHeight=Math.max(size.z,size.x/aspect,.1)*.6;
      planCamera.zoom=1;controls.target.set(center.x,0,center.z);planCamera.position.set(center.x,10,center.z);resize();
    }else{
      const direction=camera.position.clone().sub(controls.target);if(direction.lengthSq()===0)direction.set(1,.8,1);
      const halfAngle=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(camera.aspect,1));
      const distance=THREE.MathUtils.clamp(size.length()/2/Math.sin(halfAngle)*1.15,controls.minDistance,controls.maxDistance);
      controls.target.copy(center);camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
    }
    camera.lookAt(controls.target);controls.update();camera.updateMatrixWorld(true);updateSelection();draw();return true;
  }
  function eventPoint(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function hit(event){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);eventPoint(event);const intersections=raycaster.intersectObjects(isPlan()?[...planObjects.values()]:[...furnitureGroup.children,...printersGroup.children],true);for(const h of intersections){if(h.object.userData.planLabel)continue;let o=h.object;while(o&&!o.userData.entityId)o=o.parent;if(o)return o.userData.entityId;}return null;}
  function planePoint(event,y){eventPoint(event);return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
  function placementPoint(event){
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);eventPoint(event);
    let best=null;
    if(placing?.kind==='printer')for(const e of derived.furniture)for(const board of e.boards){
      const y=isPlan()?0:board.topYM,p=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());if(!p)continue;
      const dx=p.x-e.positionM.x,dz=p.z-e.positionM.z,c=Math.cos(e.yawRad),s=Math.sin(e.yawRad),x=c*dx-s*dz,z=s*dx+c*dz;
      if(Math.abs(x)>e.widthM/2||Math.abs(z)>e.depthM/2)continue;
      const distance=raycaster.ray.origin.distanceToSquared(p),preferred=placing.parentId===e.id&&placing.surfaceId===board.id;
      if(!best||distance<best.distance-1e-10||isPlan()&&preferred)best={point:p,parentId:e.id,surfaceId:board.id,distance,preferred};
    }
    if(best)return best;
    const p=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    return p?{point:p,parentId:null,surfaceId:'floor'}:null;
  }
  function updatePlacement(event=placementEvent){
    if(!placing||!event||disposed||exporting)return null;
    const target=placementPoint(event);if(!target){placementGroup.visible=placementGuides.visible=false;placementProposal=null;draw();return null;}
    let proposal;try{proposal=onPlacementMove({xMm:target.point.x/MM,zMm:target.point.z/MM,parentId:target.parentId,surfaceId:target.surfaceId,altKey:!!event.altKey});}catch(error){onError(error);return null;}
    if(!proposal?.world||!proposal.sizeMm||!Object.values(proposal.world).every(Number.isFinite)){placementGroup.visible=placementGuides.visible=false;placementProposal=null;draw();return null;}
    placementProposal=proposal;const {world:w,sizeMm:d}=proposal;
    if(placing.kind==='printer'&&placing.machineId==='snapmaker_u1_layout_reference'){
      const variant=derived.furniture.some(f=>f.id===target.parentId&&f.type==='popstation_mini')?'docked':'standalone';
      if(placementEquipmentVariant!==variant){
        for(const child of [...placementBody.children])if(child!==ghostOutline)placementBody.remove(child);
        for(const part of getLayoutEquipment(placing.machineId,variant).proxy.parts)previewPart(placementBody,part,ghostMaterial);
        placementEquipmentVariant=variant;
      }
    }
    placementGroup.position.set(w.xMm*MM,w.yMm*MM,w.zMm*MM);placementGroup.rotation.y=w.yawDeg*Math.PI/180;
    placementGroup.visible=true;placementBody.visible=!isPlan();
    const bounds=placementBounds||{minX:-d.width/2,maxX:d.width/2,minZ:-d.depth/2,maxZ:d.depth/2,minY:0,maxY:d.height};
    const cx=(bounds.minX+bounds.maxX)*MM/2,cz=(bounds.minZ+bounds.maxZ)*MM/2;
    ghostOutline.scale.set((bounds.maxX-bounds.minX)*MM,(bounds.maxY-bounds.minY)*MM,(bounds.maxZ-bounds.minZ)*MM);ghostOutline.position.set(cx,(bounds.minY+bounds.maxY)*MM/2,cz);
    ghostFootprint.scale.set((bounds.maxX-bounds.minX)*MM,(bounds.maxZ-bounds.minZ)*MM,1);ghostFootprint.position.set(cx,.002,cz);
    const color=proposal.valid?0x21a795:0xe16c56;ghostMaterial.color.setHex(color);ghostLineMaterial.color.setHex(color);ghostFootprint.material.color.setHex(color);
    const lines=[];if(proposal.valid)for(const g of proposal.guides||[]){if(g.axis==='x')lines.push(g.valueMm*MM,w.yMm*MM+.004,g.minMm*MM,g.valueMm*MM,w.yMm*MM+.004,g.maxMm*MM);else lines.push(g.minMm*MM,w.yMm*MM+.004,g.valueMm*MM,g.maxMm*MM,w.yMm*MM+.004,g.valueMm*MM);}
    placementGuides.geometry.dispose();placementGuides.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3));placementGuides.visible=lines.length>0;
    canvas.style.cursor=proposal.valid?'copy':'not-allowed';draw();return proposal;
  }
  function queuePlacement(event){
    placementEvent={clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};
    if(!placementFrame)placementFrame=requestAnimationFrame(()=>{placementFrame=0;updatePlacement();});
  }
  function setPlacement(value){
    if(exporting||disposed)return false;
    cancel();if(placementFrame){cancelAnimationFrame(placementFrame);placementFrame=0;}placing=value;placementProposal=null;placementBounds=null;placementEquipmentVariant=null;
    for(const child of [...placementBody.children])if(child!==ghostOutline)placementBody.remove(child);
    if(value){
      const dims=value.sizeMm||{width:1200,depth:600,height:750},add=(size,center)=>{const m=new THREE.Mesh(boxGeometry,ghostMaterial);m.scale.set(...size);m.position.set(...center);placementBody.add(m);};
      if(value.kind==='group'){
        try{
          // Template roots are group-local; attached printers are still support-
          // local. Reuse the numerical scene recipe exactly once, with no CAD.
          const template=value.template;
          const preview=deriveScene({...current,furniture:template.furniture,printers:template.printers,groups:[]},catalog);
          const all=[...preview.furniture,...preview.printers],points=all.flatMap(e=>e.worldEnvelopeMm);
          if(!points.length)throw Error('Empty group placement template');
          const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
          placementBounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),minY:0,maxY:Math.max(...all.map(e=>e.verticalRangeMm[1]))};
          const addPart=(parent,size,center,wire=false)=>{const part=wire?new THREE.LineSegments(wireGeometry,ghostLineMaterial):new THREE.Mesh(boxGeometry,ghostMaterial);part.scale.set(...size);part.position.set(...center);parent.add(part);};
          for(const e of all){
            const node=new THREE.Group();node.position.set(e.positionM.x,e.supportYM??e.positionM.y,e.positionM.z);node.rotation.y=e.yawRad;placementBody.add(node);
            if(e.type==='printer'){
              const row=resolveLayoutEquipment(catalogMachine(e.machineId),e.equipmentVariant);if(!row)throw Error('Unknown group placement printer');
              for(const part of printerPreviewParts(row).parts)previewPart(node,part,ghostMaterial);
            }else if(e.type==='popstation_mini'){
              for(const part of getLayoutEquipment('biqu_pop_station_mini_layout_reference',e.equipmentVariant||'empty').proxy.parts)previewPart(node,part,ghostMaterial);
            }else{
              for(const board of e.boards)addPart(node,[board.widthM,board.thicknessM,board.depthM],[0,board.localCenterYM,0]);
              const leg=e.type==='desk'?.045:.035;
              for(const x of [-1,1])for(const z of [-1,1])addPart(node,[leg,e.heightM,leg],[x*(e.widthM-leg)/2,e.heightM/2,z*(e.depthM-leg)/2]);
            }
          }
        }catch(error){for(const child of [...placementBody.children])if(child!==ghostOutline)placementBody.remove(child);placing=null;placementBounds=null;value=null;onError(error);}
      }else if(value.kind==='printer'){
        const row=catalogMachine(value.machineId);if(row)for(const part of printerPreviewParts(row).parts)if(!part.wireframe)previewPart(placementBody,part,ghostMaterial);
      }else if(value.kind==='popstation_mini'){
        for(const part of getLayoutEquipment('biqu_pop_station_mini_layout_reference','empty').proxy.parts)previewPart(placementBody,part,ghostMaterial);
      }else{
        const w=dims.width*MM,h=dims.height*MM,d=dims.depth*MM;
        const levels=value.kind==='shelf'?(value.copy?.levels?.map(l=>l.topMm*MM)||[.1,.65,1.2,h]):[h];
        for(const y of levels)add([w,.03,d],[0,y-.015,0]);
        for(const x of [-1,1])for(const z of [-1,1])add([.04,h,.04],[x*(w-.04)/2,h/2,z*(d-.04)/2]);
      }
    }
    container.dataset??={};container.dataset.placing=String(!!value);canvas.style.cursor=value?'crosshair':'grab';
    placementGroup.visible=placementGuides.visible=false;updateSelection();if(value)updatePlacement();else placementEvent=null;draw();return true;
  }
  function turnBy(delta){
    if(disposed||exporting||drag||!selectedId)return;
    const e=entityInfo(selectedId);if(!e)return;
    const before=current;try{onRotate({id:e.id,yawDeg:e.yawDeg+delta,deltaDeg:delta});}catch(error){onError(error);}finally{if(current===before&&!disposed)setState(current,selectedId);}
  }
  function rotationDown(event){
    if(disposed||exporting||event.button!==0||event.isPrimary===false||drag)return;
    event.stopImmediatePropagation();event.preventDefault();rotateHandle.focus({preventScroll:true});
    // A numeric blur may rebuild the scene; capture one current gesture origin.
    if(disposed||exporting||drag)return;
    const g=objects.get(selectedId),e=entityInfo(selectedId);if(!g||!e)return;
    const yawDeg=e.yawDeg;
    const originMm={x:e.xMm,z:e.zMm};
    drag={...snapshotPose(selectedId),kind:'rotate',pointerId:event.pointerId,captureTarget:rotateHandle,startX:event.clientX,startY:event.clientY,lastX:event.clientX,moved:false,originMm,originYawDeg:yawDeg,rawYawDeg:yawDeg,accepted:{yawDeg,...originMm},followers:followers(selectedId)};
    rotateHandle.setPointerCapture(event.pointerId);rotateHandle.dataset.dragging='true';delete objectTools.dataset.boundaryLimited;enableControls();onSelect(selectedId);
  }
  function rotationMove(event){
    if(drag?.kind!=='rotate'||drag.pointerId!==event.pointerId)return;
    event.stopImmediatePropagation();event.preventDefault();
    if(!Number.isFinite(event.clientX))return;
    const gesture=drag,dx=event.clientX-drag.lastX;drag.lastX=event.clientX;drag.rawYawDeg+=dx*(event.shiftKey ? .1 : .5);
    if(Math.abs(event.clientX-drag.startX)>3)drag.moved=true;if(!drag.moved)return;
    let accepted;try{accepted=constrainRotate({id:drag.id,yawDeg:drag.rawYawDeg},{previous:{...drag.accepted},origin:{yawDeg:drag.originYawDeg,...drag.originMm},snapDeg:event.shiftKey?1:15});}catch(error){onError(error);return;}
    if(drag!==gesture||disposed||accepted===false)return;
    if(!accepted||!Number.isFinite(accepted.yawDeg)||((accepted.x!==undefined||accepted.z!==undefined)&&(!Number.isFinite(accepted.x)||!Number.isFinite(accepted.z)))){onError(Object.assign(Error('Invalid constrained rotation'),{code:'INVALID_CONSTRAINED_ROTATION'}));return;}
    if(accepted.boundaryLimited&&accepted.pointerRemainderDeg!==undefined&&!Number.isFinite(accepted.pointerRemainderDeg)){onError(Object.assign(Error('Invalid rotation remainder'),{code:'INVALID_CONSTRAINED_ROTATION'}));return;}
    drag.accepted={yawDeg:accepted.yawDeg,x:accepted.x??drag.originMm.x,z:accepted.z??drag.originMm.z};
    if(accepted.boundaryLimited)drag.rawYawDeg=accepted.yawDeg+(accepted.pointerRemainderDeg||0);
    objectTools.dataset.boundaryLimited=String(!!accepted.boundaryLimited);
    const g=objects.get(drag.id);if(!g)return;const delta=(accepted.yawDeg-drag.originYawDeg)*Math.PI/180;
    g.position.x=drag.accepted.x*MM;g.position.z=drag.accepted.z*MM;
    g.rotation.y=drag.originYawRad+delta;const plan=planObjects.get(drag.id);if(plan){plan.rotation.y=drag.planYawRad+delta;plan.position.x=g.position.x;plan.position.z=g.position.z;}
    for(const follower of drag.followers){const child=objects.get(follower.id),flat=planObjects.get(follower.id);if(!child)continue;child.position.copy(follower.origin).sub(drag.origin).applyAxisAngle(new THREE.Vector3(0,1,0),delta).add(g.position);child.rotation.y=follower.originYawRad+delta;if(flat){flat.position.x=child.position.x;flat.position.z=child.position.z;flat.rotation.y=follower.planYawRad+delta;}}
    updateSelection();draw();
  }
  function down(event){
    if(disposed||exporting||event.button!==0||event.isPrimary===false)return;
    if(drag){event.stopImmediatePropagation();event.preventDefault();return;}
    if(placing){drag={kind:'placement',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);canvas.focus?.({preventScroll:true});event.stopImmediatePropagation();event.preventDefault();updatePlacement(event);return;}
    // Finish any inspector draft before hit testing the current scene.
    canvas.focus?.({preventScroll:true});
    if(disposed||exporting||drag)return;
    const physicalId=hit(event),id=physicalId&&!event.altKey?(groupingForEntity(current,physicalId)?.id||physicalId):physicalId;drag={id,kind:id?'object':'background',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
    if(id){
      const g=objects.get(id),planeY=isPlan()?0:g.position.y,point=planePoint(event,planeY);
      if(!point){drag=null;event.stopImmediatePropagation();return;}
      const entity=entityInfo(id);
      Object.assign(drag,snapshotPose(id));drag.originMm={x:entity.xMm??g.position.x/MM,z:entity.zMm??g.position.z/MM};drag.point=point.clone();drag.anchorMm={...drag.originMm};drag.anchorPoint=point.clone();drag.planeY=planeY;drag.accepted={...drag.originMm};
      drag.followers=followers(id);
      selectedId=id;updateSelection();canvas.setPointerCapture(event.pointerId);enableControls();canvas.style.cursor='grabbing';event.stopImmediatePropagation();event.preventDefault();onSelect(id);
    }
  }
  function move(event){
    if(placing&&!drag){queuePlacement(event);return;}
    if(!drag||drag.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;
    if(drag.kind==='placement'){event.stopImmediatePropagation();event.preventDefault();queuePlacement(event);return;}
    if(drag.kind!=='object')return;event.stopImmediatePropagation();event.preventDefault();if(!drag.moved)return;
    const p=planePoint(event,drag.planeY);if(!p)return;const g=objects.get(drag.id);if(!g)return;
    const proposal={id:drag.id,x:drag.anchorMm.x+(p.x-drag.anchorPoint.x)/MM,z:drag.anchorMm.z+(p.z-drag.anchorPoint.z)/MM};
    const gesture=drag,context={previous:{...drag.accepted},origin:{...drag.originMm}};
    let accepted;try{accepted=constrainMove(proposal,context);}catch(error){onError(error);return;}
    if(drag!==gesture||disposed)return;
    if(accepted===false)return;
    if(!accepted||!Number.isFinite(accepted.x)||!Number.isFinite(accepted.z)){onError(Object.assign(Error('Invalid constrained move'),{code:'INVALID_CONSTRAINED_MOVE'}));return;}
    const remainder=accepted.boundaryLimited?(accepted.pointerRemainder??{x:0,z:0}):null;
    if(remainder&&(!Number.isFinite(remainder.x)||!Number.isFinite(remainder.z))){onError(Object.assign(Error('Invalid pointer remainder'),{code:'INVALID_CONSTRAINED_MOVE'}));return;}
    drag.accepted={x:accepted.x,z:accepted.z};
    // Discard blocked displacement, retaining the unsnapped cursor remainder.
    // Small wall-parallel moves must accumulate just like free-space moves.
    if(remainder){
      drag.anchorMm={x:accepted.x+remainder.x,z:accepted.z+remainder.z};drag.anchorPoint=p.clone();
    }
    g.position.x=accepted.x*MM;g.position.z=accepted.z*MM;
    const syncPlan=id=>{const a=objects.get(id),b=planObjects.get(id);if(a&&b){b.position.x=a.position.x;b.position.z=a.position.z;}};syncPlan(drag.id);
    for(const follower of drag.followers||[]){const child=objects.get(follower.id);if(child){child.position.x=follower.origin.x+(g.position.x-drag.origin.x);child.position.z=follower.origin.z+(g.position.z-drag.origin.z);syncPlan(follower.id);}}
    updateSelection();draw();
  }
  function up(event){
    if(!drag||drag.pointerId!==event.pointerId)return;const d=drag;drag=null;
    if(d.kind==='placement'){
      event.stopImmediatePropagation();event.preventDefault();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      const proposal=updatePlacement(event);if(!d.moved&&proposal?.valid){onPlacementCommit(proposal,{repeat:!!event.shiftKey});if(placing)queuePlacement(event);}return;
    }else if(d.kind==='rotate'){
      event.stopImmediatePropagation();event.preventDefault();
      if(d.captureTarget.hasPointerCapture(event.pointerId))d.captureTarget.releasePointerCapture(event.pointerId);delete rotateHandle.dataset.dragging;delete objectTools.dataset.boundaryLimited;enableControls();
      const before=current;try{if(d.moved&&(d.accepted.yawDeg!==d.originYawDeg||d.accepted.x!==d.originMm.x||d.accepted.z!==d.originMm.z))onRotate({id:d.id,...d.accepted});}catch(error){onError(error);}finally{if(current===before&&!disposed)setState(current,selectedId);}
    }else if(d.kind==='object'){
      event.stopImmediatePropagation();event.preventDefault();
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);enableControls();canvas.style.cursor='grab';
      if(d.moved&&(d.accepted.x!==d.originMm.x||d.accepted.z!==d.originMm.z)){const before=current;try{onMove({id:d.id,...d.accepted});}catch(error){onError(error);}finally{if(current===before&&!disposed)setState(current,selectedId);}}
    }else if(!d.moved)onSelect(null);
  }
  function cancel(event){
    if(!drag||event?.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;
    const d=drag;drag=null;
    if(d.kind==='object'||d.kind==='rotate')for(const item of [d,...(d.followers||[])]){const a=objects.get(item.id),b=planObjects.get(item.id);if(a){a.position.copy(item.origin);a.rotation.y=item.originYawRad;}if(b&&item.planOrigin){b.position.copy(item.planOrigin);b.rotation.y=item.planYawRad;}}
    const target=d.captureTarget||canvas;if(target.hasPointerCapture(d.pointerId))target.releasePointerCapture(d.pointerId);delete rotateHandle.dataset.dragging;delete objectTools.dataset.boundaryLimited;enableControls();canvas.style.cursor='grab';updateSelection();draw();
  }
  // Capture phase chooses object manipulation before either OrbitControls listener.
  for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])canvas.addEventListener(type,handler,true);
  const eventWindow=canvas.ownerDocument?.defaultView;eventWindow?.addEventListener('blur',cancel);
  const keyCancel=event=>{if(event.key==='Escape'&&drag){event.preventDefault();cancel();}};eventWindow?.addEventListener('keydown',keyCancel);
  listen(focusButton,'click',()=>focusSelected());
  listen(canvas,'keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.key.toLowerCase()!=='f')return;if(focusSelected())event.preventDefault();});
  listen(rotateLeft,'click',()=>turnBy(-90));listen(rotateRight,'click',()=>turnBy(90));
  for(const button of [rotateLeft,rotateHandle,rotateRight])listen(button,'keydown',event=>{if(drag||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;const delta=event.key==='ArrowLeft'?-(event.shiftKey?1:15):event.key==='ArrowRight'?(event.shiftKey?1:15):event.key.toLowerCase()==='r'?(event.shiftKey?-90:90):0;if(delta){event.preventDefault();turnBy(delta);}});
  for(const [type,handler]of [['pointerdown',rotationDown],['pointermove',rotationMove],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])listen(rotateHandle,type,handler);
  function setTool(){enableControls();canvas.style.cursor=placing?'crosshair':'grab';return 'auto';}
  function setOptions({grid:showGrid=true,walls=wallsVisible,dark=false,measurements=measurementsVisible}={}){if(exporting||disposed)return;grid.visible=showGrid;wallsVisible=walls;measurementsVisible=measurements;for(const o of roomGroup.children)if(o.userData.wall)o.visible=walls;scene.background.set(dark?'#14222a':'#e9edef');draw();}

  async function exportPlanImage({width=1920,signal,onProgress=()=>{}}){
    cancel();const externalSignal=signal,controller=new AbortController(),forward=()=>controller.abort();exportAbort=controller;
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',forward,{once:true});signal=controller.signal;exporting=true;enableControls();
    const limit=Math.min(renderer.capabilities.maxTextureSize,2560),long=Math.max(320,Math.min(limit,Number.isFinite(width)?width:1920)),aspect=lastWidth/Math.max(1,lastHeight),w=Math.max(1,Math.round(aspect>=1?long:long*aspect)),h=Math.max(1,Math.round(aspect>=1?long/aspect:long));
    try{
      aborted(signal);const output=document.createElement('canvas');output.width=w;output.height=h;const ctx=output.getContext('2d'),exportCamera=planCamera.clone();
      const middle=(exportCamera.left+exportCamera.right)/2,halfWidth=(exportCamera.top-exportCamera.bottom)*w/h/2;exportCamera.left=middle-halfWidth;exportCamera.right=middle+halfWidth;exportCamera.updateProjectionMatrix();exportCamera.updateMatrixWorld(true);
      const project=(x,z)=>{const p=new THREE.Vector3(x,0,z).project(exportCamera);return [(p.x+1)*w/2,(1-p.y)*h/2];};
      const polygon=points=>{ctx.beginPath();points.forEach(([x,z],i)=>{const p=project(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.closePath();};
      ctx.fillStyle='#'+scene.background.getHexString();ctx.fillRect(0,0,w,h);polygon(current.room.polygonMm.map(([x,z])=>[x*MM,z*MM]));ctx.fillStyle='#d9dfe1';ctx.fill();ctx.strokeStyle='#667d8b';ctx.lineWidth=1.5;ctx.stroke();
      if(grid.visible){ctx.save();ctx.clip();ctx.strokeStyle='#a2afb7';ctx.lineWidth=.5;ctx.beginPath();const a=grid.geometry.getAttribute('position');for(let i=0;i<a.count;i+=2){ctx.moveTo(...project(a.getX(i),a.getZ(i)));ctx.lineTo(...project(a.getX(i+1),a.getZ(i+1)));}ctx.stroke();ctx.restore();}
      for(const g of planObjects.values()){
        polygon(g.userData.planPoints.map(([x,z])=>[x+g.position.x,z+g.position.z]));ctx.fillStyle=g.userData.planColor;ctx.globalAlpha=.8;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#344c5a';ctx.lineWidth=1;ctx.stroke();
        const label=g.children.find(o=>o.userData.planLabel),layout=planLabelLayout(g,exportCamera,h),p=project(g.position.x+label.position.x,g.position.z+label.position.z);
        if(layout.visible){ctx.font=`${layout.screenWidth/16}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#1f3542';ctx.fillText(g.userData.planLabel,...p,layout.screenWidth*496/512);}
      }
      if(measurementsVisible)drawPlanMeasurements(ctx,{...measurementOptions(exportCamera,w,h),pixelScale:Math.max(1,w/Math.max(1,lastWidth))});
      drawUnitMarkers(ctx,w,h,exportCamera);
      onProgress({phase:'rendering',index:derived.printers.length,total:derived.printers.length,ratio:1,mode:'floorplan'});
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));aborted(signal);if(!blob)throw Error('Image export failed');
      return {blob,width:w,height:h,machines:derived.printers.map(p=>p.machineId),projection:'orthographic-floorplan',camera:'current-camera',rendering:'flat-floorplan',modelDetail:'footprints'};
    }finally{exporting=false;exportAbort=null;externalSignal?.removeEventListener('abort',forward);enableControls();if(disposed)releaseResources();else{resize();draw();}}
  }
  async function exportImage({loadMachine,width=1920,signal,onProgress=()=>{}}={}){
    if(exporting||disposed||!current)throw Error('Layout is not ready');
    if(isPlan())return exportPlanImage({width,signal,onProgress});
    cancel();
    if(!renderer.extensions.has('EXT_color_buffer_float'))throw Object.assign(Error('HDR image output is unavailable'),{code:'RENDER_UNSUPPORTED'});
    const externalSignal=signal,controller=new AbortController(),forwardAbort=()=>controller.abort();exportAbort=controller;
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',forwardAbort,{once:true});signal=controller.signal;
    const snapshot=[...derived.printers,...derived.furniture.filter(e=>e.type==='popstation_mini').map(e=>({...e,machineId:'biqu_pop_station_mini_layout_reference'}))].map(p=>({...p,positionM:{...p.positionM}}));
    const streamedFurniture=[...furnitureGroup.children].filter(g=>g.userData.equipment),furnitureVisibility=streamedFurniture.map(g=>g.visible);
    const limit=Math.min(renderer.capabilities.maxTextureSize,2560),long=Math.max(320,Math.min(limit,width)),aspect=lastWidth/Math.max(1,lastHeight),w=Math.max(1,Math.round(aspect>=1?long:long*aspect)),h=Math.max(1,Math.round(aspect>=1?long/aspect:long));
    let target,outputTarget,outputGeometry,outputMaterial;const oldTarget=renderer.getRenderTarget(),oldAuto=renderer.autoClear,oldBackground=scene.background,oldShaderError=renderer.debug.onShaderError,transparentRoot=new THREE.Group(),previewVisible=placementGroup.visible,guidesVisible=placementGuides.visible;
    const opaqueScene=new THREE.Scene();opaqueScene.environment=scene.environment;opaqueScene.environmentIntensity=scene.environmentIntensity;
    // Only the initial room pass projects furniture shadows. Streamed native
    // models use ordinary lighting; no additional maps or CAD floor projection.
    for(const l of scene.children.filter(c=>c.isLight)){const copy=l.clone();copy.castShadow=false;opaqueScene.add(copy);if(copy.target)opaqueScene.add(copy.target);}
    let transparentBytes=0,active=null;
    exporting=true;renderer.debug.onShaderError=()=>{throw Object.assign(Error('Image shader compilation failed'),{code:'RENDER_SHADER_FAILED'});};if(frame){cancelAnimationFrame(frame);frame=0;}controls.enabled=false;selectionBox.visible=false;printersGroup.visible=false;for(const g of streamedFurniture)g.visible=false;placementGroup.visible=placementGuides.visible=false;
    const exportCamera=camera.clone();exportCamera.aspect=w/h;exportCamera.updateProjectionMatrix();
    try{
      aborted(signal);target=new THREE.WebGLRenderTarget(w,h,{samples:0,format:THREE.RGBAFormat,type:THREE.HalfFloatType});target.texture.colorSpace=THREE.LinearSRGBColorSpace;
      syncContacts();scene.updateMatrixWorld(true);refreshWalls(exportCamera);
      // Opaque room surfaces and approximate envelope contacts write the base
      // image once. Its depth buffer then correctly occludes streamed models.
      renderer.setRenderTarget(target);renderer.autoClear=true;renderer.render(scene,exportCamera);renderer.autoClear=false;
      for(let i=0;i<snapshot.length;i++){
        aborted(signal);const p=snapshot[i];onProgress({phase:'loading',index:i,total:snapshot.length,machineId:p.machineId,ratio:0});
        active=await loadMachine(p.machineId,{...(p.equipmentVariant?{equipmentVariant:p.equipmentVariant}:{}),signal,onProgress:detail=>onProgress({...detail,phase:'loading',index:i,total:snapshot.length,machineId:p.machineId,ratio:Number.isFinite(detail?.ratio)?detail.ratio:Number.isFinite(detail?.percent)?detail.percent/100:Number.isFinite(detail?.total)&&detail.total>0&&Number.isFinite(detail?.loaded)?detail.loaded/detail.total:0})});
        aborted(signal);const root=active.root;root.position.set(p.positionM.x,p.supportYM??p.positionM.y,p.positionM.z);root.rotation.y=p.yawRad;root.updateMatrixWorld(true);
        const saved=[];
        try{root.traverseVisible(o=>{
          if(!o.isMesh)return;const original=o.material,source=materials(o),transparent=source.some(m=>visibleMaterial(m)&&(m.transparent||m.transmission>0));
          if(!transparent)return;
          transparentBytes+=geometryBytes(o.geometry)+(o.instanceMatrix?.array.byteLength||0)+(o.instanceColor?.array.byteLength||0);
          if(transparentBytes>24*1024*1024)throw Object.assign(Error('Transparent model budget exceeded'),{code:'RENDER_TRANSPARENCY_BUDGET'});
          const geometry=o.geometry.clone(),clone=o.isInstancedMesh?new THREE.InstancedMesh(geometry,disposableMaterial,o.count):new THREE.Mesh(geometry,disposableMaterial),copies=[];
          if(o.isInstancedMesh){clone.instanceMatrix.copy(o.instanceMatrix);if(o.instanceColor)clone.instanceColor=o.instanceColor.clone();}
          clone.matrixAutoUpdate=false;clone.matrix.copy(o.matrixWorld);clone.frustumCulled=o.frustumCulled;transparentRoot.add(clone);
          for(const m of source){
            if(!visibleMaterial(m)||!(m.transparent||m.transmission>0)){copies.push(disposableMaterial);clone.material=Array.isArray(original)?copies:copies[0];continue;}
            const copy=m.clone(),textures=Object.entries(copy).filter(([,v])=>v?.isTexture);for(const [key]of textures)copy[key]=null;
            copies.push(copy);clone.material=Array.isArray(original)?copies:copies[0];
            for(const [key,value]of textures){
              const image=value.image;
              if(image&&image.width&&image.height){
                transparentBytes+=image.data?.byteLength?image.data.byteLength*2:image.width*image.height*8;
                if(!Number.isFinite(transparentBytes)||transparentBytes>24*1024*1024)throw Object.assign(Error('Transparent model budget exceeded'),{code:'RENDER_TRANSPARENCY_BUDGET'});
                const texture=value.clone();texture.source=new THREE.Source();copy[key]=texture;
                if(ArrayBuffer.isView(image.data))texture.image={...image,data:image.data.slice()};
                else{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);texture.image=c;}
                texture.needsUpdate=true;
              }else throw Object.assign(Error('Unsupported transparent texture source'),{code:'RENDER_TRANSPARENCY_BUDGET'});
            }
          }
          saved.push([o,original]);const opaque=source.map(m=>m?.transparent||m?.transmission>0?disposableMaterial:m);o.material=Array.isArray(original)?opaque:opaque[0];
        });
        opaqueScene.add(root);renderer.render(opaqueScene,exportCamera);opaqueScene.remove(root);
        }finally{opaqueScene.remove(root);for(const [o,original]of saved)o.material=original;}
        active.dispose();active=null;
        renderer.renderLists.dispose();onProgress({phase:'rendering',index:i+1,total:snapshot.length,machineId:p.machineId,ratio:1});await tick();
      }
      aborted(signal);opaqueScene.add(transparentRoot);renderer.render(opaqueScene,exportCamera);
      // Render targets hold linear light. Apply the same ACES and sRGB output
      // transform as the on-screen renderer once, after all streamed layers.
      outputTarget=new THREE.WebGLRenderTarget(w,h,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:false});outputTarget.texture.colorSpace=THREE.NoColorSpace;
      outputGeometry=new THREE.PlaneGeometry(2,2);
      outputMaterial=new THREE.ShaderMaterial({toneMapped:false,depthTest:false,depthWrite:false,uniforms:{map:{value:target.texture},toneMappingExposure:{value:renderer.toneMappingExposure}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:'uniform sampler2D map; varying vec2 vUv;\n#include <tonemapping_pars_fragment>\nvoid main(){vec4 color=texture2D(map,vUv);color.rgb=ACESFilmicToneMapping(color.rgb);gl_FragColor=sRGBTransferOETF(color);}'});
      const outputScene=new THREE.Scene();outputScene.add(new THREE.Mesh(outputGeometry,outputMaterial));renderer.setRenderTarget(outputTarget);renderer.autoClear=true;renderer.render(outputScene,new THREE.OrthographicCamera(-1,1,1,-1,0,1));
      const pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(outputTarget,0,0,w,h,pixels);
      const output=document.createElement('canvas');output.width=w;output.height=h;const context=output.getContext('2d'),image=context.createImageData(w,h),row=w*4;
      for(let y=0;y<h;y++)image.data.set(pixels.subarray((h-y-1)*row,(h-y)*row),y*row);context.putImageData(image,0,0);
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('Image export failed');aborted(signal);
      return {blob,width:w,height:h,machines:snapshot.map(p=>p.machineId),projection:'perspective-3d',camera:'current-camera',rendering:'streamed-browser-raster'};
    }finally{
      active?.dispose();disposeTree(transparentRoot);target?.dispose();outputTarget?.dispose();outputGeometry?.dispose();outputMaterial?.dispose();renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto;renderer.debug.onShaderError=oldShaderError;scene.background=oldBackground;printersGroup.visible=true;streamedFurniture.forEach((g,i)=>g.visible=furnitureVisibility[i]);placementGroup.visible=previewVisible;placementGuides.visible=guidesVisible;refreshWalls();
      exporting=false;exportAbort=null;externalSignal?.removeEventListener('abort',forwardAbort);presentView();if(disposed)releaseResources();else{resize();draw();}
    }
  }
  function releaseResources(){if(resourcesDisposed)return;resourcesDisposed=true;ghostMaterial.dispose();ghostLineMaterial.dispose();ghostFootprint.geometry.dispose();ghostFootprint.material.dispose();placementGuides.geometry.dispose();disposeTree(planGroup);planSelection.geometry.dispose();planSelection.material.dispose();clearRoom();clearContacts();surfaces.dispose();planFloorMaterial.dispose();contactPlaneGeometry.dispose();boxGeometry.dispose();cylinderGeometry.dispose();for(const g of equipmentTubeGeometries.values())g.dispose();equipmentTubeGeometries.clear();equipmentMeshCache.dispose();wireGeometry.dispose();wireMaterial.dispose();for(const m of palette.values())m.dispose();grid.geometry.dispose();grid.material.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();keyLight.shadow.dispose();environment.dispose();renderer.dispose();canvas.remove();}
  function dispose(){if(disposed)return;cancel();disposed=true;exportAbort?.abort();if(frame)cancelAnimationFrame(frame);if(placementFrame)cancelAnimationFrame(placementFrame);observer.disconnect();perspectiveControls.dispose();planControls.dispose();eventWindow?.removeEventListener('blur',cancel);eventWindow?.removeEventListener('keydown',keyCancel);for(const [element,type,handler]of toolListeners)element.removeEventListener(type,handler);clearUnitMarkers();unitLabels.remove();objectTools.remove();measurementsCanvas.remove();for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])canvas.removeEventListener(type,handler,true);if(!exporting)releaseResources();}
  resize();setTool();return {setState,setTool,setOptions,setPlacement,refreshPlacement:()=>updatePlacement(),view,getView,focusSelected,exportImage,dispose,canvas};
}

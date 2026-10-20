import * as THREE from '../viewer/vendor-r180/three.module.js';
import {OrbitControls} from '../viewer/vendor-r180/OrbitControls.js';
import {RoomEnvironment} from '../viewer/vendor-r180/RoomEnvironment.js';
import {deriveScene} from './layout-state.mjs?v=d5be89c5876cc3bfab5c';

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

export function createLayoutRenderer({container,catalog,t=key=>key,onSelect=()=>{},onMove=()=>{},constrainMove=({x,z})=>({x,z}),onError=()=>{},onViewChange=()=>{}}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',t('sceneLabel'));canvas.setAttribute('data-layout-i18n-aria-label','layout.sceneLabel');container.append(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9edef');
  const planCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);planCamera.up.set(0,0,-1);
  const planControls=new OrbitControls(planCamera,canvas);planControls.enabled=false;planControls.enableRotate=false;planControls.enableDamping=false;planControls.screenSpacePanning=true;planControls.minZoom=.05;planControls.maxZoom=10000;
  planControls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  const perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,10000);
  const perspectiveControls=new OrbitControls(perspectiveCamera,canvas);perspectiveControls.enableDamping=false;perspectiveControls.maxPolarAngle=Math.PI*.495;perspectiveControls.minDistance=.15;perspectiveControls.maxDistance=10000;
  let camera=perspectiveCamera,controls=perspectiveControls;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;
  const hemi=new THREE.HemisphereLight(0xffffff,0x718394,1.1);scene.add(hemi);
  for(const [position,intensity] of [[[3,6,4],2],[[-4,3,-2],1.1]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.set(...position);scene.add(l);}
  const content=new THREE.Group(),furnitureGroup=new THREE.Group(),printersGroup=new THREE.Group(),roomGroup=new THREE.Group();
  content.add(roomGroup,furnitureGroup,printersGroup);scene.add(content);
  const planGroup=new THREE.Group(),planObjects=new Map();planGroup.visible=false;scene.add(planGroup);
  const grid=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8b9da8,transparent:true,opacity:.35,depthWrite:false}));grid.position.y=.0002;scene.add(grid);
  const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xc35734);selectionBox.visible=false;scene.add(selectionBox);
  const planSelection=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xc35734,depthTest:false,depthWrite:false}));planSelection.visible=false;planSelection.renderOrder=30;scene.add(planSelection);
  const boxGeometry=new THREE.BoxGeometry(1,1,1),wireGeometry=new THREE.EdgesGeometry(boxGeometry),wireMaterial=new THREE.LineBasicMaterial({color:0x4d7186,transparent:true,opacity:.75}),palette=new Map(),objects=new Map(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  raycaster.params.Line.threshold=.01;
  let current,derived,selectedId=null,viewMode='perspective',planHalfHeight=2,perspectiveReady=false,planReady=false,drag=null,disposed=false,resourcesDisposed=false,exporting=false,exportAbort=null,frame=0,lastWidth=0,lastHeight=0,wallsVisible=true;
  const wallMaterial=new THREE.MeshStandardMaterial({color:'#a4b5c0',roughness:.9,transparent:true,opacity:.45,depthWrite:false});
  const material=color=>{if(!palette.has(color))palette.set(color,new THREE.MeshStandardMaterial({color,roughness:.77,metalness:.05}));return palette.get(color);};
  function box(parent,size,position,color){const m=new THREE.Mesh(boxGeometry,material(color));m.scale.set(...size);m.position.set(...position);parent.add(m);return m;}
  function isPlan(){return viewMode==='top';}
  function getView(){return {mode:viewMode,projection:isPlan()?'orthographic-floorplan':'perspective-3d'};}
  function enableControls(){perspectiveControls.enabled=!exporting&&!disposed&&!isPlan()&&drag?.kind!=='object';planControls.enabled=!exporting&&!disposed&&isPlan()&&drag?.kind!=='object';}
  function refreshWalls(forCamera=camera){for(const o of roomGroup.children)if(o.userData.wall){const n=o.userData.inward;o.visible=!isPlan()&&wallsVisible&&(n[0]*(forCamera.position.x-o.position.x)+n[1]*(forCamera.position.z-o.position.z)>=0);}}
  function planLabelLayout(g,forCamera=planCamera,pixelHeight=lastHeight){
    const unit=(forCamera.top-forCamera.bottom)/forCamera.zoom/Math.max(1,pixelHeight),points=g.userData.planPoints,xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    const width=Math.min(unit*192,(Math.max(...xs)-Math.min(...xs))*.9,(Math.max(...zs)-Math.min(...zs))*.9*8),height=width/8,screenWidth=width/unit;
    return {width,height,screenWidth,visible:!g.userData.planLabelSuppressed&&Number.isFinite(screenWidth)&&screenWidth>=48};
  }
  function updatePlanLabels(){for(const g of planObjects.values()){const layout=planLabelLayout(g);for(const o of g.children)if(o.userData.planLabel){o.scale.set(layout.width,layout.height,1);o.visible=layout.visible;}}}
  function draw(){if(disposed||frame||exporting)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed||exporting)return;refreshWalls();if(isPlan())updatePlanLabels();renderer.render(scene,camera);});}
  perspectiveControls.addEventListener('change',draw);planControls.addEventListener('change',draw);
  function resize(){if(disposed||exporting)return;const r=container.getBoundingClientRect();if(!r.width||!r.height)return;lastWidth=r.width;lastHeight=r.height;renderer.setSize(r.width,r.height,false);perspectiveCamera.aspect=r.width/r.height;perspectiveCamera.updateProjectionMatrix();planCamera.left=-planHalfHeight*r.width/r.height;planCamera.right=-planCamera.left;planCamera.top=planHalfHeight;planCamera.bottom=-planHalfHeight;planCamera.updateProjectionMatrix();draw();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function resetGroup(g){for(const o of [...g.children])g.remove(o);}
  function record(e,g){g.userData.entityId=e.id;g.position.set(e.positionM.x,e.positionM.y,e.positionM.z);g.rotation.y=e.yawRad;objects.set(e.id,g);}
  function makeFurniture(e){
    const g=new THREE.Group();furnitureGroup.add(g);record(e,g);
    const w=e.widthMm*MM,d=e.depthMm*MM,h=e.heightMm*MM;
    for(const b of e.boards)box(g,[b.widthM,b.thicknessM,b.depthM],[0,b.localCenterYM,0],'#c2a379');
    const leg=e.type==='desk'?.045:.035;
    for(const x of [-1,1])for(const z of [-1,1])box(g,[leg,h,leg],[x*(w-leg)/2,h/2,z*(d-leg)/2],'#495760');
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
  function planLabel(e){const row=e.machineId?catalogMachine(e.machineId):null;return typeof row?.label==='string'?row.label:e.id;}
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
  function updateSelection(){
    const selected=objects.get(selectedId),plan=planObjects.get(selectedId);selectionBox.visible=!isPlan()&&!!selected;if(selected)selectionBox.setFromObject(selected);
    planSelection.visible=isPlan()&&!!plan;if(plan){planSelection.geometry.setFromPoints(plan.userData.planPoints.map(([x,z])=>new THREE.Vector3(x,.003,z)));planSelection.position.copy(plan.position);}
  }
  function presentView(){furnitureGroup.visible=!isPlan();printersGroup.visible=!isPlan();planGroup.visible=isPlan();enableControls();refreshWalls();updateSelection();}
  function makePrinter(e){
    const g=new THREE.Group();printersGroup.add(g);record(e,g);
    const row=catalogMachine(e.machineId);if(!row)throw Error('Unknown layout printer');
    // Catalog proxy parts already use a normalized contact plane. The scene
    // position may include a native base offset needed only by other recipes.
    g.position.y=Number.isFinite(e.supportYM)?e.supportYM:e.positionM.y-(row.baseOffsetMm||0)*MM;
    const preview=printerPreviewParts(row);g.userData.simplePreview=true;g.userData.previewStyle=preview.style;
    for(const p of preview.parts){
      let part;
      if(p.wireframe){part=new THREE.LineSegments(wireGeometry,wireMaterial);part.scale.set(...p.sizeM);part.position.set(...p.centerM);g.add(part);}
      else part=box(g,p.sizeM,p.centerM,p.color||'#343e47');
      part.userData.previewCue=!!p.previewCue;part.userData.proxyRole=p.proxyRole||'source-bounds';
    }
    return g;
  }
  function makeRoom(roomState){
    resetGroup(roomGroup);const polygon=roomState.polygonMm;
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
    const geometry=new THREE.ShapeGeometry(shape);const floor=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#d9dfe1',roughness:.94,side:THREE.DoubleSide}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.003;floor.userData.roomOwned=true;roomGroup.add(floor);
    const height=roomState.wallHeightMm*MM,area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(area);
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=(b[0]-a[0])*MM,dz=(b[1]-a[1])*MM,len=Math.hypot(dx,dz);
      const inward=[-dz*sign,dx*sign],wall=box(roomGroup,[len,height,.05],[(a[0]+b[0])*MM/2-inward[0]/len*.025,height/2,(a[1]+b[1])*MM/2-inward[1]/len*.025],'#c2cbd1');wall.material=wallMaterial;wall.rotation.y=-Math.atan2(dz,dx);wall.visible=wallsVisible;wall.userData.wall=true;wall.userData.inward=inward;
    }
  }
  function setState(state,id,issues=[]){
    if(exporting)throw Error('Layout is rendering');
    if(drag&&state!==current)cancel();
    current=state;selectedId=id;derived=deriveScene(state,catalog);
    for(const o of roomGroup.children)if(o.userData.roomOwned){o.geometry.dispose();o.material.dispose();}
    resetGroup(furnitureGroup);resetGroup(printersGroup);objects.clear();makeRoom(state.room);
    for(const e of derived.furniture)makeFurniture(e);for(const e of derived.printers)makePrinter(e);
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
  function eventPoint(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function hit(event){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);eventPoint(event);const intersections=raycaster.intersectObjects(isPlan()?[...planObjects.values()]:[...furnitureGroup.children,...printersGroup.children],true);for(const h of intersections){if(h.object.userData.planLabel)continue;let o=h.object;while(o&&!o.userData.entityId)o=o.parent;if(o)return o.userData.entityId;}return null;}
  function planePoint(event,y){eventPoint(event);return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
  function down(event){
    if(disposed||exporting||event.button!==0||event.isPrimary===false)return;
    if(drag){event.stopImmediatePropagation();event.preventDefault();return;}
    const id=hit(event);drag={id,kind:id?'object':'background',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
    if(id){
      const g=objects.get(id),planeY=isPlan()?0:g.position.y,point=planePoint(event,planeY);
      if(!point){drag=null;event.stopImmediatePropagation();return;}
      const entity=[...derived.furniture,...derived.printers].find(e=>e.id===id);
      drag.origin=g.position.clone();drag.originMm={x:entity.xMm??g.position.x/MM,z:entity.zMm??g.position.z/MM};drag.point=point.clone();drag.anchorMm={...drag.originMm};drag.anchorPoint=point.clone();drag.planeY=planeY;drag.accepted={...drag.originMm};
      drag.followers=(current.printers||[]).filter(p=>p.attachment.parentId===id).map(p=>({id:p.id,origin:objects.get(p.id).position.clone()}));
      selectedId=id;updateSelection();canvas.setPointerCapture(event.pointerId);enableControls();canvas.style.cursor='grabbing';event.stopImmediatePropagation();event.preventDefault();onSelect(id);
    }
  }
  function move(event){
    if(!drag||drag.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;
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
    for(const follower of drag.followers||[]){const child=objects.get(follower.id);if(child){child.position.x=follower.origin.x+g.position.x-drag.origin.x;child.position.z=follower.origin.z+g.position.z-drag.origin.z;syncPlan(follower.id);}}
    updateSelection();draw();
  }
  function up(event){
    if(!drag||drag.pointerId!==event.pointerId)return;const d=drag;drag=null;
    if(d.kind==='object'){
      event.stopImmediatePropagation();event.preventDefault();
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);enableControls();canvas.style.cursor='grab';
      if(d.moved&&(d.accepted.x!==d.originMm.x||d.accepted.z!==d.originMm.z)){const before=current;try{onMove({id:d.id,...d.accepted});}catch(error){onError(error);}finally{if(current===before&&!disposed)setState(current,selectedId);}}
    }else if(!d.moved)onSelect(null);
  }
  function cancel(event){
    if(!drag||event?.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;
    const d=drag;drag=null;
    if(d.kind==='object')for(const item of [{id:d.id,origin:d.origin},...(d.followers||[])]){const a=objects.get(item.id),b=planObjects.get(item.id);if(a)a.position.copy(item.origin);if(b){b.position.x=item.origin.x;b.position.z=item.origin.z;}}
    if(canvas.hasPointerCapture(d.pointerId))canvas.releasePointerCapture(d.pointerId);enableControls();canvas.style.cursor='grab';updateSelection();draw();
  }
  // Capture phase chooses object manipulation before either OrbitControls listener.
  for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])canvas.addEventListener(type,handler,true);
  const eventWindow=canvas.ownerDocument?.defaultView;eventWindow?.addEventListener('blur',cancel);
  function setTool(){enableControls();canvas.style.cursor='grab';return 'auto';}
  function setOptions({grid:showGrid=true,walls=wallsVisible,dark=false}={}){if(exporting||disposed)return;grid.visible=showGrid;wallsVisible=walls;for(const o of roomGroup.children)if(o.userData.wall)o.visible=walls;scene.background.set(dark?'#14222a':'#e9edef');draw();}

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
    const snapshot=derived.printers.map(p=>({...p,positionM:{...p.positionM}}));
    const limit=Math.min(renderer.capabilities.maxTextureSize,2560),long=Math.max(320,Math.min(limit,width)),aspect=lastWidth/Math.max(1,lastHeight),w=Math.max(1,Math.round(aspect>=1?long:long*aspect)),h=Math.max(1,Math.round(aspect>=1?long/aspect:long));
    let target,outputTarget,outputGeometry,outputMaterial;const oldTarget=renderer.getRenderTarget(),oldAuto=renderer.autoClear,oldBackground=scene.background,oldShaderError=renderer.debug.onShaderError,transparentRoot=new THREE.Group();
    const opaqueScene=new THREE.Scene();opaqueScene.environment=scene.environment;
    for(const l of scene.children.filter(c=>c.isLight))opaqueScene.add(l.clone());
    let transparentBytes=0,active=null;const hiddenWalls=[];
    exporting=true;renderer.debug.onShaderError=()=>{throw Object.assign(Error('Image shader compilation failed'),{code:'RENDER_SHADER_FAILED'});};if(frame){cancelAnimationFrame(frame);frame=0;}controls.enabled=false;selectionBox.visible=false;printersGroup.visible=false;
    const exportCamera=camera.clone();exportCamera.aspect=w/h;exportCamera.updateProjectionMatrix();
    try{
      aborted(signal);target=new THREE.WebGLRenderTarget(w,h,{samples:0,format:THREE.RGBAFormat,type:THREE.HalfFloatType});target.texture.colorSpace=THREE.LinearSRGBColorSpace;
      scene.updateMatrixWorld(true);refreshWalls(exportCamera);
      for(const wall of roomGroup.children.filter(o=>o.userData.wall&&o.visible)){const copy=new THREE.Mesh(wall.geometry.clone(),wall.material.clone());copy.matrixAutoUpdate=false;copy.matrix.copy(wall.matrixWorld);transparentRoot.add(copy);hiddenWalls.push(wall);wall.visible=false;}
      renderer.setRenderTarget(target);renderer.autoClear=true;renderer.render(scene,exportCamera);renderer.autoClear=false;
      for(let i=0;i<snapshot.length;i++){
        aborted(signal);const p=snapshot[i];onProgress({phase:'loading',index:i,total:snapshot.length,machineId:p.machineId,ratio:0});
        active=await loadMachine(p.machineId,{signal,onProgress:detail=>onProgress({...detail,phase:'loading',index:i,total:snapshot.length,machineId:p.machineId,ratio:Number.isFinite(detail?.ratio)?detail.ratio:Number.isFinite(detail?.percent)?detail.percent/100:Number.isFinite(detail?.total)&&detail.total>0&&Number.isFinite(detail?.loaded)?detail.loaded/detail.total:0})});
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
      active?.dispose();disposeTree(transparentRoot);target?.dispose();outputTarget?.dispose();outputGeometry?.dispose();outputMaterial?.dispose();renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto;renderer.debug.onShaderError=oldShaderError;scene.background=oldBackground;printersGroup.visible=true;refreshWalls();
      exporting=false;exportAbort=null;externalSignal?.removeEventListener('abort',forwardAbort);presentView();if(disposed)releaseResources();else{resize();draw();}
    }
  }
  function releaseResources(){if(resourcesDisposed)return;resourcesDisposed=true;disposeTree(planGroup);planSelection.geometry.dispose();planSelection.material.dispose();for(const o of roomGroup.children)if(o.userData.roomOwned){o.geometry.dispose();o.material.dispose();}boxGeometry.dispose();wireGeometry.dispose();wireMaterial.dispose();wallMaterial.dispose();for(const m of palette.values())m.dispose();grid.geometry.dispose();grid.material.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();environment.dispose();renderer.dispose();canvas.remove();}
  function dispose(){if(disposed)return;cancel();disposed=true;exportAbort?.abort();if(frame)cancelAnimationFrame(frame);observer.disconnect();perspectiveControls.dispose();planControls.dispose();eventWindow?.removeEventListener('blur',cancel);for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])canvas.removeEventListener(type,handler,true);if(!exporting)releaseResources();}
  resize();setTool();return {setState,setTool,setOptions,view,getView,exportImage,dispose,canvas};
}

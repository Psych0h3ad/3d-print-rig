import * as THREE from '../viewer/vendor-r180/three.module.js';
import {OrbitControls} from '../viewer/vendor-r180/OrbitControls.js';
import {RoomEnvironment} from '../viewer/vendor-r180/RoomEnvironment.js';
import {deriveScene} from './layout-state.mjs?v=3eb0d016bfa22bdbbcfd';

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

export function createLayoutRenderer({container,catalog,t=key=>key,onSelect=()=>{},onMove=()=>{},onError=()=>{}}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',t('sceneLabel'));canvas.setAttribute('data-layout-i18n-aria-label','layout.sceneLabel');container.append(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9edef');
  const camera=new THREE.PerspectiveCamera(38,1,.01,10000);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.495;controls.minDistance=.15;controls.maxDistance=10000;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;
  const hemi=new THREE.HemisphereLight(0xffffff,0x718394,1.1);scene.add(hemi);
  for(const [position,intensity] of [[[3,6,4],2],[[-4,3,-2],1.1]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.set(...position);scene.add(l);}
  const content=new THREE.Group(),furnitureGroup=new THREE.Group(),printersGroup=new THREE.Group(),roomGroup=new THREE.Group();
  content.add(roomGroup,furnitureGroup,printersGroup);scene.add(content);
  const grid=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8b9da8,transparent:true,opacity:.35,depthWrite:false}));grid.position.y=.0002;scene.add(grid);
  const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xc35734);selectionBox.visible=false;scene.add(selectionBox);
  const boxGeometry=new THREE.BoxGeometry(1,1,1),wireGeometry=new THREE.EdgesGeometry(boxGeometry),wireMaterial=new THREE.LineBasicMaterial({color:0x4d7186,transparent:true,opacity:.75}),palette=new Map(),objects=new Map(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  raycaster.params.Line.threshold=.01;
  let current,derived,selectedId=null,tool='orbit',drag=null,disposed=false,resourcesDisposed=false,exporting=false,exportAbort=null,frame=0,lastWidth=0,lastHeight=0,wallsVisible=true;
  const wallMaterial=new THREE.MeshStandardMaterial({color:'#a4b5c0',roughness:.9,transparent:true,opacity:.45,depthWrite:false});
  const material=color=>{if(!palette.has(color))palette.set(color,new THREE.MeshStandardMaterial({color,roughness:.77,metalness:.05}));return palette.get(color);};
  function box(parent,size,position,color){const m=new THREE.Mesh(boxGeometry,material(color));m.scale.set(...size);m.position.set(...position);parent.add(m);return m;}
  function refreshWalls(forCamera=camera){for(const o of roomGroup.children)if(o.userData.wall){const n=o.userData.inward;o.visible=wallsVisible&&(n[0]*(forCamera.position.x-o.position.x)+n[1]*(forCamera.position.z-o.position.z)>=0);}}
  function draw(){if(disposed||frame||exporting)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed||exporting)return;controls.update();refreshWalls();renderer.render(scene,camera);});}
  controls.addEventListener('change',draw);
  function resize(){if(disposed||exporting)return;const r=container.getBoundingClientRect();if(!r.width||!r.height)return;lastWidth=r.width;lastHeight=r.height;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();draw();}
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
  function makePrinter(e){
    const g=new THREE.Group();printersGroup.add(g);record(e,g);
    const row=catalogMachine(e.machineId);if(!row)throw Error('Unknown layout printer');
    const parts=row.proxy?.parts;
    if(parts?.length){for(const p of parts){if(p.wireframe){const wire=new THREE.LineSegments(wireGeometry,wireMaterial);wire.scale.set(...p.sizeM);wire.position.set(...p.centerM);g.add(wire);}else box(g,p.sizeM,p.centerM,p.color||'#343e47');}}
    else {
      const dim=row.dimensionsMm;const w=dim.width*MM,h=dim.height*MM,d=dim.depth*MM;
      box(g,[w,h,d],[0,h/2,0],'#7d8b96');
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
    current=state;selectedId=id;derived=deriveScene(state,catalog);
    for(const o of roomGroup.children)if(o.userData.roomOwned){o.geometry.dispose();o.material.dispose();}
    resetGroup(furnitureGroup);resetGroup(printersGroup);objects.clear();makeRoom(state.room);
    for(const e of derived.furniture)makeFurniture(e);for(const e of derived.printers)makePrinter(e);
    const selected=objects.get(selectedId);selectionBox.visible=!!selected;if(selected)selectionBox.setFromObject(selected);
    const warned=new Set(issues.flatMap(i=>i.entityIds||[i.entityId||i.id]).filter(Boolean));
    for(const [entityId,g]of objects){g.userData.warning=warned.has(entityId);}
    scene.updateMatrixWorld(true);draw();
  }
  function view(mode='perspective'){
    if(exporting||disposed)return;
    const bounds=new THREE.Box3().setFromObject(content),center=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty())center.set(0,0,0);
    const size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.z,size.y,1),distance=span*1.45;
    controls.target.copy(center);controls.target.y=Math.min(center.y,.8);
    if(mode==='top')camera.position.copy(controls.target).add(new THREE.Vector3(.00001,distance*1.25,0));
    else if(mode==='front')camera.position.copy(controls.target).add(new THREE.Vector3(0,distance*.25,distance*1.1));
    else camera.position.copy(controls.target).add(new THREE.Vector3(distance*.72,distance*.72,distance));
    camera.lookAt(controls.target);controls.update();draw();
  }
  function eventPoint(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function hit(event){eventPoint(event);const intersections=raycaster.intersectObjects([...furnitureGroup.children,...printersGroup.children],true);for(const h of intersections){let o=h.object;while(o&&!o.userData.entityId)o=o.parent;if(o)return o.userData.entityId;}return null;}
  function planePoint(event,y){eventPoint(event);return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
  function down(event){
    if(exporting||event.button!==0)return;const id=hit(event);drag={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false};
    if(tool==='move'&&id){const g=objects.get(id),point=planePoint(event,g.position.y);drag.origin=g.position.clone();drag.point=point;canvas.setPointerCapture(event.pointerId);onSelect(id);drag.followers=current.printers.filter(p=>p.attachment.parentId===id).map(p=>({id:p.id,origin:objects.get(p.id).position.clone()}));event.preventDefault();}
  }
  function move(event){
    if(!drag||drag.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;
    if(tool!=='move'||!drag.id||!drag.point)return;const p=planePoint(event,drag.origin.y);if(!p)return;const g=objects.get(drag.id);if(!g)return;
    g.position.x=drag.origin.x+p.x-drag.point.x;g.position.z=drag.origin.z+p.z-drag.point.z;
    for(const follower of drag.followers||[]){const child=objects.get(follower.id);if(child){child.position.x=follower.origin.x+g.position.x-drag.origin.x;child.position.z=follower.origin.z+g.position.z-drag.origin.z;}}
    selectionBox.setFromObject(g);draw();
  }
  function up(event){
    if(!drag||drag.pointerId!==event.pointerId)return;const d=drag;drag=null;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(tool==='move'&&d.id&&d.point&&d.moved){const g=objects.get(d.id);onMove({id:d.id,x:g.position.x/MM,z:g.position.z/MM});}
    else if(!d.moved)onSelect(d.id);
  }
  function cancel(){if(drag&&current){drag=null;setState(current,selectedId);}}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  function setTool(value){tool=value==='move'?'move':'orbit';controls.enabled=tool==='orbit';canvas.style.cursor=tool==='move'?'move':'grab';draw();}
  function setOptions({grid:showGrid=true,walls=wallsVisible,dark=false}={}){if(exporting||disposed)return;grid.visible=showGrid;wallsVisible=walls;for(const o of roomGroup.children)if(o.userData.wall)o.visible=walls;scene.background.set(dark?'#14222a':'#e9edef');draw();}

  async function exportImage({loadMachine,width=1920,signal,onProgress=()=>{}}){
    if(exporting||disposed||!current)throw Error('Layout is not ready');
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
      return {blob,width:w,height:h,machines:snapshot.map(p=>p.machineId),projection:'current-camera',rendering:'streamed-browser-raster'};
    }finally{
      active?.dispose();disposeTree(transparentRoot);target?.dispose();outputTarget?.dispose();outputGeometry?.dispose();outputMaterial?.dispose();renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto;renderer.debug.onShaderError=oldShaderError;scene.background=oldBackground;printersGroup.visible=true;refreshWalls();
      exporting=false;exportAbort=null;externalSignal?.removeEventListener('abort',forwardAbort);controls.enabled=tool==='orbit';const selected=objects.get(selectedId);selectionBox.visible=!!selected;if(selected)selectionBox.setFromObject(selected);if(disposed)releaseResources();else{resize();draw();}
    }
  }
  function releaseResources(){if(resourcesDisposed)return;resourcesDisposed=true;for(const o of roomGroup.children)if(o.userData.roomOwned){o.geometry.dispose();o.material.dispose();}boxGeometry.dispose();wireGeometry.dispose();wireMaterial.dispose();wallMaterial.dispose();for(const m of palette.values())m.dispose();grid.geometry.dispose();grid.material.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();environment.dispose();renderer.dispose();canvas.remove();}
  function dispose(){if(disposed)return;disposed=true;exportAbort?.abort();if(frame)cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])canvas.removeEventListener(type,handler);if(!exporting)releaseResources();}
  resize();return {setState,setTool,setOptions,view,exportImage,dispose,canvas};
}

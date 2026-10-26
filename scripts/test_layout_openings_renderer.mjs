// Tiny architectural geometry and actual renderer functions, with CPU-only DOM
// and WebGL ports. No printer assets, browser pixels or native CAD are audited.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteOption=process.argv.indexOf('--site'),site=siteOption<0?path.join(root,'site'):path.resolve(process.argv[siteOption+1]);
const files=['layout/layout-opening-interaction.mjs','layout/layout-printer-shapes.mjs','layout/layout-printer-preview-mesh.mjs','layout/layout-renderer.mjs','layout/layout-opening-renderer.mjs','layout/layout-openings.mjs','layout/layout-geometry.mjs','layout/layout-surfaces.mjs','layout/layout-finishes.mjs','layout/layout-plan-measurements.mjs','viewer/vendor-r180/three.module.js','viewer/vendor-r180/three.core.js'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputs=files.map(file=>{const b=fs.readFileSync(path.join(site,file));return {path:file,bytes:b.length,sha256:sha(b)};});
const load=file=>import(pathToFileURL(path.join(site,file)));
const THREE=await load('viewer/vendor-r180/three.module.js');
const {createOpeningInteraction}=await load('layout/layout-opening-interaction.mjs');
const {wallFrame,openingFrame,doorPlan,openingProblems}=await load('layout/layout-openings.mjs');
const {createLayoutOpeningRenderer,openingPlanPrimitives,drawOpeningPlan}=await load('layout/layout-opening-renderer.mjs');
const {createLayoutSurfaces,resolveSurfaceAppearance,wallSurfaceGeometry}=await load('layout/layout-surfaces.mjs');
const {drawPlanMeasurements}=await load('layout/layout-plan-measurements.mjs');
const {printerSilhouetteParts,printerSilhouetteSourceRoles}=await load('layout/layout-printer-shapes.mjs');
const {createPrinterPreviewMeshCache}=await load('layout/layout-printer-preview-mesh.mjs');
const passed=[];
const near=(a,b,tol=1e-6)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,`${a} != ${b}, tolerance ${tol}`);
const vecNear=(a,b,tol)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i],tol));};
const windowOpening=(wallIndex=0)=>({id:'window-a',type:'window',wallIndex,offsetMm:700,widthMm:1200,heightMm:1000,sillMm:900});
const doorOpening=(wallIndex=1,hinge='left',openAngleDeg=90)=>({id:'door-a',type:'door',wallIndex,offsetMm:550,widthMm:900,heightMm:2100,sillMm:0,hinge,openAngleDeg});
const slidingOpening=(wallIndex=1,slideDirection='left',openPercent=50)=>({id:'door-a',type:'door',wallIndex,offsetMm:550,widthMm:900,heightMm:2100,sillMm:0,motion:'sliding',slideDirection,openPercent});
const roomBase={polygonMm:[[0,0],[4000,0],[4000,3000],[0,3000]],wallHeightMm:2600};
const withOpenings=(room=roomBase)=>({...room,openings:[windowOpening(),doorOpening()]});
function meshes(root,role){const result=[];root.traverse(o=>{if(o.isMesh&&(!role||o.userData.openingRole===role))result.push(o);});return result;}
function triangles(mesh){
  mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  return Array.from({length:(index?.count??p.count)/3},(_,i)=>Array.from({length:3},(_,j)=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i*3+j):i*3+j).applyMatrix4(mesh.matrixWorld)));
}
function checkNormals(root){
  root.updateMatrixWorld(true);
  for(const mesh of meshes(root)){
    const g=mesh.geometry,n=g.attributes.normal,p=g.attributes.position,index=g.index,nm=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);assert.ok(n&&p);
    for(let i=0;i<p.count;i++){assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));const v=new THREE.Vector3().fromBufferAttribute(n,i).applyNormalMatrix(nm);near(v.length(),1,1e-6);}
    for(const [i,t]of triangles(mesh).entries()){
      const normal=t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));assert.ok(normal.length()>0,'No zero-area faces');normal.normalize();
      for(let j=0;j<3;j++){const v=new THREE.Vector3().fromBufferAttribute(n,index?index.getX(i*3+j):i*3+j).applyNormalMatrix(nm);assert.ok(normal.dot(v)>.99999,'Face winding must agree with its actual normal');}
    }
  }
}
function wallLocal(f,p){const d=[p.x*1000-f.startMm[0],p.z*1000-f.startMm[1]];return [d[0]*f.along[0]+d[1]*f.along[1],p.y*1000,d[0]*f.inward[0]+d[1]*f.inward[1]];}
function rayHits(root,f,offset,height){
  const a=[f.startMm[0]+f.along[0]*offset+f.inward[0]*100,height,f.startMm[1]+f.along[1]*offset+f.inward[1]*100];
  root.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(...a.map(v=>v*.001)),new THREE.Vector3(-f.inward[0],0,-f.inward[1]),0,.3).intersectObjects(meshes(root,'wall-panel'),false);
}
// Independent hole samples and physical slab datums, in both polygon windings
// and on diagonal walls. No wall material is hidden to fake an aperture.
for(const reversed of [false,true])for(const diagonal of [false,true]){
  const polygon=roomBase.polygonMm.map(([x,z])=>diagonal?[x*.8-z*.6,x*.6+z*.8]:[x,z]);if(reversed)polygon.reverse();
  const room=withOpenings({...roomBase,polygonMm:polygon}),surfaces=createLayoutSurfaces(),owner=createLayoutOpeningRenderer({surfaces});assert.deepEqual(openingProblems(room),[]);
  for(const o of room.openings){
    const f=wallFrame(room,o.wallIndex),wall=owner.makeWall(room,o.wallIndex,surfaces.finish('paint'));checkNormals(wall);
    let volume=0;
    for(const mesh of meshes(wall,'wall-panel')){
      volume+=mesh.scale.x*mesh.scale.y*mesh.scale.z;
      for(const t of triangles(mesh))for(const p of t){const q=wallLocal(f,p);assert.ok(q[2]>=-50.001&&q[2]<=.001,'Slab remains outside the clear room');}
    }
    near(volume,(f.lengthMm*room.wallHeightMm-o.widthMm*o.heightMm)*50e-9,1e-9);
    for(const u of [.15,.4,.7,.85])for(const v of [.15,.45,.8])assert.equal(rayHits(wall,f,o.offsetMm+o.widthMm*u,o.sillMm+o.heightMm*v).length,0,'Actual wall triangles cannot cross the opening');
    assert.ok(rayHits(wall,f,100,1100).length>0,'Retained wall must remain a real opaque slab');
    if(o.type==='window'){
      assert.ok(rayHits(wall,f,o.offsetMm+o.widthMm/2,400).length>0,'Wall remains below the sill');
      const panes=meshes(wall,'window-glass');assert.equal(panes.length,1);const pane=panes[0];assert.equal(pane.material.transparent,true);assert.equal(pane.material.depthWrite,false);assert.ok(pane.material.opacity>0&&pane.material.opacity<1);near(pane.scale.z,.006);
      assert.equal(meshes(wall,'frame-sill').length,1);assert.equal(meshes(wall,'frame-jamb').length,2);
    }else for(const trim of meshes(wall,'baseboard')){
      const b=new THREE.Box3().setFromObject(trim),center=b.getCenter(new THREE.Vector3()),x=wallLocal(f,center)[0];
      assert.ok(x+trim.scale.x*500<=o.offsetMm+.001||x-trim.scale.x*500>=o.offsetMm+o.widthMm-.001,'No trim across the door');
    }
  }
  owner.dispose();surfaces.dispose();passed.push(`Physical holes, slab datums and finite outward normals: ${reversed?'CW':'CCW'}/${diagonal?'diagonal':'axis'}`);
}
for(const reversed of [false,true])for(const wallIndex of [0,1,2,3])for(const hinge of ['left','right'])for(const angle of [0,30,90,120]){
  const polygon=roomBase.polygonMm.map(p=>[...p]);if(reversed)polygon.reverse();const o=doorOpening(wallIndex,hinge,angle),room={...roomBase,polygonMm:polygon,openings:[o]};
  const surfaces=createLayoutSurfaces(),owner=createLayoutOpeningRenderer({surfaces}),wall=owner.makeWall(room,wallIndex,surfaces.finish('linen')),f=wallFrame(room,wallIndex),plan=doorPlan(room,o),leaf=meshes(wall,'door-leaf')[0];checkNormals(wall);
  const ts=triangles(leaf),vertices=ts.flat(),ys=vertices.map(v=>v.y);near(Math.min(...ys),0,1e-7);near(Math.max(...ys),(o.heightMm-plan.frameMm)*.001,2e-7);
  for(const v of vertices)assert.ok(plan.leafPolygonMm.some(p=>Math.hypot(v.x*1000-p[0],v.z*1000-p[1])<.0006),'Leaf must use the actual helper polygon, not a separate yaw guess');
  let signedVolume=0;for(const [a,b,c]of ts)signedVolume+=a.dot(b.clone().cross(c))/6;
  // ExtrudeGeometry stores absolute room coordinates as Float32. At this
  // fixture's 4 m extent their quantization bounds the volume to 1e-6 m^3.
  near(signedVolume,plan.leafWidthMm*35*(o.heightMm-plan.frameMm)*1e-9,1e-6);assert.ok(signedVolume>0);
  const hingeLocal=wallLocal(f,new THREE.Vector3(plan.hingeMm[0]*.001,0,plan.hingeMm[1]*.001));near(hingeLocal[2],-25,1e-8);
  if(angle)assert.ok(wallLocal(f,new THREE.Vector3(plan.tipMm[0]*.001,0,plan.tipMm[1]*.001))[2]>-25,'Leaf opens inward for either hinge and winding');
  const paths=openingPlanPrimitives(room);assert.deepEqual(paths.find(p=>p.role==='door-leaf').pointsMm,plan.leafPolygonMm);assert.deepEqual(paths.find(p=>p.role==='door-arc').pointsMm,plan.arcMm);
  owner.dispose();surfaces.dispose();passed.push(`Door pose ${reversed?'CW':'CCW'}/wall${wallIndex}/${hinge}/${angle}`);
}
// Independent local-wall datums: the whole-width panel translates along the
// wall, remains10..45mm inward, and never rotates or shrinks to the jamb span.
for(const reversed of [false,true])for(const wallIndex of [0,1,2,3])for(const direction of ['left','right'])for(const percent of [0,50,100]){
  const polygon=roomBase.polygonMm.map(p=>[...p]);if(reversed)polygon.reverse();
  const o=slidingOpening(wallIndex,direction,percent),room={...roomBase,polygonMm:polygon,openings:[o]},surfaces=createLayoutSurfaces(),owner=createLayoutOpeningRenderer({surfaces});assert.deepEqual(openingProblems(room),[]);
  const wall=owner.makeWall(room,wallIndex,surfaces.finish('stripe')),f=wallFrame(room,wallIndex),plan=doorPlan(room,o),leaf=meshes(wall,'door-leaf')[0],rail=meshes(wall,'door-track')[0];checkNormals(wall);
  assert.equal(leaf.userData.doorMotion,'sliding');assert.equal(Object.hasOwn(leaf.userData,'hingeMm'),false);assert.equal(meshes(wall,'door-leaf').length,1);assert.equal(meshes(wall,'door-track').length,1);
  const sign=direction==='left'?-1:1,travel=sign*o.widthMm*percent/100,pts=triangles(leaf).flat().map(p=>wallLocal(f,p));
  for(const [axis,lo,hi]of [[0,o.offsetMm+travel,o.offsetMm+travel+o.widthMm],[1,0,o.heightMm-plan.frameMm],[2,10,45]]){
    near(Math.min(...pts.map(p=>p[axis])),lo,.0006);near(Math.max(...pts.map(p=>p[axis])),hi,.0006);
  }
  for(const v of triangles(leaf).flat())assert.ok(plan.leafPolygonMm.some(p=>Math.hypot(v.x*1000-p[0],v.z*1000-p[1])<.0006));
  let volume=0;for(const [a,b,c]of triangles(leaf))volume+=a.dot(b.clone().cross(c))/6;near(volume,o.widthMm*35*(o.heightMm-plan.frameMm)*1e-9,1e-6);assert.ok(volume>0);
  const trackPoints=triangles(rail).flat().map(p=>wallLocal(f,p)),trackStart=o.offsetMm+(direction==='left'?-o.widthMm:0),trackEnd=o.offsetMm+o.widthMm+(direction==='right'?o.widthMm:0);
  for(const [axis,lo,hi]of [[0,trackStart,trackEnd],[1,o.heightMm-plan.frameMm,o.heightMm],[2,20,35]]){
    near(Math.min(...trackPoints.map(p=>p[axis])),lo,.0006);near(Math.max(...trackPoints.map(p=>p[axis])),hi,.0006);
  }
  assert.equal(rail.material,meshes(wall,'frame-head')[0].material);assert.notEqual(rail.material,surfaces.finish('stripe'));
  for(const u of [.2,.5,.8])assert.equal(rayHits(wall,f,o.offsetMm+o.widthMm*u,1000).length,0,'Sliding motion preserves the actual wall hole');
  const paths=openingPlanPrimitives(room);assert.equal(paths.some(p=>p.role==='door-arc'),false);assert.deepEqual(paths.find(p=>p.role==='door-leaf').pointsMm,plan.leafPolygonMm);assert.deepEqual(paths.find(p=>p.role==='door-track').pointsMm,[plan.railStartMm,plan.railEndMm]);
  const arrow=paths.find(p=>p.role==='door-slide-direction').pointsMm,delta=arrow[1].map((v,i)=>v-arrow[0][i]);assert.ok(sign*(delta[0]*f.along[0]+delta[1]*f.along[1])>0);near(delta[0]*f.inward[0]+delta[1]*f.inward[1],0,1e-8);
  for(const dark of [false,true]){const ctx=context2D();assert.deepEqual(drawOpeningPlan(ctx,{room,project:(x,z)=>[x*.1,z*.1],dark}),paths);assert.ok(ctx.paths.every(p=>p.points.flat().every(v=>typeof v==='string'||Number.isFinite(v))));}
  let railDisposals=0,leafDisposals=0,frameDisposals=0;rail.geometry.addEventListener('dispose',()=>railDisposals++);leaf.geometry.addEventListener('dispose',()=>leafDisposals++);rail.material.addEventListener('dispose',()=>frameDisposals++);
  owner.clear();owner.clear();assert.equal(railDisposals,1);assert.equal(leafDisposals,1);assert.equal(frameDisposals,0);owner.dispose();owner.dispose();assert.equal(railDisposals,1);assert.equal(leafDisposals,1);assert.equal(frameDisposals,1);surfaces.dispose();
  passed.push(`Sliding panel/track/plan/disposal ${reversed?'CW':'CCW'}/wall${wallIndex}/${direction}/${percent}`);
}
// Stacked and adjacent apertures cannot silently become one filled rectangle.
{
  const room={...roomBase,openings:[{...windowOpening(),offsetMm:900,heightMm:600,sillMm:500},{...windowOpening(),id:'upper',offsetMm:900,heightMm:500,sillMm:1600},doorOpening(0)]};room.openings[2].offsetMm=2500;
  assert.deepEqual(openingProblems(room),[]);const surfaces=createLayoutSurfaces(),owner=createLayoutOpeningRenderer({surfaces}),wall=owner.makeWall(room,0,surfaces.finish('paint')),f=wallFrame(room,0);
  assert.equal(rayHits(wall,f,1300,700).length,0);assert.equal(rayHits(wall,f,1300,1800).length,0);assert.ok(rayHits(wall,f,1300,1350).length>0);assert.equal(rayHits(wall,f,2900,1000).length,0);checkNormals(wall);
  const plan=openingPlanPrimitives(room),bottom=plan.filter(p=>p.role==='wall'&&p.pointsMm.every(p=>p[1]===0));assert.deepEqual(bottom.map(p=>p.pointsMm),[[[0,0],[900,0]],[[2100,0],[2500,0]],[[3400,0],[4000,0]]]);
  owner.dispose();surfaces.dispose();passed.push('Stacked windows, adjacent door, retained lintel and merged plan wall gaps');
}
function context2D(){
  const ctx={paths:[],fills:[],current:[],font:'',strokeStyle:'',fillStyle:'',lineWidth:1,
    save(){},restore(){},setTransform(){},clearRect(){this.paths=[];this.fills=[];},fillRect(){},beginPath(){this.current=[];},moveTo(...p){this.current.push(['M',...p]);},lineTo(...p){this.current.push(['L',...p]);},closePath(){this.current.push(['Z']);},
    stroke(){this.paths.push({points:structuredClone(this.current),color:this.strokeStyle,width:this.lineWidth});},fill(){this.fills.push({points:structuredClone(this.current),color:this.fillStyle});},clip(){},fillText(){},measureText(s){return {width:s.length*7};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};return ctx;
}
{
  const room=withOpenings(),paths=openingPlanPrimitives(room),lines=paths.filter(p=>p.role==='window-line');assert.equal(lines.length,2);
  vecNear(lines[0].pointsMm[0],[735,-19]);vecNear(lines[1].pointsMm[0],[735,-31]);
  for(const dark of [false,true]){const ctx=context2D();assert.deepEqual(drawOpeningPlan(ctx,{room,project:(x,z)=>[x*.1+3,z*.2-7],dark}),paths);assert.equal(ctx.paths.length,paths.length);assert.ok(ctx.paths.every(p=>p.color===(dark?'#d2e2e8':'#344c5a')));assert.ok(ctx.paths.every(p=>p.points.flat().every(v=>typeof v==='string'||Number.isFinite(v))));}
  assert.throws(()=>drawOpeningPlan(context2D(),{room,project:()=>[NaN,1]}),/Invalid opening plan projection/);passed.push('Double-line windows, actual inward door arcs and projected paths in both themes');
}
// Resource ownership is explicit: surfaces are borrowed, room meshes are
// cleared on a rebuild, and shared frame/pane resources survive until teardown.
{
  const surfaces=createLayoutSurfaces(),owner=createLayoutOpeningRenderer({surfaces}),room=withOpenings(),wall=owner.makeWall(room,0,surfaces.finish('paint')),door=owner.makeWall(room,1,surfaces.finish('paint'));
  const counts=new Map(),track=o=>{if(!counts.has(o)){counts.set(o,0);o.addEventListener('dispose',()=>counts.set(o,counts.get(o)+1));}};
  for(const m of [...meshes(wall),...meshes(door)]){track(m.geometry);track(m.material);}const borrowed=surfaces.finish('paint'),trim=surfaces.trim();
  owner.clear();owner.clear();assert.equal(counts.get(borrowed),0);assert.equal(counts.get(trim),0);assert.equal(counts.get(meshes(wall,'window-glass')[0].geometry),0);assert.equal(counts.get(meshes(wall,'window-glass')[0].material),0);assert.equal(counts.get(meshes(door,'door-leaf')[0].geometry),1);
  owner.dispose();owner.dispose();for(const [resource,count]of counts)assert.equal(count,resource===borrowed||resource===trim?0:1);
  assert.throws(()=>owner.makeWall(room,0,borrowed),/disposed/);surfaces.dispose();passed.push('Opening geometry, shared glass/frame and borrowed wall-finish disposal ownership');
}

// Run the complete current renderer body, changing only its WebGL/DOM/controls
// ports. Actual room, opening, cutaway and export functions remain unchanged.
const source=fs.readFileSync(path.join(site,'layout/layout-renderer.mjs'),'utf8');
const renderers=[],controls=[],canvases=[],planCalls=[];let rafId=0;const frames=new Map();
function node(tag){
  const ctx=context2D(),n={tagName:tag.toUpperCase(),style:{},dataset:{},children:[],hidden:false,width:0,height:0,
    append(...children){for(const c of children){c.parent=this;this.children.push(c);}},replaceChildren(...children){this.children=[];this.append(...children);},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){this.removed=true;},
    getBoundingClientRect:()=>({width:400,height:300,left:0,top:0}),getContext:()=>ctx,toBlob:f=>f(new Blob(['CPU PNG placeholder'],{type:'image/png'})),focus(){},reviewContext:ctx,
    ownerDocument:{defaultView:{addEventListener(){},removeEventListener(){}}}};
  if(tag==='canvas')canvases.push(n);return n;
}
class Controls{constructor(object){this.object=object;this.target=new THREE.Vector3();this.events=new Map();controls.push(this);}addEventListener(k,f){this.events.set(k,f);}update(){}dispose(){}change(){this.events.get('change')?.();}}
class Renderer{
  constructor(){this.domElement=node('canvas');this.shadowMap={};this.debug={};this.capabilities={maxTextureSize:512};this.extensions={has:()=>true};this.calls=[];this.renderLists={dispose(){}};this.target=null;this.failBase=false;renderers.push(this);}
  setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}getRenderTarget(){return this.target;}setRenderTarget(t){this.target=t;}
  render(scene,camera){
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.lastScene=scene;this.lastCamera=camera;
    const all=[];scene.traverseVisible(o=>{if(o.isMesh&&o.userData.openingRole)all.push({object:o,role:o.userData.openingRole,id:o.userData.openingId,geometry:o.geometry.uuid,material:o.material.uuid,matrix:o.matrixWorld.toArray()});});
    this.calls.push({target:this.target,all,scene});if(this.failBase&&this.target&&all.some(o=>o.role==='wall-panel')){this.failBase=false;throw Error('fixture render failure');}
  }
  readRenderTargetPixels(){}dispose(){this.disposed=true;}
}
class PMREM{fromScene(){const texture=new THREE.Texture();return {texture,dispose(){texture.dispose();}};}dispose(){}}
class Environment extends THREE.Scene{dispose(){}}
const ports={createOpeningInteraction,wallFrame,openingFrame,printerSilhouetteParts,printerSilhouetteSourceRoles,createPrinterPreviewMeshCache,THREE:{...THREE,WebGLRenderer:Renderer,PMREMGenerator:PMREM},OrbitControls:Controls,RoomEnvironment:Environment,
  deriveScene:()=>({furniture:[],printers:[],surfaces:[]}),document:{createElement:node,createElementNS:(_,tag)=>node(tag)},devicePixelRatio:1,
  requestAnimationFrame:f=>{frames.set(++rafId,f);return rafId;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}},
  createLayoutSurfaces,resolveSurfaceAppearance,wallSurfaceGeometry,drawPlanMeasurements,groupInfo(){},groupingForEntity(){},groupLabel(){},getLayoutEquipment(){},resolveLayoutEquipment(){},createEquipmentMeshCache:()=>({dispose(){}}),createLayoutOpeningRenderer,
  drawOpeningPlan(ctx,options){const paths=drawOpeningPlan(ctx,options);planCalls.push({ctx,room:options.room,paths,options});return paths;}};
const body=source.replace(/^import [^\n]+;\r?\n/gm,'').replace('export function createLayoutRenderer(','function createLayoutRenderer(');
const createRenderer=new Function(...Object.keys(ports),body+'\nreturn createLayoutRenderer;')(...Object.values(ports));
function flush(){for(let n=0;frames.size;n++){assert.ok(n<20,'Bounded draw queue');const callbacks=[...frames.values()];frames.clear();for(const f of callbacks)f();}}
function setup(room){const container=node('div'),api=createRenderer({container,catalog:[]}),renderer=renderers.at(-1);api.setState({room,groups:[]},null);api.view('perspective');flush();return {container,api,renderer};}
for(const motion of ['hinged','sliding']){
  const room=withOpenings();if(motion==='sliding')room.openings[1]=slidingOpening();
  const {api,renderer,container}=setup(room),scene=renderer.lastScene,wallGroups=scene.children.flatMap(o=>o.children).flatMap(o=>o.children).filter(o=>o.userData.openingWall);
  assert.equal(wallGroups.length,2);const pane=meshes(scene,'window-glass')[0],leaf=meshes(scene,'door-leaf')[0];assert.ok(pane&&leaf);const paneParent=pane.parent;
  assert.equal(meshes(scene,'door-track').length,motion==='sliding'?1:0);
  const perspective=controls.at(-1),camera=perspective.object;camera.position.set(2,1.2,1.5);camera.lookAt(2,1.2,0);perspective.change();flush();assert.ok(wallGroups.every(w=>w.visible));
  api.setOptions({walls:false});flush();assert.ok(wallGroups.every(w=>!w.visible));assert.ok(!renderer.calls.at(-1).all.some(o=>o.id),'Frames, panes and leaves all follow wall toggle');
  api.view('top');flush();const overlay=container.children.find(n=>n.className==='layout-plan-measurements');assert.equal(overlay.hidden,false,'Plan symbols do not require measurements or 3D walls');
  const live=planCalls.at(-1);assert.equal(live.ctx,overlay.reviewContext);assert.deepEqual(live.paths,openingPlanPrimitives(room));
  const before=planCalls.length,result=await api.exportImage({width:400});assert.equal(result.projection,'orthographic-floorplan');const png=planCalls.slice(before).find(c=>c.ctx!==live.ctx);assert.ok(png);assert.equal(png.room,room);assert.deepEqual(png.paths,live.paths,'PNG and live plan must share exact source-mm symbols');
  api.setOptions({walls:true,dark:true});api.view('perspective');camera.position.set(2,1.2,1.5);camera.lookAt(2,1.2,0);perspective.change();flush();assert.ok(wallGroups.every(w=>w.visible));
  const preview=renderer.calls.at(-1).all,paneSnapshot=preview.find(o=>o.role==='window-glass');assert.ok(paneSnapshot);let paneDisposals=0;pane.geometry.addEventListener('dispose',()=>paneDisposals++);pane.material.addEventListener('dispose',()=>paneDisposals++);
  const start=renderer.calls.length,full=await api.exportImage({width:400,loadMachine:()=>{throw Error('No model load expected');}});flush();assert.equal(full.projection,'perspective-3d');
  const exportCalls=renderer.calls.slice(start).filter(c=>c.target),base=exportCalls.find(c=>c.all.some(o=>o.role==='wall-panel')),transparent=exportCalls.find(c=>c.all.some(o=>o.role==='window-glass'));
  assert.ok(base&&transparent);assert.ok(!base.all.some(o=>o.role==='window-glass'),'Glass cannot be painted beneath subsequently streamed models');
  assert.equal(transparent.all.find(o=>o.role==='window-glass').object,pane);assert.equal(pane.parent,paneParent);assert.equal(paneDisposals,0,'Borrowed panes cannot be disposed by PNG cleanup');
  for(const p of preview){const actual=exportCalls.flatMap(c=>c.all).find(o=>o.object===p.object);assert.ok(actual,'Full PNG uses the same actual opening meshes');assert.equal(actual.geometry,p.geometry);assert.equal(actual.material,p.material);vecNear(actual.matrix,p.matrix,1e-12);}
  renderer.failBase=true;await assert.rejects(api.exportImage({width:400}),/fixture render failure/);flush();assert.equal(pane.parent,paneParent);assert.equal(paneDisposals,0);
  camera.position.set(2,1.2,-1);camera.lookAt(2,1.2,0);perspective.change();flush();const windowWall=wallGroups.find(w=>w.userData.wallIndex===0);assert.equal(windowWall.visible,false);assert.ok(!renderer.calls.at(-1).all.some(o=>o.id==='window-a'),'Window frame and pane share the wall cutaway');
  api.setOptions({walls:false,dark:false});api.view('top');flush();assert.equal(overlay.hidden,false);assert.equal(planCalls.at(-1).options.dark,false);
  api.setState({room:{...room,openings:[]},groups:[]},null);flush();assert.equal(overlay.hidden,true);assert.equal(meshes(scene,'door-leaf').length,0);assert.equal(paneDisposals,0,'Shared geometry and material live until renderer teardown');
  api.setState({room,groups:[]},null);flush();assert.equal(meshes(scene,'door-leaf').length,1,'A-to-empty-to-A does not duplicate openings');assert.equal(meshes(scene,'door-track').length,motion==='sliding'?1:0);api.dispose();api.dispose();assert.equal(paneDisposals,2);assert.equal(frames.size,0);
  passed.push(`Actual ${motion} renderer lifecycle: cutaway/toggle, top symbols, both PNG paths, transparent order/failure restoration, A-empty-A and disposal`);
}
// Geometry edits invalidate makeRoom even when polygon and finishes are equal.
{
  const room=withOpenings(),{api,renderer}=setup(room),scene=renderer.lastScene,old=meshes(scene,'door-leaf')[0];
  api.setState({room:{...room,openings:room.openings.map(o=>o.type==='door'?{...o,hinge:'right',openAngleDeg:120}:o)},groups:[]},null);flush();const fresh=meshes(scene,'door-leaf')[0];assert.notEqual(fresh,old);assert.notEqual(fresh.geometry.uuid,old.geometry.uuid);api.dispose();passed.push('Opening angle/hinge changes rebuild actual room geometry instead of reusing stale room key');
}
// Same source ID through motion changes: no stale rail, pivot, plan arc or
// duplicate leaf. Opening changes alone must invalidate the actual room cache.
{
  const room=withOpenings(),{api,renderer}=setup(room),scene=renderer.lastScene,hinged=meshes(scene,'door-leaf')[0],originalPositions=Array.from(hinged.geometry.attributes.position.array);let oldLeafDisposals=0;hinged.geometry.addEventListener('dispose',()=>oldLeafDisposals++);
  let lastRail=null,lastRailDisposals=0;
  for(const direction of ['left','right'])for(const percent of [0,50,100]){
    const next={...room,openings:[room.openings[0],slidingOpening(1,direction,percent)]};
    api.setState({room:next,groups:[]},null);flush();const leaf=meshes(scene,'door-leaf')[0],rail=meshes(scene,'door-track')[0];
    assert.equal(meshes(scene,'door-leaf').length,1);assert.equal(meshes(scene,'door-track').length,1);assert.equal(leaf.userData.doorMotion,'sliding');assert.equal(Object.hasOwn(leaf.userData,'hingeMm'),false);
    if(lastRail){assert.notEqual(rail,lastRail);assert.equal(lastRailDisposals,1);}lastRail=rail;lastRailDisposals=0;rail.geometry.addEventListener('dispose',()=>lastRailDisposals++);
    api.view('top');flush();assert.equal(planCalls.at(-1).paths.some(p=>p.role==='door-arc'),false);assert.equal(planCalls.at(-1).paths.filter(p=>p.role==='door-track').length,1);
  }
  assert.equal(oldLeafDisposals,1);api.setState({room,groups:[]},null);flush();assert.equal(lastRailDisposals,1);assert.equal(meshes(scene,'door-track').length,0);
  const restored=meshes(scene,'door-leaf')[0];assert.equal(restored.userData.doorMotion,'hinged');assert.ok(restored.userData.hingeMm);assert.deepEqual(Array.from(restored.geometry.attributes.position.array),originalPositions);assert.equal(planCalls.at(-1).paths.filter(p=>p.role==='door-arc').length,1);assert.equal(planCalls.at(-1).paths.some(p=>p.role==='door-slide-direction'),false);
  api.dispose();passed.push('Same-ID hinged-A/sliding left-right0-50-100/hinged-A preserves exact geometry and removes stale pivots, rails, symbols and buffers');
}
for(const input of inputs)assert.equal(sha(fs.readFileSync(path.join(site,input.path))),input.sha256,'Source changed during focused check: '+input.path);
const report={schema:1,passed:true,cases:passed.length,scope:'Tiny architectural geometry and current production renderer with controlled CPU DOM/WebGL ports; no browser pixels, printer assets or native clearance certificate',inputs,tests:passed};
const reportOption=process.argv.indexOf('--report');if(reportOption>=0)fs.writeFileSync(path.resolve(process.argv[reportOption+1]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,cases:passed.length,inputs:inputs.length}));

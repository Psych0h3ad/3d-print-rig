// Extend the existing CPU renderer suite without editing its owned fixture.
// Product function bodies, Three geometry/raycast and OrbitControls stay exact.
// Only the dependency allowlist/bindings change to admit layout-groups.mjs.
// DOM, WebGL and PNG bytes remain fixtures: this is not actual UI/GPU/CAD QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

async function groupCases(){
  const G=await import(pathToFileURL(path.join(A,'layout/layout-groups.mjs')));
  imports.push(pin(path.join(A,'layout/layout-groups.mjs')),pin(path.join(A,'layout/layout-group-data.mjs')));
  const nearPose=(actual,expected,label)=>{
    actual.position.toArray().forEach((n,i)=>near(n,expected.position[i],label+' position '+i));
    near(actual.rotation.y,expected.yaw,label+' yaw');
  };
  function setupGroup({selectEcho=true}={}){
    size={width:960,height:720};
    const catalog=[{id:'group-machine',label:'Group printer',widthMm:240,depthMm:200,heightMm:350,baseOffsetMm:37,
      dimensionsMm:{width:240,depth:200,height:350}}];
    const furniture=[S.createDesk({id:'desk-a',widthMm:1200,depthMm:800,heightMm:750,pose:{xMm:-1200,zMm:300,yawDeg:30}}),
      S.createShelf({id:'shelf-b',widthMm:900,depthMm:600,heightMm:1800,pose:{xMm:1400,zMm:-800,yawDeg:-15}})];
    const printer=(id,parentId,xMm,zMm,yawDeg=0,surfaceId='top')=>({id,machineId:'group-machine',configurationId:'reference-'+id,
      attachment:{parentId,surfaceId:parentId?surfaceId:'floor',xMm,zMm,yawDeg}});
    const printers=[printer('child-a1','desk-a',-250,0,20),printer('child-a2','desk-a',250,0,-25),
      printer('child-b','shelf-b',50,0,45,furniture[1].levels[0].id),printer('floor-c',null,-700,-1300,75),printer('unrelated',null,3000,2200)];
    let state=G.createGroup(S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:8000}),furniture,printers},catalog),
      {id:'farm',name:'Farm A',memberIds:['desk-a','shelf-b','floor-c']},catalog);
    state=G.transformGroup(state,'farm',{yawDeg:35},catalog);
    const container=makeContainer(),selections=[],moves=[],rotations=[],errors=[],moveProposals=[],rotationProposals=[];let api;
    api=factoryRealOrbit({container,catalog,t:key=>key==='common.mm'?'mm':key,
      onError:e=>errors.push(e),onSelect:id=>{selections.push(id);if(selectEcho)api.setState(state,id);},
      constrainMove:(p,c)=>{moveProposals.push({p:{...p},c});return {x:c.origin.x+180,z:c.origin.z-90};},
      constrainRotate:(p,c)=>{rotationProposals.push({p:{...p},c});return {yawDeg:c.origin.yawDeg+60};},
      onMove:p=>{moves.push(p);state=G.transformGroup(state,p.id,{xMm:p.x,zMm:p.z},catalog);api.setState(state,p.id);},
      onRotate:p=>{rotations.push(p);state=G.transformGroup(state,p.id,{yawDeg:p.yawDeg},catalog);api.setState(state,p.id);}});
    api.setState(state,'farm');const renderer=renderers.at(-1);
    const nodes=plan=>{const out=new Map();renderer.lastScene.traverse(o=>{if(o.userData.entityId&&!!o.userData.planProjection===plan)out.set(o.userData.entityId,o)});return out;};
    return {api,container,catalog,renderer,state:()=>state,selections,moves,rotations,errors,nodes,moveProposals,rotationProposals};
  }
  const capture=x=>({solid:new Map([...x.nodes(false)].map(([id,n])=>[id,{position:n.position.toArray(),yaw:n.rotation.y}])),
    plan:new Map([...x.nodes(true)].map(([id,n])=>[id,{position:n.position.toArray(),yaw:n.rotation.y}]))});
  const exactSnapshot=(x,before)=>{for(const [kind,plan]of [['solid',false],['plan',true]])for(const [id,p]of before[kind]){
    assert.deepEqual(x.nodes(plan).get(id).position.toArray(),p.position,id+' exact '+kind+' position');assert.equal(x.nodes(plan).get(id).rotation.y,p.yaw,id+' exact '+kind+' yaw');}};
  const handles=x=>({handle:x.container.querySelector('[data-layout-rotation="handle"]'),right:x.container.querySelector('[data-layout-rotation="right"]')});
  const pointsFor=(x,mode)=>{
    const points=[];for(const id of G.groupEntityIds(x.state(),'farm')){
      const node=x.nodes(mode==='top').get(id);node.updateMatrixWorld(true);
      if(mode==='top')for(const [x,z]of node.userData.planPoints)points.push(new THREE.Vector3(x,0,z).applyMatrix4(node.matrixWorld));
      else{const box=new THREE.Box3().setFromObject(node);for(let i=0;i<8;i++)points.push(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));}
    }return points;
  };
  for(const mode of ['top','perspective']){
    const x=setupGroup();x.api.view(mode);await settled();
    const before=JSON.stringify(x.state()),ids=G.groupEntityIds(x.state(),'farm');
    assert.equal(x.nodes(false).has('farm'),false,'Virtual pivot leaked into scene');assert.equal(x.nodes(true).has('farm'),false,'Virtual pivot leaked into plan');
    assert.deepEqual([...x.nodes(false).keys()].sort(),['desk-a','shelf-b','child-a1','child-a2','child-b','floor-c','unrelated'].sort());
    const summary=x.container.querySelector('.layout-selected-summary');assert.equal(summary.children[0].textContent,'A · Farm A');
    const info=G.groupInfo(x.state(),'farm',x.catalog);assert.equal(summary.children[1].textContent,[info.widthMm,info.depthMm,info.heightMm].map(Math.round).join(' × ')+' mm');
    // An elevated support printer with a native base offset participates in the
    // same focus/selection union as floor roots and furniture.
    assert.equal(x.api.focusSelected(),true);await settled();const camera=x.renderer.lastCamera;
    for(const point of pointsFor(x,mode)){point.project(camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'Group focus clipped a physical member');}
    const selection=mode==='top'?x.renderer.lastScene.children.find(n=>n.isLineLoop&&n.renderOrder===30):x.renderer.lastScene.children.find(n=>n.type==='Box3Helper');
    assert.ok(selection?.visible);selection.updateMatrixWorld(true);
    const selectionBounds=mode==='top'?new THREE.Box3().setFromObject(selection):selection.box;
    for(const point of pointsFor(x,mode))if(mode==='top')assert.ok(point.x>=selectionBounds.min.x-1e-6&&point.x<=selectionBounds.max.x+1e-6&&point.z>=selectionBounds.min.z-1e-6&&point.z<=selectionBounds.max.z+1e-6);else assert.ok(selectionBounds.containsPoint(point));
    for(const targetId of ['child-a1','child-a2','floor-c']){
      const node=x.nodes(false).get(targetId),point=node.position.clone();point.y=mode==='top'?0:point.y+.25;
      const down=screen(point,camera);x.api.canvas.emit('pointerdown',down);assert.equal(x.selections.at(-1),'farm',targetId+' should select owning group');x.api.canvas.emit('pointercancel');
      x.api.canvas.emit('pointerdown',{...down,altKey:true});assert.equal(x.selections.at(-1),targetId,'Alt must select physical member');x.api.canvas.emit('pointercancel');
    }
    x.api.setState(x.state(),'farm');await settled();const saved=capture(x),pivot=x.state().groups[0].pose;
    const node=x.nodes(false).get('floor-c'),down=screen(new THREE.Vector3(node.position.x,mode==='top'?0:.25,node.position.z),camera);
    x.api.canvas.emit('pointerdown',down);assert.equal(x.selections.at(-1),'farm');
    for(const offset of [30,60,95]){
      x.api.canvas.emit('pointermove',{clientX:down.clientX+offset,clientY:down.clientY+15});
      // Parent selection refreshes during motion must not rebuild/reset previews.
      x.api.setState(x.state(),'farm');await settled();
      for(const id of ids){const p=saved.solid.get(id);nearPose(x.nodes(false).get(id),{position:[p.position[0]+.18,p.position[1],p.position[2]-.09],yaw:p.yaw},'group move '+id);}
      nearPose(x.nodes(false).get('unrelated'),saved.solid.get('unrelated'),'unrelated move');
    }
    assert.equal(x.moveProposals.at(-1).p.id,'farm');assert.deepEqual(x.moveProposals.at(-1).c.origin,{x:pivot.xMm,z:pivot.zMm});
    assert.equal(JSON.stringify(x.state()),before);assert.equal(x.api.focusSelected(),false);x.api.canvas.emit('pointercancel');exactSnapshot(x,saved);assert.equal(x.moves.length,0);
    x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+50,clientY:down.clientY+10});x.api.canvas.emit('pointerup');await settled();assert.equal(x.moves.length,1);assert.equal(x.moves[0].id,'farm');
    const derived=S.deriveScene(x.state(),x.catalog);for(const e of [...derived.furniture,...derived.printers]){near(x.nodes(false).get(e.id).position.x,e.positionM.x,'committed group x');near(x.nodes(false).get(e.id).position.z,e.positionM.z,'committed group z');}
    const moved=capture(x),movedJSON=JSON.stringify(x.state()),rotation=handles(x).handle,origin=x.state().groups[0].pose;
    for(const ending of ['pointercancel','blur','escape','lostpointercapture']){
      rotation.emit('pointerdown',{clientX:100,clientY:100});rotation.emit('pointermove',{clientX:220,clientY:100});x.api.setState(x.state(),'farm');await settled();
      const delta=Math.PI/3,pivot=new THREE.Vector3(origin.xMm/1000,0,origin.zMm/1000);
      for(const id of ids){const p=moved.solid.get(id),expected=new THREE.Vector3(...p.position).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),delta).add(pivot);nearPose(x.nodes(false).get(id),{position:expected.toArray(),yaw:p.yaw+delta},'group rotate '+id);}
      assert.equal(x.rotationProposals.at(-1).p.id,'farm');assert.equal(x.rotationProposals.at(-1).c.origin.yawDeg,origin.yawDeg);
      if(ending==='blur')x.api.canvas.reviewBlur();else if(ending==='escape')x.api.canvas.reviewWindowHandlers.get('keydown')({key:'Escape',preventDefault(){}});else rotation.emit(ending);
      exactSnapshot(x,moved);assert.equal(JSON.stringify(x.state()),movedJSON);assert.equal(x.rotations.length,0);
    }
    rotation.emit('pointerdown',{clientX:100,clientY:100});rotation.emit('pointermove',{clientX:220,clientY:100});rotation.emit('pointerup');await settled();assert.equal(x.rotations.length,1);assert.equal(x.rotations[0].id,'farm');
    const attachments=x.state().printers.filter(p=>p.attachment.parentId!==null).map(p=>p.attachment);
    assert.deepEqual(attachments,JSON.parse(before).printers.filter(p=>p.attachment.parentId!==null).map(p=>p.attachment),'Group transform changed parent-local attachment');
    handles(x).right.click();await settled();assert.equal(x.rotations.length,2);assert.equal(x.rotations[1].yawDeg,origin.yawDeg+150);
    x.api.setState(x.state(),null);await settled();assert.equal(x.container.querySelector('.layout-object-tools').hidden,true);assert.equal(selection.visible,false,'Cleared selection included floor printers');
    x.api.setState(x.state(),'farm');assert.equal(x.api.focusSelected(),true);await settled();
    const loadIds=[],exportScene=S.deriveScene(x.state(),x.catalog),expectedPrinters=new Map(exportScene.printers.map(e=>[e.machineId,e]));
    const exported=await x.api.exportImage({width:320,loadMachine:async machineId=>{
      loadIds.push(machineId);assert.ok(expectedPrinters.has(machineId));const model=resource(),dispose=model.dispose.bind(model),e=exportScene.printers[loadIds.length-1];
      model.dispose=()=>{nearPose(model.root,{position:[e.positionM.x,e.supportYM,e.positionM.z],yaw:e.yawRad},'streamed physical printer '+e.id);dispose();};return model;
    }});
    assert.deepEqual(exported.machines,exportScene.printers.map(e=>e.machineId));assert.equal(loadIds.length,mode==='top'?0:exportScene.printers.length,'Group changed physical export count');
    assert.deepEqual(x.errors,[]);x.api.dispose();passed.push('Group '+mode+': actual raycast ownership/Alt, no scene/plan anchor, complete selection/summary/focus, constrained pivot move, multiple support followers, repeated selection, exact move/rotate rollback, blur/Escape/capture loss, one commit and toolbar rotation.');
  }
  // Template is intentionally off-center and mixes rotated furniture, several
  // support-local printers and a rotated floor printer. IDs are only references.
  for(const mode of ['top','perspective']){
    const x=setupGroup();x.api.view(mode);await settled();
    const template={format:'3d-print-rig-layout-set',version:1,name:'Offset farm',
      furniture:[S.createDesk({id:'template-desk',widthMm:1200,depthMm:800,heightMm:750,pose:{xMm:800,zMm:900,yawDeg:90}})],
      printers:[[-250,0],[250,45]].map(([xMm,yawDeg],i)=>({id:'template-child-'+i,machineId:'group-machine',configurationId:'preserve-'+i,
        attachment:{parentId:'template-desk',surfaceId:'top',xMm,zMm:0,yawDeg}})).concat([{id:'template-floor',machineId:'group-machine',configurationId:null,
        attachment:{parentId:null,surfaceId:'floor',xMm:1800,zMm:-400,yawDeg:30}}])};
    const original=JSON.stringify(template),stateJSON=JSON.stringify(x.state());let nextProposal,commits=0;
    // A separate renderer uses real numerical group placement results; exported
    // native loads are fixtures and are only requested by explicit PNG export.
    const container=makeContainer(),events=[],errors=[];let api;
    const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:12000,depthMm:10000})},x.catalog);
    api=factoryRealOrbit({container,catalog:x.catalog,onError:e=>errors.push(e),onPlacementMove:input=>{events.push(input);return nextProposal;},onPlacementCommit:()=>commits++});
    api.setState(initial,null);api.view(mode);await settled();const renderer=renderers.at(-1);
    nextProposal=G.proposeGroupPlacement(initial,{id:'stamped',template,xMm:300,zMm:-200,yawDeg:60,snapMm:0},x.catalog);assert.equal(nextProposal.valid,true);
    assert.equal(api.setPlacement({kind:'group',name:template.name,template,sizeMm:nextProposal.sizeMm}),true);
    const point=screen(new THREE.Vector3(.3,0,-.2),renderer.lastCamera);for(let i=0;i<12;i++)api.canvas.emit('pointermove',point);await settled();assert.equal(events.length,1);
    const ghost=renderer.lastScene.children.find(n=>n.userData.layoutPlacementPreview),body=ghost.children[0],nodes=body.children.filter(n=>n.isGroup);
    assert.equal(nodes.length,4,'Every furniture/printer needs a lightweight preview');assert.equal(ghost.visible,true);
    const previewScene=S.deriveScene({...initial,furniture:template.furniture,printers:template.printers},x.catalog),all=[...previewScene.furniture,...previewScene.printers];
    nodes.forEach((node,i)=>{const e=all[i];nearPose(node,{position:[e.positionM.x,e.supportYM??e.positionM.y,e.positionM.z],yaw:e.yawRad},'template local '+e.id);assert.ok(node.children.length>0);});
    ghost.updateMatrixWorld(true);
    const installed=S.deriveScene(nextProposal.state,x.catalog);
    const expectedAll=[...installed.furniture,...installed.printers];
    nodes.forEach((node,i)=>{const p=node.getWorldPosition(new THREE.Vector3()),e=expectedAll[i];near(p.x,e.positionM.x,'template world x');near(p.y,e.supportYM??e.positionM.y,'template world support');near(p.z,e.positionM.z,'template world z');});
    const points=all.flatMap(e=>e.worldEnvelopeMm),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),footprint=ghost.children.find(n=>n.isMesh),outline=body.children.find(n=>n.isLineSegments);
    near(footprint.position.x,(Math.min(...xs)+Math.max(...xs))/2000,'off-center footprint x');near(footprint.position.z,(Math.min(...zs)+Math.max(...zs))/2000,'off-center footprint z');
    near(outline.position.x,footprint.position.x,'outline center x');near(outline.position.z,footprint.position.z,'outline center z');
    near(footprint.scale.x,(Math.max(...xs)-Math.min(...xs))/1000,'footprint width');near(footprint.scale.y,(Math.max(...zs)-Math.min(...zs))/1000,'footprint depth');
    assert.equal(body.visible,mode!=='top');assert.equal(JSON.stringify(template),original);assert.equal(JSON.stringify(x.state()),stateJSON);
    nextProposal={...nextProposal,valid:false,state:null};api.refreshPlacement();assert.equal(footprint.material.color.getHex(),0xe16c56);api.canvas.emit('pointerdown',point);api.canvas.emit('pointerup',point);assert.equal(commits,0);
    nextProposal=G.proposeGroupPlacement(initial,{id:'stamped',template,xMm:300,zMm:-200,yawDeg:60,snapMm:0},x.catalog);api.canvas.emit('pointerdown',point);api.canvas.emit('pointerup',point);assert.equal(commits,1);
    const render=renderer.render.bind(renderer);renderer.render=(scene,camera)=>{if(renderer.target)assert.equal(ghost.visible,false,'Placement ghost entered native PNG export');return render(scene,camera);};
    let loads=0;await api.exportImage({width:320,loadMachine:async()=>{loads++;throw Error('Placement ghost requested CAD')}});assert.equal(loads,0);assert.equal(ghost.visible,true,'Export failed to restore ghost visibility');
    api.setPlacement(null);assert.equal(ghost.visible,false);assert.equal(container.dataset.placing,'false');
    assert.deepEqual(errors,[]);api.dispose();x.api.dispose();passed.push('Group stamp '+mode+': exact template/attachment transforms, all lightweight previews, off-center footprint/outline, coalesced proposals, invalid rejection, one valid commit, no CAD/export inventory, no template mutation.');
  }
}

const harnessURL=new URL('./test_layout_renderer_contract.mjs',import.meta.url);
let replay=fs.readFileSync(harnessURL,'utf8');
const replaceOnce=(before,after)=>{assert.equal(replay.split(before).length,2,'Renderer fixture boundary changed: '+before);replay=replay.replace(before,after);};
if(replay.includes("assert.equal(importLines?.length,6,'Renderer dependency boundary changed')"))
  replaceOnce("assert.equal(importLines?.length,6,'Renderer dependency boundary changed')","assert.equal(importLines?.length,7,'Renderer dependency boundary changed')");
if(!replay.includes('|layout-groups\\.mjs'))replaceOnce('layout-plan-measurements\\.mjs)(?:','layout-plan-measurements\\.mjs|layout-groups\\.mjs)(?:');
if(!/const\s*\{\s*groupInfo\s*,\s*groupingForEntity\s*\}/.test(replay))
  replaceOnce("const importLines=source.match", "const {groupInfo,groupingForEntity}=await import(pathToFileURL(path.join(A,'layout/layout-groups.mjs')));\nconst importLines=source.match");
if(!replay.includes("new Function('groupInfo','groupingForEntity','THREE','OrbitControls'")){
  assert.equal(replay.split("new Function('THREE','OrbitControls'").length,3);
  replay=replay.replaceAll("new Function('THREE','OrbitControls'","new Function('groupInfo','groupingForEntity','THREE','OrbitControls'");
  assert.equal(replay.split(' replacement,').length,3);replay=replay.replaceAll(' replacement,',' groupInfo,groupingForEntity,replacement,');
}
replaceOnce('const ownerSourceStillMatchesSnapshot=',`await (${groupCases.toString()})();\nconst ownerSourceStillMatchesSnapshot=`);
replaceOnce("import {machineChoices} from '../site/viewer/machines.js';",`import {machineChoices} from '${new URL('../site/viewer/machines.js',import.meta.url).href}';`);
replay=replay.replaceAll('import.meta.url',JSON.stringify(harnessURL.href));
// Reports pin this extension too; the inherited harness continues to pin all
// dependencies and asserts that no owner renderer bytes changed during replay.
replaceOnce("test:pin(fileURLToPath(","groupTest:pin("+JSON.stringify(fileURLToPath(import.meta.url))+"),test:pin(fileURLToPath(");
try{await import('data:text/javascript;base64,'+Buffer.from(replay).toString('base64'));}
catch(error){error.stack=error.stack?.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'renderer-contract-replay');console.error(error);process.exitCode=1;}

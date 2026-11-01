import {e3ngSourceNotices,sourceColorLabel,sourceReferenceNoticeKeys} from './source-assembly-notices509.mjs?v=1903c71bd5ecb3b76bca';
import{captureViewAppearance,transferViewAppearance}from'./source-assembly-runtime/view_appearance.mjs?v=c5ea5729242099e8769e';
import {sourceControlBounds} from './source-control-bounds.mjs?v=1c112b375b6d53fd5117';
import * as THREE from './vendor-r180/three.module.js?v=c8211c69345d2e9949dc';
import{OrbitControls}from'./vendor-r180/OrbitControls.js?v=1c5dfa7751d7ab320ac0';
import{RoomEnvironment}from'./vendor-r180/RoomEnvironment.js?v=c20f0b4677f6128a138d';
import{loadLanguage}from'./i18n.mjs?v=52fefcccb7320bf1c315';
import{setupMachineNavigation}from'./machines.js?v=def15e6e5867393ab8db';
import{sceneLightingState}from'./scene-lighting-state.mjs?v=0e24bd8b53a400dfb636';
import{readDisplay,rememberDisplayControl}from'./display-preferences.mjs?v=8f347468def25922153c';
import{workspaceFrame,workspaceListen,workspaceTask,WorkspaceResizeObserver}from'./workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';
import{setResponsiveAspect,frameResponsiveView}from'./responsive-camera.mjs?v=149a79a654914b2af652';
import{setupRenderExport}from'./render-export.js?v=92d6e71ee392361a4f7d';
import{sourceText}from'./source-assembly-messages.mjs?v=ca9a1808a98c73d5824f';
import{loadSourceIndex,loadSourcePacket,sourceHeadPlan,selectedSourcePacket,loadSourceAssembly}from'./source-assembly-loader.mjs?v=8c416a07045059636bcf';
import{sourceReviewBounds}from'./source-assembly-runtime/receiver_guard309.mjs?v=e73d2df413e8fdcf045d';
import{sourceMinimumContext,sourceMinimumState}from'./source-assembly-runtime/state.mjs?v=b5247a9c87c6a42703d7';
import{restoreCurrentAssemblyState}from'./source-assembly-runtime/restore_current_state.mjs?v=88db86b7780e49ae0a4f';
import{releaseRoot}from'./source-assembly-runtime/resources.mjs?v=53e0f29aff2fcb720ede';
import{createLoadCoordinator,sourceProgressStatus}from'./source-assembly-runtime/loading.mjs?v=840f52605ff1a71e2feb';
import{requestModelChoice,createMemoryChoiceDialog}from'./source-assembly-runtime/large_model_warning.mjs?v=b4e77cdc53e1d1e13160';
import{sourceXYMessage}from'./source-assembly-runtime/source_XY309.mjs?v=9e7ad89598a23adcc9e0';
import{captureCamera,restoreCamera}from './source-assembly-view-state.mjs?v=fd9ad51b6102c745bc55';
import{bindSourceConfigurationLoad,selectSourceCameraPreset}from './source-assembly-configuration-ui.mjs?v=7887eb8d33c4a7f24aef';
import{createSourceUIText,sourceCreditNote,sourceCreditLabel}from './source-assembly-ui-text.mjs?v=02957ea40a587daba0a1';
import{sourceReferencePanel,sourceCreditRecords}from './source-assembly-references.mjs?v=0a283a57ad3b7af595e8';
import{setupE3NGModControls,captureE3NGModSelection,transferE3NGModSelection,appendE3NGModCredits}from './e3ng-mod-controls.mjs?v=bc9c8f583b6c323220b3';
export async function mount(scope){
 await loadLanguage(document.documentElement.lang);if(scope.disposed)return;
 const $=id=>document.getElementById(id),lang=()=>document.documentElement.lang,t=k=>sourceText(k,lang()),machine=new URLSearchParams(location.search).get('machine');
 document.body.classList.add('source-assembly');scope.cleanup(()=>document.body.classList.remove('source-assembly'));
 const owned=(tag,attributes={})=>{const n=document.createElement(tag);Object.assign(n,attributes);n.dataset.i18n='off';return n;};
 const messages=createSourceUIText(lang),text=(node,key)=>messages.set(node,key);
 const configuration=$('machineDescription').closest('details');configuration.dataset.i18n='off';text(configuration.querySelector('summary'),'configuration');
 $('machineDescription').textContent='';$('references').closest('label').hidden=true;$('installationOptions').hidden=true;
 const viewRow=owned('div'),viewLabel=text(owned('label',{htmlFor:'sourceView'}),'configuration'),viewSelect=owned('select',{id:'sourceView'});for(const[id,key]of[['full','full'],['head','head']])viewSelect.append(text(owned('option',{value:id}),key));
 const open=text(owned('button',{type:'button',className:'primary'}),'open');viewRow.append(viewLabel,viewSelect,open);$('machineDescription').before(viewRow);
 const modHost=owned('div',{id:'sourceE3NGMods'});configuration.append(modHost);scope.cleanup(()=>modHost.remove());
 text($('sourceModelNotice'),'stl-'+(machine.includes('virtu')?'virtu':'e3ng'));$('sourceModelNotice').classList.add('source-notice');
 const motion=$('motionSettings');motion.replaceChildren(text(owned('summary'),'motion'),text(owned('p',{className:'foot'}),'motionNote'));const axisControls={};
 for(const a of'xyz'){const row=owned('div',{className:'source-axis'}),label=owned('label',{htmlFor:a,textContent:a.toUpperCase()}),range=owned('input',{id:a,type:'range',step:'any',disabled:true}),value=owned('input',{id:a+'Value',type:'number',step:'any',disabled:true});value.setAttribute('aria-label',a.toUpperCase()+' mm');row.append(label,range,value);motion.append(row);axisControls[a]=[range,value];}
 const probeRow=owned('label'),probe=owned('select',{id:'sourceProbe'});probeRow.append(text(owned('span'),'probe'),probe);for(const id of['attached','parked'])probe.append(text(owned('option',{value:id}),id));const minimum=text(owned('button',{type:'button'}),'minimum'),minimumNote=owned('p',{className:'foot'}),reset=text(owned('button',{id:'resetPose',type:'button'}),'reset');motion.append(probeRow,minimum,minimumNote,reset,text(owned('p',{className:'foot'}),'sourceBounds'));
 const colors=$('base').closest('details');colors.replaceChildren(text(owned('summary'),'colors'));const colorControls={};for(const[id,key]of[['base','base'],['accent','accent']]){const row=owned('label',{className:'palette-row'}),input=owned('input',{id,type:'color',disabled:true});row.append(text(owned('span'),key),input);colors.append(row);colorControls[id]=input;}
 const sourceColors=messages.dynamic(owned('button',{id:'sourceColors',type:'button',disabled:true,hidden:machine!=='rh3d_e3ng_v12_235'}),()=>sourceColorLabel(lang()));colors.append(sourceColors);sourceColors.onclick=()=>{if(active)apply({...active.snapshot(),source_material_display:'source'});};
 const lighting=$('gridVisible').closest('details');text(lighting.querySelector('summary'),'display');$('gridVisible').disabled=false;for(const[id,key]of[['gridVisible','grid'],['night','dark']]){const input=$(id);input.closest('label').replaceChildren(input,text(owned('span'),key));}const lightRow=owned('label'),light=owned('select',{id:'sourceLighting'});lightRow.append(text(owned('span'),'light'),light);for(const id of['studio','white','rgb','off'])light.append(text(owned('option',{value:id}),id));lighting.append(lightRow);
 const sourceReference=sourceReferencePanel(document);sourceReference.replaceChildren(text(owned('summary'),'referenceTitle'),text(owned('p',{className:'foot'}),'step'));
 const error=owned('p',{id:'sourceError',className:'foot',role:'status'});motion.append(error);
 const stage=$('stage'),tools=stage.querySelector('.view-tools');tools.replaceChildren();for(const[id,key]of[['iso','iso'],['front','front'],['side','side'],['rear','rear'],['under','under'],['focusHead','focus']])tools.append(text(owned('button',{id,type:'button'}),key));
 text(stage.querySelector('.hint'),'orbit');$('badge').textContent='RH3D';const status=$('status');status.dataset.i18n='off';
 const memory=owned('dialog',{id:'sourceMemory'});memory.innerHTML='<h2></h2><p id="sourceMemoryEstimate"></p><p id="sourceMemoryAvailable"></p><p id="sourceMemoryDevice"></p><p id="sourceMemoryNote"></p><div class="source-actions"><button id="sourceMemoryHead"></button><button id="sourceMemoryFull"></button><button id="sourceMemoryCancel"></button></div>';document.body.append(memory);text(memory.querySelector('h2'),'memory');text($('sourceMemoryNote'),'memoryNote');text($('sourceMemoryHead'),'head');text($('sourceMemoryFull'),'fullLoad');text($('sourceMemoryCancel'),'cancel');scope.cleanup(()=>memory.remove());
 const choose=createMemoryChoiceDialog({dialog:memory,estimate:$('sourceMemoryEstimate'),available:$('sourceMemoryAvailable'),deviceText:$('sourceMemoryDevice'),headButton:$('sourceMemoryHead'),fullButton:$('sourceMemoryFull'),cancelButton:$('sourceMemoryCancel'),translate:k=>t({memoryWarningEstimate:'memoryEstimate',headOnly:'head',availableRamUnknown:'memoryUnknown',approximateDeviceMemory:'deviceMemory'}[k]||k)});
 const credits=owned('dialog',{id:'sourceCredits'}),creditsTitle=text(owned('h2'),'source'),creditsList=owned('ul'),close=text(owned('button',{type:'button'}),'cancel');credits.append(creditsTitle,creditsList,text(owned('p'),'step'),close);document.body.append(credits);close.onclick=()=>credits.close();scope.cleanup(()=>credits.remove());$('openSources').onclick=()=>credits.showModal();text($('openSources'),'source');$('openDownloads').hidden=true;
 const renderer=scope.renderer(new THREE.WebGLRenderer({antialias:true}));renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 let sourceContextLost=false,sourceContextState=null,sourceContextPreset=null;
 const scene=scope.scene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(35,1,.001,30),controls=scope.resource(new OrbitControls(camera,renderer.domElement));controls.enableDamping=true;
 let environment=null;
 function disposeEnvironment(){scene.environment=null;const previous=environment;environment=null;previous?.dispose();}
 function rebuildEnvironment(){
  if(scope.disposed)return;
  disposeEnvironment();
  const pmrem=new THREE.PMREMGenerator(renderer);let room;
  try{room=new RoomEnvironment();environment=pmrem.fromScene(room,.03);scene.environment=environment.texture;}
  finally{room?.dispose();pmrem.dispose();}
 }
 scope.cleanup(disposeEnvironment);rebuildEnvironment();
 const ambient=new THREE.HemisphereLight(0xffffff,0x586b80,.25),sun=new THREE.DirectionalLight(0xffffff,1.4),chamber=new THREE.DirectionalLight(0xffffff,0);sun.position.set(2,4,3);scene.add(ambient,sun,chamber,chamber.target);
 const grid=new THREE.GridHelper(2,40,0xa8b8b1,0xc5cec9);grid.visible=false;scene.add(grid);
 const coordinator=createLoadCoordinator();let packet,headPlan,active,mode='full',frame=null,renderExport;
 const modControls=setupE3NGModControls({host:modHost,machine,language:lang,getState:()=>active?.snapshot()??null,getAvailability:()=>active?.e3ngMods?{base:true,cable:true,panels:active.e3ngMods.fullAssembly===true}:null,apply,owned,messages});
 function render(){if(frame!==null||scope.disposed||sourceContextLost)return;frame=workspaceFrame(time=>{frame=null;if(active?.snapshot().lighting==='rgb')chamber.color.setHSL((time/15000)%1,.65,.5);controls.update();renderer.render(scene,camera);if(active?.snapshot().lighting==='rgb')render();});}
 function display(){const s=active?.snapshot(),settings=sceneLightingState({darkUI:$('night').checked});scene.background=new THREE.Color(settings.background);scene.environmentIntensity=light.value==='off'?0:settings.environmentIntensity;renderer.toneMappingExposure=settings.exposure;ambient.intensity=light.value==='off'?.12:settings.ambientIntensity;sun.intensity=light.value==='off'?0:1.4;chamber.intensity=['white','rgb'].includes(light.value)?.3:0;if(light.value!=='rgb')chamber.color.set(0xffffff);grid.visible=$('gridVisible').checked;document.body.dataset.roomDark='false';render();}
 function visibleBounds(keys=null){const b=new THREE.Box3();active?.root.traverse(n=>{if(!n.isMesh)return;for(let p=n;p;p=p.parent)if(!p.visible)return;if(keys){let p=n;while(p&&!keys.has(p.userData?.part_key))p=p.parent;if(!p)return;}b.expandByObject(n);});return b;}
 function placeSceneFill(bounds){if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3());chamber.target.position.copy(center);chamber.position.copy(center).add(new THREE.Vector3(-.6,.85,1).normalize());chamber.target.updateMatrixWorld();chamber.updateMatrixWorld();}
 function view(kind='iso'){if(!active)return;const b=visibleBounds(kind==='focusHead'?new Set(packet.public_head_keys):null);if(b.isEmpty())return;const center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),distance=Math.max(.025,size.length()/2/Math.sin(THREE.MathUtils.degToRad(camera.fov)/2)*1.08),directions={iso:[.65,.5,.95],front:[0,0,1],side:[1,0,0],rear:[0,0,-1],under:[0,-1,0],focusHead:[.45,.2,1]};controls.target.copy(center);camera.up.set(0,kind==='under'?0:1,kind==='under'?-1:0);camera.position.copy(center).add(new THREE.Vector3(...directions[kind]).normalize().multiplyScalar(distance));camera.lookAt(center);frameResponsiveView(camera,controls);controls.update();selectSourceCameraPreset(tools,kind);render();}
 function sync(){modControls.sync();sourceColors.disabled=!active||!Object.hasOwn(active.snapshot(),'source_material_display');if(!active)return;const s=active.snapshot(),p=active.packet;for(const a of'xyz'){const b=sourceControlBounds(p,s,a);for(const input of axisControls[a]){input.min=b.min;input.max=b.max;input.step=b.step??'any';input.value=s.review_axes?.[a]??0;input.disabled=!p.private_source_motion172;}}probeRow.hidden=!p.source_probe_state303;probe.value=s.probe_state??'attached';minimum.hidden=!p.private_source_motion172?.finite_nozzle_reference_contact;const c=sourceMinimumContext(p,s);minimum.disabled=!c.enabled;if(!minimum.hidden&&!c.enabled)messages.set(minimumNote,s.probe_state==='attached'?'minimumAttached':'minimumOutside');else messages.clear(minimumNote);colorControls.base.value=s.palette.M;colorControls.accent.value=s.palette.A;for(const[k,input]of Object.entries(colorControls))input.disabled=!active.materials.some(r=>r.role===(k==='base'?'M':'A'));light.value=s.lighting;$('gridVisible').checked=s.grid;$('night').checked=s.theme==='dark';viewSelect.value=mode;motion.hidden=mode==='head';display();}
 function moveError(e){if(['SOURCE_FIXED_XY_ENDPOINT','SOURCE_FIXED_XY_PATH'].includes(e?.code))messages.dynamic(error,()=>sourceXYMessage(e,lang()));else messages.set(error,'blocked');}
 function apply(next){try{active.apply(next);messages.clear(error);sync();return true;}catch(e){moveError(e);sync();return false;}}
 for(const a of'xyz')for(const input of axisControls[a])input.oninput=()=>{if(!active)return;const s=active.snapshot();s.review_axes[a]=Number(input.value);apply(s);};
 probe.onchange=()=>{if(active)apply({...active.snapshot(),probe_state:probe.value});};minimum.onclick=()=>{try{apply(sourceMinimumState(active.packet,active.snapshot()));}catch{moveError();}};reset.onclick=()=>{try{active.reset();messages.clear(error);sync();}catch(e){moveError(e);sync();}};
 for(const[k,input]of Object.entries(colorControls))input.oninput=()=>{if(active){const s=active.snapshot();s.palette[k==='base'?'M':'A']=input.value;if(Object.hasOwn(s,'source_material_display'))s.source_material_display='palette';apply(s);}};
 for(const input of[$('night'),$('gridVisible'),light]){input.oninput=input.onchange=()=>{if(active){const s=active.snapshot();s.theme=$('night').checked?'dark':'light';s.grid=$('gridVisible').checked;s.lighting=light.value;apply(s);}display();rememberDisplayControl();};}
 for(const button of tools.querySelectorAll('button'))button.onclick=()=>view(button.id);

 const cancelLoad=text(owned('button',{type:'button',hidden:true}),'cancel');status.after(cancelLoad);cancelLoad.onclick=()=>{coordinator.cancel();cancelLoad.hidden=true;messages.clear(status);};
 function release(){if(active){scene.remove(active.root);releaseRoot(active.root,active);active=null;renderer.renderLists.dispose();}modControls.sync();renderer.render(scene,camera);}
 async function load(requested='full',saved=null){const job=coordinator.start();return coordinator.run(job,async()=>{let next;try{
  if(active&&requested===mode&&saved){const migration=restoreCurrentAssemblyState(active,saved);sync();return migration;}
  let choice=requested;if(requested==='full')choice=await requestModelChoice(packet,{device:navigator,signal:job.signal,choose,headPeakBytes:headPlan.loading_budget.single_load_peak_bytes});if(choice==='cancel'||!job.current()){viewSelect.value=mode;return false;}
  const carriedAppearance=active&&!saved?captureViewAppearance(active.snapshot(),active.packet):null,carriedMods=active&&!saved?captureE3NGModSelection(machine,active.snapshot()):null;release();cancelLoad.hidden=false;messages.set(status,'loading');$('openRender').disabled=true;
  next=await loadSourceAssembly(packet,{renderer,signal:job.signal,mode:choice,headPlan,onProgress:sourceProgressStatus({job,messages,node:status,language:lang})});if(!job.current()){releaseRoot(next.root,next);return false;}
  const migration=saved?restoreCurrentAssemblyState(next,saved):null;if(!saved){const s=next.snapshot();s.theme=readDisplay().dark?'dark':'light';s.language=['en','ja','es','ko','ru','de'].includes(lang())?lang():'en';s.grid=false;next.apply(transferE3NGModSelection(machine,transferViewAppearance(s,next.packet,carriedAppearance),carriedMods));}
  active=next;next=null;mode=choice;scene.add(active.root);const b=visibleBounds(),center=b.getCenter(new THREE.Vector3());grid.position.set(center.x,b.min.y-.0019,center.z);placeSceneFill(b);sync();view();messages.clear(status);cancelLoad.hidden=true;
  if(!renderExport)renderExport=setupRenderExport({renderer,scene,camera,controls,name:machine,three:THREE});$('openRender').disabled=false;return migration??true;
 }catch(e){if(next)releaseRoot(next.root,next);if(job.current()){release();for(const inputs of Object.values(axisControls))for(const input of inputs)input.disabled=true;for(const input of Object.values(colorControls))input.disabled=true;$('openRender').disabled=true;if(e.name==='AbortError')messages.clear(status);else{console.error('Source assembly load failed',e);messages.set(status,saved?'unsafe':'error');}cancelLoad.hidden=true;}return false;}});}
 workspaceListen(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();sourceContextLost=true;sourceContextState=active?{...active.snapshot(),camera:captureCamera(camera,controls)}:null;sourceContextPreset=[...tools.querySelectorAll('button')].find(b=>b.getAttribute('aria-pressed')==='true')?.id??null;coordinator.cancel();});
 workspaceListen(renderer.domElement,'webglcontextrestored',()=>{sourceContextLost=false;const saved=sourceContextState,preset=sourceContextPreset;sourceContextState=null;sourceContextPreset=null;workspaceTask(async()=>{rebuildEnvironment();release();const restored=await load(mode,saved);if(restored&&saved?.camera){restoreCamera(saved.camera,camera,controls);selectSourceCameraPreset(tools,preset);render();}});});
 open.onclick=()=>workspaceTask(()=>load(viewSelect.value));
 const save=$('saveConfiguration'),loadButton=$('loadConfiguration'),file=$('configurationFile');save.disabled=loadButton.disabled=false;text(save,'save');text(loadButton,'load');
 save.onclick=()=>{if(!active)return;const s=active.snapshot();s.camera=captureCamera(camera,controls);s.language=['en','ja','es','ko','ru','de'].includes(lang())?lang():'en';const blob=new Blob([JSON.stringify({schema:'source-assembly-view-v1',machine,view:mode,settings:s},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=owned('a',{href:url,download:machine+'.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),0);messages.set($('configurationStatus'),'saved');};loadButton.onclick=()=>file.click();
 bindSourceConfigurationLoad({file,machine,load,camera,controls,tools,render,messages,status:$('configurationStatus'),task:workspaceTask});
 const resize=()=>{const b=stage.getBoundingClientRect();renderer.setSize(Math.max(1,b.width),Math.max(1,b.height),false);setResponsiveAspect(camera,controls,b.width,b.height);render();};new WorkspaceResizeObserver(resize).observe(stage);controls.addEventListener('change',render);controls.addEventListener('start',()=>selectSourceCameraPreset(tools));scope.cleanup(()=>{coordinator.cancel();release();});
 workspaceListen(window,'rig-language-change',()=>{messages.refresh();choose.refresh();modControls.refresh();if(active)sync();});
 setupMachineNavigation(machine);resize();
 const job=coordinator.start(),index=await loadSourceIndex(job.signal),record=index.models.find(r=>r.id===machine);if(!record)throw Error('Unregistered source assembly');packet=await loadSourcePacket(record,job.signal);headPlan=await sourceHeadPlan(packet,job.signal);if(!job.current())return;$('machineTitle').textContent=machine==='rh3d_e3ng_v12_235'?'E3NG v1.2 / 235':record.label;$('machineRevision').textContent=machine==='rh3d_e3ng_v12_235'?'':packet.public_author_source.source_revision;if(machine==='rh3d_e3ng_v12_235')text($('machineDescription'),'installedE3Components');
 const sourceReferenceList=owned('ul');sourceReference.replaceChildren(text(owned('summary'),'referenceTitle'),owned('p',{className:'foot',textContent:packet.public_author_source.source_revision}),sourceReferenceList,text(owned('p',{className:'foot'}),'step'));
 for(const s of sourceCreditRecords(packet))for(const host of[creditsList,sourceReferenceList]){const row=owned('li'),a=owned('a',{href:s.url,textContent:sourceCreditLabel(s),target:'_blank',rel:'noopener noreferrer'}),version=messages.dynamic(owned('small'),t=>sourceCreditNote(s,t));row.append(a,version);host.append(row);}
 for(const key of sourceReferenceNoticeKeys(packet))for(const host of[sourceReference,credits])host.append(text(owned('p',{className:'foot'}),key));
 if(packet.machine==='e3ng')for(const host of[sourceReference,credits])for(let i=0;i<e3ngSourceNotices('en',packet).length;i++)host.append(messages.dynamic(owned('p',{className:'foot'}),()=>e3ngSourceNotices(lang(),packet)[i]));
 await load('full');
 if(!scope.disposed)appendE3NGModCredits({hosts:[creditsList,sourceReferenceList],machine,packet,language:lang,owned,messages});
}

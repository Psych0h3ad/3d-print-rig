// Lazy family imports: importing this file does not request printer assets.
const base=new URL('../',import.meta.url);
const url=path=>new URL(path,base).href;
const headless=onProgress=>({document:null,navigator:null,onUpdate:onProgress,preferPublicAssets:true});
async function json(path,signal){const r=await fetch(url(path),{signal,cache:'no-cache'});if(!r.ok)throw Error('Layout source request failed: '+path+' ('+r.status+')');return r.json()}
const pose=p=>Object.fromEntries(['x','y','z'].map((a,i)=>[a,p.display_reference_xyz_mm[i]]));

function disposeRoot(root) {
 const geometry=new Set(),material=new Set(),texture=new Set(),instances=new Set();
 root?.traverse(n=>{if(n.isInstancedMesh)instances.add(n);if(n.isMesh){geometry.add(n.geometry);for(const m of [].concat(n.material)){material.add(m);for(const v of Object.values(m))if(v?.isTexture)texture.add(v)}}});
 root?.removeFromParent();for(const v of [...instances,...geometry,...material,...texture])v.dispose();
 root?.clear();
}
function finish(loaded,source,dispose=()=>disposeRoot(loaded.root)) {
 return {root:loaded.root,manifest:loaded.manifest,profile:loaded.profile,source:{normalSourceRevision:'182cf109acf3fa867927bb017b9705e8b7dac68143e322197a4e3cf517d42391',...source,profileSource:loaded.profile?.source,assetIdentity:loaded.replay_asset_identity??null},dispose};
}
async function prepare(run) {
 let loaded;
 try{return await run(value=>loaded=value)}catch(error){loaded?.disposeLayoutSourceCleanup?.();if(loaded?.root)disposeRoot(loaded.root);throw error}
}
export async function loadLayoutRecipe(recipe,{signal,onProgress}) {
 const id=recipe.machine_id,progressOptions=headless(onProgress),options={signal,progressOptions,onProgress};
 if(recipe.category==='v24-reference'){const {loadV24ReferenceLayout}=await import('./layout-v24-reference-provider.mjs?v=c63471e4a45ba5800724');return loadV24ReferenceLayout(id,{signal,onProgress})}
 if(recipe.category==='v0'){const {loadV0DefaultLayout}=await import('./layout-v0-provider.mjs?v=c919367e2cb9be4e3b11');return loadV0DefaultLayout(id,{signal,onProgress})}
 if(['siboor','trident','v24'].includes(recipe.category)){const {loadVoronDefaultLayout}=await import('./layout-voron-defaults.mjs?v=15aa8c8e72fcfbedf25c');return loadVoronDefaultLayout(id,{signal,onProgress})}
 if(recipe.category==='source') {
  const m=await import('./source-assembly-loader.mjs?v=82571dbc84ac65301c54'),{releaseRoot}=await import('./source-assembly-runtime/resources.mjs?v=e42678a5314a2d6c0676');
  const index=await m.loadSourceIndex(signal),record=index.models.find(r=>r.id===id);if(!record)throw Error('Missing layout source record');
  const packet=await m.loadSourcePacket(record,signal),assembly=await m.loadSourceAssembly(packet,{signal,onProgress,mode:'full'});
  return {root:assembly.root,manifest:packet,profile:packet,source:{normalSourceRevision:'182cf109acf3fa867927bb017b9705e8b7dac68143e322197a4e3cf517d42391',record,credits:packet.source??packet.sources,mode:'full',variant:assembly.snapshot().variant},dispose:()=>{releaseRoot(assembly.root,assembly);assembly.root.removeFromParent();assembly.root.clear()}};
 }
 return prepare(async own=>{
  let loaded;
  if(recipe.category==='community') {
   const [{loadCommunity},{evaCommunityIndex}]=await Promise.all([import('./community-loader.mjs?v=c69507eb079fc34e7997'),import('./eva-installations.mjs?v=4dfad49e1f98d4b5b9f2')]);
   const index=evaCommunityIndex(await json('COMMUNITY_MACHINES_ASSETS.json',signal),await json('EVA_INSTALLATIONS.json',signal));
   loaded=await loadCommunity(index,id,options);own(loaded);
   const configuration=loaded.profile.eva_installation?.configuration??'stock';
   if(loaded.profile.eva_installation){
    const [{applyEvaOptionsProfile},{withHeadAdditions}]=await Promise.all([import('./eva-options.mjs?v=cca14d57aef804d9411d'),import('./head-additions.mjs?v=526ae5fd744c374d8537')]);
    const opts=await json('EVA_OPTIONS.json',signal),heads=withHeadAdditions(await json('TOOLHEAD_CONFIGURATIONS.json',signal),await json('HEAD_ADDITIONS.json',signal));
    applyEvaOptionsProfile(loaded,opts,heads);
    if(opts.hosts[id].default_configuration!==configuration)throw Error('EVA default recipe mismatch');
   }
   loaded.adapter.setConfiguration(configuration);loaded.adapter.setReferences(false);
   const ranges=loaded.profile.configurations?.[configuration]?.axes??loaded.profile.axes;
   loaded.adapter.setAxes(Object.fromEntries(Object.entries(loaded.profile.axes).map(([a,r])=>[a,Math.max((ranges[a]??r)[0],Math.min((ranges[a]??r)[1],0))])));
   loaded.adapter.setPalette(loaded.profile.palette_defaults);
   return finish(loaded,{catalog:'COMMUNITY_MACHINES_ASSETS.json',configuration,asset:index.machines[id]});
  }
  if(recipe.category==='ratrig') {
   const {loadRatRigMachine,disposeRatRig}=await import('./ratrig-loader.mjs?v=cb2508ebf98d2b8e2bde');
   const index=await json('RATRIG_ASSETS.json',signal);loaded=await loadRatRigMachine(index,id,options);own(loaded);
   const {cleanupLayoutRatRigBelts}=await import('./layout-ratrig-procedural-cleanup.mjs?v=f111d8d72bb5ad2443b4');
   const proceduralCleanup=cleanupLayoutRatRigBelts(loaded.root);
   return finish(loaded,{catalog:'RATRIG_ASSETS.json',asset:loaded.row,defaultSnapshot:loaded.adapter.getSnapshot(),proceduralCleanup},()=>{disposeRatRig(loaded.root,loaded.adapter);loaded.root.clear()});
  }
  if(recipe.category==='positron') {
   const {loadPositron}=await import('./positron-loader.mjs?v=b64f79151c6cb05dc1d7');const index=await json('POSITRON_ASSETS.json',signal);
   loaded=await loadPositron(index,options);own(loaded);loaded.adapter.setFold(0);loaded.adapter.setAccessoriesVisible(true);loaded.adapter.setPalette(loaded.profile.appearance.palette_defaults);
   return finish(loaded,{catalog:'POSITRON_ASSETS.json',asset:index,fold:0,accessories:true});
  }
  if(recipe.category==='crossant') {
   const {loadCrossant}=await import('./crossant-loader.mjs?v=d7e43ff732dafce0657e');const index=await json('CROSSANT_ASSETS.json',signal);
   loaded=await loadCrossant(index,options);own(loaded);loaded.covers.setVisible(true);loaded.covers.setThickness(3);loaded.adapter.setPalette(loaded.profile.appearance.palette_defaults);
   return finish(loaded,{catalog:'CROSSANT_ASSETS.json',asset:index,covers:true,coverThickness:3});
  }
  if(['annex','remorph'].includes(recipe.category)) {
   const {loadExtraMachine}=await import('./extra-machine-loader.mjs?v=c57003e05d00c49566e3');loaded=await loadExtraMachine(id,options);own(loaded);
   if(recipe.category==='remorph') {
    const {createRemorphAdapter}=await import('./remorph-adapter.mjs');loaded.adapter=createRemorphAdapter(loaded.root,loaded.manifest,loaded.profile,loaded.bindings);
    loaded.adapter.setEnclosureVisible(true);loaded.adapter.setFlexibleVisible(true);loaded.adapter.setPose(pose(loaded.profile));
   }else {
    const THREE=await import('./vendor-r180/three.module.js'),{applyNativeMotionProfile,loadNativeMotionProfile}=await import('./native-motion-profile.mjs?v=91532eb992519143f437'),{createCommunityAdapter}=await import('./community-adapter.mjs?v=b0cc85230bdd2fc9c369');
    const rig=await loadNativeMotionProfile(id,{signal});Object.assign(loaded,applyNativeMotionProfile(loaded.manifest,loaded.profile,rig,loaded.row.files['model.glb'].decoded_sha256));
    loaded.root.rotation.x=loaded.profile.viewer_orientation.viewer_root_rotation_x_radians;
    loaded.root.traverse(n=>{if(!n.isMesh)return;const match=n.name.match(/^(p\d+)__/);if(!match)throw Error('Annex part identity');n.userData.part_key=match[1];for(const m of [].concat(n.material))m.side=THREE.DoubleSide});
    loaded.adapter=createCommunityAdapter(loaded.root,loaded.manifest,loaded.profile);loaded.adapter.setAxes(Object.fromEntries(Object.keys(loaded.profile.axes).map(a=>[a,0])));
    const panels=new Set(loaded.manifest.parts.filter(p=>/panel|door/i.test(p.name)&&!/clip|hinge|latch|handle|mount|bracket|spacer/i.test(p.name)).map(p=>p.key));
    for(const [key,node]of loaded.adapter.nodes)if(panels.has(key)){const row=loaded.adapter.records.get(key),transparent=!/back|rear|bottom/i.test(row.name);node.visible=true;for(const m of [].concat(node.material)){m.transparent=transparent;m.opacity=transparent?.18:1;m.depthWrite=!transparent}}
   }
   return finish(loaded,{catalog:'EXTRA_MACHINE_ASSETS.json',asset:loaded.row});
  }
  if(recipe.category==='kit') {
   const {loadKitReference}=await import('./kit-reference-loader.mjs?v=ab4c504dc9c9698eb8e2'),{createCommunityAdapter}=await import('./community-adapter.mjs?v=b0cc85230bdd2fc9c369');
   const raw=await loadKitReference(id,options);loaded={...raw,root:raw.g.scene};own(loaded);loaded.adapter=createCommunityAdapter(loaded.root,loaded.manifest,loaded.profile);loaded.adapter.setAxes(Object.fromEntries(Object.keys(loaded.profile.axes).map(a=>[a,0])));
   return finish(loaded,{catalog:'machines/'+id,defaultPalette:'source-native'});
  }
  if(['micron','custom'].includes(recipe.category)) {
   const THREE=await import('./vendor-r180/three.module.js');let auxiliaries=[];
   if(recipe.category==='micron'){
    const {GLTFLoader}=await import('./vendor/GLTFLoader.js'),{loadModel}=await import('./model-loader.js?v=3a71971c97a749c16228');
    const manifest=await json('machines/'+id+'/assembly_manifest.json',signal),profile=await json('machines/'+id+'/machine_profile.json',signal);
    const g=await loadModel(new GLTFLoader(),url('machines/'+id+'/model.glb'),onProgress,{signal,progressOptions});loaded={root:g.scene,manifest,profile};own(loaded);
    const {createMicronAdapter}=await import('./micron-adapter.mjs?v=f476eef2731027bc0959');loaded.adapter=createMicronAdapter(loaded.root,manifest,profile);
   }else{
    const {loadLayoutCustomVoron:loadCustomVoron}=await import('./layout-custom-source.mjs?v=2a491ec6cfb8d905ee10');loaded=await loadCustomVoron(id,options);own(loaded);
    if(loaded.profile.kinematics==='trident'){const {isolateLayoutPaletteMaterials}=await import('./layout-material-ownership.mjs?v=9c2148661b8089152e3d');loaded.layoutMaterialOwnership=isolateLayoutPaletteMaterials(loaded.root);}
    if(loaded.profile.kinematics==='trident'){const {createTridentMotion}=await import('./trident-motion.mjs?v=77312c6bfbf6c7e7563d');loaded.adapter=createTridentMotion(loaded.profile);loaded.adapter.register(loaded.root,loaded.manifest)}
    else {const {createV24Adapter}=await import('./v24_matrix_adapter.mjs?v=1f70f3be4ab4a0e74544');loaded.adapter=createV24Adapter(loaded.root,loaded.manifest,loaded.profile)}
    const {createCustomTube}=await import('./custom-voron-tube.mjs?v=be16dba6afffddec260f'),{createV24PtfePreview,V24_PTFE_SPEC}=await import('./v24-ptfe.mjs?v=c4b99bd80cb09e11b702');
    const tube=createCustomTube(loaded.root,loaded.manifest);if(tube){tube.update(0,0,true);auxiliaries.push(tube)}
    const spec=id===V24_PTFE_SPEC.machine_id?V24_PTFE_SPEC:loaded.manifest.v24_ptfe_spec;if(spec)auxiliaries.push(createV24PtfePreview(THREE,loaded.root,loaded.manifest,loaded.profile,spec));
   }
   loaded.adapter.setFlexibleVisible?.(true);loaded.adapter.setEnclosureVisible?.(true);loaded.adapter.setPose(pose(loaded.profile),{flexibleVisible:true});
   if(loaded.adapter.setPalette)loaded.adapter.setPalette(loaded.profile.appearance?.palette_defaults??{base:'#24272c',accent:'#e32636',frame:'#25282d'});
   else {const {appearanceRole}=await import('./appearance-role.mjs?v=6eb709afed84945151b8');const rows=new Map(loaded.manifest.parts.map(r=>[r.key,r]));loaded.root.traverse(n=>{if(n.isMesh){const role=appearanceRole(rows.get(n.userData.part_key));if(['base','accent','frame'].includes(role))for(const m of [].concat(n.material))m.color.set({base:'#24272c',accent:'#e32636',frame:'#25282d'}[role]);}})}
   return finish(loaded,{catalog:recipe.category==='micron'?'machines/'+id:'CUSTOM_VORON_ASSETS.json',asset:loaded.row,referenceXYZ:loaded.profile.display_reference_xyz_mm,materialOwnership:loaded.layoutMaterialOwnership??null,sourceZeroFaceCleanup:loaded.layoutSourceZeroFaces??null},()=>{for(const a of auxiliaries)a.dispose?.();loaded.disposeLayoutSourceCleanup?.();disposeRoot(loaded.root)});
  }
  throw Object.assign(Error('Missing layout family provider: '+recipe.category),{code:'LAYOUT_DEFAULT_RECIPE_UNEXTRACTED'});
 });
}

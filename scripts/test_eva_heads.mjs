// Negative fixtures exercise the production validators/auditor. They are not
// substitute EVA CAD and are never exported as a user-facing source assembly.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
import {validateEvaVariant,validateEvaMetadata,bindEvaSourceMachines,bindEvaMeshIdentities} from '../site/viewer/eva-heads.mjs';
import {assertEvaSourceMetadata,assertEvaExportedLeaves,assertEvaPalettes,assertEvaSelectionLifecycle,evaTestCatalog,evaGlbDocument,checkedEvaArtifacts,evaAssemblyBounds,evaSourceIdentity} from './audit_eva_heads.mjs';
import {headPrinterLink} from '../site/viewer/head-navigation.mjs';
import {builderURL,validateBuilderExtras,builderManifest} from '../site/viewer/toolhead-builder.mjs';
import {collections,headBuilderDimensions,importedVariant,choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>structuredClone(value);
const categories=['carriage','core','hotend_mount','hotend','nozzle','extruder','hotend_fan','part_fan','duct','fasteners','probe'];
const purchased=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners','probe']);
function fixture(generation){
 const version=generation===2?'2.4.2':'3.0.2',revision=String(generation).repeat(40),id='qa_eva_'+generation;
 const companions=Object.fromEntries(categories.map(category=>[category,[id+'_'+category]]));
 // The source can describe a compound hotend/nozzle under one identity.
 companions.nozzle=companions.hotend;
 const variant={id,toolhead:'eva_'+generation,gantry:'eva_native_'+generation,mount:'fixed',carriage:'eva_native_'+generation,hotend:'native_hotend_'+generation,extruder:'native_extruder_'+generation,probe:'native_probe_'+generation,board:'none',cooling:'native',hardware_assembled:true,head_only:true,base_asset:id,base_hidden_keys:[],head_translation_mm:[0,0,0],modules:[],source_version:revision,notes:[],fit:{nozzle_mm:[30,0,0]},eva:{generation,version,source_revision:revision,companions}};
 const parts=categories.filter(category=>category!=='nozzle').map((category,index)=>({key:id+'_'+category,name:'QA '+category,source_component:'QA-source-generation-'+generation+'/'+category,source_leaf:index,source_commit:revision,eva_generation:generation,eva_version:version,eva_companions:category==='hotend'?['hotend','nozzle']:[category],appearance_role:purchased.has(category)?null:category==='duct'?'accent':'base',material:purchased.has(category)?'purchased':'printed',bounds_mm:[[index*10,0,0],[index*10+1,0,1]]}));
 const meta={id,source_commit:revision,source_sha256:String(generation).repeat(64),eva_generation:generation,eva_version:version,parts,nozzle_mm:[30,0,0]};
 const spec={component_id:id,parts:parts.length,external:{base_url:'https://example.invalid/eva/',local_directory:'eva'}};
 return {variant,meta,spec};
}
function actualFixture(meta){
 const root=new THREE.Group(),shared=new THREE.MeshStandardMaterial({color:'#52616b',metalness:.8,roughness:.23});
 for(const p of meta.parts){
  const x=p.bounds_mm[0][0]*.001,geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([x,0,0,x+.001,0,0,x,.001,0],3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));geometry.setIndex([0,1,2]);
  const mesh=new THREE.Mesh(geometry,shared);mesh.name=p.key;mesh.userData={part_key:p.key,source_component:p.source_component,source_commit:p.source_commit,appearance_role:p.appearance_role};root.add(mesh);
 }
 return root;
}
function rejectVariant(base,mutate){const bad=clone(base);mutate(bad);assert.throws(()=>validateEvaVariant(bad,fixture(base.eva.generation).spec));}
function rejectMetadata(data,mutate){const bad=clone(data.meta);mutate(bad);assert.throws(()=>validateEvaMetadata(data.variant,bad));}

let negativeCases=0,actualMeshNegatives=0;
for(const generation of [2,3]){
 const data=fixture(generation),{variant,meta,spec}=data;validateEvaVariant(variant,spec);validateEvaMetadata(variant,meta);assertEvaSourceMetadata(variant,spec,meta);
 const unconfirmed=clone(variant),unconfirmedMeta=clone(meta);unconfirmed.eva.version=null;unconfirmed.eva.version_scope='source_assembly';unconfirmedMeta.eva_version=null;for(const p of unconfirmedMeta.parts)p.eva_version=null;
 validateEvaVariant(unconfirmed,spec);validateEvaMetadata(unconfirmed,unconfirmedMeta);assertEvaSourceMetadata(unconfirmed,spec,unconfirmedMeta);
 if(generation===3){
  const urn='urn:adsk.wipprod:fs.file:vf.eL92Eu5CTp6oAA3iYBTPpw?version=9',urnVariant=clone(unconfirmed),urnMeta=clone(unconfirmedMeta);urnVariant.eva.source_revision=urn;urnVariant.source_version=urn;delete urnMeta.source_commit;urnMeta.source_revision=urn;for(const p of urnMeta.parts){delete p.source_commit;p.source_revision=urn;}
  validateEvaVariant(urnVariant,spec);validateEvaMetadata(urnVariant,urnMeta);assertEvaSourceMetadata(urnVariant,spec,urnMeta);
  for(const revision of ['urn:adsk.wipprod:fs.file:vf.eL92Eu5CTp6oAA3iYBTPpw','urn:adsk.wipprod:fs.file:vf.eL92Eu5CTp6oAA3iYBTPpw?version=latest','urn:adsk.wipprod:fs.file:vf.eL92Eu5CTp6oAA3iYBTPpw?version=9&branch=dev']){const bad=clone(urnVariant);bad.eva.source_revision=revision;bad.source_version=revision;assert.throws(()=>validateEvaVariant(bad,spec));negativeCases++;}
 }
 for(const mutate of [v=>delete v.eva.version_scope,v=>v.eva.version_scope='verified_patch',v=>v.eva.version='unknown']){const bad=clone(unconfirmed);mutate(bad);assert.throws(()=>validateEvaVariant(bad,spec));negativeCases++;}
 for(const mutate of [m=>m.eva_version=variant.eva.version,m=>m.parts[0].eva_version=variant.eva.version]){const bad=clone(unconfirmedMeta);mutate(bad);assert.throws(()=>assertEvaSourceMetadata(unconfirmed,spec,bad));negativeCases++;}
 const missingRecipe=clone(variant);delete missingRecipe.eva;assert.throws(()=>validateEvaVariant(missingRecipe,spec),/Missing EVA source recipe/);negativeCases++;
 const badVariants=[v=>v.eva.generation=4,v=>v.toolhead='eva_'+(generation===2?3:2),v=>v.eva.version=(generation===2?'3':'2')+'.0.0',v=>v.eva.version='3.0.x',v=>v.eva.source_revision='branch-name',v=>v.source_version='f'.repeat(40),v=>v.hardware_assembled=false,v=>v.modules=[{id:'wrong-companion'}],v=>v.base_hidden_keys=['original-fan'],v=>v.head_translation_mm=[0,1,0],v=>v.fit.nozzle_mm=[0,Infinity,0],v=>v.fit.nozzle_mm=[0,0]];
 for(const mutate of badVariants){rejectVariant(variant,mutate);negativeCases++;}
 for(const category of categories){
  rejectVariant(variant,v=>delete v.eva.companions[category]);negativeCases++;
  rejectVariant(variant,v=>v.eva.companions[category].push(v.eva.companions[category][0]));negativeCases++;
  rejectMetadata(data,m=>{const key=variant.eva.companions[category][0];m.parts=m.parts.filter(p=>p.key!==key);});negativeCases++;
  rejectMetadata(data,m=>{const p=m.parts.find(p=>p.key===variant.eva.companions[category][0]);p.eva_companions=p.eva_companions.filter(c=>c!==category);});negativeCases++;
 }
 for(const mutate of [m=>m.id='old-generation',m=>m.eva_generation=generation===2?3:2,m=>m.eva_version='2.0.0',m=>m.source_commit='f'.repeat(40),m=>m.parts.push(clone(m.parts[0]))]){rejectMetadata(data,mutate);negativeCases++;}
 for(const category of purchased)for(const role of ['base','accent']){rejectMetadata(data,m=>m.parts.find(p=>p.eva_companions.includes(category)).appearance_role=role);negativeCases++;}
 for(const mutate of [m=>delete m.source_sha256,m=>m.parts[0].source_commit='f'.repeat(40),m=>m.parts[0].eva_generation=generation===2?3:2,m=>delete m.parts[0].source_component,m=>m.parts[1].source_component=m.parts[0].source_component,m=>m.parts[0].bounds_mm=[[0,0,0],[NaN,0,0]],m=>m.parts.find(p=>p.eva_companions.includes('hotend_fan')).appearance_role='frame']){
  const bad=clone(meta);mutate(bad);assert.throws(()=>assertEvaSourceMetadata(variant,spec,bad));negativeCases++;
 }
 const none=clone(variant);none.probe='none';delete none.eva.companions.probe;validateEvaVariant(none,spec);validateEvaMetadata(none,meta);
 const exported=actualFixture(meta),result=assertEvaExportedLeaves(variant,meta,exported);assert.equal(result.parts,meta.parts.length);assert.equal(result.triangles,meta.parts.length);
 const flat=actualFixture(meta);for(const m of flat.children){m.geometry.deleteAttribute('normal');m.material.flatShading=true;}
 assert.throws(()=>assertEvaExportedLeaves(variant,meta,flat),/Missing EVA position\/unit normal/);actualMeshNegatives++;
 const flatResult=assertEvaExportedLeaves(variant,meta,flat,{allowSourceFlatNormals:true});assert.equal(flatResult.normalVertices,0);assert.equal(flatResult.flatTriangles,meta.parts.length);
 const brokenFlat=actualFixture(meta);brokenFlat.children[0].geometry.deleteAttribute('normal');assert.throws(()=>assertEvaExportedLeaves(variant,meta,brokenFlat,{allowSourceFlatNormals:true}),/Missing EVA position\/unit normal/);actualMeshNegatives++;
 brokenFlat.children[0].material.flatShading=true;brokenFlat.children[0].geometry.index.setX(2,0);assert.throws(()=>assertEvaExportedLeaves(variant,meta,brokenFlat,{allowSourceFlatNormals:true}),/Degenerate authored EVA flat/);actualMeshNegatives++;
 // Native leaf nodes with multiple material primitives retain one source identity.
 const surfaces=actualFixture(meta),leaf=surfaces.children[0],owner=new THREE.Group();owner.userData.part_key=leaf.userData.part_key;surfaces.remove(leaf);delete leaf.userData.part_key;owner.add(leaf);surfaces.add(owner);
 bindEvaMeshIdentities(meta,surfaces);assert.equal(leaf.userData.part_key,meta.parts[0].key);assertEvaExportedLeaves(variant,meta,surfaces);
 delete leaf.userData.part_key;owner.userData.part_key='unregistered-native-leaf';assert.throws(()=>bindEvaMeshIdentities(meta,surfaces),/Missing EVA native surface identity/);actualMeshNegatives++;
 const palette=assertEvaPalettes(meta,exported);assert(palette.printedChecks>0&&palette.protectedChecks>0&&palette.nativeReset);
 for(const category of categories){const broken=actualFixture(meta),key=variant.eva.companions[category][0];broken.remove(broken.children.find(m=>m.userData.part_key===key));assert.throws(()=>assertEvaExportedLeaves(variant,meta,broken),/Missing exported EVA/);actualMeshNegatives++;}
 for(const mutate of [root=>root.children[0].position.x+=.005,root=>root.children[0].userData.source_commit='f'.repeat(40),root=>root.children[0].userData.source_component='wrong-source',root=>root.children[0].userData.appearance_role='accent',root=>root.children[0].geometry.attributes.position.setX(0,NaN),root=>root.children[0].geometry.attributes.normal.setZ(0,.4),root=>root.children[0].geometry.index.setX(0,99),root=>root.children[0].visible=false,root=>root.children[0].material.opacity=NaN,root=>root.children[0].userData.part_key='unknown']){
  const broken=actualFixture(meta);mutate(broken);assert.throws(()=>assertEvaExportedLeaves(variant,meta,broken));actualMeshNegatives++;
 }
 const broken=actualFixture(meta),duplicate=broken.children[0].clone();broken.add(duplicate);assert.throws(()=>assertEvaExportedLeaves(variant,meta,broken),/Duplicate EVA/);actualMeshNegatives++;
}

const f2=fixture(2),f3=fixture(3),variants=[f2.variant,f3.variant],catalog={variants,assets:{},base_assets:Object.fromEntries([f2,f3].map(f=>[f.variant.base_asset,f.spec])),dimensions:headBuilderDimensions};
const nativeIdentity={key:'native-leaf',source_identity:{path:['Assembly','Part:1'],label_path:['0:1','0:2'],definition_label:'0:3'},source_path:['Assembly','Part:1'],source_label_path:['0:1','0:2'],definition_label:'0:3'};
assert.equal(evaSourceIdentity(nativeIdentity),'Assembly/Part:1');
for(const mutate of [p=>p.source_identity.path=[],p=>p.source_identity.label_path.pop(),p=>delete p.source_identity.definition_label,p=>p.source_path[1]='Part:2',p=>p.source_label_path[1]='0:9',p=>p.definition_label='0:9']){const bad=clone(nativeIdentity);mutate(bad);assert.throws(()=>evaSourceIdentity(bad));negativeCases++;}
for(const [dimension,field]of Object.entries(collections))catalog[field]=[...new Set(variants.map(v=>v[dimension]))].map(id=>({id,label:id}));
const lifecycle=assertEvaSelectionLifecycle(catalog,variants);assert.equal(lifecycle.transitions,4);assert.equal(lifecycle.saves,2);
// Source CAD bounds stay in the author's frame. The pinned profile origin
// normalizes metadata into the retained GLB frame without moving its vertices.
const framedMeta=clone(f2.meta);framedMeta.source_origin_mm=[70,0,0];
for(const part of framedMeta.parts)part.native_bounds_mm=part.bounds_mm.map(side=>side.map((n,i)=>n+framedMeta.source_origin_mm[i]));
const framedRoot=actualFixture(framedMeta),retainedVertices=framedRoot.children.map(mesh=>[...mesh.geometry.attributes.position.array]),retainedNativeBounds=clone(framedMeta.parts.map(p=>p.native_bounds_mm));
for(const part of framedMeta.parts)assert.deepEqual(evaAssemblyBounds(framedMeta,part),part.bounds_mm);
assertEvaSourceMetadata(f2.variant,f2.spec,framedMeta);assertEvaExportedLeaves(f2.variant,framedMeta,framedRoot);
assert.deepEqual(framedRoot.children.map(mesh=>[...mesh.geometry.attributes.position.array]),retainedVertices,'Source-frame normalization moved original GLB vertices');
assert.deepEqual(framedMeta.parts.map(p=>p.native_bounds_mm),retainedNativeBounds,'Source-frame normalization rewrote original CAD bounds');
// Case 1: an origin changes while both coordinate-frame bounds stay pinned.
const wrongOrigin=clone(framedMeta);wrongOrigin.source_origin_mm=[69,0,0];
assert.throws(()=>evaAssemblyBounds(wrongOrigin,wrongOrigin.parts[0]),/EVA source-to-viewer frame mismatch/);
assert.throws(()=>assertEvaExportedLeaves(f2.variant,wrongOrigin,framedRoot),/EVA source-to-viewer frame mismatch/);negativeCases++;
// Case 2: a derived viewer bound contradicts native_bounds - source_origin.
// This 0.01 mm discrepancy is below mesh tolerance and must still fail the
// exact metadata-frame check; relaxing tessellation tolerance cannot hide it.
const wrongFrame=clone(framedMeta);wrongFrame.parts[0].bounds_mm[0][0]+=.01;
assert.throws(()=>evaAssemblyBounds(wrongFrame,wrongFrame.parts[0]),/EVA source-to-viewer frame mismatch/);
assert.throws(()=>assertEvaExportedLeaves(f2.variant,wrongFrame,framedRoot),/EVA source-to-viewer frame mismatch/);negativeCases++;
for(const variant of variants){
 const extras={palette:{base:'#19d5f2',accent:'#f75413'},see_inside:false,dock:false,rail:false};validateBuilderExtras({head_builder:extras});
 const url=builderURL('https://example.invalid/viewer/toolheads.html?configuration=old&mount=old&lang=en',variant,extras),saved=new URL(url).searchParams.get('configuration');assert.equal(saved,variant.id);assert.equal(importedVariant(catalog,{configuration:saved}),variant);assert.equal(new URL(url).searchParams.get('lang'),'en');
 const meta=variant.eva.generation===2?f2.meta:f3.meta,manifest=builderManifest(catalog,variant,new Map([[variant.base_asset,meta]]));assert.equal(manifest.configuration,variant.id);assert.equal(manifest.displayed_instances,meta.parts.length);assert.equal(manifest.printed_instances,meta.parts.filter(p=>['base','accent'].includes(p.appearance_role)).length);
 for(const dimension of headBuilderDimensions)for(const choice of choicesFor(catalog,variant,dimension)){const next=resolveVariant(catalog,{...variant,[dimension]:choice.id},dimension);assert(next);assert.equal(next[dimension],choice.id);}
}

// Use the production catalog when the coordinated recipes have been added.
const additions=JSON.parse(await fs.readFile(new URL('../site/HEAD_ADDITIONS.json',import.meta.url),'utf8'));
const realVariants=additions.variants.filter(v=>v.eva),fixtureOnly=process.argv.includes('--fixtures-only');let realLifecycle=null;
// Source-printer navigation is bound to the exact published V-Minion model
// and manifest, not to a generic EVA mounting registration on another machine.
const sourceVariant=realVariants.find(v=>v.eva.generation===2&&v.eva.source_machine?.id==='ratrig_vminion_180')||clone(f2.variant);
const sourceHost={id:'ratrig_vminion_180',decoded_model_sha256:'b394124d0ef44519aa24cd005d1433305f35a545c3b8d5f9c8cccb8268fb0175',manifest_sha256:'11e2f61fdcf9620abe3978741643f23e632a9b3fa4014fb19b0378e76727d45e'};
const sourceHead=clone(sourceVariant);sourceHead.eva.source_machine||=clone(sourceHost);assert.deepEqual(sourceHead.eva.source_machine,sourceHost);
const community={machines:{[sourceHost.id]:{files:{'model.glb':{decoded_sha256:sourceHost.decoded_model_sha256},'assembly_manifest.json':{sha256:sourceHost.manifest_sha256}}}}};
const bindingRegistry={machines:{},eva_source_machines:{obsolete:'old_source'}};
assert.equal(bindEvaSourceMachines({variants:[sourceHead]},bindingRegistry,community),bindingRegistry);
assert.deepEqual(bindingRegistry.eva_source_machines,{[sourceHead.id]:sourceHost.id},'Source binding retained an obsolete printer mapping');
for(const mutate of [c=>c.machines[sourceHost.id].files['model.glb'].decoded_sha256='0'.repeat(64),c=>c.machines[sourceHost.id].files['assembly_manifest.json'].sha256='0'.repeat(64),c=>delete c.machines[sourceHost.id].files['assembly_manifest.json'],c=>delete c.machines[sourceHost.id]]){
 const bad=clone(community),registry=clone(bindingRegistry),before=clone(registry);mutate(bad);assert.throws(()=>bindEvaSourceMachines({variants:[sourceHead]},registry,bad),/EVA source printer identity changed/);assert.deepEqual(registry,before,'Rejected stale source binding mutated registry');negativeCases++;
}
const wrongHost=clone(sourceHead);wrongHost.eva.source_machine.decoded_model_sha256='1'.repeat(64);
const atomicRegistry={machines:{},eva_source_machines:{preserve:'existing_source'}};assert.throws(()=>bindEvaSourceMachines({variants:[sourceHead,wrongHost]},atomicRegistry,community),/EVA source printer identity changed/);assert.deepEqual(atomicRegistry.eva_source_machines,{preserve:'existing_source'},'Partial source binding escaped after a later stale input');negativeCases++;
const returnURL='https://psych0h3ad.github.io/3d-print-rig/viewer/toolheads.html?lang=ko-KR&return_machine=voron_trident_350&return_configuration=unrelated&return_head='+sourceHead.id;
const link=headPrinterLink(sourceHead,bindingRegistry,returnURL),target=new URL(link.url);
assert.equal(link.machine,sourceHost.id);assert.equal(link.registered,true);assert.equal(link.sourceAssembly,true);assert.equal(target.pathname,'/3d-print-rig/viewer/community.html');assert.equal(target.searchParams.get('machine'),sourceHost.id);assert.equal(target.searchParams.get('lang'),'ko');
assert.equal(target.searchParams.get('configuration'),null,'Source-only link invented an installed EVA configuration');assert.equal(target.searchParams.get('head_configuration'),null);
const unboundHead=clone(sourceHead);delete unboundHead.eva.source_machine;const unboundRegistry={machines:{},eva_source_machines:{[sourceHead.id]:sourceHost.id}};bindEvaSourceMachines({variants:[unboundHead]},unboundRegistry,community);assert.deepEqual(unboundRegistry.eva_source_machines,{});
const unboundLink=headPrinterLink(unboundHead,unboundRegistry,returnURL);assert.equal(unboundLink.registered,false);assert.notEqual(unboundLink.sourceAssembly,true);
if(realVariants.length&&!fixtureOnly){
 assert.deepEqual([...new Set(realVariants.map(v=>v.eva.generation))].sort(),[2,3],'Both source generations must ship together');
 const actual=evaTestCatalog(additions);realLifecycle=assertEvaSelectionLifecycle(actual,actual.variants.filter(v=>v.eva));
 for(const v of realVariants){validateEvaVariant(v,additions.assets[v.base_asset]);assert(additions.sources.some(s=>s.commit===v.eva.source_revision||s.source_commit===v.eva.source_revision||s.source_revision===v.eva.source_revision||s.revision===v.eva.source_revision||s.version===v.eva.source_revision||s.cad_version_urn===v.eva.source_revision),'EVA source revision absent from notices');}
}

// Hash/read failures are exercised only in an explicitly supplied temporary
// folder. The auditor never searches for a missing model or a cached native CAD.
const fixtureDirectory=process.argv.slice(2).find(value=>!value.startsWith('--'));
if(fixtureDirectory){
 const root=path.resolve(fixtureDirectory);await fs.mkdir(root,{recursive:true});
 const data=Buffer.from('EVA SHA-256 negative fixture\n'),gz=gzipSync(data,{mtime:0});await fs.writeFile(path.join(root,'fixture.gz'),gz);
 const descriptor={path:'fixture.gz',bytes:gz.length,sha256:sha(gz),encoding:'gzip',decoded_bytes:data.length,decoded_sha256:sha(data)},spec={external:{},files:{'parts.json':descriptor,'model.glb':descriptor}};
 const checked=await checkedEvaArtifacts(spec,root);assert.equal(checked.decoded['model.glb'].toString(),data.toString());
 for(const mutate of [s=>s.files['model.glb'].sha256='0'.repeat(64),s=>s.files['model.glb'].decoded_sha256='0'.repeat(64),s=>s.files['model.glb'].bytes+=1,s=>s.files['model.glb'].decoded_bytes+=1,s=>s.files['model.glb'].path='../escape',s=>s.files['model.glb'].path='C:/escape',s=>s.files['model.glb'].encoding='unknown',s=>delete s.files['model.glb'].decoded_sha256]){const bad=clone(spec);mutate(bad);await assert.rejects(checkedEvaArtifacts(bad,root));negativeCases++;}
}
assert.throws(()=>evaGlbDocument(Buffer.from('not a GLB')),/Invalid EVA GLB/);negativeCases++;
console.log(JSON.stringify({passed:true,negative_cases:negativeCases,actual_fixture_mesh_negatives:actualMeshNegatives,source_generations:[2,3],source_frame_inconsistency_cases:2,source_machine_binding_and_link:true,catalog_eva_variants:realVariants.length,catalog_coverage:fixtureOnly?'Excluded by explicit --fixtures-only; this is not a release catalog pass':'Current production additions',catalog_lifecycle:realLifecycle,fixture_lifecycle:lifecycle,scope:'Production validators/selectors, compound hotend-nozzle, source identity, omissions, palette isolation/reset, GLB geometry negatives, exact saved IDs, source-frame metadata and hash-bound original-printer links. Fixtures do not certify native CAD or installation.'}));

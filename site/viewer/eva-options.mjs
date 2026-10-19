import * as THREE from './vendor-r180/three.module.js';
import {loadExternalComponent} from './component-assets.mjs?v=963445da64a2f4de7cc5';
import {validateEvaVariant,validateEvaMetadata,bindEvaMeshIdentities} from './eva-heads.mjs?v=b53ce6925a6fec3b5b10';
import {loadEvaFrontSurfaces,applyEvaFrontSurfaces} from './eva-front-surfaces.mjs?v=b186419d84a7566d8e22';
import {nativeMotion,displayMotion,validateAxes} from './community-state.mjs?v=460b3fa78cc503ddb6e6';
import {createPaletteController} from './palette-controller.mjs?v=af9daf5ae29080e4cbff';

const HASH=/^[a-f0-9]{64}$/;
const printable=new Set(['base','accent']);
const mutableRoles=new Set(['base','accent','frame','cnc']);
const purchased=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners','probe','endstop','board']);
const recipeFields=['id','base_asset','toolhead','gantry','mount','carriage','extruder','hotend','probe','board','cooling',
 'belt_width_mm','hardware_assembled','modules','base_hidden_keys','head_translation_mm','source_version','eva'];
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const sourcePath=v=>Array.isArray(v)&&v.length>0&&v.every(k=>typeof k==='string'&&k.length>0);
const keys=v=>Array.isArray(v)&&v.length>0&&v.every(k=>typeof k==='string'&&k.length>0)
 &&new Set(v).size===v.length;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ownMap=v=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const partKey=k=>typeof k==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
function canonical(v){return Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const reject=message=>{throw Error('EVA options: '+message)};
function identity(v){return object(v)&&sourcePath(v.source_path)&&HASH.test(v.source_brep_sha256);}
function optionAxes(value,profile=null){
 return object(value)&&Object.keys(value).length>0&&Object.entries(value).every(([axis,range])=>
  ['x','y','z'].includes(axis)&&Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[0]<=range[1]
  &&(!profile||Array.isArray(profile.axes?.[axis])&&range[0]>=profile.axes[axis][0]&&range[1]<=profile.axes[axis][1]));
}
// Only the measured moving socket changes. The source route, weights and fixed
// cap stay owned by the immutable native profile and the production adapter.
export function validateEvaFlexEndpoints(value,profile=null,parts=null){
 if(!ownMap(value))reject('invalid moving socket map');
 for(const[key,target]of Object.entries(value)){
  if(!partKey(key)||!ownMap(target)||Object.keys(target).length!==1||!Object.hasOwn(target,'moving_mm')||!vector(target.moving_mm))reject('invalid moving socket '+key);
  if(profile){
   const spec=Object.hasOwn(profile.motion_registration?.flex||{},key)&&profile.motion_registration.flex[key];
   if(spec?.type!=='endpoint_route'||spec.moving_group!=='head'||!vector(spec.moving_mm)||!vector(spec.fixed_mm)
    ||!profile.motions?.head||parts&&!parts.some(p=>p.key===key&&p.group==='registered_flex'))reject('socket is not a native head endpoint '+key);
  }
 }
 return true;
}
function reviewDescriptor(value,pin){
 if(!object(value)||value.sha256!==pin||!Number.isSafeInteger(value.bytes)||value.bytes<=0||value.bytes>180_000_000)return false;
 try{const url=new URL(value.url);return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}
}
function basis(v){
 if(!Array.isArray(v)||v.length!==3||!v.every(vector))return false;
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(v[i].reduce((n,a,k)=>n+a*v[j][k],0)-(i===j?1:0))>1e-9)return false;
 const determinant=v[0][0]*(v[1][1]*v[2][2]-v[1][2]*v[2][1])-v[0][1]*(v[1][0]*v[2][2]-v[1][2]*v[2][0])+v[0][2]*(v[1][0]*v[2][1]-v[1][1]*v[2][0]);
 return Math.abs(determinant-1)<1e-9;
}
function file(v){
 if(!object(v)||typeof v.path!=='string'||!v.path||v.path.includes('..')||/[\\:]/.test(v.path)||v.path.startsWith('/')
  ||!Number.isSafeInteger(v.bytes)||v.bytes<=0||v.bytes>180_000_000||!HASH.test(v.sha256)
  ||v.encoding!==undefined&&!['gzip','identity'].includes(v.encoding))return false;
 if(v.encoding==='gzip')return HASH.test(v.decoded_sha256)&&Number.isSafeInteger(v.decoded_bytes)&&v.decoded_bytes>0&&v.decoded_bytes<=180_000_000;
 return (v.decoded_sha256===undefined||v.decoded_sha256===v.sha256)&&(v.decoded_bytes===undefined||v.decoded_bytes===v.bytes);
}
const modelHash=asset=>asset.files['model.glb'].decoded_sha256||asset.files['model.glb'].sha256;
function assetValid(id,asset){
 let remote;try{remote=new URL(asset?.external?.base_url)}catch{return false}
 return asset.component_id===id&&Number.isSafeInteger(asset.parts)&&asset.parts>0&&asset.parts<=10000
  &&remote.protocol==='https:'&&!remote.username&&!remote.password&&typeof asset.external.local_directory==='string'
  &&asset.external.local_directory.length>0&&!asset.external.local_directory.includes('..')&&!/[\\:]/.test(asset.external.local_directory)
  &&!asset.external.local_directory.startsWith('/')&&object(asset.files)&&file(asset.files['model.glb'])
  &&file(asset.files['parts.json'])&&Object.values(asset.files).every(file);
}

// Registrations describe one exact complete source-head assembly on its source
// printer. They do not create combinations from matching names or rail sizes.
export function validateEvaOptionsRegistry(registry,heads){
 if(registry?.schema!=='3d-print-rig-eva-options-v1'||!object(registry.assets)||!object(registry.hosts)
  ||!Array.isArray(registry.variants)||!registry.variants.length||!Array.isArray(heads?.variants))reject('invalid registry');
 const variants=new Map(),catalog=new Map();
 for(const v of heads.variants){if(typeof v.id!=='string'||catalog.has(v.id))reject('duplicate catalog recipe');catalog.set(v.id,v)}
 for(const[id,asset]of Object.entries(registry.assets))if(!assetValid(id,asset))reject('invalid pinned component '+id);
 for(const v of registry.variants){
  if(!object(v)||typeof v.id!=='string'||!v.id||variants.has(v.id)||!object(v.eva)||!registry.assets[v.base_asset])reject('duplicate or unknown recipe');
  validateEvaVariant(v,registry.assets[v.base_asset]);
  const expected=catalog.get(v.id);
  if(!expected||recipeFields.some(k=>!same(v[k],expected[k]))||!same(v.fit?.nozzle_mm,expected.fit?.nozzle_mm))reject('catalog recipe differs '+v.id);
  const publishedAsset=heads.base_assets?.[v.base_asset]||heads.assets?.[v.base_asset];
  if(publishedAsset&&!same(publishedAsset,registry.assets[v.base_asset]))reject('catalog asset differs '+v.id);
  const install=v.installation,host=registry.hosts[v.machine_id];
  if(!host||!object(install)||!vector(install.source_origin_mm)||!same(install.source_origin_mm,host.origin_mm)
   ||!vector(install.translation_mm)||install.translation_mm.some(n=>n!==0)||!HASH.test(install.native_review_sha256)
   ||!Number.isFinite(install.mount_axis_error_mm)||install.mount_axis_error_mm<0||install.mount_axis_error_mm>.05
   ||!identity(install.same_carriage_source_identity)||!same(install.same_carriage_source_identity,host.native_mount?.carriage_source_identity)
   ||install.source_head_configuration!==(v.eva.source_head_configuration||v.id))reject('unverified source installation '+v.id);
  for(const[category,list]of Object.entries(v.eva.companions||{}))if(typeof category!=='string'||!keys(list))reject('duplicate or missing companion '+v.id);
  const companions=v.eva.companions,stockCompanions=catalog.get(host.default_configuration)?.eva?.companions;
  // Native stock is displayed from its pinned full assembly. Legacy stock
  // metadata remains immutable; new overlays must distinguish its printed
  // endstop carrier from the purchased switch rather than inherit a mixed tag.
  const requiresEndstopPair=companions.endstop_mount!==undefined
   ||v.id!==host.default_configuration&&(companions.endstop!==undefined||stockCompanions?.endstop!==undefined||stockCompanions?.endstop_mount!==undefined);
  if(requiresEndstopPair&&(!keys(companions.endstop)||!keys(companions.endstop_mount)
   ||companions.endstop.some(k=>companions.endstop_mount.includes(k))))reject('missing or mixed endstop switch/mount '+v.id);
  for(const field of ['notes','notices'])if(v[field]!==undefined&&(!Array.isArray(v[field])||v[field].some(n=>typeof n!=='string')))reject('invalid source notices '+v.id);
  for(const field of ['label','name'])if(v[field]!==undefined&&(typeof v[field]!=='string'||!v[field]))reject('invalid option label '+v.id);
  for(const row of [v,install]){
   for(const field of ['label','machine_description'])if(row[field]!==undefined&&(typeof row[field]!=='string'||!row[field]))reject('invalid installation label '+v.id);
   for(const field of ['notices','motion_notices'])if(row[field]!==undefined&&(!Array.isArray(row[field])||row[field].some(n=>typeof n!=='string')))reject('invalid installation notices '+v.id);
   if(row.sources!==undefined&&(!Array.isArray(row.sources)||row.sources.some(s=>!object(s)||typeof s.url!=='string'||!s.url)))reject('invalid installation sources '+v.id);
  }
  if(install.axes!==undefined&&!optionAxes(install.axes))reject('invalid installation axis limits '+v.id);
  if(install.flex_endpoints_mm!==undefined)validateEvaFlexEndpoints(install.flex_endpoints_mm);
  if(install.native_review!==undefined&&!reviewDescriptor(install.native_review,install.native_review_sha256))reject('invalid native review artifact '+v.id);
  variants.set(v.id,v);
 }
 if(!Object.keys(registry.hosts).length)reject('missing source hosts');
 for(const[id,host]of Object.entries(registry.hosts)){
  const mount=host.native_mount;
  if(host.machine_id!==id||![host.model_sha256,host.manifest_sha256,host.profile_sha256].every(h=>HASH.test(h))
   ||!vector(host.origin_mm)||!basis(host.basis)||!keys(host.stock_head_keys)||!keys(host.configurations)
   ||!host.configurations.includes(host.default_configuration)||!object(mount)||mount.head_group!=='head'
   ||!identity(mount.carriage_source_identity)||!keys(mount.rail_keys)||!keys(mount.fastener_keys)
   ||mount.rail_keys.some(k=>host.stock_head_keys.includes(k))||mount.fastener_keys.some(k=>!host.stock_head_keys.includes(k))
   ||!Array.isArray(mount.axes)||!mount.axes.length||mount.axes.some(a=>!vector(a.point_mm)||!vector(a.direction)||Math.abs(Math.hypot(...a.direction)-1)>1e-9))reject('invalid source host '+id);
  for(const key of host.configurations)if(variants.get(key)?.machine_id!==id)reject('host recipe not registered '+key);
  if([...variants.values()].some(v=>v.machine_id===id&&!host.configurations.includes(v.id)))reject('unlisted host recipe '+id);
 }
 for(const id of Object.keys(registry.assets))if(!registry.variants.some(v=>v.base_asset===id))reject('unused component '+id);
 return true;
}

function loadedHost(current,host){
 const {root,manifest,profile,adapter,replay_asset_identity:receipt}=current;
 if(!root?.isObject3D||manifest?.machine_id!==host.machine_id||profile?.machine_id!==host.machine_id
  ||receipt?.schema!=='loaded-printer-asset-identity/1'||receipt.machine_id!==host.machine_id||!Array.isArray(receipt.files)
  ||new Set(receipt.files.map(f=>f.name)).size!==receipt.files.length)reject('missing loader-checked host identity');
 const files=new Map(receipt.files.map(f=>[f.name,f]));
 for(const[name,pin,decoded]of [['model.glb',host.model_sha256,true],['assembly_manifest.json',host.manifest_sha256,false],['machine_profile.json',host.profile_sha256,false]]){
  const f=files.get(name);if(!f||f.verification==='observed-sha256'||(decoded?f.decoded_sha256:f.sha256)!==pin)reject('loaded host hash changed '+name);
 }
 if(!same(profile.origin_mm,host.origin_mm)||!same(profile.basis,host.basis)||!profile.motions?.head
  ||!Array.isArray(manifest.parts)||new Set(manifest.parts.map(p=>p.key)).size!==manifest.parts.length
  ||manifest.native_leaf_count!==manifest.parts.length||!(adapter?.nodes instanceof Map)||!(adapter.records instanceof Map)
  ||typeof adapter.getAxes!=='function'||typeof adapter.setAxes!=='function')reject('host frame or native adapter changed');
 const actualHead=manifest.parts.filter(p=>p.group===host.native_mount.head_group).map(p=>p.key).sort();
 if(!same(actualHead,[...host.stock_head_keys].sort()))reject('stock head inventory changed');
 for(const part of manifest.parts){
  const node=adapter.nodes.get(part.key),record=adapter.records.get(part.key);
  if(!node?.isObject3D||record?.group!==part.group)reject('missing native host occurrence '+part.key);
  let parent=node;while(parent&&parent!==root)parent=parent.parent;if(parent!==root)reject('native host node detached');
 }
 for(const key of host.native_mount.rail_keys)if(!adapter.records.has(key)||adapter.records.get(key).group==='head')reject('native rail missing');
 const source=host.native_mount.carriage_source_identity;
 if(!host.stock_head_keys.some(k=>same(adapter.records.get(k).source_path,source.source_path)))reject('native carriage source path changed');
 for(const key of host.stock_head_keys){const part=adapter.records.get(key),brep=part.source_brep_sha256||part.brep_sha256;
  if(same(part.source_path,source.source_path)&&brep&&brep!==source.source_brep_sha256)reject('native carriage BRep changed')}
 validateAxes(adapter.getAxes(),profile);
}

function profileLimits(host,registry,profile,parts){
 for(const id of host.configurations){const installation=registry.variants.find(v=>v.id===id).installation,axes=installation.axes;
  if(axes!==undefined&&!optionAxes(axes,profile))reject('installation limits exceed native profile '+id);
  if(installation.flex_endpoints_mm!==undefined)validateEvaFlexEndpoints(installation.flex_endpoints_mm,profile,parts);
 }
}

// The existing native adapter closes over this profile object. Keep that
// object, its motion/source fields, the loader receipt and native parts intact.
// Configuration entries request no native hiding; the overlay owns its mask.
export function applyEvaOptionsProfile(current,registry,heads){
 validateEvaOptionsRegistry(registry,heads);
 const host=registry.hosts[current?.profile?.machine_id];if(!host)reject('unregistered source host');loadedHost(current,host);
 profileLimits(host,registry,current.profile,current.manifest.parts);
 const profile=current.profile,configurations=structuredClone(profile.configurations||{stock:{label:'Original'}});
 const baseline=structuredClone(configurations[host.default_configuration]||configurations.stock||{label:'Original'});
 for(const id of host.configurations){
  const variant=registry.variants.find(v=>v.id===id);
  if(id===host.default_configuration&&Object.hasOwn(configurations,id))continue;
  const install=variant.installation,label=variant.label||variant.name||install.label||id;
  configurations[id]={...structuredClone(baseline),label,
   sources:structuredClone(variant.sources||install.sources||variant.source&&[variant.source]
    ||variant.source_file&&[{url:variant.source_file,revision:variant.source_version}]||[]),
   notices:structuredClone(variant.notices||variant.notes||install.notices||[]),hidden_keys:[],rest_offsets_mm:{},
   source_license_notices:structuredClone(variant.source_license_notices||[]),
   machine_description:variant.machine_description||install.machine_description||label,
   motion_notices:structuredClone(variant.motion_notices||install.motion_notices||[]),
   flex_endpoints_mm:structuredClone(install.flex_endpoints_mm||{}),
   ...(install.axes!==undefined?{axes:structuredClone(install.axes)}:{}),
   eva_generation:variant.eva.generation,source_head_configuration:variant.installation.source_head_configuration};
 }
 configurations.stock??=structuredClone(baseline);
 profile.configurations=configurations;return profile;
}

function disposeResources(root,{textures=false,protectedResources=new Set()}={}){
 const geometries=new Set(),materials=new Set(),maps=new Set();
 root?.traverse(n=>{if(!n.isMesh)return;if(n.geometry)geometries.add(n.geometry);for(const m of [].concat(n.material||[])){materials.add(m);if(textures)for(const value of Object.values(m))if(value?.isTexture)maps.add(value)}});
 for(const g of geometries)if(!protectedResources.has(g))g.dispose();for(const m of materials)if(!protectedResources.has(m))m.dispose();for(const t of maps)if(!protectedResources.has(t))t.dispose();
}
function occurrenceNodes(root,meta){
 const expected=new Map(meta.parts.map(p=>[p.key,p])),nodes=new Map();
 root.traverse(n=>{
  const key=n.userData?.part_key;if(key===undefined)return;
  if(!expected.has(key))reject('unknown head occurrence '+key);
  for(let p=n.parent;p&&p!==root.parent;p=p.parent)if(p.userData?.part_key===key)return;
  if(nodes.has(key))reject('duplicate head occurrence '+key);nodes.set(key,n);
 });
 if(nodes.size!==expected.size)reject('incomplete exported head');
 for(const[key,node]of nodes){let count=0;node.traverse(n=>{if(n.isMesh){count++;if(n.userData.part_key!==key)reject('nested unrelated head occurrence')}});if(!count)reject('empty head occurrence '+key)}
 return nodes;
}
function metadataFrame(meta,host,variant){
 const origin=meta.source_origin_mm||meta.source_origin_native_zup_mm;
 if(!vector(origin)||!same(origin,host.origin_mm)||meta.source_basis&&!same(meta.source_basis,host.basis))reject('head source frame changed');
 if(!Array.isArray(meta.parts)||!meta.parts.length||new Set(meta.parts.map(p=>p.key)).size!==meta.parts.length)reject('duplicate head metadata');
 for(const p of meta.parts){
  if(typeof p.key!=='string'||!p.key||!sourcePath(p.source_path)||!Array.isArray(p.bounds_mm)||p.bounds_mm.length!==2||!p.bounds_mm.every(vector)
   ||p.bounds_mm[0].some((n,i)=>n>p.bounds_mm[1][i])||p.appearance_role!==undefined&&p.appearance_role!==null&&typeof p.appearance_role!=='string'
   ||p.printed===false&&mutableRoles.has(p.appearance_role)||['frame','cnc'].includes(p.appearance_role)||p.printed===true&&!printable.has(p.appearance_role)
   ||p.eva_companions?.some(c=>purchased.has(c))&&(p.printed===true||mutableRoles.has(p.appearance_role))
   ||p.eva_generation!==undefined&&p.eva_generation!==meta.eva_generation)reject('invalid printed/purchased source part '+p.key);
  if(variant.eva.companions.endstop_mount?.includes(p.key)
   &&(p.printed!==true||!printable.has(p.appearance_role)||!p.eva_companions?.includes('endstop_mount')))
   reject('invalid printed endstop mount '+p.key);
  if(variant.eva.companions.endstop?.includes(p.key)
   &&(p.printed!==false||mutableRoles.has(p.appearance_role)||!p.eva_companions?.includes('endstop')))
   reject('invalid purchased endstop switch '+p.key);
  if(p.native_bounds_mm&&(!Array.isArray(p.native_bounds_mm)||p.native_bounds_mm.length!==2||!p.native_bounds_mm.every(vector)
   ||p.native_bounds_mm.some((side,i)=>side.some((n,j)=>Math.abs(n-host.origin_mm[j]-p.bounds_mm[i][j])>1e-5))))reject('native/source bounds frame changed '+p.key);
 }
}
function meshIntegrity(root,meta,host){
 const bounds=new Map(meta.parts.map(p=>[p.key,new THREE.Box3()]));let meshes=0;
 root.updateMatrixWorld(true);
 root.traverse(m=>{
  if(!m.visible)reject('hidden complete-head occurrence');
  if(!m.isMesh)return;meshes++;
  const geometry=m.geometry,position=geometry?.getAttribute('position'),normal=geometry?.getAttribute('normal'),index=geometry?.getIndex();
  if(m.isSkinnedMesh||Object.keys(m.morphTargetDictionary||{}).length||!position||position.itemSize!==3||!position.count
   ||normal&&(normal.itemSize!==3||normal.count!==position.count)||!normal&&![].concat(m.material).every(v=>v.flatShading)
   ||index&&!index.count||(index?.count??position.count)%3||geometry.drawRange.count<=0
   ||m.matrixWorld.elements.some(n=>!Number.isFinite(n))||Math.abs(m.matrixWorld.determinant())<1e-12)reject('invalid head mesh');
  for(let i=0;i<position.count;i++){
   if(![position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite)||normal&&(![normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite)||Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)>2e-5))reject('invalid head position/normal');
  }
  if(index)for(let i=0;i<index.count;i++)if(!Number.isSafeInteger(index.getX(i))||index.getX(i)<0||index.getX(i)>=position.count)reject('invalid head triangle index');
  for(const mat of [].concat(m.material)){if(!mat?.isMaterial||!Number.isFinite(mat.opacity)||mat.opacity<=0||mat.opacity>1||!mat.color?.toArray().every(Number.isFinite))reject('invalid head material')}
  geometry.computeBoundingBox();bounds.get(m.userData.part_key).union(geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
 });
 if(!meshes)reject('missing exported head meshes');
 for(const part of meta.parts){
  const box=new THREE.Box3();
  for(let i=0;i<8;i++){
   // Metadata bounds use native XYZ after subtracting the registered source
   // origin. Geometry already uses display axes/metres; no installation shift.
   const point=part.bounds_mm[0].map((_,j)=>part.bounds_mm[(i>>j)&1][j]);
   box.expandByPoint(new THREE.Vector3(...displayMotion(point,{basis:host.basis})));
  }
  const actual=bounds.get(part.key);
  for(const side of ['min','max'])for(const axis of ['x','y','z'])if(Math.abs(actual[side][axis]-box[side][axis])>.00015)reject('head geometry/source bounds changed '+part.key);
 }
}

export function createEvaOptionsController(current,{registry,heads,loader,href,
 loadComponent=loadExternalComponent,loadFrontSurfaces=loadEvaFrontSurfaces,applyFrontSurfaces=applyEvaFrontSurfaces}={}){
 validateEvaOptionsRegistry(registry,heads);
 registry=structuredClone(registry);heads=structuredClone(heads);
 const host=registry.hosts[current?.profile?.machine_id];if(!host)reject('unregistered source host');loadedHost(current,host);
 profileLimits(host,registry,current.profile,current.manifest.parts);
 if(!loader||typeof href!=='string'||![loadComponent,loadFrontSurfaces,applyFrontSurfaces].every(f=>typeof f==='function'))reject('missing component loader');
 const entries=host.configurations.map(id=>registry.variants.find(v=>v.id===id));
 const recipes=new Map(entries.map(v=>[v.id,v]));
 let active=host.default_configuration,overlay=null,sequence=0,queue=Promise.resolve(),pending=null,closed=false;
 let axes={...current.adapter.getAxes()},palette={},stockVisibility=null;
 const stockNodes=host.stock_head_keys.map(k=>current.adapter.nodes.get(k));
 function live(){if(closed)reject('controller disposed')}
 function hideStock(){for(const node of stockNodes)node.visible=false}
 function restoreStock(){if(stockVisibility){for(const[node,visible]of stockVisibility)node.visible=visible;stockVisibility=null}}
 function protectedResources(){
  const result=new Set();current.root.traverse(m=>{if(!m.isMesh)return;result.add(m.geometry);for(const mat of [].concat(m.material)){result.add(mat);for(const v of Object.values(mat))if(v?.isTexture)result.add(v)}});return result;
 }
 function release(row){if(!row)return;row.root.removeFromParent();disposeResources(row.root,{textures:true,protectedResources:protectedResources()})}
 function applyMotion(row,next){
  const delta=displayMotion(nativeMotion('head',next,current.profile),current.profile);
  row.root.matrixAutoUpdate=false;row.root.matrix.copy(row.nativeMatrix);
  for(let i=0;i<3;i++)row.root.matrix.elements[12+i]+=delta[i];row.root.matrixWorldNeedsUpdate=true;row.root.updateMatrixWorld(true);
 }
 function update(next){live();validateAxes(next,current.profile);axes={...next};if(overlay){applyMotion(overlay,axes);hideStock()}return {...axes}}
 function setPalette(next){
  live();if(!object(next)||Object.entries(next).some(([k,v])=>!['base','accent','frame'].includes(k)||typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v)))reject('invalid palette');
  overlay?.palette.setPalette(next);palette={...next};
 }
 async function prepare(v,isCurrent){
  let loaded,copy,row;
  try{
   loaded=await loadComponent(loader,registry.assets[v.base_asset],href);
   if(!isCurrent())return null;
   if(!loaded?.gltf?.scene?.isObject3D||loaded.gltf.animations?.length)reject('incomplete or animated head asset');
   const meta=structuredClone(loaded.meta),asset=registry.assets[v.base_asset];
   if(meta.parts?.length!==asset.parts)reject('component leaf count changed');
   validateEvaMetadata(v,meta);metadataFrame(meta,host,v);
   const carriage=v.installation.same_carriage_source_identity;
   if(!meta.parts.some(p=>v.eva.companions.carriage.includes(p.key)&&same(p.source_path,carriage.source_path)
    &&(!p.source_brep_sha256||p.source_brep_sha256===carriage.source_brep_sha256)))reject('head carriage source identity changed');
   copy=loaded.gltf.scene.clone(true);copy.traverse(m=>{if(m.isMesh)m.geometry=m.geometry.clone()});
   bindEvaMeshIdentities(meta,copy);const nodes=occurrenceNodes(copy,meta);
   // Clone purchased and printed materials independently, including a native
   // leaf represented by several glTF surface primitives.
   const paletteRecords=new Map(meta.parts.map(p=>[p.key,{...p,appearance_role:printable.has(p.appearance_role)?p.appearance_role:null}]));
   const colors=createPaletteController(nodes,paletteRecords);
   const initialGeometries=new Set();copy.traverse(m=>{if(m.isMesh)initialGeometries.add(m.geometry)});
   const surfaces=await loadFrontSurfaces(loader,href);
   if(!isCurrent()){disposeResources(copy,{protectedResources:protectedResources()});copy=null;return null}
   applyFrontSurfaces(copy,meta,modelHash(asset),{...surfaces,sourceOriginMm:host.origin_mm,metadataSha256:asset.files['parts.json'].sha256});
   const retainedGeometries=new Set();copy.traverse(m=>{if(m.isMesh)retainedGeometries.add(m.geometry)});
   for(const g of initialGeometries)if(!retainedGeometries.has(g))g.dispose();
   meshIntegrity(copy,meta,host);
   colors.setPalette(palette);
   row={id:v.id,root:copy,manifest:meta,nodes,records:new Map(meta.parts.map(p=>[p.key,p])),palette:colors,nativeMatrix:copy.matrix.clone()};
   applyMotion(row,axes);return row;
  }catch(error){
   if(copy)disposeResources(copy,{protectedResources:protectedResources()});throw error;
  }finally{
   // loadExternalComponent returns a fresh owned parse. Its materials and
   // geometry can be released after cloning; maps live with the overlay.
   if(loaded?.gltf?.scene){disposeResources(loaded.gltf.scene,{protectedResources:protectedResources()});if(!row)disposeTextures(loaded.gltf.scene)}
  }
 }
 function disposeTextures(root){const maps=new Set(),protectedSet=protectedResources();root.traverse(m=>{if(m.isMesh)for(const mat of [].concat(m.material))for(const v of Object.values(mat))if(v?.isTexture)maps.add(v)});for(const t of maps)if(!protectedSet.has(t))t.dispose()}
 function install(id){
  live();if(!recipes.has(id))return Promise.reject(Error('EVA options: configuration not available on this source host'));
  const request=++sequence;pending=id;
  if(id===host.default_configuration){const previous=overlay;overlay=null;active=id;pending=null;restoreStock();release(previous);return Promise.resolve({id,stale:false,stock:true})}
  const run=queue.then(async()=>{
   if(closed||request!==sequence)return {id,stale:true,stock:id===host.default_configuration};
   if(overlay?.id===id){update(current.adapter.getAxes());return {id,stale:false,stock:false}}
   let prepared;
   try{
    prepared=await prepare(recipes.get(id),()=>!closed&&request===sequence);
    if(closed||request!==sequence){release(prepared);return {id,stale:true,stock:false}}
    // All asynchronous work precedes this commit. No native head, flex route
    // or scene resource changes while a candidate is loading or rejected.
    axes={...current.adapter.getAxes()};validateAxes(axes,current.profile);applyMotion(prepared,axes);prepared.palette.setPalette(palette);
    current.root.add(prepared.root);
    if(!stockVisibility)stockVisibility=new Map(stockNodes.map(n=>[n,n.visible]));
    const previous=overlay;overlay=prepared;active=id;hideStock();release(previous);
    return {id,stale:false,stock:false};
   }catch(error){if(prepared&&prepared!==overlay)release(prepared);if(closed||request!==sequence)return {id,stale:true,stock:false};throw error}
  }).finally(()=>{if(request===sequence)pending=null});
  queue=run.catch(()=>{});return run;
 }
 function bounds(){
  live();current.root.updateMatrixWorld(true);const box=new THREE.Box3();
  if(overlay)return box.setFromObject(overlay.root);
  for(const node of stockNodes)box.union(new THREE.Box3().setFromObject(node));return box;
 }
 function focus(){const box=bounds();return {bounds:box,center:box.getCenter(new THREE.Vector3()),size:box.getSize(new THREE.Vector3())}}
 function dispose(){if(closed)return;closed=true;++sequence;pending=null;restoreStock();release(overlay);overlay=null}
 return {install,update,setPalette,reset:()=>install(host.default_configuration),bounds,focus,dispose,
  get active(){return active},get pending(){return pending},get entries(){return structuredClone(entries)},
  get current(){return overlay?{id:overlay.id,root:overlay.root,manifest:overlay.manifest,nodes:overlay.nodes,records:overlay.records}:null}};
}

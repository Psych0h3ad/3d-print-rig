import assert from 'node:assert/strict';

// VoronDesign/Voron-Trident a8628f48, original assembly occurrences and manual
// p290. The tape sheets are separate purchased leaves beside printed bodies.
export const bottomVHBSources=[
 ['1170','1171','Bottom_Panel_Hinge_VHB','Bottom_panel_hinge:1'],
 ['1173','1174','Bottom_Panel_Hinge_VHB','Bottom_panel_hinge:2'],
 ['1176','1177','Bottom_Panel_Clip_VHB','Bottom_panel_clip:1'],
 ['1179','1180','Bottom_Panel_Clip_VHB','Bottom_panel_clip:4'],
 ['1182','1183','Bottom_Panel_Clip_VHB','Bottom_panel_clip:3'],
 ['1185','1186','Bottom_Panel_Clip_VHB','Bottom_panel_clip:2'],
];
export function bottomVHBRows(manifest,size){
 assert([250,300,350].includes(size),'Unreviewed bottom VHB size');
 assert.equal(manifest.id,`voron_trident_${size}_base`);
 assert.equal(manifest.source_repository,'https://github.com/VoronDesign/Voron-Trident');
 assert.equal(manifest.source_commit,'a8628f48546948ce1fc15511b7765b7f31f80722');
 const rows=new Map(manifest.parts.map(p=>[p.key,p])),selected=[];
 for(const[owner,layer,name,parent]of bottomVHBSources){
  const prefix=`voron_trident_${size}_base_`,sheet=rows.get(prefix+layer),body=rows.get(prefix+owner);
  assert(sheet&&body,'Missing exact bottom tape/printed owner');
  assert.equal(sheet.source_leaf,layer);assert.equal(sheet.name,name);assert.equal(sheet.method,'rigid_source');
  const stem=`Panels:1/Opaque Panels:1/Bottom Panel:1/${parent}/`;
  assert.equal(sheet.source_component,stem+name+':1');assert.equal(body.source_leaf,owner);
  assert.equal(body.source_component,stem+(parent.startsWith('Bottom_panel_hinge')?'bottom_panel_hinge_x2:1':'bottom_panel_clip_x4:1'));
  selected.push({sheet,body});
 }
 return selected;
}
export function materialState(material){
 const json=material.toJSON();delete json.uuid;delete json.metadata;
 return {json,color:material.color.toArray()};
}
export function assertMaterialState(material,expected,label){assert.deepEqual(materialState(material),expected,label);}

export function auditTridentBottomVHB(loaded,{size,appearanceRole,createPaletteController}){
 const path=`machines/voron_trident_${size}/assembly_manifest.json`,component=loaded.inspection.components.find(c=>c.path===path);
 assert(component,'Missing actual default Trident base component');
 const pairs=bottomVHBRows(component.meta,size),wanted=new Set(pairs.flatMap(p=>[p.sheet.key,p.body.key])),nodes=new Map();
 component.root.traverse(mesh=>{if(!mesh.isMesh)return;const key=String(mesh.userData.part_key??mesh.name);if(!wanted.has(key))return;assert(!nodes.has(key),'Duplicate bottom source material slot');nodes.set(key,mesh)});
 assert.equal(nodes.size,12,'All six separate tape sheets and six printed owners required');
 const records=new Map(),original=[];
 for(const{sheet,body}of pairs){
  assert.equal(appearanceRole(sheet),null,'Purchased VHB inherited printed base role');
  assert.equal(appearanceRole(body),'base','Printed hinge/clip lost base role');
  records.set(sheet.key,{appearance_role:null});records.set(body.key,{appearance_role:'base'});
 }
 for(const[key,mesh]of nodes){assert(!Array.isArray(mesh.material),'Changed source material slot count');original.push({key,mesh,material:mesh.material,state:materialState(mesh.material),geometry:mesh.geometry,matrix:mesh.matrix.clone(),visible:mesh.visible})}
 let controller;const cloned=new Set();let checks=0,negativeAssertions=0;
 try{
  controller=createPaletteController(nodes,records,{printedFinish:false});
  for(const r of original){assert.notEqual(r.mesh.material,r.material,'Actual mesh material must be independently owned');cloned.add(r.mesh.material)}
  const a={base:'#fff000',accent:'#00c5ee',frame:'#b9bec4'},b={base:a.accent,accent:a.base,frame:'#24272c'};
  for(const palette of[a,b,a,JSON.parse(JSON.stringify(a)),{}]){
   controller.setPalette(palette);
   for(const{sheet,body}of pairs){
    const tape=original.find(r=>r.key===sheet.key),printed=original.find(r=>r.key===body.key);
    assertMaterialState(tape.mesh.material,tape.state,'Attached source VHB PBR changed '+sheet.key);checks++;
    assertMaterialState(tape.material,tape.state,'Shared original VHB source changed');
    if(palette.base)assert.equal(printed.mesh.material.color.getHexString(),palette.base.slice(1));
    else assertMaterialState(printed.mesh.material,printed.state,'Printed owner failed native color reset');
   }
  }
  for(const{sheet}of pairs){
   const r=original.find(s=>s.key===sheet.key),actual=r.mesh.material;
   const color=actual.color.clone();actual.color.set('#ff00ff');assert.throws(()=>assertMaterialState(actual,r.state,'Recolored actual VHB'));negativeAssertions++;actual.color.copy(color);
   const metalness=actual.metalness;actual.metalness=metalness===0?1:0;assert.throws(()=>assertMaterialState(actual,r.state,'Changed actual VHB finish'));negativeAssertions++;actual.metalness=metalness;
   const roughness=actual.roughness;actual.roughness=roughness===0?1:0;assert.throws(()=>assertMaterialState(actual,r.state,'Changed actual VHB roughness'));negativeAssertions++;actual.roughness=roughness;
   assertMaterialState(actual,r.state,'Actual VHB PBR restored after negatives');
  }
  for(const r of original){assert.equal(r.mesh.geometry,r.geometry);assert(r.mesh.matrix.equals(r.matrix));assert.equal(r.mesh.visible,r.visible);assertMaterialState(r.material,r.state,'Original shared material altered')}
  return {sourceLayers:6,printedOwners:6,paletteVisits:5,attachedMaterialChecks:checks,actualNegativeAssertions:negativeAssertions,originalMaterialsGeometryAndPlacementPreserved:true,materialRoleOnly:true,physicalFitQualified:false};
 }finally{
  for(const r of original)r.mesh.material=r.material;
  for(const material of cloned)material.dispose();
 }
}

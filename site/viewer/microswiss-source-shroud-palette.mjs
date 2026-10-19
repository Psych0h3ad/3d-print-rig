// Exact author-source identities. Purchased descendants and diagnostic CAD
// colors never determine a printed role. Geometry/source bytes are untouched.
const sources = {
 microswiss_ng_ender3: {sha:'cb0cfa9cc9dc495fe2b8b538a118e94aba295e8b9cdeb7327c3c5f45511ee425',key:'10',entry:'0:1:1:12',occurrence:'0:1:1:1:11',path:'91303ff89104a3e234fa23d4861268b051bb6c2ac8a52dcd300461d9d3c958a5'},
 microswiss_ng_revo_ender3: {sha:'594ff48ec7c0c548d6c85f45f1cdb5cc9120016eb9d038c7bc2df282e67651dc',key:'11',entry:'0:1:1:13',occurrence:'0:1:1:1:12',path:'4e1a8b440c2f91c727fe03e4ad3ea6f4c5944bfc8ecaf1d4e1394391fc73d388'}
};
const require = (condition, message) => {if(!condition)throw Error(message)};
export function hasMicroSwissSourceShroud(item){return Object.hasOwn(sources,item?.id)}
export function sourceShroud(meta){
 const s=sources[meta?.id];if(!s)return null;
 require(meta.source_sha256===s.sha,'Micro Swiss shroud source revision changed');
 const found=meta.parts.filter(p=>String(p.key)===s.key);
 require(found.length===1,'Missing or duplicate Micro Swiss source shroud');
 const p=found[0];
 require(p.source_sha256===s.sha&&p.source_entry===s.entry&&p.source_occurrence===s.occurrence&&p.source_path_sha256===s.path,'Micro Swiss shroud source identity mismatch');
 require(p.role==='base','Printed Micro Swiss source shroud has no base role');
 return {key:s.key,source:s};
}
export function createSourceShroudPalette(root,meta,partKey){
 const record=sourceShroud(meta);if(!record)return null;
 const meshes=[];root.traverse(m=>{if(m.isMesh&&partKey(m)===record.key)meshes.push(m)});
 require(meshes.length>0,'Micro Swiss source shroud has no actual mesh');
 const materials=[];
 for(const mesh of meshes){
  require(mesh.geometry?.attributes.position?.count>0,'Micro Swiss shroud mesh is empty');
  const convert=original=>{const material=original.clone();materials.push({material,color:original.color.clone(),metalness:original.metalness,roughness:original.roughness});return material};
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(convert):convert(mesh.material);
 }
 return {
  key:record.key,meshCount:meshes.length,
  setPalette(palette){require(/^#[0-9a-f]{6}$/i.test(palette?.base),'Invalid base color');for(const {material}of materials){material.color.set(palette.base);material.metalness=0;material.roughness=.58}},
  resetSource(){for(const p of materials){p.material.color.copy(p.color);p.material.metalness=p.metalness;p.material.roughness=p.roughness}},
  dispose(){for(const {material}of materials)material.dispose()}
 };
}
// Component references previously had no palette flow. This small, scoped
// control consumes the same guarded metadata as the installed manifest role.
export function mountSourceShroudPalette(before,onChange=()=>{}){
 let current=null;
 const section=document.createElement('details');section.hidden=true;section.open=true;
 const summary=document.createElement('summary');summary.textContent='Colors';
 const field=document.createElement('fieldset');
 const label=document.createElement('label');label.textContent='ベース';
 const input=document.createElement('input');input.type='color';input.value='#24272c';input.setAttribute('aria-label','ベース');label.append(input);field.append(label);section.append(summary,field);before.closest('aside').append(section);
 try{const saved=JSON.parse(localStorage.getItem('3d-print-rig-head-palette')||'null');if(/^#[0-9a-f]{6}$/i.test(saved?.base))input.value=saved.base}catch{}
 const apply=()=>{current?.setPalette({base:input.value});onChange()};input.addEventListener('input',apply);
 return {select(adapter){current=adapter;section.hidden=!adapter;apply()},dispose(){input.removeEventListener('input',apply);section.remove()}};
}

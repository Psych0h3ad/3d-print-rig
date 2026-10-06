// Own materials per mesh: source GLBs often share one material between many
// printed and purchased parts. A palette must never recolor that shared source.
export function createPaletteController(nodes,records,{roughness=.72,materialOverrides=new Map()}={}){
 const rows=[];
 for(const [key,node]of nodes)node.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
  const role=records.get(key)?.appearance_role||null;
  for(const material of [].concat(mesh.material)){
   const native=materialOverrides.get(key);
   if(native){if(role)throw Error('Native hardware override on a printed part');material.color.fromArray(native.color_linear);material.metalness=.65;material.roughness=.45;}
   rows.push({key,role,material,original:material.color.clone(),metalness:material.metalness,roughness:material.roughness});
   if(['base','accent'].includes(role)){material.metalness=0;material.roughness=roughness;}
   if(material.transparent)material.depthWrite=false;
  }
 });
 function setPalette(palette){
  for(const color of Object.values(palette))if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid palette color');
  for(const r of rows){r.material.color.copy(r.original);if(r.role&&palette[r.role])r.material.color.set(palette[r.role]);}
 }
 return {rows,setPalette};
}

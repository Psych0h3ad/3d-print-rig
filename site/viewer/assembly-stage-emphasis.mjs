// A display lease preserves original source materials, including shared and
// multi-material hardware. Only clones owned by this module may stand in for
// them during an assembly view; foreign material replacement still fails.
const leases=new WeakMap();
export function assemblySourceMaterial(node){
 const row=leases.get(node);
 if(!row)return node.material;
 if(node.material!==row.display)throw Error('Assembly display material changed outside its owner');
 return row.source;
}
export function createAssemblyStageEmphasis(){
 const owned=new Map();let disposed=false;
 function clear(){
  for(const [node,row]of owned)assemblySourceMaterial(node);
  for(const [node,row]of owned){node.material=row.source;leases.delete(node);for(const material of row.clones)material.dispose()}
  owned.clear();
 }
 function refresh(){
  for(const [node,row]of owned){assemblySourceMaterial(node);const originals=Array.isArray(row.source)?row.source:[row.source];row.clones.forEach((material,i)=>{material.copy(originals[i]);if(material.color)material.color.setHex(0x9ba2aa);material.opacity=Math.min(originals[i].opacity,.24);material.transparent=true;material.depthWrite=false;material.needsUpdate=true})}
 }
 function update({parts,currentKeys,enabled}={}){
  if(disposed)throw Error('Assembly display owner disposed');
  if(!Array.isArray(parts)||!Array.isArray(currentKeys))throw Error('Assembly display needs exact current source entries');
  const current=new Set(currentKeys),all=new Set(),emphasized=new Set();
  for(const part of parts){if(typeof part.key!=='string'||!Array.isArray(part.nodes))throw Error('Invalid assembly display entry');for(const root of part.nodes){if(!root?.traverse)throw Error('Missing source display node');root.traverse(n=>{if(n.isMesh&&n.material){all.add(n);if(current.has(part.key))emphasized.add(n)}})}}
  clear();
  // A chapter with no source operation should not turn the entire machine dim.
  if(!enabled||!emphasized.size)return;
  try{
   for(const node of all){if(emphasized.has(node))continue;if(leases.has(node))throw Error('Source display node already owned');const source=node.material,originals=Array.isArray(source)?source:[source],clones=Object.freeze(originals.map(m=>m.clone())),display=Array.isArray(source)?clones:clones[0],row={source,display,clones};owned.set(node,row);leases.set(node,row);node.material=display}
   refresh();
  }catch(error){clear();throw error}
 }
 return Object.freeze({update,refresh,clear,dispose(){
  let changed=false;
  for(const[node,row]of owned){if(node.material===row.display)node.material=row.source;else changed=true;leases.delete(node);for(const material of row.clones)material.dispose()}
  owned.clear();disposed=true;
  if(changed)throw Error('Assembly display material changed during retirement');
 }});
}

// Reviewed V0 manual pp18,20-26 and the later X-rail stage. This is a
// preparation display, not an insertion path or a native contact qualification.
const definitions={
 voron_v02_120:{manual:'69f989092ea63b60a15407ce1c4b4f9e260702330ae00416a059eb705d5170fe',model:'da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9',manifest:'16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c',prefix:'v02_',groups:[[56,67,'y-rails'],[79,90,'y-rails'],[102,113,'z-rails'],[125,136,'z-rails'],[320,331,'x-rail']]},
 voron_v02r1_120:{manual:'5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f',model:'d89064824fa67ed6e7c78e90c642620afe62c3b4520255f6c626181754b7d29d',manifest:'3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea',prefix:'v02r1_',groups:[[58,69,'y-rails'],[81,92,'y-rails'],[104,115,'z-rails'],[127,138,'z-rails'],[328,339,'x-rail']]},
};
const fail=message=>{throw Error('V0 rail preparation: '+message)};
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function bounds(node){
 const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 node.updateWorldMatrix(true,true);node.traverse(n=>{if(!n.isMesh||!n.geometry)return;
  n.geometry.computeBoundingBox();const b=n.geometry.boundingBox;
  for(let i=0;i<8;i++){const p=node.position.clone().set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).applyMatrix4(n.matrixWorld).toArray();
   if(!p.every(Number.isFinite))fail('Nonfinite source bounds');for(let a=0;a<3;a++){low[a]=Math.min(low[a],p[a]);high[a]=Math.max(high[a],p[a])}
  }
 });if(!low.every(Number.isFinite))fail('Missing source geometry');
 return {center:low.map((v,i)=>(v+high[i])/2),size:low.map((v,i)=>high[i]-v)};
}
export function createV0RailPreparation({nodes,manifest,spec}){
 const d=definitions[manifest.machine_id];
 if(!d||spec.manual.sha256!==d.manual||spec.model_sha256!==d.model||spec.manifest_sha256!==d.manifest)fail('Unreviewed source/manual identity');
 const key=n=>d.prefix+String(n).padStart(5,'0'),prep=spec.stages.findIndex(s=>s.id==='nut-carriers'),introduced=new Set(spec.stages[prep]?.part_keys);
 const groups=d.groups.map(([holder,first,stage])=>({holder:key(holder),keys:[key(holder),...Array.from({length:10},(_,i)=>key(first+i))],installed:spec.stages.findIndex(s=>s.id===stage)}));
 const keys=groups.flatMap(g=>g.keys),parts=new Map(manifest.parts.map(p=>[p.key,p]));
 if(prep<0||new Set(keys).size!==55||introduced.size!==55||keys.some(k=>!introduced.has(k))||groups.some(g=>g.installed<=prep))fail('Changed preparation/installation stages');
 for(const g of groups){if(!/^M2 Hex Adapter(?: \(\d+\))?$/.test(parts.get(g.holder)?.name||''))fail('Changed holder identity');
  for(const k of g.keys){const n=nodes.get(k);if(!n?.matrix?.clone||!n.matrixAutoUpdate||!n.parent?.matrixWorld?.clone)fail('Missing source transform');
   if(k!==g.holder&&!/^M2 Hex Nut(?: \(\d+\))?$/.test(parts.get(k)?.name||''))fail('Changed nut identity');
   for(let p=n.parent;p;p=p.parent)if(keys.some(x=>nodes.get(x)===p))fail('Nested preparation parts');
  }
 }
 let saved=null,expected=null;
 const transform=n=>({position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),matrix:n.matrix.toArray(),world:n.matrixWorld.toArray(),auto:n.matrixAutoUpdate});
 function check(){if(!expected)return;for(const[k,e]of expected){const n=nodes.get(k);n.updateWorldMatrix(true,false);const t=transform(n);
  if(t.auto!==e.auto||['position','quaternion','scale','matrix','world'].some(f=>!equal(t[f],e[f])))fail('Source transform changed outside preparation: '+k);
 }}
 function capture(){
  saved=new Map(keys.map(k=>{const n=nodes.get(k);n.updateWorldMatrix(true,false);return [k,transform(n)]}));expected=new Map(saved);
 }
 function write(rows){for(const[k,s]of rows){const n=nodes.get(k);n.position.fromArray(s.position);n.quaternion.fromArray(s.quaternion);n.scale.fromArray(s.scale);n.matrix.fromArray(s.matrix);n.matrixWorldNeedsUpdate=true;n.updateWorldMatrix(true,true)}}
 function restore(){write(saved)}
 function apply(index){
  const priorSaved=saved,priorExpected=expected,prior=new Map(keys.map(k=>{const n=nodes.get(k);n.updateWorldMatrix(true,false);return [k,transform(n)]}));
  try{if(!saved)capture();restore();
  if(index===prep)for(const[gIndex,g]of groups.entries()){
   const holder=nodes.get(g.holder),b=bounds(holder),long=b.size.indexOf(Math.max(...b.size));
   const nuts=g.keys.slice(1).map(k=>bounds(nodes.get(k)).center),delta=[0,1,2].map(a=>nuts.reduce((s,c)=>s+c[a],0)/nuts.length-b.center[a]);delta[long]=0;
   const normal=delta.map(Math.abs).indexOf(Math.max(...delta.map(Math.abs)));
   if(long===normal||Math.abs(delta[normal])<1e-5||b.size[long]<.14||b.size[long]>.15)fail('Unexpected source carrier frame');
   const x=[0,0,0],y=[0,0,0];x[long]=1;y[normal]=Math.sign(delta[normal]);const z=cross(x,y),r=[x,y,z],target=[0,.01,(gIndex-2)*.018];
   const t=target.map((v,a)=>v-r[a].reduce((s,n,i)=>s+n*b.center[i],0));
   const matrix=holder.matrix.clone().fromArray([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,...t,1]);
   for(const k of g.keys){const n=nodes.get(k);n.parent.updateWorldMatrix(true,false);const local=n.parent.matrixWorld.clone().invert().multiply(matrix).multiply(n.matrixWorld);
    local.decompose(n.position,n.quaternion,n.scale);n.updateMatrix();n.updateWorldMatrix(true,true);
    if(!n.matrixWorld.elements.every(Number.isFinite)||n.scale.toArray().some((s,i)=>Math.abs(s-saved.get(k).scale[i])>1e-10))fail('Invalid rigid preparation transform');
   }
  }
  expected=new Map(keys.map(k=>[k,transform(nodes.get(k))]));
  }catch(error){write(prior);saved=priorSaved;expected=priorExpected;throw error}
 }
 return {check,apply,leave(){check();if(saved)restore();saved=null;expected=null},
  deferred(index){return index===prep?[]:groups.filter(g=>index>=prep&&index<g.installed).flatMap(g=>g.keys)},
  focus(index){return groups.filter(g=>g.installed===index).flatMap(g=>g.keys)},
  prepared:index=>index===prep,
 };
}

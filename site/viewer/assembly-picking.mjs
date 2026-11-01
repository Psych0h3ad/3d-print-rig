import * as THREE from './vendor/three.module.js';

// Picking is a source-identity lookup. It never changes geometry or materials.
export function createAssemblyPicker({element,camera,entries,onPick}){
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
 const begin=e=>{down=e.button===0?{x:e.clientX,y:e.clientY,id:e.pointerId}:null};
 const cancel=()=>{down=null};
 const end=e=>{
  const start=down;down=null;if(!start||e.button!==0||e.pointerId!==start.id||Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)return;
  const box=element.getBoundingClientRect();if(!(box.width>0&&box.height>0))return;
  const rows=entries();if(!rows.length)return;const owners=new WeakMap(),roots=[];
  for(const {key,node}of rows){roots.push(node);node.traverse(n=>{if(!owners.has(n))owners.set(n,key);else if(owners.get(n)!==key)owners.set(n,null)})}
  pointer.set((e.clientX-box.left)/box.width*2-1,-(e.clientY-box.top)/box.height*2+1);ray.setFromCamera(pointer,camera);
  for(const hit of ray.intersectObjects(roots,true)){let visible=true;for(let n=hit.object;n;n=n.parent)if(!n.visible){visible=false;break}const key=owners.get(hit.object);if(visible&&key){onPick(key);return}}
 };
 element.addEventListener('pointerdown',begin);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',cancel);
 return {dispose(){element.removeEventListener('pointerdown',begin);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',cancel);down=null}};
}

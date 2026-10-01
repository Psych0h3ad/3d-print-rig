import * as THREE from 'three';

export function setupGrid(scene,update){
 const grid=new THREE.GridHelper(1.2,24,'#adbcc6','#d2dce2');grid.name='FloorGrid';grid.position.y=-.096;
 grid.material.transparent=true;grid.material.opacity=.65;scene.add(grid);
 const input=document.querySelector('#gridVisible'),key='3d-print-rig-grid-visible';
 let visible=false;try{visible=localStorage.getItem(key)==='true'}catch{}
 function apply(){grid.visible=input.checked;document.body.dataset.gridVisible=String(grid.visible);update()}
 input.checked=visible;apply();input.onchange=()=>{try{localStorage.setItem(key,String(input.checked))}catch{}apply()};
 return grid;
}

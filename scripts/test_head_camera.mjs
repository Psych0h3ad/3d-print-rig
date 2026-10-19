import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {frameHeadBounds}=await import('../site/viewer/head-camera.mjs');
const {default:assert}=await import('node:assert/strict');

// Measured mobile canvas: 390x299; controls and sponsor obscure its top/bottom.
// Check projected corners independently rather than comparing camera distances.
let checks=0;
for(const [width,height,insets]of [[390,299,{top:60,bottom:62}],[320,250,{top:56,bottom:62}],[914,635,{}]]){
 for(const [direction,up]of [[[1,.65,1.4],[0,1,0]],[[0,0,1],[0,1,0]],[[0,0,-1],[0,1,0]],[[1,0,0],[0,1,0]],[[0,-1,0],[0,0,-1]]]){
  const camera=new THREE.PerspectiveCamera(38,1,.0005,5);camera.up.fromArray(up);
  const controls={target:new THREE.Vector3(),maxDistance:1.5,update(){const delta=camera.position.clone().sub(this.target);if(delta.length()>this.maxDistance)camera.position.copy(this.target).add(delta.setLength(this.maxDistance));camera.lookAt(this.target)}};
  // SB/Rapido X actual displayed dimensions, plus a wide asymmetric head bank.
  for(const size of [[.0711,.1446,.099],[.09868,.09634,.06688],[.36,.12,.18],[1.2,.12,.18]]){
   const box=new THREE.Box3(new THREE.Vector3(-.02,.03,-.04),new THREE.Vector3(-.02,.03,-.04).add(new THREE.Vector3(...size)));
   frameHeadBounds(camera,controls,box,{direction,width,height,insets});
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera),px=(p.x+1)*width/2,py=(1-p.y)*height/2;
    assert(px>=(insets.left||0)&&px<=width-(insets.right||0));
    assert(py>=(insets.top||0)&&py<=height-(insets.bottom||0),'Head geometry overlaps the mobile controls or sponsor');
    assert(p.z>-1&&p.z<1,'Head geometry is clipped');checks++;
   }
  }
  frameHeadBounds(camera,controls,new THREE.Box3(new THREE.Vector3(-.05,-.05,-.05),new THREE.Vector3(.05,.05,.05)),{direction,width,height});
  assert(!camera.view?.enabled,'Desktop reset must remove the mobile projection offset');
 }
}
console.log(`Head framing: ${checks} projected corners remain within the unobscured canvas across five views and mobile/desktop sizes.`);

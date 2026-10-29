import {configureBiquPreviewGroups,createBiquLayerMaterial} from './layout-biqu-display.mjs?v=58992b18f1b355de3f74';
import {BIQU_POPSTATION_PREVIEW} from './layout-biqu-popstation.mjs?v=0a8899673b99fcdc2eb5';
// Prepared mesh coordinates already use the shared floor datum. Bounding-box
// centerM/sizeM describe the part; they are not a second object transform.
import {LAYOUT_EQUIPMENT_PREVIEW} from './layout-equipment.mjs?v=158bc98943454b7e3fd4';
// Exact prepared intrinsic closure; this branch never constructs a second cap.
export const U1_INTRINSIC_BOTTOM_SOURCE=Object.freeze({
  name:'bottom_closure / closed bottom display plate',
  previewGeometryId:'u1-exterior-exterior-dbbb9777ea5b4d',
  previewBodySHA256:'2d550ca3761fbdde8cf57a396ac816cf70efc8b7965e92396f727322e5f7779e',
  models:Object.freeze({
    standalone:Object.freeze({path:'layout/assets/equipment/u1-exterior/U1_exterior_standalone_loaded.glb',bytes:5751820,sha256:'10fea968e60fd90fe3ac7652a71a35795b949584477d32c9c514c6b325e67768'}),
    docked:Object.freeze({path:'layout/assets/equipment/u1-exterior/U1_exterior_docked.glb',bytes:5262896,sha256:'ab0aaaa9adc6aabaca1a45000902a97f1a9a9fc80db8f3807d3a7cf3c3880fe5'})
  })
});
function deriveLegacyPreviewBottom(){
  const hash=LAYOUT_EQUIPMENT_PREVIEW.body.sha256;
  if(hash===U1_INTRINSIC_BOTTOM_SOURCE.previewBodySHA256){
    if(!Object.hasOwn(LAYOUT_EQUIPMENT_PREVIEW.geometry,U1_INTRINSIC_BOTTOM_SOURCE.previewGeometryId))
      throw bottomFail('intrinsic preview closure receipt missing');
    return false;
  }
  if(hash==='3963e49ff68e19254a2c38ddddf56f411c8885886b2ce425ad9c84d904203b38')return true;
  throw bottomFail('unreviewed preview body');
}
export const U1_BOTTOM_SOURCE=Object.freeze({
  id:'snapmaker_u1_layout_reference',name:'casing / lower casing perimeter rim',
  previewGeometryId:'u1-exterior-exterior-9c5aa700906a4c',
  derivativeName:'derived / U1 lower shell closure',
  models:Object.freeze({
    standalone:Object.freeze({path:'layout/assets/equipment/u1-exterior/U1_exterior_standalone_loaded.glb',bytes:3631984,sha256:'f68bf8498a9a2d3114a6f8fff7af45c495208ac5098616426f3bc835e9089bd7'}),
    docked:Object.freeze({path:'layout/assets/equipment/u1-exterior/U1_exterior_docked.glb',bytes:3143064,sha256:'de89610a4bdfb1b108498f345effe92109022d641d882c5ff113f01f57acc369'})
  })
});
const bottomFail=message=>Object.assign(new Error('U1 lower shell closure: '+message),{code:'LAYOUT_U1_BOTTOM_GEOMETRY'});
const area=loop=>loop.reduce((sum,a,i)=>{const b=loop[(i+1)%loop.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
const inside=(point,loop)=>{
  let result=false;
  for(let i=0,j=loop.length-1;i<loop.length;j=i++){
    const a=loop[i],b=loop[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
};

/** Close only the measured hole in the existing lower rim, at its two authored
 * horizontal faces. No nominal printer/bed dimensions or interior parts enter
 * this construction. Source buffers, including their normals, stay untouched.
 */
export function deriveU1Bottom(THREE,positions,indices){
  if(!positions?.length||positions.length%3||positions.length>12288||!indices?.length||indices.length%3||indices.length>24576
    ||!positions.every(Number.isFinite)||!indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<positions.length/3))throw bottomFail('invalid rim arrays');
  let low=Infinity,high=-Infinity;
  for(let i=1;i<positions.length;i+=3){low=Math.min(low,positions[i]);high=Math.max(high,positions[i]);}
  if(!(high-low>1e-6&&high-low<.02))throw bottomFail('expected two distinct lower-rim planes');
  const output={positionsM:[],normals:[],indices:[],planes:[]},epsilon=1e-7;
  for(const [y,normal]of [[low,-1],[high,1]]){
    const points=[],vertices=new Map(),edges=new Map();let surfaceArea=0;
    const vertex=i=>{
      const x=positions[i*3],z=positions[i*3+2],key=Math.round(x/epsilon)+','+Math.round(z/epsilon);
      if(!vertices.has(key)){vertices.set(key,points.length);points.push([x,z]);}
      return vertices.get(key);
    };
    for(let i=0;i<indices.length;i+=3){
      const triangle=Array.from(indices.slice(i,i+3));
      if(!triangle.every(j=>Math.abs(positions[j*3+1]-y)<epsilon))continue;
      const ids=triangle.map(vertex);if(new Set(ids).size!==3)throw bottomFail('collapsed rim face');
      surfaceArea+=Math.abs(area(ids.map(j=>points[j])));
      for(let j=0;j<3;j++){
        const a=ids[j],b=ids[(j+1)%3],key=a<b?a+','+b:b+','+a,edge=edges.get(key);
        if(edge){if(++edge.count>2)throw bottomFail('nonmanifold rim face');}
        else edges.set(key,{a,b,count:1});
      }
    }
    const adjacent=new Map(),unvisited=new Set();
    for(const {a,b,count}of edges.values())if(count===1){
      for(const [from,to]of [[a,b],[b,a]]){if(!adjacent.has(from))adjacent.set(from,[]);adjacent.get(from).push(to);unvisited.add(from);}
    }
    if(!adjacent.size||[...adjacent.values()].some(a=>a.length!==2))throw bottomFail('rim face has no closed boundary');
    const loops=[];
    while(unvisited.size){
      const start=unvisited.values().next().value,loop=[];let previous=-1,current=start;
      do{
        if(!unvisited.delete(current))throw bottomFail('ambiguous rim boundary');
        loop.push(points[current]);const next=adjacent.get(current).find(i=>i!==previous);previous=current;current=next;
      }while(current!==start);
      if(loop.length<3)throw bottomFail('short rim boundary');loops.push(loop);
    }
    if(loops.length!==2)throw bottomFail('expected one exterior boundary and one interior hole');
    loops.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
    const [outer,hole]=loops,outerArea=Math.abs(area(outer)),holeArea=Math.abs(area(hole));
    if(!(holeArea>0&&holeArea<outerArea)||!hole.every(p=>inside(p,outer))
      ||Math.abs(surfaceArea-(outerArea-holeArea))>1e-8)throw bottomFail('rim is not the measured annulus');
    const faces=THREE.ShapeUtils.triangulateShape(hole.map(p=>new THREE.Vector2(...p)),[]);
    if(faces.length!==hole.length-2)throw bottomFail('incomplete hole triangulation');
    const offset=output.positionsM.length/3;let filledArea=0;
    for(const [x,z]of hole){output.positionsM.push(x,y,z);output.normals.push(0,normal,0);}
    for(const face of faces){
      const triangle=face.map(i=>hole[i]),signedArea=area(triangle);
      if(!Number.isFinite(signedArea)||Math.abs(signedArea)<1e-14)throw bottomFail('degenerate closure face');
      filledArea+=Math.abs(signedArea);
      // Positive XZ signed area faces -Y in the shared +Y-up frame.
      const oriented=signedArea*normal<0?face:[face[0],face[2],face[1]];
      output.indices.push(...oriented.map(i=>i+offset));
    }
    if(Math.abs(filledArea-holeArea)>1e-8)throw bottomFail('closure area differs from measured hole');
    output.planes.push({yM:y,normalY:normal,boundaryVertices:hole.length,areaM2:holeArea});
  }
  output.receipt={kind:'u1-lower-shell-closure-v1',sourceName:U1_BOTTOM_SOURCE.name,
    basis:'Inner boundary of each prepared lower-rim face; source geometry unchanged; exterior closure only',
    sourceVertices:positions.length/3,sourceIndices:indices.length,vertices:output.positionsM.length/3,triangles:output.indices.length/3,
    planes:output.planes};
  return output;
}

function bufferGeometry(THREE,positions,normals,indices){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(normals),3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** The full reference retains every authored mesh, material and matrix. The
 * separate derivative inherits only the lower rim's opaque PBR material.
 */
export function addU1BottomClosure(THREE,root,row){
  if(row.id!==U1_BOTTOM_SOURCE.id)return null;
  const intrinsic=U1_INTRINSIC_BOTTOM_SOURCE.models[row.equipmentVariant];
  if(intrinsic&&Object.entries(intrinsic).every(([k,v])=>row.model?.[k]===v)){
    const matches=[];let derivative=false;
    root.updateMatrixWorld(true);
    root.traverse(node=>{
      if(node.isMesh&&((node.userData.name??node.name)===U1_INTRINSIC_BOTTOM_SOURCE.name
        ||node.userData.groupId==='bottom_closure'||node.userData.groupKind==='bottom_closure'))matches.push(node);
      if((node.userData.name??node.name)===U1_BOTTOM_SOURCE.derivativeName
        ||node.userData.layoutEquipmentDerivative||node.geometry?.userData.layoutEquipmentDerivative)derivative=true;
    });
    if(matches.length!==1||(matches[0].userData.name??matches[0].name)!==U1_INTRINSIC_BOTTOM_SOURCE.name
      ||matches[0].userData.groupId!=='bottom_closure'
      ||matches[0].userData.groupKind!=='bottom_closure'||!matches[0].material?.isMeshStandardMaterial
      ||matches[0].material.transparent||matches[0].material.opacity!==1||derivative
      ||!matches[0].matrixWorld.equals(new THREE.Matrix4())
      ||!matches[0].geometry?.getAttribute('position')?.count
      ||matches[0].geometry.getAttribute('normal')?.count!==matches[0].geometry.getAttribute('position').count
      ||!matches[0].geometry.index?.count)
      throw bottomFail('intrinsic bottom occurrence missing, duplicated or changed');
    return null;
  }
  const pin=U1_BOTTOM_SOURCE.models[row.equipmentVariant];
  if(!pin||Object.entries(pin).some(([k,v])=>row.model?.[k]!==v))throw bottomFail('unreviewed source model');
  root.updateMatrixWorld(true);const matches=[];
  root.traverse(node=>{if(node.isMesh&&(node.userData.name??node.name)===U1_BOTTOM_SOURCE.name)matches.push(node);});
  if(matches.length!==1)throw bottomFail('exact lower rim occurrence missing or duplicated');
  const rim=matches[0],p=rim.geometry?.getAttribute('position'),n=rim.geometry?.getAttribute('normal'),ix=rim.geometry?.index;
  if(p?.count!==512||n?.count!==512||ix?.count!==1440||p.isInterleavedBufferAttribute||n.isInterleavedBufferAttribute
    ||rim.userData.groupId!=='casing'||rim.userData.groupKind!=='casing'
    ||!rim.matrixWorld.equals(new THREE.Matrix4())||!rim.material?.isMeshStandardMaterial||rim.material.transparent||rim.material.opacity!==1)
    throw bottomFail('lower rim source contract changed');
  if(rim.children.some(n=>n.userData.layoutEquipmentDerivative))throw bottomFail('duplicate closure');
  const cap=deriveU1Bottom(THREE,p.array,ix.array),geometry=bufferGeometry(THREE,cap.positionsM,cap.normals,cap.indices);
  geometry.userData.layoutEquipmentDerivative=cap.receipt;
  const mesh=new THREE.Mesh(geometry,rim.material);mesh.name=U1_BOTTOM_SOURCE.derivativeName;
  mesh.userData={layoutEquipmentDerivative:cap.receipt,groupId:'casing',groupKind:'casing'};
  mesh.castShadow=mesh.receiveShadow=true;rim.add(mesh);
  return {...cap.receipt,sourceModel:{...pin}};
}

export function createEquipmentMeshCache(THREE) {
  const entries=new Map(),layerMaterials=new Map();let disposed=false;
  const fail=message=>Object.assign(new Error(message),{code:'LAYOUT_EQUIPMENT_PREVIEW_GEOMETRY'});
  return Object.freeze({
    get(part){
      if(disposed)throw fail('Equipment geometry cache is disposed');
      const {geometryId,positionsM,normals,indices}=part;
      if(typeof geometryId!=='string'||!geometryId||!Array.isArray(positionsM)||!Array.isArray(normals)||!Array.isArray(indices))
        throw Object.assign(fail('Prepare equipment geometry before drawing'),{code:'LAYOUT_EQUIPMENT_PREVIEW_NOT_READY'});
      const old=entries.get(geometryId);
      if(old){
        if(old.positionsM!==positionsM||old.normals!==normals||old.indices!==indices)throw fail('Equipment geometry identity changed');
        return old.geometry;
      }
      if(entries.size>=32||!positionsM.length||positionsM.length%3||normals.length!==positionsM.length||!indices.length||indices.length%3
        ||!positionsM.every(Number.isFinite)||!normals.every(Number.isFinite)
        ||!indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<positionsM.length/3))throw fail('Invalid equipment mesh arrays');
      let geometry;
      if(geometryId===U1_BOTTOM_SOURCE.previewGeometryId&&deriveLegacyPreviewBottom()){
        if(positionsM.length!==288*3||indices.length!==256*3)throw bottomFail('preview rim source contract changed');
        const cap=deriveU1Bottom(THREE,positionsM,indices),offset=positionsM.length/3;
        geometry=bufferGeometry(THREE,[...positionsM,...cap.positionsM],[...normals,...cap.normals],
          [...indices,...cap.indices.map(i=>i+offset)]);
        geometry.userData.layoutEquipmentDerivative={...cap.receipt,sourceGeometryId:geometryId};
      }else geometry=bufferGeometry(THREE,positionsM,normals,indices);
      configureBiquPreviewGroups(geometry,part);
      entries.set(geometryId,{positionsM,normals,indices,geometry});return geometry;
    },
    displayMaterials(part,material){
      if(disposed)throw fail('Equipment geometry cache is disposed');
      if(part.geometryId!==BIQU_POPSTATION_PREVIEW.geometryId)return material;
      if(!layerMaterials.has(material))layerMaterials.set(material,createBiquLayerMaterial(material));
      return [material,layerMaterials.get(material)];
    },
    dispose(){if(disposed)return;disposed=true;for(const {geometry}of entries.values())geometry.dispose();entries.clear();for(const material of layerMaterials.values())material.dispose();layerMaterials.clear();}
  });
}

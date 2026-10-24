// Prepared mesh coordinates already use the shared floor datum. Bounding-box
// centerM/sizeM describe the part; they are not a second object transform.
export function createEquipmentMeshCache(THREE) {
  const entries=new Map();let disposed=false;
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
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positionsM),3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(normals),3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      entries.set(geometryId,{positionsM,normals,indices,geometry});return geometry;
    },
    dispose(){if(disposed)return;disposed=true;for(const {geometry}of entries.values())geometry.dispose();entries.clear();}
  });
}

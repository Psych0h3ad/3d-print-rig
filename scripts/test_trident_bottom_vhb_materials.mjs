import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {createPaletteController} from '../site/viewer/palette-controller.mjs';
import {bottomVHBSources,bottomVHBRows,auditTridentBottomVHB} from './trident_bottom_vhb_audit.mjs';

let sourceRows=0,identityNegatives=0,actualSlotFixtureChecks=0;
for(const size of[250,300,350]){
 const meta=JSON.parse(await fs.readFile(new URL(`../site/machines/voron_trident_${size}/assembly_manifest.json`,import.meta.url)));
 const selected=bottomVHBRows(meta,size);assert.equal(selected.length,6);
 for(const{sheet,body}of selected){
  assert.equal(appearanceRole(sheet),null);assert.equal(appearanceRole(body),'base');sourceRows++;
  for(const mutation of[{key:'another_'+sheet.key},{source_leaf:body.source_leaf},{name:body.name},{source_component:body.source_component},{method:'unknown'}]){assert.equal(appearanceRole({...sheet,...mutation}),'base','Unreviewed identity cannot inherit VHB override');identityNegatives++}
 }
 const root=new THREE.Group(),source=new THREE.MeshStandardMaterial({color:'#494949',metalness:.17,roughness:.63});
 for(const pair of selected)for(const row of[pair.sheet,pair.body]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),source);mesh.userData.part_key=row.key;root.add(mesh)}
 const loaded={inspection:{components:[{path:`machines/voron_trident_${size}/assembly_manifest.json`,root,meta}]}};
 const original=root.children.map(m=>m.material),report=auditTridentBottomVHB(loaded,{size,appearanceRole,createPaletteController});
 assert.equal(report.attachedMaterialChecks,30);assert.equal(report.actualNegativeAssertions,18);actualSlotFixtureChecks+=report.attachedMaterialChecks;
 root.children.forEach((mesh,i)=>assert.equal(mesh.material,original[i],'Helper restores actual original source material reference'));
 assert.throws(()=>auditTridentBottomVHB(loaded,{size,appearanceRole:p=>p.key.includes('_base_')?'base':appearanceRole(p),createPaletteController}),/Purchased VHB inherited/,'Classifier leak must fail against independent purchased role expectation');
 const clone=structuredClone(meta),bad=clone.parts.find(p=>p.key===selected[0].sheet.key);bad.source_component=selected[0].body.source_component;
 assert.throws(()=>bottomVHBRows(clone,size),/Assertion/,'Changed source owner is not an approved adhesive');
 root.traverse(n=>n.geometry?.dispose());source.dispose();
}
assert.equal(bottomVHBSources.length,6);assert.equal(sourceRows,18);assert.equal(identityNegatives,90);
console.log(JSON.stringify({passed:true,sourceRows,identityNegatives,materialFixtureChecks:actualSlotFixtureChecks,scope:'Exact original source occurrences plus adversarial material/controller fixtures. Actual exported sheets are required separately by the normal source-map release gate; no holding or physical-fit qualification.'}));

import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const {cameraAngles,createExportCamera}=await import('../site/viewer/export-camera.mjs');
const camera=new THREE.PerspectiveCamera(38,1,.001,10),target=new THREE.Vector3(.1,.2,.3);camera.position.set(.6,.7,1);camera.lookAt(target);camera.updateMatrixWorld(true);
const before=camera.toJSON(),angles=cameraAngles(camera,target),out=createExportCamera(camera,{mode:'custom',target,...angles,aspect:2});assert(out.position.distanceTo(camera.position)<1e-9);assert(out.getWorldDirection(new THREE.Vector3()).distanceTo(camera.getWorldDirection(new THREE.Vector3()))<1e-9);assert.equal(out.aspect,2);
for(const elevation of [-90,-45,0,45,90])for(const azimuth of [-180,-90,0,90,180])for(const roll of [0,37]){const copy=createExportCamera(camera,{mode:'custom',target,elevation,azimuth,roll,distanceMm:1000});assert(Math.abs(copy.position.distanceTo(target)-1)<1e-9);assert(copy.getWorldDirection(new THREE.Vector3()).distanceTo(target.clone().sub(copy.position).normalize())<1e-9);assert(copy.matrixWorld.elements.every(Number.isFinite))}
assert.deepEqual(camera.toJSON(),before);assert.deepEqual(createExportCamera(camera).quaternion.toArray(),camera.quaternion.toArray());assert.throws(()=>createExportCamera(camera,{mode:'custom',target,elevation:91,distanceMm:1000}));assert.throws(()=>createExportCamera(camera,{mode:'custom',target,distanceMm:NaN}));
console.log('Export camera: 50 custom views, top/bottom/roll, orbit target and live-camera preservation passed.');

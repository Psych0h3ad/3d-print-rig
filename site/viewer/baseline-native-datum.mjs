// Existing SB datum correction only; original registry evidence is unchanged.
import {contentSHA256} from './mount-validation.mjs';
export {contentSHA256};
export const NATIVE_BASELINE_SOURCE=Object.freeze({file:'TRIDENT_SB_NATIVE_DATUM.json',sha256:'c567548b21ed8b6675fd0b54d5b984fd61526babdb9845c074c814a0967cb441'});
export function baselineReference(profile,variant,fallback=profile.display_reference_xyz_mm){
 return [...(variant?.native_reference_92?.reference_xyz_mm||fallback)];
}
export function baselineLimits(original,stockReference,reference,variant){
 const limits=Object.fromEntries(['X','Y','Z'].map(a=>[a,[...original[a]]]));
 if(!variant?.native_reference_92||variant.machine_gantry)return limits;
 for(const[i,a]of ['X','Y','Z'].entries()){
  const shift=reference[i]-stockReference[i];
  limits[a]=[Math.max(original[a][0],original[a][0]+shift),Math.min(original[a][1],original[a][1]+shift)];
  if(!limits[a].every(Number.isFinite)||limits[a][0]>limits[a][1])throw Error('Empty native baseline domain');
 }
 return limits;
}
export function baselineResetPose(reference,signedBedDrop){
 if(!reference.every(Number.isFinite)||!Number.isFinite(signedBedDrop))throw Error('Invalid native baseline reset datum');
 return [reference[0],reference[1],Math.max(0,-signedBedDrop)];
}
export function baselineGcodeContext(variant,bank,reference){
 return {configuration:variant.id,bank,reference_xyz_mm:[...reference],native_baseline:variant.native_reference_92?{
  source_file:NATIVE_BASELINE_SOURCE.file,source_url:new URL('../'+NATIVE_BASELINE_SOURCE.file,import.meta.url).href,
  source_sha256:NATIVE_BASELINE_SOURCE.sha256,datum:JSON.parse(JSON.stringify(variant.native_reference_92))
 }:null};
}

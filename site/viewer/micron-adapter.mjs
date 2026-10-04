/** Micron: fixed bed, Z gantry, Y X-beam, XYZ toolhead. Baked CAD placement. */
import {appearanceRole} from './appearance-role.mjs?v=public-v25';
import {createMicronBelts} from './micron-belts.mjs?v=public-v25';
import {createMicronFlexible} from './micron-flexible.mjs?v=f60dbb5f5765a15dfc34';
export const cadToGlb = ([x,y,z]) => [x / 1000, z / 1000, -y / 1000];
export const corexyDelta = ([x,y]) => ({a_mm: x + y, b_mm: x - y});
export const corexyInverse = (a,b) => [(a + b) / 2, (a - b) / 2];

export function poseDelta(profile, pose, {requireClearanceEnvelope = false} = {}) {
  const xyz = ['x','y','z'].map(a => pose[a]);
  if (xyz.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid XYZ pose');
  const limits = requireClearanceEnvelope ? profile.sampled_clearance_limits_mm : profile.display_limits_mm;
  if (!limits) throw new Error('No validated clearance envelope; geometry review only');
  for (let i = 0; i < 3; i++) {
    const lim = limits['XYZ'[i]];
    if (!lim || xyz[i] < lim[0] - 1e-8 || xyz[i] > lim[1] + 1e-8) throw new Error(`Out of range ${'XYZ'[i]}=${xyz[i]}`);
  }
  return xyz.map((v,i) => v - profile.display_reference_xyz_mm[i]);
}

export function partTranslation(part, delta) {
  const cad = delta.map((v,i) => part.motion_axes.includes('XYZ'[i]) ? v : 0);
  return {cad_mm: cad, glb_m: cadToGlb(cad)};
}

export function createMicronAdapter(root, manifest, profile) {
  if (manifest.machine_id !== profile.machine_id || !/^micron(_plus)?_r1_(120|180)$/.test(profile.machine_id)) throw new Error('Micron profile mismatch');
  const records = new Map(manifest.parts.map(p => [p.key,{...p,appearance_role:['m180_01765','m180_01766'].includes(p.key)?'base':appearanceRole(p)}]));
  if (records.size !== manifest.parts.length) throw new Error('Duplicate part key');
  const nodes = new Map();
  root.traverse(o => {
    const key = o.userData?.part_key;
    if (records.has(key) && o.parent?.userData?.part_key !== key) {
      if (nodes.has(key)) throw new Error(`Duplicate GLB node ${key}`);
      nodes.set(key,o);
    }
  });
  const missing = [...records.keys()].filter(k => !nodes.has(k));
  if (missing.length) throw new Error(`Missing ${missing.length} parts`);
  const origins = new Map([...nodes].map(([k,o]) => [k,o.position.clone()]));
  const belts=createMicronBelts(nodes,records,profile);
  const flexible=createMicronFlexible(nodes,records,profile);
  let lastPose, flexibleVisible = true, enclosureVisible = true;
  function setPose(pose, options) {
    const delta = poseDelta(profile,pose,options);
    const atReference = delta.every(v => Math.abs(v) < 1e-6);
    for (const [key,o] of nodes) {
      const row = records.get(key), d = partTranslation(row,delta).glb_m, origin = origins.get(key);
      if (!flexible.keys.has(key)) o.position.set(origin.x + d[0],origin.y + d[1],origin.z + d[2]);
      if (row.motion === 'reference_flexible'&&!belts.keys.has(key)) o.visible = flexibleVisible;
      else if (row.group === 'Micron_Enclosure') o.visible = enclosureVisible;
    }
    const beltState=belts.update(delta,flexibleVisible);
    const flexibleState=flexible.update(delta,flexibleVisible);
    lastPose = {...pose};
    const envelope = profile.sampled_clearance_limits_mm;
    const within = Boolean(envelope) && ['x','y','z'].every((a,i) => pose[a] >= envelope['XYZ'[i]][0] && pose[a] <= envelope['XYZ'[i]][1]);
    return {xyz_mm: ['x','y','z'].map(a => pose[a]), cad_delta_xyz_mm: delta,
      corexy_delta: corexyDelta(delta), common_z_motor_delta_mm: delta[2],
      within_sampled_clearance_envelope: within, atReference,belts:beltState,flexible:flexibleState,
      independent_z_leveling: 'pending; common Z translation only'};
  }
  function setFlexibleVisible(value) {flexibleVisible = Boolean(value); if (lastPose) setPose(lastPose);}
  function setEnclosureVisible(value) {enclosureVisible = Boolean(value); for (const [k,o] of nodes) if (records.get(k).group === 'Micron_Enclosure') o.visible = enclosureVisible;}
  function setPalette(palette) {
    for (const [k,o] of nodes) {
      const color = palette[records.get(k).appearance_role]; if (!color) continue;
      o.traverse(n => {if (n.isMesh) for (const mat of Array.isArray(n.material) ? n.material : [n.material]) mat.color.set(color);});
    }
  }
  return {nodes, records, belts, flexible, setPose, setFlexibleVisible, setEnclosureVisible, setPalette,
    getPose:()=>lastPose?['x','y','z'].map(a=>lastPose[a]):[...profile.display_reference_xyz_mm],
    getSummary: () => ({machine_id: profile.machine_id, part_count: nodes.size,
      motion_counts: manifest.parts.reduce((a,p) => (a[p.motion] = (a[p.motion] ?? 0) + 1,a),{})})};
}

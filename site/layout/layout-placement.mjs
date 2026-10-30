// Pure placement transactions for static planning envelopes, never CAD fit proofs.
import {LIMITS, createCatalog, createDesk, createShelf, createPopStation, createBiquPopStation, resolvePrinterEquipment, applyAction, validateState,
  validatePlacement, deriveScene, getSurface} from './layout-state.mjs?v=7d8a03ac9d134b7f69db';
import {rectangle, rotateXZ, transformPolygon, bounds} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

const MAGNET_MM = 14;
const finite = (n, limit) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit;
const previewNumber = (n, limit) => typeof n === 'number' && Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0;
const errorsOf = error => Array.isArray(error?.errors) ? error.errors : [{code: 'INVALID_PLACEMENT', path: 'placement', params: {}}];
const error = (code, path, params = {}) => ({code, path, params});
const sizeOf = item => Object.fromEntries(['width', 'depth', 'height'].map(axis => [axis,
  Math.max(0, previewNumber(item?.[`${axis}Mm`], LIMITS.maxDimensionMm))]));
const features = (box, axis) => axis === 'x' ? [box.minX, (box.minX + box.maxX) / 2, box.maxX]
  : [box.minZ, (box.minZ + box.maxZ) / 2, box.maxZ];

// Select once from the raw pointer, with stable ties. Trials never feed their
// output back into the grid or the magnet search, avoiding cumulative jitter.
function nearestAlignment(axis, world, polygon, peers) {
  const moving = bounds(transformPolygon(polygon, world));
  let best = null;
  for (const peer of peers) {
    const box = bounds(peer.worldEnvelopeMm);
    for (const value of features(box, axis)) for (const edge of features(moving, axis)) {
      const delta = value - edge, distance = Math.abs(delta);
      const coordinate = world[`${axis}Mm`] + delta;
      if (distance > MAGNET_MM || !finite(coordinate, LIMITS.maxCoordinateMm)) continue;
      // peers are sorted by ID; feature order is fixed even at an exact tie.
      if (!best || distance < best.distance) best = {axis, coordinate, distance, value, box};
    }
  }
  return best;
}

/**
 * Propose a new desk/shelf/printer (copy is an optional entity template).
 * xMm/zMm/yawDeg are WORLD values; printer attachment values are support-local.
 * world.yMm is the support TOP, deliberately excluding catalog baseOffsetMm.
 * snapMm=0 disables grid and magnets. At most four endpoint trials are made:
 * both nearest magnetic axes, individual axes, then the original world grid.
 * Only candidate-related planning warnings reject; unrelated legacy warnings
 * are retained. Invalid previews have finite world/size, null state, no guides.
 */
export function proposePlacement(state, input, catalog) {
  const request = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const {kind, copy: template, machineId = template?.machineId, parentId = null, surfaceId = 'floor', snapMm = 10} = request;
  const id = typeof request.id === 'string' ? request.id : '';
  const world = {xMm: previewNumber(request.xMm, LIMITS.maxCoordinateMm), yMm: 0,
    zMm: previewNumber(request.zMm, LIMITS.maxCoordinateMm), yawDeg: previewNumber(request.yawDeg, LIMITS.maxYawDeg)};
  const issues = [];
  let sizeMm = {width: 0, depth: 0, height: 0}, furniture, machines, surface, equipment;
  const rejected = (problems = issues, pose = world) => ({valid: false, state: null, id, world: {...pose}, sizeMm, issues: problems, guides: []});
  if (!['desk', 'shelf', 'popstation_mini', 'popstation_mini_biqu_v1', 'printer'].includes(kind)) issues.push(error('UNKNOWN_PLACEMENT_KIND', 'placement.kind'));
  for (const key of ['xMm', 'zMm', 'yawDeg']) if (!finite(request[key], key === 'yawDeg' ? LIMITS.maxYawDeg : LIMITS.maxCoordinateMm))
    issues.push(error('NUMBER_OUT_OF_RANGE', `placement.${key}`));
  if (snapMm !== 0 && snapMm !== 10) issues.push(error('NUMBER_OUT_OF_RANGE', 'placement.snapMm'));
  if (template !== undefined && (!template || typeof template !== 'object' || Array.isArray(template)
    || (kind === 'printer' ? !Object.hasOwn(template, 'machineId') : template.type !== kind)))
    issues.push(error('COPY_KIND_MISMATCH', 'placement.copy'));
  if (kind === 'desk' || kind === 'shelf' || kind==='popstation_mini'||kind==='popstation_mini_biqu_v1') {
    try {
      furniture = template === undefined ? (kind === 'desk' ? createDesk({id}) : kind==='shelf'?createShelf({id}):kind==='popstation_mini'?createPopStation({id}):createBiquPopStation({id})) : {...template, id};
      sizeMm = sizeOf(furniture);
    } catch (e) { issues.push(...errorsOf(e)); }
    if (parentId !== null || surfaceId !== 'floor') issues.push(error('FLOOR_SURFACE_REQUIRED', 'placement.surfaceId'));
  }
  // Surface resolution is independent of the catalog, so a missing machine can
  // still be shown as a finite red preview on the requested board.
  try { surface = getSurface(state, parentId, surfaceId); world.yMm = previewNumber(surface.heightMm, LIMITS.maxDimensionMm); }
  catch (e) { issues.push(...errorsOf(e)); }
  try {
    // Rebuild the small numerical contract. Prepared catalogs may come from a
    // versioned module URL with a different private catalog WeakSet identity.
    machines = createCatalog(Array.isArray(catalog) ? catalog : catalog?.entries ?? catalog ?? []);
    if (kind === 'printer'&&Object.hasOwn(machines.byId,machineId)) {
      equipment=resolvePrinterEquipment(state,{machineId,attachment:{parentId}},machines);
      sizeMm=sizeOf(equipment);
    }
  } catch (e) { issues.push(...errorsOf(e)); }
  if (!machines) return rejected();
  try {
    const checked = validateState(state, machines);
    if (!checked.ok) issues.push(...checked.errors);
  } catch (e) { issues.push(...errorsOf(e)); }
  if (issues.length) return rejected();
  if (kind === 'printer' && !Object.hasOwn(machines.byId, machineId))
    return rejected([error('UNKNOWN_MACHINE', 'placement.machineId', {machineId})]);
  const collection = kind === 'printer' ? 'printers' : 'furniture';
  if (state[collection].length >= (kind === 'printer' ? LIMITS.maxPrinters : LIMITS.maxFurniture))
    return rejected([error(kind === 'printer' ? 'PRINTER_COUNT' : 'FURNITURE_COUNT', collection)]);

  const polygon = kind === 'printer' ? equipment.footprintMm : rectangle(furniture.widthMm, furniture.depthMm);
  const grid = {...world};
  const fixedMount=kind==='printer'&&surface.fixedMount===true;
  if(fixedMount)Object.assign(grid,{xMm:surface.xMm,zMm:surface.zMm,yawDeg:surface.yawDeg});
  else if (snapMm) for (const key of ['xMm', 'zMm']) grid[key] = Math.round(world[key] / snapMm) * snapMm || 0;
  function trial(pose, alignments = []) {
    try {
      let action;
      if (kind === 'printer') {
        const local = rotateXZ([pose.xMm - surface.xMm, pose.zMm - surface.zMm], -surface.yawDeg);
        action = {type: 'ADD_PRINTER', printer: {id, machineId, configurationId: template?.configurationId ?? null,
          attachment: {parentId, surfaceId, xMm: fixedMount?0:local[0], zMm: fixedMount?0:local[1], yawDeg: fixedMount?0:pose.yawDeg - surface.yawDeg}}};
      } else action = {type: 'ADD_FURNITURE', furniture: {...furniture, pose: {xMm: pose.xMm, zMm: pose.zMm, yawDeg: pose.yawDeg}}};
      const next = applyAction(state, action, machines);
      const problems = validatePlacement(next, machines).filter(warning => !['DOOR_SWING_OBSTRUCTED','DOOR_SWING_WALL'].includes(warning.code)&&warning.entityIds.includes(id));
      if (problems.length) return rejected(problems, pose);
      const box = bounds(transformPolygon(polygon, pose));
      const guides = alignments.map(a => ({axis: a.axis, valueMm: a.value,
        minMm: a.axis === 'x' ? Math.min(box.minZ, a.box.minZ) : Math.min(box.minX, a.box.minX),
        maxMm: a.axis === 'x' ? Math.max(box.maxZ, a.box.maxZ) : Math.max(box.maxX, a.box.maxX)}));
      return {valid: true, state: next, id, world: {...pose}, sizeMm, ...(equipment?.equipmentVariant?{equipmentVariant:equipment.equipmentVariant}:{}),issues: [], guides};
    } catch (e) { return rejected(errorsOf(e), pose); }
  }
  if(fixedMount)return trial(grid);
  if (snapMm) {
    const scene = deriveScene(state, machines);
    const peers = [...scene.furniture, ...scene.printers].filter(e => e.id !== id
      && (e.type === 'printer' ? e.parentId === parentId && e.surfaceId === surfaceId : parentId === null && surfaceId === 'floor'))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const alignments = ['x', 'z'].map(axis => nearestAlignment(axis, world, polygon, peers)).filter(Boolean);
    const choices = alignments.length === 2 ? [alignments, ...[...alignments].sort((a, b) => a.distance - b.distance).map(a => [a])]
      : alignments.length ? [alignments] : [];
    for (const axes of choices) {
      const pose = {...grid};
      for (const a of axes) pose[`${a.axis}Mm`] = a.coordinate;
      const result = trial(pose, axes);
      if (result.valid) return result;
    }
  }
  return trial(grid);
}

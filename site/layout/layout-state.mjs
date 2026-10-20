import {polygonProblems, polygonContains, polygonsOverlap, rectangle, rotateXZ, transformPolygon, bounds} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

export const LIMITS = Object.freeze({maxFurniture: 64, maxPrinters: 128, maxRoomVertices: 32,
  maxFootprintVertices: 32, maxLevels: 32, maxCoordinateMm: 1000000, maxDimensionMm: 100000,
  maxWallHeightMm: 20000, maxYawDeg: 360000, maxJsonChars: 2000000, maxCatalogEntries: 10000});
export class LayoutValidationError extends Error {
  constructor(errors) { super(errors.map(e => `${e.code} (${e.path})`).join('; ')); this.name = 'LayoutValidationError'; this.errors = errors; }
}
const plain = x => x !== null && typeof x === 'object' && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const idOK = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(x) && !reserved.has(x);
const numberOK = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const issue = (errors, code, path, params = {}) => errors.push({code, path, params});
function keys(value, allowed, path, errors) {
  if (!plain(value)) { issue(errors, 'EXPECTED_OBJECT', path); return false; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issue(errors, 'UNKNOWN_FIELD', `${path}.${key}`);
  return true;
}
function num(value, min, max, path, errors) { if (!numberOK(value, min, max)) issue(errors, 'NUMBER_OUT_OF_RANGE', path, {min, max}); }
function identifier(value, path, errors) { if (!idOK(value)) issue(errors, 'INVALID_ID', path); }
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function poseCheck(pose, path, errors) {
  if (!keys(pose, ['xMm', 'zMm', 'yawDeg'], path, errors)) return;
  num(pose.xMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm, `${path}.xMm`, errors);
  num(pose.zMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm, `${path}.zMm`, errors);
  num(pose.yawDeg, -LIMITS.maxYawDeg, LIMITS.maxYawDeg, `${path}.yawDeg`, errors);
}
function polygonCheck(polygon, path, errors) {
  for (const code of polygonProblems(polygon, {maxVertices: 32, maxCoordinateMm: LIMITS.maxCoordinateMm})) issue(errors, code, path);
}
function roomCheck(room, errors) {
  if (!keys(room, ['polygonMm', 'wallHeightMm'], 'room', errors)) return;
  polygonCheck(room.polygonMm, 'room.polygonMm', errors);
  num(room.wallHeightMm, 100, LIMITS.maxWallHeightMm, 'room.wallHeightMm', errors);
  if (!errors.some(e => e.path === 'room.polygonMm')) {
    const box = bounds(room.polygonMm);
    if (box.maxX - box.minX > LIMITS.maxDimensionMm || box.maxZ - box.minZ > LIMITS.maxDimensionMm) issue(errors, 'ROOM_EXTENT_LIMIT', 'room.polygonMm');
  }
}
function furnitureCheck(f, path, errors) {
  if (!plain(f)) { issue(errors, 'EXPECTED_OBJECT', path); return; }
  const allowed = ['id', 'type', 'widthMm', 'depthMm', 'heightMm', 'pose', ...(f.type === 'desk' ? ['topThicknessMm'] : ['boardThicknessMm', 'levels'])];
  keys(f, allowed, path, errors); identifier(f.id, `${path}.id`, errors);
  if (!['desk', 'shelf'].includes(f.type)) issue(errors, 'UNKNOWN_FURNITURE_TYPE', `${path}.type`);
  for (const axis of ['widthMm', 'depthMm', 'heightMm']) num(f[axis], 30, LIMITS.maxDimensionMm, `${path}.${axis}`, errors);
  poseCheck(f.pose, `${path}.pose`, errors);
  if (f.type === 'desk' && f.topThicknessMm !== 30) issue(errors, 'DESK_TOP_FIXED_30_MM', `${path}.topThicknessMm`);
  if (f.type === 'shelf') {
    num(f.boardThicknessMm, 5, 100, `${path}.boardThicknessMm`, errors);
    if (!Array.isArray(f.levels) || f.levels.length < 1 || f.levels.length > LIMITS.maxLevels) { issue(errors, 'SHELF_LEVEL_COUNT', `${path}.levels`); return; }
    const ids = new Set(); let previous = 0;
    f.levels.forEach((level, i) => {
      const p = `${path}.levels[${i}]`;
      if (!keys(level, ['id', 'topMm'], p, errors)) return;
      identifier(level.id, `${p}.id`, errors);
      if (ids.has(level.id)) issue(errors, 'DUPLICATE_LEVEL_ID', `${p}.id`);
      ids.add(level.id);
      num(level.topMm, f.boardThicknessMm, f.heightMm, `${p}.topMm`, errors);
      if (i && level.topMm - previous < f.boardThicknessMm) issue(errors, 'SHELF_BOARDS_OVERLAP_OR_UNORDERED', `${p}.topMm`);
      previous = level.topMm;
    });
  }
}
function attachmentCheck(a, path, furniture, errors) {
  if (!keys(a, ['parentId', 'surfaceId', 'xMm', 'zMm', 'yawDeg'], path, errors)) return;
  poseCheck({xMm: a.xMm, zMm: a.zMm, yawDeg: a.yawDeg}, path, errors);
  if (a.parentId === null) { if (a.surfaceId !== 'floor') issue(errors, 'FLOOR_SURFACE_REQUIRED', `${path}.surfaceId`); return; }
  identifier(a.parentId, `${path}.parentId`, errors); identifier(a.surfaceId, `${path}.surfaceId`, errors);
  const parent = furniture.find(f => f?.id === a.parentId);
  if (!parent) { issue(errors, 'UNKNOWN_PARENT', `${path}.parentId`, {parentId: a.parentId}); return; }
  if (parent.type === 'desk' ? a.surfaceId !== 'top' : !Array.isArray(parent.levels) || !parent.levels.some(l => l?.id === a.surfaceId)) issue(errors, 'UNKNOWN_SURFACE', `${path}.surfaceId`, {surfaceId: a.surfaceId});
}
function catalogCheck(entries) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length > LIMITS.maxCatalogEntries) throw new LayoutValidationError([{code: 'CATALOG_ARRAY_REQUIRED', path: 'catalog', params: {}}]);
  const ids = new Set();
  entries.forEach((m, i) => {
    const p = `catalog[${i}]`;
    // Renderer catalog rows also contain source/proxy metadata. Read only this
    // numerical contract; never persist or recursively clone unrelated metadata.
    if (!plain(m)) { issue(errors, 'EXPECTED_OBJECT', p); return; }
    identifier(m.id, `${p}.id`, errors);
    if (ids.has(m.id)) issue(errors, 'DUPLICATE_MACHINE_ID', `${p}.id`); ids.add(m.id);
    for (const axis of ['widthMm', 'depthMm', 'heightMm']) num(m[axis], 0.001, LIMITS.maxDimensionMm, `${p}.${axis}`, errors);
    if (m.baseOffsetMm !== undefined) num(m.baseOffsetMm, -LIMITS.maxDimensionMm, LIMITS.maxDimensionMm, `${p}.baseOffsetMm`, errors);
    if (m.footprintMm !== undefined) polygonCheck(m.footprintMm, `${p}.footprintMm`, errors);
  });
  if (errors.length) throw new LayoutValidationError(errors);
}
const catalogs = new WeakSet();
export function createCatalog(entries) {
  catalogCheck(entries);
  const list = entries.map(m => ({id: m.id, widthMm: m.widthMm, depthMm: m.depthMm, heightMm: m.heightMm,
    baseOffsetMm: m.baseOffsetMm ?? 0, footprintMm: copy(m.footprintMm ?? rectangle(m.widthMm, m.depthMm))}));
  const catalog = freeze({entries: list, byId: Object.assign(Object.create(null), Object.fromEntries(list.map(m => [m.id, m])))});
  catalogs.add(catalog); return catalog;
}
function catalogOf(catalog = []) { return catalogs.has(catalog) ? catalog : createCatalog(catalog); }
export function validateState(state, catalog = []) {
  const errors = []; let machines;
  try { machines = catalogOf(catalog); } catch (error) { if (error instanceof LayoutValidationError) return {ok: false, errors: error.errors}; throw error; }
  if (!keys(state, ['format', 'version', 'units', 'room', 'furniture', 'printers'], 'state', errors)) return {ok: false, errors};
  if (state.format !== '3d-print-rig-layout') issue(errors, 'FORMAT_UNSUPPORTED', 'state.format');
  if (state.version !== 1) issue(errors, 'VERSION_UNSUPPORTED', 'state.version', {version: state.version});
  if (state.units !== 'mm') issue(errors, 'UNITS_MUST_BE_MM', 'state.units');
  roomCheck(state.room, errors);
  if (!Array.isArray(state.furniture) || state.furniture.length > LIMITS.maxFurniture) issue(errors, 'FURNITURE_COUNT', 'furniture');
  if (!Array.isArray(state.printers) || state.printers.length > LIMITS.maxPrinters) issue(errors, 'PRINTER_COUNT', 'printers');
  const furniture = Array.isArray(state.furniture) ? state.furniture.slice(0, LIMITS.maxFurniture) : [];
  const printers = Array.isArray(state.printers) ? state.printers.slice(0, LIMITS.maxPrinters) : [];
  const ids = new Set();
  for (const [collection, name] of [[furniture, 'furniture'], [printers, 'printers']]) collection.forEach((entity, i) => {
    if (ids.has(entity?.id)) issue(errors, 'DUPLICATE_ENTITY_ID', `${name}[${i}].id`); ids.add(entity?.id);
  });
  furniture.forEach((f, i) => furnitureCheck(f, `furniture[${i}]`, errors));
  printers.forEach((p, i) => {
    const loc = `printers[${i}]`;
    if (!keys(p, ['id', 'machineId', 'configurationId', 'attachment'], loc, errors)) return;
    identifier(p.id, `${loc}.id`, errors); identifier(p.machineId, `${loc}.machineId`, errors);
    if (!Object.hasOwn(machines.byId, p.machineId)) issue(errors, 'UNKNOWN_MACHINE', `${loc}.machineId`, {machineId: p.machineId});
    if (p.configurationId !== null && (typeof p.configurationId !== 'string' || p.configurationId.length < 1 || p.configurationId.length > 512)) issue(errors, 'INVALID_CONFIGURATION_ID', `${loc}.configurationId`);
    attachmentCheck(p.attachment, `${loc}.attachment`, furniture, errors);
  });
  return {ok: errors.length === 0, errors};
}
function assertState(state, catalog) { const result = validateState(state, catalog); if (!result.ok) throw new LayoutValidationError(result.errors); }
function assertRoom(room) { const errors = []; roomCheck(room, errors); if (errors.length) throw new LayoutValidationError(errors); return freeze(copy(room)); }
function assertFurniture(f) { const errors = []; furnitureCheck(f, 'furniture', errors); if (errors.length) throw new LayoutValidationError(errors); return freeze(copy(f)); }
function dimensions(widthMm, depthMm, errors) {
  num(widthMm, 30, LIMITS.maxDimensionMm, 'widthMm', errors); num(depthMm, 30, LIMITS.maxDimensionMm, 'depthMm', errors);
  if (errors.length) throw new LayoutValidationError(errors);
}
export function createRoomPolygon({polygonMm, wallHeightMm = 2400}) { return assertRoom({polygonMm, wallHeightMm}); }
export function createRoomRect({widthMm = 4000, depthMm = 3000, wallHeightMm = 2400} = {}) {
  dimensions(widthMm, depthMm, []); return createRoomPolygon({polygonMm: rectangle(widthMm, depthMm), wallHeightMm});
}
export function createRoomL({widthMm = 4000, depthMm = 4000, cutWidthMm = 2000, cutDepthMm = 2000, wallHeightMm = 2400} = {}) {
  const errors = []; dimensions(widthMm, depthMm, errors);
  if (!numberOK(cutWidthMm, 1, widthMm - 1) || !numberOK(cutDepthMm, 1, depthMm - 1)) throw new LayoutValidationError([{code: 'L_CUT_MUST_BE_INTERIOR', path: 'room', params: {}}]);
  const x = widthMm / 2, z = depthMm / 2;
  return createRoomPolygon({polygonMm: [[-x,-z],[x,-z],[x,z-cutDepthMm],[x-cutWidthMm,z-cutDepthMm],[x-cutWidthMm,z],[-x,z]], wallHeightMm});
}
const defaultPose = () => ({xMm: 0, zMm: 0, yawDeg: 0});
export function createDesk({id = 'desk-1', widthMm = 1200, depthMm = 600, heightMm = 750, pose = defaultPose()} = {}) {
  return assertFurniture({id, type: 'desk', widthMm, depthMm, heightMm, topThicknessMm: 30, pose});
}
export function createShelf({id = 'shelf-1', widthMm = 900, depthMm = 450, heightMm = 1800, boardThicknessMm = 20, levelCount = 4, levels, pose = defaultPose()} = {}) {
  if (levels === undefined) {
    if (!Number.isInteger(levelCount) || levelCount < 1 || levelCount > LIMITS.maxLevels) throw new LayoutValidationError([{code: 'SHELF_LEVEL_COUNT', path: 'levelCount', params: {}}]);
    levels = Array.from({length: levelCount}, (_, i) => ({id: `level-${i + 1}`, topMm: levelCount === 1 ? heightMm : boardThicknessMm + (heightMm - boardThicknessMm) * i / (levelCount - 1)}));
  }
  return assertFurniture({id, type: 'shelf', widthMm, depthMm, heightMm, boardThicknessMm, levels, pose});
}
export function createDefaultLayout({room = createRoomRect(), furniture = [], printers = []} = {}, catalog = []) {
  const state = {format: '3d-print-rig-layout', version: 1, units: 'mm', room, furniture, printers};
  assertState(state, catalog); return freeze(copy(state));
}
function fail(code, path, params = {}) { throw new LayoutValidationError([{code, path, params}]); }
function requireEntity(list, id, path) { const item = list.find(v => v.id === id); if (!item) fail('UNKNOWN_ENTITY', path, {id}); return item; }
function patchCheck(patch, allowed) { const errors = []; keys(patch, allowed, 'action.patch', errors); if (errors.length) throw new LayoutValidationError(errors); }
export function applyAction(state, action, catalog = []) {
  assertState(state, catalog);
  if (!plain(action) || typeof action.type !== 'string') fail('INVALID_ACTION', 'action');
  const next = copy(state);
  const fields = {
    SET_ROOM: ['room'], ADD_FURNITURE: ['furniture'], UPDATE_FURNITURE: ['id', 'patch'], REMOVE_FURNITURE: ['id', 'detachChildren'],
    ADD_PRINTER: ['printer'], UPDATE_PRINTER: ['id', 'patch'], SET_ATTACHMENT: ['id', 'attachment'], REMOVE_PRINTER: ['id'],
  };
  if (!Object.hasOwn(fields, action.type)) fail('UNKNOWN_ACTION', 'action.type');
  const errors = []; keys(action, ['type', ...fields[action.type]], 'action', errors); if (errors.length) throw new LayoutValidationError(errors);
  switch (action.type) {
    case 'SET_ROOM': next.room = copy(action.room); break;
    case 'ADD_FURNITURE': next.furniture.push(copy(action.furniture)); break;
    case 'ADD_PRINTER': next.printers.push(copy(action.printer)); break;
    case 'UPDATE_FURNITURE': {
      const f = requireEntity(next.furniture, action.id, 'action.id');
      patchCheck(action.patch, ['widthMm', 'depthMm', 'heightMm', 'pose', ...(f.type === 'shelf' ? ['boardThicknessMm', 'levels'] : [])]);
      const oldHeight = f.heightMm, oldThickness = f.boardThicknessMm, oldPose = f.pose;
      Object.assign(f, copy(action.patch));
      if (Object.hasOwn(action.patch, 'pose')) { patchCheck(action.patch.pose, ['xMm', 'zMm', 'yawDeg']); f.pose = {...oldPose, ...action.patch.pose}; }
      if (f.type === 'shelf' && !Object.hasOwn(action.patch, 'levels') && (oldHeight !== f.heightMm || oldThickness !== f.boardThicknessMm)) {
        f.levels = f.levels.map(level => ({...level, topMm: oldHeight === oldThickness ? f.heightMm : f.boardThicknessMm + (f.heightMm - f.boardThicknessMm) * (level.topMm - oldThickness) / (oldHeight - oldThickness)}));
      }
      break;
    }
    case 'REMOVE_FURNITURE': {
      requireEntity(next.furniture, action.id, 'action.id');
      if (action.detachChildren !== undefined && typeof action.detachChildren !== 'boolean') fail('EXPECTED_BOOLEAN', 'action.detachChildren');
      const children = state.printers.filter(p => p.attachment.parentId === action.id);
      if (children.length && action.detachChildren !== true) fail('PARENT_OCCUPIED', 'action.id', {childIds: children.map(p => p.id)});
      const poses = new Map(children.map(p => [p.id, worldTransform(state, p.id, catalog)]));
      for (const p of next.printers) if (poses.has(p.id)) { const t = poses.get(p.id); p.attachment = {parentId: null, surfaceId: 'floor', xMm: t.xMm, zMm: t.zMm, yawDeg: t.yawDeg}; }
      next.furniture = next.furniture.filter(f => f.id !== action.id); break;
    }
    case 'UPDATE_PRINTER': {
      const p = requireEntity(next.printers, action.id, 'action.id'); patchCheck(action.patch, ['machineId', 'configurationId', 'attachment']);
      const previous = p.attachment; Object.assign(p, copy(action.patch));
      if (Object.hasOwn(action.patch, 'attachment')) { patchCheck(action.patch.attachment, ['parentId', 'surfaceId', 'xMm', 'zMm', 'yawDeg']); p.attachment = {...previous, ...action.patch.attachment}; }
      break;
    }
    case 'SET_ATTACHMENT': requireEntity(next.printers, action.id, 'action.id').attachment = copy(action.attachment); break;
    case 'REMOVE_PRINTER': requireEntity(next.printers, action.id, 'action.id'); next.printers = next.printers.filter(p => p.id !== action.id); break;
  }
  assertState(next, catalog); return freeze(next);
}
function surfaceUnchecked(state, parentId, surfaceId) {
  if (parentId === null) {
    if (surfaceId !== 'floor') fail('FLOOR_SURFACE_REQUIRED', 'surfaceId');
    return {parentId: null, surfaceId: 'floor', heightMm: 0, xMm: 0, zMm: 0, yawDeg: 0,
      positionM: {x: 0, y: 0, z: 0}, yawRad: 0, polygonMm: copy(state.room.polygonMm), worldEnvelopeMm: copy(state.room.polygonMm)};
  }
  const f = requireEntity(state.furniture, parentId, 'parentId');
  const heightMm = f.type === 'desk' && surfaceId === 'top' ? f.heightMm : f.type === 'shelf' ? f.levels.find(l => l.id === surfaceId)?.topMm : undefined;
  if (heightMm === undefined) fail('UNKNOWN_SURFACE', 'surfaceId', {surfaceId});
  const polygonMm = rectangle(f.widthMm, f.depthMm);
  return {parentId, surfaceId, heightMm, ...f.pose, positionM: {x: f.pose.xMm / 1000, y: heightMm / 1000, z: f.pose.zMm / 1000},
    yawRad: f.pose.yawDeg * Math.PI / 180, polygonMm, worldEnvelopeMm: transformPolygon(polygonMm, f.pose)};
}
export function getSurface(state, parentId = null, surfaceId = 'floor') {
  // Does not require the machine catalog: surfaces depend only on room/furniture.
  const errors = []; roomCheck(state?.room, errors);
  if (!Array.isArray(state?.furniture)) fail('FURNITURE_COUNT', 'furniture');
  state.furniture.forEach((f, i) => furnitureCheck(f, `furniture[${i}]`, errors));
  if (errors.length) throw new LayoutValidationError(errors);
  return freeze(surfaceUnchecked(state, parentId, surfaceId));
}
export function deriveScene(state, catalog = []) {
  const machines = catalogOf(catalog); assertState(state, machines);
  const surfaces = [surfaceUnchecked(state, null, 'floor')];
  const furniture = state.furniture.map(f => {
    const boards = (f.type === 'desk' ? [{id: 'top', topMm: f.heightMm}] : f.levels).map(l => {
      const thicknessMm = f.type === 'desk' ? 30 : f.boardThicknessMm;
      surfaces.push(surfaceUnchecked(state, f.id, l.id));
      return {id: l.id, widthM: f.widthMm / 1000, depthM: f.depthMm / 1000, thicknessM: thicknessMm / 1000,
        localCenterYM: (l.topMm - thicknessMm / 2) / 1000, topYM: l.topMm / 1000};
    });
    return {id: f.id, type: f.type, ...f.pose, widthMm: f.widthMm, depthMm: f.depthMm, heightMm: f.heightMm,
      widthM: f.widthMm / 1000, depthM: f.depthMm / 1000, heightM: f.heightMm / 1000,
      positionM: {x: f.pose.xMm / 1000, y: 0, z: f.pose.zMm / 1000}, yawRad: f.pose.yawDeg * Math.PI / 180,
      worldEnvelopeMm: transformPolygon(rectangle(f.widthMm, f.depthMm), f.pose), verticalRangeMm: [0, f.heightMm], boards};
  });
  const printers = state.printers.map(p => {
    const a = p.attachment, s = surfaceUnchecked(state, a.parentId, a.surfaceId), m = machines.byId[p.machineId];
    const local = rotateXZ([a.xMm, a.zMm], s.yawDeg), pose = {xMm: s.xMm + local[0], zMm: s.zMm + local[1], yawDeg: s.yawDeg + a.yawDeg};
    return {id: p.id, type: 'printer', machineId: p.machineId, configurationId: p.configurationId, ...pose,
      parentId: a.parentId, surfaceId: a.surfaceId, supportYM: s.heightMm / 1000,
      positionM: {x: pose.xMm / 1000, y: (s.heightMm + m.baseOffsetMm) / 1000, z: pose.zMm / 1000}, yawRad: pose.yawDeg * Math.PI / 180,
      worldEnvelopeMm: transformPolygon(m.footprintMm, pose), verticalRangeMm: [s.heightMm, s.heightMm + m.heightMm],
      widthMm: m.widthMm, depthMm: m.depthMm, heightMm: m.heightMm,
      widthM: m.widthMm / 1000, depthM: m.depthMm / 1000, heightM: m.heightMm / 1000};
  });
  return freeze({furniture, printers, surfaces});
}
export function worldTransform(state, entityId, catalog = []) {
  const scene = deriveScene(state, catalog), entity = [...scene.furniture, ...scene.printers].find(e => e.id === entityId);
  if (!entity) fail('UNKNOWN_ENTITY', 'entityId', {id: entityId}); return entity;
}
export function validatePlacement(state, catalog = []) {
  const scene = deriveScene(state, catalog), warnings = [], all = [...scene.furniture, ...scene.printers];
  const warn = (code, entityIds, params = {}) => warnings.push({code, entityIds, params});
  for (const e of all) if (!polygonContains(state.room.polygonMm, e.worldEnvelopeMm)) warn('ROOM_OUT_OF_BOUNDS', [e.id]);
  for (const e of all) if (e.verticalRangeMm[1] > state.room.wallHeightMm)
    warn('ROOM_HEIGHT_EXCEEDED', [e.id], {topMm: e.verticalRangeMm[1], roomHeightMm: state.room.wallHeightMm});
  for (const p of scene.printers) if (p.parentId !== null) {
    const s = scene.surfaces.find(s => s.parentId === p.parentId && s.surfaceId === p.surfaceId);
    if (!polygonContains(s.worldEnvelopeMm, p.worldEnvelopeMm)) warn('SURFACE_OVERHANG', [p.id, p.parentId], {surfaceId: p.surfaceId});
    const parent = state.furniture.find(f => f.id === p.parentId);
    if (parent.type === 'shelf') for (const level of parent.levels) {
      const bottom = level.topMm - parent.boardThicknessMm;
      if (level.topMm > s.heightMm && p.verticalRangeMm[1] > bottom && p.verticalRangeMm[0] < level.topMm
        && polygonsOverlap(p.worldEnvelopeMm, s.worldEnvelopeMm)) warn('SHELF_BOARD_INTERSECTION', [p.id, parent.id], {levelId: level.id, boardBottomMm: bottom, printerTopMm: p.verticalRangeMm[1]});
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.parentId === b.id || b.parentId === a.id) continue;
    const heightOverlapMm = Math.min(a.verticalRangeMm[1], b.verticalRangeMm[1]) - Math.max(a.verticalRangeMm[0], b.verticalRangeMm[0]);
    if (heightOverlapMm > 0 && polygonsOverlap(a.worldEnvelopeMm, b.worldEnvelopeMm)) warn('ENVELOPE_OVERLAP', [a.id, b.id], {heightOverlapMm});
  }
  return freeze(warnings);
}
export function serializeLayout(state, catalog = []) {
  assertState(state, catalog); const text = JSON.stringify(state, null, 2);
  if (text.length > LIMITS.maxJsonChars) fail('JSON_SIZE_LIMIT', 'json'); return text;
}
export function parseLayout(text, catalog = []) {
  if (typeof text !== 'string' || text.length > LIMITS.maxJsonChars) fail('JSON_SIZE_LIMIT', 'json');
  let state; try { state = JSON.parse(text); } catch { fail('JSON_PARSE_ERROR', 'json'); }
  assertState(state, catalog); return freeze(state);
}

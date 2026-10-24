import {polygonProblems, polygonContains, polygonsOverlap, rectangle, rotateXZ, transformPolygon, bounds} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';
import {rigidMotionStaysInside,boundaryTangents} from './layout-constraints.mjs?v=53e33561b2e7ce324016';
import {WALL_FINISHES, FLOOR_FINISHES, DEFAULT_ROOM_APPEARANCE} from './layout-finishes.mjs?v=001b62f9728770a12303';
import {rootPose,groupRootPose,rebaseLayoutGroups} from './layout-group-data.mjs?v=298837e53f6daea54c7c';

export const LIMITS = Object.freeze({maxFurniture: 64, maxPrinters: 128, maxRoomVertices: 32,
  maxFootprintVertices: 32, maxLevels: 32, maxCoordinateMm: 1000000, maxDimensionMm: 100000,
  maxWallHeightMm: 20000, maxYawDeg: 360000, maxJsonChars: 2000000, maxCatalogEntries: 10000, maxGroups: 64});
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
  if (!keys(room, ['polygonMm', 'wallHeightMm', 'appearance'], 'room', errors)) return;
  if (Object.hasOwn(room, 'appearance') && keys(room.appearance, ['wall', 'floor'], 'room.appearance', errors)) {
    if (!WALL_FINISHES.includes(room.appearance.wall)) issue(errors, 'INVALID_ROOM_FINISH', 'room.appearance.wall');
    if (!FLOOR_FINISHES.includes(room.appearance.floor)) issue(errors, 'INVALID_ROOM_FINISH', 'room.appearance.floor');
  }
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
  if (!keys(state, ['format', 'version', 'units', 'room', 'furniture', 'printers', 'groups'], 'state', errors)) return {ok: false, errors};
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
  if (state.groups !== undefined) {
    if (!Array.isArray(state.groups) || state.groups.length > LIMITS.maxGroups) issue(errors, 'GROUP_LIMIT', 'groups');
    else {
      const assigned = new Set();
      state.groups.forEach((g, i) => {
        const path = `groups[${i}]`;
        if (!keys(g, ['id','name','pose','originPose','memberIds','memberPoses'], path, errors)) return;
        identifier(g.id, `${path}.id`, errors);
        if (ids.has(g.id)) issue(errors, 'DUPLICATE_ENTITY_ID', `${path}.id`); ids.add(g.id);
        if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80 || /[\u0000-\u001f\u007f]/.test(g.name)) issue(errors, 'GROUP_NAME', `${path}.name`);
        poseCheck(g.pose, `${path}.pose`, errors); poseCheck(g.originPose, `${path}.originPose`, errors);
        if (!Array.isArray(g.memberIds) || !g.memberIds.length || g.memberIds.length > LIMITS.maxFurniture + LIMITS.maxPrinters) { issue(errors, 'GROUP_MEMBERS', `${path}.memberIds`); return; }
        if (!Array.isArray(g.memberPoses) || g.memberPoses.length !== g.memberIds.length) { issue(errors, 'GROUP_MEMBERS', `${path}.memberPoses`); return; }
        const local = new Set();
        g.memberIds.forEach((id, j) => {
          identifier(id, `${path}.memberIds[${j}]`, errors);
          if (assigned.has(id) || local.has(id)) issue(errors, 'GROUP_MEMBER_ASSIGNED', `${path}.memberIds[${j}]`);
          assigned.add(id);local.add(id);
          if (!furniture.some(f=>f?.id===id) && !printers.some(p=>p?.id===id && p.attachment?.parentId===null)) issue(errors, 'GROUP_ROOT_REQUIRED', `${path}.memberIds[${j}]`);
        });
        const references = new Set();
        g.memberPoses.forEach((entry,j)=>{
          const p=`${path}.memberPoses[${j}]`;
          if(!keys(entry,['id','pose'],p,errors))return;
          if(!local.has(entry.id)||references.has(entry.id))issue(errors,'GROUP_MEMBERS',`${p}.id`);
          references.add(entry.id);poseCheck(entry.pose,`${p}.pose`,errors);
        });
        if (!errors.some(e=>e.path.startsWith(path)) && !errors.some(e=>e.path.startsWith('furniture')||e.path.startsWith('printers'))) {
          for(const id of g.memberIds){
            const expected=groupRootPose(g,id),actual=rootPose(state,id);
            if(!actual||!['xMm','zMm','yawDeg'].every(k=>actual[k]===expected[k]))issue(errors,'GROUP_POSE_MISMATCH',path);
          }
        }
      });
    }
  }
  return {ok: errors.length === 0, errors};
}
function assertState(state, catalog) { const result = validateState(state, catalog); if (!result.ok) throw new LayoutValidationError(result.errors); }
function assertRoom(room) { const errors = []; roomCheck(room, errors); if (errors.length) throw new LayoutValidationError(errors); return freeze(copy(room)); }
function roomWithAppearance(room, fallback = DEFAULT_ROOM_APPEARANCE) {
  return plain(room) && !Object.hasOwn(room, 'appearance') ? {...room, appearance: copy(fallback)} : room;
}
function assertFurniture(f) { const errors = []; furnitureCheck(f, 'furniture', errors); if (errors.length) throw new LayoutValidationError(errors); return freeze(copy(f)); }
function dimensions(widthMm, depthMm, errors) {
  num(widthMm, 30, LIMITS.maxDimensionMm, 'widthMm', errors); num(depthMm, 30, LIMITS.maxDimensionMm, 'depthMm', errors);
  if (errors.length) throw new LayoutValidationError(errors);
}
// Shape-only constructors deliberately omit appearance unless supplied. SET_ROOM
// can therefore retain existing finishes after outline editing or SVG import.
export function createRoomPolygon({polygonMm, wallHeightMm = 2400, appearance}) { return assertRoom({polygonMm, wallHeightMm, ...(appearance === undefined ? {} : {appearance})}); }
export function createRoomRect({widthMm = 4000, depthMm = 3000, wallHeightMm = 2400, appearance} = {}) {
  dimensions(widthMm, depthMm, []); return createRoomPolygon({polygonMm: rectangle(widthMm, depthMm), wallHeightMm, appearance});
}
export function createRoomL({widthMm = 4000, depthMm = 4000, cutWidthMm = 2000, cutDepthMm = 2000, wallHeightMm = 2400, appearance} = {}) {
  const errors = []; dimensions(widthMm, depthMm, errors);
  if (!numberOK(cutWidthMm, 1, widthMm - 1) || !numberOK(cutDepthMm, 1, depthMm - 1)) throw new LayoutValidationError([{code: 'L_CUT_MUST_BE_INTERIOR', path: 'room', params: {}}]);
  const x = widthMm / 2, z = depthMm / 2;
  return createRoomPolygon({polygonMm: [[-x,-z],[x,-z],[x,z-cutDepthMm],[x-cutWidthMm,z-cutDepthMm],[x-cutWidthMm,z],[-x,z]], wallHeightMm, appearance});
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
export function createDefaultLayout({room = createRoomRect(), furniture = [], printers = [], groups} = {}, catalog = []) {
  const state = {format: '3d-print-rig-layout', version: 1, units: 'mm', room, furniture, printers, ...(groups===undefined?{}:{groups})};
  assertState(state, catalog); return freeze(copy({...state, room: roomWithAppearance(room)}));
}
function fail(code, path, params = {}) { throw new LayoutValidationError([{code, path, params}]); }
function requireEntity(list, id, path) { const item = list.find(v => v.id === id); if (!item) fail('UNKNOWN_ENTITY', path, {id}); return item; }
function patchCheck(patch, allowed) { const errors = []; keys(patch, allowed, 'action.patch', errors); if (errors.length) throw new LayoutValidationError(errors); }
export function applyAction(state, action, catalog = []) {
  const machines = catalogOf(catalog); assertState(state, machines);
  if (!plain(action) || typeof action.type !== 'string') fail('INVALID_ACTION', 'action');
  const next = copy(state);
  next.room = roomWithAppearance(next.room);
  const fields = {
    SET_ROOM: ['room'], ADD_FURNITURE: ['furniture'], UPDATE_FURNITURE: ['id', 'patch'], REMOVE_FURNITURE: ['id', 'detachChildren'],
    ADD_PRINTER: ['printer'], UPDATE_PRINTER: ['id', 'patch'], SET_ATTACHMENT: ['id', 'attachment'], REMOVE_PRINTER: ['id'],
  };
  if (!Object.hasOwn(fields, action.type)) fail('UNKNOWN_ACTION', 'action.type');
  const errors = []; keys(action, ['type', ...fields[action.type]], 'action', errors); if (errors.length) throw new LayoutValidationError(errors);
  switch (action.type) {
    case 'SET_ROOM': next.room = copy(roomWithAppearance(action.room, next.room.appearance)); break;
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
  if(state.groups)next.groups=rebaseLayoutGroups(state,next);
  assertState(next, machines);
  if (JSON.stringify(next) === JSON.stringify(state)) return state;
  restrictPlacementChange(state, next, action, machines);
  return freeze(next);
}
function affectedEntities(state, next, action) {
  if (action.type === 'SET_ROOM') return [...next.furniture, ...next.printers].map(e => e.id);
  if (action.type === 'ADD_FURNITURE') return [action.furniture.id];
  if (action.type === 'ADD_PRINTER') return [action.printer.id];
  if (action.type === 'UPDATE_FURNITURE') return [action.id, ...next.printers.filter(p => p.attachment.parentId === action.id).map(p => p.id)];
  if (action.type === 'UPDATE_PRINTER' || action.type === 'SET_ATTACHMENT') return [action.id];
  return []; // Deletion/detach does not silently repair an imported invalid placement.
}
function localPrinterPolygon(p, machines) { return transformPolygon(machines.byId[p.machineId].footprintMm, p.attachment); }
function containmentIssues(state, scene, machines, ids) {
  const result = [], wanted = new Set(ids);
  for (const e of [...scene.furniture, ...scene.printers]) if (wanted.has(e.id) && !polygonContains(state.room.polygonMm, e.worldEnvelopeMm))
    result.push({code: 'ROOM_OUT_OF_BOUNDS', path: 'action', params: {entityIds: [e.id]}});
  for (const p of state.printers) if (wanted.has(p.id) && p.attachment.parentId !== null) {
    const parent = state.furniture.find(f => f.id === p.attachment.parentId);
    // Compare in parent-local coordinates: a rotated shared edge is still a shared edge.
    if (!polygonContains(rectangle(parent.widthMm, parent.depthMm), localPrinterPolygon(p, machines)))
      result.push({code: 'SURFACE_OVERHANG', path: 'action', params: {entityIds: [p.id, parent.id]}});
  }
  return result;
}
export const PLACEMENT_BOUNDARY_CODES = Object.freeze(['ROOM_OUT_OF_BOUNDS', 'SURFACE_OVERHANG']);
// Parsing preserves legacy plans. These two boundary warnings define explicit
// repair mode; height, board and inter-item envelope warnings keep their meaning.
export function placementViolations(state, catalog = []) {
  const machines = catalogOf(catalog), scene = deriveScene(state, machines);
  return freeze(containmentIssues(state, scene, machines, [...state.furniture, ...state.printers].map(e => e.id))
    .map(({code, params}) => ({code, entityIds: params.entityIds, params: {}})));
}
const samePolygon = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
function restrictPlacementChange(state, next, action, machines) {
  const ids = new Set(affectedEntities(state, next, action)); if (!ids.size) return;
  const before = deriveScene(state, machines), after = deriveScene(next, machines);
  const previous = new Map([...before.furniture, ...before.printers].map(e => [e.id, e]));
  const reject = (code, id, reason) => fail(code, 'action', {entityIds: [id], reason});
  const boundary = (code, id, oldOuter, oldPolygon, outer, polygon, path) => {
    const unchanged = oldPolygon && samePolygon(oldOuter, outer) && samePolygon(oldPolygon, polygon);
    if (unchanged) return; // An unrelated legacy violation is retained, never hidden or worsened.
    if (!polygonContains(outer, polygon)) {
      const wasInvalid = oldPolygon && !polygonContains(oldOuter, oldPolygon);
      // A one-field-at-a-time repair can remain outside on another axis. Permit
      // only set inclusion: shrink inside the old footprint under an unchanged
      // boundary, or expand the boundary around an unchanged footprint. Every
      // other affected room/surface domain is still checked independently.
      const shrinks = wasInvalid && samePolygon(oldOuter, outer) && polygonContains(oldPolygon, polygon);
      const expands = wasInvalid && samePolygon(oldPolygon, polygon) && polygonContains(outer, oldOuter);
      if (shrinks || expands) return;
      reject(code, id, 'TARGET_FOOTPRINT_NOT_CONTAINED');
    }
    // An invalid start may explicitly recover to a fully contained endpoint.
    // Other partial outside targets reject; loading never moves or discards it.
    if (oldPolygon && polygonContains(oldOuter, oldPolygon) && path && !path())
      reject(code, id, 'CONTINUOUS_FOOTPRINT_PATH_NOT_CONTAINED');
  };
  for (const end of [...after.furniture, ...after.printers]) if (ids.has(end.id)) {
    const start = previous.get(end.id);
    let local, from = start, to = end, roomPath;
    if (start && action.type !== 'SET_ROOM' && end.widthMm === start.widthMm && end.depthMm === start.depthMm) {
      if (end.type !== 'printer') local = rectangle(start.widthMm, start.depthMm);
      else {
        const old = state.printers.find(p => p.id === end.id), current = next.printers.find(p => p.id === end.id);
        if (old.machineId === current.machineId && old.attachment.parentId === current.attachment.parentId && old.attachment.surfaceId === current.attachment.surfaceId) {
          local = machines.byId[current.machineId].footprintMm;
          if (action.type === 'UPDATE_FURNITURE' && current.attachment.parentId === action.id) {
            local = localPrinterPolygon(old, machines);
            from = state.furniture.find(f => f.id === action.id).pose; to = next.furniture.find(f => f.id === action.id).pose;
          }
        }
      }
      if (local) roomPath = () => rigidMotionStaysInside(next.room.polygonMm, local, from, to);
    }
    boundary('ROOM_OUT_OF_BOUNDS', end.id, state.room.polygonMm, start?.worldEnvelopeMm,
      next.room.polygonMm, end.worldEnvelopeMm, roomPath);
    if (end.type !== 'printer') continue;
    const current = next.printers.find(p => p.id === end.id), old = state.printers.find(p => p.id === end.id);
    if (current.attachment.parentId === null) continue;
    const parent = next.furniture.find(f => f.id === current.attachment.parentId);
    const oldParent = old && state.furniture.find(f => f.id === old.attachment.parentId);
    const sameSurface = oldParent && old.attachment.parentId === current.attachment.parentId && old.attachment.surfaceId === current.attachment.surfaceId;
    const outer = rectangle(parent.widthMm, parent.depthMm), polygon = localPrinterPolygon(current, machines);
    const oldOuter = sameSurface ? rectangle(oldParent.widthMm, oldParent.depthMm) : null;
    const oldPolygon = sameSurface ? localPrinterPolygon(old, machines) : null;
    const surfacePath = sameSurface && old.machineId === current.machineId && samePolygon(oldOuter, outer)
      ? () => rigidMotionStaysInside(outer, machines.byId[current.machineId].footprintMm, old.attachment, current.attachment) : null;
    boundary('SURFACE_OVERHANG', end.id, oldOuter, oldPolygon, outer, polygon, surfacePath);
  }
}
function worldMoveLocalPoint(parent, attachment, xMm, zMm, snapOrigin) {
  if (!parent) return [xMm, zMm];
  // Exact forward-image matches retain stored coordinates for a no-op or an
  // anchored A-B-A. No rounding/tolerance is applied to other pointer targets.
  for (const reference of [attachment, snapOrigin]) if (reference) {
    const q = rotateXZ([reference.xMm, reference.zMm], parent.pose.yawDeg);
    if (q[0] + parent.pose.xMm === xMm && q[1] + parent.pose.zMm === zMm) return [reference.xMm, reference.zMm];
  }
  return rotateXZ([xMm - parent.pose.xMm, zMm - parent.pose.zMm], -parent.pose.yawDeg);
}
function sumAtMost(a, b, limit) {
  const sum = a + b;
  if (sum !== limit) return sum < limit;
  // TwoSum retains the exact residual when a translated vertex rounds onto
  // the support edge. A one-ULP centre overhang must not disappear on addition.
  const roundedB = sum - a;
  return (a - (sum - roundedB)) + (b - roundedB) <= 0;
}
function applyPrinterMove(state, printer, xMm, zMm, machines, parent) {
  const a = printer.attachment;
  if (parent && numberOK(xMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm)
    && numberOK(zMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm) && (xMm !== a.xMm || zMm !== a.zMm)) {
    const inside = machines.byId[printer.machineId].footprintMm.every(p => {
      const [x, z] = rotateXZ(p, a.yawDeg);
      return sumAtMost(xMm, x, parent.widthMm / 2) && sumAtMost(-xMm, -x, parent.widthMm / 2)
        && sumAtMost(zMm, z, parent.depthMm / 2) && sumAtMost(-zMm, -z, parent.depthMm / 2);
    });
    if (!inside) fail('SURFACE_OVERHANG', 'action', {entityIds: [printer.id, parent.id], reason: 'SUPPORT_LOCAL_TRANSLATION_NOT_CONTAINED'});
  }
  return applyAction(state, {type: 'UPDATE_PRINTER', id: printer.id, patch: {attachment: {xMm, zMm}}}, machines);
}
export function applyWorldMove(state, {id, xMm, zMm}, catalog = [], {snapMm = 0, snapOrigin = null} = {}) {
  const machines = catalogOf(catalog); assertState(state, machines);
  if (!numberOK(xMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm) || !numberOK(zMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm)
    || !numberOK(snapMm, 0, LIMITS.maxDimensionMm)) fail('NUMBER_OUT_OF_RANGE', 'worldMove');
  const furniture = state.furniture.find(f => f.id === id), printer = state.printers.find(p => p.id === id);
  if (!furniture && !printer) fail('UNKNOWN_ENTITY', 'worldMove.id');
  if (snapOrigin !== null && (!numberOK(snapOrigin?.xMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm) || !numberOK(snapOrigin?.zMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm))) fail('NUMBER_OUT_OF_RANGE', 'snapOrigin');
  // Quantize against the original gesture's source pose, not each preview segment.
  // A fractional imported pose therefore survives a no-op, cancel and A-B-A.
  const snap = (n, origin) => snapMm === 0 ? n : origin + Math.round((n - origin) / snapMm) * snapMm;
  if (furniture) return applyAction(state, {type: 'UPDATE_FURNITURE', id, patch: {pose: {xMm: snap(xMm, snapOrigin?.xMm ?? furniture.pose.xMm), zMm: snap(zMm, snapOrigin?.zMm ?? furniture.pose.zMm)}}}, machines);
  const parent = state.furniture.find(f => f.id === printer.attachment.parentId);
  const local = worldMoveLocalPoint(parent, printer.attachment, xMm, zMm, snapOrigin);
  return applyPrinterMove(state, printer, snap(local[0], snapOrigin?.xMm ?? printer.attachment.xMm),
    snap(local[1], snapOrigin?.zMm ?? printer.attachment.zMm), machines, parent);
}
// A resolved transaction stays private to the app until pointerup. Retaining its
// exact frozen state avoids re-snapping or a second world/local roundtrip at drop.
export function resolveWorldMove(state, {id, x, z}, catalog = [], {snapMm = 10, snapOrigin = null} = {}) {
  const machines = catalogOf(catalog);
  const result = next => {
    const world = worldTransform(next, id, machines);
    return Object.freeze({x: world.xMm, z: world.zMm, state: next});
  };
  let target;
  try {
    return result(applyWorldMove(state, {id, xMm: x, zMm: z}, machines, {snapMm, snapOrigin}));
  } catch (error) {
    if (!(error instanceof LayoutValidationError)) throw error;
    if (error.errors.some(e => !PLACEMENT_BOUNDARY_CODES.includes(e.code))) return false;
  }
  const furniture = state.furniture.find(f => f.id === id), printer = state.printers.find(p => p.id === id);
  const ids = furniture ? [id, ...state.printers.filter(p => p.attachment.parentId === id).map(p => p.id)] : [id];
  // A legacy outside start recovers only to a fully contained endpoint. It is not
  // swept/clamped through outside space; partial outside targets keep repair mode.
  if (placementViolations(state, machines).some(e => ids.includes(e.entityIds[0]))) return false;
  const parent = printer && state.furniture.find(f => f.id === printer.attachment.parentId);
  const pointOf = from => parent ? from.printers.find(p => p.id === id).attachment : worldTransform(from, id, machines);
  // Keep attached-printer trials in their stored support-local frame. Repeated
  // world/local roundtrips can turn an exact contact into a one-ULP overhang
  // and make the prefix predicate numerically nonmonotone along a valid slide.
  // applyAction still proves the complete room and support paths for each leg.
  const applyPoint = (from, point) => parent
    ? applyPrinterMove(from, from.printers.find(p => p.id === id), point.x, point.z, machines, parent)
    : applyWorldMove(from, {id, xMm: point.x, zMm: point.z}, machines);
  const snap = (n, base) => snapMm === 0 ? n : base + Math.round((n - base) / snapMm) * snapMm;
  if (furniture) target = {x: snap(x, snapOrigin?.xMm ?? furniture.pose.xMm), z: snap(z, snapOrigin?.zMm ?? furniture.pose.zMm)};
  else {
    const a = printer.attachment;
    const local = worldMoveLocalPoint(parent, a, x, z, snapOrigin);
    const point = [snap(local[0], snapOrigin?.xMm ?? a.xMm), snap(local[1], snapOrigin?.zMm ?? a.zMm)];
    target = {x: point[0], z: point[1]};
  }
  const worldPoint = parent ? rotateXZ([target.x, target.z], parent.pose.yawDeg) : null;
  const worldTarget = parent ? {x: worldPoint[0] + parent.pose.xMm, z: worldPoint[1] + parent.pose.zMm} : target;
  // Full swept containment is a monotone prefix predicate. These are bounded
  // binary contact brackets, not sampled poses or endpoint-only collision tests.
  // Every accepted trial includes every intermediate translation. No EPS/gap.
  const sweptPrefix = (from,goal) => {
    const start=pointOf(from);
    try{return applyPoint(from,goal);}
    catch(error){if(!(error instanceof LayoutValidationError))throw error;}
    let low=0,high=1,best=from;
    for(let i=0;i<64;i++){
      const t=low+(high-low)/2;if(t===low||t===high)break;
      const xMm=start.xMm+(goal.x-start.xMm)*t,zMm=start.zMm+(goal.z-start.zMm)*t;
      try{best=applyPoint(from,{x:xMm,z:zMm});low=t;}
      catch(error){if(!(error instanceof LayoutValidationError))throw error;high=t;}
    }
    return best;
  };
  // First reach the contact, then retain the component parallel to that wall.
  // Each leg has the same complete swept-containment proof as a direct move;
  // this is not a new origin-to-end chord through a concave room or a corner.
  let best=sweptPrefix(state,target);
  const contactState=best,scene=deriveScene(best,machines),contact=pointOf(best);
  const domains=ids.map(entityId=>[best.room.polygonMm,[...scene.furniture,...scene.printers].find(e=>e.id===entityId).worldEnvelopeMm]);
  if(parent){
    // Prefer exact support-local tangents before any parallel room tangent;
    // converting a shared rotated edge back to local can add a false normal.
    domains.unshift([rectangle(parent.widthMm,parent.depthMm),localPrinterPolygon(best.printers.find(p=>p.id===id),machines),true]);
  }
  let score=(contact.xMm-target.x)**2+(contact.zMm-target.z)**2;
  const remainder=[target.x-contact.xMm,target.z-contact.zMm],seen=[];
  for(const [outer,polygon,local]of domains)for(const direction of boundaryTangents(outer,polygon)){
    const tangent=parent&&!local?rotateXZ(direction,-parent.pose.yawDeg):direction;
    if(seen.some(t=>Math.abs(t[0]*tangent[1]-t[1]*tangent[0])<1e-12))continue;seen.push(tangent);
    const distance=remainder[0]*tangent[0]+remainder[1]*tangent[1];
    if(Math.abs(distance)<1e-9)continue;
    const next=sweptPrefix(contactState,{x:contact.xMm+tangent[0]*distance,z:contact.zMm+tangent[1]*distance});
    const pose=pointOf(next),nextScore=(pose.xMm-target.x)**2+(pose.zMm-target.z)**2;
    if(nextScore<score){score=nextScore;best=next;}
  }
  return Object.freeze({...result(best),boundaryLimited:true,pointerRemainder:Object.freeze({x:x-worldTarget.x,z:z-worldTarget.z})});
}
// World angles remain unwrapped: +360 and -270 describe directed paths, not
// equivalent endpoints or a shortest turn. Each preview starts at the previous
// accepted state; the app alone commits that frozen transaction on pointerup.
export function resolveWorldRotation(state, input, catalog = [], options = {}) {
  try {
    if (!plain(input) || Object.keys(input).some(k => !['id', 'yawDeg'].includes(k)) || !idOK(input.id)
      || !plain(options) || Object.keys(options).some(k => !['snapDeg', 'snapOrigin'].includes(k))) return false;
    const {id, yawDeg} = input, {snapDeg = 15, snapOrigin = null} = options;
    if (!numberOK(yawDeg, -2 * LIMITS.maxYawDeg, 2 * LIMITS.maxYawDeg)
      || !numberOK(snapDeg, 0, 360)
      || snapOrigin !== null && !numberOK(snapOrigin, -2 * LIMITS.maxYawDeg, 2 * LIMITS.maxYawDeg)) return false;
    const machines = catalogOf(catalog); assertState(state, machines);
    const furniture = state.furniture.find(f => f.id === id), printer = state.printers.find(p => p.id === id);
    if (!furniture && !printer) return false;
    const origin = worldTransform(state, id, machines), anchor = snapOrigin ?? origin.yawDeg;
    const snapped = snapDeg === 0 ? yawDeg : anchor + Math.round((yawDeg - anchor) / snapDeg) * snapDeg;
    // A finite wall contact can lie between snap angles. Continued pressure or
    // a stationary pointer must not reverse to the grid point behind it.
    const target = yawDeg === origin.yawDeg || (yawDeg - origin.yawDeg) * (snapped - origin.yawDeg) < 0 ? origin.yawDeg : snapped;
    const parent = printer && state.furniture.find(f => f.id === printer.attachment.parentId);
    const parentYaw = parent?.pose.yawDeg ?? 0;
    if (!numberOK(target - parentYaw, -LIMITS.maxYawDeg, LIMITS.maxYawDeg)) return false;
    const ids = furniture ? [id, ...state.printers.filter(p => p.attachment.parentId === id).map(p => p.id)] : [id];
    // Rotation is not an implicit repair of an imported overhang/outside pose.
    if (placementViolations(state, machines).some(e => ids.includes(e.entityIds[0]))) return false;
    const local = furniture ? rectangle(furniture.widthMm, furniture.depthMm) : machines.byId[printer.machineId].footprintMm;
    const followers = furniture ? state.printers.filter(p => p.attachment.parentId === id).map(p => localPrinterPolygon(p, machines)) : [];
    const surface = parent && rectangle(parent.widthMm, parent.depthMm);
    const trial = goal => {
      const delta = goal - origin.yawDeg, segments = Math.max(1, Math.ceil(Math.abs(delta) / 90));
      let next = state, previousWorld = origin;
      for (let i = 1; i <= segments; i++) {
        const worldYaw = i === segments ? goal : origin.yawDeg + delta * (i / segments);
        // Preserve the exact source local angle on a no-op; avoid a needless
        // parent-world-parent floating-point roundtrip at a gesture's origin.
        const localYaw = worldYaw === origin.yawDeg ? (furniture?.pose.yawDeg ?? printer.attachment.yawDeg) : worldYaw - parentYaw;
        const before = next;
        next = applyAction(before, furniture
          ? {type: 'UPDATE_FURNITURE', id, patch: {pose: {yawDeg: localYaw}}}
          : {type: 'UPDATE_PRINTER', id, patch: {attachment: {yawDeg: localYaw}}}, machines);
        const world = worldTransform(next, id, machines);
        // applyAction validates each transaction. Explicit sweeps also cover
        // symmetric/equal footprints that its unchanged-polygon fast path skips.
        if (!rigidMotionStaysInside(state.room.polygonMm, local, previousWorld, world)
          || followers.some(poly => !rigidMotionStaysInside(state.room.polygonMm, poly, previousWorld, world))) return false;
        if (surface && !rigidMotionStaysInside(surface, local,
          before.printers.find(p => p.id === id).attachment, next.printers.find(p => p.id === id).attachment)) return false;
        previousWorld = world;
      }
      return next;
    };
    const accepted = goal => {
      try { return trial(goal); }
      catch (error) {
        if (!(error instanceof LayoutValidationError)) throw error;
        if (error.errors.some(e => !PLACEMENT_BOUNDARY_CODES.includes(e.code))) throw error;
        return false;
      }
    };
    const result = (next, limited = false) => Object.freeze({state: next,
      yawDeg: worldTransform(next, id, machines).yawDeg,
      ...(limited ? {boundaryLimited: true} : {}),
      // A clipped arc consumes blocked overshoot. Re-adding a signed grid
      // remainder at an off-grid contact could incorrectly reverse the drag.
      ...(!limited && target === snapped ? {pointerRemainderDeg: yawDeg - snapped} : {})});
    const complete = accepted(target);
    if (complete) return result(complete);
    // Every predicate trial proves the entire signed interval prefix, split
    // into <=90deg sweeps. A valid endpoint beyond a blocked arc cannot jump it.
    let low = 0, high = 1, best = state;
    for (let i = 0; i < 64; i++) {
      const t = low + (high - low) / 2; if (t === low || t === high) break;
      const candidate = accepted(origin.yawDeg + (target - origin.yawDeg) * t);
      if (candidate) { low = t; best = candidate; } else high = t;
    }
    return result(best, true);
  } catch (error) {
    if (error instanceof LayoutValidationError) return false;
    throw error;
  }
}
// Public renderer callback shape. The app uses resolveWorldMove to retain the
// same transaction for its once-only commit; this convenience remains pure.
export function previewWorldMove(state, input, catalog = [], options = {}) {
  const result = resolveWorldMove(state, input, catalog, options);
  return result && Object.freeze({x: result.x, z: result.z});
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
    const parent = state.furniture.find(f => f.id === p.parentId);
    const source = state.printers.find(e => e.id === p.id), machines = catalogOf(catalog);
    if (!polygonContains(rectangle(parent.widthMm, parent.depthMm), localPrinterPolygon(source, machines))) warn('SURFACE_OVERHANG', [p.id, p.parentId], {surfaceId: p.surfaceId});
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
  assertState(state, catalog); const text = JSON.stringify({...state, room: roomWithAppearance(state.room)}, null, 2);
  if (text.length > LIMITS.maxJsonChars) fail('JSON_SIZE_LIMIT', 'json'); return text;
}
export function parseLayout(text, catalog = []) {
  if (typeof text !== 'string' || text.length > LIMITS.maxJsonChars) fail('JSON_SIZE_LIMIT', 'json');
  let state; try { state = JSON.parse(text); } catch { fail('JSON_PARSE_ERROR', 'json'); }
  assertState(state, catalog); return freeze({...state, room: roomWithAppearance(state.room)});
}

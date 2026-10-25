import {polygonProblems, polygonContains, polygonsOverlap, rectangle, rotateXZ, transformPolygon, bounds} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';
import {rigidMotionStaysInside,boundaryTangents} from './layout-constraints.mjs?v=53e33561b2e7ce324016';
import {WALL_FINISHES, FLOOR_FINISHES, DEFAULT_ROOM_APPEARANCE} from './layout-finishes.mjs?v=001b62f9728770a12303';
import {rootPose,groupRootPose,rebaseLayoutGroups} from './layout-group-data.mjs?v=402a86c4c0754fb6e10f';
import {envelopeOverlaps,envelopeChange,prepareCollisionMotion} from './layout-collision.mjs?v=1a7a6f204f8ed66b33ed';
import {getLayoutEquipment} from './layout-equipment.mjs?v=bd8e2772cabd6fd2564b';
import {wallRotationCenters} from './layout-wall-rotation.mjs?v=7ae98b15139f328512eb';
import {isGroupLabel} from './layout-group-labels.mjs?v=1ff84a0cf5540fd3184b';

export const LIMITS = Object.freeze({maxFurniture: 64, maxPrinters: 128, maxRoomVertices: 32,
  maxFootprintVertices: 32, maxLevels: 32, maxCoordinateMm: 1000000, maxDimensionMm: 100000,
  maxWallHeightMm: 20000, maxYawDeg: 360000, maxJsonChars: 2000000, maxCatalogEntries: 10000, maxGroups: 64});
// Authored layout datums, not a manufacturer mounting or load-rating certificate.
export const U1_LAYOUT_MACHINE_ID = 'snapmaker_u1_layout_reference';
// Snapmaker's published total height includes cables above the reference body.
// https://www.snapmaker.com/en-EU/snapmaker-u1/specs
export const U1_OPERATING_HEIGHT_MM = 730;
const cabinet=getLayoutEquipment('biqu_pop_station_mini_layout_reference','empty'),mount=cabinet.mount;
const [[deckMinX,deckMinZ],[deckMaxX,deckMaxZ]]=mount.support.contactPatch.boundsXZ_M;
export const POPSTATION_MINI = Object.freeze({type:'popstation_mini',
  widthMm:mount.nominalDimensionsMm.width,depthMm:mount.nominalDimensionsMm.depth,heightMm:mount.nominalDimensionsMm.height,
  surfaceId:'top',topMm:mount.support.topYM*1000,mountMachineId:U1_LAYOUT_MACHINE_ID,
  supportPolygonMm:Object.freeze([[deckMinX,deckMinZ],[deckMaxX,deckMinZ],[deckMaxX,deckMaxZ],[deckMinX,deckMaxZ]].map(p=>Object.freeze(p.map(v=>v*1000)))),
  u1SupportFootprintMm:Object.freeze(getLayoutEquipment(U1_LAYOUT_MACHINE_ID,'docked').supportFootprintMm.map(p=>Object.freeze([...p])))});
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
const frozenValues=new WeakSet();
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); frozenValues.add(value); }
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
  const allowed = ['id', 'type', 'widthMm', 'depthMm', 'heightMm', 'pose', ...(f.type === 'desk' ? ['topThicknessMm'] : f.type === 'shelf' ? ['boardThicknessMm', 'levels'] : [])];
  keys(f, allowed, path, errors); identifier(f.id, `${path}.id`, errors);
  if (!['desk', 'shelf', 'popstation_mini'].includes(f.type)) issue(errors, 'UNKNOWN_FURNITURE_TYPE', `${path}.type`);
  for (const axis of ['widthMm', 'depthMm', 'heightMm']) num(f[axis], 30, LIMITS.maxDimensionMm, `${path}.${axis}`, errors);
  poseCheck(f.pose, `${path}.pose`, errors);
  if (f.type === 'popstation_mini' && ['widthMm','depthMm','heightMm'].some(key=>f[key]!==POPSTATION_MINI[key]))
    issue(errors,'POPSTATION_FIXED_DIMENSIONS',path);
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
function attachmentCheck(a, path, furniture, errors, machineId) {
  if (!keys(a, ['parentId', 'surfaceId', 'xMm', 'zMm', 'yawDeg'], path, errors)) return;
  poseCheck({xMm: a.xMm, zMm: a.zMm, yawDeg: a.yawDeg}, path, errors);
  if (a.parentId === null) { if (a.surfaceId !== 'floor') issue(errors, 'FLOOR_SURFACE_REQUIRED', `${path}.surfaceId`); return; }
  identifier(a.parentId, `${path}.parentId`, errors); identifier(a.surfaceId, `${path}.surfaceId`, errors);
  const parent = furniture.find(f => f?.id === a.parentId);
  if (!parent) { issue(errors, 'UNKNOWN_PARENT', `${path}.parentId`, {parentId: a.parentId}); return; }
  if (parent.type === 'popstation_mini') {
    if(a.surfaceId!=='top')issue(errors,'UNKNOWN_SURFACE',`${path}.surfaceId`,{surfaceId:a.surfaceId});
    if(machineId!==U1_LAYOUT_MACHINE_ID)issue(errors,'POPSTATION_U1_ONLY',path);
    if(a.xMm!==0||a.zMm!==0||a.yawDeg!==0)issue(errors,'POPSTATION_MOUNT_FIXED',path);
    return;
  }
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
    if (m.supportFootprintMm !== undefined) polygonCheck(m.supportFootprintMm, `${p}.supportFootprintMm`, errors);
  });
  if (errors.length) throw new LayoutValidationError(errors);
}
const catalogs = new WeakSet();
export function createCatalog(entries) {
  catalogCheck(entries);
  const list = entries.map(m => ({id: m.id, widthMm: m.widthMm, depthMm: m.depthMm, heightMm: m.heightMm,
    baseOffsetMm: m.baseOffsetMm ?? 0, footprintMm: copy(m.footprintMm ?? rectangle(m.widthMm, m.depthMm)),
    ...(m.supportFootprintMm!==undefined||m.id===U1_LAYOUT_MACHINE_ID?{supportFootprintMm:copy(m.supportFootprintMm??POPSTATION_MINI.u1SupportFootprintMm)}:{})}));
  const catalog = freeze({entries: list, byId: Object.assign(Object.create(null), Object.fromEntries(list.map(m => [m.id, m])))});
  catalogs.add(catalog); return catalog;
}
function catalogOf(catalog = []) { return catalogs.has(catalog) ? catalog : createCatalog(catalog); }
function printerEquipment(state, printer, machines) {
  const machine=machines.byId[printer.machineId];
  if(!machine)fail('UNKNOWN_MACHINE','machineId',{machineId:printer.machineId});
  if(printer.machineId!==U1_LAYOUT_MACHINE_ID)return machine;
  const docked=state.furniture.some(f=>f.id===printer.attachment.parentId&&f.type==='popstation_mini');
  const variant=docked?'docked':'standalone',profile=getLayoutEquipment(U1_LAYOUT_MACHINE_ID,variant);
  return {...machine,widthMm:profile.dimensionsMm.width,depthMm:profile.dimensionsMm.depth,heightMm:profile.dimensionsMm.height,
    footprintMm:copy(profile.footprintMm),supportFootprintMm:copy(profile.supportFootprintMm),equipmentVariant:variant};
}
// The parent attachment is the only saved choice. Variant switches cannot go stale.
export function resolvePrinterEquipment(state, printerOrId, catalog = []) {
  const printer=typeof printerOrId==='string'?requireEntity(state.printers,printerOrId,'printerId'):printerOrId;
  return freeze(copy(printerEquipment(state,printer,catalogOf(catalog))));
}
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
    attachmentCheck(p.attachment, `${loc}.attachment`, furniture, errors, p.machineId);
  });
  for(const parent of furniture.filter(f=>f?.type==='popstation_mini')){
    const children=printers.filter(p=>p?.attachment?.parentId===parent.id);
    if(children.length>1)issue(errors,'POPSTATION_CAPACITY','printers',{parentId:parent.id,capacity:1});
  }
  if (state.groups !== undefined) {
    if (!Array.isArray(state.groups) || state.groups.length > LIMITS.maxGroups) issue(errors, 'GROUP_LIMIT', 'groups');
    else {
      const assigned = new Set(), labels = new Set();
      state.groups.forEach((g, i) => {
        const path = `groups[${i}]`;
        if (!keys(g, ['id','name','label','pose','originPose','memberIds','memberPoses'], path, errors)) return;
        identifier(g.id, `${path}.id`, errors);
        if (ids.has(g.id)) issue(errors, 'DUPLICATE_ENTITY_ID', `${path}.id`); ids.add(g.id);
        if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80 || /[\u0000-\u001f\u007f]/.test(g.name)) issue(errors, 'GROUP_NAME', `${path}.name`);
        if (Object.hasOwn(g, 'label')) {
          if (!isGroupLabel(g.label)) issue(errors, 'GROUP_LABEL', `${path}.label`);
          else if (labels.has(g.label)) issue(errors, 'GROUP_LABEL_DUPLICATE', `${path}.label`);
          else labels.add(g.label);
        }
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
export function createPopStation({id='popstation-1',pose=defaultPose()}={}) {
  return assertFurniture({id,type:'popstation_mini',widthMm:POPSTATION_MINI.widthMm,
    depthMm:POPSTATION_MINI.depthMm,heightMm:POPSTATION_MINI.heightMm,pose});
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
      if(f.type==='popstation_mini'&&['widthMm','depthMm','heightMm'].some(key=>Object.hasOwn(action.patch,key)&&action.patch[key]!==POPSTATION_MINI[key]))fail('POPSTATION_FIXED_DIMENSIONS','action.patch');
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
function localPrinterPolygon(p, machines, state) { return transformPolygon(printerEquipment(state,p,machines).footprintMm, p.attachment); }
function supportPolygon(parent) { return parent.type==='popstation_mini'?POPSTATION_MINI.supportPolygonMm:rectangle(parent.widthMm,parent.depthMm); }
function printerSupportPolygon(p,machines,state) {const m=printerEquipment(state,p,machines);return m.supportFootprintMm??m.footprintMm;}
function localPrinterSupportPolygon(p,machines,state) {return transformPolygon(printerSupportPolygon(p,machines,state),p.attachment);}
function containmentIssues(state, scene, machines, ids) {
  const result = [], wanted = new Set(ids);
  for (const e of [...scene.furniture, ...scene.printers]) if (wanted.has(e.id) && !polygonContains(state.room.polygonMm, e.worldEnvelopeMm))
    result.push({code: 'ROOM_OUT_OF_BOUNDS', path: 'action', params: {entityIds: [e.id]}});
  for (const p of state.printers) if (wanted.has(p.id) && p.attachment.parentId !== null) {
    const parent = state.furniture.find(f => f.id === p.attachment.parentId);
    // Compare in parent-local coordinates: a rotated shared edge is still a shared edge.
    if (!polygonContains(supportPolygon(parent), localPrinterSupportPolygon(p, machines, state)))
      result.push({code: 'SURFACE_OVERHANG', path: 'action', params: {entityIds: [p.id, parent.id]}});
  }
  return result;
}
export const PLACEMENT_BOUNDARY_CODES = Object.freeze(['ROOM_OUT_OF_BOUNDS', 'SURFACE_OVERHANG']);
const MOTION_REJECTION_CODES=[...PLACEMENT_BOUNDARY_CODES,'ENVELOPE_OVERLAP'];
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
          local = printerEquipment(next,current,machines).footprintMm;
          if (action.type === 'UPDATE_FURNITURE' && current.attachment.parentId === action.id) {
            local = localPrinterPolygon(old, machines, state);
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
    const outer = supportPolygon(parent), polygon = localPrinterSupportPolygon(current, machines, next);
    const oldOuter = sameSurface ? supportPolygon(oldParent) : null;
    const oldPolygon = sameSurface ? localPrinterSupportPolygon(old, machines, state) : null;
    const surfacePath = sameSurface && old.machineId === current.machineId && samePolygon(oldOuter, outer)
      ? () => rigidMotionStaysInside(outer, printerSupportPolygon(current,machines,next), old.attachment, current.attachment) : null;
    boundary('SURFACE_OVERHANG', end.id, oldOuter, oldPolygon, outer, polygon, surfacePath);
  }
  const moving=[...ids],oldFurniture=state.furniture.find(f=>f.id===action.id),newFurniture=next.furniture.find(f=>f.id===action.id);
  const oldPrinter=state.printers.find(p=>p.id===action.id),newPrinter=next.printers.find(p=>p.id===action.id);
  let origin,target,locals;
  if(action.type==='UPDATE_FURNITURE'&&oldFurniture&&newFurniture){
    origin=oldFurniture.pose;target=newFurniture.pose;
    locals=new Map([[action.id,rectangle(oldFurniture.widthMm,oldFurniture.depthMm)],
      ...state.printers.filter(p=>p.attachment.parentId===action.id).map(p=>[p.id,localPrinterPolygon(p,machines,state)])]);
  }else if(oldPrinter&&newPrinter&&oldPrinter.machineId===newPrinter.machineId
    &&oldPrinter.attachment.parentId===newPrinter.attachment.parentId&&oldPrinter.attachment.surfaceId===newPrinter.attachment.surfaceId){
    origin=previous.get(action.id);target=after.printers.find(p=>p.id===action.id);
    locals=new Map([[action.id,printerEquipment(state,oldPrinter,machines).footprintMm]]);
  }
  const rigid=!!origin&&oldFurniture?.widthMm===newFurniture?.widthMm&&oldFurniture?.depthMm===newFurniture?.depthMm
    &&oldFurniture?.heightMm===newFurniture?.heightMm&&JSON.stringify(oldFurniture?.levels)===JSON.stringify(newFurniture?.levels);
  const pair=envelopeChange(before,after,moving,{rigid});
  if(pair)fail('ENVELOPE_OVERLAP','action',{entityIds:pair,reason:'TARGET_ENVELOPES_INTERSECT'});
  if(origin&&['xMm','zMm','yawDeg'].some(k=>origin[k]!==target[k])
    &&!prepareCollisionMotion(before,moving,origin,locals).accepts(target))
    fail('ENVELOPE_OVERLAP','action',{entityIds:moving,reason:'CONTINUOUS_ENVELOPE_PATH_BLOCKED'});
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
  if(parent?.type==='popstation_mini'&&(xMm!==0||zMm!==0))fail('POPSTATION_MOUNT_FIXED','action',{entityIds:[printer.id,parent.id]});
  if (parent && numberOK(xMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm)
    && numberOK(zMm, -LIMITS.maxCoordinateMm, LIMITS.maxCoordinateMm) && (xMm !== a.xMm || zMm !== a.zMm)) {
    const inside = printerSupportPolygon(printer,machines,state).every(p => {
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
    if (error.errors.some(e => !MOTION_REJECTION_CODES.includes(e.code))) return false;
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
  const prepareLeg=from=>{
    const scene=deriveScene(from,machines),all=[...scene.furniture,...scene.printers],root=all.find(e=>e.id===id);
    const support=parent&&from.furniture.find(f=>f.id===parent.id),source=from.printers.find(p=>p.id===id);
    const followers=furniture?from.printers.filter(p=>p.attachment.parentId===id):[];
    const locals=new Map([[id,furniture?rectangle(root.widthMm,root.depthMm):printerEquipment(from,source,machines).footprintMm],
      ...followers.map(p=>[p.id,localPrinterPolygon(p,machines,from)])]);
    const collision=prepareCollisionMotion(scene,ids,root,locals);
    return goal=>{
      if(!numberOK(goal.x,-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm)||!numberOK(goal.z,-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm))return false;
      const q=support?rotateXZ([goal.x,goal.z],support.pose.yawDeg):[goal.x,goal.z];
      const end={xMm:q[0]+(support?.pose.xMm??0),zMm:q[1]+(support?.pose.zMm??0),yawDeg:root.yawDeg};
      if(support){
        const a=source.attachment;
        const contact=printerSupportPolygon(source,machines,from);
        if(!contact.every(p=>{
          const [x,z]=rotateXZ(p,a.yawDeg);
          return sumAtMost(goal.x,x,support.widthMm/2)&&sumAtMost(-goal.x,-x,support.widthMm/2)
            &&sumAtMost(goal.z,z,support.depthMm/2)&&sumAtMost(-goal.z,-z,support.depthMm/2);
        }))return false;
        if(!rigidMotionStaysInside(supportPolygon(support),contact,a,{...a,xMm:goal.x,zMm:goal.z}))return false;
      }
      const endpoints=new Map();
      for(const [entityId,local]of locals){
        if(!rigidMotionStaysInside(from.room.polygonMm,local,root,end))return false;
        let polygon;
        const child=followers.find(p=>p.id===entityId);
        if(child){
          const a=child.attachment,[x,z]=rotateXZ([a.xMm,a.zMm],end.yawDeg);
          polygon=transformPolygon(printerEquipment(from,child,machines).footprintMm,{xMm:end.xMm+x,zMm:end.zMm+z,yawDeg:end.yawDeg+a.yawDeg});
        }else polygon=transformPolygon(local,end);
        if(!polygonContains(from.room.polygonMm,polygon))return false;
        endpoints.set(entityId,polygon);
      }
      return collision.accepts(end,endpoints);
    };
  };
  const sweptPrefix = (from,goal) => {
    const start=pointOf(from);
    const accepts=prepareLeg(from);
    // Search on cached numerical entities, then allocate/validate the complete
    // immutable transaction once. The authoritative action remains the commit
    // gate; a rare numerical disagreement falls back to its bounded predicate.
    let cheapLow=0,cheapHigh=1,point=null;
    if(accepts(goal))point=goal;
    else for(let i=0;i<64;i++){
      const t=cheapLow+(cheapHigh-cheapLow)/2;if(t===cheapLow||t===cheapHigh)break;
      const candidate={x:start.xMm+(goal.x-start.xMm)*t,z:start.zMm+(goal.z-start.zMm)*t};
      if(accepts(candidate)){cheapLow=t;point=candidate;}else cheapHigh=t;
    }
    if(!point)return from;
    try{return applyPoint(from,point);}
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
    domains.unshift([supportPolygon(parent),localPrinterSupportPolygon(best.printers.find(p=>p.id===id),machines,best),true]);
  }
  const obstacleMotion=prepareCollisionMotion(scene,ids,worldTransform(best,id,machines));
  const obstacleTangents=obstacleMotion.tangents(worldTransform(best,id,machines));
  let score=(contact.xMm-target.x)**2+(contact.zMm-target.z)**2;
  const remainder=[target.x-contact.xMm,target.z-contact.zMm],seen=[];
  const candidates=domains.flatMap(([outer,polygon,local])=>boundaryTangents(outer,polygon).map(direction=>({direction,local})));
  candidates.push(...obstacleTangents.map(direction=>({direction,local:false})));
  for(const {direction,local}of candidates){
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
function rotateInPlace(state,id,goal,machines,exactLocalYaw=null){
  const furniture=state.furniture.find(f=>f.id===id),printer=state.printers.find(p=>p.id===id);
  const origin=worldTransform(state,id,machines),parent=printer&&state.furniture.find(f=>f.id===printer.attachment.parentId);
  const ids=furniture?[id,...state.printers.filter(p=>p.attachment.parentId===id).map(p=>p.id)]:[id];
  const local=furniture?rectangle(furniture.widthMm,furniture.depthMm):printerEquipment(state,printer,machines).footprintMm;
  const locals=new Map([[id,local],...(furniture?state.printers.filter(p=>p.attachment.parentId===id).map(p=>[p.id,localPrinterPolygon(p,machines,state)]):[])]);
  const surface=parent&&supportPolygon(parent),contact=printer&&printerSupportPolygon(printer,machines,state);
  const collision=prepareCollisionMotion(deriveScene(state,machines),ids,origin,locals);
  const delta=goal-origin.yawDeg,count=Math.max(1,Math.ceil(Math.abs(delta)/90));
  let next=state,previous=origin;
  for(let i=1;i<=count;i++){
    const yaw=i===count?goal:origin.yawDeg+delta*i/count;
    const localYaw=i===count&&exactLocalYaw!==null?exactLocalYaw:yaw===origin.yawDeg?(furniture?.pose.yawDeg??printer.attachment.yawDeg):yaw-(parent?.pose.yawDeg??0);
    const before=next;
    next=applyAction(before,furniture?{type:'UPDATE_FURNITURE',id,patch:{pose:{yawDeg:localYaw}}}:{type:'UPDATE_PRINTER',id,patch:{attachment:{yawDeg:localYaw}}},machines);
    const world=worldTransform(next,id,machines);
    for(const polygon of locals.values())if(!rigidMotionStaysInside(state.room.polygonMm,polygon,previous,world))return false;
    if(surface&&!rigidMotionStaysInside(surface,contact,before.printers.find(p=>p.id===id).attachment,next.printers.find(p=>p.id===id).attachment))return false;
    previous=world;
  }
  const scene=deriveScene(next,machines),endpoints=new Map([...scene.furniture,...scene.printers].filter(e=>ids.includes(e.id)).map(e=>[e.id,e.worldEnvelopeMm]));
  return collision.accepts(worldTransform(next,id,machines),endpoints)?next:false;
}
export function resolveWorldRotation(state, input, catalog = [], options = {}) {
  try {
    if (!plain(input) || Object.keys(input).some(k => !['id', 'yawDeg'].includes(k)) || !idOK(input.id)
      || !plain(options) || Object.keys(options).some(k => !['snapDeg', 'snapOrigin','anchorPointMm','anchorLocalPointMm','targetLocalYawDeg'].includes(k))) return false;
    const {id, yawDeg} = input, {snapDeg = 15, snapOrigin = null,anchorPointMm=null,anchorLocalPointMm=null,targetLocalYawDeg=null} = options;
    if (!numberOK(yawDeg, -2 * LIMITS.maxYawDeg, 2 * LIMITS.maxYawDeg)
      || !numberOK(snapDeg, 0, 360)
      || snapOrigin !== null && !numberOK(snapOrigin, -2 * LIMITS.maxYawDeg, 2 * LIMITS.maxYawDeg)
      || anchorPointMm!==null&&(!plain(anchorPointMm)||Object.keys(anchorPointMm).some(k=>!['xMm','zMm'].includes(k))||!['xMm','zMm'].every(k=>numberOK(anchorPointMm[k],-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm)))
      || anchorLocalPointMm!==null&&(!plain(anchorLocalPointMm)||Object.keys(anchorLocalPointMm).some(k=>!['xMm','zMm'].includes(k))||!['xMm','zMm'].every(k=>numberOK(anchorLocalPointMm[k],-LIMITS.maxCoordinateMm,LIMITS.maxCoordinateMm)))
      || targetLocalYawDeg!==null&&!numberOK(targetLocalYawDeg,-LIMITS.maxYawDeg,LIMITS.maxYawDeg)) return false;
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
    if(anchorLocalPointMm){
      if(!parent||!anchorPointMm)return false;
      const q=rotateXZ([anchorLocalPointMm.xMm,anchorLocalPointMm.zMm],parentYaw);
      if(q[0]+parent.pose.xMm!==anchorPointMm.xMm||q[1]+parent.pose.zMm!==anchorPointMm.zMm)return false;
    }
    if (!numberOK(target - parentYaw, -LIMITS.maxYawDeg, LIMITS.maxYawDeg)) return false;
    if(targetLocalYawDeg!==null&&parentYaw+targetLocalYawDeg!==target)return false;
    const ids = furniture ? [id, ...state.printers.filter(p => p.attachment.parentId === id).map(p => p.id)] : [id];
    // Rotation is not an implicit repair of an imported overhang/outside pose.
    if (placementViolations(state, machines).some(e => ids.includes(e.entityIds[0]))) return false;
    const local = furniture ? rectangle(furniture.widthMm, furniture.depthMm) : printerEquipment(state,printer,machines).footprintMm;
    const followers = furniture ? state.printers.filter(p => p.attachment.parentId === id).map(p => localPrinterPolygon(p, machines, state)) : [];
    const surface = parent && supportPolygon(parent), supportLocal=printer&&printerSupportPolygon(printer,machines,state);
    const accepted = (goal,from=state) => {
      try { return rotateInPlace(from,id,goal,machines,goal===target?targetLocalYawDeg:null); }
      catch (error) {
        if (!(error instanceof LayoutValidationError)) throw error;
        if (error.errors.some(e => !MOTION_REJECTION_CODES.includes(e.code))) throw error;
        return false;
      }
    };
    const restore=next=>{
      if(!anchorPointMm)return next;
      return resolveWorldMove(next,{id,x:anchorPointMm.xMm,z:anchorPointMm.zMm},machines,{snapMm:0,snapOrigin:anchorLocalPointMm})?.state??next;
    };
    const result = (next, limited = false,assisted=false) => {next=restore(next);const world=worldTransform(next,id,machines);return Object.freeze({state: next,
      yawDeg:world.yawDeg,x:world.xMm,z:world.zMm,
      ...(assisted||world.xMm!==origin.xMm||world.zMm!==origin.zMm?{wallAdjusted:true}:{}),
      ...(limited ? {boundaryLimited: true} : {}),
      // A clipped arc consumes blocked overshoot. Re-adding a signed grid
      // remainder at an off-grid contact could incorrectly reverse the drag.
      ...(!limited && target === snapped ? {pointerRemainderDeg: yawDeg - snapped} : {})});};
    const complete = accepted(target);
    if (complete) return result(complete);
    // A centre-fixed arc cannot turn away from an exact wall contact. Retreat
    // only as required by the room/support, turn there, then approach the old
    // anchor again. Every leg uses the existing continuous containment and
    // peer-collision predicates; a clear endpoint alone never accepts a turn.
    // Use the exact stored support frame for attached printers. Transforming
    // both contact polygons independently to world space can round a flush
    // source vertex onto opposite sides of an angled desk's edge.
    const helperOrigin=parent?printer.attachment:origin;
    const domains=parent?[{outer:state.room.polygonMm.map(([x,z])=>rotateXZ([x-parent.pose.xMm,z-parent.pose.zMm],-parentYaw)),locals:[local]},
      {outer:surface,locals:[supportLocal]}]:[{outer:state.room.polygonMm,locals:[local,...followers]}];
    // Repeated full turns sweep the same support envelope. The actual trial
    // below still checks every signed <=90deg leg and retains the turn count.
    const helperTarget=helperOrigin.yawDeg+Math.sign(target-origin.yawDeg)*Math.min(360,Math.abs(target-origin.yawDeg));
    for(const proposed of wallRotationCenters(domains,helperOrigin,helperTarget)){
      try{
        const away=parent?applyPrinterMove(state,printer,proposed.xMm,proposed.zMm,machines,parent)
          :applyWorldMove(state,{id,xMm:proposed.xMm,zMm:proposed.zMm},machines);
        const turned=accepted(target,away);if(!turned)continue;
        const back=resolveWorldMove(turned,{id,x:origin.xMm,z:origin.zMm},machines,{snapMm:0});
        return result(back?.state??turned,false,true);
      }catch(error){if(!(error instanceof LayoutValidationError))throw error;}
    }
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
const sceneCache=new WeakMap();
function surfaceUnchecked(state, parentId, surfaceId) {
  if (parentId === null) {
    if (surfaceId !== 'floor') fail('FLOOR_SURFACE_REQUIRED', 'surfaceId');
    return {parentId: null, surfaceId: 'floor', heightMm: 0, xMm: 0, zMm: 0, yawDeg: 0,
      positionM: {x: 0, y: 0, z: 0}, yawRad: 0, polygonMm: copy(state.room.polygonMm), worldEnvelopeMm: copy(state.room.polygonMm)};
  }
  const f = requireEntity(state.furniture, parentId, 'parentId');
  if(f.type==='popstation_mini'){
    if(surfaceId!=='top')fail('UNKNOWN_SURFACE','surfaceId',{surfaceId});
    const polygonMm=copy(POPSTATION_MINI.supportPolygonMm),heightMm=POPSTATION_MINI.topMm;
    return {parentId,surfaceId,heightMm,...f.pose,positionM:{x:f.pose.xMm/1000,y:heightMm/1000,z:f.pose.zMm/1000},
      yawRad:f.pose.yawDeg*Math.PI/180,polygonMm,worldEnvelopeMm:transformPolygon(polygonMm,f.pose),
      furnitureType:f.type,mountMachineId:U1_LAYOUT_MACHINE_ID,fixedMount:true,capacity:1};
  }
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
  const machines = catalogOf(catalog);
  const cached=frozenValues.has(state)&&sceneCache.get(state)?.get(machines);if(cached)return cached;
  assertState(state, machines);
  const surfaces = [surfaceUnchecked(state, null, 'floor')];
  const furniture = state.furniture.map(f => {
    const boards = (f.type === 'desk' ? [{id: 'top', topMm: f.heightMm}] : f.type==='popstation_mini'?[{id:'top',topMm:POPSTATION_MINI.topMm}]:f.levels).map(l => {
      if(f.type==='popstation_mini'){
        surfaces.push(surfaceUnchecked(state,f.id,'top'));
        // A zero-thickness picking surface, not a procedural furniture board.
        return {id:'top',widthM:.382,depthM:.426,thicknessM:0,localCenterXM:0,localCenterYM:.4174,localCenterZM:-.002,topYM:.4174};
      }
      const thicknessMm = f.type === 'desk' ? 30 : f.boardThicknessMm;
      surfaces.push(surfaceUnchecked(state, f.id, l.id));
      return {id: l.id, widthM: f.widthMm / 1000, depthM: f.depthMm / 1000, thicknessM: thicknessMm / 1000,
        localCenterYM: (l.topMm - thicknessMm / 2) / 1000, topYM: l.topMm / 1000};
    });
    return {id: f.id, type: f.type, ...f.pose, widthMm: f.widthMm, depthMm: f.depthMm, heightMm: f.heightMm,
      ...(f.type==='popstation_mini'?{equipmentVariant:state.printers.some(p=>p.machineId===U1_LAYOUT_MACHINE_ID&&p.attachment.parentId===f.id)?'loaded':'empty'}:{}),
      widthM: f.widthMm / 1000, depthM: f.depthMm / 1000, heightM: f.heightMm / 1000,
      positionM: {x: f.pose.xMm / 1000, y: 0, z: f.pose.zMm / 1000}, yawRad: f.pose.yawDeg * Math.PI / 180,
      worldEnvelopeMm: transformPolygon(rectangle(f.widthMm, f.depthMm), f.pose), verticalRangeMm: [0, f.heightMm], boards};
  });
  const printers = state.printers.map(p => {
    const a = p.attachment, s = surfaceUnchecked(state, a.parentId, a.surfaceId), m = printerEquipment(state,p,machines);
    const local = rotateXZ([a.xMm, a.zMm], s.yawDeg), pose = {xMm: s.xMm + local[0], zMm: s.zMm + local[1], yawDeg: s.yawDeg + a.yawDeg};
    return {id: p.id, type: 'printer', machineId: p.machineId, configurationId: p.configurationId, ...pose,
      ...(m.equipmentVariant?{equipmentVariant:m.equipmentVariant}:{}),
      parentId: a.parentId, surfaceId: a.surfaceId, supportYM: s.heightMm / 1000,
      positionM: {x: pose.xMm / 1000, y: (s.heightMm + m.baseOffsetMm) / 1000, z: pose.zMm / 1000}, yawRad: pose.yawDeg * Math.PI / 180,
      worldEnvelopeMm: transformPolygon(m.footprintMm, pose),
      verticalRangeMm: [s.heightMm, s.heightMm + Math.max(m.heightMm,p.machineId===U1_LAYOUT_MACHINE_ID?U1_OPERATING_HEIGHT_MM:0)],
      widthMm: m.widthMm, depthMm: m.depthMm, heightMm: m.heightMm,
      widthM: m.widthMm / 1000, depthM: m.depthMm / 1000, heightM: m.heightMm / 1000};
  });
  const scene=freeze({furniture, printers, surfaces});
  if(frozenValues.has(state)){
    let cache=sceneCache.get(state);if(!cache){cache=new WeakMap();sceneCache.set(state,cache);}cache.set(machines,scene);
  }
  return scene;
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
    if (!polygonContains(supportPolygon(parent), localPrinterSupportPolygon(source, machines, state))) warn('SURFACE_OVERHANG', [p.id, p.parentId], {surfaceId: p.surfaceId});
    if (parent.type === 'shelf') for (const level of parent.levels) {
      const bottom = level.topMm - parent.boardThicknessMm;
      if (level.topMm > s.heightMm && p.verticalRangeMm[1] > bottom && p.verticalRangeMm[0] < level.topMm
        && polygonsOverlap(p.worldEnvelopeMm, s.worldEnvelopeMm)) warn('SHELF_BOARD_INTERSECTION', [p.id, parent.id], {levelId: level.id, boardBottomMm: bottom, printerTopMm: p.verticalRangeMm[1]});
    }
  }
  warnings.push(...envelopeOverlaps(scene));
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

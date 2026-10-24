// Pure selection transactions. The caller owns clipboard I/O and instantiation.
import {LIMITS, LayoutValidationError, createDefaultLayout, deriveScene,
  parseLayout, serializeLayout} from './layout-state.mjs?v=178f9d7e9634806cb173';
import {createGroup, captureGroupTemplate, validateGroupTemplate} from './layout-groups.mjs?v=bd219ffd44e6d20acdde';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SELECTION = LIMITS.maxFurniture + LIMITS.maxPrinters + LIMITS.maxGroups;
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const catalogRows = catalog => Array.isArray(catalog) ? catalog : catalog?.entries ?? [];
const fail = (code, path, params = {}) => { throw new LayoutValidationError([{code, path, params}]); };

// Reject data that JSON would silently drop, transform or execute. The depth and
// node bounds also keep hostile object inputs/deep JSON away from recursive
// native validators. Valid templates are much shallower/smaller.
function jsonData(value, path, ancestors = new Set(), budget = {nodes: 0}) {
  if (++budget.nodes > MAX_BYTES || ancestors.size > 16) fail('JSON_SIZE_LIMIT', path);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_BYTES) fail('JSON_SIZE_LIMIT', path);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NUMBER_OUT_OF_RANGE', path);
    return;
  }
  const array = Array.isArray(value);
  if ((!array && !plain(value)) || (array && Object.getPrototypeOf(value) !== Array.prototype))
    fail('EXPECTED_OBJECT', path);
  if (ancestors.has(value)) fail('GROUP_TEMPLATE', path, {reason: 'CYCLIC_DATA'});
  ancestors.add(value);
  if (array && value.length > MAX_SELECTION) fail('JSON_SIZE_LIMIT', path);
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const at = `${path}.${typeof key === 'string' ? key : '[symbol]'}`;
    if (typeof key !== 'string' || reserved.has(key)
      || array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) fail('UNKNOWN_FIELD', at);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('EXPECTED_OBJECT', at);
    jsonData(descriptor.value, at, ancestors, budget);
  }
  if (array && Object.keys(value).length !== value.length) fail('GROUP_TEMPLATE', path, {reason: 'SPARSE_ARRAY'});
  ancestors.delete(value);
}
function checkBytes(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES)
    fail('JSON_SIZE_LIMIT', 'clipboard');
}
function templateSnapshot(template, catalog) {
  // Bound the collections before walking them, without invoking input getters.
  if (plain(template)) for (const [key, limit, code] of [
    ['furniture', LIMITS.maxFurniture, 'FURNITURE_COUNT'], ['printers', LIMITS.maxPrinters, 'PRINTER_COUNT'],
  ]) {
    const value = Object.getOwnPropertyDescriptor(template, key)?.value;
    if (Array.isArray(value) && value.length > limit) fail(code, `clipboard.${key}`);
  }
  jsonData(template, 'clipboard');
  const text = JSON.stringify(template);
  checkBytes(text);
  validateGroupTemplate(template, catalog);
  return JSON.parse(text);
}
function checkedState(state, catalog) {
  // serializeLayout checks the native schema; parseLayout returns a detached,
  // frozen snapshot. Never freeze or lend source arrays to a group transaction.
  jsonData(state, 'state');
  return parseLayout(serializeLayout(state, catalog), catalog);
}
function fields(value, allowed, path) {
  if (!plain(value)) fail('EXPECTED_OBJECT', path);
  for (const key of Reflect.ownKeys(value)) {
    const at = `${path}.${typeof key === 'string' ? key : '[symbol]'}`;
    if (!allowed.includes(key)) fail('UNKNOWN_FIELD', at);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('EXPECTED_OBJECT', at);
  }
}
function selection(state, selectionIds) {
  if (!Array.isArray(selectionIds) || !selectionIds.length || selectionIds.length > MAX_SELECTION)
    fail('GROUP_MEMBERS', 'selectionIds');
  jsonData(selectionIds, 'selectionIds');
  const entities = new Map([...state.furniture, ...state.printers].map(e => [e.id, e]));
  const groups = new Map((state.groups ?? []).map(g => [g.id, g]));
  const ids = new Set();
  for (const [i, id] of selectionIds.entries()) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(id) || reserved.has(id))
      fail('INVALID_ID', `selectionIds[${i}]`);
    if (groups.has(id)) groups.get(id).memberIds.forEach(member => ids.add(member));
    else if (entities.has(id)) ids.add(id);
    else fail('UNKNOWN_ENTITY', `selectionIds[${i}]`, {id});
  }
  // All supported children follow a selected furniture root, including children
  // omitted from the explicit picks or hidden behind an existing group ID.
  for (const printer of state.printers) if (ids.has(printer.attachment.parentId)) ids.add(printer.id);
  return ids;
}

/** Capture selected objects as a normalized native v1 reusable set.
 * A printer picked without its support becomes a floor root at its exact world
 * XZ/yaw before normalization; floor height is zero. Source IDs/configs survive.
 * Placement checks concern this set only, never its unselected neighbours.
 */
export function captureLayoutClipboard(state, selectionIds, catalog = [], options = {}) {
  catalog = catalogRows(catalog);
  fields(options, ['name'], 'options');
  const {name = 'Copied set'} = options;
  const source = checkedState(state, catalog), ids = selection(source, selectionIds);
  const furniture = source.furniture.filter(f => ids.has(f.id));
  const scene = deriveScene(source, catalog), world = new Map(scene.printers.map(p => [p.id, p]));
  const printers = source.printers.filter(p => ids.has(p.id)).map(p => {
    if (p.attachment.parentId === null || ids.has(p.attachment.parentId)) return p;
    const {xMm, zMm, yawDeg} = world.get(p.id);
    return {...p, attachment: {parentId: null, surfaceId: 'floor', xMm, zMm, yawDeg}};
  });
  // Exclude the original groups and unselected objects. captureGroupTemplate's
  // native placement audit must not turn unrelated legacy overlaps into failure.
  const isolated = createDefaultLayout({room: source.room, furniture, printers}, catalog);
  const memberIds = [...furniture, ...printers.filter(p => p.attachment.parentId === null)].map(e => e.id);
  let id = 'clipboard-set', suffix = 0;
  while (ids.has(id)) id = `clipboard-set:${++suffix}`;
  const grouped = createGroup(isolated, {id, name, memberIds}, catalog);
  return templateSnapshot(captureGroupTemplate(grouped, id, catalog), catalog);
}

/** Encode a validated set; payload size is UTF-8 bytes, not JS code units. */
export function encodeLayoutClipboard(template, catalog = []) {
  return JSON.stringify(templateSnapshot(template, catalogRows(catalog)));
}

/** Decode to a detached template only. No layout insertion or other effects. */
export function decodeLayoutClipboard(text, catalog = []) {
  checkBytes(text);
  let template;
  try { template = JSON.parse(text); } catch { fail('JSON_PARSE_ERROR', 'clipboard'); }
  return templateSnapshot(template, catalogRows(catalog));
}

/** Regroup roots without changing any furniture pose or printer attachment.
 * Group IDs flatten. A child pick requires its furniture root in the selection;
 * regrouping never implicitly detaches printers or adds unpicked support roots.
 * Partial old groups retain their original movement anchors and reference poses.
 */
export function regroupLayoutSelection(state, input, catalog = []) {
  catalog = catalogRows(catalog);
  fields(input, ['id', 'name', 'selectionIds'], 'group');
  const source = checkedState(state, catalog), ids = selection(source, input.selectionIds);
  for (const p of source.printers) if (ids.has(p.id) && p.attachment.parentId !== null && !ids.has(p.attachment.parentId))
    fail('GROUP_ROOT_REQUIRED', 'selectionIds', {id: p.id, parentId: p.attachment.parentId});
  const memberIds = [...source.furniture, ...source.printers.filter(p => p.attachment.parentId === null)]
    .filter(e => ids.has(e.id)).map(e => e.id);
  const roots = new Set(memberIds);
  const groups = (source.groups ?? []).flatMap(group => {
    const memberIds = group.memberIds.filter(id => !roots.has(id));
    if (!memberIds.length) return [];
    if (memberIds.length === group.memberIds.length) return [group];
    return [{...group, memberIds, memberPoses: group.memberPoses.filter(entry => !roots.has(entry.id))}];
  });
  return createGroup({...source, groups}, {id: input.id, name: input.name, memberIds}, catalog);
}

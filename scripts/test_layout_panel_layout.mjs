// Source/pure sizing and synthetic DOM events only: no browser, CAD, or models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {layoutPanelSizing, setupLayoutPanel} from '../site/layout/layout-panel-layout.mjs';

const groupIndex = process.argv.indexOf('--group');
const group = groupIndex < 0 ? 'all' : process.argv[groupIndex + 1];
assert.ok(['all', 'source', 'events'].includes(group), 'Use --group source or --group events');
let count = 0;
function test(name, run) { run(); count++; console.log(`PASS ${name}`); }
const key = '3d-print-rig.layout.panel.v1';
const widthProperty = '--layout-panel-width';
const strings = {
  'layout.panel.expand': 'Show settings panel',
  'layout.panel.collapse': 'Hide settings panel',
  'layout.panel.resize': 'Settings panel width',
  'layout.panel.resizeHelp': 'Drag to resize. Left: wider; Right: narrower. Home: minimum; End: maximum. Escape: cancel resizing.',
  'layout.panel.width': '{width} pixels',
};
const t = (id, values = {}) => {
  assert.ok(Object.hasOwn(strings, id), `Unexpected translation ${id}`);
  return strings[id].replace(/\{(\w+)\}/g, (_, name) => { assert.ok(Object.hasOwn(values, name)); return values[name]; });
};

// Purposefully small event model with capture/bubble, focus visibility, attribute
// reflection, pointer capture/loss and an independently triggered ResizeObserver.
class Target {
  listeners = new Map();
  addEventListener(type, fn, options) {
    const capture = options === true || options?.capture === true;
    const entries = this.listeners.get(type) || [];
    entries.push({fn, capture}); this.listeners.set(type, entries);
  }
  removeEventListener(type, fn, options) {
    const capture = options === true || options?.capture === true;
    this.listeners.set(type, (this.listeners.get(type) || []).filter(e => e.fn !== fn || e.capture !== capture));
  }
  listenerCount() { return [...this.listeners.values()].reduce((n, a) => n + a.length, 0); }
}
class Style {
  values = new Map();
  getPropertyValue(name) { return this.values.get(name)?.value || ''; }
  getPropertyPriority(name) { return this.values.get(name)?.priority || ''; }
  setProperty(name, value, priority = '') { this.values.set(name, {value, priority}); }
  removeProperty(name) { this.values.delete(name); }
}
class Node extends Target {
  constructor(document, tag, namespaceURI = null) {
    super(); Object.assign(this, {ownerDocument: document, tagName: tag.toUpperCase(), namespaceURI, children: [], attrs: new Map(), style: new Style(), captures: new Set(), className: '', id: '', tabIndex: -1});
  }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  insertBefore(node, reference) { assert.ok(this.children.includes(reference)); node.remove(); node.parentNode = this; this.children.splice(this.children.indexOf(reference), 0, node); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  focus(options) {
    if (this.blockFocus) return;
    for (let node = this; node instanceof Node; node = node.parentNode) if (node.hidden) return;
    // CSS also hides controls while the desktop feature is inactive.
    if (/layout-panel-(toggle|divider)/.test(this.className) && this.ownerDocument.querySelector('.layout-workspace').getAttribute('data-layout-panel-active') !== 'true') return;
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement = this; this.lastFocusOptions = options;
    emit(this, 'focusin');
  }
  getBoundingClientRect() { return {width: this.width ?? 1200, height: 700}; }
  setPointerCapture(id) { if (this.failCapture) throw Error('no capture'); this.captures.add(id); }
  releasePointerCapture(id) { if (this.captures.delete(id)) emit(this, 'lostpointercapture', {pointerId: id}); }
  querySelector(selector) {
    const matches = n => selector.startsWith('#') ? n.id === selector.slice(1) : selector.startsWith('.') ? n.className.split(' ').includes(selector.slice(1)) : n.tagName === selector.toUpperCase();
    for (const child of this.children) { if (matches(child)) return child; const found = child.querySelector(selector); if (found) return found; }
    return null;
  }
}
class Document extends Target {
  constructor(window) { super(); this.parentNode = window; this.body = new Node(this, 'body'); this.body.parentNode = this; this.activeElement = this.body; }
  createElement(tag) { return new Node(this, tag); }
  createElementNS(namespace, tag) { return new Node(this, tag, namespace); }
  querySelector(selector) { return this.body.querySelector(selector); }
}
function emit(target, type, detail = {}) {
  const event = {type, target, defaultPrevented: false, stopped: false, button: 0, pointerId: 7, clientX: 800,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...detail};
  const path = []; for (let current = target; current; current = current.parentNode) path.push(current);
  function deliver(node, capture) { for (const entry of [...(node.listeners.get(type) || [])]) if (entry.capture === capture) entry.fn(event); }
  for (const node of path.slice().reverse()) { deliver(node, true); if (event.stopped) return event; }
  for (const node of path) { deliver(node, false); if (event.stopped) break; }
  return event;
}
function fixture({width = 1200, saved, storageFailure, mobile = false, coarse = false, fine = true, observer = true, original = false} = {}) {
  const window = new Target(), media = new Map(), observers = [], values = new Map(), writes = [], reads = [];
  const room = '{"schema":"unrelated-saved-room","draft":123}';
  values.set('room-json', room);
  if (saved !== undefined) values.set(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  const storage = {
    getItem(name) { reads.push(name); if (storageFailure === 'read') throw Error('blocked'); return values.get(name) ?? null; },
    setItem(name, value) { if (storageFailure === 'write') throw Error('quota'); writes.push([name, value]); values.set(name, value); },
  };
  Object.defineProperty(window, 'localStorage', {get() { if (storageFailure === 'access') throw Error('security'); return storage; }});
  window.navigator = {userAgentData: {mobile}};
  window.matchMedia = query => {
    if (!media.has(query)) { const m = new Target(); m.matches = query.includes('min-width') ? width > 680 : query.includes('any-pointer') ? fine : coarse; media.set(query, m); }
    return media.get(query);
  };
  if (observer) window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.node = null; }
    fire() { if (this.node) this.callback([{target: this.node}]); }
  };
  const document = new Document(window);
  const make = (tag, className, id) => { const n = document.createElement(tag); n.className = className; n.id = id || ''; return n; };
  const workspace = make('main', 'layout-workspace'), stage = make('section', 'layout-stage'), scene = make('div', 'layout-scene', 'layout-scene'), sidebar = make('aside', 'layout-sidebar', 'layout-sidebar');
  scene.tabIndex = 0; sidebar.tabIndex = -1; workspace.width = width;
  const camera = make('div', 'layout-scene-toolbar', 'layout-scene-toolbar'), build = make('div', 'layout-build-tools', 'layout-build-tools');
  const inspector = make('input', '', 'draft'); inspector.value = '8123.456';
  const sceneContent = make('div', 'existing-scene-content');
  scene.append(sceneContent); stage.append(camera, scene, build); sidebar.append(inspector); workspace.append(stage, sidebar); document.body.append(workspace);
  if (original) {
    workspace.style.setProperty(widthProperty, '415px', 'important');
    workspace.style.setProperty('--unrelated', 'retained');
    workspace.setAttribute('data-layout-panel-active', 'previous');
    workspace.setAttribute('data-layout-panel-collapsed', 'previous');
    workspace.setAttribute('data-layout-panel-resizing', 'previous');
  }
  const skip = make('a', 'layout-skip');skip.setAttribute('href','#layout-sidebar');document.body.append(skip);
  const initialChildren = [...workspace.children], initialScene = [...scene.children];
  const api = setupLayoutPanel({document, window, t});
  const divider = workspace.querySelector('.layout-panel-divider'), toggle = scene.querySelector('.layout-panel-toggle');
  const displayed = () => Number.parseFloat(workspace.style.getPropertyValue(widthProperty));
  return {api, window, document, workspace, scene, sidebar, inspector, camera, build, sceneContent, skip, initialChildren, initialScene, toggle, divider, observers, writes, reads, values, media, displayed,
    resize(nextWidth) { workspace.width = nextWidth; const m = media.get('(min-width: 681px)'); m.matches = nextWidth > 680; emit(window, 'resize'); },
    mediaChange(query, matches) { const m = media.get(query); m.matches = matches; emit(m, 'change'); },
    click() { return emit(toggle, 'click'); },
    key(name, detail) { divider.focus(); return emit(divider, 'keydown', {key: name, ...detail}); },
    down(detail) { return emit(divider, 'pointerdown', detail); },
    move(x, detail) { return emit(window, 'pointermove', {clientX: x, ...detail}); },
    up(x) { return emit(window, 'pointerup', {clientX: x}); },
  };
}

if (group !== 'events') {
  test('pure sizing: finite, bounded, useful scene/panel widths across narrow, intermediate and wide desktops', () => {
    for (let available = 681; available <= 4000; available += 7) {
      for (const requested of [-1e6, 0, 299, 300, 322.5, 400, 640, 1e6, NaN, Infinity]) {
        const {min, max, width} = layoutPanelSizing(available, requested);
        assert.ok(Number.isInteger(width)); assert.ok(width >= 300 && width <= 640);
        assert.ok(min <= width && width <= max); assert.ok(available - width - 10 >= 320);
      }
    }
    assert.deepEqual(layoutPanelSizing(681), {min: 300, max: 351, width: 351});
    assert.deepEqual(layoutPanelSizing(1200), {min: 300, max: 640, width: 400});
    for (const n of [0, -1, NaN, Infinity, 250, 330, 330.9]) {
      const result = layoutPanelSizing(n); assert.ok(Object.values(result).every(Number.isFinite)); assert.ok(result.width >= 0 && result.min <= result.max);
    }
  });
  test('source boundaries: actual host IDs/grid, theme variables, isolated CSS and no renderer/state dependencies', () => {
    const read = name => fs.readFileSync(new URL(`../site/layout/${name}`, import.meta.url), 'utf8');
    const html = read('index.html'), hostCSS = read('layout.css'), css = read('layout-panel-layout.css'), source = read('layout-panel-layout.mjs');
    for (const id of ['layout-scene', 'layout-sidebar', 'layout-build-tools', 'layout-scene-toolbar']) assert.ok(html.includes(`id="${id}"`));
    assert.match(html, /class="layout-workspace"/); assert.match(hostCSS, /@media \(max-width: 680px\)/);
    assert.match(css, /@media \(min-width: 681px\)/); assert.match(css, /minmax\(0, 1fr\) 10px var\(--layout-panel-width/);
    for (const variable of [...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]).filter(v => v !== widthProperty)) assert.ok(hostCSS.includes(`${variable}:`), variable);
    assert.match(css, /top: 50%/); assert.match(css, /right: 10px/); assert.match(css, /touch-action: none/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|transition:|body\s*\{/i);
    assert.doesNotMatch(source, /\bimport\s|\bfetch\s*\(|createElement\(['"]canvas|dispatchEvent|aria-hidden['"], ['"]true['"]\).*sidebar|innerHTML|history\./);
    for (const name of ['layout-panel-layout.mjs', 'layout-panel-layout.css']) console.log(`SHA256 ${name} ${createHash('sha256').update(read(name)).digest('hex')}`);
  });
}

if (group !== 'source') {
  test('explicit reveal and existing skip link open a persisted collapsed inspector before focus',()=>{
    const x=fixture({saved:{version:1,width:420,collapsed:true}});assert.equal(x.sidebar.hidden,true);
    emit(x.skip,'click');assert.equal(x.sidebar.hidden,false);assert.equal(x.document.activeElement,x.sidebar);assert.equal(x.displayed(),420);
    x.click();assert.equal(x.sidebar.hidden,true);assert.equal(x.api.reveal(),true);assert.equal(x.sidebar.hidden,false);assert.equal(x.inspector.value,'8123.456');
    x.api.dispose();assert.equal(x.skip.listenerCount(),0);assert.equal(x.api.reveal(),false);
  });
  test('desktop installs only two removable nodes, SVG controls and synchronized separator ARIA', () => {
    const x = fixture();
    assert.equal(x.workspace.children[1], x.divider); assert.equal(x.workspace.children[2], x.sidebar);
    assert.equal(x.scene.children[0], x.sceneContent); assert.equal(x.toggle.parentNode, x.scene);
    assert.equal(x.toggle.querySelector('svg').getAttribute('aria-hidden'), 'true');
    assert.equal(x.toggle.getAttribute('aria-controls'), 'layout-sidebar'); assert.equal(x.toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(x.divider.getAttribute('role'), 'separator'); assert.equal(x.divider.getAttribute('aria-orientation'), 'vertical'); assert.equal(x.divider.tabIndex, 0);
    assert.equal(x.divider.getAttribute('aria-valuemin'), '300'); assert.equal(x.divider.getAttribute('aria-valuemax'), '640');
    assert.equal(x.divider.getAttribute('aria-valuenow'), '400'); assert.equal(x.divider.getAttribute('aria-valuetext'), '400 pixels');
    assert.equal(x.observers[0].node, x.workspace); assert.deepEqual(x.writes, []); assert.deepEqual(x.reads, [key]);
    x.api.dispose();
  });
  test('keyboard arrows/Home/End clamp locally, preserve focus, ignore modified/composing/unrelated keys', () => {
    const x = fixture(); let leaked = 0; x.document.addEventListener('keydown', () => leaked++);
    assert.equal(x.key('ArrowLeft').defaultPrevented, true); assert.equal(x.displayed(), 416);
    x.key('ArrowRight', {shiftKey: true}); assert.equal(x.displayed(), 352);
    x.key('Home'); assert.equal(x.displayed(), 300); x.key('ArrowRight'); assert.equal(x.displayed(), 300);
    x.key('End'); assert.equal(x.displayed(), 640); x.key('ArrowLeft'); assert.equal(x.displayed(), 640);
    assert.equal(leaked, 0); assert.equal(x.document.activeElement, x.divider);
    const writes = x.writes.length;
    for (const extra of [{altKey: true}, {ctrlKey: true}, {metaKey: true}, {isComposing: true}, {defaultPrevented: true}]) assert.equal(x.key('ArrowRight', extra).stopped, false);
    assert.equal(x.key('q').defaultPrevented, false); assert.equal(x.writes.length, writes);
    assert.equal(x.divider.getAttribute('aria-valuenow'), '640'); x.api.dispose();
  });
  test('pointer drag commits on matching release, reverses, clamps, and leaves room JSON/drafts untouched', () => {
    const x = fixture();
    x.down(); assert.equal(x.divider.captures.has(7), true);
    x.move(700, {pointerId: 9}); assert.equal(x.displayed(), 400);
    x.move(720); assert.equal(x.displayed(), 480); assert.equal(x.writes.length, 0);
    x.move(-10000); assert.equal(x.displayed(), 640); x.move(10000); assert.equal(x.displayed(), 300);
    x.move(750); assert.equal(x.displayed(), 450); x.up(740); assert.equal(x.displayed(), 460);
    assert.equal(x.divider.captures.size, 0); assert.equal(x.writes.length, 1);
    assert.deepEqual(JSON.parse(x.values.get(key)), {version: 1, width: 460, collapsed: false});
    x.move(800); assert.equal(x.displayed(), 460); assert.equal(x.workspace.getAttribute('data-layout-panel-resizing'), null);
    assert.equal(x.values.get('room-json'), '{"schema":"unrelated-saved-room","draft":123}'); assert.equal(x.inspector.value, '8123.456');
    assert.ok(x.writes.every(([name]) => name === key)); x.api.dispose();
  });
  for (const cancellation of ['pointercancel', 'Escape', 'blur', 'lostpointercapture', 'resize']) test(`${cancellation} reverts the gesture without saving and permits a fresh drag`, () => {
    const x = fixture({saved: {version: 1, width: 600, collapsed: false}}); x.resize(750); assert.equal(x.displayed(), 420);
    x.down(); x.move(850); assert.equal(x.displayed(), 370);
    emit(x.window, 'pointercancel', {pointerId: 99}); assert.equal(x.displayed(), 370);
    if (cancellation === 'Escape') assert.equal(emit(x.divider, 'keydown', {key: 'Escape'}).defaultPrevented, true);
    else if (cancellation === 'lostpointercapture') x.divider.releasePointerCapture(7);
    else emit(x.window, cancellation);
    assert.equal(x.displayed(), 420); assert.equal(x.divider.captures.size, 0); assert.equal(x.writes.length, 0);
    x.resize(1200); assert.equal(x.displayed(), 600, 'restore the preferred width, not its narrow-window clamp');
    x.down(); x.move(820); x.up(820); assert.equal(x.displayed(), 580); assert.equal(x.writes.length, 1); x.api.dispose();
  });
  test('ignores secondary/multiple pointers; no-capture fallback and final-release position still work', () => {
    const x = fixture();
    for (const detail of [{button: 2}, {isPrimary: false}, {clientX: NaN}]) assert.equal(x.down(detail).defaultPrevented, false);
    x.divider.failCapture = true; x.down(); x.down({pointerId: 8}); x.move(NaN); x.up(700);
    assert.equal(x.displayed(), 500); assert.equal(x.writes.length, 1); x.api.dispose();
  });
  test('unchanged/clamped/reversed gestures and bound keys preserve the unclamped preference without writes', () => {
    const x = fixture({width: 750, saved: {version: 1, width: 600, collapsed: false}});
    x.down(); x.up(800); assert.equal(x.displayed(), 420);
    x.down(); x.move(700); x.up(700); assert.equal(x.displayed(), 420);
    x.down(); x.move(850); assert.equal(x.displayed(), 370); x.up(800); assert.equal(x.displayed(), 420);
    x.key('End'); x.key('ArrowLeft'); assert.deepEqual(x.writes, []);
    x.resize(1200); assert.equal(x.displayed(), 600); x.api.dispose();
  });
  test('collapse transfers inspector focus before hiding; reopen restores its exact input and draft', () => {
    const x = fixture(); x.inspector.focus();
    let hiddenWhileFocused = false; const setAttribute = x.sidebar.setAttribute.bind(x.sidebar);
    x.sidebar.setAttribute = (name, value) => { if (name === 'hidden' && x.sidebar.contains(x.document.activeElement)) hiddenWhileFocused = true; setAttribute(name, value); };
    x.click(); assert.equal(hiddenWhileFocused, false); assert.equal(x.document.activeElement, x.toggle);
    assert.equal(x.sidebar.hidden, true); assert.equal(x.sidebar.getAttribute('aria-hidden'), null); assert.equal(x.divider.hidden, true); assert.equal(x.toggle.hidden, false);
    assert.equal(x.toggle.getAttribute('aria-expanded'), 'false'); assert.equal(x.toggle.getAttribute('aria-label'), strings['layout.panel.expand']);
    assert.equal(x.toggle.lastFocusOptions.preventScroll, true); assert.equal(x.down().defaultPrevented, false);
    x.click(); assert.equal(x.sidebar.hidden, false); assert.equal(x.document.activeElement, x.inspector); assert.equal(x.inspector.value, '8123.456');
    x.api.dispose();
  });
  test('separator collapse moves focus safely and refuses to hide if the reopen button cannot take focus', () => {
    const x = fixture(); x.divider.focus(); x.click(); assert.equal(x.document.activeElement, x.toggle); assert.equal(x.sidebar.hidden, true);
    x.click(); x.inspector.focus(); x.toggle.blockFocus = true; x.click();
    assert.equal(x.sidebar.hidden, false); assert.equal(x.document.activeElement, x.inspector); assert.equal(x.toggle.getAttribute('aria-expanded'), 'true'); x.api.dispose();
  });
  test('responsive 681/680 boundaries show inspector on compact windows and retain desktop collapse/width preference', () => {
    const x = fixture(); x.key('End'); x.click(); x.toggle.focus();
    x.resize(680); assert.equal(x.sidebar.hidden, false); assert.equal(x.toggle.hidden, true); assert.equal(x.divider.hidden, true);
    assert.equal(x.document.activeElement, x.sidebar); assert.equal(x.workspace.getAttribute('data-layout-panel-active'), null); assert.equal(x.displayed(), NaN);
    x.resize(681); assert.equal(x.sidebar.hidden, true); assert.equal(x.document.activeElement, x.toggle); assert.equal(x.displayed(), 351);
    x.click(); assert.equal(x.displayed(), 351); x.resize(1200); assert.equal(x.displayed(), 640);
    assert.equal(x.writes.length, 3); x.api.dispose();
  });
  test('container ResizeObserver clamps without window events or synthetic renderer events', () => {
    const x = fixture(); let resized = 0; x.window.addEventListener('resize', () => resized++);
    x.workspace.width = 700; x.observers[0].fire(); assert.equal(x.displayed(), 370); assert.equal(resized, 0);
    x.workspace.width = 1200; x.observers[0].fire(); assert.equal(x.displayed(), 400); assert.deepEqual(x.writes, []); x.api.dispose();
  });
  test('touch-only/mobile guards retain existing workspace and inspector; hybrid fine-pointer desktops can resize', () => {
    for (const options of [{mobile: true}, {coarse: true, fine: false}, {width: 680}]) {
      const x = fixture({...options, saved: {version: 1, width: 510, collapsed: true}});
      assert.equal(x.workspace.getAttribute('data-layout-panel-active'), null); assert.equal(x.sidebar.hidden, false); assert.equal(x.toggle.hidden, true);
      assert.equal(x.down().defaultPrevented, false); x.click(); assert.deepEqual(x.writes, []); x.api.dispose();
    }
    const x = fixture({coarse: true, fine: true}); assert.equal(x.toggle.hidden, false);
    x.down({pointerType: 'touch'}); x.move(720); x.up(720); assert.equal(x.displayed(), 480);
    x.mediaChange('(any-pointer: fine)', false); assert.equal(x.toggle.hidden, true); assert.equal(x.sidebar.hidden, false);
    x.mediaChange('(any-pointer: fine)', true); assert.equal(x.displayed(), 480); x.api.dispose();
  });
  test('stored preferences round-trip independently; malformed/legacy data and storage failures stay usable', () => {
    for (const saved of ['{bad', 'null', '[]', {version: 0, width: 600, collapsed: true}, {version: 1, width: '600', collapsed: 'true'}, {version: 1, width: -10}]) {
      const x = fixture({saved}); assert.equal(x.displayed(), 400); assert.equal(x.sidebar.hidden, false); x.api.dispose();
    }
    for (const storageFailure of ['access', 'read', 'write']) {
      const x = fixture({storageFailure}); x.key('ArrowLeft'); x.click(); assert.equal(x.sidebar.hidden, true); x.click(); assert.equal(x.displayed(), 416); x.api.dispose();
    }
    const first = fixture(); first.key('End'); first.click(); const saved = first.values.get(key); first.api.dispose();
    const next = fixture({width: 750, saved}); assert.equal(next.sidebar.hidden, true); assert.equal(next.displayed(), 420);
    next.resize(1200); next.click(); assert.equal(next.displayed(), 640); next.api.dispose();
  });
  test('language refresh updates every accessible label/value with no layout or preference changes', () => {
    const x = fixture(); const nextT = (id, values) => `JA ${t(id, values)}`;
    x.api.refreshLanguage(nextT); assert.equal(x.toggle.getAttribute('aria-label'), 'JA Hide settings panel');
    assert.equal(x.divider.getAttribute('aria-label'), 'JA Settings panel width'); assert.equal(x.divider.getAttribute('aria-valuetext'), 'JA 400 pixels');
    assert.equal(x.divider.children[0].textContent, `JA ${strings['layout.panel.resizeHelp']}`);
    x.click(); assert.equal(x.toggle.title, 'JA Show settings panel'); x.api.refreshLanguage(); assert.equal(x.displayed(), 400); assert.equal(x.writes.length, 1); x.api.dispose();
  });
  test('dispose mid-drag restores prior attributes/style priority, releases capture/listeners/observer and preserves all host content', () => {
    const x = fixture({original: true}); const owned = [x.toggle, x.divider]; x.down(); x.move(710);
    x.api.dispose(); x.api.dispose(); x.api.refreshLanguage();
    assert.equal(x.workspace.style.getPropertyValue(widthProperty), '415px'); assert.equal(x.workspace.style.getPropertyPriority(widthProperty), 'important');
    assert.equal(x.workspace.style.getPropertyValue('--unrelated'), 'retained');
    for (const name of ['active', 'collapsed', 'resizing']) assert.equal(x.workspace.getAttribute(`data-layout-panel-${name}`), 'previous');
    assert.deepEqual(x.workspace.children, x.initialChildren); assert.deepEqual(x.scene.children, x.initialScene);
    assert.equal(x.sidebar.hidden, false); assert.equal(x.document.activeElement, x.sidebar); assert.equal(x.inspector.value, '8123.456');
    assert.equal(x.window.listenerCount(), 0); assert.equal(x.document.listenerCount(), 0); assert.equal(x.divider.captures.size, 0);
    for (const target of [...owned, ...x.media.values()]) assert.equal(target.listenerCount(), 0);
    assert.equal(x.observers[0].node, null); emit(x.window, 'pointermove', {clientX: 0}); emit(x.window, 'resize'); x.observers[0].fire();
    assert.equal(x.workspace.style.getPropertyValue(widthProperty), '415px'); assert.deepEqual(x.writes, []);
  });
  test('collapsed disposal and repeated setup/disposal leave no nodes, styles or handlers behind', () => {
    const x = fixture(); x.click(); x.toggle.focus(); x.api.dispose();
    assert.equal(x.sidebar.hidden, false); assert.equal(x.document.activeElement, x.sidebar);
    for (let i = 0; i < 3; i++) {
      const api = setupLayoutPanel({document: x.document, window: x.window, t}); api.dispose();
      assert.deepEqual(x.workspace.children, x.initialChildren); assert.deepEqual(x.scene.children, x.initialScene); assert.equal(x.window.listenerCount(), 0);
      assert.equal(x.workspace.style.getPropertyValue(widthProperty), ''); assert.equal(x.workspace.getAttribute('data-layout-panel-active'), null);
    }
    assert.ok(x.observers.every(observer => observer.node === null));
  });
  test('missing host and absent optional ResizeObserver require no renderer or browser setup', () => {
    const window = new Target(), document = new Document(window); const api = setupLayoutPanel({document, window, t}); api.refreshLanguage(); api.dispose();
    assert.equal(window.listenerCount(), 0); assert.equal(document.body.children.length, 0);
    const x = fixture({observer: false}); x.resize(700); assert.equal(x.displayed(), 370); x.api.dispose();
  });
}
console.log(`Layout panel ${group}: ${count} checks passed. Scope: source/pure sizing and synthetic events; no browser or native-solid review.`);

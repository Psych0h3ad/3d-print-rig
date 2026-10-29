// Production export closure and Three scene objects with controlled I/O only.
// No browser, WebGL pixels, CAD, native clearance or actual model assets are tested.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';

const rendererURL = new URL('../site/layout/layout-renderer.mjs', import.meta.url);
const sourceBytes = fs.readFileSync(rendererURL);
const source = sourceBytes.toString('utf8');
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');

function closureBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Missing production closure: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `Missing production closure boundary: ${endMarker}`);
  return source.slice(start, end).trim();
}

const exportSource = closureBetween('  async function exportImage(', '\n  function releaseResources(');
const controlsSource = closureBetween('  function enableControls(', '\n  function refreshWalls(');
// The actual production bodies own feedback visibility. None of the renderer,
// cancellation, presentation, draw or cleanup doubles hide or restore feedback.
const createExport = new Function('deps', `with (deps) {
  deps.enableControls = (${controlsSource});
  return (${exportSource});
}`);

function fixture({visible = true, failure = null} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9edef');
  const openingFeedback = new THREE.Group();
  openingFeedback.name = 'fixture-selected-opening-feedback';
  openingFeedback.visible = visible;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 1, 0), new THREE.Vector3(0, 1, 0),
  ]);
  const material = new THREE.LineBasicMaterial({depthTest: false});
  const outline = new THREE.LineLoop(geometry, material);
  outline.renderOrder = 100;
  openingFeedback.add(outline);
  scene.add(openingFeedback);
  const originalChildren = [...openingFeedback.children];
  const oldTarget = {name: 'pre-export-target'};
  const oldShaderError = () => {};
  const oldBackground = scene.background;
  const error = new Error(`Injected ${failure} failure`);
  const externalAbort = new AbortController();
  const passes = [];
  const events = {cancel: 0, present: 0, resize: 0, draw: 0, load: 0, hideHandles: 0};
  let target = oldTarget;
  const renderer = {
    extensions: {has: name => name === 'EXT_color_buffer_float'},
    capabilities: {maxTextureSize: 2560},
    debug: {onShaderError: oldShaderError},
    autoClear: true,
    toneMappingExposure: .85,
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    render(renderScene) {
      let includesFeedback = false;
      renderScene.traverseVisible(node => { if (node === openingFeedback) includesFeedback = true; });
      passes.push({mainScene: renderScene === scene, includesFeedback, feedbackVisible: openingFeedback.visible});
      if (renderScene === scene && failure === 'room-render') throw error;
      if (renderScene === scene && failure === 'abort') externalAbort.abort();
    },
    readRenderTargetPixels() {},
    renderLists: {dispose() {}},
  };
  const empty = () => new THREE.Group();
  const deps = {
    THREE, renderer, scene, openingFeedback,
    openingInteraction: {active: false, dragging: false},
    openingHandles: {hide() { events.hideHandles++; }},
    perspectiveControls: {enabled: true}, planControls: {enabled: false},
    objectTools: {hidden: false}, unitLabels: {hidden: false},
    exporting: false, disposed: false, current: {room: {}}, drag: null,
    derived: {
      // This synthetic row only forces the loader rejection path. It is not
      // a registered machine, loaded asset, or release-coverage assertion.
      printers: failure === 'loader' ? [{machineId: 'fixture-only', positionM: {x: 0, y: 0, z: 0}, yawRad: 0}] : [],
      furniture: [],
    },
    isPlan: () => false,
    cancel() { events.cancel++; },
    exportAbort: null, furnitureGroup: empty(), lastWidth: 800, lastHeight: 600,
    placementGroup: empty(), placementGuides: empty(), controls: {enabled: true},
    selectionBox: empty(), pickedSolid: empty(), pickedPlan: empty(), printersGroup: empty(), frame: 0,
    camera: new THREE.PerspectiveCamera(38, 4 / 3, .01, 1000),
    aborted(signal) { if (signal.aborted) throw new DOMException('Fixture aborted', 'AbortError'); },
    syncContacts() {}, refreshWalls() {}, roomGroup: empty(),
    disposeTree(root) {
      root.traverse(node => {
        node.geometry?.dispose();
        for (const m of Array.isArray(node.material) ? node.material : [node.material]) m?.dispose();
      });
    },
    presentView() { events.present++; },
    releaseResources() { assert.fail('Live export must not release the entire viewer'); },
    resize() { events.resize++; },
    draw() { events.draw++; },
    document: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        return {
          getContext(kind) {
            assert.equal(kind, '2d');
            return {createImageData: (w, h) => ({data: new Uint8Array(w * h * 4)}), putImageData() {}};
          },
          toBlob(callback) {
            callback(failure === 'blob' ? null : new Blob(['fixture-only'], {type: 'image/png'}));
          },
        };
      },
    },
  };
  const exportImage = createExport(deps);
  async function run() {
    let result, caught;
    try {
      result = await exportImage({width: 320, signal: externalAbort.signal, loadMachine: async () => {
        events.load++;
        assert.equal(failure, 'loader', 'No model may load in this fixture');
        throw error;
      }});
    } catch (reason) { caught = reason; }
    try {
      // Check restoration before checking the export passes, including when the
      // injected failure interrupts the first pass before an image is made.
      assert.equal(openingFeedback.visible, visible, 'Restore exact pre-export feedback visibility');
      assert.equal(openingFeedback.parent, scene, 'Keep feedback owned by the live scene');
      assert.deepEqual(openingFeedback.children, originalChildren, 'Preserve the selected outline');
      assert.equal(outline.geometry, geometry);
      assert.equal(outline.material, material);
      assert.equal(deps.exporting, false);
      assert.equal(deps.exportAbort, null);
      assert.equal(renderer.getRenderTarget(), oldTarget);
      assert.equal(renderer.autoClear, true);
      assert.equal(renderer.debug.onShaderError, oldShaderError);
      assert.equal(scene.background, oldBackground);
      assert.deepEqual([events.cancel, events.present, events.resize, events.draw], [1, 1, 1, 1]);
      assert.ok(passes.length > 0 && passes[0].mainScene, 'Exercise the real first room render');
      assert.ok(passes.every(pass => !pass.includesFeedback), 'Never export the opening selection outline');
      assert.ok(passes.every(pass => !pass.feedbackVisible), 'Keep feedback hidden throughout every export pass');
      if (!failure) {
        assert.ifError(caught);
        assert.equal(passes.length, 3, 'Run room, transparent and output passes');
        assert.deepEqual([result.width, result.height], [320, 240]);
        assert.equal(result.projection, 'perspective-3d');
        assert.deepEqual(result.machines, []);
        assert.equal(events.load, 0);
      } else if (failure === 'abort') {
        assert.equal(caught?.name, 'AbortError');
      } else if (failure === 'blob') {
        assert.equal(caught?.message, 'Image export failed');
        assert.equal(passes.length, 3, 'Reach output before failing image encoding');
      } else {
        assert.equal(caught, error, 'Preserve the injected export error');
        if (failure === 'loader') assert.equal(events.load, 1);
      }
      return {passes: passes.length, restoredVisibility: openingFeedback.visible};
    } finally {
      geometry.dispose(); material.dispose();
    }
  }
  return {run};
}

const cases = [
  {name: 'visible selection: successful export restores visible feedback', visible: true},
  {name: 'hidden selection: successful export preserves hidden feedback', visible: false},
  {name: 'visible selection: first room-render failure restores feedback', visible: true, failure: 'room-render'},
  {name: 'hidden selection: first room-render failure preserves hidden feedback', visible: false, failure: 'room-render'},
  {name: 'visible selection: loader rejection restores feedback', visible: true, failure: 'loader'},
  {name: 'visible selection: image-encoding failure restores feedback', visible: true, failure: 'blob'},
  {name: 'visible selection: forwarded abort restores feedback', visible: true, failure: 'abort'},
];
const results = [];
for (const test of cases) {
  try { results.push({name: test.name, passed: true, ...await fixture(test).run()}); }
  catch (error) { results.push({name: test.name, passed: false, error: error.stack}); }
}
const passed = results.every(result => result.passed);
console.log(JSON.stringify({
  passed, cases: results.length, results,
  rendererSha256: sourceHash,
  scope: 'Production perspective export closure and production Three scene objects with stub raster renderer/canvas. No browser, rendered bitmap, native-solid clearance, CAD or actual model-asset certification.',
}, null, 2));
if (!passed) process.exitCode = 1;

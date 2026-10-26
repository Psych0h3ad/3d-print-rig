import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSourceMaterialDisplay} from '../site/viewer/source-assembly-runtime/source-material-display.mjs';
import {captureViewAppearance, transferViewAppearance} from '../site/viewer/source-assembly-runtime/view_appearance.mjs';

class Color {
  constructor(r, g, b) { Object.assign(this, {r, g, b}); }
  copy(c) { Object.assign(this, {r:c.r, g:c.g, b:c.b}); return this; }
  set(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    Object.assign(this, {r:(n >> 16) / 255, g:(n >> 8 & 255) / 255, b:(n & 255) / 255});
    return this;
  }
}

// Small controller contract fixture: reproduces the real reset-only restoration
// defect. These are synthetic colors, not loaded model/CAD evidence.
function fixture(head = false) {
  const packet = {id:'same-source', model:{sha256:'model'}, inventory:{sha256:'inventory'}, head_only_subset:head};
  const initial = () => ({packet:packet.id, model_sha256:'model', inventory_sha256:'inventory',
    palette:{M:'#245963', A:'#ed744c'}, axes:{x:0, y:0, z:0}, theme:'dark',
    lighting:'studio', lightIntensity:1, grid:false, language:'en', camera:null});
  const materials = [
    // A printed nut adapter must remain printed despite its hardware-like name.
    {key:'printed-nut-adapter', role:'M', color:new Color(.0123456789, .23, .75)},
    {key:'accent', role:'A', color:new Color(.81, .004321, .15)},
    {key:'purchased-nut', role:'native', color:new Color(.37, .39, .41)}
  ].map(r => ({...r, material:{color:new Color(0, 0, 0).copy(r.color),
    metalness:r.role === 'native' ? .9 : 0, roughness:.44, opacity:.72, transparent:true, depthWrite:false}}));
  let state = initial(), calls = 0, disposed = 0, flex = null, getterReads = 0;
  const inner = {packet, materials, ownedGeometries:new Set(), parts:new Map(),
    get flexState() { return flex; },
    get diagnostic() { getterReads++; return calls; },
    snapshot() { return structuredClone(state); },
    apply(s) {
      assert.equal(Object.hasOwn(s, 'source_material_display'), false, 'extension stripped');
      for (const role of ['M', 'A']) assert.match(s.palette[role], /^#[a-f\d]{6}$/i);
      for (const n of Object.values(s.axes)) assert.ok(Number.isFinite(n), 'inner pose validation');
      calls++;
      for (const r of materials) {
        r.material.color.copy(r.color);
        if (r.role !== 'native') r.material.color.set(s.palette[r.role]);
      }
      state = structuredClone(s); flex = {revision:calls, x:s.axes.x};
      return inner.snapshot();
    },
    reset() {
      inner.apply(initial());
      for (const r of materials) r.material.color.copy(r.color);
      return inner.snapshot();
    },
    dispose() { disposed++; }
  };
  inner.apply(initial()); // Construction initially paints the default palette.
  return {inner, native:() => materials.map(r => ({...r.color})),
    colors:() => materials.map(r => ({...r.material.color})),
    counters:() => ({calls, disposed, getterReads})};
}

for (const head of [false, true]) test(`${head ? 'head' : 'full'}: reset -> axis -> JSON snapshot/restore; explicit palette edit`, () => {
  const f = fixture(head), wrapped = attachSourceMaterialDisplay(f.inner);
  assert.equal(wrapped.snapshot().source_material_display, 'source');
  assert.deepEqual(f.colors(), f.native(), 'attach uses original records, not already-painted colors');
  const native = wrapped.reset();
  assert.equal(native.source_material_display, 'source');
  wrapped.apply({...native, axes:{x:12, y:-7, z:3}});
  assert.deepEqual(f.colors(), f.native());
  const saved = JSON.parse(JSON.stringify(wrapped.snapshot()));
  const originalMaterials = f.inner.materials.map(r => r.material);
  const hardware = {...originalMaterials[2], color:{...originalMaterials[2].color}};
  const edited = wrapped.snapshot();
  edited.palette.M = '#ff0000'; edited.palette.A = '#00ff00';
  edited.source_material_display = 'palette'; // Exact UI integration contract.
  assert.equal(wrapped.apply(edited).source_material_display, 'palette');
  assert.deepEqual(f.colors().slice(0, 2), [{r:1,g:0,b:0}, {r:0,g:1,b:0}]);
  const paletteSaved = JSON.parse(JSON.stringify(wrapped.snapshot()));
  wrapped.reset(); wrapped.apply(paletteSaved);
  assert.equal(wrapped.snapshot().source_material_display, 'palette');
  assert.deepEqual(f.colors().slice(0, 2), [{r:1,g:0,b:0}, {r:0,g:1,b:0}]);
  wrapped.apply(saved);
  wrapped.apply({...wrapped.snapshot(), axes:{x:-12, y:7, z:0}});
  assert.deepEqual(f.colors(), f.native());
  f.inner.materials.forEach((r, i) => assert.equal(r.material, originalMaterials[i]));
  assert.deepEqual({...originalMaterials[2], color:{...originalMaterials[2].color}}, hardware);
  assert.deepEqual(originalMaterials.map(({color, ...p}) => p), [
    {metalness:0,roughness:.44,opacity:.72,transparent:true,depthWrite:false},
    {metalness:0,roughness:.44,opacity:.72,transparent:true,depthWrite:false},
    {metalness:.9,roughness:.44,opacity:.72,transparent:true,depthWrite:false}]);
});

test('legacy absence paints palette; malformed modes reject before mutation', () => {
  const f = fixture(), wrapped = attachSourceMaterialDisplay(f.inner);
  const legacy = wrapped.snapshot(); delete legacy.source_material_display;
  wrapped.apply(legacy);
  assert.equal(wrapped.snapshot().source_material_display, 'palette');
  assert.notDeepEqual(f.colors(), f.native());
  wrapped.reset();
  for (const bad of [undefined, null, '', 'native', 'SOURCE', 0, false, {mode:'source'}]) {
    const before = {state:wrapped.snapshot(), colors:f.colors(), counters:f.counters()};
    assert.throws(() => wrapped.apply({...before.state, source_material_display:bad}), /Invalid source material display mode/);
    assert.deepEqual({state:wrapped.snapshot(), colors:f.colors(), counters:f.counters()}, before);
  }
  const before = wrapped.snapshot();
  assert.throws(() => wrapped.apply({...before, source_material_display:'palette', axes:{x:NaN,y:0,z:0}}));
  assert.deepEqual(wrapped.snapshot(), before);
  assert.deepEqual(f.colors(), f.native());
});

test('live getters, inner disposal and ownership are preserved', () => {
  const f = fixture(), wrapped = attachSourceMaterialDisplay(f.inner);
  assert.equal(f.counters().getterReads, 0, 'attachment must not evaluate getters');
  assert.equal(wrapped.parts, f.inner.parts);
  assert.equal(wrapped.ownedGeometries, f.inner.ownedGeometries);
  const oldFlex = wrapped.flexState;
  wrapped.apply({...wrapped.snapshot(), axes:{x:9,y:0,z:0}});
  assert.equal(wrapped.flexState, f.inner.flexState);
  assert.notEqual(wrapped.flexState, oldFlex);
  assert.equal(wrapped.diagnostic, f.counters().calls);
  assert.equal(wrapped.dispose, f.inner.dispose);
  wrapped.dispose(); assert.equal(f.counters().disposed, 1);
});

test('invalid original color is rejected before any restoration', () => {
  const f = fixture(), before = f.colors();
  f.inner.materials[1].color.r = NaN;
  assert.throws(() => attachSourceMaterialDisplay(f.inner), /Missing original printed source color/);
  assert.deepEqual(f.colors(), before);
});

test('full -> head -> full carries source and palette appearance, without pose carry', () => {
  const full = fixture(), head = fixture(true);
  const a = attachSourceMaterialDisplay(full.inner), b = attachSourceMaterialDisplay(head.inner);
  for (const mode of ['source', 'palette', 'source']) {
    a.apply({...a.snapshot(), source_material_display:mode, axes:{x:20,y:0,z:0}, palette:{M:'#ff0000',A:'#00ff00'}});
    const captured = captureViewAppearance(a.snapshot(), a.packet);
    b.apply(transferViewAppearance(b.snapshot(), b.packet, captured));
    assert.equal(b.snapshot().source_material_display, mode);
    assert.deepEqual(b.snapshot().axes, {x:0,y:0,z:0});
    assert.deepEqual(head.colors(), mode === 'source' ? head.native() : full.colors());
    a.apply(transferViewAppearance(a.snapshot(), a.packet, captureViewAppearance(b.snapshot(), b.packet)));
    assert.deepEqual(full.colors(), head.colors());
  }
});

test('optional appearance flag leaves legacy/VIRTU shape and purchased appearance unchanged', () => {
  const f = fixture(), legacy = {...f.inner.snapshot(), purchased_appearance:'cad'};
  const captured = captureViewAppearance(legacy, f.inner.packet);
  assert.equal(Object.hasOwn(captured.appearance, 'source_material_display'), false);
  assert.deepEqual(transferViewAppearance(legacy, f.inner.packet, captured), legacy);
  for (const mode of ['source', 'palette']) {
    const withFlag = {...legacy, source_material_display:mode};
    assert.deepEqual(transferViewAppearance(legacy, f.inner.packet, captureViewAppearance(withFlag, f.inner.packet)), withFlag);
  }
  for (const bad of [null, undefined, 'native', {mode:'source'}]) {
    const stateBefore = structuredClone(legacy);
    assert.throws(() => captureViewAppearance({...legacy, source_material_display:bad}, f.inner.packet), /Invalid source material display mode/);
    assert.throws(() => transferViewAppearance(legacy, f.inner.packet, {...captured, appearance:{...captured.appearance, source_material_display:bad}}), /Invalid source material display mode/);
    assert.deepEqual(legacy, stateBefore);
  }
  assert.throws(() => transferViewAppearance(legacy, {...f.inner.packet, model:{sha256:'different'}}, captured), /revision mismatch/);
});

// Source planning-proposal tests only: no browser, native solid or machine fit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteAt = process.argv.indexOf('--site');
const dir = path.join(siteAt < 0 ? path.join(root, 'site') : path.resolve(process.argv[siteAt + 1]), 'layout');
const {wallRotationCenters: propose} = await import(pathToFileURL(path.join(dir, 'layout-wall-rotation.mjs')));
const G = await import(pathToFileURL(path.join(dir, 'layout-geometry.mjs')));
const hash = name => createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
const before = {helper: hash('layout-wall-rotation.mjs'), geometry: hash('layout-geometry.mjs')};
const pose = (xMm = 0, zMm = 0, yawDeg = 0) => ({xMm, zMm, yawDeg});
const room = (w = 1000, d = 1000) => [[0, 0], [w, 0], [w, d], [0, d]];
const rect = G.rectangle, near = (a, b, eps = 1e-7) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);
const domain = (outer, ...locals) => [{outer, locals}];
const cases = [];
function test(name, run) { try { run(); cases.push({name, passed: true}); } catch (error) { cases.push({name, passed: false, error: error.stack}); } }
function one(ds, origin, yaw) {
  const result = propose(ds, origin, yaw); assert.equal(result.length, 1);
  assert(result.every(p => Number.isFinite(p.xMm) && Number.isFinite(p.zMm)));
  return result[0];
}
// Independent finite oracle checks returned proposals only. It is deliberately
// not the acceptance proof: the runtime caller retains its strict swept tests.
function sampledInside(ds, centre, origin, yaw) {
  for (let i = 0; i <= 720; i++) for (const d of ds) for (const local of d.locals) {
    const angle = (origin.yawDeg + (yaw - origin.yawDeg) * i / 720) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const poly = local.map(([x, z]) => [centre.xMm + c*x + s*z, centre.zMm - s*x + c*z]);
    assert(G.polygonContains(d.outer, poly), `sample outside at ${i}/720`);
  }
}
const r = Math.hypot(300, 200), reserve = .01;

test('flush rectangle: interior support critical, nearest single-wall projection', () => {
  const ds = domain(room(), rect(600, 400)), from = pose(300, 500);
  const p = one(ds, from, 90); near(p.xMm, r + reserve); near(p.zMm, 500);
  assert(p.xMm > 300 && p.xMm < 361); sampledInside(ds, p, from, 90);
});
test('two active corner walls: nearest pair intersection', () => {
  const ds = domain(room(), rect(600, 400)), from = pose(300, 200);
  const p = one(ds, from, -90); near(p.xMm, r + reserve); near(p.zMm, r + reserve);
  sampledInside(ds, p, from, -90);
});
test('opposite unviolated walls make the sweep infeasible', () => {
  assert.deepEqual(propose(domain(room(700, 700), rect(600, 400)), pose(300, 200), 90), []);
});
test('signed clockwise intervals: +90, -90 and +270 differ', () => {
  const ds = domain(room(), [[0, -20], [100, -20], [0, 80]]), from = pose(0, 300);
  near(one(ds, from, 90).xMm, 20.01);
  near(one(ds, from, -90).xMm, 80.01);
  near(one(ds, from, 270).xMm, Math.hypot(100, 20) + reserve);
  for (const yaw of [90, -90, 270, -270, 360, -360]) sampledInside(ds, one(ds, from, yaw), from, yaw);
});
test('near-wall/flush sweep already fits: padding never creates wall drive', () => {
  const ds = domain(room(), rect(600, 400));
  for (const x of [r, r + .001, r + .009, r + .01, r + 1]) assert.deepEqual(propose(ds, pose(x, 500), 90), []);
  assert.deepEqual(propose(domain(room(), [[-100, 0], [-20, -20], [-20, 20]]), pose(100, 500), 90), []);
  const p = one(ds, pose(r - 1e-8, 500), 90); near(p.xMm, r + reserve);
});
test('peer-only block cannot request a distant alternate centre', () => {
  assert.deepEqual(propose(domain(room(), rect(100, 100)), pose(500, 500), 90), []);
  assert.deepEqual(propose(domain(room(), rect(100, 100)), pose(500, 500), 0), []);
  const p = one(domain(room(), rect(600, 400)), pose(300, 500), 90);
  assert.deepEqual(Object.keys(p).sort(), ['xMm', 'zMm']);
});
test('angled wall, fractional world frame, both windings', () => {
  const frame = pose(100.25, -23.75, 30), outer = G.transformPolygon(room(), frame);
  const originXY = G.rotateXZ([300.25, 500], 30), from = pose(originXY[0]+frame.xMm, originXY[1]+frame.zMm, 30);
  const expected = G.rotateXZ([r + reserve, 500], 30);
  for (const polygon of [outer, outer.slice().reverse()]) {
    const ds = domain(polygon, rect(600, 400).reverse()), p = one(ds, from, 120);
    near(p.xMm, expected[0]+frame.xMm); near(p.zMm, expected[1]+frame.zMm);
    sampledInside(ds, p, from, 120);
  }
});
test('nonorthogonal active-wall pair includes an initially unviolated wall', () => {
  const ds = domain([[0, 0], [1000, 0], [1300, 1000], [300, 1000]], rect(200, 100));
  const from = pose(135, 60), p = one(ds, from, 90), q = Math.hypot(100, 50) + reserve;
  near(p.zMm, q); near(p.xMm, q * (Math.sqrt(1.09) + .3)); sampledInside(ds, p, from, 90);
});
test('concave room keeps only halfplanes containing every initial polygon', () => {
  const outer = [[0,0], [1000,0], [1000,400], [400,400], [400,1000], [0,1000]];
  for (const poly of [outer, outer.slice().reverse()]) {
    const ds = domain(poly, rect(200, 100)), from = pose(700, 50), p = one(ds, from, 90);
    near(p.xMm, 700); near(p.zMm, Math.hypot(100, 50) + reserve); sampledInside(ds, p, from, 90);
  }
  // The local corridor is too narrow for the larger complete sweep. The
  // helper must not seek a distant route into the other arm of the room.
  assert.deepEqual(propose(domain(outer, rect(600, 100)), pose(600, 50), 90), []);
});
test('multiple domains share one centre and retain all opposite constraints', () => {
  const ds = [{outer: room(), locals: [rect(600, 400)]},
    {outer: [[0,0],[370,0],[370,1000],[0,1000]], locals: [rect(20,20)]}];
  assert.deepEqual(propose(ds, pose(300, 500), 90), []);
  ds[1].outer = room(800, 1000);
  const p = one(ds, pose(300, 500), 90); near(p.xMm, r + reserve); near(p.zMm, 500);
});
test('all source polygons contribute, including concave local footprints', () => {
  const local = [[-300,-200],[100,-200],[100,0],[300,0],[300,200],[-300,200]];
  const ds = domain(room(), local, [[0,0],[25,0],[0,25]]), from = pose(300, 200);
  const p = one(ds, from, 360); near(p.xMm, r + reserve); near(p.zMm, r + reserve);
  sampledInside(ds, p, from, 360);
});
test('reserve scales with farthest local radius and is actual movement', () => {
  const q = Math.hypot(30000, 20000), ds = domain(room(100000,100000), rect(60000,40000));
  const p = one(ds, pose(30000,50000), 90); near(p.xMm, q + q*1e-5); near(p.zMm,50000);
  assert(p.xMm-q >= q*1e-5);
});
test('fractional local vertices and fractional signed yaw endpoints', () => {
  const ds = domain(room(), rect(600.5,400.25)), from = pose(300.25,500,.125);
  // First move slightly off the wall so the initial fractional pose is valid.
  from.xMm = 301;
  const p = one(ds,from,89.875), q = Math.hypot(300.25,200.125);
  near(p.xMm,q+reserve); sampledInside(ds,p,from,89.875);
});
test('cardinal and accumulated yaw conventions remain exact', () => {
  const ds=domain(room(),rect(600,400));
  for (const yaw of [0,360,-360,360000,-360000]) {
    const p=one(ds,pose(300,500,yaw),yaw+90); near(p.xMm,r+reserve); near(p.zMm,500);
  }
  assert.deepEqual(propose(ds,pose(300,500),360.000001),[]);
});
test('large translated origin preserves the inward reserve', () => {
  const frame=pose(900000.125,900000.25), outer=G.transformPolygon(room(),frame);
  const p=one(domain(outer,rect(600,400)),pose(frame.xMm+300,frame.zMm+500),90);
  near(p.xMm,frame.xMm+r+reserve); near(p.zMm,frame.zMm+500);
});
test('invalid/outside/degenerate inputs produce no proposal', () => {
  const ds=domain(room(),rect(600,400)), from=pose(300,500);
  for (const bad of [null,{},[],{...from,xMm:NaN},{...from,zMm:Infinity},{...from,yawDeg:720001},{...from,xMm:1000001}]) assert.deepEqual(propose(ds,bad,90),[]);
  for (const yaw of [NaN,Infinity,'90',undefined,720001,-720001]) assert.deepEqual(propose(ds,from,yaw),[]);
  for (const bad of [null,[],[null],[{}],Array(33).fill(ds[0]),domain([[0,0],[0,0],[1,1]],rect(2,2)),
    domain([[0,0],[1,1],[0,1],[1,0]],rect(2,2)),domain(room(),[[0,0],[1,0],[2,0]]),
    domain(room(),[[0,0],[1,0],[0,NaN]]),domain(room(),[[0,0],[1000001,0],[0,1]])]) assert.deepEqual(propose(bad,from,90),[]);
  assert.deepEqual(propose(ds,pose(299,500),90),[]);
  assert.deepEqual(propose(domain(room(),rect(600,400)),pose(300,200),-361),[]);
});
test('pure API: frozen inputs unchanged and deterministic nearest-only result', () => {
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  const ds=freeze(domain(room(),rect(600,400))), from=freeze(pose(300,500)), text=JSON.stringify([ds,from]);
  assert.deepEqual(propose(ds,from,90),propose(ds,from,90)); assert.equal(JSON.stringify([ds,from]),text);
  assert.equal(propose(ds,from,90).length,1);
});
assert.deepEqual({helper:hash('layout-wall-rotation.mjs'),geometry:hash('layout-geometry.mjs')},before);
const failed=cases.filter(c=>!c.passed);
console.log(JSON.stringify({passed:!failed.length,cases,source_sha256:before,
  scope:'Source wall-proposal geometry only; caller strict swept/peer validation remains acceptance. No browser or native clearance evidence.'},null,2));
if(failed.length)process.exitCode=1;

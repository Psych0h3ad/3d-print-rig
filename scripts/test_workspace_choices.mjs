import assert from 'node:assert/strict';
import {matchingChoices, applyChoice} from '../site/viewer/workspace-choices.mjs';

const rows = [
  {label:'Monolith · 9 mm AWD', field:'Gantry', detail:'Sphinx / Sherpa Mini'},
  {label:'Monolith · 6 mm 2WD', field:'Gantry', detail:'Sphinx / Sherpa Mini'},
  {label:'Rapido HF', field:'Hotend', detail:'', disabled:true},
];
assert.deepEqual(matchingChoices(rows, ' SPHINX  ９　mm '), [rows[0]], 'Search includes dependent component descriptions and full-width text');
assert.deepEqual(matchingChoices(rows, 'rapido'), [rows[2]], 'Unavailable choices remain discoverable with their disabled state');
assert.deepEqual(matchingChoices(rows, 'Sphinx Hotend'), [], 'Every search term must match the same option');
assert.deepEqual(matchingChoices(rows, ''), rows);

const select = new EventTarget();
Object.assign(select, {disabled:false, value:'stock', options:[
  {value:'stock'}, {value:'monolith'}, {value:'unavailable', disabled:true},
  {value:'hidden', hidden:true}, {value:'grouped', parentElement:{disabled:true}},
  {value:'hidden-group', parentElement:{hidden:true}},
]});
let changes = 0;
select.addEventListener('change', event => { changes++; assert.equal(event.bubbles, true); });
assert.equal(applyChoice(select, 'monolith'), true);
assert.equal(select.value, 'monolith');
assert.equal(changes, 1, 'Use the existing controller change pathway exactly once');
assert.equal(applyChoice(select, 'monolith'), true);
assert.equal(changes, 1, 'Selecting the current choice must not reload CAD');
for (const value of ['unavailable','hidden','grouped','hidden-group','removed']) assert.equal(applyChoice(select, value), false);
select.disabled = true;
assert.equal(applyChoice(select, 'stock'), false, 'A loading controller must reject stale dialog choices');
assert.equal(select.value, 'monolith');
assert.equal(changes, 1);
console.log('Choice search covers companion components, Unicode and empty results; application respects live availability and existing change events.');

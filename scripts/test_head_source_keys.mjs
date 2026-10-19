import assert from 'node:assert/strict';
import {partKey,headPlan} from '../site/viewer/head-assembly.js';

// Pinned public SB export 5b139696ecbd801076863c3c3e752a4c1630f6f39ca70e8f817a15a2ae0404d5
// has this named surface without an explicit part_key. Losing its underscore
// breaks the source manifest join in installed heads and replacement masks.
const surface={name:'Psurface_422__SB0000',userData:{}};
assert.equal(partKey(surface),'surface_422');
assert.equal(partKey({name:'P423__SB0000',userData:{}}),'423');
assert.equal(partKey({name:'Pother__surface',userData:{part_key:'source_leaf_7'}}),'source_leaf_7');
assert.equal(partKey({name:'anonymous',userData:{part_key:0}}),'0');
assert.equal(partKey({name:'source_leaf_2'}),'source_leaf_2');
const variant={toolhead:'stealthburner',head_translation_mm:[0,0,0],removed_stock_keys:['surface_422'],modules:[]};
const plan=headPlan(variant);
assert(plan.hidden.has(partKey(surface)),'A replaced source surface must be hidden');
const restored=headPlan({...variant,removed_stock_keys:[]});
assert(!restored.hidden.has(partKey(surface)),'The native surface must return on reset');
assert(!plan.hidden.has(partKey({name:'P422__another_body',userData:{}})),'Distinct source leaves must not alias');
console.log('Source surface identities, numeric zero, replacement masks and native restoration passed.');

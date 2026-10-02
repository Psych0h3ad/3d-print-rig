import assert from 'node:assert/strict';
import {affiliateProducts,productsFor} from '../site/viewer/product-links.js';
assert.equal(affiliateProducts.length,8);assert.equal(new Set(affiliateProducts.map(p=>p.id)).size,8);
for(const p of affiliateProducts){const u=new URL(p.url);assert.equal(u.protocol,'https:');assert.equal(u.hostname,'s.click.aliexpress.com');assert(u.pathname.startsWith('/e/'))}
assert.deepEqual(productsFor({machine:'siboor_trident_350'}).map(p=>p.id),['siboor_trident']);
assert.deepEqual(productsFor({machine:'fysetc_v24_250_pro'}).map(p=>p.id),['fysetc_v24_pro']);
assert.deepEqual(productsFor({machine:'siboor_v24_aug_350'}).map(p=>p.id),['siboor_v24_aug']);
assert.deepEqual(productsFor({machine:'siboor_v24_350'}),[]);assert.deepEqual(productsFor({machine:'voron_v24_250_ldo_cnc'}),[]);
for(const id of ['rapido_ace_hf','rapido_ace_uhf']){assert.equal(productsFor({component:id})[0].id,id);assert.equal(productsFor({hotend:id})[0].sensor,'PT1000')}
for(const id of ['rapido2_hf','rapido2_uhf','rapido_x_uhf','dragon_ace_hf'])assert.deepEqual(productsFor({component:id,hotend:id}),[]);
assert.deepEqual(productsFor({hotend:'goliath_chcxl'}).map(p=>p.id),['chc_xl']);assert.deepEqual(productsFor({toolhead:'a4t'}).map(p=>p.id),['a4t_kit']);
assert.equal(productsFor({component:'orbiter2_5'})[0].url,'https://s.click.aliexpress.com/e/_c3oH1VAD');
assert.deepEqual(productsFor({extruder:'orbiter2_5'}).map(p=>p.id),['orbiter2_5']);
assert.deepEqual(productsFor({component:'orbiter2',extruder:'orbiter2'}),[]);
console.log('Product links: exact machine/component matches, separate HF/UHF PT1000 links, no Rapido2 or VORON substitutions.');

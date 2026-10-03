import assert from 'node:assert/strict';
import {pageShareData, xShareURL, siteLinks} from '../site/viewer/workspace-share.mjs';

const base = 'https://psych0h3ad.github.io/3d-print-rig/viewer/';
const machine = new URL('v24-reference.html', base);
machine.searchParams.set('machine', 'voron_v24_300_printed');
machine.searchParams.set('configuration', 'v24_printed_r2__sb__revo_voron__cw2__stock_panasonic');
machine.searchParams.set('tools', JSON.stringify({enabled: true, active: 1, slots: ['xol', 'xol']}));
machine.searchParams.set('lang', 'ja');
machine.hash = 'inspectorTabs';
const data = pageShareData(machine.href, 'V2.4 / 300 · 3D Print Rig');
assert.equal(new URL(data.url).hash, '');
assert.equal(new URL(data.url).search, machine.search);
const intent = new URL(xShareURL(data));
assert.equal(intent.origin, 'https://twitter.com');
assert.equal(intent.pathname, '/intent/tweet');
assert.equal(intent.searchParams.get('url'), data.url);
assert.equal(intent.searchParams.get('text'), data.title);

const head = new URL('toolheads.html?configuration=installed&base=ffffff&accent=000000&return_machine=voron_trident_250', base);
const shared = new URL(pageShareData(head.href, '', {base: '#124578', accent: '#aabbcc'}).url);
assert.equal(shared.searchParams.get('base'), '124578');
assert.equal(shared.searchParams.get('accent'), 'aabbcc');
assert.equal(shared.searchParams.get('return_machine'), 'voron_trident_250');
assert.equal(pageShareData(head.href, '', {base: 'not-a-color'}).url, head.href);
assert.equal(pageShareData(machine.href, '', {base: '#aabbcc'}).url, data.url);
for (const page of ['components.html?component=v0mod_kirigami&view=individual&part=plate', 'gantries.html?gantry=selected&configuration=head', 'toolchangers.html?changer=selected', 'ratrig.html?machine=ratrig_vcore_41_300_corexy']) {
  const href = new URL(page, base).href;
  assert.equal(pageShareData(href).url, href);
}
assert.throws(() => pageShareData('javascript:alert(1)'));
assert.equal(new URL(siteLinks.github).pathname, '/Psych0h3ad/3d-print-rig');
assert.equal(new URL(siteLinks.x).pathname, '/YuTR0N');
console.log('Page sharing preserves machines, installed configurations, repeated tool slots, reference selections and language; head colors use current supported values; X intent round-trips complete URLs.');

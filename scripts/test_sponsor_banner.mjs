import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setupProjectSponsor} from '../site/viewer/workspace-ui.mjs';
import {formatMessage,loadLanguage,supportedLanguages} from '../site/viewer/i18n.mjs';

// Exercise the production component with a small DOM fixture. Native details
// toggling and measured responsive layout are covered by browser review.
class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.open = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(target) { return this === target || this.children.some(child => child.contains(target)); }
  focus() { document.activeElement = this; }
}
class Document extends EventTarget {
  createElement(tag) { return new Element(tag); }
  click(target) {
    const event = new Event('click');
    Object.defineProperty(event, 'target', {value: target});
    this.dispatchEvent(event);
  }
}
globalThis.document = new Document();
const stage = new Element('section'), sponsor = setupProjectSponsor(stage);
assert.deepEqual(stage.children, [sponsor]);
assert.equal(sponsor.tagName, 'DETAILS');
assert.equal(sponsor.open, false, 'Sponsor links start collapsed');
const [summary, menu] = sponsor.children;
assert.equal(summary.tagName, 'SUMMARY', 'Retain the native keyboard control');
const [label, picture, name] = summary.children;
assert.equal(label.getAttribute('data-i18n-id'), 'ui.project_sponsor');
assert.equal(name.textContent, 'Watchtower by YGK3D', 'The summary retains a text accessible name');
assert.equal(name.getAttribute('data-i18n'), 'off');
assert.equal(picture.tagName, 'PICTURE');
assert.equal(picture.getAttribute('data-i18n'), 'off');
const [compact, logo] = picture.children;
assert.equal(compact.tagName, 'SOURCE');
assert.equal(compact.media, '(max-width: 680px)');
assert.equal(compact.srcset, new URL('../site/assets/sponsors/watchtower-circle.svg', import.meta.url).href);
assert.equal(logo.tagName, 'IMG');
assert.equal(logo.src, new URL('../site/assets/sponsors/watchtower-horizontal.png', import.meta.url).href);
assert.equal(logo.alt, '', 'Artwork is decorative because the adjacent text names the sponsor');
assert.equal(logo.decoding, 'async');

const officialLinks = [
  ['https://watchtower3d.com', 'ui.sponsor_website'],
  ['https://www.kickstarter.com/projects/watchtower3d/watchtower-3d-printer-dashboard-and-farm-management', null],
  ['https://youtube.com/@ygk3d', 'ui.sponsor_channel'],
  ['https://youtu.be/sXo3FI5NJ7Y', 'ui.sponsor_video'],
];
assert.equal(menu.children[0].getAttribute('data-i18n-id'), 'ui.watchtower_description');
const links = menu.children.slice(1);
assert.equal(links.length, officialLinks.length);
for (const [index, [href, id]] of officialLinks.entries()) {
  const link = links[index];
  assert.equal(link.tagName, 'A');
  assert.equal(link.href, href);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'sponsored noopener noreferrer');
  assert.equal(link.getAttribute('data-i18n-id'), id);
  if (!id) {
    assert.equal(link.textContent, 'Kickstarter');
    assert.equal(link.getAttribute('data-i18n'), 'off');
  }
  sponsor.open = true;
  document.click(link);
  assert.equal(sponsor.open, true, 'Clicking an official link is not an outside click');
}
document.click(summary);
assert.equal(sponsor.open, true);
document.click(stage);
assert.equal(sponsor.open, false, 'Clicking the model area dismisses the menu');
sponsor.open = true;
const otherKey = new Event('keydown'); Object.defineProperty(otherKey, 'key', {value:'ArrowRight'});
sponsor.dispatchEvent(otherKey);
assert.equal(sponsor.open, true);
const escape = new Event('keydown'); Object.defineProperty(escape, 'key', {value:'Escape'});
sponsor.dispatchEvent(escape);
assert.equal(sponsor.open, false);
assert.equal(document.activeElement, summary, 'Escape returns focus to the sponsor control');

// Hashes pin the approved original artwork, independently of DOM selection.
const assets = [
  ['watchtower-horizontal.png', 318543, '4393090a3181c6ddc6078790110303a7d13b67440685d08c88b78691f76d288b'],
  ['watchtower-circle.svg', 904, '05bb64f57821335192d2fe32ea7f89a3de49c39503ad7e707bafe43658659b10'],
];
for (const [file, size, hash] of assets) {
  const bytes = await fs.readFile(new URL('../site/assets/sponsors/' + file, import.meta.url));
  assert.equal(bytes.length, size, file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  if (file.endsWith('.png')) {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), logo.width);
    assert.equal(bytes.readUInt32BE(20), logo.height);
    assert.equal(bytes[25], 6, 'The approved PNG retains RGBA transparency');
  } else {
    assert.match(bytes.toString(), /viewBox="0 0 28 28"/);
    assert.doesNotMatch(bytes.toString(), /<(?:script|foreignObject)\b|\bon\w+=|\bhref=/i);
  }
}
assert.deepEqual((await fs.readdir(new URL('../site/assets/sponsors/', import.meta.url))).sort(), assets.map(([file]) => file).sort(), 'Ship only the two selected logos');

const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
assert.match(readme, /<img src="site\/assets\/sponsors\/watchtower-circle\.svg" alt="Watchtower logo" width="56" height="56">/);
for (const [href] of officialLinks) assert(readme.includes('](' + href + ')'), 'README retains ' + href);
const css = await fs.readFile(new URL('../site/viewer/workspace.css', import.meta.url), 'utf8');
assert.match(css, /:root\[data-embedded=true\] \.project-sponsor\{display:none\}/);
assert.match(css, /\.project-sponsor :focus-visible\{outline:2px solid var\(--accent\)/);

const messageIds = ['ui.project_sponsor', 'ui.watchtower_description', ...officialLinks.map(([,id]) => id).filter(Boolean)];
for (const language of supportedLanguages) {
  await loadLanguage(language);
  for (const id of messageIds) {
    const text = formatMessage(id, {}, language);
    assert.equal(typeof text, 'string');
    assert(text.length && text !== id, `${language}: ${id}`);
  }
}
console.log(`PASS sponsor artwork, ${links.length} official links, accessible summary, dismissal/focus and ${supportedLanguages.length} languages; 319447 asset bytes.`);

import assert from 'node:assert/strict';
import {lockInspectorHorizontalScroll} from '../site/viewer/workspace-scroll.mjs';

class Inspector extends EventTarget {
  scrollLeft = 0;
  scrollTop = 286;
}
const content = new Inspector();
content.scrollLeft = 73;
const reset = lockInspectorHorizontalScroll(content);
assert.equal(content.scrollLeft, 0, 'Existing horizontal offset is cleared');
assert.equal(content.scrollTop, 286, 'Vertical reading position survives setup');
for (const offset of [73, -28, 0.5]) {
  content.scrollLeft = offset;
  content.dispatchEvent(new Event('scroll'));
  assert.equal(content.scrollLeft, 0, 'Native horizontal scrolling cannot hide labels');
  assert.equal(content.scrollTop, 286);
}
content.scrollTop = 512;
content.dispatchEvent(new Event('scroll'));
assert.equal(content.scrollTop, 512, 'Ordinary vertical scrolling is unaffected');
content.scrollLeft = 92;
content.dispatchEvent(new Event('focusin'));
assert.equal(content.scrollLeft, 0, 'Returning from a native picker restores the left edge');
assert.equal(content.scrollTop, 512);
content.scrollLeft = 44;
reset();
assert.equal(content.scrollLeft, 0, 'Tab activation can reset the horizontal position');

const nested = new Inspector();
nested.scrollLeft = 150;
nested.dispatchEvent(new Event('scroll'));
assert.equal(nested.scrollLeft, 150, 'Other scroll containers are not globally intercepted');
console.log('Inspector horizontal offsets reset without changing vertical position or unrelated scrollers.');

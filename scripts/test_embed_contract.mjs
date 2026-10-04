import assert from 'node:assert/strict';
import {embedURL,embedTarget,iframeMarkup,embedPages} from '../site/viewer/embed-contract.mjs';
const base='https://psych0h3ad.github.io/3d-print-rig/viewer/';
for(const page of embedPages){
  const original=new URL(page,base);original.searchParams.set('configuration','model__head');original.searchParams.set('lang','ja');original.searchParams.set('tools',JSON.stringify({active:1,slots:['xol','a4t']}));
  const code=embedURL(original.href,{theme:'dark'}),target=embedTarget(code);
  assert.equal(target.url.href,original.href);assert.equal(target.theme,'dark');assert.equal(new URL(code).pathname,'/3d-print-rig/embed/');
}
const code=embedURL(base+'?machine=voron_trident_250&return_machine=private-context&_viewer=old',{theme:'light'});
assert.equal(embedTarget(code).url.searchParams.get('machine'),'voron_trident_250');assert.equal(embedTarget(code).url.searchParams.has('return_machine'),false);
for(const page of ['../../evil.html','https://evil.test/a','%2f%2fevil.test','unknown.html'])assert.throws(()=>embedTarget('https://example.test/rig/embed/?v=1&viewer='+encodeURIComponent(page)));
assert.throws(()=>embedTarget('https://example.test/embed/?v=2'));assert.throws(()=>embedURL('javascript:alert(1)'));
const html=iframeMarkup(code,'<script>" & test');assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;&quot; &amp; test'));assert(html.includes('loading="lazy"'));assert(html.includes('height="560"'));
console.log('Embed v1 preserves view state, rejects unsupported routes/versions, escapes iframe code, and defaults to deferred loading.');

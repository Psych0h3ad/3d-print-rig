import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const forbidden=/\p{Emoji_Presentation}|\uFE0F|[\u2194-\u2199\u21A9\u21AA\u2600-\u27BF]/u;
function decode(s){return s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|&#x([0-9a-f]+);|&#([0-9]+);|\\([0-9a-f]{4,6})(?:\s|(?=["']))/gi,(_,a,b,c,d,e)=>String.fromCodePoint(parseInt(a||b||c||d||e,d?10:16)))}
assert(forbidden.test(decode('\\u{1F600}')));assert(forbidden.test(decode('&#x2713;')));assert(!forbidden.test('<path d="m5 12 4 4L19 6"/>'));
// Text-default Unicode arrows can still select an emoji font on iOS.
for(const value of ['\u2197','\\u2197','&#8599;','&#x2197;','\\2197 ','\u2194','\u2195','\u2196','\u2198','\u2199','\u21a9','\u21aa'])assert(forbidden.test(decode(value)),'Emoji-capable arrow escaped the UI policy: '+value);
assert(!forbidden.test('Copyright © 3D Print Rig · M3 × 6'));
const home=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
assert(/data-home-copy="heroAction"[^<]*<\/span><span class="link-icon link-icon-up-right" aria-hidden="true"><\/span>/u.test(home),'Primary homepage action must use the SVG mask');
const homeStyles=fs.readFileSync(path.join(root,'site/home/home.css'),'utf8');
assert(/(?:-webkit-)?mask:url\('\.\.\/viewer\/icons\/arrow-up-right\.svg'\)/u.test(homeStyles),'Homepage link icon must use the existing vector asset');
const failures=[];let files=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory()){if(!/^vendor(?:-|$)/.test(e.name))walk(path.join(dir,e.name));continue}if(!/\.(?:html|css|mjs|js|svg|json)$/.test(e.name))continue;files++;const file=path.join(dir,e.name);if(forbidden.test(decode(fs.readFileSync(file,'utf8'))))failures.push(path.relative(root,file))}}
for(const rel of ['site/viewer','site/layout','site/home','site/embed','site/support','site/fun','site/assets/brand','localization'])walk(path.join(root,rel));
assert(!forbidden.test(decode(fs.readFileSync(path.join(root,'site/index.html'),'utf8'))),'Home UI must also be free of emoji icons');files++;
assert.deepEqual(failures,[],'Authored UI must use SVG icons, including escaped/entity forms; do not use emoji or dingbat glyphs.');
console.log(JSON.stringify({passed:true,files,scope:'Authored UI/locales: literal and encoded emoji/dingbat icon policy; bundled vendor source excluded'}));

// Source/navigation contract only. Never load a printer model or start WebGL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const argument=process.argv.indexOf('--site');
const site=argument>=0?path.resolve(process.argv[argument+1]):fileURLToPath(new URL('../site/',import.meta.url));
const read=relative=>fs.readFileSync(path.join(site,relative),'utf8');
const revision=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex').slice(0,20);
const {setupLayoutNavigation}=await import(pathToFileURL(path.join(site,'viewer/layout-nav.mjs')).href);
const {supportedLanguages,t,languageURL}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')).href);
const ui=read('viewer/workspace-ui.mjs'),gallery=read('viewer/machine-gallery.mjs'),machines=read('viewer/machines.html');
assert(ui.includes('setupLayoutNavigation(navigation, {listen: workspaceListen});'));
assert(ui.indexOf('setupLanguage();')<ui.indexOf('setupLayoutNavigation(navigation,'));
assert(gallery.includes("setupLayoutNavigation(document.querySelector('[data-gallery-nav]'), {document, window});"));
assert(machines.includes('data-layout-nav data-gallery-link data-i18n="off">Layout</a>'));
assert(read('viewer/layout-nav.mjs').includes("link.setAttribute('data-i18n', 'off')"));
assert(!read('viewer/workspace-navigation.mjs').includes("'layout.html'"),'Layout remains outside the CAD workspace router');
const index=JSON.parse(read('assets/machines/index.json'));
const ids=new Set();const machineRows=index.machines.map(row=>{
  assert(!ids.has(row.id));ids.add(row.id);
  const page=row.page==='./'?'index.html':row.page.slice(2),source=read('viewer/'+page);
  assert(/data-controller=/u.test(source)&&/src="\.\/workspace-router\.mjs/u.test(source),row.id);
  return {machineId:row.id,page};
});
assert(machineRows.length>0);assert(read('viewer/workspace-router.mjs').includes('setupWorkspace();'));
let languageCases=0;
for(const language of supportedLanguages){
  const link={href:'https://example.test/3d-print-rig/layout/',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
  const navigation={querySelector:()=>link};const events=[];
  const window={location:{href:'https://example.test/3d-print-rig/viewer/community.html?machine=registered&lang='+language},localStorage:{getItem:()=> 'ru'}};
  const document={documentElement:{lang:'en'}};
  const service=setupLayoutNavigation(navigation,{document,window,listen:(target,type,fn)=>events.push({type,fn})});
  assert.equal(link.textContent,t('nav.layout',{},language));assert.equal(new URL(link.href).searchParams.get('lang'),language);
  window.location.href=languageURL('https://example.test/3d-print-rig/layout/',language);service.refresh();assert.equal(link.attrs['aria-current'],'page');
  assert.deepEqual(events.map(e=>e.type),['rig-language-change','pageshow']);
  for(const key of ['layout.desktopOnlyTitle','layout.desktopOnlyText','layout.openViewer'])assert(t(key,{},language).trim());
  languageCases++;
}
const app=read('layout/layout-app.mjs'),start=app.indexOf('async function start()');
// The desktop shell must not become a programmatic scroll container when a
// sidebar control or scene canvas receives focus. overflow:hidden alone failed
// the browser header-position regression; the mobile notice retains page scroll.
const shellCSS=read('layout/layout.css');
const desktopShell=shellCSS.match(/body\[data-layout-ready=["']true["']\]\s+\.layout-app\s*\{([^}]+)\}/u);
assert(desktopShell,'Clip the desktop-ready shell without clipping the mobile notice');
assert(/\bposition\s*:\s*fixed\b/u.test(desktopShell[1]));
assert(/\binset\s*:\s*0\s*(?:;|$)/u.test(desktopShell[1]));
assert(/\boverflow\s*:\s*clip\b/u.test(desktopShell[1]),'Hidden overflow still permits focus-induced shell scroll');
const desktopReturn=app.indexOf("document.body.dataset.layoutReady='desktop-only';return;",start);
function catalogFetchOffset(source){
  const matches=[...source.matchAll(/fetch\(new URL\('\.\/layout-catalog\.json(?:\?v=[a-f0-9]{20})?',/gu)];
  assert.equal(matches.length,1,'Expected exactly one genuine layout catalog fetch');
  return matches[0].index;
}
const catalogFetch=catalogFetchOffset(app);
assert.equal(catalogFetchOffset("fetch(new URL('./layout-catalog.json',import.meta.url))"),0);
assert.equal(catalogFetchOffset("fetch(new URL('./layout-catalog.json?v=0123456789abcdef0123',import.meta.url))"),0);
for(const wrong of ["fetch(new URL('../layout-catalog.json',import.meta.url))","fetch(new URL('./layout-catalog.json?v=stale',import.meta.url))","fetch(new URL('https://example.test/layout-catalog.json',import.meta.url))"])
  assert.throws(()=>catalogFetchOffset(wrong),assert.AssertionError);
assert.throws(()=>catalogFetchOffset(app+'\n'+"fetch(new URL('./layout-catalog.json',import.meta.url))"),assert.AssertionError);
assert(start>=0&&desktopReturn>start&&catalogFetch>desktopReturn,'Desktop-only return precedes catalog fetch');
assert(app.slice(start,desktopReturn).includes("(any-pointer: fine)"));
assert(read('layout/layout-language.mjs').includes('#layout-language'));
const watched=new Set(['viewer/layout-nav.mjs','viewer/workspace-ui.mjs','viewer/workspace-router.mjs','viewer/machine-gallery.mjs']);
const sources=[];
function scan(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())scan(file);else if(/\.(?:mjs|js|html|css)$/u.test(entry.name)){const relative=path.relative(site,file).replaceAll('\\','/');sources.push({file,relative});if(relative.startsWith('layout/'))watched.add(relative);}}}
scan(site);let edges=0;
const check=(actual,expected,label)=>assert.equal(actual,expected,'Stale layout/navigation cache reference: '+label);
for(const {file,relative}of sources){
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/(['"])(\.{1,2}\/[^'"\s?#]+\.(?:mjs|js|css|json))(?:\?v=([^'"\s]+))?\1/gu)){
    const target=path.resolve(path.dirname(file),match[2]),targetRelative=path.relative(site,target).replaceAll('\\','/');
    if(target===file||!watched.has(targetRelative))continue;
    check(match[3],revision(fs.readFileSync(target,'utf8')),relative+' -> '+targetRelative);edges++;
  }
}
assert.throws(()=>check('old-cache-value','fresh-value','negative control'),assert.AssertionError);
const compiler=fs.readFileSync(path.join(site,'../scripts/build_locales.mjs'),'utf8');
assert(compiler.includes("await scan(resolve(viewer,'../layout'))"));
assert(compiler.includes("resolve(viewer,'layout-nav.mjs')"));
const normal=fs.readFileSync(path.join(site,'../scripts/check_machine_regressions.py'),'utf8');
assert(normal.includes("glob('test_*.mjs')"));
const html=read('layout/index.html');assert(html.includes('https://psych0h3ad.github.io/3d-print-rig/layout/'));
console.log(JSON.stringify({status:'PASS',scope:'Actual source/template/cache checks plus navigation language fixture; no browser/GPU/model/native execution.',
  machines:machineRows.length,templates:new Set(machineRows.map(row=>row.page)).size,languages:languageCases,cacheEdges:edges,
  normalScriptDiscovery:true,desktopGate:'STATIC_EARLY_RETURN_CHECK',coverage:machineRows}));

import {translate} from './i18n.mjs?v=2480220e8ff2a71a69b0';
import {WorkspaceScope, activateScope} from './workspace-lifecycle.mjs';
import {bindWorkspaceNavigation, setWorkspaceLeaving, workspaceTarget, workspaceURL, replaceWorkspaceURL} from './workspace-navigation.mjs?v=424451cc1e036690fee7';
import {setupWorkspace} from './workspace-ui.mjs?v=aeb0618dbbc91ddbe272';
import {applyDisplay} from './display-preferences.mjs?v=9860960509e28d17f3fd';
import {machinePage} from './machines.js?v=0b03f369fa4dd3b3de8f';

const controllers = new Set(['bootstrap.js','v24-bootstrap.js','app.js','v24-app.js','vanilla-trident.js','v24-reference.js','custom-voron.js','v0-app.js','micron.js','kit-reference.js','ratrig.js','crossant.js','toolheads.js','gantries.js','components.js','toolchangers.js','e3ng.js','community.js','positron.js','remorph.js', 'annex.js']);
document.documentElement.dataset.workspaceSession = crypto.randomUUID();
let scope, sequence = 0, transitions = Promise.resolve();
const templates = new Map();
const initialPath = location.pathname;
templates.set(initialPath, document.documentElement.outerHTML);

function notice(message, error = false) {
  let status = document.querySelector('#workspaceNavigationStatus');
  if (!status) { status = document.createElement('div'); status.id = 'workspaceNavigationStatus'; status.setAttribute('role', 'status'); document.body.append(status); }
  status.textContent = message; status.classList.toggle('navigation-error', error);
  status.hidden = !message;
}
function busy(value) {
  const workspace = document.querySelector('.workspace');
  if (workspace) { workspace.inert = value; workspace.setAttribute('aria-busy', String(value)); }
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}
function text(ja, en) { return translate(ja, new URL(location.href).searchParams.get('lang') || document.documentElement.lang); }
function rememberView() {
  return {tab: document.querySelector('.inspector-tabs [aria-selected="true"]')?.id};
}
async function prepare(url) {
  let html = templates.get(url.pathname);
  if (!html) {
    const response = await fetch(url, {headers: {Accept: 'text/html'}});
    if (!response.ok) throw Error('HTTP ' + response.status);
    html = await response.text();
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const source = parsed.querySelector('script[data-controller]')?.dataset.controller;
  const moduleURL = source && new URL(source, url);
  if (!parsed.querySelector('.workspace > aside') || !moduleURL || moduleURL.origin !== location.origin || !controllers.has(moduleURL.pathname.split('/').pop())) throw Error('Invalid workspace');
  const controller = await import(moduleURL.href);
  templates.set(url.pathname, html);
  return {parsed, controller};
}
async function installStyles(parsed, url) {
  const next = [];
  for (const source of parsed.querySelectorAll('link[rel="stylesheet"]')) {
    const href = new URL(source.getAttribute('href'), url).href;
    let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(item => item.href === href);
    if (!link) {
      link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.media = 'not all';
      const loaded = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = () => { link.remove(); reject(Error('Stylesheet unavailable')); }; });
      document.head.append(link); await loaded;
    }
    next.push(link);
  }
  return () => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) if (!next.includes(link)) link.remove();
    for (const link of next) { link.media = 'all'; document.head.append(link); }
  };
}
function start(controller, view) {
  scope = new WorkspaceScope(); activateScope(scope); applyDisplay();
  setupWorkspace();
  const previousTab = document.getElementById(view?.tab);
  if (previousTab && !previousTab.hidden) previousTab.click();
  const mounted = scope.task(() => controller.mount(scope));
  mounted.then(() => {
    // Controllers with their own lighting now see the shared setting.
    const night = document.querySelector('#night');
    night?.dispatchEvent(new Event('input', {bubbles: true}));
    night?.dispatchEvent(new Event('change', {bubbles: true}));
    const tab = document.getElementById(view?.tab);
    if (tab && !tab.hidden) tab.click();
  }, error => { console.error(error); notice(text('モデルの読込に失敗しました。機種を選び直してください。', 'Could not load the model. Choose a printer to retry.'), true); });
  return mounted;
}
async function navigate(value, mode = 'push') {
  const target = workspaceTarget(value, location.href);
  if (!target) return false;
  if (mode === 'push' && target.href === location.href) return true;
  const previousURL = workspaceURL(), previous = new URL(previousURL);
  if (mode === 'pop' && previous.pathname === target.pathname && previous.search === target.search && !document.querySelector('.workspace[inert]')) {
    replaceWorkspaceURL(null, '', target); return true;
  }
  const token = ++sequence, view = rememberView();
  setWorkspaceLeaving(true); busy(true);
  notice(text('マシンを切り替えています…', 'Switching workspace…'));
  // Download the next small template/module while the current CAD settles.
  const prepared = prepare(target).then(result => ({result}), error => ({error}));
  transitions = transitions.catch(() => {}).then(async () => {
    await scope?.settle();
    const {result, error} = await prepared;
    if (token !== sequence) return;
    if (error) throw error;
    const applyStyles = await installStyles(result.parsed, target);
    if (token !== sequence) return;
    scope?.dispose();
    for (const attribute of [...document.body.attributes]) document.body.removeAttribute(attribute.name);
    document.body.replaceChildren(...[...result.parsed.body.childNodes].filter(node => node.nodeName !== 'SCRIPT').map(node => document.importNode(node, true)));
    document.title = result.parsed.title;
    document.documentElement.lang = result.parsed.documentElement.lang;
    applyStyles();
    if (mode === 'push') history.pushState(null, '', target);
    else history.replaceState(null, '', target);
    setWorkspaceLeaving(false);
    replaceWorkspaceURL(null, '', target);
    notice(text('3Dモデルを読み込み中…', 'Loading 3D model…'));
    const mounted = start(result.controller, view);
    // The chooser remains available while the model loads; further requests
    // are serialized and only the newest destination is installed.
    busy(false);
    await mounted; await scope.settle();
    if (token === sequence) {
      notice('');
      const heading = document.querySelector('.inspector-heading h1');
      if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
    }
  }).catch(error => {
    if (token !== sequence) return;
    setWorkspaceLeaving(false); busy(false);
    if (mode === 'pop') replaceWorkspaceURL(null, '', previousURL);
    // Keep the current machine interactive when a destination cannot load.
    document.querySelectorAll('#showMachine,#machineFamily,#machineVendor,#machineSize,#machineConfig').forEach(element => { element.disabled = false; });
    const show = document.querySelector('#showMachine'); if (show) show.textContent = text('このマシンを表示', 'Show this printer');
    notice(text('切り替えられませんでした。接続を確認して、もう一度選んでください。', 'Could not switch. Check your connection and choose again.'), true);
    console.error(error);
  });
  await transitions; return true;
}

bindWorkspaceNavigation(navigate);
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.getAttribute('href').startsWith('#')) return;
  const target = workspaceTarget(link.href, location.href);
  if (!target) return;
  event.preventDefault(); void navigate(target);
});
window.addEventListener('popstate', () => { void navigate(location.href, 'pop'); });
window.addEventListener('pagehide', event => { if (!event.persisted) scope?.dispose(); });

// A machine deep link may use the common /viewer/ entry URL.
const canonical = machinePage(new URL(location.href).searchParams.get('machine'));
const currentPage = location.pathname.split('/').pop() || 'index.html';
const destination = canonical && new URL(canonical, location.href);
if (currentPage === 'index.html' && destination && destination.pathname !== location.pathname && destination.pathname.split('/').pop()) {
  destination.search = location.search; await navigate(destination, 'replace');
} else {
  const {controller} = await prepare(new URL(location.href));
  await start(controller);
}

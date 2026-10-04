import {workspaceListen} from './workspace-lifecycle.mjs';

export const displayKey = '3d-print-rig-display-v1';
let memory;
export function readDisplay(storage) {
  if(globalThis.location){const query=new URLSearchParams(location.search);if(query.get('embed')==='1')return {dark:query.get('embed_theme')==='dark'};}
  try {
    storage ||= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(displayKey) || 'null');
    if (typeof value?.dark === 'boolean') return value;
  } catch {}
  return memory || {dark: false};
}
export function saveDisplay(value, storage) {
  memory = {...readDisplay(storage), ...value};
  if(globalThis.location && new URLSearchParams(location.search).get('embed')==='1')return memory;
  try { (storage || globalThis.localStorage).setItem(displayKey, JSON.stringify(memory)); } catch {}
  return memory;
}
export function applyDisplay(dark = readDisplay().dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.body.classList.toggle('night', dark);
}
export function rememberDisplayControl() {
  const dark = document.querySelector('#night').checked;
  saveDisplay({dark}); applyDisplay(dark);
}
export function setupDisplayPreferences() {
  let input = document.querySelector('#night');
  if (!input) {
    input = Object.assign(document.createElement('input'), {id: 'night', type: 'checkbox'});
  }
  const label = input.closest('label') || document.createElement('label');
  label.replaceChildren(input, 'ダークモード');
  document.querySelector('#panel-appearance').prepend(label);
  document.querySelector('#tab-appearance').hidden = false;
  input.checked = readDisplay().dark; applyDisplay(input.checked);
  const update = rememberDisplayControl;
  input.addEventListener('input', update); input.addEventListener('change', update);
  workspaceListen(document, 'click', event => { if (event.target.closest('#nightOn')) update(); });
  workspaceListen(window, 'storage', event => {
    if (event.key !== displayKey) return;
    input.checked = readDisplay().dark;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  });
}

// Reference viewers keep their CAD lighting; the shared switch changes the
// backdrop and UI. Full printer lighting remains owned by its controller.
export function setupSceneDisplay(scene, renderer, camera, scope, THREE) {
  const input = document.querySelector('#night'), original = scene.background?.clone?.() || renderer.getClearColor(new THREE.Color()).clone();
  function apply() {
    const background = original.clone(); if (input.checked) background.set('#101820');
    scene.background = background; renderer.render(scene, camera);
  }
  input.addEventListener('input', apply); input.addEventListener('change', apply);
  scope.cleanup(() => { input.removeEventListener('input', apply); input.removeEventListener('change', apply); });
  apply();
}

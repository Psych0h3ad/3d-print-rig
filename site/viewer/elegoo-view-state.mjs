// ELEGOO preset bookkeeping is independent of rendering. A programmatic camera
// restore is arbitrary even when it happens to resemble one of the presets.
export const elegooPresetButtonIds = Object.freeze({
  iso: 'iso', front: 'front', top: 'top', head: 'focusHead',
  side: 'elegooSide', rear: 'elegooRear', under: 'elegooUnder',
});

export function createElegooCameraSelection(tools, controls) {
  function select(kind = null) {
    if (kind !== null && !Object.hasOwn(elegooPresetButtonIds, kind))
      throw Error('Unknown ELEGOO camera preset');
    const id = kind === null ? null : elegooPresetButtonIds[kind];
    for (const button of tools.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(id !== null && button.id === id));
  }
  const clear = () => select();
  // change also fires for fitting, resize and drawing. Only a user interaction
  // start clears the preset; the view function selects its canonical button.
  controls.addEventListener('start', clear);
  return {select, clear, dispose: () => controls.removeEventListener('start', clear)};
}

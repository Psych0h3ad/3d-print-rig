// deviceMemory is a coarse, privacy-limited device-class hint, not free RAM,
// JavaScript heap headroom, GPU memory or the browser's per-tab budget.
export function deviceMemoryHint(navigator = globalThis.navigator) {
  let value;
  try { value = navigator?.deviceMemory; } catch { return null; }
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

const warnings = new WeakMap();
export function showDeviceMemoryWarning(stage, {document = globalThis.document,
  navigator = globalThis.navigator} = {}) {
  if (!stage || warnings.has(stage)) return;
  const memory = deviceMemoryHint(navigator);
  // This threshold is advisory only. A larger or absent hint cannot establish
  // that a model will load, and must never be rendered as a safety guarantee.
  if (memory === null || memory > 4) return;
  const panel = document.createElement('div');
  panel.className = 'model-memory-warning'; panel.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.setAttribute('aria-live', 'polite');
  const close = document.createElement('button'); close.type = 'button';
  close.textContent = '閉じる';
  close.onclick = () => {
    if (panel.contains?.(document.activeElement)) {
      const selector='header button:not(:disabled), header a, #stage button:not(:disabled)';
      const candidates=document.querySelectorAll?.(selector)||[document.querySelector?.(selector)];
      [...candidates].find(node=>node&&(!node.getClientRects||node.getClientRects().length>0))?.focus?.();
    }
    panel.remove(); document.body?.classList?.remove('has-device-memory-warning');
  };
  panel.append(text, close);
  // A separate flow row keeps warnings clear of model errors/camera tools and
  // keeps dismissal reachable even when the mobile 3D stage is very short.
  const workspace = document.querySelector?.('body > main');
  if (workspace) { workspace.before(panel); document.body?.classList?.add('has-device-memory-warning'); }
  else stage.append(panel);
  text.textContent = `ブラウザー報告の端末RAM概算: ${memory} GiB。空き容量ではありません。大きなモデルでは読み込みに失敗する場合があります。`;
  // Keep dismissal for this stage, including concurrent/sequential model jobs.
  // A new workspace stage gets its own warning; no tracking or persistence.
  warnings.set(stage, panel);
}

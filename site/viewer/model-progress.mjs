// Percentages describe received model bytes. Parsing/assembly is a separate
// phase; elapsed time is never used to invent download progress.
export function createModelProgress(files, onUpdate = () => {}) {
  const records = new Map(Object.entries(files).map(([key, spec]) => [key, {
    loaded: 0, total: spec?.bytes || 0, received: false,
  }]));
  let phase = 'download', closed = false;
  function snapshot() {
    const rows = [...records.values()], loaded = rows.reduce((n, r) => n + r.loaded, 0);
    const known = rows.length > 0 && rows.every(r => Number.isFinite(r.total) && r.total > 0);
    const total = known ? rows.reduce((n, r) => n + r.total, 0) : 0;
    const received = rows.length > 0 && rows.every(r => r.received);
    return {loaded, total, received, phase, percent: received ? 100 : total ? Math.min(99, Math.floor(loaded / total * 100)) : null};
  }
  function emit() { if (!closed) onUpdate(snapshot()); }
  return {
    snapshot,
    update(key, event) {
      if (closed) return;
      const row = records.get(key); if (!row) throw Error('Unregistered model transfer');
      row.loaded = Math.max(0, Number(event.loaded) || 0);
      row.total = Number.isFinite(event.total) && event.total > 0 && row.loaded <= event.total ? event.total : 0;
      row.received = event.received === true;
      if (row.received) row.total = row.loaded;
      emit();
    },
    assembling() { phase = 'assembly'; emit(); },
    close() { closed = true; },
  };
}

// Content-Length counts encoded bytes when the browser transparently decodes
// Content-Encoding. Use a pinned decoded size in that case, or stay unknown.
export async function readModelBytes(response, {spec, onProgress = () => {}} = {}) {
  const encoded = !!response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity';
  const header = Number(response.headers.get('content-length'));
  let total = encoded ? 0 : header > 0 ? header : spec?.bytes || 0;
  const prefix = [];
  function representation(chunk) {
    if (!encoded || spec?.encoding !== 'gzip' || prefix.length >= 2) return;
    for (const byte of chunk) { prefix.push(byte); if (prefix.length === 2) break; }
    if (prefix.length === 2) total = (prefix[0] === 0x1f && prefix[1] === 0x8b ? spec.bytes : spec.decoded_bytes) || 0;
  }
  let loaded = 0;
  const report = received => onProgress({loaded, total: loaded > total && total > 0 ? 0 : total, received});
  report(false);
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer()); representation(bytes); loaded = bytes.length; report(true); return bytes;
  }
  // Keep the native arrayBuffer collector; the pass-through adds no second
  // whole-model concatenation and leaves cancellation/error propagation intact.
  const progress = new TransformStream({transform(chunk, controller) {
    representation(chunk); loaded += chunk.byteLength; report(false); controller.enqueue(chunk);
  }});
  const bytes = new Uint8Array(await new Response(response.body.pipeThrough(progress)).arrayBuffer());
  report(true); return bytes;
}

const displays = new WeakMap();
export function beginModelLoading(files, {document = globalThis.document, onUpdate} = {}) {
  const stage = document?.getElementById('stage');
  let display = stage && displays.get(stage);
  if (stage && !display) {
    const panel = document.createElement('div'); panel.className = 'model-loading-progress';
    const label = document.createElement('span'), value = document.createElement('output'), bar = document.createElement('progress');
    label.textContent = 'モデルをダウンロード中…'; label.setAttribute('role', 'status');
    bar.max = 100; bar.setAttribute('aria-label', 'モデルのダウンロード進捗');
    value.setAttribute('data-i18n', 'off'); panel.append(label, value, bar); stage.append(panel);
    display = {panel, label, value, bar, jobs: new Map(), active: new Set(), last: ''}; displays.set(stage, display);
  }
  const key = {};
  function render(state) {
    onUpdate?.(state);
    if (!display || !stage.isConnected) return;
    display.jobs.set(key, state);
    const rows = [...display.jobs.values()], active = [...display.active].map(k => display.jobs.get(k)).filter(Boolean);
    const assembly = active.length > 0 && active.every(r => r.phase === 'assembly');
    const received = rows.every(r => r.received), known = rows.every(r => r.total > 0);
    const loaded = rows.reduce((n, r) => n + r.loaded, 0), total = rows.reduce((n, r) => n + r.total, 0);
    const percent = received ? 100 : known ? Math.min(99, Math.floor(loaded / total * 100)) : null;
    const text = assembly ? 'モデルを組み立て中…' : 'モデルをダウンロード中…';
    const signature = text + ':' + percent;
    if (signature === display.last) return; display.last = signature;
    // Do not re-announce the same phase to screen readers on every chunk.
    if (display.phase !== text) { display.label.textContent = text; display.phase = text; }
    display.value.textContent = percent === null ? '' : percent + '%';
    if (percent === null) display.bar.removeAttribute('value'); else display.bar.value = percent;
  }
  display?.active.add(key);
  const tracker = createModelProgress(files, render); render(tracker.snapshot());
  return {...tracker, finish() {
    tracker.close();
    if (!display) return;
    display.active.delete(key);
    if (!display.active.size) { display.panel.remove(); displays.delete(stage); }
    else render(tracker.snapshot());
  }};
}

// One controller owns the scene at a time. Navigation waits for its async
// operations before releasing resources or replacing the controls they use.
let current;
export function activateScope(scope) { current = scope; }
export function onWorkspaceDispose(callback) { current?.cleanup(callback); }
export function workspaceTask(run) { return current ? current.task(run) : run(); }
export function workspaceListen(target, type, listener, options) {
  const handle = type === 'pagehide' && current ? event => { if (!event.persisted) listener(event); } : listener;
  target.addEventListener(type, handle, options);
  current?.cleanup(() => target.removeEventListener(type, handle, options));
  if (type === 'pagehide') current?.cleanup(() => listener({persisted: false}));
}
export function workspaceFrame(callback) {
  const scope = current;
  if (scope?.disposed) return 0;
  const id = requestAnimationFrame(time => {
    scope?.frames.delete(id);
    if (!scope?.disposed) callback(time);
  });
  scope?.frames.add(id);
  return id;
}
function observer(Kind, callback) {
  const scope = current;
  const instance = new Kind((...args) => { if (!scope?.disposed) callback(...args); });
  scope?.cleanup(() => instance.disconnect());
  return {
    observe(...args) { if (!scope?.disposed) instance.observe(...args); },
    disconnect() { instance.disconnect(); },
    takeRecords() { return instance.takeRecords(); },
  };
}
export function WorkspaceResizeObserver(callback) { return observer(globalThis.ResizeObserver, callback); }
export function WorkspaceMutationObserver(callback, Kind = globalThis.MutationObserver) { return observer(Kind, callback); }

export class WorkspaceScope {
  disposed = false;
  frames = new Set();
  tasks = new Set();
  cleanups = [];
  renderers = new Set();
  scenes = new Set();
  cleanup(callback) { this.cleanups.push(callback); }
  resource(value) { this.cleanup(() => value.dispose()); return value; }
  renderer(value) { this.renderers.add(value); return value; }
  scene(value) {
    this.scenes.add(value);
    if (value.isScene && typeof document !== 'undefined') this.task(async () => {
      const {setupToolheadLighting} = await import('./toolhead-lighting.mjs?v=d45718a28ab59f3df3ef');
      if (!this.disposed) setupToolheadLighting(value, {scope:this});
    });
    return value;
  }
  task(run) {
    if (this.disposed) return Promise.reject(new Error('Workspace has closed'));
    // Start synchronously: callers depend on immediate busy/disabled state.
    let promise;
    try { promise = Promise.resolve(run()); } catch (error) { promise = Promise.reject(error); }
    this.tasks.add(promise);
    promise.then(() => this.tasks.delete(promise), () => this.tasks.delete(promise));
    return promise;
  }
  async settle() {
    while (this.tasks.size) await Promise.allSettled([...this.tasks]);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const renderer of this.renderers) renderer.setAnimationLoop(null);
    for (const id of this.frames) cancelAnimationFrame(id);
    this.frames.clear();
    // Gather before controller-specific cleanup removes subtrees.
    const resources = new Set();
    const material = value => {
      if (!value) return;
      resources.add(value);
      for (const item of Object.values(value)) if (item?.isTexture) resources.add(item);
    };
    for (const scene of this.scenes) {
      if (scene.environment?.isTexture) resources.add(scene.environment);
      if (scene.background?.isTexture) resources.add(scene.background);
      scene.traverse(node => {
        if (node.geometry) resources.add(node.geometry);
        for (const value of [].concat(node.material || [])) material(value);
      });
    }
    for (const cleanup of this.cleanups.reverse()) {
      try { cleanup(); } catch (error) { console.error('Workspace cleanup', error); }
    }
    for (const resource of resources) resource.dispose();
    for (const renderer of this.renderers) { renderer.dispose(); renderer.forceContextLoss(); }
    this.cleanups.length = 0; this.scenes.clear(); this.renderers.clear();
  }
}

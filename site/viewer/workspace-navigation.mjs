let navigate, leaving = false, committedURL;
export function bindWorkspaceNavigation(handler) { navigate = handler; }
export function setWorkspaceLeaving(value) { leaving = value; }
export function navigateWorkspace(url) {
  if (navigate) return navigate(url);
  location.assign(url);
}
export function workspaceURL() { return committedURL || location.href; }
export function replaceWorkspaceURL(state, title, url, target = globalThis.history) {
  // A completed old load must not overwrite a Back/Forward destination.
  if (!leaving) { target.replaceState(state, title, url); committedURL = String(url); }
}
export const workspacePages = new Set(['index.html', 'trident.html', 'v0.html', 'v24.html', 'v24-reference.html', 'micron.html', 'kit-reference.html', 'ratrig.html', 'crossant.html', 'toolheads.html', 'gantries.html', 'components.html', 'toolchangers.html', 'e3ng.html']);
export function workspaceTarget(value, current) {
  try {
    const url = new URL(value, current), base = new URL('.', current);
    if (url.username || url.password || url.origin !== base.origin || new URL('.', url).pathname !== base.pathname) return null;
    if (!workspacePages.has(url.pathname.split('/').pop() || 'index.html')) return null;
    return url;
  } catch { return null; }
}

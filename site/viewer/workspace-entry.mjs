// Older cached HTML starts controllers directly. Load the current HTML once
// rather than leaving a mount-only controller in an empty legacy workspace.
export function ensureWorkspaceEntry(moduleURL, {document: doc = globalThis.document, location: loc = globalThis.location} = {}) {
  if (!doc || !loc || doc.querySelector('script[data-controller]') || doc.documentElement.dataset.workspaceEntryRedirect) return false;
  const currentModule = new URL(moduleURL);
  const direct = [...doc.querySelectorAll('script[type="module"][src]')].some(script => {
    const source = new URL(script.src, loc.href);
    return source.origin === currentModule.origin && source.pathname === currentModule.pathname;
  });
  if (!direct) return false;
  const next = new URL(loc.href);
  if (next.searchParams.get('_viewer') === '20261004') return false;
  next.searchParams.set('_viewer', '20261004');
  doc.documentElement.dataset.workspaceEntryRedirect = 'true';
  loc.replace(next.href);
  return true;
}

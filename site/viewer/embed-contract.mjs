// Version 1 is a URL contract, not a frozen model revision.
export const embedVersion = '1';
export const embedPages = new Set(['index.html','trident.html','v24.html','v24-reference.html','v0.html','micron.html','kit-reference.html','ratrig.html','crossant.html','annex.html','community.html','positron.html','remorph.html','toolheads.html','gantries.html','components.html','toolchangers.html','e3ng.html']);
const internal = new Set(['embed','embed_theme','v','viewer','theme','_viewer','return_machine','return_configuration','return_head']);
export function embedURL(href, {theme = 'light', machine} = {}) {
  const source = new URL(href), page = source.pathname.split('/').pop() || 'index.html';
  if (!['http:','https:'].includes(source.protocol) || !embedPages.has(page) || source.username || source.password) throw Error('Unsupported viewer');
  const base = new URL('../embed/', source), query = new URLSearchParams(source.search);
  for (const key of internal) query.delete(key);
  if (machine) query.set('machine',machine);
  query.set('v',embedVersion);query.set('viewer',page);query.set('theme',['light','dark','auto'].includes(theme)?theme:'light');
  base.search=query;return base.href;
}
export function embedTarget(href) {
  const source = new URL(href), query = new URLSearchParams(source.search), page = query.get('viewer') || 'index.html';
  if (query.get('v') !== embedVersion || !embedPages.has(page) || source.search.length > 16000) throw Error('Unsupported embed');
  const theme=query.get('theme') || 'light';
  if (!['light','dark','auto'].includes(theme)) throw Error('Unsupported theme');
  for (const key of internal) query.delete(key);
  const url=new URL('../viewer/'+page,source);url.search=query;return {url,theme};
}
export function iframeMarkup(url, title='3D Print Rig') {
  const escape=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<iframe src="${escape(url)}" title="${escape(title)}" width="100%" height="560" style="border:0;border-radius:12px;max-width:100%" loading="lazy" allow="fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

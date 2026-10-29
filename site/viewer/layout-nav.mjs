import {normalizeLanguage, chooseLanguage, languageURL, languageStorageKey, t} from '../layout/layout-i18n.mjs?v=83d98eb87a1c0485f545';

// Called by the real shared workspace and the separate Machines gallery.
// The link leaves the CAD workspace router by using a separate /layout/ route.
export function setupLayoutNavigation(navigation, {document = globalThis.document, window = globalThis.window,
  listen = (target, type, callback) => target.addEventListener(type, callback)} = {}) {
  if (!navigation) return null;
  let link = navigation.querySelector('[data-layout-nav]');
  if (!link) {
    link = document.createElement('a'); link.setAttribute('data-layout-nav', '');
    link.setAttribute('data-i18n', 'off');
    const target = new URL('../layout/', import.meta.url);
    link.href = target.href;
    navigation.insertBefore(link, navigation.children[1] || null);
  }
  function refresh() {
    let stored; try { stored = window.localStorage.getItem(languageStorageKey); } catch {}
    const current = new URL(window.location.href);
    const language = normalizeLanguage(current.searchParams.get('lang'))
      || normalizeLanguage(document.documentElement.lang) || chooseLanguage({stored});
    link.textContent = t('nav.layout', {}, language);
    link.href = languageURL(link.href, language);
    if (/\/layout\/(?:index\.html)?$/u.test(current.pathname)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  refresh();
  listen(window, 'rig-language-change', refresh);
  listen(window, 'pageshow', refresh);
  return {link, refresh};
}

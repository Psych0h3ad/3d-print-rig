import {supportedLanguages, languageNames, languageStorageKey, normalizeLanguage,
  chooseLanguage, languageURL, t} from './layout-i18n.mjs?v=732a8fe1ed9d3e5b9352';

// Browser effects stay here; the message module can also be used in pure tests.
export function setupLayoutLanguage({document = globalThis.document, window = globalThis.window,
  onChange = () => {}} = {}) {
  if (!document?.documentElement || !window?.location) return null;
  const readStored = () => { try { return window.localStorage.getItem(languageStorageKey); } catch { return undefined; } };
  const query = () => { try { return new URL(window.location.href).searchParams.get('lang'); } catch { return undefined; } };
  let language = chooseLanguage({query: query(), stored: readStored()});
  let followsStored = !normalizeLanguage(query()), disposed = false;
  const picker = document.querySelector('#layout-language, #layoutLanguage, [data-layout-language]');
  if (picker) {
    picker.replaceChildren(...supportedLanguages.map(value => {
      const option = document.createElement('option'); option.value = value;
      option.textContent = languageNames[value]; return option;
    }));
  }
  function valuesFor(element) {
    // Ampere stores dynamic label values on the element, rather than serializing them.
    if (element._layoutValues && typeof element._layoutValues === 'object') return element._layoutValues;
    const input = element.getAttribute('data-layout-values');
    if (!input) return {};
    try {
      const value = JSON.parse(input);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {}
    throw new TypeError('Invalid layout message values');
  }
  function refresh(root = document) {
    if (disposed) return;
    document.documentElement.lang = language;
    const selectors = '[data-layout-i18n], [data-layout-i18n-title], [data-layout-i18n-aria-label], [data-layout-i18n-placeholder]';
    const targets = [...root.querySelectorAll(selectors)];
    if (root.matches?.(selectors)) targets.unshift(root);
    for (const element of targets) {
      const values = valuesFor(element), key = element.getAttribute('data-layout-i18n');
      if (key) element.textContent = t(key, values, language);
      for (const name of ['title', 'aria-label', 'placeholder']) {
        const id = element.getAttribute('data-layout-i18n-' + name);
        if (id) element.setAttribute(name, t(id, values, language));
      }
    }
    if (picker) { picker.value = language; picker.setAttribute('aria-label', t('common.language', {}, language)); }
    for (const link of root.querySelectorAll('[data-layout-link]')) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.hasAttribute('download')) continue;
      let target; try { target = new URL(href, window.location.href); } catch { continue; }
      if (target.origin === window.location.origin && ['http:', 'https:'].includes(target.protocol)) {
        link.href = languageURL(target.href, language);
      }
    }
    document.title = t('layout.page_title', {}, language);
    const description = t('layout.description', {}, language);
    for (const meta of document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) meta.content = description;
    for (const meta of document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]')) meta.content = document.title;
    const locale = {en: 'en_US', ja: 'ja_JP', es: 'es_ES', ko: 'ko_KR', ru: 'ru_RU'}[language];
    const localeMeta = document.querySelector('meta[property="og:locale"]');
    if (localeMeta) localeMeta.content = locale;
  }
  function commitURL() {
    try { window.history.replaceState(window.history.state, '', languageURL(window.location.href, language)); } catch {}
  }
  function setLanguage(value, {persist = true} = {}) {
    const next = normalizeLanguage(value);
    if (disposed || !next) return false;
    if (persist) {
      followsStored = false;
      try { window.localStorage.setItem(languageStorageKey, next); } catch {}
    }
    language = next; commitURL(); refresh();
    onChange(language);
    window.dispatchEvent(new window.CustomEvent('rig-language-change', {detail: {language}}));
    return true;
  }
  const onPicker = () => setLanguage(picker.value);
  function onStorage(event) {
    if (!followsStored || event.key !== languageStorageKey || !normalizeLanguage(event.newValue)) return;
    let current;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      current = window.localStorage.getItem(languageStorageKey);
    } catch { return; }
    if (current === event.newValue && normalizeLanguage(current) !== language) setLanguage(current, {persist: false});
  }
  function onPopState() {
    followsStored = !normalizeLanguage(query());
    setLanguage(chooseLanguage({query: query(), stored: readStored()}), {persist: false});
  }
  picker?.addEventListener('change', onPicker);
  window.addEventListener('storage', onStorage);
  window.addEventListener('popstate', onPopState);
  commitURL(); refresh();
  return {
    get language() { return language; },
    t: (key, values = {}) => t(key, values, language),
    setLanguage, refresh,
    disconnect() {
      disposed = true;
      picker?.removeEventListener('change', onPicker);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('popstate', onPopState);
    },
  };
}

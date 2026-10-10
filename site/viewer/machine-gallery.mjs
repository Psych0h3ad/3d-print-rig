import {machineChoices, machineFamilies, machineVendors} from './machines.js?v=cea8407065ba89be6304';
import {normalizeLanguage, languageURL} from './languages.mjs?v=ba6a5cd8e1d86849ca34';

export const gallerySchema = 'machine-thumbnails/113';
export const galleryIndexPath = '../assets/machines/index.json';
const hashPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[a-z0-9_]+$/u;
const registered = new Map(machineChoices.filter(row => row.available !== false).map(row => [row.id, row]));

// Use only local, exact registered routes; catalog data never becomes HTML.
export function galleryMachineURL(row, current, language = 'en') {
  const native = registered.get(row?.id);
  if (!native || row.page !== native.page || !/^\.\/(?:[a-z0-9-]+\.html)?$/u.test(row.page)) throw Error('Unregistered machine route');
  const url = new URL(row.page, current);
  url.search = ''; url.hash = '';
  url.searchParams.set('machine', row.id);
  url.searchParams.set('lang', normalizeLanguage(language) || 'en');
  return url.href;
}

export function galleryThumbnailURL(row, current) {
  if (!idPattern.test(row?.id) || row.thumbnail !== row.id + '.webp' || !hashPattern.test(row.thumbnail_sha256)) throw Error('Invalid machine thumbnail');
  const url = new URL('../assets/machines/' + row.thumbnail, current);
  url.searchParams.set('v', row.thumbnail_sha256.slice(0, 20));
  return url.href;
}

export function validateGallery(index) {
  if (index?.schema !== gallerySchema || !Array.isArray(index.machines) || index.machines.length !== registered.size) throw Error('Incomplete machine collection');
  const seen = new Set();
  return index.machines.map(row => {
    const native = registered.get(row?.id);
    if (!native || seen.has(row.id) || row.family !== native.family || row.size !== native.size || row.page !== native.page
      || typeof row.label !== 'string' || !row.label.trim() || row.thumbnail !== row.id + '.webp'
      || row.width !== 320 || row.height !== 240 || !hashPattern.test(row.thumbnail_sha256)
      || !Number.isSafeInteger(row.thumbnail_bytes) || row.thumbnail_bytes <= 0
      || !Array.isArray(row.model_pins) || !row.model_pins.length
      || row.model_pins.some(pin => !hashPattern.test(pin?.model_sha256) || !hashPattern.test(pin?.stored_model_sha256)
        || (pin.companions_sha256 != null && !hashPattern.test(pin.companions_sha256)))) throw Error('Invalid machine record: ' + row?.id);
    seen.add(row.id);
    return {...row, vendor: native.vendor, familyLabel: machineFamilies[native.family], vendorLabel: machineVendors[native.vendor]};
  });
}

const searchText = text => String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
export function filterMachines(rows, {query = '', family = '', language = 'en', translate = text => text} = {}) {
  const terms = searchText(query).split(/\s+/u).filter(Boolean);
  return rows.filter(row => (!family || row.family === family) && terms.every(term =>
    searchText([row.id, row.label, translate(row.label, language), row.family, row.familyLabel, row.vendor, row.vendorLabel,
      translate(row.vendorLabel, language), row.size, row.size + ' mm'].join(' ')).includes(term)));
}

// Keep the user's exact valid remembered selection; no fabricated configuration.
export function preferredPrinterURL(current, remembered, language = 'en') {
  const here = new URL(current), fallback = new URL('./', here);
  fallback.searchParams.set('lang', normalizeLanguage(language) || 'en');
  if (!remembered) return fallback.href;
  try {
    const saved = new URL(remembered, here), native = registered.get(saved.searchParams.get('machine'));
    if (!native || saved.origin !== here.origin || saved.username || saved.password) return fallback.href;
    const route = new URL(native.page, here);
    if (saved.pathname !== route.pathname && !(route.pathname.endsWith('/') && saved.pathname === route.pathname + 'index.html')) return fallback.href;
    return languageURL(saved.href, normalizeLanguage(language) || 'en');
  } catch { return fallback.href; }
}

export function createMachineCard(row, {document, current, language, translate, message}) {
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const item = make('li'), card = make('a', undefined, 'machine-card');
  card.href = galleryMachineURL(row, current, language); card.dataset.machine = row.id;
  card.dataset.i18n = 'off';
  const preview = make('div', undefined, 'machine-preview'), image = make('img');
  image.loading = 'lazy'; image.decoding = 'async'; image.width = row.width; image.height = row.height;
  image.alt = message('gallery.thumbnail_alt', {0: translate(row.label, language)});
  image.src = galleryThumbnailURL(row, current);
  image.addEventListener('error', () => {
    image.hidden = true;
    const error = make('span', message('gallery.preview_error'), 'preview-error');
    error.setAttribute('role', 'img'); error.setAttribute('aria-label', image.alt + ' · ' + message('gallery.preview_error'));
    preview.replaceChildren(error);
  }, {once: true});
  preview.append(image);
  const info = make('div', undefined, 'machine-info');
  info.append(make('span', row.familyLabel, 'machine-family'), make('h3', translate(row.label, language)));
  const details = make('p', undefined, 'machine-details');
  details.append(make('span', translate(row.vendorLabel, language)), make('span', row.size + ' mm', 'machine-size'));
  const open = make('span', undefined, 'machine-open'), arrow = make('span', undefined, 'external-icon');
  arrow.setAttribute('aria-hidden', 'true'); open.append(make('span', message('gallery.open')), arrow);
  info.append(details, open); card.append(preview, info); item.append(card); return item;
}

export async function mountGallery({document = globalThis.document, window = globalThis.window, fetcher = globalThis.fetch, services} = {}) {
  const [{setupLanguage, translate, formatMessage}, {setupHeaderThemeToggle, applyDisplay, displayKey}] = services || await Promise.all([
    import('./i18n.mjs?v=4cc63d15a7b73bcd1e81'), import('./display-preferences.mjs?v=3b735c3e32640589ed26'),
  ]);
  const $ = id => document.getElementById(id), lang = setupLanguage({document, window});
  const theme = setupHeaderThemeToggle(document.querySelector('.header-actions'));
  const message = (id, values = {}) => formatMessage(id, values, lang.language);
  const query = new URL(window.location.href).searchParams;
  $('machineSearch').value = query.get('q') || ''; let requestedFamily = query.get('family') || '';
  let rows = [], state = 'loading', sequence = 0;
  const controls = ['machineSearch', 'machineFamily', 'galleryReset'];
  function links() {
    for (const link of document.querySelectorAll('[data-gallery-link]')) link.href = languageURL(link.href, lang.language);
    let remembered; try { remembered = window.sessionStorage.getItem('3d-print-rig-workspace-return'); } catch {}
    $('workspacePrinterLink').href = preferredPrinterURL(window.location.href, remembered, lang.language);
    theme.setAttribute('aria-label', message('ui.dark_mode')); theme.title = message('ui.dark_mode');
    document.querySelector('[data-gallery-nav]').setAttribute('aria-label', message('text.1085'));
    $('machineSearch').placeholder = message('gallery.search_placeholder');
    document.title = message('ui.machines') + ' · 3D Print Rig';
  }
  function setURL() {
    const url = new URL(window.location.href);
    for (const [key, value] of [['q', $('machineSearch').value.trim()], ['family', $('machineFamily').value]]) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    window.history.replaceState(null, '', url);
  }
  function render({updateURL = true} = {}) {
    links();
    if (state !== 'ready') { $('galleryStatus').textContent = message(state === 'loading' ? 'gallery.loading' : 'gallery.error'); return; }
    const filtered = filterMachines(rows, {query: $('machineSearch').value, family: $('machineFamily').value, language: lang.language, translate});
    const fragment = document.createDocumentFragment();
    for (const row of filtered) fragment.append(createMachineCard(row, {document, current: window.location.href, language: lang.language, translate, message}));
    $('machineGrid').replaceChildren(fragment); $('galleryEmpty').hidden = filtered.length !== 0;
    $('galleryStatus').textContent = message('gallery.count', {0: filtered.length, 1: rows.length});
    $('galleryReset').disabled = !$('machineSearch').value && !$('machineFamily').value;
    if (updateURL) setURL();
  }
  function families() {
    const selected = $('machineFamily').value || requestedFamily;
    const all = document.createElement('option'); all.value = ''; all.textContent = message('gallery.all_families');
    $('machineFamily').replaceChildren(all); $('machineFamily').dataset.i18n = 'off';
    for (const [id, label] of [...new Map(rows.map(row => [row.family, row.familyLabel]))].sort((a, b) => a[1].localeCompare(b[1]))) {
      const option = document.createElement('option'); option.value = id; option.textContent = label; $('machineFamily').append(option);
    }
    $('machineFamily').value = selected;
    if (!$('machineFamily').value) $('machineFamily').value = '';
    requestedFamily = '';
  }
  async function load() {
    const request = ++sequence; state = 'loading';
    $('galleryError').hidden = true; $('galleryEmpty').hidden = true; $('machineGrid').setAttribute('aria-busy', 'true');
    controls.forEach(id => { $(id).disabled = true; }); $('galleryRetry').disabled = true; render({updateURL: false});
    try {
      const response = await fetcher(galleryIndexPath, {cache: 'no-cache'});
      if (!response.ok) throw Error('Machine index unavailable');
      const next = validateGallery(await response.json());
      if (request !== sequence) return;
      rows = next; state = 'ready'; families(); controls.forEach(id => { $(id).disabled = false; }); render();
    } catch (error) {
      if (request !== sequence) return;
      state = 'error'; $('machineGrid').replaceChildren(); $('galleryError').hidden = false; render({updateURL: false});
      console.warn('Machine collection unavailable.', error);
    } finally {
      if (request === sequence) { $('machineGrid').setAttribute('aria-busy', 'false'); $('galleryRetry').disabled = false; }
    }
  }
  function reset() { $('machineSearch').value = ''; $('machineFamily').value = ''; render(); $('machineSearch').focus(); }
  $('galleryFilters').addEventListener('submit', event => event.preventDefault());
  $('machineSearch').addEventListener('input', () => render()); $('machineFamily').addEventListener('change', () => render());
  $('galleryReset').addEventListener('click', reset); $('galleryEmptyReset').addEventListener('click', reset); $('galleryRetry').addEventListener('click', load);
  window.addEventListener('rig-language-change', () => { if (state === 'ready') families(); render({updateURL: false}); });
  window.addEventListener('storage', event => { if (event.key === displayKey) applyDisplay(); });
  window.addEventListener('pageshow', links);
  links(); await lang.ready; await load();
}

if (typeof document !== 'undefined' && document.body?.hasAttribute('data-machines-gallery')) await mountGallery();

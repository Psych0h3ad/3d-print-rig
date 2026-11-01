import {createUsageAnalytics} from './usage-analytics.mjs?v=a686f7c8e70e907ce276';
import {usageAnalyticsConfig} from './usage-analytics-config.mjs?v=54e6c921795b1e6b18ff';
import {messageSource} from './i18n.mjs?v=ce1de4dba4ea5045a0c7';
import {onWorkspaceDispose, workspaceListen} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';

import {statisticsConsentKey,statisticsReviewKey,statisticsPreference,storeStatisticsConsent} from './statistics-preference.mjs?v=bee995128ef463ee128f';
export {statisticsConsentKey,statisticsReviewKey,statisticsConsentVersion,statisticsConsentLifetime,statisticsPreference,statisticsConsent,storeStatisticsConsent} from './statistics-preference.mjs?v=bee995128ef463ee128f';
let tracker;
let sessionRecord = null, prompted = false;

export function publicStatisticsURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['lookerstudio.google.com', 'datastudio.google.com'].includes(url.hostname)
      || !/^\/reporting\/[A-Za-z0-9-]+(?:\/page\/[A-Za-z0-9_-]+)?\/?$/u.test(url.pathname)
      || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}

function element(document, tag, id) {
  const node = document.createElement(tag);
  if (id) { node.textContent = messageSource(id); node.setAttribute('data-i18n-id', id); }
  return node;
}

export function setupUsageStatistics(container, {
  document = globalThis.document, window = globalThis.window,
  config = usageAnalyticsConfig, create = createUsageAnalytics, prompt = true,
} = {}) {
  if (!container || !document?.documentElement?.dataset || !window?.navigator || window.self !== window) return null;
  if (document.documentElement.dataset.embedded === 'true' || window.self !== window.top) return null;
  const policyLink = element(document, 'a', 'privacy.title');
  policyLink.href = new URL('./privacy.html', import.meta.url).href;
  container.append(policyLink);
  onWorkspaceDispose(() => policyLink.remove());
  const configured = /^G-[A-Z0-9]{10}$/u.test(config.measurementId || '');
  const publicURL = publicStatisticsURL(config.publicReportUrl);
  if (!configured && !publicURL) return null;
  let storage;
  try { storage = window.localStorage; } catch { /* Storage may be unavailable. */ }
  const preference = () => statisticsPreference(storage) ?? (sessionRecord?.expiresAt > Date.now() ? sessionRecord : null);
  const choice = () => preference()?.choice ?? null;
  let excluded = window.navigator.webdriver === true;
  try {
    if (new URL(window.location.href).searchParams.getAll('analytics').includes('off')) {
      excluded = true;
      try { window.sessionStorage.setItem(statisticsReviewKey, 'off'); } catch { /* Query exclusion remains effective. */ }
    }
    excluded ||= window.sessionStorage.getItem(statisticsReviewKey) === 'off';
  } catch { /* An unavailable session store never bypasses explicit opt-in. */ }
  const privacySignal = window.navigator.globalPrivacyControl === true || window.navigator.doNotTrack === '1'
    || window.doNotTrack === '1' || window.navigator.msDoNotTrack === '1';
  const blocked = excluded || privacySignal;
  if (!tracker && configured) {
    tracker = create({...config, excluded}, {window, document});
    window.addEventListener('pagehide', event => { if (!event.persisted) tracker?.dispose(); });
  }
  if (configured) {
    if (choice() === 'granted' && !blocked) tracker.allow();
    else tracker.deny();
    tracker.page(window.location.href);
  }
  if (!document.querySelector('link[data-usage-statistics]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = new URL('./usage-statistics.css?v=b74b6815cd2fbb983174', import.meta.url).href;
    style.setAttribute('data-usage-statistics', ''); document.head.append(style);
  }

  const open = element(document, 'button', 'statistics.title');
  open.className = 'usage-statistics-open';
  open.type = 'button'; open.setAttribute('aria-haspopup', 'dialog'); container.append(open);
  const dialog = element(document, 'dialog');
  dialog.className = 'usage-statistics-dialog'; dialog.setAttribute('aria-labelledby', 'usageStatisticsTitle');
  const heading = element(document, 'h2', 'statistics.title'); heading.id = 'usageStatisticsTitle';
  const description = element(document, 'p', 'statistics.description');
  const report = publicURL ? element(document, 'a', 'statistics.public_report') : element(document, 'p', 'statistics.report_pending');
  if (publicURL) { report.href = publicURL; report.target = '_blank'; report.rel = 'noopener noreferrer'; }
  const status = element(document, 'p'); status.setAttribute('role', 'status');
  const actions = element(document, 'div'); actions.className = 'usage-statistics-actions';
  const allow = element(document, 'button', 'statistics.allow'); allow.type = 'button';
  const deny = element(document, 'button', 'statistics.deny'); deny.type = 'button';
  const close = element(document, 'button', 'text.1234'); close.type = 'button';
  const privacy = element(document, 'a', 'statistics.google_privacy');
  privacy.href = 'https://policies.google.com/privacy'; privacy.target = '_blank'; privacy.rel = 'noopener noreferrer';
  const policy = element(document, 'a', 'privacy.title');
  policy.href = new URL('./privacy.html', import.meta.url).href;
  policy.className = 'usage-statistics-policy';
  actions.append(allow, deny, close); dialog.append(heading, description, report, status, policy, actions, privacy);
  document.body.append(dialog);
  const refresh = () => {
    const id = excluded ? 'statistics.excluded' : privacySignal ? 'statistics.privacy_signal' : choice() === 'granted'
      ? 'statistics.enabled' : 'statistics.disabled';
    status.textContent = messageSource(id); status.setAttribute('data-i18n-id', id);
    allow.disabled = !configured || blocked; deny.disabled = !configured;
  };
  function expireCookies() {
    // Only our host-only, project-scoped GA cookies; leave other sites alone.
    for (const name of ['_ga', '_ga_' + config.measurementId.slice(2)])
      document.cookie = `${name}=; Max-Age=0; Path=${config.basePath}; Secure; SameSite=Lax`;
  }
  function choose(value) {
    sessionRecord = storeStatisticsConsent(storage, value);
    if (value === 'granted' && !blocked) { tracker.allow(); tracker.page(window.location.href); }
    else {
      tracker.deny();
      expireCookies();
    }
    refresh(); armExpiry(); dialog.close();
  }
  let expiryTimer;
  function armExpiry() {
    if (expiryTimer !== undefined) window.clearTimeout?.(expiryTimer);
    const record = preference();
    if (!record || typeof window.setTimeout !== 'function') return;
    expiryTimer = window.setTimeout(() => {
      if (choice() === null) { tracker?.deny(); if (configured) expireCookies(); refresh(); }
      else armExpiry();
    }, Math.min(record.expiresAt - Date.now() + 1, 2147483647));
  }
  workspaceListen(open, 'click', () => { dialog.close(); refresh(); dialog.showModal(); });
  workspaceListen(allow, 'click', () => choose('granted'));
  workspaceListen(deny, 'click', () => choose('denied'));
  workspaceListen(close, 'click', () => dialog.close());
  workspaceListen(window, 'storage', event => {
    if (!configured || (event.key !== statisticsConsentKey && event.key !== null)) return;
    sessionRecord = null;
    if (choice() === 'granted' && !blocked) { tracker.allow(); tracker.page(window.location.href); }
    else { tracker.deny(); expireCookies(); }
    refresh(); armExpiry();
  });
  refresh(); armExpiry();
  // A non-modal choice leaves the model and controls available.
  if (prompt && configured && !blocked && choice() === null && !prompted) { prompted = true; dialog.show(); }
  onWorkspaceDispose(() => { if (expiryTimer !== undefined) window.clearTimeout?.(expiryTimer); dialog.close(); dialog.remove(); open.remove(); });
  return {dialog, open, refresh};
}

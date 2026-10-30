// Shared consent record; importing this module performs no browser or network work.
export const statisticsConsentKey = '3d-print-rig-analytics-consent-v1';
export const statisticsReviewKey = '3d-print-rig-analytics-review';
export const statisticsConsentVersion = '2026-10-23';
export const statisticsConsentLifetime = 180 * 86400000;

export function statisticsPreference(storage, now = Date.now()) {
  try {
    const record = JSON.parse(storage.getItem(statisticsConsentKey));
    return record?.version === statisticsConsentVersion && ['granted', 'denied'].includes(record.choice)
      && Number.isFinite(record.createdAt) && record.createdAt <= now
      && record.expiresAt === record.createdAt + statisticsConsentLifetime && record.expiresAt > now ? record : null;
  } catch { return null; }
}
export const statisticsConsent = (storage, now) => statisticsPreference(storage, now)?.choice ?? null;

export function storeStatisticsConsent(storage, value, now = Date.now()) {
  if (!['granted', 'denied'].includes(value)) throw Error('Invalid statistics preference');
  const record = {version: statisticsConsentVersion, choice: value, createdAt: now, expiresAt: now + statisticsConsentLifetime};
  try { storage.setItem(statisticsConsentKey, JSON.stringify(record)); } catch { /* This visit still respects the choice. */ }
  return record;
}

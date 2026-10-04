/* Actualise le lien primaire et l’infobulle même quand la fenêtre est fermée. */
const ADDRESS_URL = 'https://movix.online/address.json';
const CACHE_KEY = 'movix_primary';
const ALARM_NAME = 'refresh-primary';
const REFRESH_MINUTES = 10;
let inFlight = null;

function webUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch (_) { return null; }
}

function normalizeData(data) {
  const primary = webUrl(data?.primary?.url);
  if (!primary) throw new Error('Aucune adresse primaire HTTP(S) valide.');
  const active = (Array.isArray(data.active) ? data.active : []).flatMap(item => {
    const url = webUrl(item?.url);
    return url ? [{ url, label: String(item.label || new URL(url).hostname) }] : [];
  });
  return { primary: { url: primary }, active };
}

async function readCache() {
  const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
  if (!stored || !Number.isFinite(stored.checkedAt)) return null;
  try { return { ...stored, data: normalizeData(stored.data) }; }
  catch (_) { return null; }
}

async function setTooltip(cache, stale = false) {
  const title = cache
    ? `Movix – ${stale ? 'Dernier lien primaire connu (actualisation indisponible)' : 'Lien primaire'}\n${cache.data.primary.url}\nRécupéré le ${new Date(cache.checkedAt).toLocaleString('fr-FR')}`
    : 'Movix – Lien primaire indisponible. Cliquez pour réessayer.';
  await chrome.action.setTitle({ title });
}

function refreshPrimary() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let data;
      try {
        const response = await fetch(ADDRESS_URL, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = normalizeData(await response.json());
      } finally { clearTimeout(timeout); }
      const cache = { data, checkedAt: Date.now(), stale: false };
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      await setTooltip(cache);
      return { ok: true, ...cache };
    } catch (error) {
      const cached = await readCache();
      if (cached) {
        const cache = { ...cached, stale: true };
        await chrome.storage.local.set({ [CACHE_KEY]: cache });
        await setTooltip(cache, true);
        return { ok: true, ...cache };
      }
      await setTooltip(null);
      return { ok: false, error: error.message };
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}

async function initialize(force = false) {
  // Les alarmes peuvent disparaître au redémarrage : les recréer si nécessaire.
  if (!await chrome.alarms.get(ALARM_NAME)) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
  }
  const cached = await readCache();
  if (cached) await setTooltip(cached, cached.stale);
  if (force || !cached || Date.now() - cached.checkedAt >= REFRESH_MINUTES * 60000) {
    await refreshPrimary();
  }
}

function reportError(error) { console.error('Movix :', error); }
chrome.runtime.onInstalled.addListener(() => { initialize(true).catch(reportError); });
chrome.runtime.onStartup.addListener(() => { initialize(true).catch(reportError); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) refreshPrimary().catch(reportError);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'refresh-primary') return;
  refreshPrimary().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
initialize().catch(reportError);

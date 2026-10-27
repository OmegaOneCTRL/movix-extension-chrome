/* Actualise le lien primaire et l’infobulle même quand la fenêtre est fermée. */
const ADDRESS_URL = 'https://movix.online/address.json';
const CACHE_KEY = 'movix_primary';
const ALARM_NAME = 'refresh-primary';
const REFRESH_MINUTES = 10;
const SEASONAL_ICON_ALARM = 'update-seasonal-icon';
let inFlight = null;

const SEASONAL_ICONS = {
  default: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  halloween: { 16: 'icons/halloween16.png', 48: 'icons/halloween48.png', 128: 'icons/halloween128.png' },
  christmas: { 16: 'icons/christmas16.png', 48: 'icons/christmas48.png', 128: 'icons/christmas128.png' },
  easter: { 16: 'icons/easter16.png', 48: 'icons/easter48.png', 128: 'icons/easter128.png' },
  newyear: { 16: 'icons/newyear16.png', 48: 'icons/newyear48.png', 128: 'icons/newyear128.png' },
  valentines: { 16: 'icons/valentines16.png', 48: 'icons/valentines48.png', 128: 'icons/valentines128.png' },
  summer: { 16: 'icons/summer16.png', 48: 'icons/summer48.png', 128: 'icons/summer128.png' }
};

// Calcul de Pâques grégorien (algorithme de Meeus/Jones/Butcher).
function easterSunday(year) {
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=(h+l-7*m+114)%31+1;
  return new Date(year, month-1, day);
}
function sameMonthDay(date, month, day) { return date.getMonth()===month-1 && date.getDate()===day; }
function seasonalIcon(now = new Date()) {
  const y=now.getFullYear(), easter=easterSunday(y);
  const easterStart=new Date(y,easter.getMonth(),easter.getDate()-7);
  const easterEnd=new Date(y,easter.getMonth(),easter.getDate()+1);
  if (sameMonthDay(now,12,24) || sameMonthDay(now,12,25) || sameMonthDay(now,12,26)) return 'christmas';
  if ((now.getMonth()===11 && now.getDate()>=27) || (now.getMonth()===0 && now.getDate()<=2)) return 'newyear';
  if (sameMonthDay(now,10,30) || sameMonthDay(now,10,31)) return 'halloween';
  if (now>=easterStart && now<=easterEnd) return 'easter';
  if (sameMonthDay(now,2,14)) return 'valentines';
  if (now.getMonth()>=5 && now.getMonth()<=7) return 'summer';
  return 'default';
}
async function updateSeasonalIcon() {
  const key = seasonalIcon();
  await chrome.action.setIcon({ path: SEASONAL_ICONS[key] });
  await chrome.storage.local.set({ movixSeasonalIcon: key });
}

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
  if (!await chrome.alarms.get(ALARM_NAME)) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
  }
  if (!await chrome.alarms.get(SEASONAL_ICON_ALARM)) {
    await chrome.alarms.create(SEASONAL_ICON_ALARM, { periodInMinutes: 60 });
  }
  await updateSeasonalIcon();
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
  if (alarm.name === SEASONAL_ICON_ALARM) updateSeasonalIcon().catch(reportError);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'refresh-primary') return;
  refreshPrimary().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
initialize().catch(reportError);

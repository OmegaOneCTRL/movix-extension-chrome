/* Sélectionne les icônes saisonnières à la date locale de l’utilisateur. */
const SEASONAL_ICON_ALARM = 'update-seasonal-icon';
const ICONS = {
  default: {16:'icons/icon16.png',48:'icons/icon48.png',128:'icons/icon128.png'},
  halloween: {16:'icons/halloween16.png',48:'icons/halloween48.png',128:'icons/halloween128.png'},
  christmas: {16:'icons/christmas16.png',48:'icons/christmas48.png',128:'icons/christmas128.png'},
  easter: {16:'icons/easter16.png',48:'icons/easter48.png',128:'icons/easter128.png'},
  newyear: {16:'icons/newyear16.png',48:'icons/newyear48.png',128:'icons/newyear128.png'},
  valentines: {16:'icons/valentines16.png',48:'icons/valentines48.png',128:'icons/valentines128.png'},
  summer: {16:'icons/summer16.png',48:'icons/summer48.png',128:'icons/summer128.png'}
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
  if (sameMonthDay(now,10,31) || sameMonthDay(now,10,30)) return 'halloween';
  if (now>=easterStart && now<=easterEnd) return 'easter';
  if (sameMonthDay(now,2,14)) return 'valentines';
  if (now.getMonth()>=5 && now.getMonth()<=7) return 'summer';
  return 'default';
}
async function updateSeasonalIcon() {
  const key=seasonalIcon();
  await chrome.action.setIcon({path: ICONS[key]});
  await chrome.storage.local.set({movixSeasonalIcon:key});
}
chrome.runtime.onInstalled.addListener(() => updateSeasonalIcon().catch(console.error));
chrome.runtime.onStartup.addListener(() => updateSeasonalIcon().catch(console.error));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name===SEASONAL_ICON_ALARM) updateSeasonalIcon().catch(console.error);
});
if (chrome.runtime.onInstalled) {
  chrome.alarms.create(SEASONAL_ICON_ALARM,{periodInMinutes:60});
  updateSeasonalIcon().catch(console.error);
}

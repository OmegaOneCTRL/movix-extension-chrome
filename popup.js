/* Movix : lien primaire et adresses alternatives. */
const openBtn = document.getElementById('open-btn');
const urlChip = document.getElementById('url-chip');
const errorMsg = document.getElementById('error-msg');
const altLinks = document.getElementById('alt-links');
const cacheNote = document.getElementById('cache-note');
const statusBadge = document.getElementById('status-badge');
let primaryUrl = null;

function showMovixState(name) {
  ['loading', 'success', 'error'].forEach(state => {
    document.getElementById(`state-${state}`).classList.toggle('active', state === name);
  });
}

async function fetchPrimaryUrl() {
  showMovixState('loading');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'refresh-primary' });
    if (!response?.ok) throw new Error(response?.error || 'Aucune adresse disponible.');
    const { data, checkedAt, stale } = response;
    primaryUrl = data.primary.url;
    urlChip.textContent = primaryUrl;
    urlChip.title = 'Cliquer pour copier : ' + primaryUrl;
    statusBadge.textContent = stale ? 'Dernier lien connu' : 'Lien primaire';
    cacheNote.textContent = `${stale ? 'Actualisation impossible. Dernière récupération' : 'Récupéré'} : ${new Date(checkedAt).toLocaleString('fr-FR')}`;
    altLinks.replaceChildren();
    data.active.filter(item => item.url !== primaryUrl).slice(0, 2).forEach(item => {
      const link = document.createElement('a');
      link.className = 'alt-chip';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = item.url;
      link.textContent = item.label;
      altLinks.appendChild(link);
    });
    showMovixState('success');
    // Le popup reste ouvert ; seul le bouton « Ouvrir Movix » ouvre le site.
  } catch (error) {
    errorMsg.textContent = 'Impossible de récupérer le lien primaire.\n' + error.message;
    showMovixState('error');
  }
}

urlChip.addEventListener('click', async () => {
  if (!primaryUrl) return;
  try {
    await navigator.clipboard.writeText(primaryUrl);
    urlChip.textContent = '✓ Copié !';
    setTimeout(() => { urlChip.textContent = primaryUrl; }, 1500);
  } catch (_) {
    cacheNote.textContent = 'Copie impossible. Le lien reste affiché ci-dessus.';
  }
});
openBtn.addEventListener('click', () => {
  if (primaryUrl) chrome.tabs.create({ url: primaryUrl, active: true });
});
document.getElementById('retry-btn').addEventListener('click', fetchPrimaryUrl);
fetchPrimaryUrl();

/* Movix : lien primaire et contrôle des mises à jour GitHub. */
const openBtn = document.getElementById('open-btn');
const urlChip = document.getElementById('url-chip');
const errorMsg = document.getElementById('error-msg');
const altLinks = document.getElementById('alt-links');
const cacheNote = document.getElementById('cache-note');
const statusBadge = document.getElementById('status-badge');
const updateStatus = document.getElementById('update-status');
const updateButton = document.getElementById('download-update');
const checkUpdatesButton = document.getElementById('check-updates');
let primaryUrl = null;

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/OmegaOneCTRL/movix-extension-chrome/releases/latest';
let latestReleaseUrl = null;

function compareVersions(left, right) {
  const parse = value => {
    const match = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) throw new Error('Format de version invalide.');
    return match.slice(1, 4).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

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
  } catch (error) {
    errorMsg.textContent = 'Impossible de récupérer le lien primaire.\n' + error.message;
    showMovixState('error');
  }
}

async function checkForUpdates() {
  checkUpdatesButton.disabled = true;
  updateButton.classList.remove('visible');
  latestReleaseUrl = null;
  updateStatus.textContent = 'Vérification des mises à jour…';
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub répond HTTP ${response.status}.`);
    const release = await response.json();
    if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') {
      throw new Error('Dernière release GitHub introuvable.');
    }
    const releaseUrl = new URL(release.html_url);
    if (releaseUrl.origin !== 'https://github.com' ||
        !releaseUrl.pathname.startsWith('/OmegaOneCTRL/movix-extension-chrome/releases/tag/')) {
      throw new Error('Lien de release GitHub invalide.');
    }
    latestReleaseUrl = releaseUrl.href;
    const installedVersion = chrome.runtime.getManifest().version;
    const comparison = compareVersions(release.tag_name, installedVersion);
    if (comparison > 0) {
      updateStatus.textContent = `Mise à jour disponible : v${release.tag_name.replace(/^v/, '')} (installée : v${installedVersion}).`;
      updateButton.classList.add('visible');
    } else if (comparison < 0) {
      updateStatus.textContent = `Version installée : v${installedVersion}. Dernière release publiée : v${release.tag_name.replace(/^v/, '')}.`;
    } else {
      updateStatus.textContent = `Extension à jour (v${installedVersion}).`;
    }
  } catch (error) {
    updateStatus.textContent = 'Vérification impossible. Vérifie ta connexion puis réessaie.';
    console.warn('Movix – mise à jour :', error);
  } finally {
    checkUpdatesButton.disabled = false;
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
checkUpdatesButton.addEventListener('click', checkForUpdates);
updateButton.addEventListener('click', () => {
  if (latestReleaseUrl) chrome.tabs.create({ url: latestReleaseUrl, active: true });
});
fetchPrimaryUrl();
checkForUpdates();

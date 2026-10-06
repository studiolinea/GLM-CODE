// Pilotage : le petit « service worker » qui garde l'appli sur l'appareil, pour qu'elle s'ouvre sans réseau.
// Il ne garde que l'enveloppe de l'appli (la page et ses fichiers construits), jamais les données :
// les chiffres hors ligne viennent de la copie que l'appli garde elle-même sur l'appareil.
// - /api/… (le serveur de l'appli), Supabase et tout autre site : jamais touchés, toujours le réseau.
// - La page : le réseau d'abord ; sans réponse, la copie gardée.
// - /assets/… (noms avec empreinte, qui ne changent jamais) : la copie gardée d'abord.
//
// La construction (vite.config.ts) remplace VERSION et FICHIERS : un nouveau nom de cache à chaque version,
// et les anciens caches sont effacés à l'activation.

const VERSION = '__VERSION__';
const FICHIERS = []; /* __FICHIERS__ */
const CACHE = `pilotage-${VERSION}`;
const PREFIXE = 'pilotage-';
// Au-delà, on montre la copie de la page ; la réponse du réseau, si elle arrive, la remplace pour la prochaine fois.
const ATTENTE_PAGE_MS = 4000;

const adresse = (chemin) => new URL(chemin, self.registration.scope).href;
const PAGE = adresse('./');
const ASSETS = new URL('./assets/', self.registration.scope).pathname;

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // { cache: 'reload' } : les fichiers viennent du serveur, pas du cache du navigateur.
      await cache.addAll([PAGE, ...FICHIERS.map(adresse)].map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((nom) => nom.startsWith(PREFIXE) && nom !== CACHE).map((nom) => caches.delete(nom)));
      await self.clients.claim();
    })(),
  );
});

/** La page, sans ses paramètres (?tiktok=retour…) : une seule copie par adresse. */
function clePage(requete) {
  const url = new URL(requete.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

function page(evenement) {
  const requete = evenement.request;
  let enregistrement = Promise.resolve();
  const reseau = fetch(requete).then((reponse) => {
    // Seulement une vraie page de l'appli (pas une redirection, pas une erreur). La copie est faite avant que
    // la page ne lise la réponse.
    if (reponse.ok && reponse.type === 'basic') {
      const copie = reponse.clone();
      enregistrement = caches.open(CACHE).then((cache) => cache.put(clePage(requete), copie));
    }
    return reponse;
  });
  // La copie s'enregistre même si la page a déjà été servie depuis le cache (réseau lent).
  evenement.waitUntil(reseau.then(() => enregistrement).catch(() => undefined));
  return (async () => {
    try {
      return await Promise.race([
        reseau,
        new Promise((_, refus) => setTimeout(() => refus(new Error('trop lent')), ATTENTE_PAGE_MS)),
      ]);
    } catch {
      const cache = await caches.open(CACHE);
      return (await cache.match(clePage(requete))) ?? (await cache.match(PAGE)) ?? reseau;
    }
  })();
}

async function fichierConstruit(requete) {
  const cache = await caches.open(CACHE);
  const copie = await cache.match(requete);
  if (copie) return copie;
  const reponse = await fetch(requete);
  if (reponse.ok && reponse.type === 'basic') await cache.put(requete, reponse.clone());
  return reponse;
}

async function autreFichier(requete) {
  try {
    return await fetch(requete);
  } catch (erreur) {
    const copie = await caches.match(requete, { cacheName: CACHE });
    if (copie) return copie;
    throw erreur;
  }
}

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  // Supabase, TikTok, tout autre site : pas touché.
  if (url.origin !== self.location.origin) return;
  // Le serveur de l'appli (comptes reliés, retour de TikTok) : toujours le réseau, jamais de copie.
  if (url.pathname.startsWith('/api/')) return;
  if (requete.mode === 'navigate') return evenement.respondWith(page(evenement));
  if (url.pathname.startsWith(ASSETS)) return evenement.respondWith(fichierConstruit(requete));
  evenement.respondWith(autreFichier(requete));
});

// Service worker: l'app si apre anche senza connessione.
// Se pubblichi una nuova versione dei file, cambia il numero qui sotto.
const VERSIONE_CACHE = 'rapportini-v5.1.0';
const FILE = ['./', 'index.html', 'app.js', 'style.css', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE_CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k !== VERSIONE_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Google e API: sempre dalla rete
  e.respondWith(caches.open(VERSIONE_CACHE).then(cache =>
    cache.match(req, { ignoreSearch: true }).then(trovato => {
      const rete = fetch(req).then(resp => {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => trovato);
      return trovato || rete;                                // subito dalla cache, aggiorna in background
    })));
});

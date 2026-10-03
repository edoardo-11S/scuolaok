/* ScuolaOK! — service worker
   Rende l'app installabile e la fa aprire anche senza connessione.
   Quando carichi un nuovo index.html su GitHub, cambia il numero di VERSIONE
   (v1 -> v2 ...) per forzare l'aggiornamento su tutti i dispositivi. */
const VERSIONE = 'scuolaok-v1';
const INDEX = new URL('./index.html', self.registration.scope).href;
const GUSCIO = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
// Risorse esterne che servono all'app per partire (font e libreria di sincronizzazione)
const HOST_ESTERNI = ['fonts.googleapis.com', 'fonts.gstatic.com', 'esm.sh'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Pagina dell'app: prima la rete (così arrivano gli aggiornamenti),
// se la rete manca o è troppo lenta si usa la copia salvata.
function paginaApp(req) {
  return new Promise((resolve) => {
    let fatto = false;
    const daCache = () =>
      caches.match(INDEX).then((r) => r || caches.match('./', { ignoreSearch: true }));
    const timer = setTimeout(() => {
      daCache().then((r) => { if (r && !fatto) { fatto = true; resolve(r); } });
    }, 4000);
    fetch(req)
      .then((resp) => {
        clearTimeout(timer);
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSIONE).then((c) => c.put(INDEX, copia));
        }
        if (!fatto) { fatto = true; resolve(resp); }
      })
      .catch(() => {
        clearTimeout(timer);
        daCache().then((r) => {
          if (!fatto) { fatto = true; resolve(r || Response.error()); }
        });
      });
  });
}

// Altri file: subito la copia salvata, e intanto la si aggiorna in sottofondo.
function copiaPoiAggiorna(req) {
  return caches.open(VERSIONE).then((c) =>
    c.match(req).then((salvata) => {
      const rete = fetch(req)
        .then((resp) => {
          if (resp && (resp.ok || resp.type === 'opaque')) c.put(req, resp.clone());
          return resp;
        })
        .catch(() => salvata);
      return salvata || rete;
    })
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // salvataggi e login: sempre diretti al server
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || url.href === INDEX) {
      e.respondWith(paginaApp(req));
    } else {
      e.respondWith(copiaPoiAggiorna(req));
    }
    return;
  }
  if (HOST_ESTERNI.includes(url.hostname)) {
    e.respondWith(copiaPoiAggiorna(req));
  }
  // Tutto il resto (i dati del registro sul cloud) non viene mai messo in copia.
});

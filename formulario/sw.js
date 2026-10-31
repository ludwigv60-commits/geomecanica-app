// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geomecanica-d04c2556fe';
const ARCHIVOS = ["./","./assets/datos-CfrvqsV3.js","./assets/index--eSc1T6x.js","./assets/index-Ca_Ix1AH.css","./assets/pdf-D-E3wq6z.js","./assets/xlsx-D7wQQirU.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./plantilla/formato.pdf","./plantilla/formato.xlsx"];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Primero la red (para recibir actualizaciones); sin señal, lo guardado.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});

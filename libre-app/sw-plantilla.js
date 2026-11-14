// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geolibre-__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); });
// Se conserva también la versión anterior: una pantalla abierta antes de actualizar todavía pide sus archivos
// (PDF, Excel) y, si se borraran, la descarga fallaría hasta reabrir la app.
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => {
  const viejas = ks.filter(k => k.startsWith('geolibre-') && k !== CACHE);
  return Promise.all(viejas.slice(0, -1).map(k => caches.delete(k)));
}).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Primero la red (para recibir actualizaciones); sin señal o si el archivo ya no existe en el servidor, lo guardado.
  const guardado = () => caches.match(e.request, { ignoreSearch: true });
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }
    return guardado().then(g => g || r);
  }).catch(() => guardado().then(r => r || caches.match('./index.html'))));
});

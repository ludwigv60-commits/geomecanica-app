// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geolibre-beb6706aa0';
const ARCHIVOS = ["./","./assets/index-7HI9gdhb.css","./assets/index-BPze1cG-.js","./assets/modelo-trazas-vxS7q1QC.js","./assets/onnx-DTDov0bw.js","./assets/ort-wasm-simd-threaded-DDx2apAW.wasm","./assets/ort.wasm.bundle.min-CfTt_KA_.js","./assets/web-715mIT3Q.js","./assets/web-CKlXKC64.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./modelos/trazas.onnx","./modelos/zona.onnx"];
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

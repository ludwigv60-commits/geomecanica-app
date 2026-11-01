// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geomecanica-900805afcc';
const ARCHIVOS = ["./","./assets/_commonjsHelpers-Cpj98o6Y.js","./assets/datos-DUv0Ha8k.js","./assets/index-CjPnrPqL.js","./assets/index-PZ60afQ8.css","./assets/jszip.min-DfF06lK4.js","./assets/ort-wasm-simd-threaded-DDx2apAW.wasm","./assets/ort.wasm.bundle.min-CfTt_KA_.js","./assets/pdf-Bbx0MY8I.js","./assets/xlsx-BoaVi_cR.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./modelos/labor.onnx","./modelos/trazas.onnx","./modelos/zona.onnx","./plantilla/formato.pdf","./plantilla/formato.xlsx"];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Primero la red (para recibir actualizaciones); sin señal, lo guardado.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});

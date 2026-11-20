// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geomecanica-b759fbd54c';
const ARCHIVOS = ["./","./assets/_commonjsHelpers-Cpj98o6Y.js","./assets/datos-CfHs7Bc2.js","./assets/escena3d-Dl6nnwc2.js","./assets/imagenes-BmWZNIA1.js","./assets/imagenes3d-CO4s7M-z.js","./assets/index-Bb0poObF.js","./assets/index-DJogGysz.css","./assets/jszip.min-DfF06lK4.js","./assets/modelo-CqgKDp10.js","./assets/modeloHoja-CAlgzcQr.js","./assets/modeloPdf-2vtzwvT7.js","./assets/modeloXlsx-DHFy8B9T.js","./assets/nativo-qV74Wi11.js","./assets/ort-wasm-simd-threaded-DDx2apAW.wasm","./assets/ort.wasm.bundle.min-CfTt_KA_.js","./assets/paquete-BOtTgd_w.js","./assets/pdf-BUVfjKjr.js","./assets/render3d-DdPOeeof.js","./assets/vista2d-BIRzdfXF.js","./assets/web-CjMv3r2d.js","./assets/web-DcVkc4c0.js","./assets/xlsx-Bb9t0Gbb.js","./icon-192.png","./icon-512.png","./index.html","./logo-lk-completo.png","./logo-lk.png","./manifest.webmanifest","./modelos/labor.onnx","./modelos/trazas.onnx","./modelos/zona.onnx","./plantilla/formato.pdf","./plantilla/formato.xlsx"];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); });
// Se conserva también la versión anterior: una pantalla abierta antes de actualizar todavía pide sus archivos
// (PDF, Excel) y, si se borraran, la descarga fallaría hasta reabrir la app.
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => {
  const viejas = ks.filter(k => k.startsWith('geomecanica-') && k !== CACHE);
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

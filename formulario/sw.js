// Funciona sin señal: al abrir la app con señal se guarda TODO en el celular (lista generada al compilar).
const CACHE = 'geomecanica-035b680bfa';
const ARCHIVOS = ["./","./assets/_commonjsHelpers-Cpj98o6Y.js","./assets/datos-Dx1QW1uK.js","./assets/imagenes-Bw0yqtkm.js","./assets/index-B4ua5dCU.js","./assets/index-Bx4H6mGw.css","./assets/jszip.min-DfF06lK4.js","./assets/modelo-BpPCUBQl.js","./assets/modeloHoja-Brne8gr-.js","./assets/modeloPdf-Jj7q_U-N.js","./assets/modeloXlsx-z4sXbGSs.js","./assets/ort-wasm-simd-threaded-DDx2apAW.wasm","./assets/ort.wasm.bundle.min-CfTt_KA_.js","./assets/paquete-C5J7grQR.js","./assets/pdf-cssRuI6H.js","./assets/xlsx-Cv6_5EDU.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./modelos/labor.onnx","./modelos/trazas.onnx","./modelos/zona.onnx","./plantilla/formato.pdf","./plantilla/formato.xlsx"];
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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/estilos.css';

const apk = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
// En el APK los archivos se guardan y comparten con el menú nativo de Android.
if (apk) import('./export/nativo').then(n => import('./export/compartir').then(c => c.usarEntrega(n.entregaNativa)));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if (!apk && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Cuando llega una versión nueva, la app se recarga sola (los reportes ya están guardados en el celular).
  const habia = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !recargado) { recargado = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

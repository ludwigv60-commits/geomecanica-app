import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { Receptor } from './ui/Receptor';
import './ui/estilos.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{new URLSearchParams(location.search).has('panel') ? <Receptor /> : <App />}</StrictMode>);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Cuando llega una versión nueva, la app se recarga sola (los reportes ya están guardados en el celular).
  const habia = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !recargado) { recargado = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

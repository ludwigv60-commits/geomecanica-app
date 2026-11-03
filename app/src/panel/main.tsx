import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from './Panel';
import '../ui/estilos.css';
import './panel.css';

// El artefacto no sirve archivos .xlsx: la plantilla va como texto base64 y se decodifica al pedirla.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/plantilla\/formato\.xlsx(\?|$)/.test(url)) {
    const r = await fetchOriginal(url.replace(/formato\.xlsx.*$/, 'formato.xlsx.b64.txt'), init);
    if (!r.ok) return r;
    const bytes = Uint8Array.from(atob((await r.text()).trim()), c => c.charCodeAt(0));
    return new Response(bytes, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  }
  return fetchOriginal(input, init);
};

createRoot(document.getElementById('root')!).render(<StrictMode><Panel /></StrictMode>);

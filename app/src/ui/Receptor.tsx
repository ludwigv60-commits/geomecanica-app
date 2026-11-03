// Ventana que abre el panel con "📲 Recibir del celular": pasa los mapeos de este celular al panel, sin archivos.
// El panel la abre (window.opener); la app solo responde a un panel servido por Claude.
import { useEffect, useRef, useState } from 'react';
import { leerListas, listarReportes, marcarEnviado } from '../store';
import { armarPaquete, esOrigenPanel, type MsgEnvio } from '../export/envio';
import type { Reporte } from '../model';

const pendiente = (r: Reporte) => !r.enviado || r.modificado > r.enviado;

export function Receptor() {
  const [estado, setEstado] = useState<{ t: 'espera' | 'enviando' | 'ok' | 'error'; texto: string }>({ t: 'espera', texto: 'Conectando con el panel…' });
  const enviado = useRef(false);

  useEffect(() => {
    const op = window.opener as Window | null;
    if (!op) { setEstado({ t: 'error', texto: 'Esta ventana se abre desde el panel con "📲 Recibir del celular".' }); return; }
    let pend = 0;
    listarReportes().then(l => {
      pend = l.filter(pendiente).length;
      op.postMessage({ tipo: 'geo-listo', pendientes: pend } satisfies MsgEnvio, '*'); // aviso sin datos
    }).catch(() => setEstado({ t: 'error', texto: 'No se pudo leer los mapeos de este navegador.' }));

    const alRecibir = async (e: MessageEvent) => {
      if (e.source !== op || !esOrigenPanel(e.origin)) return;
      const m = e.data as MsgEnvio;
      const responder = (x: MsgEnvio) => op.postMessage(x, e.origin);
      if (m?.tipo === 'geo-pedir') {
        if (enviado.current) return;
        try {
          const todos = await listarReportes();
          const lista = m.todos ? todos : todos.filter(pendiente);
          if (!lista.length) {
            setEstado({ t: 'ok', texto: todos.length ? 'Todos los mapeos de este celular ya estaban en el panel.' : 'No hay mapeos en este navegador. Si llena los mapeos en el APK o desde el ícono del iPhone, abra la app en el navegador o envíe como archivo.' });
            responder({ tipo: 'geo-recibido', ids: [], enviadoEn: new Date().toISOString(), texto: todos.length ? 'Ya estaba todo enviado.' : 'Ese navegador no tiene mapeos guardados.' });
            return;
          }
          enviado.current = true;
          setEstado({ t: 'enviando', texto: `Enviando ${lista.length} mapeo(s) al panel…` });
          responder({ tipo: 'geo-paquete', paquete: armarPaquete(lista, await leerListas()) });
        } catch (x) { setEstado({ t: 'error', texto: `No se pudo preparar el envío: ${(x as Error).message}` }); }
      } else if (m?.tipo === 'geo-progreso') setEstado({ t: 'enviando', texto: m.texto });
      else if (m?.tipo === 'geo-recibido') {
        if (m.ids.length) await marcarEnviado(m.ids, m.enviadoEn);
        setEstado({ t: 'ok', texto: m.texto });
        if (m.ids.length) setTimeout(() => window.close(), 2500);
      } else if (m?.tipo === 'geo-error') { enviado.current = false; setEstado({ t: 'error', texto: m.texto }); }
    };
    addEventListener('message', alRecibir);
    const t = setTimeout(() => setEstado(s => (s.t === 'espera' ? { t: 'error', texto: 'El panel no respondió. Vuelva al panel y toque otra vez "📲 Recibir del celular".' } : s)), 15000);
    return () => { removeEventListener('message', alRecibir); clearTimeout(t); };
  }, []);

  return (
    <div className="pantalla receptor">
      <header className="portada"><small>JUSTA · PRT-JS-CLD-16</small><h1>Enviar al panel</h1></header>
      <main className="contenido">
        <div className={`receptor-caja ${estado.t}`}>
          <b>{estado.t === 'ok' ? '✓' : estado.t === 'error' ? '⚠️' : '☁️'}</b>
          <p>{estado.texto}</p>
          {estado.t === 'ok' && <small>Puede cerrar esta pestaña y volver al panel.</small>}
        </div>
      </main>
    </div>
  );
}

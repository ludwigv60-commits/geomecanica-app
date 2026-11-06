// Envío automático al Centro de Control: cuando el celular tiene internet, cada mapeo pendiente
// (nuevo o modificado después del último envío) se manda solo al puente de la cuenta Google del usuario
// (Apps Script), y el Centro lo carga al abrirse. Mismo paquete que "📥 Subir mapeos", uno por mapeo.
import type { Listas, Reporte } from '../model';
import { armarPaquete } from './envio';
import { marcarEnviado } from '../store';

export const pendiente = (r: Reporte) => !r.enviado || r.modificado > r.enviado;
let enCurso = false;

/** Devuelve cuántos mapeos se enviaron; lanza si el puente respondió con error. */
export async function enviarPendientes(reportes: Reporte[], listas: Listas): Promise<number> {
  const url = listas.puenteUrl?.trim();
  if (!url || enCurso || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  const lista = reportes.filter(pendiente);
  if (!lista.length) return 0;
  enCurso = true;
  let n = 0;
  try {
    for (const r of lista) {
      const p = armarPaquete([r], listas);
      // text/plain: el navegador no pide permiso previo (CORS) y Apps Script lo recibe en e.postData.contents.
      const res = await fetch(url, { method: 'POST', body: JSON.stringify(p), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
      const t = await res.text();
      let ok = res.ok;
      try { ok = ok && JSON.parse(t).ok !== false; } catch { ok = false; }
      if (!ok) throw new Error(`el puente respondió: ${t.slice(0, 120)}`);
      await marcarEnviado([r.id], p.enviadoEn);
      n++;
    }
  } finally { enCurso = false; }
  return n;
}

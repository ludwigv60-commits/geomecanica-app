// Envío automático al Centro de Control: cuando el celular tiene internet, cada mapeo pendiente
// (nuevo o modificado después del último envío) se manda solo al puente de la cuenta Google del usuario
// (Apps Script), y el Centro lo carga al abrirse. Mismo paquete que "📥 Subir mapeos", uno por mapeo.
import type { Listas, Reporte } from '../model';
import { armarPaquete } from './envio';
import { marcarEnviado } from '../store';

export const pendiente = (r: Reporte) => !r.enviado || r.modificado > r.enviado;
let enCurso = false;

/** Reduce una foto (dataURL) a 1600 px de lado como máximo, JPEG 0.7: Gmail gratis parte el mapeo en correos de 300 KB. */
async function reducir(data: string, max = 1600): Promise<string> {
  if (!data?.startsWith('data:image') || typeof document === 'undefined') return data;
  try {
    const img = new Image(); img.src = data; await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.7);
    return out.length < data.length ? out : data;
  } catch { return data; }
}
/** Copia del mapeo para enviar: fotos reducidas; las trazas van completas (tienen su propio w/h). */
export async function paraEnvio(r: Reporte): Promise<Reporte> {
  if (!r.fotos?.length) return r;
  return { ...r, fotos: await Promise.all(r.fotos.map(async f => ({ ...f, data: await reducir(f.data) }))) };
}

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
      const p = armarPaquete([await paraEnvio(r)], listas);
      // Cuerpo string = text/plain sin cabeceras extra: no hay permiso previo (CORS); Apps Script responde 302 y se sigue.
      const res = await fetch(url, { method: 'POST', body: JSON.stringify(p), redirect: 'follow' });
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

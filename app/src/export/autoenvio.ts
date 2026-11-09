// Envío automático al Centro de Control: cuando el celular tiene internet, cada mapeo pendiente
// (nuevo o modificado después del último envío) se manda solo al puente de la cuenta Google del usuario
// (Apps Script), y el Centro lo carga al abrirse. Mismo paquete que "📥 Subir mapeos", uno por mapeo.
import type { Listas, Reporte } from '../model';
import { armarPaquete, type Paquete } from './envio';
import { marcarEnviado } from '../store';

/** Pendiente para el Centro: solo cuenta lo que el puente confirmó (el archivo antiguo "enviado" no llega solo al Centro). */
export const pendiente = (r: Reporte) => !r.alCentro || r.modificado > r.alCentro;
/** Nunca llegó al Centro: se envía solo en el próximo turno (7:00 o 19:00). */
export const nuevo = (r: Reporte) => !r.alCentro;
/** Ya estaba en el Centro y se corrigió después: NO se manda solo; el usuario toca Enviar. */
export const corregido = (r: Reporte) => !!r.alCentro && r.modificado > r.alCentro;

/** Turnos de envío automático: 7:00 y 19:00 (hora del celular). Devuelve el último turno ya cumplido. */
export function turnoActual(d = new Date()): Date {
  const t = new Date(d); t.setSeconds(0, 0); t.setMinutes(0);
  const h = d.getHours();
  if (h >= 19) t.setHours(19); else if (h >= 7) t.setHours(7); else { t.setDate(t.getDate() - 1); t.setHours(19); }
  return t;
}
export function proximoTurno(d = new Date()): Date {
  const t = turnoActual(d); t.setHours(t.getHours() + 12); return t;
}
const CLAVE_TURNO = 'lk-envio-turno';
/** Envío automático: una vez por turno (7:00 y 19:00). Si el celular no tuvo señal a esa hora, envía apenas pueda.
 * Solo manda los mapeos nuevos; los corregidos esperan al botón Enviar. Devuelve -1 si este turno ya se cumplió. */
export async function enviarProgramado(reportes: Reporte[], listas: Listas, ahora = new Date()): Promise<number> {
  if (!listas.puenteUrl) return 0;
  const k = turnoActual(ahora).toISOString();
  let hecho: string | null = null;
  try { hecho = localStorage.getItem(CLAVE_TURNO); } catch { /* */ }
  if (hecho === k) return -1;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const lista = reportes.filter(nuevo);
  const n = lista.length ? await enviarLista(lista, listas) : 0;
  if (n === lista.length) { try { localStorage.setItem(CLAVE_TURNO, k); } catch { /* */ } }
  return n;
}
let enCurso = false;

/** Último intento de envío automático, visible en la lista (se guarda en el celular). */
export interface EstadoEnvio { cuando: string; ok: boolean; texto: string }
const CLAVE_ESTADO = 'lk-autoenvio-estado';
export function leerEstado(): EstadoEnvio | null { try { return JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null'); } catch { return null; } }
function ponerEstado(ok: boolean, texto: string) {
  try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ cuando: new Date().toISOString(), ok, texto })); } catch { /* sin almacenamiento */ }
}
/** Revisa la URL del puente antes de usarla: falta de clave es el error más común. */
export function problemaUrl(url?: string): string | null {
  const u = url?.trim();
  if (!u) return null;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(u)) return 'La URL debe empezar con https://script.google.com/macros/s/ y terminar en /exec?k=SU_CLAVE.';
  if (!/[?&]k=[^&]+/.test(u)) return 'A la URL le falta la clave al final: agregue ?k=SU_CLAVE después de /exec.';
  return null;
}
/** APK: URL del puente puesta de fábrica (datos-apk/puente.txt, nunca va al repositorio). Se usa si el celular no tiene una. */
export async function puenteDeFabrica(): Promise<string | null> {
  try {
    const r = await fetch('./datos-apk/puente.txt', { cache: 'no-store' });
    if (!r.ok) return null;
    const u = (await r.text()).trim();
    return u && !u.startsWith('<') && !problemaUrl(u) ? u : null;
  } catch { return null; }
}
/** Prueba la conexión con el puente (no envía ningún mapeo). */
export async function probarPuente(url: string): Promise<string> {
  const p = problemaUrl(url); if (p) throw new Error(p);
  let t = '';
  try { const r = await fetch(url.trim(), { redirect: 'follow' }); t = await r.text(); }
  catch (e) { throw new Error(`sin conexión con Google (${(e as Error).message}). Revise que tenga internet.`); }
  let j: { ok?: boolean; error?: string } = {};
  try { j = JSON.parse(t); } catch { throw new Error('Google no respondió como el puente. Revise que la URL sea la de la implementación (Aplicación web, acceso Cualquiera).'); }
  if (j.ok) return '✓ Conectado con el puente. Los mapeos nuevos o modificados se enviarán solos.';
  if (j.error === 'clave') throw new Error('la clave (?k=…) no coincide con la del script.');
  throw new Error(`el puente respondió: ${t.slice(0, 120)}`);
}

/** Reduce una foto (dataURL) a 1280 px de lado como máximo, JPEG 0.62: Gmail gratis acepta ~100 correos al día y el mapeo va en trozos de 100 KB. */
async function reducir(data: string, max = 1280): Promise<string> {
  if (!data?.startsWith('data:image') || typeof document === 'undefined') return data;
  try {
    const img = new Image(); img.src = data; await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", 0.62);
    return out.length < data.length ? out : data;
  } catch { return data; }
}
/** Copia del mapeo para enviar: fotos reducidas; las trazas van completas (tienen su propio w/h). */
export async function paraEnvio(r: Reporte): Promise<Reporte> {
  if (!r.fotos?.length) return r;
  return { ...r, fotos: await Promise.all(r.fotos.map(async f => ({ ...f, data: await reducir(f.data) }))) };
}

/** Gmail no acepta correos de más de ~200 KB: un mapeo con fotos se manda en trozos (cada uno es un paquete válido
 * para el puente, con `trozo` = parte del paquete real) y el Centro los vuelve a unir. */
export const TROZO = 100000;
export function cuerpos(p: Paquete): string[] {
  const s = JSON.stringify(p);
  if (s.length <= TROZO) return [s];
  const n = Math.ceil(s.length / TROZO), id = `${p.reportes[0]?.id ?? 'm'}-${Date.now().toString(36)}`;
  const r0 = p.reportes[0];
  const cab = r0 ? [{ id: r0.id, labor: r0.labor, desde: r0.desde, fecha: r0.fecha }] : [];
  return Array.from({ length: n }, (_, i) => JSON.stringify({ formato: p.formato, enviadoEn: p.enviadoEn, dispositivo: p.dispositivo, reportes: cab, trozo: { id, i: i + 1, n, datos: s.slice(i * TROZO, (i + 1) * TROZO) } }));
}
async function postear(url: string, cuerpo: string): Promise<void> {
  // Cuerpo string = text/plain sin cabeceras extra: no hay permiso previo (CORS); Apps Script responde 302 y se sigue.
  let res: Response, t: string;
  try { res = await fetch(url, { method: 'POST', body: cuerpo, redirect: 'follow' }); t = await res.text(); }
  catch (e) { throw new Error(`sin conexión con Google (${(e as Error).message})`); }
  let ok = res.ok;
  try { ok = ok && JSON.parse(t).ok !== false; } catch { ok = false; }
  if (!ok) throw new Error(/"clave"/.test(t) ? 'la clave (?k=…) de la URL no coincide con la del script.' : /L[ií]mite|Service invoked too many/i.test(t) ? `Gmail llegó a su límite diario de correos del puente; se reintenta solo más tarde (${t.slice(0, 80)})` : `el puente respondió: ${t.slice(0, 120)}`);
}

/** Devuelve cuántos mapeos se enviaron; lanza si el puente respondió con error. */
export async function enviarPendientes(reportes: Reporte[], listas: Listas): Promise<number> {
  return enviarLista(reportes.filter(pendiente), listas);
}
/** Envía estos mapeos al puente aunque ya figuren como enviados (botón ☁️ Enviar con el puente activo). */
export async function enviarLista(lista: Reporte[], listas: Listas): Promise<number> {
  const url = listas.puenteUrl?.trim();
  if (!url || enCurso) return 0;
  const mal = problemaUrl(url);
  if (mal) { ponerEstado(false, mal); throw new Error(mal); }
  if (!lista.length) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { ponerEstado(false, `sin internet: ${lista.length} mapeo(s) esperan y se envían solos al volver la señal.`); return 0; }
  enCurso = true;
  let n = 0;
  try {
    for (const r of lista) {
      const p = armarPaquete([await paraEnvio(r)], listas);
      for (const cuerpo of cuerpos(p)) await postear(url, cuerpo);
      await marcarEnviado([r.id], p.enviadoEn, true);
      n++;
    }
    ponerEstado(true, `${n} mapeo(s) enviados al Centro de Control.`);
  } catch (e) { ponerEstado(false, (e as Error).message); throw e; }
  finally { enCurso = false; }
  return n;
}

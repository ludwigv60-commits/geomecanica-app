// Fotos de hastiales y corona guiadas por la foto del frente.
// - Dirección en que debe verse cada familia (dip/dip dir) en la foto de cada zona.
// - Asignación de las trazas que encuentra la IA a las familias que el geomecánico validó en el frente.
// - Afinado de la orientación de una familia con sus trazas en varias fotos (dos direcciones de un plano definen su normal).
// Supuesto sin brújula en esas fotos: hastiales verticales y paralelos al eje de la labor, corona horizontal,
// fotos tomadas de frente a la superficie con la parte de arriba del celular hacia arriba (hastiales) o hacia el frente (corona).
import type { Familia, Reporte, ZonaFoto } from '../model';
import { PARAMETROS, type ParamId, type Zona } from '../core/rmr';

type V3 = [number, number, number]; // Este, Norte, Arriba
const R = Math.PI / 180;
const hz = (a: number): V3 => [Math.sin(a * R), Math.cos(a * R), 0];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const difAng = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** Ejes de la foto en el espacio: derecha y arriba de la imagen. */
export function ejesFoto(zona: ZonaFoto, az: number): { der: V3; arr: V3 } {
  const arriba: V3 = [0, 0, 1];
  switch (zona) {
    case 'FRENTE': return { der: hz(az + 90), arr: arriba };
    case 'HI': return { der: hz(az), arr: arriba };          // mirando al hastial izquierdo, el frente queda a la derecha
    case 'HD': return { der: hz(az + 180), arr: arriba };    // mirando al hastial derecho, el frente queda a la izquierda
    case 'CORONA': return { der: hz(az + 90), arr: hz(az) }; // mirando arriba, con el borde superior del celular hacia el frente
  }
}

const normal = (dip: number, dd: number): V3 => [Math.sin(dip * R) * Math.sin(dd * R), Math.sin(dip * R) * Math.cos(dd * R), Math.cos(dip * R)];

/** Ángulo (0–180°, antihorario desde la horizontal de la imagen, como Segmento.ang) de la traza de un plano en la foto. */
export function anguloEnFoto(dip: number, dd: number, az: number, zona: ZonaFoto): number | null {
  const { der, arr } = ejesFoto(zona, az), nF = cruz(der, arr), t = cruz(normal(dip, dd), nF);
  const x = punto(t, der), y = punto(t, arr);
  if (Math.hypot(x, y) < 0.05) return null; // el plano es casi paralelo a la superficie fotografiada: no deja traza
  return ((Math.atan2(y, x) / R) % 180 + 180) % 180;
}

/** Familias medidas (índice en r.familias) con su ángulo esperado en la foto de esa zona. */
export function esperadas(r: Reporte, zona: ZonaFoto): { i: number; ang: number }[] {
  if (r.azimut == null) return [];
  return r.familias.flatMap((f, i) => {
    if (f.dip == null || f.dipdir == null) return [];
    const a = anguloEnFoto(f.dip, f.dipdir, r.azimut!, zona); return a == null ? [] : [{ i, ang: a }];
  });
}

/** Familia que corresponde a una traza: la de ángulo esperado más cercano, si está dentro de la tolerancia. */
export function familiaDeTraza(ang: number, esp: { i: number; ang: number }[], tol = 15): number {
  let mejor = -1, d = tol + 1e-9;
  for (const e of esp) { const x = difAng(ang, e.ang); if (x <= d) { d = x; mejor = e.i; } }
  return mejor;
}

/** Ángulo medio (ponderado por largo, en 0–180°) de las trazas de una familia en una foto. */
function anguloMedio(segs: { ang: number; largo: number }[]): number | null {
  if (!segs.length) return null;
  let s = 0, c = 0; for (const g of segs) { s += Math.sin(2 * g.ang * R) * g.largo; c += Math.cos(2 * g.ang * R) * g.largo; }
  return ((Math.atan2(s, c) / R / 2) % 180 + 180) % 180;
}

export interface Afinado { i: number; dip: number; dipdir: number; fotos: number; cambio: number }

/**
 * Orientación de cada familia desde sus trazas en fotos de zonas distintas (frente, hastiales, corona).
 * Cada foto da una dirección del plano en el espacio; con dos o más direcciones no paralelas sale la normal.
 * Solo se propone si las direcciones se cortan con más de 20° y el resultado no se aleja más de 30° de lo medido.
 */
export function afinarFamilias(r: Reporte): Afinado[] {
  if (r.azimut == null) return [];
  const out: Afinado[] = [];
  r.familias.forEach((f: Familia, i) => {
    if (f.dip == null || f.dipdir == null) return;
    const dirs: V3[] = [], zonas = new Set<ZonaFoto>();
    for (const foto of r.fotos ?? []) {
      if (zonas.has(foto.zona)) continue; // una dirección por zona (la primera foto con trazas de esa familia)
      const a = anguloMedio((foto.trazas?.segmentos ?? []).filter(s => s.familia === i && s.largo > 0));
      if (a == null) continue;
      const { der, arr } = ejesFoto(foto.zona, r.azimut!);
      dirs.push(unit([der[0] * Math.cos(a * R) + arr[0] * Math.sin(a * R), der[1] * Math.cos(a * R) + arr[1] * Math.sin(a * R), der[2] * Math.cos(a * R) + arr[2] * Math.sin(a * R)]));
      zonas.add(foto.zona);
    }
    if (dirs.length < 2) return;
    const n0 = normal(f.dip, f.dipdir);
    let m: V3 = [0, 0, 0], pares = 0;
    for (let a = 0; a < dirs.length; a++) for (let b = a + 1; b < dirs.length; b++) {
      const c = cruz(dirs[a]!, dirs[b]!), s = Math.hypot(...c);
      if (s < Math.sin(20 * R)) continue;
      let u = unit(c); if (punto(u, n0) < 0) u = [-u[0], -u[1], -u[2]];
      m = [m[0] + u[0] * s, m[1] + u[1] * s, m[2] + u[2] * s]; pares++;
    }
    if (!pares) return;
    let n = unit(m); if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const dip = Math.round(Math.acos(Math.min(1, n[2])) / R), dipdir = Math.round(((Math.atan2(n[0], n[1]) / R) + 360) % 360);
    const n0u = n0[2] < 0 ? n0.map(x => -x) as V3 : n0;
    const cambio = Math.round(Math.acos(Math.min(1, Math.abs(punto(n, n0u)))) / R);
    if (cambio <= 30) out.push({ i, dip, dipdir, fotos: dirs.length, cambio });
  });
  return out;
}

/** Zona del RMR/Q que corresponde a la foto. */
export const zonaRmr = (z: ZonaFoto): Zona | null => (z === 'FRENTE' ? null : z);

/** Llena lo vacío de una zona con los datos de las otras (los que vienen de la vista del frente). Devuelve cuántos campos llenó. */
export function rellenarZona(r: Reporte, z: Zona): { r: Reporte; n: number } {
  const otras = (['CORONA', 'HI', 'HD'] as Zona[]).filter(x => x !== z);
  const de = <T,>(f: (o: Zona) => T | null | undefined): T | null => { for (const o of otras) { const v = f(o); if (v != null && v !== '') return v; } return null; };
  const rmr = { ...r.rmr, [z]: { ...r.rmr[z] } }, q = { ...r.q, [z]: { ...r.q[z] } }, ajuste = { ...r.ajuste }, litologia = { ...r.litologia };
  let n = 0;
  for (const id of PARAMETROS.map(p => p.id) as ParamId[]) if (rmr[z][id] == null) { const v = de(o => r.rmr[o][id]); if (v != null) { rmr[z][id] = v; n++; } }
  for (const k of ['jn', 'jr', 'ja', 'jw', 'srf'] as const) if (q[z][k] == null) { const v = de(o => r.q[o][k]); if (v != null) { q[z][k] = v; n++; } }
  if (ajuste[z] == null) { const v = de(o => r.ajuste[o]); if (v != null) { ajuste[z] = v; n++; } }
  if (!litologia[z]) { const v = de(o => r.litologia[o]); if (v) { litologia[z] = v; n++; } }
  return { r: n ? { ...r, rmr, q, ajuste, litologia } : r, n };
}


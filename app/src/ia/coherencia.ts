// Coherencia del mapeo con el tipo de roca que marca el geólogo, usando la base histórica del usuario:
//  - Si lo que la app calculó sola (foto, familias, espaciamientos) saca el RMR del tipo elegido o deja un Q
//    fuera de lo que esa roca tiene en la base, se vuelve al valor histórico de ese tipo (lo marcado a mano
//    por el usuario nunca se toca).
//  - Rango de Q por tipo: percentiles 5 y 95 de los mapeos de ese tipo en la base (en Justa: III-A 1.5–4.8,
//    III-B 0.9–3.7, IV 0.35–2.1). Sin base, las clases de la ficha VG (III: 0.64–7, IV: 0.08–0.64).
//  - Rarezas: valores que casi nunca aparecen en ese tipo de roca en la base, para revisarlos.
import type { Reporte } from '../model';
import { calcular } from '../calc';
import { PARAMETROS, ZONAS, rmrTotal, tipoRoca, type ParamId, type TipoRoca } from '../core/rmr';
import { valorQ } from '../core/q';
import { rqdDesdeJv } from '../core/rqd';
import { plantillaTipo, tipoDe } from './plantilla-roca';

const QK = ['jn', 'jr', 'ja', 'jw', 'srf'] as const;
const IDS = PARAMETROS.map(p => p.id) as ParamId[];
const RQD_DE_PUNTAJE: Record<number, number> = { 20: 95, 17: 82, 13: 62, 8: 37, 3: 15 };
const VG: Record<TipoRoca, [number, number]> = { 'I/II': [7, 1000], 'III-A': [0.64, 7], 'III-B': [0.64, 7], 'IV': [0.08, 0.64], 'V': [0.001, 0.08] };

/** Q de la corona de un mapeo histórico (RQD desde Jv, o desde el puntaje de RQD si es antiguo). */
function qDe(h: Reporte): number | null {
  const rqd = h.rqdManual ?? (h.jv != null ? rqdDesdeJv(h.jv) : RQD_DE_PUNTAJE[h.rmr.CORONA.rqd ?? -1]);
  return rqd == null ? null : valorQ({ rqd, ...h.q.CORONA });
}

const cache = new WeakMap<Reporte[], Map<TipoRoca, { q: [number, number]; n: number; frec: Record<string, Map<number, number>> }>>();
function estadistica(historial: Reporte[]) {
  let m = cache.get(historial); if (m) return m;
  const g = new Map<TipoRoca, Reporte[]>();
  for (const h of historial) { const t = tipoDe(h); if (t) (g.get(t.tipo) ?? g.set(t.tipo, []).get(t.tipo)!).push(h); }
  m = new Map();
  for (const [t, hs] of g) {
    const qs = hs.map(qDe).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
    const frec: Record<string, Map<number, number>> = {};
    for (const id of IDS) { const c = new Map<number, number>(); for (const h of hs) { const v = h.rmr.CORONA[id]; if (v != null) c.set(v, (c.get(v) ?? 0) + 1); } frec[id] = c; }
    const p = (f: number) => qs[Math.min(qs.length - 1, Math.max(0, Math.floor(qs.length * f)))]!;
    m.set(t, { q: qs.length >= 20 ? [p(0.05), p(0.95)] : VG[t], n: hs.length, frec });
  }
  cache.set(historial, m);
  return m;
}

/** Rango de Q aceptable para el tipo de roca (de la base, o de la ficha VG). */
export function rangoQ(tipo: TipoRoca, historial: Reporte[]): { min: number; max: number; fuente: string } {
  const e = estadistica(historial).get(tipo);
  return e && e.n >= 20 ? { min: e.q[0], max: e.q[1], fuente: `tus ${e.n} mapeos tipo ${tipo}` } : { min: VG[tipo][0], max: VG[tipo][1], fuente: 'clases de la ficha VG' };
}

const rmrDe = (r: Reporte) => { const c = calcular(r); return { rmr: c.rmrFinal, tipo: c.tipoFinal, q: c.zonas.CORONA.q }; };

/**
 * Lleva el mapeo al tipo de roca marcado sin tocar lo que el usuario escribió: los valores que la app puso sola
 * (marcados "Sugerido") y que lo sacan del tipo o dejan el Q fuera de rango vuelven al valor histórico de ese tipo.
 */
export function encajarTipo(r: Reporte, historial: Reporte[]): Reporte {
  const tipo = r.tipoGeologo; if (!tipo) return r;
  const pl = plantillaTipo(tipo, r, historial); if (!pl) return r;
  const rq = rangoQ(tipo, historial), sug = new Set(r.sugeridos ?? []);
  const bien = (x: Reporte) => { const v = rmrDe(x); return v.tipo === tipo && (v.q == null || (v.q >= rq.min * 0.999 && v.q <= rq.max * 1.001)); };
  if (bien(r)) return r;
  const b = pl.base;
  // cambios posibles: cada valor puesto por la app que difiere del histórico de ese tipo
  const cambios: { clave: string; aplicar: (x: Reporte) => Reporte }[] = [];
  for (const id of IDS) if (sug.has(`rmr.${id}`) && b.rmr.CORONA[id] != null && ZONAS.some(z => r.rmr[z][id] !== b.rmr.CORONA[id]))
    cambios.push({ clave: `rmr.${id}`, aplicar: x => ({ ...x, rmr: Object.fromEntries(ZONAS.map(z => [z, { ...x.rmr[z], [id]: b.rmr.CORONA[id] }])) as Reporte['rmr'] }) });
  for (const k of QK) if (sug.has(`q.${k}`) && b.q.CORONA[k] != null && ZONAS.some(z => r.q[z][k] !== b.q.CORONA[k]))
    cambios.push({ clave: `q.${k}`, aplicar: x => ({ ...x, q: Object.fromEntries(ZONAS.map(z => [z, { ...x.q[z], [k]: b.q.CORONA[k] }])) as Reporte['q'] }) });
  if (sug.has('jv') && b.jv != null && r.jv !== b.jv) cambios.push({ clave: 'jv', aplicar: x => ({ ...x, jv: b.jv }) });
  if (sug.has('ajuste') && b.ajuste.CORONA != null) cambios.push({ clave: 'ajuste', aplicar: x => ({ ...x, ajuste: { HI: b.ajuste.CORONA, CORONA: b.ajuste.CORONA, HD: b.ajuste.CORONA } }) });
  // voraz: en cada vuelta, el cambio que más acerca al tipo y al rango de Q
  const dist = (x: Reporte) => {
    const v = rmrDe(x), t = TIPO_RANGO[tipo];
    const dR = v.rmr == null ? 50 : v.rmr < t[0] ? t[0] - v.rmr : v.rmr > t[1] ? v.rmr - t[1] : 0;
    const dQ = v.q == null ? 0 : v.q < rq.min ? Math.log(rq.min / v.q) * 5 : v.q > rq.max ? Math.log(v.q / rq.max) * 5 : 0;
    return dR + dQ;
  };
  let x = r; const pend = [...cambios];
  while (!bien(x) && pend.length) {
    let mejor = -1, dm = dist(x);
    pend.forEach((c, i) => { const d = dist(c.aplicar(x)); if (d < dm - 1e-9) { dm = d; mejor = i; } });
    if (mejor < 0) break;
    x = pend.splice(mejor, 1)[0]!.aplicar(x);
  }
  return x === r ? r : { ...x, sugeridos: [...sug] };
}
const TIPO_RANGO: Record<TipoRoca, [number, number]> = { 'I/II': [66, 100], 'III-A': [57, 65], 'III-B': [45, 56], 'IV': [36, 44], 'V': [0, 35] };

/** Avisos de coherencia: Q fuera del rango del tipo y valores que casi nunca aparecen en ese tipo en la base. */
export function avisosCoherencia(r: Reporte, historial: Reporte[]): string[] {
  const out: string[] = [], c = calcular(r), tipo = r.tipoGeologo ?? c.tipoFinal; if (!tipo) return out;
  const rq = rangoQ(tipo, historial), q = c.zonas.CORONA.q;
  if (q != null && (q < rq.min || q > rq.max)) out.push(`Q ${q} está fuera de lo normal para roca ${tipo} (${rq.min.toFixed(2)}–${rq.max.toFixed(2)} en ${rq.fuente}). Revise Jn, Jr, Ja, Jw y SRF.`);
  const e = estadistica(historial).get(tipo);
  if (e && e.n >= 30) for (const p of PARAMETROS) {
    const v = r.rmr.CORONA[p.id]; if (v == null || (r.sugeridos ?? []).includes(`rmr.${p.id}`)) continue;
    const f = (e.frec[p.id]!.get(v) ?? 0) / e.n;
    if (f < 0.03) {
      const [comun] = [...e.frec[p.id]!.entries()].sort((a, b) => b[1] - a[1]);
      const nom = p.clases.find(k => k.puntaje === comun?.[0])?.etiqueta;
      out.push(`${p.nombre}: lo marcado aparece en solo ${Math.round(f * 100)} % de tus mapeos tipo ${tipo}${nom ? `; lo usual es "${nom}"` : ''}. Confirme si es así en el frente.`);
    }
  }
  return out;
}
export { rmrTotal, tipoRoca };

// Inicio rápido por tipo de roca: el geólogo a cargo elige el tipo y la app llena el mapeo típico de ese tipo
// según la base de mapeos importada en el celular (prefiere la misma labor y lo más reciente).
// No se promedian parámetros sueltos: se toma un mapeo REAL de ese tipo (el que más coincide con los valores
// más frecuentes), así el RMR y el Q quedan coherentes y dentro del rango del tipo elegido.
import type { Reporte } from '../model';
import { PARAMETROS, ZONAS, rmrTotal, tipoRoca, type ParamId, type TipoRoca } from '../core/rmr';
import { claveLabor } from './historial-bd';

const QK = ['jn', 'jr', 'ja', 'jw', 'srf'] as const;
const IDS = PARAMETROS.map(p => p.id) as ParamId[];

/** Tipo de roca de un mapeo (por su RMR de la corona, o de la primera zona completa). */
export function tipoDe(r: Reporte): { tipo: TipoRoca; rmr: number } | null {
  for (const z of ['CORONA', 'HI', 'HD'] as const) {
    const v = rmrTotal(r.rmr[z], r.ajuste[z]);
    if (v != null) return { tipo: tipoRoca(v), rmr: v };
  }
  return null;
}

const previos = (r: Reporte, historial: Reporte[]) => historial
  .filter(h => h.id !== r.id && (!r.fecha || !h.fecha || h.fecha <= r.fecha) && tipoDe(h))
  .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.modificado.localeCompare(a.modificado));

const moda = <T,>(xs: T[]): T | undefined => {
  const c = new Map<T, number>(); let best: T | undefined, n = 0;
  for (const x of xs) { const k = (c.get(x) ?? 0) + 1; c.set(x, k); if (k > n) { n = k; best = x; } }
  return best;
};

export interface Plantilla { base: Reporte; n: number; fuente: string; rmr: number; tipo: TipoRoca }

/** Mapeo típico del tipo elegido: misma labor si hay ≥ 3 de ese tipo (últimos 10), si no toda la base (últimos 30). */
export function plantillaTipo(tipo: TipoRoca, r: Reporte, historial: Reporte[]): Plantilla | null {
  const todos = previos(r, historial).filter(h => tipoDe(h)!.tipo === tipo);
  const misma = r.labor ? todos.filter(h => h.labor && claveLabor(h.labor) === claveLabor(r.labor)) : [];
  // Misma labor (últimos 15) si hay al menos 5 de ese tipo; si no, toda la base de ese tipo.
  const grupo = misma.length >= 5 ? misma.slice(0, 15) : todos;
  if (!grupo.length) return null;
  const z = 'CORONA' as const;
  const modas = Object.fromEntries(IDS.map(id => [id, moda(grupo.map(h => h.rmr[z][id]).filter(v => v != null))]));
  const modasQ = Object.fromEntries(QK.map(k => [k, moda(grupo.map(h => h.q[z][k]).filter(v => v != null))]));
  let base = grupo[0]!, mejor = -1;
  for (const h of grupo) {
    const s = IDS.filter(id => h.rmr[z][id] === modas[id]).length + QK.filter(k => h.q[z][k] === modasQ[k]).length * 0.5;
    if (s > mejor) { mejor = s; base = h; }
  }
  // Si al mapeo elegido le falta algún dato, se completa con el valor más frecuente de ese tipo en toda la base.
  const modaDe = <T,>(f: (h: Reporte) => T | null | undefined) => moda(grupo.map(f).filter((v): v is T => v != null)) ?? moda(todos.map(f).filter((v): v is T => v != null));
  base = { ...base, rmr: { ...base.rmr, CORONA: { ...base.rmr.CORONA } }, q: { ...base.q, CORONA: { ...base.q.CORONA } }, ajuste: { ...base.ajuste }, litologia: { ...base.litologia } };
  for (const id of IDS) if (base.rmr.CORONA[id] == null) { const v = modaDe(h => h.rmr.CORONA[id]); if (v != null) base.rmr.CORONA[id] = v; }
  for (const k of QK) if (base.q.CORONA[k] == null) { const v = modaDe(h => h.q.CORONA[k]); if (v != null) base.q.CORONA[k] = v; }
  if (base.ajuste.CORONA == null) base.ajuste.CORONA = modaDe(h => h.ajuste.CORONA) ?? null;
  if (base.jv == null) base.jv = modaDe(h => h.jv) ?? null;
  // Base antigua sin Jv: se estima desde el puntaje de RQD del RMR (RQD = 115 − 3.3·Jv, al centro de cada clase).
  if (base.jv == null && base.rmr.CORONA.rqd != null) base.jv = ({ 20: 6, 17: 10, 13: 16, 8: 23, 3: 31 } as Record<number, number>)[base.rmr.CORONA.rqd] ?? null;
  if (!base.litologia.CORONA) base.litologia.CORONA = modaDe(h => h.litologia.CORONA || null) ?? '';
  const t = tipoDe(base)!;
  const fuente = misma.length >= 5 ? `los últimos ${grupo.length} mapeos tipo ${tipo} de ${r.labor}` : `${grupo.length} mapeos tipo ${tipo} de toda tu base`;
  return { base, n: grupo.length, fuente, rmr: t.rmr, tipo: t.tipo };
}

/** Pasa el mapeo típico al reporte: llena las 3 zonas (RMR, ajuste, Q) y Jv; respeta lo que el usuario ya escribió a mano. */
export function aplicarPlantilla(r: Reporte, p: Plantilla): Reporte {
  const sug = new Set(r.sugeridos ?? []), libre = (clave: string, vacio: boolean) => vacio || sug.has(clave);
  const n: Reporte = { ...r, rmr: { ...r.rmr }, ajuste: { ...r.ajuste }, q: { ...r.q } };
  const b = p.base;
  for (const z of ZONAS) {
    n.rmr[z] = { ...n.rmr[z] }; n.q[z] = { ...n.q[z] };
    for (const id of IDS) {
      const v = b.rmr.CORONA[id];
      if (v != null && libre(`rmr.${id}`, r.rmr[z][id] == null)) { n.rmr[z][id] = v; sug.add(`rmr.${id}`); }
    }
    if (b.ajuste.CORONA != null && libre('ajuste', r.ajuste[z] == null)) { n.ajuste[z] = b.ajuste.CORONA; sug.add('ajuste'); }
    for (const k of QK) {
      const v = b.q.CORONA[k];
      if (v != null && libre(`q.${k}`, r.q[z][k] == null)) { n.q[z][k] = v; sug.add(`q.${k}`); }
    }
  }
  if (b.jv != null && libre('jv', r.jv == null)) { n.jv = b.jv; sug.add('jv'); }
  if (ZONAS.every(z => !r.litologia[z]) && b.litologia.CORONA) n.litologia = { HI: b.litologia.CORONA, CORONA: b.litologia.CORONA, HD: b.litologia.CORONA };
  n.sugeridos = [...sug];
  return n;
}

/** ¿El tipo elegido coincide con lo que dice la base? Compara con los últimos 5 mapeos de la labor (aciertan ~89 % en Justa). */
export function revisarTipo(tipo: TipoRoca, r: Reporte, historial: Reporte[]): string | null {
  if (!r.labor) return null;
  const ult = previos(r, historial).filter(h => h.labor && claveLabor(h.labor) === claveLabor(r.labor)).slice(0, 5);
  if (ult.length < 3) return null;
  const tipos = ult.map(h => tipoDe(h)!.tipo), m = moda(tipos)!, nm = tipos.filter(t => t === m).length;
  if (m === tipo) return null;
  const orden = ['I/II', 'III-A', 'III-B', 'IV', 'V'];
  const salto = Math.abs(orden.indexOf(m) - orden.indexOf(tipo));
  return `Según tu base de datos, ${nm} de los últimos ${ult.length} mapeos de ${r.labor} fueron tipo ${m}${salto >= 2 ? ' (más de un tipo de diferencia)' : ''}. Si el frente cambió (falla, contacto, agua), está bien; si no, revisa.`;
}

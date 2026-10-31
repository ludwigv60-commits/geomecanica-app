// La IA propone valores y da consejos. Nunca sobreescribe lo que el ingeniero ya llenó.
import { PARAMETROS, ZONAS, NOMBRE_ZONA, tipoRoca, puntajeRqd, type ParamId, type Zona } from '../core/rmr';
import { rqdDesdeJv } from '../core/rqd';
import type { Reporte } from '../model';
import type { Calculo } from '../calc';
import type { ResultadoTrazas } from './trazas';

export interface Propuesta {
  clave: string;              // 'rmr.ucs', 'q.jn', 'jv', 'litologia', 'ajuste'
  valor: number | string;
  texto: string;              // por qué
  fuente: 'foto' | 'historial' | 'calculo';
}

const pEsp = (m: number) => (m > 2 ? 20 : m >= 0.6 ? 15 : m >= 0.2 ? 10 : m >= 0.06 ? 8 : 5);
const pPers = (m: number) => (m < 1 ? 6 : m < 3 ? 4 : m < 10 ? 2 : m <= 20 ? 1 : 0);
const jnDe = (n: number, aleat: boolean) => (n <= 0 ? (aleat ? 1 : 0.5) : n === 1 ? (aleat ? 3 : 2) : n === 2 ? (aleat ? 6 : 4) : n === 3 ? (aleat ? 12 : 9) : 15);

export interface MedidasFoto { jv: number; espaciamientos: { familia: number; m: number }[]; persistenciaM: number; familias: number; aleatorias: boolean; escala: number }

/** Convierte trazas (píxeles) a medidas en metros. `anchoFotoM`: ancho real que abarca la foto. */
export function medidasFoto(t: ResultadoTrazas, anchoFotoM: number, activas?: number[]): MedidasFoto | null {
  if (!(anchoFotoM > 0)) return null;
  const esc = t.w / anchoFotoM; // px por m
  const fams = t.familias.filter(f => !activas || activas.includes(f.id));
  const espaciamientos = fams.filter(f => f.espaciamientoPx).map(f => ({ familia: f.id, m: f.espaciamientoPx! / esc }));
  const area = (t.w / esc) * (t.h / esc);
  const totalSeg = t.segmentos.length || 1;
  const aleatorias = t.aleatorios / totalSeg > 0.15;
  // Palmström: Jv = Σ 1/Si + Nr / (5·√A)
  const jv = espaciamientos.reduce((a, e) => a + 1 / e.m, 0) + t.aleatorios / (5 * Math.sqrt(area));
  const pers = fams.length ? Math.max(...fams.map(f => f.persistenciaPx)) / esc : 0;
  return { jv: Math.round(jv * 10) / 10, espaciamientos, persistenciaM: pers, familias: fams.length, aleatorias, escala: esc };
}

/** Moda de un valor en los reportes anteriores (misma labor primero). */
function moda<T>(vals: T[]): { v: T; n: number } | null {
  const m = new Map<string, { v: T; n: number }>();
  for (const v of vals) { if (v == null || v === '') continue; const k = JSON.stringify(v); const e = m.get(k) ?? { v, n: 0 }; e.n++; m.set(k, e); }
  let best: { v: T; n: number } | null = null; for (const e of m.values()) if (!best || e.n > best.n) best = e;
  return best;
}

export function proponer(r: Reporte, historial: Reporte[], foto: MedidasFoto | null): Propuesta[] {
  const out: Propuesta[] = [];
  const previos = historial.filter(h => h.id !== r.id);
  const misma = previos.filter(h => h.labor && h.labor === r.labor);
  const base = (misma.length >= 2 ? misma : previos).slice(0, 15);
  const fuenteHist = misma.length >= 2 ? `tus últimos ${base.length} reportes de ${r.labor}` : `tus últimos ${base.length} reportes`;

  if (foto) {
    out.push({ clave: 'jv', valor: foto.jv, fuente: 'foto', texto: `Jv ${foto.jv} = Σ 1/espaciamiento de ${foto.familias} familias vistas en la foto${foto.aleatorias ? ' + fracturas aleatorias' : ''}.` });
    const rqd = rqdDesdeJv(foto.jv);
    out.push({ clave: 'rmr.rqd', valor: puntajeRqd(rqd), fuente: 'foto', texto: `RQD ${rqd}% → ${puntajeRqd(rqd)} puntos.` });
    if (foto.espaciamientos.length) {
      const min = Math.min(...foto.espaciamientos.map(e => e.m));
      out.push({ clave: 'rmr.espaciamiento', valor: pEsp(min), fuente: 'foto', texto: `Espaciamiento de la familia más cerrada ≈ ${min.toFixed(2)} m → ${pEsp(min)} puntos.` });
    }
    if (foto.persistenciaM > 0) out.push({ clave: 'rmr.persistencia', valor: pPers(foto.persistenciaM), fuente: 'foto', texto: `Trazas de hasta ≈ ${foto.persistenciaM.toFixed(1)} m en la foto (pueden seguir fuera del encuadre) → ${pPers(foto.persistenciaM)} puntos.` });
    const nMedidas = r.familias.filter(f => f.dip != null).length;
    const n = Math.max(foto.familias, nMedidas);
    out.push({ clave: 'q.jn', valor: jnDe(n, foto.aleatorias), fuente: 'foto', texto: `${n} familia(s)${foto.aleatorias ? ' + aleatorias' : ''} → Jn ${jnDe(n, foto.aleatorias)}.` });
  }
  if (base.length) {
    const ya = new Set(out.map(p => p.clave));
    for (const p of PARAMETROS) {
      if (ya.has(`rmr.${p.id}`)) continue;
      const m = moda(base.map(h => h.rmr.CORONA[p.id]));
      if (m) out.push({ clave: `rmr.${p.id}`, valor: m.v as number, fuente: 'historial', texto: `${p.nombre}: ${m.v} puntos en ${m.n} de ${fuenteHist}. Confírmelo en el frente.` });
    }
    for (const k of ['jr', 'ja', 'jw', 'srf'] as const) {
      const m = moda(base.map(h => h.q.CORONA[k]));
      if (m) out.push({ clave: `q.${k}`, valor: m.v as number, fuente: 'historial', texto: `${k.toUpperCase()} = ${m.v} en ${m.n} de ${fuenteHist}.` });
    }
    if (!ya.has('q.jn')) { const m = moda(base.map(h => h.q.CORONA.jn)); if (m) out.push({ clave: 'q.jn', valor: m.v as number, fuente: 'historial', texto: `Jn = ${m.v} en ${m.n} de ${fuenteHist}.` }); }
    const lit = moda(base.map(h => h.litologia.CORONA));
    if (lit) out.push({ clave: 'litologia', valor: lit.v, fuente: 'historial', texto: `Litología ${lit.v} en ${lit.n} de ${fuenteHist}.` });
    const aj = moda(base.map(h => h.ajuste.CORONA));
    if (aj) out.push({ clave: 'ajuste', valor: aj.v as number, fuente: 'historial', texto: `Ajuste ${aj.v} en ${aj.n} de ${fuenteHist}.` });
  }
  return out;
}

/** Aplica solo donde está vacío. Devuelve el reporte nuevo y las claves llenadas por la IA. */
export function aplicar(r: Reporte, props: Propuesta[]): Reporte {
  const n: Reporte = structuredClone(r);
  const marcadas = new Set(n.sugeridos ?? []);
  const vacio = (z: Zona, f: (z: Zona) => unknown) => ZONAS.every(zz => f(zz) == null || f(zz) === '') || f(z) == null;
  for (const p of props) {
    if (p.clave === 'jv') { if (n.jv == null) { n.jv = p.valor as number; marcadas.add('jv'); } continue; }
    if (p.clave === 'litologia') { for (const z of ZONAS) if (!n.litologia[z]) { n.litologia[z] = p.valor as string; marcadas.add('litologia'); } continue; }
    if (p.clave === 'ajuste') { for (const z of ZONAS) if (n.ajuste[z] == null) { n.ajuste[z] = p.valor as number; marcadas.add('ajuste'); } continue; }
    const [grupo, id] = p.clave.split('.') as ['rmr' | 'q', string];
    for (const z of ZONAS) {
      if (grupo === 'rmr' && vacio(z, zz => n.rmr[zz][id as ParamId])) { if (n.rmr[z][id as ParamId] == null) { n.rmr[z][id as ParamId] = p.valor as number; marcadas.add(p.clave); } }
      if (grupo === 'q') { const q = n.q[z] as Record<string, number | undefined>; if (q[id] == null) { q[id] = p.valor as number; marcadas.add(p.clave); } }
    }
  }
  n.sugeridos = [...marcadas];
  return n;
}

/** Consejos del revisor: se recalculan con cada cambio. */
export function consejos(r: Reporte, c: Calculo, historial: Reporte[]): string[] {
  const out: string[] = [];
  const pend = (r.sugeridos ?? []).length;
  if (pend) out.push(`Hay ${pend} valor(es) marcados "Sugerido por IA". Revíselos en el frente; al cambiarlos o confirmarlos deja de aparecer la marca.`);
  const sinMedir = r.familias.filter(f => f.dip == null || f.dipdir == null).length;
  if (sinMedir) out.push(`Falta medir dip / dip direction de ${sinMedir} familia(s) con la brújula.`);
  if (r.azimut == null) out.push('Falta el azimut de la labor: mídalo con la brújula (cámara apuntando al frente).');
  if (c.rqd != null) {
    const sug = puntajeRqd(c.rqd);
    for (const z of ZONAS) { const v = r.rmr[z].rqd; if (v != null && v !== sug) { out.push(`${NOMBRE_ZONA[z]}: el RQD calculado (${c.rqd}%) corresponde a ${sug} puntos, pero se marcó ${v}.`); break; } }
  }
  for (const z of ZONAS) if (c.zonas[z].control?.alerta) { out.push(`${NOMBRE_ZONA[z]}: ${c.zonas[z].control!.alerta}`); break; }
  if (c.ajusteIA) {
    const a = r.ajuste.CORONA;
    if (a != null && a !== c.ajusteIA.ajuste) out.push(`Por orientación sale ${c.ajusteIA.ajuste} (${c.ajusteIA.calificacion}): ${c.ajusteIA.explicacion} Se marcó ${a}. Usted decide.`);
  }
  if (c.diseno?.alerta) out.push(c.diseno.alerta);
  // Tendencia frente a los reportes anteriores de la misma labor.
  const prev = historial.filter(h => h.id !== r.id && h.labor === r.labor && h.labor);
  const rmrPrev = prev.map(h => h.rmrDisenoManual ?? Math.min(...ZONAS.map(z => totalDe(h, z) ?? 999))).filter(v => v < 999).slice(0, 5);
  if (c.rmrFinal != null && rmrPrev.length >= 2) {
    const prom = rmrPrev.reduce((a, b) => a + b, 0) / rmrPrev.length;
    if (Math.abs(c.rmrFinal - prom) >= 8) out.push(`El RMR ${c.rmrFinal} difiere ${Math.round(c.rmrFinal - prom)} puntos del promedio de los últimos ${rmrPrev.length} reportes de ${r.labor} (${prom.toFixed(0)}). Verifique si cambió la roca.`);
    if (tipoRoca(prom) !== c.tipoFinal) out.push(`Cambio de tipo de roca respecto a los reportes anteriores (ST-${tipoRoca(prom)} → ST-${c.tipoFinal}): revise el sostenimiento.`);
  }
  if (c.propuesta && r.sostenimiento.length && r.sostenimiento.join('|') !== c.propuesta.lineas.join('|'))
    out.push('El sostenimiento escrito es distinto a la propuesta de Systra para este tipo de roca. Si es a propósito, explíquelo en observaciones.');
  return out;
}
function totalDe(h: Reporte, z: Zona) {
  const v = PARAMETROS.map(p => h.rmr[z][p.id]); if (v.some(x => x == null)) return null;
  return (v as number[]).reduce((a, b) => a + b, 0) + (h.ajuste[z] ?? 0);
}

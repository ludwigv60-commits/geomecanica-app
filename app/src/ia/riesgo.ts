// Nivel de riesgo propuesto después del análisis: calidad del macizo (RMR y Q), estructuras (fallas, cuñas),
// agua y voladura. El geomecánico decide; la app solo propone y explica el porqué.
import type { Reporte } from '../model';
import { calcular } from '../calc';
import { cunas, espesorShotcrete, pernoInfo, riesgoCuna } from '../export/croquis';

export type Nivel = 'Bajo' | 'Medio' | 'Alto';
const ORD: Nivel[] = ['Bajo', 'Medio', 'Alto'];
const sube = (a: Nivel, b: Nivel): Nivel => (ORD.indexOf(b) > ORD.indexOf(a) ? b : a);

export function riesgoPropuesto(r: Reporte): { nivel: Nivel; motivos: string[] } | null {
  const c = calcular(r), motivos: string[] = [];
  const tot = (['HI', 'CORONA', 'HD'] as const).map(z => c.zonas[z].total).filter((x): x is number => x != null);
  const qs = (['HI', 'CORONA', 'HD'] as const).map(z => c.zonas[z].q).filter((x): x is number => x != null);
  if (!tot.length && !qs.length) return null;
  let n: Nivel = 'Bajo';
  if (tot.length) {
    const m = Math.min(...tot);
    const nv: Nivel = m < 45 ? 'Alto' : m < 57 ? 'Medio' : 'Bajo';
    n = sube(n, nv); motivos.push(`RMR mínimo ${m} (${m < 36 ? 'tipo V' : m < 45 ? 'tipo IV' : m < 57 ? 'tipo III-B' : m < 66 ? 'tipo III-A' : 'tipo I/II'})`);
  }
  if (qs.length) {
    const q = Math.min(...qs);
    if (q < 1) { n = sube(n, 'Alto'); motivos.push(`Q ${q} (roca mala)`); } else if (q < 4) { n = sube(n, 'Medio'); motivos.push(`Q ${q} (roca regular)`); }
  }
  const fallas = r.familias.filter(f => f.abrev === 'F');
  if (fallas.length) {
    const gruesa = fallas.some(f => (f.potencia ?? 0) >= 0.1);
    n = sube(n, gruesa ? 'Alto' : 'Medio'); motivos.push(gruesa ? 'falla con potencia ≥ 0.10 m' : 'presencia de falla');
  }
  const aguaMala = (['HI', 'CORONA', 'HD'] as const).some(z => (r.rmr[z].agua ?? 15) <= 4);
  if (aguaMala) { n = sube(n, 'Alto'); motivos.push('goteo o flujo de agua'); }
  const so = Object.values(r.sobreexc ?? {}).filter((x): x is number => x != null);
  if (so.some(x => x >= 0.3)) { n = sube(n, 'Medio'); motivos.push(`sobreexcavación de ${Math.max(...so).toFixed(2)} m (mala voladura)`); }
  const cs = cunas(r), p = pernoInfo((r.sostenimiento ?? []).join(' ')), e = espesorShotcrete((r.sostenimiento ?? []).join('\n'));
  for (const k of cs) {
    if (k.peso < 1) continue;
    const rg = riesgoCuna(k, p, e);
    const donde = k.zona === 'CORONA' ? 'corona' : k.zona === 'HD' ? 'H.D.' : 'H.I.';
    if (k.zona === 'CORONA') { n = sube(n, 'Alto'); motivos.push(`cuña en ${donde} de ${k.peso.toFixed(1)} t/m que cae sin sostener${p ? ` (con el sostenimiento indicado: FS ${rg.fs.toFixed(1)})` : ''}`); }
    else { n = sube(n, 'Medio'); motivos.push(`cuña en ${donde} de ${k.peso.toFixed(1)} t/m`); }
    if (p && rg.nivel !== 'BAJO') motivos.push(`el sostenimiento indicado no basta para la cuña en ${donde} (FS ${rg.fs.toFixed(1)})`);
  }
  return { nivel: n, motivos };
}

/** Lleva el nivel propuesto a la opción equivalente de la lista del usuario (p. ej. sin "Bajo" → la más baja). */
export function enLista(n: Nivel, opciones: string[]): string | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const exacta = opciones.find(o => norm(o) === norm(n)); if (exacta) return exacta;
  const orden = ['bajo', 'medio', 'alto'], i = orden.indexOf(norm(n));
  const disp = opciones.map(o => ({ o, k: orden.indexOf(norm(o)) })).filter(x => x.k >= 0).sort((a, b) => Math.abs(a.k - i) - Math.abs(b.k - i) || b.k - a.k);
  return disp[0]?.o ?? null;
}

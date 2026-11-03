// Estilo de anotación de las fotos como las hace el geomecánico: trazas amarillas para diaclasas (D1, D2…),
// rojas para fallas (F1…), y un rótulo blanco "D1:55°/350°" sobre la traza más larga de cada familia.
import type { Familia } from '../model';

export interface Etiqueta { texto: string; color: string }
const COLOR: Record<string, string> = { SD: '#FFE600', F: '#FF2A2A', V: '#FF8A00', C: '#00D8FF' };
const NOMBRE: Record<string, string> = { SD: 'D' };

export function etiquetas(fams: Familia[]): Etiqueta[] {
  const n: Record<string, number> = {};
  return fams.map(f => {
    const base = NOMBRE[f.abrev] ?? f.abrev;
    n[base] = (n[base] ?? 0) + 1;
    const nombre = `${base}${n[base]}`;
    const medida = f.dip != null && f.dipdir != null ? `:${Math.round(f.dip)}°/${String(Math.round(f.dipdir)).padStart(3, '0')}°` : '';
    return { texto: nombre + medida, color: COLOR[f.abrev] ?? '#FFE600' };
  });
}
export const colorFamilia = (fams: Familia[], i: number) => etiquetas(fams)[i]?.color ?? ['#FFE600', '#00e5ff', '#ff4fd8', '#7CFF4F', '#ff8a00'][i % 5]!;
export const textoFamilia = (fams: Familia[], i: number) => etiquetas(fams)[i]?.texto ?? `Familia ${i + 1}`;

type Seg = { x1: number; y1: number; x2: number; y2: number; largo: number; familia: number; pts?: [number, number][] };

/** Dónde va el rótulo de cada familia: centro de su traza más larga, girado como la traza (siempre legible). */
export function rotulos(segs: Seg[]): { familia: number; x: number; y: number; ang: number }[] {
  const mejor = new Map<number, Seg>();
  for (const s of segs) if (s.familia >= 0 && (!mejor.get(s.familia) || s.largo > mejor.get(s.familia)!.largo)) mejor.set(s.familia, s);
  return [...mejor.values()].map(s => {
    let ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const p: [number, number] = s.pts && s.pts.length > 2 ? s.pts[Math.floor(s.pts.length / 2)]! : [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
    return { familia: s.familia, x: p[0], y: p[1], ang: s.pts && s.pts.length > 2 ? 0 : ang };
  });
}

/** Simplifica un trazo a mano: si es casi recto, queda como segmento; si es curvo (arco), se guardan los puntos. */
export function simplificar(pts: [number, number][]): [number, number][] | undefined {
  if (pts.length < 3) return undefined;
  const [a, b] = [pts[0]!, pts[pts.length - 1]!];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dev = Math.max(...pts.map(([x, y]) => Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / L));
  if (dev < Math.max(6, L * 0.05)) return undefined;
  const out: [number, number][] = [pts[0]!];
  for (const p of pts) { const q = out[out.length - 1]!; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 6) out.push(p); }
  if (out[out.length - 1] !== b) out.push(b);
  return out;
}

/** Para el reporte: alarga las trazas rectas (sin mover su centro ni su rumbo) hasta al menos `frac` de la
 *  diagonal de la foto, recortadas al borde, como las trazas largas de las fichas VG. La traza guardada no cambia. */
export function alargar<S extends Seg>(segs: S[], w: number, h: number, frac = 0.5): S[] {
  const objetivo = Math.hypot(w, h) * frac;
  return segs.map(s => {
    if (s.pts && s.pts.length > 2) return s;
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); if (L < 1 || L >= objetivo) return s;
    const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    // cuánto se puede avanzar desde el centro, en cada sentido, sin salir de la foto
    const hasta = (sg: number) => { let t = Infinity; const dx = ux * sg, dy = uy * sg;
      if (dx > 1e-9) t = Math.min(t, (w - cx) / dx); if (dx < -1e-9) t = Math.min(t, -cx / dx);
      if (dy > 1e-9) t = Math.min(t, (h - cy) / dy); if (dy < -1e-9) t = Math.min(t, -cy / dy); return Math.max(0, t); };
    const m = objetivo / 2, t1 = Math.min(m, hasta(1)), t0 = Math.min(m, hasta(-1));
    const a: [number, number] = [cx - ux * Math.max(t0, L / 2), cy - uy * Math.max(t0, L / 2)], b: [number, number] = [cx + ux * Math.max(t1, L / 2), cy + uy * Math.max(t1, L / 2)];
    return { ...s, x1: a[0], y1: a[1], x2: b[0], y2: b[1], largo: Math.hypot(b[0] - a[0], b[1] - a[1]), pts: undefined };
  });
}

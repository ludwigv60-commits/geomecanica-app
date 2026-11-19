// ESCENA 3D de la labor ANTES DEL DESATADO (sin sostenimiento): el último avance (Desde → Hasta) con su
// contorno real, las cuñas potenciales proyectadas a lo largo del avance, las trazas de cada familia sobre la
// excavación y el frente, las fallas / vetas / contactos como planos y la zona de influencia del tipo de roca.
//
// Las cuñas a lo largo del avance salen del MISMO análisis 2D de la sección (cunas2d), repetido en varias
// secciones entre el frente y el Desde: cada plano de diaclasa se corre en cada sección según su orientación
// respecto al eje de la labor (c(s) = c0 + σ·nu/proy·s), así que la red de bloques es la misma red 3D de planos
// cortada sección por sección. Cada cuña de una sección se extiende medio tramo hacia adelante y hacia atrás
// siguiendo la línea de intersección de sus caras, de modo que una misma cuña queda continua de tramo en tramo.
//
// Ejes de la escena (m): X a la derecha mirando el frente, Y hacia arriba (piso = 0), Z hacia atrás (frente = 0,
// Desde = avance). Este módulo no depende de three.js (se prueba en node); render3d.ts lo dibuja.
import type { Reporte } from '../model';
import { analizarCunas, planoLocal, colorFam, COLOR_CAE, COLOR_RIESGO, type Bloque, type Nivel } from './cunas2d';
export { colorFam, COLOR_SD, COLOR_EST } from './cunas2d';
import { colorTipo, dentro, dd3, familiasMedidas, type Fam, type P, type RmrZonas } from './croquis';
import { rmrTotal, tipoRoca } from '../core/rmr';

export type V3 = [number, number, number];
export interface Malla3 { id: string; capa: Capa; pos: number[]; color: string; opac: number; brillo?: number; colores?: number[] }
export interface Linea3 { capa: Capa; pts: V3[]; color: string; ancho: number; trazos?: boolean; opac?: number }
export interface Rotulo3 { capa: Capa; p: V3; s: string; color: string; tam?: number; fondo?: string }
export type Capa = 'labor' | 'frente' | 'cunas' | 'diaclasas' | 'fallas' | 'influencia' | 'anterior' | 'piso';
export interface Escena3 {
  mallas: Malla3[]; lineas: Linea3[]; rotulos: Rotulo3[];
  B: number; H: number; L: number; Lant: number; centro: V3; radio: number; norte: [number, number];
  conteo: Record<Nivel | 'CAE', number>; volCae: number; volTotal: number; pesoCae: number; tramos: number;
  familias: { n: number; abrev: string; texto: string; color: string }[];
  tipo: string | null; zi: { pct: number; tipo: string } | null;
}

const GAMMA = 2.7;
const rgb = (h: string): [number, number, number] => { const x = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255) as [number, number, number]; };
/** Ruido de valor 3D suave (0–1) para la textura de la roca. */
function ruido(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi), l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const colorBloque = (b: Bloque) => (b.cae && !b.desatada ? COLOR_CAE : COLOR_RIESGO[b.riesgo0]);

/** Triangulación por orejas de un polígono simple (índices). */
export function triangular(pol: P[]): number[] {
  const n = pol.length; if (n < 3) return [];
  const ar = pol.reduce((a, p, i) => { const q = pol[(i + 1) % n]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const idx = Array.from({ length: n }, (_, i) => i); if (ar < 0) idx.reverse();
  const out: number[] = [], cr = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const enTri = (p: P, a: P, b: P, c: P) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let corto = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length]!, i1 = idx[i]!, i2 = idx[(i + 1) % idx.length]!;
      const a = pol[i0]!, b = pol[i1]!, c = pol[i2]!;
      if (cr(a, b, c) <= 1e-12) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && enTri(pol[j]!, a, b, c))) continue;
      out.push(i0, i1, i2); idx.splice(i, 1); corto = true; break;
    }
    if (!corto) break; // polígono degenerado: se cierra en abanico
  }
  if (idx.length >= 3) for (let i = 1; i + 1 < idx.length; i++) out.push(idx[0]!, idx[i]!, idx[i + 1]!);
  return out;
}

/** Polígono de la cuña pegado al contorno: los puntos de la envolvente que caen dentro de la excavación se
 *  llevan al punto más cercano del contorno (la base de la cuña sigue la roca, no la cuerda). */
function pegar(pol: P[], real: P[]): P[] {
  const fino: P[] = [];
  pol.forEach((p, i) => {
    const q = pol[(i + 1) % pol.length]!, n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.06));
    for (let k = 0; k < n; k++) fino.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  });
  const out = fino.map(p => {
    if (!dentro(p, real)) return p;
    let m = real[0]!, dm = Infinity;
    for (const c of real) { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < dm) { dm = d; m = c; } }
    return m;
  });
  // sin puntos repetidos y a lo más ~48 vértices
  const lim: P[] = [];
  for (const p of out) { const u = lim[lim.length - 1]; if (!u || Math.hypot(u[0] - p[0], u[1] - p[1]) > 0.012) lim.push(p); }
  const paso = Math.max(1, Math.ceil(lim.length / 48));
  return lim.filter((_, i) => i % paso === 0);
}

/** Polígono del plano a·x + b·y + nu·s = K (s hacia el avance) dentro de la caja de la escena. */
function planoEnCaja(a: number, b: number, nu: number, K: number, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number): V3[] {
  const vs: [number, number, number][] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const s of [s0, s1]) vs.push([x, y, s]);
  const f = (v: [number, number, number]) => a * v[0] + b * v[1] + nu * v[2] - K;
  const aristas: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const pts: [number, number, number][] = [];
  for (const [i, j] of aristas) {
    const fi = f(vs[i]!), fj = f(vs[j]!);
    if ((fi < 0) !== (fj < 0)) { const t = fi / (fi - fj); pts.push(vs[i]!.map((c, k) => c + (vs[j]![k]! - c) * t) as [number, number, number]); }
  }
  if (pts.length < 3) return [];
  const c = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length] as [number, number, number], [0, 0, 0]);
  // ejes en el plano para ordenar por ángulo
  const N = [a, b, nu], u0 = Math.abs(N[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = [N[1]! * u0[2]! - N[2]! * u0[1]!, N[2]! * u0[0]! - N[0]! * u0[2]!, N[0]! * u0[1]! - N[1]! * u0[0]!];
  const e2 = [N[1]! * e1[2]! - N[2]! * e1[1]!, N[2]! * e1[0]! - N[0]! * e1[2]!, N[0]! * e1[1]! - N[1]! * e1[0]!];
  const ang = (p: number[]) => { const d = [p[0]! - c[0], p[1]! - c[1], p[2]! - c[2]]; return Math.atan2(d[0]! * e2[0]! + d[1]! * e2[1]! + d[2]! * e2[2]!, d[0]! * e1[0]! + d[1]! * e1[1]! + d[2]! * e1[2]!); };
  return pts.sort((p, q) => ang(p) - ang(q)).map(p => [p[0], p[1], -p[2]] as V3);
}

/** Desplazamiento (m por m de avance hacia adelante) de una cuña en la sección: la línea de intersección de sus caras. */
function corrimiento(fs: { n: P; k: number }[]): P {
  // cada cara: n·δ = −k  (k = σ·nu/proy, cuánto se corre la traza por metro)
  if (!fs.length) return [0, 0];
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const f of fs) { a11 += f.n[0] * f.n[0]; a12 += f.n[0] * f.n[1]; a22 += f.n[1] * f.n[1]; b1 -= f.n[0] * f.k; b2 -= f.n[1] * f.k; }
  const det = a11 * a22 - a12 * a12;
  let d: P;
  if (Math.abs(det) < 0.02) { const f = fs[0]!; d = [-f.n[0] * f.k, -f.n[1] * f.k]; }
  else d = [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det];
  const m = Math.hypot(...d); return m > 1.5 ? [(d[0] * 1.5) / m, (d[1] * 1.5) / m] : d;
}

export function escena3d(r: Reporte, rmr: RmrZonas, opc: { tramos?: number } = {}): Escena3 | null {
  if (!r.ancho || !r.alto || r.azimut == null) return null;
  const a0 = analizarCunas(r, { ubicar: false }); if (!a0) return null;
  const B = r.ancho, H = r.alto, az = r.azimut, fams = familiasMedidas(r);
  const L = Math.min(12, Math.max(0.8, r.avance ?? 3)), Lant = Math.min(7, Math.max(3, B * 1.1));
  const real = a0.real, nor = a0.nor;
  const mallas: Malla3[] = [], lineas: Linea3[] = [], rotulos: Rotulo3[] = [];
  const P3 = (p: P, z: number, haciaDentro = 0, i = -1): V3 => (i >= 0 ? [p[0] - nor[i]![0] * haciaDentro, p[1] - nor[i]![1] * haciaDentro, z] : [p[0], p[1], z]);
  const tri = (pos: number[], a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
  const v = rmrTotal(r.rmr.CORONA, r.ajuste.CORONA), tipo = v != null ? tipoRoca(v) : r.tipoGeologo ?? null;
  const cRoca = colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD);

  // ---- excavación del último avance (contorno real, sin sostenimiento) ----
  {
    // pared de roca: color del tipo de roca de cada zona (H.I., corona, H.D.) con textura de roca (ruido)
    const pos: number[] = [], col: number[] = [], nz = Math.max(6, Math.round(L / 0.2));
    const cz = { HI: rgb(colorTipo(rmr.HI ?? rmr.CORONA)), CORONA: rgb(colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD)), HD: rgb(colorTipo(rmr.HD ?? rmr.CORONA)) };
    const zonaDe = (p: P) => (p[1] > H * 0.62 && Math.abs(p[0]) < B * 0.42 ? cz.CORONA : p[0] < 0 ? cz.HI : cz.HD);
    const vtx = (p: P, z: number) => { pos.push(p[0], p[1], z); const k = 0.72 + 0.42 * ruido(p[0] * 2.3, p[1] * 2.3, z * 2.3) + 0.12 * ruido(p[0] * 9, p[1] * 9, z * 9) - 0.06; const c = zonaDe(p); col.push(c[0] * k, c[1] * k, c[2] * k); };
    for (let i = 0; i + 1 < real.length; i++) for (let j = 0; j < nz; j++) {
      const p = real[i]!, q = real[i + 1]!, z0 = (L * j) / nz, z1 = (L * (j + 1)) / nz;
      vtx(p, z0); vtx(q, z0); vtx(q, z1); vtx(p, z0); vtx(q, z1); vtx(p, z1);
    }
    mallas.push({ id: 'pared', capa: 'labor', pos, color: '#FFFFFF', opac: 0.8, colores: col });
    const piso: number[] = [], x0 = real[0]![0], x1 = real.at(-1)![0];
    tri(piso, [x0, 0, 0], [x1, 0, 0], [x1, 0, L]); tri(piso, [x0, 0, 0], [x1, 0, L], [x0, 0, L]);
    mallas.push({ id: 'piso', capa: 'labor', pos: piso, color: '#8C8478', opac: 0.55 });
    // frente: roca del color del tipo
    // frente: roca del color del tipo con textura (grilla fina recortada al contorno)
    const fr: number[] = [], fc: number[] = [], cf = rgb(cRoca), hx = 0.1, xa = Math.min(...real.map(p => p[0])), xb = Math.max(...real.map(p => p[0])), yb = Math.max(...real.map(p => p[1]));
    const fv = (x: number, y: number) => { fr.push(x, y, 0); const k = 0.74 + 0.4 * ruido(x * 2.3, y * 2.3, 0.5) + 0.12 * ruido(x * 9, y * 9, 3) - 0.06; fc.push(cf[0] * k, cf[1] * k, cf[2] * k); };
    for (let x = xa; x < xb - 1e-9; x += hx) for (let y = 0; y < yb - 1e-9; y += hx) {
      const x1 = Math.min(xb, x + hx), y1 = Math.min(yb, y + hx);
      if (!dentro([(x + x1) / 2, (y + y1) / 2], real)) continue;
      fv(x, y); fv(x1, y); fv(x1, y1); fv(x, y); fv(x1, y1); fv(x, y1);
    }
    mallas.push({ id: 'frente', capa: 'frente', pos: fr, color: '#FFFFFF', opac: 0.82, colores: fc });
    // contornos del frente y del Desde, y aristas del piso
    lineas.push({ capa: 'labor', pts: real.map(p => P3(p, -0.002)), color: '#111111', ancho: 2.4 });
    lineas.push({ capa: 'labor', pts: real.map(p => P3(p, L)), color: '#333333', ancho: 1.6 });
    for (const p of [real[0]!, real.at(-1)!, real[Math.floor(real.length / 2)]!]) lineas.push({ capa: 'labor', pts: [P3(p, 0), P3(p, L)], color: '#444444', ancho: 1 });
  }
  // ---- labor existente hacia atrás (fantasma) ----
  {
    const pos: number[] = [];
    for (let i = 0; i + 1 < real.length; i++) { const p = real[i]!, q = real[i + 1]!; tri(pos, P3(p, L), P3(q, L), P3(q, L + Lant)); tri(pos, P3(p, L), P3(q, L + Lant), P3(p, L + Lant)); }
    mallas.push({ id: 'anterior', capa: 'anterior', pos, color: '#9AA3AD', opac: 0.07 });
    lineas.push({ capa: 'anterior', pts: real.map(p => P3(p, L + Lant)), color: '#8A939C', ancho: 1, trazos: true });
    for (const p of [real[0]!, real.at(-1)!, real[Math.floor(real.length / 2)]!]) lineas.push({ capa: 'anterior', pts: [P3(p, L), P3(p, L + Lant)], color: '#8A939C', ancho: 1, trazos: true });
  }

  // ---- zona de influencia (corona: % del alto; hastiales: % del ancho) ----
  const zC = a0.zi?.corona ?? 0.6, zH = a0.zi?.hastial ?? 0.6;
  {
    const lim = real.map((p, i) => { const n = nor[i]!, d = n[1] > 0.5 ? zC : zH; return [p[0] + n[0] * d, p[1] + n[1] * d] as P; }).filter(p => p[1] > 0.02);
    for (const z of [0, L]) lineas.push({ capa: 'influencia', pts: lim.map(p => P3(p, z)), color: '#2F6FB3', ancho: 1.6, trazos: true });
    const pos: number[] = [];
    for (let i = 0; i + 1 < lim.length; i++) { const p = lim[i]!, q = lim[i + 1]!; tri(pos, P3(p, 0), P3(q, 0), P3(q, L)); tri(pos, P3(p, 0), P3(q, L), P3(p, L)); }
    mallas.push({ id: 'influencia', capa: 'influencia', pos, color: '#2F6FB3', opac: 0.06 });
    const tope = lim.reduce((m, p) => (p[1] > m[1] ? p : m), lim[0]!);
    if (a0.zi) rotulos.push({ capa: 'influencia', p: [tope[0], tope[1] + 0.35, L * 0.5], s: `Zona de influencia ${Math.round(a0.zi.pct * 100)} % (${a0.zi.tipo})`, color: '#1F4E8C', tam: 0.9 });
  }

  // ---- trazas de cada plano sobre la excavación y el frente ----
  const RED = new Map<number, { n: P; c: number[]; k: number; pl: ReturnType<typeof planoLocal>; proy: number }>();
  for (const l of a0.lineas) {
    const d: P = [l.b[0] - l.a[0], l.b[1] - l.a[1]], m = Math.hypot(...d) || 1, n: P = [-d[1] / m, d[0] / m], c = n[0] * l.a[0] + n[1] * l.a[1];
    const f = l.fam, e = RED.get(f.n);
    if (e) { e.c.push(e.n[0] * n[0] + e.n[1] * n[1] < 0 ? -c : c); continue; }
    const pl = planoLocal(f.dip, f.dipdir, az), proy = Math.sqrt(Math.max(1e-9, 1 - pl.nu * pl.nu)), sg = n[0] * pl.a + n[1] * pl.b >= 0 ? 1 : -1;
    RED.set(f.n, { n, c: [c], k: sg * pl.nu / proy, pl, proy });
  }
  const famsInfo: Escena3['familias'] = [];
  for (const f of fams) {
    const e = RED.get(f.n); if (!e) continue;
    const col = colorFam(fams, f), esSD = f.abrev === 'SD', capa: Capa = esSD ? 'diaclasas' : 'fallas';
    famsInfo.push({ n: f.n, abrev: f.abrev, color: col, texto: `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${f.potencia ? ` · pot. ${f.potencia} m` : ''}${esSD && a0.esp[f.n] ? ` · esp. ${a0.esp[f.n]!.s} m` : ''}` });
    // planos: en la sección a s (≤ 0) la traza es n·p = c − k·s  →  sobre el punto p del contorno, s = (c − n·p)/k
    let cs = [...e.c].sort((x, y) => x - y);
    if (esSD) { // toda la red de planos que corta la excavación entre el frente y el Desde
      const base = cs[0]!, paso = cs.length >= 2 ? (cs.at(-1)! - base) / (cs.length - 1) : a0.esp[f.n]?.s2d ?? 0.5;
      const np = real.map(p => e.n[0] * p[0] + e.n[1] * p[1]), ext = Math.abs(e.k) * L;
      const k0 = Math.ceil((Math.min(...np) - ext - base) / paso), k1 = Math.floor((Math.max(...np) + ext - base) / paso);
      cs = []; for (let k = k0; k <= k1 && cs.length < 160; k++) cs.push(base + k * paso);
    }
    const ancho = esSD ? 1.5 : 3.6;
    for (const c of cs) {
      // sobre la pared
      if (Math.abs(e.k) < 0.02) { // plano paralelo al eje: traza recta a lo largo de la labor
        for (let i = 0; i + 1 < real.length; i++) {
          const g0 = e.n[0] * real[i]![0] + e.n[1] * real[i]![1] - c, g1 = e.n[0] * real[i + 1]![0] + e.n[1] * real[i + 1]![1] - c;
          if ((g0 < 0) !== (g1 < 0)) { const t = g0 / (g0 - g1), p: P = [real[i]![0] + (real[i + 1]![0] - real[i]![0]) * t, real[i]![1] + (real[i + 1]![1] - real[i]![1]) * t]; lineas.push({ capa, pts: [P3(p, 0, -0.015, i), P3(p, L, -0.015, i)], color: col, ancho }); }
        }
      } else {
        let tramo: V3[] = [];
        const corta = () => { if (tramo.length > 1) lineas.push({ capa, pts: tramo, color: col, ancho }); tramo = []; };
        for (let i = 0; i < real.length; i++) {
          const s = (c - (e.n[0] * real[i]![0] + e.n[1] * real[i]![1])) / e.k;
          if (s <= 0 && s >= -L) {
            if (!tramo.length && i > 0) { // entra: punto en el borde
              const sp = (c - (e.n[0] * real[i - 1]![0] + e.n[1] * real[i - 1]![1])) / e.k, sb = sp > 0 ? 0 : -L, t = (sb - sp) / (s - sp);
              const p: P = [real[i - 1]![0] + (real[i]![0] - real[i - 1]![0]) * t, real[i - 1]![1] + (real[i]![1] - real[i - 1]![1]) * t]; tramo.push(P3(p, -sb, -0.015, i));
            }
            tramo.push(P3(real[i]!, -s, -0.015, i));
          } else if (tramo.length) {
            const sp = (c - (e.n[0] * real[i - 1]![0] + e.n[1] * real[i - 1]![1])) / e.k, sb = s > 0 ? 0 : -L, t = (sb - sp) / (s - sp);
            const p: P = [real[i - 1]![0] + (real[i]![0] - real[i - 1]![0]) * t, real[i - 1]![1] + (real[i]![1] - real[i - 1]![1]) * t]; tramo.push(P3(p, -sb, -0.015, i)); corta();
          }
        }
        corta();
      }
      // sobre el frente (s = 0): n·p = c dentro del contorno
      const d: P = [e.n[1], -e.n[0]], o: P = [e.n[0] * c, e.n[1] * c], Rr = Math.max(B, H) * 1.6, pts: P[] = [];
      for (let k = 0; k <= 160; k++) { const t = -Rr + (2 * Rr * k) / 160, p: P = [o[0] + d[0] * t, o[1] + d[1] * t]; pts.push(p); }
      let seg: V3[] = [];
      for (const p of pts) { if (dentro(p, real)) seg.push([p[0], p[1], -0.008]); else { if (seg.length > 1) lineas.push({ capa, pts: seg, color: col, ancho: ancho * (esSD ? 0.6 : 0.9), opac: esSD ? 0.75 : 1 }); seg = []; } }
      if (seg.length > 1) lineas.push({ capa, pts: seg, color: col, ancho: ancho * (esSD ? 0.6 : 0.9), opac: esSD ? 0.75 : 1 });
    }
    // fallas, vetas y contactos: el plano entero (con su potencia) cortando la labor
    if (!esSD) {
      const K0 = cs[0]! * e.proy, x0 = -(B / 2 + zH + 0.6), x1 = B / 2 + zH + 0.6, y1 = H + zC + 0.6;
      const N = { a: e.n[0] * e.proy, b: e.n[1] * e.proy, nu: e.k * e.proy };
      const w = f.potencia && f.potencia >= 0.04 ? f.potencia / 2 : 0;
      for (const dd of w ? [-w, w] : [0]) {
        const pol = planoEnCaja(N.a, N.b, N.nu, K0 + dd, x0, x1, 0, y1, -(L + Lant * 0.45), 0.9);
        if (pol.length < 3) continue;
        const pos: number[] = []; for (let i = 1; i + 1 < pol.length; i++) tri(pos, pol[0]!, pol[i]!, pol[i + 1]!);
        mallas.push({ id: `plano${f.n}${dd}`, capa: 'fallas', pos, color: col, opac: w ? 0.11 : 0.15 });
        lineas.push({ capa: 'fallas', pts: [...pol, pol[0]!], color: col, ancho: 1.4, opac: 0.8 });
      }
      // rótulo: el punto del plano más cercano a la corona del avance (donde afecta a la labor)
      const q = [B * 0.15, H + zC + 0.5, -L * 0.5], dq = N.a * q[0]! + N.b * q[1]! + N.nu * q[2]! - K0;
      const pq: V3 = [q[0]! - N.a * dq, q[1]! - N.b * dq, -(q[2]! - N.nu * dq)];
      if (Math.abs(pq[0]) < x1 + 1 && pq[1] > 0 && pq[1] < y1 + 1.5 && pq[2] > -2 && pq[2] < L + Lant) rotulos.push({ capa: 'fallas', p: [pq[0], Math.max(pq[1], H * 0.7) + 0.3, pq[2]], s: famsInfo.at(-1)!.texto, color: col, tam: 0.85, fondo: '#FFFFFF' });
    }
  }

  // ---- cuñas a lo largo del avance: bloques 3D reales ----
  // Cada familia es una red de planos paralelos g = n·p − k·z = c (los mismos de las secciones). Una cuña es la
  // celda que dejan esos planos (un poliedro convexo con caras planas sobre las fracturas), pegada a la pared y
  // dentro de la zona de influencia. El análisis 2D de cada sección dice qué celdas son cuñas y su riesgo: la
  // misma celda vista en varias secciones es UNA sola cuña, que se dibuja una vez con su forma completa.
  const nT = opc.tramos ?? Math.min(14, Math.max(4, Math.round(L / 0.32))), dz = L / nT;
  const conteo: Escena3['conteo'] = { CAE: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
  let volCae = 0, volTotal = 0;
  const porColor = new Map<string, { pos: number[]; col: number[] }>(), bordes: Linea3[] = [];
  const ext = B + H + L + 6;
  const F3 = [...RED.entries()].map(([n, e]) => {
    const m: V3 = [e.n[0], e.n[1], -e.k];
    let cs = [...e.c].sort((x, y) => x - y);
    if (fams.find(f => f.n === n)?.abrev === 'SD' && cs.length) {
      const base = cs[0]!, paso = cs.length >= 2 ? (cs.at(-1)! - base) / (cs.length - 1) : a0.esp[n]?.s2d ?? 0.5;
      const lim = ext * (1 + Math.abs(e.k)); cs = [];
      for (let k = Math.ceil((-lim - base) / paso); base + k * paso <= lim && cs.length < 600; k++) cs.push(base + k * paso);
    }
    return { n, m, cs };
  });
  const celda = (p: V3) => F3.map(f => { const g = f.m[0] * p[0] + f.m[1] * p[1] + f.m[2] * p[2]; let i = 0; while (i < f.cs.length && f.cs[i]! <= g) i++; return i; });
  const celdas = new Map<string, { idx: number[]; peor: Bloque; pc: V3; prof: number }>();
  const rango = (b: Bloque) => (b.cae && !b.desatada ? 0 : b.riesgo0 === 'ALTO' ? 1 : b.riesgo0 === 'MEDIO' ? 2 : 3);
  for (let t = 0; t < nT; t++) {
    const sSec = dz * (t + 0.5), an = analizarCunas(r, { sSec, ubicar: false, rapido: true });
    if (!an) continue;
    for (const b of an.bloques) {
      const vol = b.area * dz; volTotal += vol;
      if (b.cae && !b.desatada) { volCae += vol; conteo.CAE++; } else conteo[b.riesgo0]++;
      if (b.area < 0.002) continue; // astillas menores a ~4 × 4 cm: no se dibujan
      const pc: V3 = [b.pol.reduce((s, p) => s + p[0], 0) / b.pol.length, b.pol.reduce((s, p) => s + p[1], 0) / b.pol.length, sSec];
      const idx = celda(pc), key = idx.join(','), u = celdas.get(key);
      if (!u) celdas.set(key, { idx, peor: b, pc, prof: b.prof }); else { if (rango(b) < rango(u.peor)) u.peor = b; u.prof = Math.max(u.prof, b.prof); }
    }
  }
  // poliedro convexo: caja recortada por semiespacios m·p ≤ d
  type Cara = V3[];
  const recortar = (caras: Cara[], m: V3, d: number): Cara[] => {
    const out: Cara[] = [], tapa: V3[] = [], f = (p: V3) => m[0] * p[0] + m[1] * p[1] + m[2] * p[2] - d;
    for (const cara of caras) {
      const nueva: V3[] = [];
      for (let i = 0; i < cara.length; i++) {
        const a = cara[i]!, b = cara[(i + 1) % cara.length]!, fa = f(a), fb = f(b);
        if (fa <= 0) nueva.push(a);
        if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb), q: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; nueva.push(q); tapa.push(q); }
        else if (Math.abs(fa) < 1e-9) tapa.push(a);
      }
      if (nueva.length >= 3) out.push(nueva);
    }
    if (tapa.length >= 3) {
      const cc = tapa.reduce((s, p) => [s[0] + p[0] / tapa.length, s[1] + p[1] / tapa.length, s[2] + p[2] / tapa.length] as V3, [0, 0, 0] as V3);
      const u0: V3 = Math.abs(m[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1: V3 = [m[1] * u0[2] - m[2] * u0[1], m[2] * u0[0] - m[0] * u0[2], m[0] * u0[1] - m[1] * u0[0]];
      const e2: V3 = [m[1] * e1[2] - m[2] * e1[1], m[2] * e1[0] - m[0] * e1[2], m[0] * e1[1] - m[1] * e1[0]];
      const ang = (p: V3) => { const v = [p[0] - cc[0], p[1] - cc[1], p[2] - cc[2]]; return Math.atan2(v[0]! * e2[0] + v[1]! * e2[1] + v[2]! * e2[2], v[0]! * e1[0] + v[1]! * e1[1] + v[2]! * e1[2]); };
      const ord = tapa.sort((p, q) => ang(p) - ang(q)).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1], p[2] - a[i - 1]![2]) > 1e-6);
      if (ord.length >= 3) out.push(ord);
    }
    return out;
  };
  const caja = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Cara[] => {
    const v = (i: number): V3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    return [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]].map(q => q.map(v));
  };
  const alPared = (p: P) => { let m = 0, dm = Infinity; real.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < dm) { dm = d; m = i; } }); return m; };
  for (const { idx, peor, pc, prof } of celdas.values()) {
    let caras = caja(-(B / 2 + zH + 1), B / 2 + zH + 1, 0, H + zC + 1, 0, L);
    F3.forEach((f, j) => {
      const i = idx[j]!;
      if (i > 0) caras = recortar(caras, [-f.m[0], -f.m[1], -f.m[2]], -f.cs[i - 1]!);
      if (i < f.cs.length) caras = recortar(caras, f.m, f.cs[i]!);
    });
    // fuera de la excavación y dentro de la zona de influencia (planos tangentes a la pared junto a la cuña)
    const iw = alPared([pc[0], pc[1]]), w = real[iw]!, nw = nor[iw]!, dI = nw[1] > 0.5 ? zC : zH;
    caras = recortar(caras, [-nw[0], -nw[1], 0], -(nw[0] * w[0] + nw[1] * w[1]) - 0.004);
    // altura de la cuña: la que da el análisis de las secciones (sin astillas largas que el análisis no ve)
    caras = recortar(caras, [nw[0], nw[1], 0], nw[0] * w[0] + nw[1] * w[1] + Math.min(dI * 1.6, Math.max(0.06, prof * 1.15)));
    if (caras.length < 4) continue;
    // cada bloque se separa ~2 cm de sus vecinos (se lee cada cuña con sus fracturas abiertas)
    const todos = caras.flat(), cg = todos.reduce((s, p) => [s[0] + p[0] / todos.length, s[1] + p[1] / todos.length, s[2] + p[2] / todos.length] as V3, [0, 0, 0] as V3);
    caras = caras.map(cf => cf.map(p => { const d = Math.hypot(p[0] - cg[0], p[1] - cg[1], p[2] - cg[2]), f = 1 - Math.min(0.15, 0.022 / Math.max(d, 1e-6)); return [cg[0] + (p[0] - cg[0]) * f, cg[1] + (p[1] - cg[1]) * f, cg[2] + (p[2] - cg[2]) * f] as V3; }));
    const col = colorBloque(peor), g = porColor.get(col) ?? { pos: [], col: [] }; porColor.set(col, g);
    // color del riesgo con textura de roca: cada bloque un poco distinto y cada cara con su veteado
    const base = rgb(col), kb = 0.86 + 0.28 * ruido(cg[0] * 3.1 + 7, cg[1] * 3.1, cg[2] * 3.1);
    const vtx = (p: V3) => { g.pos.push(...p); const k = kb * (0.84 + 0.32 * ruido(p[0] * 7, p[1] * 7, p[2] * 7)); g.col.push(base[0] * k, base[1] * k, base[2] * k); };
    for (const cara of caras) for (let i = 1; i + 1 < cara.length; i++) { vtx(cara[0]!); vtx(cara[i]!); vtx(cara[i + 1]!); }
    // contorno de la cuña sobre el frente
    const enFrente = caras.find(cf => cf.every(p => p[2] < 0.03));
    if (enFrente) bordes.push({ capa: 'cunas', pts: [...enFrente, enFrente[0]!].map(p => [p[0], p[1], -0.004] as V3), color: '#2B1B12', ancho: 1.1 });
  }
  porColor.forEach((g, col) => mallas.push({ id: `cunas${col}`, capa: 'cunas', pos: g.pos, colores: g.col, color: '#FFFFFF', opac: 0.97, brillo: 0 }));
  lineas.push(...bordes);

  // ---- rótulos de la labor ----
  const pkTxt = (s: string) => (s ? s : '—');
  rotulos.push({ capa: 'labor', p: [B * 0.2, H + zC + 0.45, -0.05], s: `FRENTE · Hasta ${pkTxt(r.hasta)}`, color: '#0D2A6B', tam: 0.85, fondo: '#FFFFFF' });
  rotulos.push({ capa: 'labor', p: [-B * 0.25, H + zC + 0.2, L], s: `Desde ${pkTxt(r.desde)}`, color: '#0D2A6B', tam: 0.8, fondo: '#FFFFFF' });
  // cota del avance sobre el piso, al costado derecho
  const xc = B / 2 + zH + 0.55;
  lineas.push({ capa: 'piso', pts: [[xc, 0.02, 0], [xc, 0.02, L]], color: '#0D2A6B', ancho: 2 });
  for (const z of [0, L]) lineas.push({ capa: 'piso', pts: [[xc - 0.25, 0.02, z], [xc + 0.25, 0.02, z]], color: '#0D2A6B', ancho: 2 });
  rotulos.push({ capa: 'piso', p: [xc + 0.35, 0.25, L / 2], s: `Avance ${L.toFixed(1)} m`, color: '#0D2A6B', tam: 0.9, fondo: '#FFFFFF' });
  rotulos.push({ capa: 'labor', p: [-(B / 2 + zH + 0.5), H * 0.5, 0], s: `${B} × ${H} m`, color: '#333333', tam: 0.8 });
  if (tipo) rotulos.push({ capa: 'labor', p: [-(B / 2) - 0.2, H * 0.35, L * 0.55], s: `Roca ${tipo}${v != null ? ` · RMR ${Math.round(v)}` : ''}`, color: '#5A3A12', tam: 0.8, fondo: '#FFFFFF' });
  // piso: grilla de 1 m y norte
  const gx = Math.ceil(B / 2 + zH + 2.2);
  for (let x = -gx; x <= gx; x++) lineas.push({ capa: 'piso', pts: [[x, 0, -2], [x, 0, L + Lant]], color: '#9AA0A6', ancho: 0.6, opac: 0.35 });
  for (let z = -2; z <= Math.ceil(L + Lant); z++) lineas.push({ capa: 'piso', pts: [[-gx, 0, z], [gx, 0, z]], color: '#9AA0A6', ancho: 0.6, opac: 0.35 });
  const norte: [number, number] = [-Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)]; // (X, Z) del norte
  {
    const c: V3 = [-(B / 2 + zH + 1.2), 0.03, -1.1], s = 0.75, nx = norte[0], nz = norte[1], ox = -nz, oz = nx;
    const pos: number[] = [];
    tri(pos, [c[0] + nx * s, c[1], c[2] + nz * s], [c[0] - nx * s * 0.6 + ox * s * 0.45, c[1], c[2] - nz * s * 0.6 + oz * s * 0.45], [c[0], c[1], c[2]]);
    tri(pos, [c[0] + nx * s, c[1], c[2] + nz * s], [c[0], c[1], c[2]], [c[0] - nx * s * 0.6 - ox * s * 0.45, c[1], c[2] - nz * s * 0.6 - oz * s * 0.45]);
    mallas.push({ id: 'norte', capa: 'piso', pos, color: '#0D2A6B', opac: 1 });
    rotulos.push({ capa: 'piso', p: [c[0] + nx * s * 1.7, 0.3, c[2] + nz * s * 1.7], s: 'N', color: '#0D2A6B', tam: 1.1 });
  }
  const zi = a0.zi ? { pct: a0.zi.pct, tipo: a0.zi.tipo } : null;
  return {
    mallas, lineas, rotulos, B, H, L, Lant, centro: [0, H * 0.55, L * 0.5], radio: Math.hypot(B + 2 * zH, H + zC, L) * 0.62,
    norte, conteo, volCae, volTotal, pesoCae: volCae * GAMMA, tramos: nT, familias: famsInfo, tipo, zi,
  };
}

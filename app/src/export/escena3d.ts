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
import { analizarCunas, planoLocal, COLOR_CAE, COLOR_RIESGO, type Bloque, type Nivel } from './cunas2d';
import { colorTipo, dentro, dd3, familiasMedidas, type Fam, type P, type RmrZonas } from './croquis';
import { rmrTotal, tipoRoca } from '../core/rmr';

export type V3 = [number, number, number];
export interface Malla3 { id: string; capa: Capa; pos: number[]; color: string; opac: number; brillo?: number }
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
/** Colores por familia (sirven en fondo claro y oscuro). */
export const COLOR_SD = ['#D9A400', '#2E9BC6', '#8E5CC9', '#3FA45B', '#C8582F'];
export const COLOR_EST: Record<string, string> = { F: '#E0282E', V: '#F08A00', C: '#00A9C9' };
export function colorFam(fams: Fam[], f: Fam) {
  if (f.abrev !== 'SD') return COLOR_EST[f.abrev] ?? '#555555';
  return COLOR_SD[fams.filter(x => x.abrev === 'SD').indexOf(f) % COLOR_SD.length]!;
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
    const pos: number[] = [];
    for (let i = 0; i + 1 < real.length; i++) { const p = real[i]!, q = real[i + 1]!; tri(pos, P3(p, 0), P3(q, 0), P3(q, L)); tri(pos, P3(p, 0), P3(q, L), P3(p, L)); }
    mallas.push({ id: 'pared', capa: 'labor', pos, color: '#B9AE9F', opac: 0.2 });
    const piso: number[] = [], x0 = real[0]![0], x1 = real.at(-1)![0];
    tri(piso, [x0, 0, 0], [x1, 0, 0], [x1, 0, L]); tri(piso, [x0, 0, 0], [x1, 0, L], [x0, 0, L]);
    mallas.push({ id: 'piso', capa: 'labor', pos: piso, color: '#8C8478', opac: 0.55 });
    // frente: roca del color del tipo
    const fr: number[] = [], ids = triangular(real);
    for (let k = 0; k < ids.length; k += 3) tri(fr, P3(real[ids[k]!]!, 0), P3(real[ids[k + 1]!]!, 0), P3(real[ids[k + 2]!]!, 0));
    mallas.push({ id: 'frente', capa: 'frente', pos: fr, color: cRoca, opac: 0.62 });
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
          if ((g0 < 0) !== (g1 < 0)) { const t = g0 / (g0 - g1), p: P = [real[i]![0] + (real[i + 1]![0] - real[i]![0]) * t, real[i]![1] + (real[i + 1]![1] - real[i]![1]) * t]; lineas.push({ capa, pts: [P3(p, 0, 0.012, i), P3(p, L, 0.012, i)], color: col, ancho }); }
        }
      } else {
        let tramo: V3[] = [];
        const corta = () => { if (tramo.length > 1) lineas.push({ capa, pts: tramo, color: col, ancho }); tramo = []; };
        for (let i = 0; i < real.length; i++) {
          const s = (c - (e.n[0] * real[i]![0] + e.n[1] * real[i]![1])) / e.k;
          if (s <= 0 && s >= -L) {
            if (!tramo.length && i > 0) { // entra: punto en el borde
              const sp = (c - (e.n[0] * real[i - 1]![0] + e.n[1] * real[i - 1]![1])) / e.k, sb = sp > 0 ? 0 : -L, t = (sb - sp) / (s - sp);
              const p: P = [real[i - 1]![0] + (real[i]![0] - real[i - 1]![0]) * t, real[i - 1]![1] + (real[i]![1] - real[i - 1]![1]) * t]; tramo.push(P3(p, -sb, 0.012, i));
            }
            tramo.push(P3(real[i]!, -s, 0.012, i));
          } else if (tramo.length) {
            const sp = (c - (e.n[0] * real[i - 1]![0] + e.n[1] * real[i - 1]![1])) / e.k, sb = s > 0 ? 0 : -L, t = (sb - sp) / (s - sp);
            const p: P = [real[i - 1]![0] + (real[i]![0] - real[i - 1]![0]) * t, real[i - 1]![1] + (real[i]![1] - real[i - 1]![1]) * t]; tramo.push(P3(p, -sb, 0.012, i)); corta();
          }
        }
        corta();
      }
      // sobre el frente (s = 0): n·p = c dentro del contorno
      const d: P = [e.n[1], -e.n[0]], o: P = [e.n[0] * c, e.n[1] * c], Rr = Math.max(B, H) * 1.6, pts: P[] = [];
      for (let k = 0; k <= 160; k++) { const t = -Rr + (2 * Rr * k) / 160, p: P = [o[0] + d[0] * t, o[1] + d[1] * t]; pts.push(p); }
      let seg: V3[] = [];
      for (const p of pts) { if (dentro(p, real)) seg.push([p[0], p[1], -0.008]); else { if (seg.length > 1) lineas.push({ capa, pts: seg, color: col, ancho: ancho * 0.9 }); seg = []; } }
      if (seg.length > 1) lineas.push({ capa, pts: seg, color: col, ancho: ancho * 0.9 });
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

  // ---- cuñas a lo largo del avance ----
  const nT = opc.tramos ?? Math.min(14, Math.max(4, Math.round(L / 0.32))), dz = L / nT;
  const conteo: Escena3['conteo'] = { CAE: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
  let volCae = 0, volTotal = 0;
  const porColor = new Map<string, number[]>(), bordes: Linea3[] = [];
  const caraK = new Map<number, number>(); RED.forEach((e, n) => caraK.set(n, e.k));
  for (let t = 0; t < nT; t++) {
    const sSec = dz * (t + 0.5), an = analizarCunas(r, { sSec, ubicar: false, rapido: true });
    if (!an) continue;
    // normal 2D de cada familia en esta sección (la misma en todas)
    for (const b of an.bloques) {
      const pol = pegar(b.pol, an.real); if (pol.length < 3) continue;
      const fs = b.familias.map(n => { const e = RED.get(n); return e ? { n: e.n, k: e.k } : null; }).filter((x): x is { n: P; k: number } => !!x);
      const dl = corrimiento(fs);
      // hacia atrás (s más negativo, z mayor) la cuña se corre −δ por metro
      const za = Math.max(0, sSec - dz / 2), zb = Math.min(L, sSec + dz / 2);
      const en = (p: P, z: number): V3 => [p[0] - dl[0] * (z - sSec), p[1] - dl[1] * (z - sSec), z];
      const col = colorBloque(b), pos = porColor.get(col) ?? []; porColor.set(col, pos);
      const n = pol.length;
      for (let i = 0; i < n; i++) { const p = pol[i]!, q = pol[(i + 1) % n]!; tri(pos, en(p, za), en(q, za), en(q, zb)); tri(pos, en(p, za), en(q, zb), en(p, zb)); }
      const ids = triangular(pol);
      for (let k = 0; k < ids.length; k += 3) { tri(pos, en(pol[ids[k]!]!, za), en(pol[ids[k + 2]!]!, za), en(pol[ids[k + 1]!]!, za)); tri(pos, en(pol[ids[k]!]!, zb), en(pol[ids[k + 1]!]!, zb), en(pol[ids[k + 2]!]!, zb)); }
      if (t === 0) bordes.push({ capa: 'cunas', pts: [...pol, pol[0]!].map(p => en(p, za - 0.004)), color: '#2B1B12', ancho: 1.1 });
      const vol = b.area * (zb - za); volTotal += vol;
      if (b.cae && !b.desatada) { volCae += vol; conteo.CAE++; } else conteo[b.riesgo0]++;
    }
  }
  porColor.forEach((pos, col) => mallas.push({ id: `cunas${col}`, capa: 'cunas', pos, color: col, opac: 0.96, brillo: 0.15 }));
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

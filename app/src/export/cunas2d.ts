// Análisis de cuñas (bloques) en la sección del frente, ANTES y DESPUÉS del sostenimiento.
//
// Cada familia de discontinuidades se dibuja como una RED de trazas paralelas en el plano de la sección, separadas
// por su espaciamiento aparente (s / √(1 − (N·eje)²)); el espaciamiento sale de la familia o, si no se midió, de la
// clase de espaciamiento del RMR. Donde dos trazas consecutivas cortan el contorno real y se juntan detrás de él,
// queda un bloque; si una tercera familia lo corta, el bloque es el pedazo pegado a la excavación. Solo cuentan los
// bloques dentro de la zona de influencia del tipo de roca (criterio del área: I/II 8 %, III-A 10 %, III-B 13 %,
// IV 15 %, V 20 %).
//
// Estabilidad (equilibrio límite 2D, por metro de labor, φ = 30°, sin cohesión, γ = 2.7 t/m³):
//  - Caída libre (corona): el bloque baja sin apoyarse en ninguna cara. FS sin sostener = 0.
//  - Deslizamiento sobre una cara: FS = tan φ / tan ψ (ψ: inclinación de la cara).
//  - Con sostenimiento: pernos (densidad 1/esp² × base del bloque, solo si anclan ≥ 0.5 m detrás) y shotcrete
//    (corte en los dos bordes, τ = 0.35 MPa, conservador a edad temprana).
//  - Riesgo: FS < 1.5 ALTO, 1.5–2 MEDIO, ≥ 2 BAJO.
// Es un análisis 2D de la sección: para el factor de seguridad 3D de una cuña con tres planos use Unwedge.
import { rmrTotal, tipoRoca, type Zona } from '../core/rmr';
import type { Reporte } from '../model';
import {
  aSvg, aparente, area, azar, colorTipo, cruce, dentro, dd3, espesorShotcrete, estilo, familiasMedidas, pernoInfo, seccionReal, seccionTeorica,
  tramos, zonaInfluencia, type Fam, type P, type Prim, type RmrZonas, type Vista,
} from './croquis';

const rad = (g: number) => (g * Math.PI) / 180, gra = (r: number) => (r * 180) / Math.PI;
const GAMMA = 2.7, PHI = 30, TAU = 35; // t/m³, °, t/m²
export type Nivel = 'ALTO' | 'MEDIO' | 'BAJO';
export const nivel = (fs: number): Nivel => (fs >= 2 ? 'BAJO' : fs >= 1.5 ? 'MEDIO' : 'ALTO');
export const COLOR_RIESGO: Record<Nivel, string> = { ALTO: '#D32F2F', MEDIO: '#F59E0B', BAJO: '#2E9D4F' };

export interface Bloque {
  zona: 'CORONA' | 'HI' | 'HD'; familias: [number, number]; pol: P[]; area: number; peso: number; prof: number; base: number;
  modo: 'caida' | 'desliza'; psi: number; fs0: number; fs: number; riesgo0: Nivel; riesgo: Nivel; pernos: number; anclan: boolean;
}
export interface Analisis {
  bloques: Bloque[]; lineas: { fam: Fam; a: P; b: P }[]; real: P[]; nor: P[]; esp: Record<number, { s: number; s2d: number; fuente: string }>;
  zi: ReturnType<typeof zonaInfluencia>; perno: ReturnType<typeof pernoInfo>; shot: number; notas: string[];
}

/** Espaciamiento (m) representativo de la clase del RMR (puntaje 20/15/10/8/5). */
export const espDeRmr = (pts: number | null | undefined) => pts == null ? null : pts >= 20 ? 2.5 : pts >= 15 ? 1.0 : pts >= 10 ? 0.4 : pts >= 8 ? 0.13 : 0.05;
const MAX_LINEAS = 60, MAX_BLOQUES = 160;

const cache = new WeakMap<Reporte, Analisis | null>();
export function analizarCunas(r: Reporte): Analisis | null {
  if (cache.has(r)) return cache.get(r)!;
  const a = calcular(r); cache.set(r, a); return a;
}

function calcular(r: Reporte): Analisis | null {
  if (!r.ancho || !r.alto || r.azimut == null) return null;
  const B = r.ancho, H = r.alto, az = r.azimut, fams = familiasMedidas(r);
  if (fams.length < 2) return null;
  const hw = H - Math.min(H * 0.45, B * 0.31);
  // contorno real cada ~4 cm, con su normal hacia la roca y el largo acumulado
  const r0 = seccionReal(B, H, r.sobreexc ?? {}), n0 = seccionTeorica(B, H).normal, real: P[] = [], nor: P[] = [], arco: number[] = [];
  r0.forEach((p, i) => {
    const q = r0[i + 1], n = q ? Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.04)) : 1;
    for (let k = 0; k < n; k++) { const t = k / n; real.push(q ? [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])] : p); nor.push(n0[i]!); }
  });
  real.forEach((p, i) => arco.push(i ? arco[i - 1]! + Math.hypot(p[0] - real[i - 1]![0], p[1] - real[i - 1]![1]) : 0));
  const zonaDe = (p: P): Bloque['zona'] => (p[1] >= hw - 0.05 ? 'CORONA' : p[0] < 0 ? 'HI' : 'HD');
  const zi = zonaInfluencia(r), lim = (z: Bloque['zona']) => zi ? (z === 'CORONA' ? zi.corona : zi.hastial) : Math.min(B, H) * 0.13;
  const sost = (r.sostenimiento ?? []).join('\n'), perno = pernoInfo(sost.replace(/\n/g, ' ')), shot = espesorShotcrete(sost);
  const notas: string[] = [];

  // ---- red de trazas de cada familia ----
  const eje: [number, number, number] = [Math.sin(rad(az)), Math.cos(rad(az)), 0];
  const rnd = azar(`${r.id}|${r.fecha}|cuñas`);
  const esp: Analisis['esp'] = {}, lineas: Analisis['lineas'] = [];
  const espRmr = espDeRmr(r.rmr.CORONA.espaciamiento ?? r.rmr.HI.espaciamiento ?? r.rmr.HD.espaciamiento);
  const R = Math.max(B, H) * 1.2, cx = 0, cy = H / 2;
  const cortes: { s: number; p: P; dir: P; fam: Fam; li: number }[] = [];
  for (const f of fams) {
    const s = f.espaciamiento && f.espaciamiento > 0 ? f.espaciamiento : espRmr ?? 0.5;
    const fuente = f.espaciamiento && f.espaciamiento > 0 ? 'medido' : espRmr != null ? 'clase RMR' : 'supuesto';
    const N: [number, number, number] = [Math.sin(rad(f.dip)) * Math.sin(rad(f.dipdir)), Math.sin(rad(f.dip)) * Math.cos(rad(f.dipdir)), Math.cos(rad(f.dip))];
    const na = N[0] * eje[0] + N[1] * eje[1], proy = Math.sqrt(Math.max(0, 1 - na * na));
    if (proy < 0.25) { notas.push(`${f.abrev}${f.n} casi paralela al frente: casi no corta la sección.`); continue; }
    const s2d = Math.max(s / proy, 0.03);
    esp[f.n] = { s, s2d, fuente };
    const { ang, bajaDerecha } = aparente(f.dip, f.dipdir, az), t = rad(bajaDerecha ? -ang : ang), d: P = [Math.cos(t), Math.sin(t)], n: P = [-d[1], d[0]];
    const c0 = n[0] * cx + n[1] * cy, paso = Math.max(s2d, (2 * R) / MAX_LINEAS);
    // fallas, vetas y contactos: una sola traza (la estructura mapeada), no una red
    const offs = f.abrev === 'SD' ? (() => { const o: number[] = []; for (let c = c0 - R + rnd() * paso; c <= c0 + R; c += paso) o.push(c); return o; })() : [c0 + (rnd() - 0.5) * B * 0.4];
    for (const c of offs) {
      const o: P = [n[0] * c + d[0] * (d[0] * cx + d[1] * cy), n[1] * c + d[1] * (d[0] * cx + d[1] * cy)];
      const a: P = [o[0] - d[0] * R * 1.5, o[1] - d[1] * R * 1.5], b: P = [o[0] + d[0] * R * 1.5, o[1] + d[1] * R * 1.5];
      const li = lineas.push({ fam: f, a, b }) - 1;
      // cortes con el contorno
      for (let i = 0; i < real.length - 1; i++) {
        const p = real[i]!, q = real[i + 1]!, e: P = [q[0] - p[0], q[1] - p[1]], den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-12) continue;
        const w: P = [p[0] - a[0], p[1] - a[1]], tl = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
        if (u < 0 || u >= 1 || tl < 0) continue;
        const x: P = [p[0] + e[0] * u, p[1] + e[1] * u];
        if (x[1] < 0.12) continue;  // al pie del hastial (piso) no se forman cuñas
        const nn = nor[i]!, dot = d[0] * nn[0] + d[1] * nn[1];
        if (Math.abs(dot) < 0.15) continue;  // traza casi tangente al contorno
        cortes.push({ s: arco[i]! + Math.hypot(x[0] - p[0], x[1] - p[1]), p: x, dir: dot > 0 ? d : [-d[0], -d[1]], fam: f, li });
      }
    }
  }
  cortes.sort((x, y) => x.s - y.s);

  // ---- bloques entre cortes consecutivos ----
  const g: P = [0, -1], bloques: Bloque[] = [];
  const hacia = (n: P, desde: P, hasta: P): P => ((hasta[0] - desde[0]) * n[0] + (hasta[1] - desde[1]) * n[1] >= 0 ? n : [-n[0], -n[1]]);
  const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
  for (let k = 0; k < cortes.length - 1 && bloques.length < MAX_BLOQUES; k++) {
    const c1 = cortes[k]!, c2 = cortes[k + 1]!;
    if (c1.fam.n === c2.fam.n || c2.s - c1.s < 0.06) continue;
    const A = cruce(c1.p, c1.dir, c2.p, c2.dir);
    if (!A || dot([A[0] - c1.p[0], A[1] - c1.p[1]], c1.dir) <= 0 || dot([A[0] - c2.p[0], A[1] - c2.p[1]], c2.dir) <= 0 || dentro(A, real)) continue;
    const L1 = Math.hypot(A[0] - c1.p[0], A[1] - c1.p[1]), L2 = Math.hypot(A[0] - c2.p[0], A[1] - c2.p[1]);
    const pers = (f: Fam) => (f.persistencia != null && f.persistencia > 0 ? f.persistencia : Infinity);
    if (L1 > pers(c1.fam) || L2 > pers(c2.fam)) continue;
    const i1 = real.findIndex((_, i) => arco[i]! >= c1.s), i2 = real.findIndex((_, i) => arco[i]! >= c2.s);
    const baseP = real.slice(Math.max(0, i1), Math.max(i1, i2)), ch: P = [c2.p[0] - c1.p[0], c2.p[1] - c1.p[1]], Lb = Math.hypot(...ch);
    const zona = zonaDe(real[Math.floor((i1 + i2) / 2)] ?? c1.p);
    // profundidad del vértice detrás de la cuerda de la base
    let prof = Math.abs((A[0] - c1.p[0]) * ch[1] - (A[1] - c1.p[1]) * ch[0]) / Math.max(Lb, 1e-9);
    // una tercera familia que corte las dos caras recorta el bloque (queda el pedazo pegado a la excavación)
    let tope: P[] = [A];
    for (const l of lineas) {
      if (l.fam.n === c1.fam.n || l.fam.n === c2.fam.n) continue;
      const dl: P = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
      const x1 = cortaSeg(l.a, dl, c1.p, A), x2 = cortaSeg(l.a, dl, c2.p, A);
      if (!x1 || !x2) continue;
      const pr = Math.max(...[x1, x2].map(x => Math.abs((x[0] - c1.p[0]) * ch[1] - (x[1] - c1.p[1]) * ch[0]) / Math.max(Lb, 1e-9)));
      if (pr < prof) { prof = pr; tope = [x1, x2]; }
    }
    if (prof > lim(zona) + 1e-6 || prof < 0.03) continue;
    const pol: P[] = [c1.p, ...tope, c2.p, ...[...baseP].reverse()], ar = area(pol);
    if (ar < 0.004 || Lb < 0.08) continue;
    const W = ar * GAMMA, C: P = [pol.reduce((s, p) => s + p[0], 0) / pol.length, pol.reduce((s, p) => s + p[1], 0) / pol.length];
    // caras y normales hacia afuera del bloque
    const f1: [P, P] = [c1.p, tope[0]!], f2: [P, P] = [c2.p, tope.at(-1)!];
    const nCara = ([p, q]: [P, P]): P => { const d0: P = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...d0) || 1; return hacia([-d0[1] / L, d0[0] / L], C, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); };
    const n1 = nCara(f1), n2 = nCara(f2), nbR: P = baseP.length ? baseP.reduce<P>((s, _, j) => { const nn = nor[Math.max(0, i1) + j]!; return [s[0] - nn[0], s[1] - nn[1]]; }, [0, 0]) : [-c1.dir[0], -c1.dir[1]];
    const nbL = Math.hypot(...nbR) || 1, nb: P = [nbR[0] / nbL, nbR[1] / nbL];
    const modos: { modo: Bloque['modo']; psi: number; fs0: number }[] = [];
    if (dot(g, nb) > 0.2 && dot(g, n1) <= 1e-6 && dot(g, n2) <= 1e-6) modos.push({ modo: 'caida', psi: 90, fs0: 0 });
    for (const [f, otra] of [[f1, n2], [f2, n1]] as [[P, P], P][]) {
      const d0: P = [f[1][0] - f[0][0], f[1][1] - f[0][1]], L = Math.hypot(...d0) || 1; let t: P = [d0[0] / L, d0[1] / L];
      if (t[1] > 0) t = [-t[0], -t[1]];
      if (t[1] > -0.05 || dot(t, nb) <= 0.05 || dot(t, otra) > 1e-6) continue;
      const psi = gra(Math.atan2(-t[1], Math.abs(t[0])));
      modos.push({ modo: 'desliza', psi, fs0: Math.tan(rad(PHI)) / Math.tan(rad(psi)) });
    }
    if (!modos.length) continue;  // bloque trabado: no puede salir
    const m = modos.reduce((a, b) => (b.fs0 < a.fs0 ? b : a));
    const nP = perno ? Lb / (perno.esp * perno.esp) : 0, anclan = !!perno && perno.largo - prof >= 0.5;
    const Rs = (anclan ? nP * perno!.cap : 0) + 2 * shot * TAU;
    const fsCon = (Rr: number) => m.modo === 'caida' ? Rr / W : (W * Math.cos(rad(m.psi)) * Math.tan(rad(PHI)) + Rr) / Math.max(W * Math.sin(rad(m.psi)), 1e-6);
    const fs = Math.min(99, fsCon(Rs)), fs0 = Math.min(99, m.fs0);
    bloques.push({ zona, familias: [c1.fam.n, c2.fam.n], pol, area: ar, peso: W, prof, base: Lb, modo: m.modo, psi: m.psi, fs0, fs, riesgo0: nivel(fs0), riesgo: nivel(fs), pernos: nP, anclan });
  }
  return { bloques, lineas, real, nor, esp, zi, perno, shot, notas };
}

/** Punto donde la recta o + t·d corta el segmento p–q (o null). */
function cortaSeg(o: P, d: P, p: P, q: P): P | null {
  const e: P = [q[0] - p[0], q[1] - p[1]], den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) return null;
  const w: P = [p[0] - o[0], p[1] - o[1]], u = (w[0] * d[1] - w[1] * d[0]) / den;
  return u > 0.02 && u < 0.98 ? [p[0] + e[0] * u, p[1] + e[1] * u] : null;
}

/** Resumen por nivel de riesgo y factor de seguridad. */
export function resumen(a: Analisis) {
  const cuenta = (k: 'riesgo0' | 'riesgo') => ({ ALTO: a.bloques.filter(b => b[k] === 'ALTO').length, MEDIO: a.bloques.filter(b => b[k] === 'MEDIO').length, BAJO: a.bloques.filter(b => b[k] === 'BAJO').length });
  const fs = a.bloques.map(b => b.fs), fs0 = a.bloques.map(b => b.fs0);
  const mayor = a.bloques.reduce<Bloque | null>((m, b) => (!m || b.peso > m.peso ? b : m), null);
  const peor = a.bloques.reduce<Bloque | null>((m, b) => (!m || b.fs < m.fs ? b : m), null);
  return { antes: cuenta('riesgo0'), despues: cuenta('riesgo'), fsMin: fs.length ? Math.min(...fs) : null, fs0Min: fs0.length ? Math.min(...fs0) : null, mayor, peor, caida: a.bloques.filter(b => b.modo === 'caida').length };
}

const nomZona = (z: Bloque['zona']) => (z === 'CORONA' ? 'corona' : z === 'HI' ? 'H.I.' : 'H.D.');
const nomFam = (r: Reporte, n: number) => { const f = familiasMedidas(r).find(x => x.n === n); return f ? `${f.abrev}${n}` : `${n}`; };
export const fsTxt = (fs: number) => (fs >= 99 ? '>99' : fs < 0.05 ? '0' : fs.toFixed(fs < 10 ? 2 : 1));

/** Vista de la sección para el análisis: ANTES del desatado (sin sostener) o DESPUÉS (shotcrete + pernos).
 *  `aspecto` = ancho/alto del recuadro donde va (la mitad del recuadro del formato ≈ 136/215). */
export function vistaCunas(r: Reporte, rmr: RmrZonas, modo: 'antes' | 'despues', aspecto = 136 / 215): Vista | null {
  const a = analizarCunas(r); if (!a || !r.ancho || !r.alto) return null;
  const B = r.ancho, H = r.alto, hw = H - Math.min(H * 0.45, B * 0.31), real = a.real, fams = familiasMedidas(r);
  const lado = Math.max(...real.map(p => Math.abs(p[0]))), techo = Math.max(...real.map(p => p[1]));
  const zC = a.zi?.corona ?? 0.6, zH = a.zi?.hastial ?? 0.6;
  // ventana: el túnel con su zona de influencia arriba y, bajo el piso, espacio para el panel de resultados
  const filas = 9.5 + Math.ceil(fams.length / 2), top = techo + zC + Math.max(0.5, H * 0.16);
  let ancho = 2 * (lado + zH) + B * 0.16, alto = ancho / aspecto;
  const altoMin = (top + 0.12) / (1 - filas * 0.03);
  if (alto < altoMin) { alto = altoMin; ancho = alto * aspecto; }
  const y0 = top - alto;
  const caja: Vista['caja'] = [-ancho / 2, y0, ancho / 2, top];
  const marco: P[] = [[caja[0], 0], [caja[2], 0], [caja[2], caja[3]], [caja[0], caja[3]]];
  const prims: Prim[] = [], notas: string[] = [];
  const cC = colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD);
  prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], caja[3]], [caja[0], caja[3]]], cerrado: true, relleno: '#FFFFFF' });
  prims.push({ t: 'poly', pts: marco, cerrado: true, relleno: cC, opac: 0.42 });
  // red de trazas (lo que se ve en la roca alrededor de la excavación)
  for (const l of a.lineas) {
    const st = estilo(l.fam);
    for (const [p, q] of tramos(l.a, l.b, marco, real, 200)) prims.push({ t: 'poly', pts: [p, q], borde: l.fam.abrev === 'SD' ? '#5B4636' : st.borde, ancho: l.fam.abrev === 'SD' ? 0.22 : st.ancho, opac: 1 });
  }
  // zona de influencia
  const limite = real.map((p, i) => { const n = a.nor[i]!, d = n[1] > 0.5 ? zC : zH; return [p[0] + n[0] * d, p[1] + n[1] * d] as P; }).filter(p => p[1] > 0.05);
  // bloques coloreados por riesgo
  for (const b of a.bloques) {
    const nv = modo === 'antes' ? b.riesgo0 : b.riesgo;
    prims.push({ t: 'poly', pts: b.pol, cerrado: true, relleno: COLOR_RIESGO[nv], opac: modo === 'antes' ? 0.72 : 0.55, borde: '#2B1B12', ancho: 0.3 });
  }
  prims.push({ t: 'poly', pts: [...real], cerrado: true, relleno: '#FFFFFF' });
  prims.push({ t: 'poly', pts: limite, borde: '#0B1A2A', ancho: 0.45, trazos: [2, 1.4] });
  prims.push({ t: 'poly', pts: seccionTeorica(B, H).pts, borde: '#666666', ancho: 0.4, trazos: [2.2, 1.6] });
  prims.push({ t: 'poly', pts: real, borde: '#000000', ancho: 0.85 });
  prims.push({ t: 'poly', pts: [real[0]!, real.at(-1)!], borde: '#000000', ancho: 0.6 });
  // sostenimiento (solo después)
  const sost = (r.sostenimiento ?? []).join(' ').toLowerCase();
  if (modo === 'despues') {
    const e = Math.max(a.shot, 0.03) * 1.6, int: P[] = real.map((p, i) => [p[0] - a.nor[i]![0] * e, Math.max(0, p[1] - a.nor[i]![1] * e)] as P);
    if (a.shot > 0) prims.push({ t: 'poly', pts: [...real, ...[...int].reverse()], cerrado: true, relleno: '#9A9A9A', opac: 0.95 }, { t: 'poly', pts: int, borde: '#5E5E5E', ancho: 0.3 });
    if (/malla/.test(sost)) {
      const zig: P[] = []; real.forEach((p, k) => { if (k % 4 || p[1] <= H * 0.15) return; const q = int[k]!, sg = zig.length % 2 ? 1 : -1, n = a.nor[k]!; zig.push([(p[0] + q[0]) / 2 + n[0] * e * 0.3 * sg, (p[1] + q[1]) / 2 + n[1] * e * 0.3 * sg]); });
      prims.push({ t: 'poly', pts: zig, borde: '#1F4E9E', ancho: 0.35 });
    }
    if (a.perno) {
      let ult = -Infinity, s = 0;
      for (let i = 1; i < real.length - 1; i++) {
        s += Math.hypot(real[i]![0] - real[i - 1]![0], real[i]![1] - real[i - 1]![1]);
        const p = real[i]!, n = a.nor[i]!; if (p[1] < H * 0.18 || s - ult < a.perno.esp) continue; ult = s;
        prims.push({ t: 'poly', pts: [[p[0] - n[0] * e, p[1] - n[1] * e], [p[0] + n[0] * a.perno.largo, p[1] + n[1] * a.perno.largo]], borde: '#000000', ancho: 1.1 });
        prims.push({ t: 'poly', pts: [[p[0] - n[0] * e - n[1] * 0.11, p[1] - n[1] * e + n[0] * 0.11], [p[0] - n[0] * e + n[1] * 0.11, p[1] - n[1] * e - n[0] * 0.11]], borde: '#000000', ancho: 1.4 });
      }
    }
  }
  // títulos
  const w = caja[2] - caja[0], xL = caja[0] + w * 0.04, ln = alto * 0.03;
  const tit = modo === 'antes' ? 'ANTES DEL DESATADO' : 'DESPUÉS: CON SOSTENIMIENTO';
  const sub = modo === 'antes' ? 'sin pernos ni shotcrete · análisis de cuñas' : [a.shot > 0 ? `shotcrete ${(a.shot * 100).toFixed(0)} cm` : 'sin shotcrete', a.perno ? `${a.perno.tipo.toLowerCase()} ${a.perno.pies != null ? a.perno.pies + "'" : a.perno.largo.toFixed(1) + ' m'} ${a.perno.esp}×${a.perno.esp} m` : 'sin pernos', /malla/.test(sost) ? 'malla' : ''].filter(Boolean).join(' · ');
  prims.push({ t: 'texto', p: [xL, top - ln * 1.1], s: tit, tam: 6.2, negrita: true, color: modo === 'antes' ? '#9E1B1B' : '#1B5E20', ancla: 'izq', fondo: true });
  prims.push({ t: 'texto', p: [xL, top - ln * 2.05], s: sub, tam: 4.6, color: '#222222', ancla: 'izq', fondo: true });
  // panel de resultados bajo el piso
  const rs = resumen(a), cnt = modo === 'antes' ? rs.antes : rs.despues, n = a.bloques.length;
  prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], -0.12], [caja[0], -0.12]], cerrado: true, relleno: '#FFFFFF', opac: 0.96 });
  prims.push({ t: 'poly', pts: [[caja[0], -0.12], [caja[2], -0.12]], borde: '#7F7F7F', ancho: 0.4 });
  const fila = (k: number) => -0.12 - ln * (1.05 + k * 1.05);
  const pct = a.zi ? `${Math.round(a.zi.pct * 100)} % (${a.zi.tipo})` : '';
  const lin: { s: string; c?: string; b?: boolean }[] = [];
  if (!n) lin.push({ s: 'No se forman cuñas removibles', b: true }, { s: pct ? `dentro de la zona de influencia ${pct}` : '' });
  else if (modo === 'antes') {
    lin.push({ s: `${n} cuñas potenciales${pct ? ` · zona infl. ${pct}` : ''}`, b: true });
    lin.push({ s: `RIESGO ALTO ${cnt.ALTO} · MEDIO ${cnt.MEDIO} · BAJO ${cnt.BAJO}`, c: cnt.ALTO ? COLOR_RIESGO.ALTO : cnt.MEDIO ? '#B26B00' : COLOR_RIESGO.BAJO, b: true });
    lin.push({ s: `${rs.caida} en caída libre (FS 0) · FS mín ${fsTxt(rs.fs0Min ?? 0)}` });
    if (rs.mayor) lin.push({ s: `Mayor: ${nomZona(rs.mayor.zona)} ${rs.mayor.familias.map(x => nomFam(r, x)).join('+')} · h ${rs.mayor.prof.toFixed(2)} m · ${rs.mayor.peso.toFixed(2)} t/m` });
    lin.push({ s: cnt.ALTO ? '→ Desatar y sostener de inmediato' : '→ Desatar y verificar', c: cnt.ALTO ? COLOR_RIESGO.ALTO : '#222222', b: true });
  } else {
    lin.push({ s: `FS mín ${fsTxt(rs.fsMin ?? 0)} · ${rs.peor ? `${nomZona(rs.peor.zona)} ${rs.peor.familias.map(x => nomFam(r, x)).join('+')}` : ''}`, b: true });
    lin.push({ s: `RIESGO ALTO ${cnt.ALTO} · MEDIO ${cnt.MEDIO} · BAJO ${cnt.BAJO}`, c: cnt.ALTO ? COLOR_RIESGO.ALTO : cnt.MEDIO ? '#B26B00' : COLOR_RIESGO.BAJO, b: true });
    lin.push({ s: `Shotcrete: ${(2 * a.shot * TAU).toFixed(1)} t/m de corte en los bordes` });
    if (a.perno) lin.push({ s: `Pernos: ${a.perno.cap} t c/u · ${a.bloques.filter(b => b.anclan).length} de ${n} cuñas quedan ancladas` });
    lin.push({ s: cnt.ALTO || cnt.MEDIO ? '→ Reforzar donde sale ALTO/MEDIO' : '→ Sostenimiento adecuado', c: cnt.ALTO || cnt.MEDIO ? COLOR_RIESGO.ALTO : '#1B5E20', b: true });
  }
  lin.forEach((l, k) => { if (l.s) prims.push({ t: 'texto', p: [xL, fila(k)], s: l.s, tam: 4.6, color: l.c ?? '#111111', negrita: l.b, ancla: 'izq' }); });
  // leyenda de colores
  const ly = fila(lin.length) - ln * 0.15, sw = w * 0.045;
  (['ALTO', 'MEDIO', 'BAJO'] as Nivel[]).forEach((nv, k) => {
    const x = xL + k * w * 0.3;
    prims.push({ t: 'poly', pts: [[x, ly], [x + sw, ly], [x + sw, ly + ln * 0.6], [x, ly + ln * 0.6]], cerrado: true, relleno: COLOR_RIESGO[nv], opac: 0.8, borde: '#333333', ancho: 0.3 });
    prims.push({ t: 'texto', p: [x + sw * 1.3, ly + ln * 0.08], s: nv === 'ALTO' ? 'FS<1.5' : nv === 'MEDIO' ? '1.5–2' : 'FS≥2', tam: 4.3, ancla: 'izq' });
  });
  // estructuras (2 por fila) con su espaciamiento, al pie del panel
  const ft = fams.map(f => { const e = a.esp[f.n]; return `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${e ? ` s ${e.s} m` : ''}`; });
  for (let k = 0; k < ft.length; k += 2) prims.push({ t: 'texto', p: [xL, ly - ln * (1.1 + (k / 2) * 0.95)], s: ft.slice(k, k + 2).join('   ·   '), tam: 4.2, color: '#333333', ancla: 'izq' });
  // número de cada cuña (el mismo de la tabla y del gráfico)
  const puestos: P[] = [], sep = w * 0.04;
  orden(a).slice(0, 40).forEach((b, i) => {
    const c: P = [b.pol.reduce((s, p) => s + p[0], 0) / b.pol.length, b.pol.reduce((s, p) => s + p[1], 0) / b.pol.length];
    if (puestos.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < sep)) return;  // sin montar números
    puestos.push(c);
    prims.push({ t: 'texto', p: [c[0], c[1] - 0.06], s: String(i + 1), tam: 3.6, negrita: true, color: '#111111', ancla: 'centro', fondo: true });
  });
  for (const e of Object.entries(a.esp)) if (e[1].fuente !== 'medido') { notas.push(`Espaciamiento de ${nomFam(r, Number(e[0]))}: ${e[1].s} m (${e[1].fuente}); mídalo para un resultado más fino.`); }
  notas.push(...a.notas);
  return { prims, caja, notas };
}

/** Gráfico del factor de seguridad de cada cuña, antes (sin sostener) y después (con sostenimiento), en escala
 *  logarítmica, con las franjas de riesgo. Unidades del gráfico: x 0–100, y 0–60. */
const orden = (a: Analisis) => [...a.bloques].sort((x, y) => x.fs - y.fs || y.peso - x.peso);
export function graficoFS(r: Reporte, aspecto = 100 / 60): Vista | null {
  const a = analizarCunas(r); if (!a || !a.bloques.length) return null;
  const bl = orden(a).slice(0, 40);
  const AN = Math.max(70, 60 * aspecto), X0 = 9 * Math.min(1, 100 / AN) + 2, X1 = AN - 14, Y0 = 9, Y1 = 52, lo = Math.log10(0.1), hi = Math.log10(100);
  const Y = (fs: number) => Y0 + ((Math.log10(Math.min(100, Math.max(0.1, fs))) - lo) / (hi - lo)) * (Y1 - Y0);
  const prims: Prim[] = [{ t: 'poly', pts: [[0, 0], [AN, 0], [AN, 60], [0, 60]], cerrado: true, relleno: '#FFFFFF' }];
  const banda = (a0: number, a1: number, c: string) => prims.push({ t: 'poly', pts: [[X0, Y(a0)], [X1, Y(a0)], [X1, Y(a1)], [X0, Y(a1)]], cerrado: true, relleno: c, opac: 0.13 });
  banda(0.1, 1.5, COLOR_RIESGO.ALTO); banda(1.5, 2, COLOR_RIESGO.MEDIO); banda(2, 100, COLOR_RIESGO.BAJO);
  for (const v of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]) {
    prims.push({ t: 'poly', pts: [[X0, Y(v)], [X1, Y(v)]], borde: '#D0D0D0', ancho: 0.25 });
    prims.push({ t: 'texto', p: [X0 - 1, Y(v) - 0.8], s: String(v), tam: 4.4, ancla: 'der', color: '#444444' });
  }
  for (const [v, t, c] of [[1.5, 'FS 1.5', '#B26B00'], [2, 'FS 2.0', '#1B5E20'], [1, 'FS 1.0 (falla)', '#9E1B1B']] as [number, string, string][]) {
    prims.push({ t: 'poly', pts: [[X0, Y(v)], [X1, Y(v)]], borde: c, ancho: 0.6, trazos: [2, 1] });
    prims.push({ t: 'texto', p: [X1 + 0.8, Y(v) - 0.7], s: t, tam: 4.2, ancla: 'izq', color: c, negrita: true });
  }
  const paso = (X1 - X0) / bl.length, wB = paso * 0.36;
  bl.forEach((b, i) => {
    const x = X0 + paso * (i + 0.5);
    const barra = (x0: number, fs: number, c: string, op: number) => prims.push({ t: 'poly', pts: [[x0, Y0], [x0 + wB, Y0], [x0 + wB, Y(fs)], [x0, Y(fs)]], cerrado: true, relleno: c, opac: op, borde: '#333333', ancho: 0.2 });
    barra(x - wB, b.fs0 < 0.1 ? 0.1 : b.fs0, COLOR_RIESGO[b.riesgo0], 0.55);
    barra(x, b.fs, COLOR_RIESGO[b.riesgo], 0.95);
    if (b.fs0 < 0.1) prims.push({ t: 'texto', p: [x - wB / 2, Y0 + 1], s: '0', tam: 3.6, ancla: 'centro', color: '#9E1B1B', negrita: true });
    if (bl.length <= 24 || i % 2 === 0) prims.push({ t: 'texto', p: [x, Y0 - 3], s: `${i + 1}`, tam: 3.8, ancla: 'centro', color: '#333333' });
  });
  prims.push({ t: 'poly', pts: [[X0, Y1], [X0, Y0], [X1, Y0]], borde: '#000000', ancho: 0.5 });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y(2) + Y1) / 2], s: 'RIESGO BAJO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.BAJO });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y0 + Y(1.5)) / 2], s: 'RIESGO ALTO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.ALTO });
  prims.push({ t: 'texto', p: [X0, 56.5], s: 'FACTOR DE SEGURIDAD POR CUÑA (2D, por metro de labor)', tam: 6, negrita: true, ancla: 'izq', color: '#0D2A6B' });
  prims.push({ t: 'texto', p: [X0, 53.3], s: 'Barra clara: antes del desatado (sin sostener) · barra fuerte: con shotcrete y pernos', tam: 4.4, ancla: 'izq', color: '#333333' });
  prims.push({ t: 'texto', p: [(X0 + X1) / 2, 1.6], s: 'Cuñas ordenadas de menor a mayor FS con sostenimiento (n° de la tabla)', tam: 4.4, ancla: 'centro', color: '#333333' });
  prims.push({ t: 'texto', p: [2.2, (Y0 + Y1) / 2], s: 'FS', tam: 5, negrita: true, ancla: 'centro' });
  return { prims, caja: [0, 0, AN, 60], notas: [] };
}

/** Filas de la tabla de cuñas (mismo orden que el gráfico). */
export function tablaCunas(r: Reporte) {
  const a = analizarCunas(r); if (!a) return [];
  return orden(a).slice(0, 40).map((b, i) => ({
    n: i + 1, zona: nomZona(b.zona), familias: b.familias.map(x => nomFam(r, x)).join(' + '), prof: b.prof, peso: b.peso,
    modo: b.modo === 'caida' ? 'caída libre' : `desliza ${Math.round(b.psi)}°`, fs0: b.fs0, fs: b.fs, riesgo0: b.riesgo0, riesgo: b.riesgo,
  }));
}

/** Datos de la zona de influencia para textos (tipo y %). */
export function tipoAnalisis(r: Reporte) {
  const v = rmrTotal(r.rmr.CORONA, r.ajuste.CORONA); return v != null ? tipoRoca(v) : r.tipoGeologo ?? null;
}
export type { Zona };

/** Las dos secciones (antes | después) lado a lado en un solo SVG de W × H. */
export function seccionDobleSvg(r: Reporte, rmr: RmrZonas, W: number, H: number): string | null {
  const a = vistaCunas(r, rmr, 'antes', (W / 2) / H), d = vistaCunas(r, rmr, 'despues', (W / 2) / H);
  if (!a || !d) return null;
  const sub = (v: Vista, x: number) => aSvg(v, W / 2, H).replace('<svg ', `<svg x="${x}" y="0" width="${W / 2}" height="${H}" `).replace(' width="100%"', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="background:#fff">${sub(a, 0)}${sub(d, W / 2)}<line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="#000" stroke-width="1.2"/></svg>`;
}

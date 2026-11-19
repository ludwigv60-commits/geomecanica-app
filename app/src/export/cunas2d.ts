// Análisis de cuñas (bloques) en la sección del frente, ANTES del desatado y DESPUÉS (desatado + sostenimiento).
//
// Cada familia de discontinuidades se dibuja como una RED de trazas paralelas en el plano de la sección, separadas
// por su espaciamiento aparente (s / √(1 − (N·eje)²)); el espaciamiento sale de la familia o, si no se midió, de la
// clase de espaciamiento del RMR. La roca alrededor de la excavación se divide en una grilla fina (≈1.5 cm) y las
// trazas la parten en celdas: TODA celda cerrada por trazas y pegada al contorno es un bloque (cuña) candidato, por
// pequeña que sea. Solo cuentan las cuñas dentro de la zona de influencia del tipo de roca (I/II 8 %, III-A 10 %,
// III-B 13 %, IV 15 %, V 20 %) y cuyas caras no superan la persistencia de su familia.
//
// Estabilidad (equilibrio límite 2D por metro de labor, sin cohesión, γ = 2.7 t/m³):
//  - Fricción de las caras con los criterios de la roca: φ = atan(Jr/Ja) de Barton en esa zona (si falta, 30°).
//  - Caída libre (corona): el bloque baja sin apoyarse en ninguna cara. FS sin sostener = 0.
//  - Deslizamiento sobre una cara: FS = tan φ / tan ψ (ψ: inclinación de la cara). Bloque trabado: no es cuña.
//  - FS < 1: CAE al desatar (se retira y el contorno queda con ese realce); 1–1.5 ALTO; 1.5–2 MEDIO; ≥ 2 BAJO.
//  - Después del desatado: contorno nuevo sin las cuñas que cayeron, con shotcrete pegado a ese contorno y pernos
//    (densidad 1/esp² × base del bloque, solo si anclan ≥ 0.5 m detrás) y corte del shotcrete (τ = 2 MPa, shotcrete con fibra f'c 30 MPa).
// Es un análisis 2D de la sección: para el factor de seguridad 3D de una cuña con tres planos use Unwedge.
import { rmrTotal, tipoRoca, type Zona } from '../core/rmr';
import type { Reporte } from '../model';
import { sostenimientoGlobal } from './global';
import {
  aSvg, aparente, azar, trazaSeccion, colorTipo, dd3, espesorShotcrete, estilo, familiasMedidas, pernoInfo, seccionReal, seccionTeorica,
  tramos, zonaInfluencia, type Fam, type P, type Prim, type RmrZonas, type Vista,
} from './croquis';

const rad = (g: number) => (g * Math.PI) / 180, gra = (r: number) => (r * 180) / Math.PI;
const GAMMA = 2.7, PHI = 30, TAU = 200; // t/m³, °, t/m² (corte del shotcrete con fibra, f'c 30 MPa de la S400: 2 MPa)
export type Nivel = 'ALTO' | 'MEDIO' | 'BAJO';
export const nivel = (fs: number): Nivel => (fs >= 2 ? 'BAJO' : fs >= 1.5 ? 'MEDIO' : 'ALTO');
export const COLOR_RIESGO: Record<Nivel, string> = { ALTO: '#D32F2F', MEDIO: '#F59E0B', BAJO: '#2E9D4F' };
export const COLOR_CAE = '#6E0B0B';
/** Colores por familia (sirven en fondo claro y oscuro): los mismos en la vista 3D y en la red estereográfica. */
export const COLOR_SD = ['#D9A400', '#2E9BC6', '#8E5CC9', '#3FA45B', '#C8582F'];
export const COLOR_EST: Record<string, string> = { F: '#E0282E', V: '#F08A00', C: '#00A9C9' };
export function colorFam(fams: Fam[], f: Fam) {
  if (f.abrev !== 'SD') return COLOR_EST[f.abrev] ?? '#555555';
  return COLOR_SD[fams.filter(x => x.abrev === 'SD').indexOf(f) % COLOR_SD.length]!;
}

export interface Bloque {
  zona: 'CORONA' | 'HI' | 'HD'; familias: number[]; pol: P[]; area: number; peso: number; prof: number; base: number; phi: number;
  modo: 'caida' | 'desliza'; psi: number; fs0: number; fs: number; riesgo0: Nivel; riesgo: Nivel; pernos: number; anclan: boolean;
  cae: boolean; // FS sin sostener < 1: cae al desatar
  desatada?: boolean; // no caía sola, pero el desatador la saca al perfilar el contorno
}
export interface Analisis {
  bloques: Bloque[]; lineas: { fam: Fam; a: P; b: P }[]; real: P[]; realD: P[]; nor: P[]; esp: Record<number, { s: number; s2d: number; fuente: string }>;
  zi: ReturnType<typeof zonaInfluencia>; perno: ReturnType<typeof pernoInfo>; shot: number; notas: string[]; cortes: Record<number, number>; phi: Record<Zona, { v: number; fuente: string }>;
}

/** Espaciamiento (m) representativo de la clase del RMR (puntaje 20/15/10/8/5). */
export const espDeRmr = (pts: number | null | undefined) => pts == null ? null : pts >= 20 ? 2.5 : pts >= 15 ? 1.0 : pts >= 10 ? 0.4 : pts >= 8 ? 0.13 : 0.05;
const MAX_LINEAS = 90, MAX_BLOQUES = 400;

const cache = new WeakMap<Reporte, Map<string, Analisis | null>>();
/** Opciones del análisis en otra sección de la labor (vista 3D): `sSec` m detrás del frente; `ubicar` lleva la
 *  falla que no corta el frente a la sección donde sí corta (solo para el frente); `rapido` usa una grilla más gruesa. */
export interface OpcSeccion { sSec?: number; ubicar?: boolean; rapido?: boolean }
export function analizarCunas(r: Reporte, o: OpcSeccion = {}): Analisis | null {
  const k = `${o.sSec ?? 0}|${o.ubicar !== false}|${!!o.rapido}`;
  let m = cache.get(r); if (!m) { m = new Map(); cache.set(r, m); }
  if (m.has(k)) return m.get(k)!;
  const a = calcular(r, o.sSec ?? 0, o.ubicar !== false, !!o.rapido); m.set(k, a); return a;
}

/** Normal del plano en ejes de la labor: a = hacia la derecha, b = arriba, nu = hacia el avance. */
export function planoLocal(dip: number, dipdir: number, az: number) {
  const N = [Math.sin(rad(dip)) * Math.sin(rad(dipdir)), Math.sin(rad(dip)) * Math.cos(rad(dipdir)), Math.cos(rad(dip))] as const;
  return { a: N[0] * Math.cos(rad(az)) - N[1] * Math.sin(rad(az)), b: N[2], nu: N[0] * Math.sin(rad(az)) + N[1] * Math.cos(rad(az)) };
}

function calcular(r: Reporte, sSec = 0, ubicar = true, rapido = false): Analisis | null {
  if (!r.ancho || !r.alto || r.azimut == null) return null;
  const B = r.ancho, H = r.alto, az = r.azimut, fams = familiasMedidas(r);
  if (fams.length < 2) return null;
  const hw = H - Math.min(H * 0.45, B * 0.31);
  // contorno real cada ~4 cm, con su normal hacia la roca
  const r0 = seccionReal(B, H, r.sobreexc ?? {}), n0 = seccionTeorica(B, H).normal, real: P[] = [], nor: P[] = [];
  r0.forEach((p, i) => {
    const q = r0[i + 1], n = q ? Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.04)) : 1;
    for (let k = 0; k < n; k++) { const t = k / n; real.push(q ? [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])] : p); nor.push(n0[i]!); }
  });
  const zonaDe = (p: P): Bloque['zona'] => (p[1] >= hw - 0.05 ? 'CORONA' : p[0] < 0 ? 'HI' : 'HD');
  const zi = zonaInfluencia(r), lim = (z: Bloque['zona']) => zi ? (z === 'CORONA' ? zi.corona : zi.hastial) : Math.min(B, H) * 0.13;
  const sost = (r.sostenimiento ?? []).join('\n'), perno = pernoInfo(sost.replace(/\n/g, ' ')), shot = espesorShotcrete(sost);
  const notas: string[] = [];
  // fricción de las caras con los criterios de la roca (Barton: φ ≈ atan(Jr/Ja))
  const phi = {} as Analisis['phi'];
  for (const z of ['HI', 'CORONA', 'HD'] as Zona[]) {
    const q = r.q?.[z] ?? r.q?.CORONA;
    phi[z] = q?.jr && q?.ja ? { v: Math.min(45, Math.max(10, gra(Math.atan(q.jr / q.ja)))), fuente: `Jr/Ja ${q.jr}/${q.ja}` } : { v: PHI, fuente: 'supuesto' };
  }

  // ---- red de trazas de cada familia ----
  const eje: [number, number, number] = [Math.sin(rad(az)), Math.cos(rad(az)), 0];
  const rnd = azar(`${r.id}|${r.fecha}|cuñas`);
  const esp: Analisis['esp'] = {}, lineas: Analisis['lineas'] = [], cortes: Record<number, number> = {};
  const espRmr = espDeRmr(r.rmr.CORONA.espaciamiento ?? r.rmr.HI.espaciamiento ?? r.rmr.HD.espaciamiento);
  const R = Math.max(B, H) * 1.2, cx = 0, cy = H / 2;
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
    // falla/veta/contacto movida a mano en la planta: su traza en el frente; si en el frente queda fuera de la
    // labor, se muestra en la sección del último avance donde sí la corta (es donde afecta a la excavación)
    // la traza se corre al pasar a otra sección: c(sSec) = c0 + σ·(nu/proy)·sSec (σ: sentido de n respecto de la normal)
    const pl = planoLocal(f.dip, f.dipdir, az), sg = n[0] * pl.a + n[1] * pl.b >= 0 ? 1 : -1, sh = sg * (pl.nu / proy) * sSec;
    let fija = trazaSeccion(f, r, sSec); // con pos (movida a mano en la planta)
    if (fija && f.abrev !== 'SD' && ubicar && sSec === 0) {
      const dist = (t: { o: P; d: P } | null) => t ? (t.o[0] * t.d[1] - (t.o[1] - H / 2) * t.d[0]) : 0;
      const d0 = dist(fija), t1 = trazaSeccion(f, r, 1), pend = dist(t1) - d0, av = Math.max(0, r.avance ?? 0);
      if (Math.abs(d0) > B / 2 + 0.3 && av > 0 && Math.abs(pend) > 1e-6) {
        const sC = Math.min(av, Math.max(0, -d0 / pend)), tC = trazaSeccion(f, r, sC);
        if (tC && Math.abs(dist(tC)) < Math.abs(d0)) { fija = tC; cortes[f.n] = sC; notas.push(Math.abs(dist(tC)) <= B / 2 + 0.3 ? `${f.abrev}${f.n} no corta el frente: se dibuja en la sección a ${sC.toFixed(1)} m detrás del frente, donde corta la labor.` : `${f.abrev}${f.n} no corta la labor en el último avance: se dibuja en su punto más cercano, a ${sC.toFixed(1)} m detrás del frente.`); }
      }
    }
    const azarF = f.abrev === 'SD' ? 0 : rnd(); // mismo orden de azar que antes: la red de diaclasas no cambia al mover una falla
    const offs = f.abrev === 'SD' ? (() => {
      // diaclasas: red con su espaciamiento; si se movió en la planta, una de sus trazas pasa por esa posición
      const fase = rnd(), ini = fija ? c0 - R + ((((n[0] * fija.o[0] + n[1] * fija.o[1]) - (c0 - R)) % paso) + paso) % paso : c0 - R + (((fase * paso + sh) % paso) + paso) % paso;
      const o: number[] = []; for (let c = ini; c <= c0 + R; c += paso) o.push(c); return o; })() : [fija ? n[0] * fija.o[0] + n[1] * fija.o[1] : c0 + (azarF - 0.5) * B * 0.4 + sh];
    for (const c of offs) {
      const o: P = [n[0] * c + d[0] * (d[0] * cx + d[1] * cy), n[1] * c + d[1] * (d[0] * cx + d[1] * cy)];
      lineas.push({ fam: f, a: [o[0] - d[0] * R * 1.5, o[1] - d[1] * R * 1.5], b: [o[0] + d[0] * R * 1.5, o[1] + d[1] * R * 1.5] });
    }
  }

  // ---- grilla de la roca alrededor de la excavación ----
  const lado = Math.max(...real.map(p => Math.abs(p[0]))), techo = Math.max(...real.map(p => p[1]));
  const zC = lim('CORONA'), zH = lim('HI');
  const X0 = -(lado + zH + 0.2), X1 = lado + zH + 0.2, Y0 = 0, Y1 = techo + zC + 0.2;
  const px = Math.max(rapido ? 0.02 : 0.012, Math.max(X1 - X0, Y1 - Y0) / (rapido ? 340 : 650)), nx = Math.ceil((X1 - X0) / px), ny = Math.ceil((Y1 - Y0) / px), NT = nx * ny;
  const EXC = -2, BAR = -3, LEJOS = -4;
  const lab = new Int32Array(NT).fill(-1), barra = new Int32Array(NT).fill(-1);
  const xc = (i: number) => X0 + (i + 0.5) * px, yc = (j: number) => Y0 + (j + 0.5) * px;
  // excavación (relleno por filas)
  const poli = [...real, real[0]!];
  for (let j = 0; j < ny; j++) {
    const y = yc(j), xs: number[] = [];
    for (let k = 0; k < poli.length - 1; k++) { const p = poli[k]!, q = poli[k + 1]!; if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k]! - X0) / px - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1]! - X0) / px - 0.5));
      for (let i = i0; i <= i1; i++) lab[j * nx + i] = EXC;
    }
  }
  // distancia al contorno (chaflán 3-4, en píxeles)
  const dist = new Float32Array(NT);
  for (let k = 0; k < NT; k++) dist[k] = lab[k] === EXC ? 0 : 1e9;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = dist[k]!;
    if (i > 0) v = Math.min(v, dist[k - 1]! + 1);
    if (j > 0) { v = Math.min(v, dist[k - nx]! + 1); if (i > 0) v = Math.min(v, dist[k - nx - 1]! + 1.414); if (i < nx - 1) v = Math.min(v, dist[k - nx + 1]! + 1.414); }
    dist[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = dist[k]!;
    if (i < nx - 1) v = Math.min(v, dist[k + 1]! + 1);
    if (j < ny - 1) { v = Math.min(v, dist[k + nx]! + 1); if (i < nx - 1) v = Math.min(v, dist[k + nx + 1]! + 1.414); if (i > 0) v = Math.min(v, dist[k + nx - 1]! + 1.414); }
    dist[k] = v;
  }
  // fuera de la zona de influencia o al pie del hastial (piso): roca que no forma cuñas
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (lab[k] === EXC) continue;
    const y = yc(j), z = zonaDe([xc(i), y]);
    if (y < 0.12 || dist[k]! * px > lim(z) + px) lab[k] = LEJOS;
  }
  // trazas como barreras
  lineas.forEach((l, li) => {
    const d: P = [l.b[0] - l.a[0], l.b[1] - l.a[1]], L = Math.hypot(...d), n = Math.ceil(L / (px * 0.5));
    for (let s = 0; s <= n; s++) {
      const x = l.a[0] + (d[0] * s) / n, y = l.a[1] + (d[1] * s) / n;
      if (x < X0 || x >= X1 || y < Y0 || y >= Y1) continue;
      const k = Math.floor((y - Y0) / px) * nx + Math.floor((x - X0) / px);
      if (lab[k] === -1) { lab[k] = BAR; barra[k] = li; }
    }
  });

  // ---- celdas cerradas pegadas al contorno = cuñas ----
  const g: P = [0, -1], bloques: (Bloque & { id: number; ci: number })[] = [], dot = (u: P, v: P) => u[0] * v[0] + u[1] * v[1];
  const cola = new Int32Array(NT), vec = [-1, 1, -nx, nx];
  let id = 0;
  for (let k0 = 0; k0 < NT && bloques.length < MAX_BLOQUES; k0++) {
    if (lab[k0] !== -1) continue;
    const yo = id++; lab[k0] = yo; let qh = 0, qt = 0; cola[qt++] = k0;
    let lejos = false, n = 0, sx = 0, sy = 0, dmax = 0, nBase = 0;
    const caras = new Map<number, { c: number; lo: number; hi: number }>(), borde: number[] = [];
    while (qh < qt) {
      const k = cola[qh++]!, i = k % nx, j = (k - i) / nx;
      n++; sx += xc(i); sy += yc(j); dmax = Math.max(dmax, dist[k]!);
      let esBorde = false, toca = false;
      for (let v = 0; v < 4; v++) {
        if ((v === 0 && i === 0) || (v === 1 && i === nx - 1) || (v === 2 && j === 0) || (v === 3 && j === ny - 1)) { lejos = true; esBorde = true; continue; }
        const q = k + vec[v]!, lq = lab[q]!;
        if (lq === -1) { lab[q] = yo; cola[qt++] = q; continue; }
        if (lq === yo) continue;
        esBorde = true;
        if (lq === LEJOS) lejos = true;
        else if (lq === EXC) toca = true;
        else if (lq === BAR) {
          const li = barra[q]!, l = lineas[li]!, dd: P = [l.b[0] - l.a[0], l.b[1] - l.a[1]], L = Math.hypot(...dd) || 1, pr = (xc(i) * dd[0] + yc(j) * dd[1]) / L;
          const c = caras.get(li); if (c) { c.c++; c.lo = Math.min(c.lo, pr); c.hi = Math.max(c.hi, pr); } else caras.set(li, { c: 1, lo: pr, hi: pr });
        }
      }
      if (toca) nBase++;
      if (esBorde) borde.push(k);
    }
    const ar = n * px * px;
    if (lejos || nBase < 3 || ar < 0.003) continue;
    const C: P = [sx / n, sy / n];
    // caras de la cuña (trazas que la limitan) y su persistencia
    const fc = [...caras.entries()].filter(([, c]) => c.c >= 3);
    if (!fc.length) continue;
    const pers = (f: Fam) => (f.persistencia != null && f.persistencia > 0 ? f.persistencia : Infinity);
    if (fc.some(([li, c]) => c.hi - c.lo > pers(lineas[li]!.fam))) continue;
    const ci = real.reduce((m, p, i) => (Math.hypot(p[0] - C[0], p[1] - C[1]) < Math.hypot(real[m]![0] - C[0], real[m]![1] - C[1]) ? i : m), 0);
    const zona = zonaDe(real[ci]!), nb: P = [-nor[ci]![0], -nor[ci]![1]], ph = phi[zona].v;
    const caraN = fc.map(([li]) => {
      const l = lineas[li]!, dd: P = [l.b[0] - l.a[0], l.b[1] - l.a[1]], L = Math.hypot(...dd) || 1, d: P = [dd[0] / L, dd[1] / L], nn: P = [-d[1], d[0]];
      return { d, out: dot([l.a[0] - C[0], l.a[1] - C[1]], nn) > 0 ? nn : [-nn[0], -nn[1]] as P, fam: l.fam.n };
    });
    const modos: { modo: Bloque['modo']; psi: number; fs0: number }[] = [];
    if (dot(g, nb) > 0.2 && caraN.every(c => dot(g, c.out) <= 0.02)) modos.push({ modo: 'caida', psi: 90, fs0: 0 });
    caraN.forEach((c, k) => {
      let t = c.d; if (t[1] > 0) t = [-t[0], -t[1]];
      if (t[1] > -0.05 || dot(t, nb) <= 0.05 || caraN.some((o, m) => m !== k && dot(t, o.out) > 0.02)) return;
      const psi = gra(Math.atan2(-t[1], Math.abs(t[0])));
      modos.push({ modo: 'desliza', psi, fs0: Math.tan(rad(ph)) / Math.tan(rad(psi)) });
    });
    if (!modos.length) continue;  // trabada: no puede salir
    const m = modos.reduce((u, v) => (v.fs0 < u.fs0 ? v : u));
    const W = ar * GAMMA, prof = dmax * px, Lb = nBase * px;
    if (prof < 0.02) continue;
    const nP = perno ? Lb / (perno.esp * perno.esp) : 0, anclan = !!perno && perno.largo - prof >= 0.5;
    const Rs = (anclan ? nP * perno!.cap : 0) + 2 * shot * TAU;
    const fs = Math.min(99, m.modo === 'caida' ? Rs / W : (W * Math.cos(rad(m.psi)) * Math.tan(rad(ph)) + Rs) / Math.max(W * Math.sin(rad(m.psi)), 1e-6)), fs0 = Math.min(99, m.fs0);
    // contorno para dibujar: envolvente de los píxeles del borde (lo que cae dentro de la excavación se tapa en blanco)
    const pts: P[] = [];
    for (const k of borde) { const i = k % nx, j = (k - i) / nx, x = xc(i), y = yc(j), h = px * 0.5; pts.push([x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]); }
    bloques.push({ id: yo, ci, zona, familias: [...new Set(caraN.map(c => c.fam))], pol: envolvente(pts), area: ar, peso: W, prof, base: Lb, phi: ph, modo: m.modo, psi: m.psi, fs0, fs, riesgo0: nivel(fs0), riesgo: nivel(fs), pernos: nP, anclan, cae: fs0 < 1 });
  }
  // ---- contorno después del desatado ----
  // 1) Lo que cae (FS < 1) deja su realce: profundidad t de cada punto del contorno hasta la cara de la cuña.
  const caen = new Set(bloques.filter(b => b.cae).map(b => b.id));
  const t0 = real.map((p, i) => {
    const n = nor[i]!; let ult = -1, salto = 0;
    for (let t = 0; t < 2 * Math.max(zC, zH) + 0.3; t += px * 0.5) {
      const x = p[0] + n[0] * t, y = p[1] + n[1] * t;
      if (x < X0 || x >= X1 || y < Y0 || y >= Y1) break;
      const l = lab[Math.floor((y - Y0) / px) * nx + Math.floor((x - X0) / px)]!;
      if (l === EXC) continue;
      if (caen.has(l)) { ult = t; salto = 0; continue; }
      if (l === BAR && salto < 4) { salto++; continue; }
      break;
    }
    return ult >= 0 ? ult + px * 0.5 : 0;
  });
  // 2) El desatador no deja huecos: con la barretina saca también la roca suelta de los bordes y deja el contorno
  //    redondeado (perfil de "taza"), con algo de las puntas. Radio de alcance ≈ 0.35 m; en roca fracturada
  //    (con cuñas cerca) se cae además una capa fina, mayor cuanto menor es el espaciamiento.
  const sArc: number[] = []; real.forEach((p, i) => sArc.push(i ? sArc[i - 1]! + Math.hypot(p[0] - real[i - 1]![0], p[1] - real[i - 1]![1]) : 0));
  const ventana = (i: number, w: number, f: (j: number, d: number) => void) => {
    for (let j = i; j >= 0 && sArc[i]! - sArc[j]! <= w; j--) f(j, sArc[i]! - sArc[j]!);
    for (let j = i + 1; j < real.length && sArc[j]! - sArc[i]! <= w; j++) f(j, sArc[j]! - sArc[i]!);
  };
  const ALC = 0.35;
  const taza = t0.map((_, i) => { let m = 0; ventana(i, ALC * 1.6, (j, d) => { m = Math.max(m, t0[j]! * Math.max(0, 1 - (d / (ALC * 1.6)) ** 2)); }); return m; });
  const sMin = Math.min(...Object.values(esp).map(e => e.s), 1);
  const capa = Math.min(0.06, Math.max(0.01, 0.12 * sMin));
  const fract = real.map((_, i) => { let c = 0; ventana(i, 0.6, j => { if (t0[j]! > 0) c = 1; }); return c; });
  const suave = (v: number[], sg: number) => v.map((_, i) => { let a = 0, w = 0; ventana(i, sg * 2.5, (j, d) => { const k = Math.exp(-0.5 * (d / sg) ** 2); a += v[j]! * k; w += k; }); return w ? a / w : v[i]!; });
  let tD = suave(taza.map((t, i) => Math.max(t, fract[i]! * capa)), 0.12);
  tD = suave(tD.map((t, i) => Math.max(t, 0.35 * t0[i]!)), 0.04);  // conserva un poco de las puntas, ya matizadas
  tD = tD.map((t, i) => (real[i]![1] < 0.3 ? t * Math.max(0, (real[i]![1] - 0.12) / 0.18) : t)); // se apaga hacia el piso
  const realD = real.map((p, i) => [p[0] + nor[i]![0] * tD[i]!, p[1] + nor[i]![1] * tD[i]!] as P);
  // 3) Las cuñas que quedan dentro del contorno desatado también se fueron con el desatado.
  for (const b of bloques) if (!b.cae) {
    const C: P = [b.pol.reduce((u, p) => u + p[0], 0) / b.pol.length, b.pol.reduce((u, p) => u + p[1], 0) / b.pol.length];
    const prof = dot([C[0] - real[b.ci]![0], C[1] - real[b.ci]![1]], nor[b.ci]!);
    if (prof < tD[b.ci]!) { b.cae = true; b.desatada = true; }
  }
  return { bloques: bloques.map(({ id: _i, ci: _c, ...b }) => b), lineas, real, realD, nor, esp, zi, perno, shot, notas, cortes, phi };
}

/** Envolvente convexa (cadena monótona). */
function envolvente(ps: P[]): P[] {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P[] = [], up: P[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** Resumen por nivel de riesgo y factor de seguridad. */
export function resumen(a: Analisis) {
  const quedan = a.bloques.filter(b => !b.cae);
  const cuenta = (lista: Bloque[], k: 'riesgo0' | 'riesgo') => ({ ALTO: lista.filter(b => b[k] === 'ALTO').length, MEDIO: lista.filter(b => b[k] === 'MEDIO').length, BAJO: lista.filter(b => b[k] === 'BAJO').length });
  const fs = quedan.map(b => b.fs), fs0 = a.bloques.map(b => b.fs0);
  const mayor = a.bloques.reduce<Bloque | null>((m, b) => (!m || b.peso > m.peso ? b : m), null);
  const peor = quedan.reduce<Bloque | null>((m, b) => (!m || b.fs < m.fs ? b : m), null);
  return { antes: cuenta(a.bloques, 'riesgo0'), despues: cuenta(quedan, 'riesgo'), fsMin: fs.length ? Math.min(...fs) : null, fs0Min: fs0.length ? Math.min(...fs0) : null, mayor, peor,
    caida: a.bloques.filter(b => b.modo === 'caida').length, caen: a.bloques.filter(b => b.cae && !b.desatada).length, desatadas: a.bloques.length - quedan.length, quedan: quedan.length, pesoCae: a.bloques.filter(b => b.cae && !b.desatada).reduce((s, b) => s + b.peso, 0) };
}

const nomZona = (z: Bloque['zona']) => (z === 'CORONA' ? 'corona' : z === 'HI' ? 'H.I.' : 'H.D.');
const nomFam = (r: Reporte, n: number) => { const f = familiasMedidas(r).find(x => x.n === n); return f ? `${f.abrev}${n}` : `${n}`; };
export const fsTxt = (fs: number) => (fs > 10 ? '>10' : fs < 0.05 ? '0' : fs.toFixed(2));

/** Vista de la sección para el análisis: ANTES del desatado (sin sostener) o DESPUÉS (shotcrete + pernos).
 *  `aspecto` = ancho/alto del recuadro donde va (la mitad del recuadro del formato ≈ 136/215). */
/** `ptAncho`: ancho del recuadro en puntos donde se dibuja (los textos van en pt fijos), para medir la tarjeta. */
export function vistaCunas(r: Reporte, rmr: RmrZonas, modo: 'antes' | 'despues', aspecto = 136 / 215, compacto = false, ptAncho = 135): Vista | null {
  const a = analizarCunas(r); if (!a || !r.ancho || !r.alto) return null;
  const B = r.ancho, H = r.alto, real = modo === 'despues' ? a.realD : a.real, fams = familiasMedidas(r);
  const lado = Math.max(...a.real.map(p => Math.abs(p[0]))), techo = Math.max(...a.real.map(p => p[1]));
  const zC = a.zi?.corona ?? 0.6, zH = a.zi?.hastial ?? 0.6;
  // ventana: el túnel con su zona de influencia arriba y, bajo el piso, espacio para el panel de resultados
  const fL = Math.max(1, Math.sqrt(aspecto / 0.63)), filas = compacto ? 0.6 : 5.1 * fL; // en recuadros apaisados las líneas de texto piden más alto
  let top = techo + zC + Math.max(0.5, H * 0.16);
  let ancho = 2 * (lado + zH) + B * 0.16, alto = ancho / aspecto;
  const altoMin = (top + 0.12) / (1 - filas * 0.03);
  if (alto < altoMin) { alto = altoMin; ancho = alto * aspecto; }
  // compacto: el túnel centrado en la caja (sin panel abajo)
  if (compacto) { const sobra = alto - (top + 0.12); if (sobra > 0) top += sobra / 2; }
  // recuadro más alto que lo necesario: la sobra va a la roca sobre la corona, así el panel queda pegado abajo sin blanco
  else if (alto > altoMin) top += (alto - altoMin) * 0.92;
  const y0 = top - alto;
  const caja: Vista['caja'] = [-ancho / 2, y0, ancho / 2, top];
  const marco: P[] = [[caja[0], 0], [caja[2], 0], [caja[2], caja[3]], [caja[0], caja[3]]];
  const prims: Prim[] = [], notas: string[] = [], rotF: Prim[] = [];
  const cC = colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD);
  prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], caja[3]], [caja[0], caja[3]]], cerrado: true, relleno: '#FFFFFF' });
  prims.push({ t: 'poly', pts: marco, cerrado: true, relleno: cC, opac: 0.42 });
  // red de trazas (lo que se ve en la roca alrededor de la excavación)
  for (const l of a.lineas) {
    const st = estilo(l.fam);
    for (const [p, q] of tramos(l.a, l.b, marco, real, 200)) prims.push({ t: 'poly', pts: [p, q], borde: l.fam.abrev === 'SD' ? '#5B4636' : st.borde, ancho: l.fam.abrev === 'SD' ? 0.22 : st.ancho, opac: 1 });
  }
  // rótulo de cada falla, veta o contacto sobre su traza (arriba de la corona o en el borde de la ventana)
  for (const l of a.lineas) if (l.fam.abrev !== 'SD') {
    // punto de la traza en la roca, junto a la excavación (donde se lee mejor)
    const tr = tramos(l.a, l.b, marco, real, 400); if (!tr.length) continue;
    const ext = tr.flatMap(([u, w]) => [u, w]).filter(q => q[1] > 0.3);
    if (!ext.length) continue;
    const p = ext.reduce((m, q) => (Math.hypot(q[0], q[1] - H / 2) < Math.hypot(m[0], m[1] - H / 2) ? q : m), ext[0]!);
    const st = estilo(l.fam), sC = a.cortes[l.fam.n];
    const x = Math.min(caja[2] - (caja[2] - caja[0]) * 0.12, Math.max(caja[0] + (caja[2] - caja[0]) * 0.12, p[0])), y = Math.min(p[1], top - (top - caja[1]) * 0.12);
    rotF.push({ t: 'texto', p: [x, y], s: `${l.fam.abrev}${l.fam.n} ${Math.round(l.fam.dip)}°/${dd3(l.fam.dipdir)}°${sC != null ? ` (a ${sC.toFixed(1)} m)` : ''}`, tam: compacto ? 4.4 : 5, negrita: true, color: st.borde, ancla: 'centro', fondo: true });
  }
  // zona de influencia
  const limite = a.real.map((p, i) => { const n = a.nor[i]!, d = n[1] > 0.5 ? zC : zH; return [p[0] + n[0] * d, p[1] + n[1] * d] as P; }).filter(p => p[1] > 0.05);
  // bloques coloreados por riesgo
  // antes: todas las cuñas (las que caen, en rojo oscuro); después: solo las que quedan, ya sostenidas
  for (const b of a.bloques) {
    if (modo === 'despues' && b.cae) continue;
    const c = modo === 'antes' ? (b.cae && !b.desatada ? COLOR_CAE : COLOR_RIESGO[b.riesgo0]) : COLOR_RIESGO[b.riesgo];
    prims.push({ t: 'poly', pts: b.pol, cerrado: true, relleno: c, opac: modo === 'antes' ? 0.78 : 0.55, borde: '#2B1B12', ancho: 0.25 });
  }
  prims.push({ t: 'poly', pts: [...real], cerrado: true, relleno: '#FFFFFF' });
  if (modo === 'despues' && a.bloques.some(b => b.cae)) prims.push({ t: 'poly', pts: a.real, borde: '#8A8A8A', ancho: 0.35, trazos: [1.2, 1] }); // contorno antes del desatado
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
      // pernos de UNA fila: si la indicación dice "Filas = 7x8" (tresbolillo) se dibuja la fila mayor con
      // ese número exacto de pernos, repartidos parejo en el contorno sostenido; si no, cada `esp` m
      const mf = sost.match(/filas?\s*=?\s*(\d+)\s*[x×]\s*(\d+)/) ?? sost.match(/(\d+)\s*pernos?\s*(?:por|\/)\s*fila/);
      const nFila = mf ? Math.max(Number(mf[1]), Number(mf[2] ?? 0)) : 0;
      const acum: number[] = [0];
      for (let i = 1; i < real.length; i++) acum.push(acum[i - 1]! + (real[i]![1] >= H * 0.18 && real[i - 1]![1] >= H * 0.18 ? Math.hypot(real[i]![0] - real[i - 1]![0], real[i]![1] - real[i - 1]![1]) : 0));
      const Ssost = acum.at(-1)!, metas = nFila ? Array.from({ length: nFila }, (_, k) => (Ssost * (k + 0.5)) / nFila) : null;
      let ult = -Infinity, s = 0, km = 0;
      for (let i = 1; i < real.length - 1; i++) {
        s += Math.hypot(real[i]![0] - real[i - 1]![0], real[i]![1] - real[i - 1]![1]);
        const p = real[i]!, n = a.nor[i]!; if (p[1] < H * 0.18) continue;
        if (metas) { if (km >= metas.length || acum[i]! < metas[km]!) continue; km++; } else { if (s - ult < a.perno.esp) continue; ult = s; }
        prims.push({ t: 'poly', pts: [[p[0] - n[0] * e, p[1] - n[1] * e], [p[0] + n[0] * a.perno.largo, p[1] + n[1] * a.perno.largo]], borde: '#000000', ancho: 1.1 });
        prims.push({ t: 'poly', pts: [[p[0] - n[0] * e - n[1] * 0.11, p[1] - n[1] * e + n[0] * 0.11], [p[0] - n[0] * e + n[1] * 0.11, p[1] - n[1] * e - n[0] * 0.11]], borde: '#000000', ancho: 1.4 });
      }
    }
  }
  // títulos
  const w = caja[2] - caja[0], xL = caja[0] + w * 0.04, ln = alto * 0.03 * fL;
  // espacio libre sobre la zona de influencia: red estereográfica (antes) o medidor del FS (después)
  // (en recuadros apaisados no queda alto sobre la corona: va a la derecha del túnel, en la esquina de arriba)
  if (!compacto) {
    const yB = Math.max(...limite.map(p => p[1]), techo) + ln * 0.5, xD = lado + zH + ln * 0.8;
    const zona = top - ln * 2.75 - yB >= (w / ptAncho) * 6.4 * 4.6 ? { x0: caja[0], x1: caja[2], yTop: top - ln * 2.75, yBot: yB, pt: w / ptAncho }
      : { x0: xD, x1: caja[2] - w * 0.02, yTop: top - ln * 0.4, yBot: ln * 0.6, pt: w / ptAncho };
    prims.push(...tarjetaCorona(r, a, modo, fams, zona));
  }
  const tit = compacto ? (modo === 'antes' ? 'ANTES DEL DESATADO' : 'DESPUÉS: SOSTENIDO') : modo === 'antes' ? 'ANTES DEL DESATADO' : 'DESPUÉS: CON SOSTENIMIENTO';
  const sub = modo === 'antes' ? 'sin pernos ni shotcrete · análisis de cuñas' : [a.shot > 0 ? `shotcrete ${(a.shot * 100).toFixed(0)} cm` : 'sin shotcrete', a.perno ? `${a.perno.tipo.toLowerCase()} ${a.perno.pies != null ? a.perno.pies + "'" : a.perno.largo.toFixed(1) + ' m'} ${a.perno.esp}×${a.perno.esp} m${(() => { const m = sost.match(/filas?\s*=?\s*(\d+)\s*[x×]\s*(\d+)/); return m ? ` · filas ${m[1]}/${m[2]} (se ve la de ${Math.max(+m[1]!, +m[2]!)})` : ''; })()}` : 'sin pernos', /malla/.test(sost) ? 'malla' : ''].filter(Boolean).join(' · ');
  prims.push({ t: 'texto', p: [xL, top - ln * 1.1], s: tit, tam: compacto ? 5.2 : 6.2, negrita: true, color: modo === 'antes' ? '#9E1B1B' : '#1B5E20', ancla: 'izq', fondo: true });
  prims.push({ t: 'texto', p: [xL, top - ln * 2.05], s: sub, tam: compacto ? 3.8 : 4.6, color: '#222222', ancla: 'izq', fondo: true });
  // panel de resultados bajo el piso (en modo compacto el resumen va en la leyenda de la hoja)
  if (!compacto) {
  const rs = resumen(a), cnt = modo === 'antes' ? rs.antes : rs.despues, n = a.bloques.length;
  prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], -0.12], [caja[0], -0.12]], cerrado: true, relleno: '#FFFFFF', opac: 0.96 });
  prims.push({ t: 'poly', pts: [[caja[0], -0.12], [caja[2], -0.12]], borde: '#7F7F7F', ancho: 0.4 });
  const fila = (k: number) => -0.12 - ln * (1.05 + k * 1.05);
  const pct = a.zi ? `${Math.round(a.zi.pct * 100)} % (${a.zi.tipo})` : '';
  // corto y de impacto: el FS, una línea de dato y la acción (el detalle va en la hoja de cuñas)
  const lin: { s: string; c?: string; b?: boolean }[] = [];
  const colFs = (f: number) => (f < 1.5 ? COLOR_RIESGO.ALTO : f < 2 ? '#B26B00' : '#1B5E20');
  if (!n) lin.push({ s: 'SIN CUÑAS REMOVIBLES', b: true, c: '#1B5E20' }, { s: pct ? `zona de influencia ${pct}` : '' });
  else if (modo === 'antes') {
    const f0 = rs.fs0Min ?? 0;
    lin.push({ s: `FS SIN SOSTENER: ${fsTxt(f0)}`, c: colFs(f0), b: true });
    lin.push({ s: `${n} cuñas · ${rs.caen} caen al desatar` });
    lin.push({ s: f0 < 1.5 ? '→ Desatar y sostener ya' : '→ Desatar y verificar', c: f0 < 1.5 ? COLOR_RIESGO.ALTO : '#222222', b: true });
  } else {
    const fsC = rs.quedan ? rs.fsMin ?? 0 : null, fsFinal = fsDespues(r, a);
    if (fsFinal != null) lin.push({ s: `FS CON SOSTENIMIENTO: ${fsTxt(fsFinal)}`, c: colFs(fsFinal), b: true });
    lin.push({ s: rs.quedan ? `Queda${rs.quedan === 1 ? '' : 'n'} ${rs.quedan} cuña${rs.quedan === 1 ? '' : 's'} · FS ${fsTxt(fsC ?? 0)}` : 'No quedan cuñas sueltas' });
    const malo = fsFinal != null && fsFinal < 1.5;
    lin.push({ s: malo ? '→ Reforzar el sostenimiento' : '→ Sostenimiento adecuado', c: malo ? COLOR_RIESGO.ALTO : '#1B5E20', b: true });
  }
  lin.forEach((l, k) => { if (l.s) prims.push({ t: 'texto', p: [xL, fila(k)], s: l.s, tam: k === 0 ? 5.2 : 4.6, color: l.c ?? '#111111', negrita: l.b, ancla: 'izq' }); });
  // leyenda de colores
  const ly = fila(lin.length) - ln * 0.15, sw = w * 0.045;
  const ley: [string, string][] = [...(modo === 'antes' ? [[COLOR_CAE, 'Cae FS<1']] as [string, string][] : []), [COLOR_RIESGO.ALTO, modo === 'antes' ? '1–1.5' : 'FS<1.5'], [COLOR_RIESGO.MEDIO, '1.5–2'], [COLOR_RIESGO.BAJO, 'FS≥2']];
  ley.forEach(([c, t], k) => {
    const x = xL + k * w * (modo === 'antes' ? 0.235 : 0.3);
    prims.push({ t: 'poly', pts: [[x, ly], [x + sw, ly], [x + sw, ly + ln * 0.6], [x, ly + ln * 0.6]], cerrado: true, relleno: c, opac: 0.85, borde: '#333333', ancho: 0.3 });
    prims.push({ t: 'texto', p: [x + sw * 1.3, ly + ln * 0.08], s: t, tam: 4.3, ancla: 'izq' });
  });
  }
  // número de cada cuña (el mismo de la tabla y del gráfico)
  const puestos: P[] = [], sep = w * 0.04;
  orden(a).slice(0, 40).forEach((b, i) => {
    if (modo === 'despues' && b.cae) return;
    const c: P = [b.pol.reduce((s, p) => s + p[0], 0) / b.pol.length, b.pol.reduce((s, p) => s + p[1], 0) / b.pol.length];
    if (puestos.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < sep)) return;  // sin montar números
    puestos.push(c);
    prims.push({ t: 'texto', p: [c[0], c[1] - 0.06], s: String(i + 1), tam: 3.6, negrita: true, color: '#111111', ancla: 'centro', fondo: true });
  });
  prims.push(...rotF);
  for (const e of Object.entries(a.esp)) if (e[1].fuente !== 'medido') { notas.push(`Espaciamiento de ${nomFam(r, Number(e[0]))}: ${e[1].s} m (${e[1].fuente}); mídalo para un resultado más fino.`); }
  notas.push(...a.notas);
  return { prims, caja, notas };
}

/** FS final después del desatado: el menor entre la cuña que queda y el sostenimiento global. */
function fsDespues(r: Reporte, a: Analisis): number | null {
  const rs = resumen(a), g = sostenimientoGlobal(r, a), fsC = rs.quedan ? rs.fsMin ?? 0 : null;
  return g ? (fsC != null ? Math.min(g.fs, fsC) : g.fs) : fsC;
}

/** Tarjeta para el espacio libre sobre la corona. Antes: red estereográfica de igual área (hemisferio inferior) con
 *  los planos de cada familia, las intersecciones (ejes de cuña) y el eje de la labor. Después: medidor del FS. */
function tarjetaCorona(r: Reporte, a: Analisis, modo: 'antes' | 'despues', fams: Fam[], o: { x0: number; x1: number; yTop: number; yBot: number; pt: number }): Prim[] {
  const pt = o.pt, ln = pt * 6.4, w = o.x1 - o.x0, hD = o.yTop - o.yBot, xc = (o.x0 + o.x1) / 2;
  if (hD < ln * 4.2) return [];
  const txtW = (s: string, tam: number) => s.length * tam * 0.6 * pt; // ancho aproximado del texto (m)
  const hc = Math.min(hD, ln * 9), pad = ln * 0.45, out: Prim[] = [];
  const caja = (x0: number, x1: number, y0: number, y1: number) => out.push(
    { t: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], cerrado: true, relleno: '#FFFFFF', borde: '#0D2A6B', ancho: 0.45 });
  const circ = (c: P, rr: number, n = 72): P[] => Array.from({ length: n }, (_, i) => [c[0] + rr * Math.cos((2 * Math.PI * i) / n), c[1] + rr * Math.sin((2 * Math.PI * i) / n)] as P);
  if (modo === 'antes') {
    if (fams.length < 1) return [];
    // leyenda completa (familia con dip/dip dir) o corta si el espacio es angosto
    const opc = (corta: boolean) => {
      const ley = fams.slice(0, 6).map(f => corta ? `${f.abrev}${f.n}` : `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°`);
      const ej = corta ? ['eje cuña', 'labor'] : ['eje de cuña', `labor ${dd3(r.azimut ?? 0)}°`];
      const wl = Math.max(...[...ley, ...ej].map(s => txtW(s, 4.3))) + ln * 1.4;
      return { ley, ej, wl, R: Math.min((hc - pad * 2 - ln * 1.1) / 2, (w - pad * 3 - wl) / 2) };
    };
    let L = opc(false); if (L.R < ln * 2.6) { const k = opc(true); if (k.R > L.R) L = k; }
    const { ley, ej, wl, R } = L;
    if (R < ln * 1.5) return [];
    const wc = Math.min(w, pad * 3 + 2 * R + wl), x0 = xc - wc / 2, y0 = o.yTop - hc;
    caja(x0, x0 + wc, y0, o.yTop);
    out.push({ t: 'texto', p: [x0 + pad, o.yTop - ln * 0.85], s: 'RED ESTEREOGRÁFICA', tam: 4.6, negrita: true, color: '#0D2A6B', ancla: 'izq' });
    const c: P = [x0 + pad + R, y0 + pad + R];
    const pr = (tr: number, pl: number): P => { const rr = R * Math.SQRT2 * Math.sin(rad(90 - pl) / 2); return [c[0] + rr * Math.sin(rad(tr)), c[1] + rr * Math.cos(rad(tr))]; };
    out.push({ t: 'poly', pts: circ(c, R), cerrado: true, relleno: '#F4F7FB', borde: '#333333', ancho: 0.45 });
    out.push({ t: 'poly', pts: [[c[0] - R * 0.06, c[1]], [c[0] + R * 0.06, c[1]]], borde: '#999999', ancho: 0.3 }, { t: 'poly', pts: [[c[0], c[1] - R * 0.06], [c[0], c[1] + R * 0.06]], borde: '#999999', ancho: 0.3 });
    out.push({ t: 'poly', pts: [[c[0], c[1] + R], [c[0], c[1] + R * 1.1]], borde: '#333333', ancho: 0.45 });
    out.push({ t: 'texto', p: [c[0] + R * 0.1, c[1] + R * 1.0], s: 'N', tam: 4.2, negrita: true, ancla: 'izq' });
    // eje de la labor
    if (r.azimut != null) out.push({ t: 'poly', pts: [pr(r.azimut + 180, 0), pr(r.azimut, 0)], borde: '#555555', ancho: 0.5, trazos: [1.6, 1] });
    // planos (círculos mayores)
    const vec = (tr: number, pl: number) => [Math.sin(rad(tr)) * Math.cos(rad(pl)), Math.cos(rad(tr)) * Math.cos(rad(pl)), -Math.sin(rad(pl))];
    const lin = (v: number[]): [number, number] => { const n = Math.hypot(v[0]!, v[1]!, v[2]!); let [x, y, z] = v.map(q => q / n) as [number, number, number]; if (z > 0) { x = -x; y = -y; z = -z; } return [(gra(Math.atan2(x, y)) + 360) % 360, gra(Math.asin(-z))]; };
    fams.slice(0, 6).forEach(f => {
      const s = vec(f.dipdir - 90, 0), d = vec(f.dipdir, f.dip), pts: P[] = [];
      for (let k = 0; k <= 48; k++) { const t = (Math.PI * k) / 48; const [tr, pl] = lin([0, 1, 2].map(i => Math.cos(t) * s[i]! + Math.sin(t) * d[i]!)); pts.push(pr(tr, pl)); }
      out.push({ t: 'poly', pts, borde: colorFam(fams, f), ancho: f.abrev === 'SD' ? 0.7 : 1.0 });
    });
    // intersecciones = ejes posibles de cuña
    const nor = (f: Fam) => [Math.sin(rad(f.dip)) * Math.sin(rad(f.dipdir)), Math.sin(rad(f.dip)) * Math.cos(rad(f.dipdir)), Math.cos(rad(f.dip))];
    for (let i = 0; i < Math.min(fams.length, 6); i++) for (let j = i + 1; j < Math.min(fams.length, 6); j++) {
      const p = nor(fams[i]!), q = nor(fams[j]!), x = [p[1]! * q[2]! - p[2]! * q[1]!, p[2]! * q[0]! - p[0]! * q[2]!, p[0]! * q[1]! - p[1]! * q[0]!];
      if (Math.hypot(x[0]!, x[1]!, x[2]!) < 0.05) continue;
      const [tr, pl] = lin(x); out.push({ t: 'poly', pts: circ(pr(tr, pl), R * 0.045, 12), cerrado: true, relleno: '#111111' });
    }
    // leyenda
    const lx = c[0] + R + pad * 1.2; let ly = o.yTop - ln * 2.1;
    const paso = Math.min(ln * 1.05, (o.yTop - ln * 1.6 - y0 - pad) / (ley.length + 2));
    ley.forEach((s, k) => {
      const f = fams[k]!;
      out.push({ t: 'poly', pts: [[lx, ly + ln * 0.22], [lx + ln * 0.9, ly + ln * 0.22]], borde: colorFam(fams, f), ancho: 1.2 });
      out.push({ t: 'texto', p: [lx + ln * 1.15, ly], s, tam: 4.3, ancla: 'izq', negrita: f.abrev !== 'SD', color: f.abrev === 'SD' ? '#111111' : colorFam(fams, f) });
      ly -= paso;
    });
    out.push({ t: 'poly', pts: circ([lx + ln * 0.45, ly + ln * 0.22], ln * 0.17, 12), cerrado: true, relleno: '#111111' });
    out.push({ t: 'texto', p: [lx + ln * 1.15, ly], s: ej[0]!, tam: 4.3, ancla: 'izq' });
    ly -= paso;
    if (r.azimut != null) {
      out.push({ t: 'poly', pts: [[lx, ly + ln * 0.22], [lx + ln * 0.9, ly + ln * 0.22]], borde: '#555555', ancho: 0.5, trazos: [1.6, 1] });
      out.push({ t: 'texto', p: [lx + ln * 1.15, ly], s: ej[1]!, tam: 4.3, ancla: 'izq' });
    }
    return out;
  }
  // después: medidor semicircular del FS (0 a 3; más de 3 = aguja al tope)
  const fs = fsDespues(r, a), fs0 = resumen(a).fs0Min;
  if (fs == null) return [];
  const tx = [`FS ${fsTxt(fs)}`, fs >= 2 ? 'ESTABLE' : fs >= 1.5 ? 'ACEPTABLE' : fs >= 1 ? 'MARGINAL' : 'INESTABLE', `antes ${fsTxt(fs0 ?? 0)} · ahora ${fsTxt(fs)}`];
  const rG = (wt: number) => Math.min((hc - pad * 2 - ln * 1.3) / 1.15, w * 0.22, (w - pad * 3 - wt) / 2.25);
  let wt0 = Math.max(txtW(tx[0]!, 7.5), txtW(tx[2]!, 4.3)) + pad;
  if (rG(wt0) < ln * 2.2) { const k = Math.max(txtW(tx[0]!, 7.5), txtW(tx[1]!, 5)) + pad; if (rG(k) > rG(wt0)) { wt0 = k; tx[2] = ''; } }
  const R = rG(wt0);
  if (R < ln * 1.2) return [];
  const wt = wt0 + R * 0.45;
  const wc = Math.min(w, pad * 3 + 2 * R + wt), x0 = xc - wc / 2, y0 = o.yTop - hc;
  caja(x0, x0 + wc, y0, o.yTop);
  out.push({ t: 'texto', p: [x0 + pad, o.yTop - ln * 0.85], s: 'FACTOR DE SEGURIDAD', tam: 4.6, negrita: true, color: '#0D2A6B', ancla: 'izq' });
  const c: P = [x0 + pad + R * 1.15, y0 + pad + ln * 0.5], MAX = 3, ang = (v: number) => Math.PI * (1 - Math.min(MAX, Math.max(0, v)) / MAX);
  const arco = (v0: number, v1: number, r0: number, r1: number): P[] => {
    const n = 16, ex: P[] = [], inn: P[] = [];
    for (let k = 0; k <= n; k++) { const t = ang(v0 + ((v1 - v0) * k) / n); ex.push([c[0] + r1 * Math.cos(t), c[1] + r1 * Math.sin(t)]); inn.push([c[0] + r0 * Math.cos(t), c[1] + r0 * Math.sin(t)]); }
    return [...ex, ...inn.reverse()];
  };
  ([[0, 1, COLOR_CAE], [1, 1.5, COLOR_RIESGO.ALTO], [1.5, 2, COLOR_RIESGO.MEDIO], [2, MAX, COLOR_RIESGO.BAJO]] as [number, number, string][])
    .forEach(([v0, v1, col]) => out.push({ t: 'poly', pts: arco(v0, v1, R * 0.62, R), cerrado: true, relleno: col, borde: '#FFFFFF', ancho: 0.3 }));
  [0, 1, 1.5, 2, 3].forEach(v => { const t = ang(v); out.push({ t: 'texto', p: [c[0] + R * 1.16 * Math.cos(t), c[1] + R * 1.1 * Math.sin(t) + (Math.sin(t) < 0.2 ? ln * 0.25 : -ln * 0.1)], s: v === 3 ? '3+' : String(v), tam: 3.6, ancla: 'centro', color: '#333333' }); });
  if (fs0 != null) { const t = ang(fs0); out.push({ t: 'poly', pts: [[c[0] + R * 0.5 * Math.cos(t), c[1] + R * 0.5 * Math.sin(t)], [c[0] + R * 1.02 * Math.cos(t), c[1] + R * 1.02 * Math.sin(t)]], borde: '#7A7A7A', ancho: 0.6, trazos: [1, 0.8] }); }
  const t = ang(fs), q = R * 0.09;
  out.push({ t: 'poly', pts: [[c[0] + R * 0.92 * Math.cos(t), c[1] + R * 0.92 * Math.sin(t)], [c[0] - q * Math.sin(t), c[1] + q * Math.cos(t)], [c[0] + q * Math.sin(t), c[1] - q * Math.cos(t)]], cerrado: true, relleno: '#111111' });
  out.push({ t: 'poly', pts: circ(c, q * 1.3, 16), cerrado: true, relleno: '#111111' });
  const col = fs >= 2 ? '#1B5E20' : fs >= 1.5 ? '#B26B00' : COLOR_RIESGO.ALTO, tx0 = c[0] + R * 1.3 + pad * 1.1, ym = c[1] + R * 0.5;
  out.push({ t: 'texto', p: [tx0, ym + ln * 0.35], s: tx[0]!, tam: 7.5, negrita: true, color: col, ancla: 'izq' });
  out.push({ t: 'texto', p: [tx0, ym - ln * 0.85], s: tx[1]!, tam: 5, negrita: true, color: col, ancla: 'izq' });
  if (tx[2]) out.push({ t: 'texto', p: [tx0, ym - ln * 1.95], s: tx[2]!, tam: 4.3, color: '#333333', ancla: 'izq' });
  return out;
}

/** Gráfico del factor de seguridad de cada cuña, antes (sin sostener) y después (con sostenimiento), en escala
 *  logarítmica, con las franjas de riesgo. Unidades del gráfico: x 0–100, y 0–60. */
const orden = (a: Analisis) => [...a.bloques].sort((x, y) => x.fs0 - y.fs0 || (x.cae ? 0 : x.fs) - (y.cae ? 0 : y.fs) || y.peso - x.peso);
export function graficoFS(r: Reporte, aspecto = 100 / 60, compacto = false): Vista | null {
  const a = analizarCunas(r); if (!a || !a.bloques.length) return null;
  const bl = orden(a).slice(0, 40);
  const AN = Math.max(70, 60 * aspecto), X0 = 9 * Math.min(1, 100 / AN) + 2, X1 = AN - 14, Y0 = 9, Y1 = compacto ? 51 : 52, lo = Math.log10(0.1), hi = Math.log10(100);
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
    barra(x - wB, b.fs0 < 0.1 ? 0.1 : b.fs0, b.cae && !b.desatada ? COLOR_CAE : COLOR_RIESGO[b.riesgo0], 0.55);
    if (b.cae) prims.push({ t: 'texto', p: [x + wB / 2, Y0 + 1], s: 'D', tam: 3.6, ancla: 'centro', color: '#555555', negrita: true });
    else barra(x, b.fs, COLOR_RIESGO[b.riesgo], 0.95);
    if (b.fs0 < 0.1) prims.push({ t: 'texto', p: [x - wB / 2, Y0 + 1], s: '0', tam: 3.6, ancla: 'centro', color: '#9E1B1B', negrita: true });
    if (bl.length <= 24 || i % 2 === 0) prims.push({ t: 'texto', p: [x, Y0 - 3], s: `${i + 1}`, tam: 3.8, ancla: 'centro', color: '#333333' });
  });
  prims.push({ t: 'poly', pts: [[X0, Y1], [X0, Y0], [X1, Y0]], borde: '#000000', ancho: 0.5 });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y(2) + Y1) / 2], s: 'RIESGO BAJO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.BAJO });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y0 + Y(1.5)) / 2], s: 'RIESGO ALTO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.ALTO });
  if (!compacto) prims.push({ t: 'texto', p: [X0, 56.5], s: 'FACTOR DE SEGURIDAD POR CUÑA (2D, por metro de labor)', tam: 6, negrita: true, ancla: 'izq', color: '#0D2A6B' });
  prims.push({ t: 'texto', p: [X0, compacto ? 55.5 : 53.3], s: 'Barra clara: antes del desatado (sin sostener) · barra fuerte: con shotcrete y pernos · D: cae y se desata', tam: 4.4, ancla: 'izq', color: '#333333' });
  prims.push({ t: 'texto', p: [(X0 + X1) / 2, 1.6], s: 'Cuñas ordenadas de menor a mayor FS sin sostener (n° de la tabla)', tam: 4.4, ancla: 'centro', color: '#333333' });
  prims.push({ t: 'texto', p: [2.2, (Y0 + Y1) / 2], s: 'FS', tam: 5, negrita: true, ancla: 'centro' });
  return { prims, caja: [0, 0, AN, 60], notas: [] };
}

/** Filas de la tabla de cuñas (mismo orden que el gráfico). */
export function tablaCunas(r: Reporte) {
  const a = analizarCunas(r); if (!a) return [];
  return orden(a).slice(0, 40).map((b, i) => ({
    n: i + 1, zona: nomZona(b.zona), familias: b.familias.map(x => nomFam(r, x)).join(' + '), prof: b.prof, peso: b.peso,
    modo: b.modo === 'caida' ? 'caída libre' : `desliza ${Math.round(b.psi)}°`, fs0: b.fs0, fs: b.fs, riesgo0: b.riesgo0, riesgo: b.riesgo, cae: b.cae, desatada: !!b.desatada,
  }));
}

/** Datos de la zona de influencia para textos (tipo y %). */
export function tipoAnalisis(r: Reporte) {
  const v = rmrTotal(r.rmr.CORONA, r.ajuste.CORONA); return v != null ? tipoRoca(v) : r.tipoGeologo ?? null;
}
export type { Zona };

/** Las dos secciones (antes | después) lado a lado en un solo SVG de W × H. */
export function seccionDobleSvg(r: Reporte, rmr: RmrZonas, W: number, H: number): string | null {
  const a = vistaCunas(r, rmr, 'antes', (W / 2) / H, false, 280), d = vistaCunas(r, rmr, 'despues', (W / 2) / H, false, 280);
  if (!a || !d) return null;
  const sub = (v: Vista, x: number) => aSvg(v, W / 2, H).replace('<svg ', `<svg x="${x}" y="0" width="${W / 2}" height="${H}" `).replace(' width="100%"', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="background:#fff">${sub(a, 0)}${sub(d, W / 2)}<line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="#000" stroke-width="1.2"/></svg>`;
}

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
//    (densidad 1/esp² × base del bloque, solo si anclan ≥ 0.5 m detrás) y corte del shotcrete (τ = 0.35 MPa).
// Es un análisis 2D de la sección: para el factor de seguridad 3D de una cuña con tres planos use Unwedge.
import { rmrTotal, tipoRoca, type Zona } from '../core/rmr';
import type { Reporte } from '../model';
import {
  aSvg, aparente, azar, trazaSeccion, colorTipo, dd3, espesorShotcrete, estilo, familiasMedidas, pernoInfo, seccionReal, seccionTeorica,
  tramos, zonaInfluencia, type Fam, type P, type Prim, type RmrZonas, type Vista,
} from './croquis';

const rad = (g: number) => (g * Math.PI) / 180, gra = (r: number) => (r * 180) / Math.PI;
const GAMMA = 2.7, PHI = 30, TAU = 35; // t/m³, °, t/m²
export type Nivel = 'ALTO' | 'MEDIO' | 'BAJO';
export const nivel = (fs: number): Nivel => (fs >= 2 ? 'BAJO' : fs >= 1.5 ? 'MEDIO' : 'ALTO');
export const COLOR_RIESGO: Record<Nivel, string> = { ALTO: '#D32F2F', MEDIO: '#F59E0B', BAJO: '#2E9D4F' };
export const COLOR_CAE = '#6E0B0B';

export interface Bloque {
  zona: 'CORONA' | 'HI' | 'HD'; familias: number[]; pol: P[]; area: number; peso: number; prof: number; base: number; phi: number;
  modo: 'caida' | 'desliza'; psi: number; fs0: number; fs: number; riesgo0: Nivel; riesgo: Nivel; pernos: number; anclan: boolean;
  cae: boolean; // FS sin sostener < 1: cae al desatar
  desatada?: boolean; // no caía sola, pero el desatador la saca al perfilar el contorno
}
export interface Analisis {
  bloques: Bloque[]; lineas: { fam: Fam; a: P; b: P }[]; real: P[]; realD: P[]; nor: P[]; esp: Record<number, { s: number; s2d: number; fuente: string }>;
  zi: ReturnType<typeof zonaInfluencia>; perno: ReturnType<typeof pernoInfo>; shot: number; notas: string[]; phi: Record<Zona, { v: number; fuente: string }>;
}

/** Espaciamiento (m) representativo de la clase del RMR (puntaje 20/15/10/8/5). */
export const espDeRmr = (pts: number | null | undefined) => pts == null ? null : pts >= 20 ? 2.5 : pts >= 15 ? 1.0 : pts >= 10 ? 0.4 : pts >= 8 ? 0.13 : 0.05;
const MAX_LINEAS = 90, MAX_BLOQUES = 400;

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
  const esp: Analisis['esp'] = {}, lineas: Analisis['lineas'] = [];
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
    const fija = f.abrev === 'SD' ? null : trazaSeccion(f, r); // falla/veta/contacto movida a mano en la planta
    const azarF = f.abrev === 'SD' ? 0 : rnd(); // mismo orden de azar que antes: la red de diaclasas no cambia al mover una falla
    const offs = f.abrev === 'SD' ? (() => { const o: number[] = []; for (let c = c0 - R + rnd() * paso; c <= c0 + R; c += paso) o.push(c); return o; })() : [fija ? n[0] * fija.o[0] + n[1] * fija.o[1] : c0 + (azarF - 0.5) * B * 0.4];
    for (const c of offs) {
      const o: P = [n[0] * c + d[0] * (d[0] * cx + d[1] * cy), n[1] * c + d[1] * (d[0] * cx + d[1] * cy)];
      lineas.push({ fam: f, a: [o[0] - d[0] * R * 1.5, o[1] - d[1] * R * 1.5], b: [o[0] + d[0] * R * 1.5, o[1] + d[1] * R * 1.5] });
    }
  }

  // ---- grilla de la roca alrededor de la excavación ----
  const lado = Math.max(...real.map(p => Math.abs(p[0]))), techo = Math.max(...real.map(p => p[1]));
  const zC = lim('CORONA'), zH = lim('HI');
  const X0 = -(lado + zH + 0.2), X1 = lado + zH + 0.2, Y0 = 0, Y1 = techo + zC + 0.2;
  const px = Math.max(0.012, Math.max(X1 - X0, Y1 - Y0) / 650), nx = Math.ceil((X1 - X0) / px), ny = Math.ceil((Y1 - Y0) / px), NT = nx * ny;
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
  return { bloques: bloques.map(({ id: _i, ci: _c, ...b }) => b), lineas, real, realD, nor, esp, zi, perno, shot, notas, phi };
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
export const fsTxt = (fs: number) => (fs >= 99 ? '>99' : fs < 0.05 ? '0' : fs.toFixed(fs < 10 ? 2 : 1));

/** Vista de la sección para el análisis: ANTES del desatado (sin sostener) o DESPUÉS (shotcrete + pernos).
 *  `aspecto` = ancho/alto del recuadro donde va (la mitad del recuadro del formato ≈ 136/215). */
export function vistaCunas(r: Reporte, rmr: RmrZonas, modo: 'antes' | 'despues', aspecto = 136 / 215, compacto = false): Vista | null {
  const a = analizarCunas(r); if (!a || !r.ancho || !r.alto) return null;
  const B = r.ancho, H = r.alto, real = modo === 'despues' ? a.realD : a.real, fams = familiasMedidas(r);
  const lado = Math.max(...a.real.map(p => Math.abs(p[0]))), techo = Math.max(...a.real.map(p => p[1]));
  const zC = a.zi?.corona ?? 0.6, zH = a.zi?.hastial ?? 0.6;
  // ventana: el túnel con su zona de influencia arriba y, bajo el piso, espacio para el panel de resultados
  const filas = compacto ? 0.6 : 9.5 + Math.ceil(fams.length / 2);
  let top = techo + zC + Math.max(0.5, H * 0.16);
  let ancho = 2 * (lado + zH) + B * 0.16, alto = ancho / aspecto;
  const altoMin = (top + 0.12) / (1 - filas * 0.03);
  if (alto < altoMin) { alto = altoMin; ancho = alto * aspecto; }
  // compacto: el túnel centrado en la caja (sin panel abajo)
  if (compacto) { const sobra = alto - (top + 0.12); if (sobra > 0) top += sobra / 2; }
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
  const tit = compacto ? (modo === 'antes' ? 'ANTES DEL DESATADO' : 'DESPUÉS: SOSTENIDO') : modo === 'antes' ? 'ANTES DEL DESATADO' : 'DESPUÉS: CON SOSTENIMIENTO';
  const sub = modo === 'antes' ? 'sin pernos ni shotcrete · análisis de cuñas' : [a.shot > 0 ? `shotcrete ${(a.shot * 100).toFixed(0)} cm` : 'sin shotcrete', a.perno ? `${a.perno.tipo.toLowerCase()} ${a.perno.pies != null ? a.perno.pies + "'" : a.perno.largo.toFixed(1) + ' m'} ${a.perno.esp}×${a.perno.esp} m` : 'sin pernos', /malla/.test(sost) ? 'malla' : ''].filter(Boolean).join(' · ');
  prims.push({ t: 'texto', p: [xL, top - ln * 1.1], s: tit, tam: compacto ? 5.2 : 6.2, negrita: true, color: modo === 'antes' ? '#9E1B1B' : '#1B5E20', ancla: 'izq', fondo: true });
  prims.push({ t: 'texto', p: [xL, top - ln * 2.05], s: sub, tam: compacto ? 3.8 : 4.6, color: '#222222', ancla: 'izq', fondo: true });
  // panel de resultados bajo el piso (en modo compacto el resumen va en la leyenda de la hoja)
  if (!compacto) {
  const rs = resumen(a), cnt = modo === 'antes' ? rs.antes : rs.despues, n = a.bloques.length;
  prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], -0.12], [caja[0], -0.12]], cerrado: true, relleno: '#FFFFFF', opac: 0.96 });
  prims.push({ t: 'poly', pts: [[caja[0], -0.12], [caja[2], -0.12]], borde: '#7F7F7F', ancho: 0.4 });
  const fila = (k: number) => -0.12 - ln * (1.05 + k * 1.05);
  const pct = a.zi ? `${Math.round(a.zi.pct * 100)} % (${a.zi.tipo})` : '';
  const lin: { s: string; c?: string; b?: boolean }[] = [];
  if (!n) lin.push({ s: 'No se forman cuñas removibles', b: true }, { s: pct ? `dentro de la zona de influencia ${pct}` : '' });
  else if (modo === 'antes') {
    const ph = a.phi.CORONA;
    lin.push({ s: `${n} cuñas potenciales${pct ? ` · zona infl. ${pct}` : ''}`, b: true });
    lin.push({ s: `CAEN al desatar ${rs.caen} (${rs.pesoCae.toFixed(2)} t/m) · ALTO ${cnt.ALTO - rs.caen} · MEDIO ${cnt.MEDIO} · BAJO ${cnt.BAJO}`, c: rs.caen || cnt.ALTO ? COLOR_RIESGO.ALTO : cnt.MEDIO ? '#B26B00' : COLOR_RIESGO.BAJO, b: true });
    lin.push({ s: `${rs.caida} en caída libre · φ caras ${Math.round(ph.v)}° (${ph.fuente})` });
    if (rs.mayor) lin.push({ s: `Mayor: ${nomZona(rs.mayor.zona)} ${rs.mayor.familias.map(x => nomFam(r, x)).join('+')} · h ${rs.mayor.prof.toFixed(2)} m · ${rs.mayor.peso.toFixed(2)} t/m` });
    lin.push({ s: cnt.ALTO ? '→ Desatar y sostener de inmediato' : '→ Desatar y verificar', c: cnt.ALTO ? COLOR_RIESGO.ALTO : '#222222', b: true });
  } else {
    if (rs.desatadas) lin.push({ s: `${rs.desatadas} desatadas · contorno perfilado (trazos = antes)`, b: true });
    lin.push({ s: rs.quedan ? `${rs.quedan} quedan · FS mín ${fsTxt(rs.fsMin ?? 0)} · ${rs.peor ? `${nomZona(rs.peor.zona)} ${rs.peor.familias.map(x => nomFam(r, x)).join('+')}` : ''}` : 'No quedan cuñas sueltas', b: true });
    lin.push({ s: `RIESGO ALTO ${cnt.ALTO} · MEDIO ${cnt.MEDIO} · BAJO ${cnt.BAJO}`, c: cnt.ALTO ? COLOR_RIESGO.ALTO : cnt.MEDIO ? '#B26B00' : COLOR_RIESGO.BAJO, b: true });
    lin.push({ s: `Shotcrete: ${(2 * a.shot * TAU).toFixed(1)} t/m de corte en los bordes` });
    if (a.perno) lin.push({ s: `Pernos: ${a.perno.cap} t c/u · ${a.bloques.filter(b => !b.cae && b.anclan).length} de ${rs.quedan} cuñas quedan ancladas` });
    lin.push({ s: cnt.ALTO || cnt.MEDIO ? '→ Reforzar donde sale ALTO/MEDIO' : '→ Sostenimiento adecuado', c: cnt.ALTO || cnt.MEDIO ? COLOR_RIESGO.ALTO : '#1B5E20', b: true });
  }
  lin.forEach((l, k) => { if (l.s) prims.push({ t: 'texto', p: [xL, fila(k)], s: l.s, tam: 4.6, color: l.c ?? '#111111', negrita: l.b, ancla: 'izq' }); });
  // leyenda de colores
  const ly = fila(lin.length) - ln * 0.15, sw = w * 0.045;
  const ley: [string, string][] = [...(modo === 'antes' ? [[COLOR_CAE, 'Cae FS<1']] as [string, string][] : []), [COLOR_RIESGO.ALTO, modo === 'antes' ? '1–1.5' : 'FS<1.5'], [COLOR_RIESGO.MEDIO, '1.5–2'], [COLOR_RIESGO.BAJO, 'FS≥2']];
  ley.forEach(([c, t], k) => {
    const x = xL + k * w * (modo === 'antes' ? 0.235 : 0.3);
    prims.push({ t: 'poly', pts: [[x, ly], [x + sw, ly], [x + sw, ly + ln * 0.6], [x, ly + ln * 0.6]], cerrado: true, relleno: c, opac: 0.85, borde: '#333333', ancho: 0.3 });
    prims.push({ t: 'texto', p: [x + sw * 1.3, ly + ln * 0.08], s: t, tam: 4.3, ancla: 'izq' });
  });
  // estructuras (2 por fila) con su espaciamiento, al pie del panel
  const ft = fams.map(f => { const e = a.esp[f.n]; return `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${e ? ` s ${e.s} m` : ''}`; });
  for (let k = 0; k < ft.length; k += 2) prims.push({ t: 'texto', p: [xL, ly - ln * (1.1 + (k / 2) * 0.95)], s: ft.slice(k, k + 2).join('   ·   '), tam: 4.2, color: '#333333', ancla: 'izq' });
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
  for (const e of Object.entries(a.esp)) if (e[1].fuente !== 'medido') { notas.push(`Espaciamiento de ${nomFam(r, Number(e[0]))}: ${e[1].s} m (${e[1].fuente}); mídalo para un resultado más fino.`); }
  notas.push(...a.notas);
  return { prims, caja, notas };
}

/** Gráfico del factor de seguridad de cada cuña, antes (sin sostener) y después (con sostenimiento), en escala
 *  logarítmica, con las franjas de riesgo. Unidades del gráfico: x 0–100, y 0–60. */
const orden = (a: Analisis) => [...a.bloques].sort((x, y) => x.fs0 - y.fs0 || (x.cae ? 0 : x.fs) - (y.cae ? 0 : y.fs) || y.peso - x.peso);
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
    barra(x - wB, b.fs0 < 0.1 ? 0.1 : b.fs0, b.cae && !b.desatada ? COLOR_CAE : COLOR_RIESGO[b.riesgo0], 0.55);
    if (b.cae) prims.push({ t: 'texto', p: [x + wB / 2, Y0 + 1], s: 'D', tam: 3.6, ancla: 'centro', color: '#555555', negrita: true });
    else barra(x, b.fs, COLOR_RIESGO[b.riesgo], 0.95);
    if (b.fs0 < 0.1) prims.push({ t: 'texto', p: [x - wB / 2, Y0 + 1], s: '0', tam: 3.6, ancla: 'centro', color: '#9E1B1B', negrita: true });
    if (bl.length <= 24 || i % 2 === 0) prims.push({ t: 'texto', p: [x, Y0 - 3], s: `${i + 1}`, tam: 3.8, ancla: 'centro', color: '#333333' });
  });
  prims.push({ t: 'poly', pts: [[X0, Y1], [X0, Y0], [X1, Y0]], borde: '#000000', ancho: 0.5 });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y(2) + Y1) / 2], s: 'RIESGO BAJO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.BAJO });
  prims.push({ t: 'texto', p: [X1 + 0.8, (Y0 + Y(1.5)) / 2], s: 'RIESGO ALTO', tam: 4.4, negrita: true, ancla: 'izq', color: COLOR_RIESGO.ALTO });
  prims.push({ t: 'texto', p: [X0, 56.5], s: 'FACTOR DE SEGURIDAD POR CUÑA (2D, por metro de labor)', tam: 6, negrita: true, ancla: 'izq', color: '#0D2A6B' });
  prims.push({ t: 'texto', p: [X0, 53.3], s: 'Barra clara: antes del desatado (sin sostener) · barra fuerte: con shotcrete y pernos · D: cae y se desata', tam: 4.4, ancla: 'izq', color: '#333333' });
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
  const a = vistaCunas(r, rmr, 'antes', (W / 2) / H), d = vistaCunas(r, rmr, 'despues', (W / 2) / H);
  if (!a || !d) return null;
  const sub = (v: Vista, x: number) => aSvg(v, W / 2, H).replace('<svg ', `<svg x="${x}" y="0" width="${W / 2}" height="${H}" `).replace(' width="100%"', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="background:#fff">${sub(a, 0)}${sub(d, W / 2)}<line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="#000" stroke-width="1.2"/></svg>`;
}

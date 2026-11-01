// Vista PLANTA y vista SECCIÓN de la ficha AESA, calculadas con los datos del reporte y dibujadas con la
// simbología que usa el geomecánico en sus fichas (126 fichas revisadas, abr-2026):
//  - Planta (norte arriba): hastiales de la labor, último avance coloreado por tipo de roca, frente con
//    contorno grueso; cada estructura como recta de rumbo numerada con su símbolo de buzamiento
//    (tick hacia la dirección de buzamiento + valor) y su rótulo dip/dip dir. Fallas en rojo, vetas en verde,
//    contactos a trazos.
//  - Sección (mirando el frente): contorno teórico a trazos y contorno REAL con la sobre/subexcavación
//    medida por zona; roca coloreada por el tipo de roca de cada zona (H.I., corona, H.D.); red de trazas
//    cortas de cada familia con su buzamiento aparente en el plano del frente; fallas con su potencia;
//    cuñas potenciales (análisis 2D en la sección) con altura, área y peso por metro; malla, shotcrete y
//    pernos según las indicaciones de sostenimiento.
import { TIPOS, tipoRoca, type Zona } from '../core/rmr';
import type { Familia, Reporte } from '../model';

export type P = [number, number];
export type Prim =
  | { t: 'poly'; pts: P[]; cerrado?: boolean; relleno?: string; borde?: string; ancho?: number; opac?: number; trazos?: number[] }
  | { t: 'texto'; p: P; s: string; tam?: number; color?: string; ancla?: 'izq' | 'centro' | 'der'; negrita?: boolean; fondo?: boolean };
export interface Vista { prims: Prim[]; caja: [number, number, number, number]; notas: string[] } // caja en m: xmin, ymin, xmax, ymax
export type RmrZonas = Partial<Record<Zona, number | null>>;

const rad = (g: number) => (g * Math.PI) / 180, gra = (r: number) => (r * 180) / Math.PI;
const TINTA = '#0D2A6B', GRIS = '#4A4A4A', ROJO = '#C00000', VERDE = '#1B7A3A';
const GAMMA = 2.7; // t/m³, peso unitario de la roca para el peso de las cuñas

/** Familia numerada con su orientación medida. */
export interface Fam { n: number; abrev: string; dip: number; dipdir: number; potencia: number | null }
export const familiasMedidas = (r: Reporte): Fam[] =>
  r.familias.map((f: Familia, i) => ({ n: i + 1, abrev: f.abrev, dip: f.dip!, dipdir: f.dipdir!, potencia: f.potencia ?? null }))
    .filter(f => f.dip != null && f.dipdir != null);
const dd3 = (x: number) => String(Math.round(((x % 360) + 360) % 360)).padStart(3, '0');
export const rotulo = (f: Fam) => `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°`;
const estilo = (f: Fam) => f.abrev === 'F' ? { borde: ROJO, ancho: 1.1 } : f.abrev === 'V' ? { borde: VERDE, ancho: 0.9 } : f.abrev === 'C' ? { borde: TINTA, ancho: 0.7, trazos: [3, 1.5] } : { borde: '#111111', ancho: 0.5 };

/** Buzamiento aparente (°) de un plano en el plano vertical del frente, y si baja hacia la derecha. */
export function aparente(dip: number, dipdir: number, azimut: number): { ang: number; bajaDerecha: boolean } {
  const c = Math.cos(rad(dipdir - (azimut + 90)));        // rumbo del frente: azimut + 90° (derecha del observador)
  const ang = gra(Math.atan(Math.tan(rad(Math.min(dip, 89.9))) * Math.abs(c)));
  return { ang, bajaDerecha: c > 0 };
}

export function colorTipo(rmr: number | null | undefined): string {
  if (rmr == null) return '#C9C9C9';
  return TIPOS.find(t => t.tipo === tipoRoca(rmr))?.color ?? '#C9C9C9';
}

// ---------- geometría ----------
export function dentro(p: P, pol: P[]): boolean {
  let s = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i]!, [xj, yj] = pol[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}
const area = (pol: P[]) => Math.abs(pol.reduce((a, p, i) => { const q = pol[(i + 1) % pol.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function cruce(a: P, da: P, b: P, db: P): P | null {
  const den = da[0] * db[1] - da[1] * db[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den; return [a[0] + da[0] * t, a[1] + da[1] * t];
}
/** Partes de a→b dentro de `fuera` y fuera de `hueco` (muestreo fino). */
function tramos(a: P, b: P, fuera: P[], hueco: P[] | null, n = 220): [P, P][] {
  const out: [P, P][] = []; let ini: P | null = null, ult: P | null = null;
  for (let i = 0; i <= n; i++) {
    const p: P = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
    if (dentro(p, fuera) && !(hueco && dentro(p, hueco))) { ini ??= p; ult = p; }
    else { if (ini && ult && ini !== ult) out.push([ini, ult]); ini = ult = null; }
  }
  if (ini && ult && ini !== ult) out.push([ini, ult]);
  return out;
}

/** Sección teórica: hastiales verticales + bóveda; base en y = 0. Devuelve puntos y la zona de cada uno. */
export function seccionTeorica(B: number, H: number): { pts: P[]; zona: Zona[]; normal: P[] } {
  const f = Math.min(H * 0.45, B * 0.31), hw = H - f, a = B / 2;
  const pts: P[] = [], zona: Zona[] = [], normal: P[] = [];
  for (let i = 0; i <= 8; i++) { pts.push([-a, (hw * i) / 8]); zona.push('HI'); normal.push([-1, 0]); }
  for (let i = 1; i < 30; i++) {
    const t = Math.PI - (Math.PI * i) / 30, p: P = [a * Math.cos(t), hw + f * Math.sin(t)];
    const n0: P = [Math.cos(t) / a, Math.sin(t) / f], nn = Math.hypot(...n0);
    pts.push(p); normal.push([n0[0] / nn, n0[1] / nn]); zona.push(t > Math.PI * 0.8 ? 'HI' : t < Math.PI * 0.2 ? 'HD' : 'CORONA');
  }
  for (let i = 8; i >= 0; i--) { pts.push([a, (hw * i) / 8]); zona.push('HD'); normal.push([1, 0]); }
  return { pts, zona, normal };
}
/** Contorno real: el teórico desplazado por la sobreexcavación (+) o subexcavación (−) medida en cada zona. */
export function seccionReal(B: number, H: number, sobre: Partial<Record<Zona, number | null>> = {}): P[] {
  const { pts, zona, normal } = seccionTeorica(B, H), n = pts.length;
  const d0 = zona.map(z => sobre[z] ?? 0);
  // suavizar el paso entre zonas (promedio móvil) para que el contorno no tenga escalones
  const d = d0.map((_, i) => { let s = 0, k = 0; for (let j = -3; j <= 3; j++) { const v = d0[i + j]; if (v != null) { s += v; k++; } } return s / k; });
  return pts.map((p, i) => i === 0 || i === n - 1 ? [p[0] + normal[i]![0] * d[i]!, p[1]] as P : [p[0] + normal[i]![0] * d[i]!, p[1] + normal[i]![1] * d[i]!] as P);
}

const longPerno = (txt: string) => /(\d+(?:[.,]\d+)?)\s*(pies|ft|')/i.test(txt) ? Number(RegExp.$1.replace(',', '.')) * 0.3048 : /(\d(?:[.,]\d+)?)\s*m\b/.test(txt) ? Number(RegExp.$1.replace(',', '.')) : null;

// ---------- PLANTA ----------
export function vistaPlanta(r: Reporte, rmr: RmrZonas, norte = true): Vista | null {
  if (r.azimut == null) return null;
  const B = r.ancho ?? 5, L = Math.max(3.2 * B, 14), av = Math.min(Math.max(r.avance ?? 3, 1.5), B * 1.2), az = rad(r.azimut);
  const u: P = [Math.sin(az), Math.cos(az)], v: P = [Math.cos(az), -Math.sin(az)];   // u: avance, v: derecha
  const en = (s: number, t: number): P => [u[0] * s + v[0] * t, u[1] * s + v[1] * t];
  const rr = B * 0.18;  // esquinas redondeadas del frente
  const esquina = (c: P, t0: number): P[] => Array.from({ length: 7 }, (_, i) => { const t = t0 + (Math.PI / 2) * (i / 6); return en(c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)); });
  // en coordenadas (s: avance, t: derecha): esquina izquierda centrada en (-rr, -B/2+rr), derecha en (-rr, B/2-rr)
  const frente: P[] = [en(-av, -B / 2), ...esquina([-rr, -B / 2 + rr], -Math.PI / 2), ...esquina([-rr, B / 2 - rr], 0), en(-av, B / 2)];
  const prims: Prim[] = [
    { t: 'poly', pts: frente, cerrado: true, relleno: colorTipo(rmr.CORONA), opac: 0.55 },
    { t: 'poly', pts: [en(-L, -B / 2), en(-av, -B / 2)], borde: '#000000', ancho: 0.7 },
    { t: 'poly', pts: [en(-L, B / 2), en(-av, B / 2)], borde: '#000000', ancho: 0.7 },
    { t: 'poly', pts: frente.slice(1, -1), borde: '#000000', ancho: 1.3 },
    { t: 'poly', pts: [en(-av, -B / 2), en(-av, B / 2)], borde: GRIS, ancho: 0.4, trazos: [2, 1.5] },
  ];
  const fams = familiasMedidas(r), R = B * 1.35;
  fams.forEach((f, k) => {
    const st = estilo(f), rumbo = rad(f.dipdir - 90), d: P = [Math.sin(rumbo), Math.cos(rumbo)];
    // cada estructura pasa por el último avance, repartidas a lo ancho para que no se tapen
    const fr = (k + 0.5) / Math.max(1, fams.length), o = en(-av * 0.5 - (fr - 0.5) * B * 0.9, B * (-0.32 + 0.64 * fr));
    const a: P = [o[0] - d[0] * R, o[1] - d[1] * R], b: P = [o[0] + d[0] * R, o[1] + d[1] * R];
    if (f.potencia && f.potencia > 0.05) { // falla o veta con potencia: banda
      const w = Math.max(f.potencia, B * 0.03) / 2, nn: P = [-d[1], d[0]];
      prims.push({ t: 'poly', pts: [[a[0] + nn[0] * w, a[1] + nn[1] * w], [b[0] + nn[0] * w, b[1] + nn[1] * w], [b[0] - nn[0] * w, b[1] - nn[1] * w], [a[0] - nn[0] * w, a[1] - nn[1] * w]], cerrado: true, relleno: f.abrev === 'V' ? '#BFE3C6' : '#F3D9B1', opac: 0.9, borde: st.borde, ancho: 0.4 });
    }
    prims.push({ t: 'poly', pts: [a, b], ...st });
    // símbolo de buzamiento: tick hacia la dirección de buzamiento + valor del dip
    const dd = rad(f.dipdir), tk: P = [Math.sin(dd) * B * 0.13, Math.cos(dd) * B * 0.13];
    prims.push({ t: 'poly', pts: [o, [o[0] + tk[0], o[1] + tk[1]]], borde: st.borde, ancho: Math.max(st.ancho, 0.9) });
    prims.push({ t: 'texto', p: [o[0] + tk[0] * 1.9, o[1] + tk[1] * 1.9 - B * 0.03], s: String(Math.round(f.dip)), tam: 5.5, color: st.borde, ancla: 'centro' });
    // número y rótulo al extremo
    const ex = d[0] >= 0 ? b : a, sg = d[0] >= 0 ? 1 : -1;  // rótulo en el extremo derecho
    prims.push({ t: 'texto', p: [ex[0] + sg * d[0] * B * 0.05, ex[1] + sg * d[1] * B * 0.05 - B * 0.03], s: `${f.n}`, tam: 7, negrita: true, color: st.borde, ancla: 'izq' });
    prims.push({ t: 'texto', p: [ex[0] + sg * d[0] * B * 0.05 + B * 0.12, ex[1] + sg * d[1] * B * 0.05 - B * 0.03], s: rotulo(f).replace(/^\S+ /, `${f.abrev} `) + (f.potencia ? ` · ${f.potencia} m` : ''), tam: 5, color: st.borde, ancla: 'izq', fondo: true });
  });
  const cx = en(-av * 0.5, 0), ext = Math.max(R * 1.25, L * 0.62);
  const caja: Vista['caja'] = [cx[0] - ext, cx[1] - ext * 0.78, cx[0] + ext, cx[1] + ext * 0.78];
  const w = caja[2] - caja[0], h = caja[3] - caja[1];
  if (norte) {
    const nx = caja[2] - w * 0.07, ny = caja[3] - h * 0.06;
    prims.push({ t: 'poly', pts: [[nx, ny - h * 0.13], [nx - w * 0.018, ny - h * 0.13], [nx, ny]], cerrado: true, relleno: '#000000' }, { t: 'poly', pts: [[nx, ny - h * 0.13], [nx + w * 0.018, ny - h * 0.13], [nx, ny]], cerrado: true, borde: '#000000', ancho: 0.5 });
    prims.push({ t: 'texto', p: [nx, ny + h * 0.015], s: 'N', tam: 6.5, negrita: true, ancla: 'centro' });
  }
  prims.push({ t: 'texto', p: [caja[0] + w * 0.03, caja[3] - h * 0.07], s: `${r.labor || 'Labor'} · Az ${Math.round(r.azimut)}°`, tam: 5.5, negrita: true, color: GRIS, ancla: 'izq' });
  escala(prims, [caja[0] + w * 0.05, caja[1] + h * 0.06], w * 0.22);
  return { prims, caja, notas: [] };
}

function flecha(a: P, b: P, t: number): P[] {
  const d: P = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1, u: P = [d[0] / n, d[1] / n], w: P = [-u[1], u[0]];
  return [b, [b[0] - u[0] * t * 2 + w[0] * t * 0.7, b[1] - u[1] * t * 2 + w[1] * t * 0.7], [b[0] - u[0] * t * 2 - w[0] * t * 0.7, b[1] - u[1] * t * 2 - w[1] * t * 0.7]];
}
/** Barra de escala gráfica con su largo redondeado. */
function escala(prims: Prim[], p: P, largo: number) {
  const m = [1, 2, 5, 10, 20].reduce((a, b) => (b <= largo ? b : a), 1), x0 = p[0], y = p[1];
  prims.push({ t: 'poly', pts: [[x0, y], [x0 + m / 2, y], [x0 + m / 2, y + largo * 0.03], [x0, y + largo * 0.03]], cerrado: true, relleno: '#000000' });
  prims.push({ t: 'poly', pts: [[x0, y], [x0 + m, y], [x0 + m, y + largo * 0.03], [x0, y + largo * 0.03]], cerrado: true, borde: '#000000', ancho: 0.4 });
  prims.push({ t: 'texto', p: [x0, y + largo * 0.07], s: '0', tam: 4.8, ancla: 'centro' }, { t: 'texto', p: [x0 + m, y + largo * 0.07], s: `${m} m`, tam: 4.8, ancla: 'centro' });
}

// ---------- SECCIÓN ----------
export interface Cuna { zona: 'CORONA' | 'HI' | 'HD'; familias: [number, number]; pol: P[]; altura: number; area: number; peso: number; ancla: number | null }

/** Cuñas potenciales en la sección (2D): corona por dos familias que convergen hacia arriba; hastiales por un
 *  plano que aflora hacia la labor con buzamiento aparente > fricción (30°) y otro que lo libera. */
export function cunas(r: Reporte): Cuna[] {
  if (!r.ancho || !r.alto || r.azimut == null) return [];
  const B = r.ancho, H = r.alto, real = seccionReal(B, H, r.sobreexc ?? {}), fams = familiasMedidas(r);
  const ap = fams.map(f => ({ f, ...aparente(f.dip, f.dipdir, r.azimut!) }));
  const dir = (a: { ang: number; bajaDerecha: boolean }, haciaArriba: 'izq' | 'der'): P => { const t = rad(a.ang); return haciaArriba === 'der' ? [Math.cos(t), Math.sin(t)] : [-Math.cos(t), Math.sin(t)]; };
  const perno = longPerno((r.sostenimiento ?? []).join(' '));
  const out: Cuna[] = [];
  const hw = H - Math.min(H * 0.45, B * 0.31);
  const iz = real.findIndex(p => p[1] >= hw - 1e-6), de = real.length - 1 - [...real].reverse().findIndex(p => p[1] >= hw - 1e-6);
  const SL = real[iz]!, SR = real[de]!, techo = Math.max(...real.map(p => p[1]));
  // Corona: cara izquierda baja a la izquierda (sube hacia la derecha), cara derecha baja a la derecha.
  let mejor: Cuna | null = null;
  for (const a of ap) for (const b of ap) {
    if (a === b || a.bajaDerecha || !b.bajaDerecha || a.ang < 12 || b.ang < 12) continue;
    const A = cruce(SL, dir(a, 'der'), SR, dir(b, 'izq')); if (!A || A[1] <= techo + 0.05) continue;
    const pol: P[] = [SL, A, SR, ...real.slice(iz, de + 1).reverse()];
    const ar = area(pol), c: Cuna = { zona: 'CORONA', familias: [a.f.n, b.f.n], pol, altura: A[1] - techo, area: ar, peso: ar * GAMMA, ancla: perno != null ? perno - (A[1] - techo) : null };
    if (c.altura < Math.max(B, H) * 1.6 && (!mejor || c.area > mejor.area)) mejor = c;
  }
  if (mejor) out.push(mejor);
  // Hastiales: plano de deslizamiento por el pie del hastial que aflora hacia la labor.
  for (const lado of ['HD', 'HI'] as const) {
    const s = lado === 'HD' ? 1 : -1, pie: P = [s * (B / 2 + (r.sobreexc?.[lado] ?? 0)), 0], cab: P = lado === 'HD' ? SR : SL;
    let m: Cuna | null = null;
    for (const a of ap) for (const b of ap) {
      // a: desliza hacia la labor (en HD baja a la izquierda), con ang > 30° (fricción) y < 85°
      if (a === b || (lado === 'HD' ? a.bajaDerecha : !a.bajaDerecha) || a.ang < 30 || a.ang > 85) continue;
      if ((lado === 'HD' ? !b.bajaDerecha : b.bajaDerecha) || b.ang < 45) continue;  // b: plano de liberación hacia la roca
      const A = cruce(pie, dir(a, lado === 'HD' ? 'der' : 'izq'), cab, dir(b, lado === 'HD' ? 'der' : 'izq'));
      if (!A || s * A[0] <= B / 2 || A[1] < 0 || A[1] > hw) continue;
      const pol: P[] = [pie, A, cab];
      const ar = area(pol), prof = s * A[0] - B / 2;
      const c: Cuna = { zona: lado, familias: [a.f.n, b.f.n], pol, altura: prof, area: ar, peso: ar * GAMMA, ancla: perno != null ? perno - prof : null };
      if (prof < B && (!m || c.area > m.area)) m = c;
    }
    if (m) out.push(m);
  }
  return out;
}

export function vistaSeccion(r: Reporte, rmr: RmrZonas): Vista {
  const B = r.ancho ?? 5, H = r.alto ?? 5, e = B * 0.55;
  const teo = seccionTeorica(B, H).pts, real = seccionReal(B, H, r.sobreexc ?? {});
  // ventana = recuadro del formato, con el contorno a la escala del contorno impreso (152 × 183.5 pt)
  const caja: Vista['caja'] = [(-130.5 / 152) * B, (-12.5 / 183.5) * H, (141.5 / 152) * B, (202.5 / 183.5) * H];
  void e;
  const marco: P[] = [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], caja[3]], [caja[0], caja[3]]];
  const prims: Prim[] = [];
  const notas: string[] = [];
  // roca por zona: H.I. a la izquierda, corona arriba, H.D. a la derecha
  const cC = colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD), cI = colorTipo(rmr.HI ?? rmr.CORONA), cD = colorTipo(rmr.HD ?? rmr.CORONA);
  prims.push({ t: 'poly', pts: marco, cerrado: true, relleno: cC, opac: 0.5 });
  const hw = H - Math.min(H * 0.45, B * 0.31);
  if (cI !== cC) prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [-B / 2, caja[1]], [-B / 2, hw], [caja[0], hw + (caja[0] + B / 2) * -0.6]], cerrado: true, relleno: cI, opac: 0.5 });
  if (cD !== cC) prims.push({ t: 'poly', pts: [[caja[2], caja[1]], [B / 2, caja[1]], [B / 2, hw], [caja[2], hw + (caja[2] - B / 2) * 0.6]], cerrado: true, relleno: cD, opac: 0.5 });
  // red de trazas cortas de cada familia (buzamiento aparente), como el achurado de las fichas
  const az = r.azimut ?? 0, fams = familiasMedidas(r);
  const largo = Math.max(B, H) * 0.11, paso = Math.max(B, H) * 0.12;
  fams.filter(f => f.abrev === 'SD').forEach((f, k) => {
    const { ang, bajaDerecha } = aparente(f.dip, f.dipdir, az), t = rad(bajaDerecha ? -ang : ang), d: P = [Math.cos(t), Math.sin(t)];
    for (let i = 0; ; i++) {
      const y = caja[1] + paso * (i + 0.35 + 0.27 * k); if (y > caja[3]) break;
      for (let j = 0; ; j++) {
        const x = caja[0] + paso * (j + 0.5 * ((i + k) % 2) + 0.3); if (x > caja[2]) break;
        const c: P = [x, y];
        if (dentro(c, real)) continue;
        const a: P = [c[0] - (d[0] * largo) / 2, c[1] - (d[1] * largo) / 2], b: P = [c[0] + (d[0] * largo) / 2, c[1] + (d[1] * largo) / 2];
        if (dentro(a, real) || dentro(b, real)) continue;
        prims.push({ t: 'poly', pts: [a, b], borde: '#1A1A1A', ancho: 0.35 });
      }
    }
  });
  // sobreexcavación / subexcavación entre el contorno teórico y el real
  const so = r.sobreexc ?? {};
  if ((['HI', 'CORONA', 'HD'] as Zona[]).some(z => (so[z] ?? 0) !== 0)) {
    prims.push({ t: 'poly', pts: real, cerrado: true, relleno: '#FFFFFF' });
    prims.push({ t: 'poly', pts: [...real, ...[...teo].reverse()], cerrado: true, relleno: '#7FA7CF', opac: 0.45 });
    prims.push({ t: 'poly', pts: teo, cerrado: true, relleno: '#FFFFFF' });
    for (const z of ['HI', 'CORONA', 'HD'] as Zona[]) {
      const v = so[z]; if (!v) continue;
      const p: P = z === 'CORONA' ? [0, H + Math.max(v, 0) + 0.25] : [(z === 'HD' ? 1 : -1) * (B / 2 + Math.max(v, 0) + 0.15), H * 0.32];
      prims.push({ t: 'texto', p, s: `${v > 0 ? 'Sobreexc.' : 'Subexc.'} ${Math.abs(v).toFixed(2)} m`, tam: 5, color: v > 0 ? '#1F4E79' : ROJO, ancla: z === 'HD' ? 'izq' : z === 'HI' ? 'der' : 'centro', fondo: true });
      notas.push(`${z === 'CORONA' ? 'Corona' : z === 'HI' ? 'Hastial izquierdo' : 'Hastial derecho'}: ${v > 0 ? 'sobreexcavación' : 'subexcavación'} de ${Math.abs(v).toFixed(2)} m.`);
    }
  } else prims.push({ t: 'poly', pts: real, cerrado: true, relleno: '#FFFFFF' });
  // cuñas potenciales
  for (const c of cunas(r)) {
    prims.push({ t: 'poly', pts: c.pol, cerrado: true, relleno: '#35506B', opac: 0.3, borde: '#0B1A2A', ancho: 0.7, trazos: [3, 1.2] });
    const ce: P = [c.pol.reduce((a, p) => a + p[0], 0) / c.pol.length, c.pol.reduce((a, p) => a + p[1], 0) / c.pol.length];
    // rótulo dentro de la labor (zona blanca, legible); flecha hasta la cuña
    const lbl: P = c.zona === 'CORONA' ? [0, hw + (H - hw) * 0.15] : [(c.zona === 'HD' ? 1 : -1) * B * 0.12, H * 0.45 - (c.zona === 'HD' ? 0.5 : 0)];
    const meta: P = c.zona === 'CORONA' ? [0, Math.max(...real.map(p => p[1])) + 0.05] : [(c.zona === 'HD' ? 1 : -1) * (B / 2 + 0.25), Math.min(ce[1], hw * 0.6)];
    prims.push({ t: 'poly', pts: [[lbl[0], lbl[1] + 0.22], meta], borde: '#0B1A2A', ancho: 0.45 });
    prims.push({ t: 'poly', pts: flecha([lbl[0], lbl[1] + 0.22], meta, Math.min(B, H) * 0.035), cerrado: true, relleno: '#0B1A2A' });
    const nom = c.zona === 'CORONA' ? 'Cuña en corona' : `Cuña en ${c.zona === 'HD' ? 'H.D.' : 'H.I.'}`;
    const an = c.zona === 'CORONA' ? 'centro' : c.zona === 'HD' ? 'der' : 'izq';
    prims.push({ t: 'texto', p: lbl, s: `${nom} (${c.familias.join('+')})`, tam: 5.2, negrita: true, color: '#0B1A2A', ancla: an, fondo: true });
    const fuera = c.pol.some(p => p[1] > caja[3] || p[0] < caja[0] || p[0] > caja[2]);
    prims.push({ t: 'texto', p: [lbl[0], lbl[1] - 0.3], s: `${c.zona === 'CORONA' ? 'h' : 'prof.'} ${c.altura.toFixed(1)} m · ${c.peso.toFixed(1)} t/m${fuera ? ' (vértice fuera de vista)' : ''}`, tam: 4.8, color: '#0B1A2A', ancla: an, fondo: true });
    notas.push(`${nom} formada por ${c.familias.map(n => rotulo(fams.find(f => f.n === n)!)).join(' y ')}: ${c.zona === 'CORONA' ? 'altura' : 'profundidad'} ${c.altura.toFixed(1)} m, área ${c.area.toFixed(1)} m², ${c.peso.toFixed(1)} t por metro de labor` +
      (c.ancla != null ? (c.ancla >= 0.6 ? `; el perno queda anclado ${c.ancla.toFixed(1)} m detrás de la cuña.` : `; el perno solo pasa ${Math.max(c.ancla, 0).toFixed(1)} m detrás de la cuña: revise la longitud.`) : '.'));
  }
  // fallas, vetas y contactos: rectas largas que cruzan la sección (con su potencia)
  const especiales = fams.filter(f => f.abrev !== 'SD');
  especiales.forEach((f, k) => {
    const { ang, bajaDerecha } = aparente(f.dip, f.dipdir, az), t = rad(bajaDerecha ? -ang : ang), d: P = [Math.cos(t), Math.sin(t)];
    const L = Math.hypot(B + 2 * e, H + e) * 1.2, st = estilo(f), nn: P = [-d[1], d[0]];
    // la estructura se mapeó en el frente, así que cruza la labor; se elige el paso que más se vea en la roca
    const linea = (o: P): P[] => [[o[0] - d[0] * L, o[1] - d[1] * L], [o[0] + d[0] * L, o[1] + d[1] * L]];
    const visible = (o: P) => { const [a, b] = linea(o); return tramos(a!, b!, marco, real, 160).reduce((t, [p, q]) => t + Math.hypot(q[0] - p[0], q[1] - p[1]), 0); };
    let o: P = [0, H * 0.5], mejorV = -1;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
      const c: P = [(-0.4 + 0.1 * i) * B + (k % 2 ? 0.05 : -0.05) * B * k, (0.2 + 0.15 * j) * H];
      const v = visible(c); if (v > mejorV + 0.05) { mejorV = v; o = c; }
    }
    const ext = linea(o);
    if (f.potencia && f.potencia > 0.05) {
      const w = f.potencia / 2;
      for (const [a, b] of tramos([ext[0]![0] + nn[0] * w, ext[0]![1] + nn[1] * w], [ext[1]![0] + nn[0] * w, ext[1]![1] + nn[1] * w], marco, real)) prims.push({ t: 'poly', pts: [a, b], borde: st.borde, ancho: 0.5 });
      for (const [a, b] of tramos([ext[0]![0] - nn[0] * w, ext[0]![1] - nn[1] * w], [ext[1]![0] - nn[0] * w, ext[1]![1] - nn[1] * w], marco, real)) prims.push({ t: 'poly', pts: [a, b], borde: st.borde, ancho: 0.5 });
    }
    const seg = tramos(ext[0]!, ext[1]!, marco, real);
    for (const [a, b] of seg) prims.push({ t: 'poly', pts: [a, b], ...st, ancho: f.potencia ? 0.35 : st.ancho });
    // rótulo sobre el tramo más largo, a un cuarto de su extremo y al costado de la banda
    const lar = [...seg].sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]))[0];
    if (lar) {
      const [p0, p1] = lar, fy = Math.abs(p1[1] - p0[1]) > 1e-6 ? Math.min(0.85, Math.max(0.15, (H * 0.55 - p0[1]) / (p1[1] - p0[1]))) : 0.5, q: P = [p0[0] + (p1[0] - p0[0]) * fy, p0[1] + (p1[1] - p0[1]) * fy], lado = q[0] < 0 ? 1 : -1;
      prims.push({ t: 'texto', p: [q[0] + lado * (0.15 + (f.potencia ?? 0)), q[1]], s: `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${f.potencia ? ` · pot. ${f.potencia} m` : ''}`, tam: 5.2, color: st.borde, negrita: true, ancla: lado > 0 ? 'izq' : 'der', fondo: true });
    }
  });
  // contornos: teórico a trazos y real continuo
  prims.push({ t: 'poly', pts: teo, borde: '#555555', ancho: 0.45, trazos: [2.2, 1.6] });
  prims.push({ t: 'poly', pts: real, borde: '#000000', ancho: 0.9 });
  prims.push({ t: 'poly', pts: [real[0]!, real.at(-1)!], borde: '#000000', ancho: 0.6 });
  // sostenimiento
  const sost = (r.sostenimiento ?? []).join(' ').toLowerCase(), interior = seccionReal(B, H, Object.fromEntries((['HI', 'CORONA', 'HD'] as Zona[]).map(z => [z, (r.sobreexc?.[z] ?? 0) - Math.min(B, H) * 0.025])));
  if (/shotcrete|lanzado/.test(sost)) prims.push({ t: 'poly', pts: interior, borde: '#8C8C8C', ancho: 1.1 });
  if (/malla/.test(sost)) {
    const soloCorona = /corona/.test(sost) && !/hastial|secci[oó]n completa|toda/.test(sost.match(/malla[^.;\n]*/)?.[0] ?? '');
    const zig: P[] = interior.filter(p => p[1] > (soloCorona ? hw : H * 0.15)).map((p, i) => { const q = interior[Math.min(interior.indexOf(p) + 1, interior.length - 1)]!; const tt: P = [q[0] - p[0], q[1] - p[1]], n = Math.hypot(...tt) || 1; const s = (i % 2 ? 1 : -1) * Math.min(B, H) * 0.012; return [p[0] - (tt[1] / n) * s, p[1] + (tt[0] / n) * s]; });
    prims.push({ t: 'poly', pts: zig, borde: '#1F4E9E', ancho: 0.45 });
  }
  const lp = longPerno(sost);
  if (lp && /perno|split|helicoidal|bolt|swellex/.test(sost)) {
    const { pts, normal } = seccionTeorica(B, H), n = pts.length;
    for (let i = 3; i < n - 3; i += 4) {
      const p = real[i]!, nv = normal[i]!; if (p[1] < H * 0.18) continue;
      const q: P = [p[0] + nv[0] * lp, p[1] + nv[1] * lp];
      prims.push({ t: 'poly', pts: [p, q], borde: '#3A3A3A', ancho: 0.55 });
      prims.push({ t: 'poly', pts: [[p[0] - nv[1] * 0.12, p[1] + nv[0] * 0.12], [p[0] + nv[1] * 0.12, p[1] - nv[0] * 0.12]], borde: '#3A3A3A', ancho: 0.8 });
    }
  }
  // leyenda de estructuras con buzamiento aparente
  fams.forEach((f, k) => {
    const { ang } = aparente(f.dip, f.dipdir, az);
    prims.push({ t: 'texto', p: [-B / 2 + B * 0.06, 0.2 + (fams.length - 1 - k) * 0.3], s: `${rotulo(f)}  ap. ${Math.round(ang)}°`, tam: 4.8, color: estilo(f).borde, ancla: 'izq' });
  });
  prims.push({ t: 'texto', p: [B / 2 - B * 0.06, 0.2], s: `${B} × ${H} m · vista al ${dd3(az)}°`, tam: 4.8, color: GRIS, ancla: 'der' });
  return { prims, caja, notas };
}

// ---------- salida SVG (app) ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function aSvg(v: Vista, W = 300, Hh = 230): string {
  const [x0, y0, x1, y1] = v.caja, k = Math.min((W - 6) / (x1 - x0), (Hh - 6) / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (Hh - (y1 - y0) * k) / 2;
  const X = (p: P): P => [ox + (p[0] - x0) * k, Hh - oy - (p[1] - y0) * k];
  const s = W / 280; // mismos grosores que en el PDF (recuadro de ~280 pt)
  const body = v.prims.map(p => {
    if (p.t === 'poly') return `<polyline points="${p.pts.map(q => X(q).map(n => n.toFixed(1)).join(',')).join(' ')}${p.cerrado ? ' ' + X(p.pts[0]!).map(n => n.toFixed(1)).join(',') : ''}" fill="${p.relleno ?? 'none'}" fill-opacity="${p.opac ?? 1}" stroke="${p.borde ?? 'none'}" stroke-width="${((p.ancho ?? 1) * s).toFixed(2)}"${p.trazos ? ` stroke-dasharray="${p.trazos.map(n => n * s).join(' ')}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    const [x, y] = X(p.p), a = p.ancla === 'centro' ? 'middle' : p.ancla === 'der' ? 'end' : 'start';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${((p.tam ?? 6) * s * 1.15).toFixed(1)}" fill="${p.color ?? '#000'}" text-anchor="${a}" font-family="Helvetica,Arial,sans-serif"${p.negrita ? ' font-weight="700"' : ''}${p.fondo ? ' paint-order="stroke" stroke="#fff" stroke-width="2" stroke-opacity=".85"' : ''}>${esc(p.s)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="100%" style="background:#fff">${body}</svg>`;
}

// ---- Dibujo en el PDF del formato (coordenadas en puntos, y hacia abajo) ----
export type Q = [number, number];
type Rect = [number, number, number, number];
/** Recorta un polígono a un rectángulo (Sutherland–Hodgman). */
export function recortarPoligono(pts: Q[], [x0, y0, x1, y1]: Rect): Q[] {
  const lados: [(p: Q) => boolean, (a: Q, b: Q) => Q][] = [
    [p => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [p => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = pts;
  for (const [ok, c] of lados) {
    const ent = out; out = [];
    ent.forEach((b, i) => { const a = ent[(i + ent.length - 1) % ent.length]!; if (ok(b)) { if (!ok(a)) out.push(c(a, b)); out.push(b); } else if (ok(a)) out.push(c(a, b)); });
    if (!out.length) break;
  }
  return out;
}
/** Recorta un segmento a un rectángulo (Liang–Barsky). */
export function recortarSegmento(a: Q, b: Q, [x0, y0, x1, y1]: Rect): [Q, Q] | null {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as [number, number][]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
/** Pasa una vista a primitivas en puntos del PDF dentro de `caja`. `fijo` fuerza escala (x, y) y origen. */
export function aPuntos(v: Vista, caja: Rect, fijo?: { kx: number; ky: number; ox: number; oy: number }): { polys: (Prim & { t: 'poly' })[]; textos: (Prim & { t: 'texto' })[] } {
  const [bx0, by0, bx1, by1] = caja, [x0, y0, x1, y1] = v.caja;
  const k = Math.min((bx1 - bx0 - 4) / (x1 - x0), (by1 - by0 - 4) / (y1 - y0));
  const T = fijo ?? { kx: k, ky: k, ox: bx0 + (bx1 - bx0 - (x1 - x0) * k) / 2 - x0 * k, oy: by1 - (by1 - by0 - (y1 - y0) * k) / 2 + y0 * k };
  const X = (p: P): Q => [T.ox + p[0] * T.kx, T.oy - p[1] * T.ky];
  const polys: (Prim & { t: 'poly' })[] = [], textos: (Prim & { t: 'texto' })[] = [];
  for (const p of v.prims) {
    if (p.t === 'texto') { const q = X(p.p); if (q[0] > bx0 && q[0] < bx1 && q[1] > by0 + 4 && q[1] < by1) textos.push({ ...p, p: q }); continue; }
    const pts = p.pts.map(X);
    if (p.cerrado) { const c = recortarPoligono(pts, caja); if (c.length > 2) polys.push({ ...p, pts: c }); continue; }
    for (let i = 1; i < pts.length; i++) { const s = recortarSegmento(pts[i - 1]!, pts[i]!, caja); if (s) polys.push({ ...p, pts: s }); }
  }
  return { polys, textos };
}

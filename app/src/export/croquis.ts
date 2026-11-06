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
import { TIPOS, rmrTotal, tipoRoca, type Zona } from '../core/rmr';
import type { Familia, Reporte } from '../model';

export type P = [number, number];
export type Prim =
  | { t: 'poly'; pts: P[]; cerrado?: boolean; relleno?: string; borde?: string; ancho?: number; opac?: number; trazos?: number[] }
  | { t: 'texto'; p: P; s: string; tam?: number; color?: string; ancla?: 'izq' | 'centro' | 'der'; negrita?: boolean; fondo?: boolean };
export interface Vista { prims: Prim[]; caja: [number, number, number, number]; notas: string[]; manijas?: Manija[] }
/** Estructura que se puede mover a mano en la planta: pasa por `o` con dirección `d` (coordenadas de la vista). */
export interface Manija { n: number; abrev: string; o: P; d: P; R: number; u: P; v: P }

/** Traza en la sección del frente (x a la derecha, y desde el piso) del plano que pasa por pos (planta, a media altura). */
/** Traza del plano en la sección transversal a `sSec` m detrás del frente (0 = el frente). */
export function trazaSeccion(f: { dip: number; dipdir: number; pos?: { s: number; t: number } }, r: { azimut: number | null; alto: number | null }, sSec = 0): { o: P; d: P } | null {
  if (!f.pos || r.azimut == null) return null;
  const H = r.alto ?? 5, az = rad(r.azimut), u: P = [Math.sin(az), Math.cos(az)], v: P = [Math.cos(az), -Math.sin(az)];
  const N = [Math.sin(rad(f.dip)) * Math.sin(rad(f.dipdir)), Math.sin(rad(f.dip)) * Math.cos(rad(f.dipdir)), Math.cos(rad(f.dip))] as const;
  const a = N[0] * v[0] + N[1] * v[1], nu = N[0] * u[0] + N[1] * u[1], b = N[2];
  // plano: a·(x − t0) − nu·s0 + b·(y − H/2) = 0, en la sección del frente (s = 0)
  const c = a * f.pos.t + nu * (f.pos.s + sSec) + b * H / 2, n2 = a * a + b * b;
  if (n2 < 1e-9) return null; // plano paralelo al frente: no corta la sección
  const p0: P = [0, H / 2], k = (a * p0[0] + b * p0[1] - c) / n2;
  const o: P = [p0[0] - k * a, p0[1] - k * b], m = Math.sqrt(n2);
  return { o, d: [b / m, -a / m] };
} // caja en m: xmin, ymin, xmax, ymax
export type RmrZonas = Partial<Record<Zona, number | null>>;

const rad = (g: number) => (g * Math.PI) / 180, gra = (r: number) => (r * 180) / Math.PI;
export const TINTA = '#0D2A6B', GRIS = '#4A4A4A', ROJO = '#C00000', VERDE = '#1B7A3A';
const GAMMA = 2.7; // t/m³, peso unitario de la roca para el peso de las cuñas

/** Familia numerada con su orientación medida. */
export interface Fam { n: number; abrev: string; dip: number; dipdir: number; potencia: number | null; persistencia?: number | null; espaciamiento?: number | null; pos?: { s: number; t: number } }
export const familiasMedidas = (r: Reporte): Fam[] =>
  r.familias.map((f: Familia, i) => ({ n: i + 1, abrev: f.abrev, dip: f.dip!, dipdir: f.dipdir!, potencia: f.potencia ?? null, persistencia: f.persistencia ?? null, espaciamiento: f.espaciamiento ?? null, pos: f.pos }))
    .filter(f => f.dip != null && f.dipdir != null);
export const dd3 = (x: number) => String(Math.round(((x % 360) + 360) % 360)).padStart(3, '0');
export const rotulo = (f: Fam) => `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°`;
export const estilo = (f: Fam) => f.abrev === 'F' ? { borde: ROJO, ancho: 1.1 } : f.abrev === 'V' ? { borde: VERDE, ancho: 0.9 } : f.abrev === 'C' ? { borde: TINTA, ancho: 0.7, trazos: [3, 1.5] } : { borde: '#111111', ancho: 0.5 };

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
export const area = (pol: P[]) => Math.abs(pol.reduce((a, p, i) => { const q = pol[(i + 1) % pol.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export function cruce(a: P, da: P, b: P, db: P): P | null {
  const den = da[0] * db[1] - da[1] * db[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den; return [a[0] + da[0] * t, a[1] + da[1] * t];
}
/** Partes de a→b dentro de `fuera` y fuera de `hueco` (muestreo fino). */
export function tramos(a: P, b: P, fuera: P[], hueco: P[] | null, n = 220): [P, P][] {
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

/** Generador pseudoaleatorio con semilla (el mismo reporte siempre se dibuja igual). */
export function azar(semilla: string): () => number {
  let h = 2166136261; for (const ch of semilla) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Contorno de voladura real: el teórico desplazado por la excavación medida en cada zona, con el perfil
 *  anguloso de una voladura de verdad (cachos que quedan hacia adentro, realces y bloques que caen siguiendo
 *  las diaclasas). La irregularidad es proporcional a lo medido; sin dato, solo una rugosidad de ±6 cm.
 *  Devuelve también la normal en cada punto, para el shotcrete y los pernos. */
export function contornoVoladura(B: number, H: number, sobre: Partial<Record<Zona, number | null>> = {}, semilla = 'x', dirs: P[] = []): { pts: P[]; normal: P[]; zona: Zona[] } {
  const t = seccionTeorica(B, H), paso = Math.min(B, H) / 60;
  // remuestreo fino por longitud de arco
  const pts: P[] = [], normal: P[] = [], zona: Zona[] = [], arco: number[] = [];
  let acc = 0;
  for (let i = 0; i < t.pts.length - 1; i++) {
    const a = t.pts[i]!, b = t.pts[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / paso));
    for (let k = 0; k < n; k++) {
      const f = k / n, na = t.normal[i]!, nb = t.normal[i + 1]!, nx = na[0] + (nb[0] - na[0]) * f, ny = na[1] + (nb[1] - na[1]) * f, nn = Math.hypot(nx, ny) || 1;
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); normal.push([nx / nn, ny / nn]); zona.push(t.zona[i]!); arco.push(acc + L * f);
    }
    acc += L;
  }
  pts.push(t.pts.at(-1)!); normal.push(t.normal.at(-1)!); zona.push(t.zona.at(-1)!); arco.push(acc);
  const N = pts.length, d0 = zona.map(z => sobre[z] ?? 0);
  const ven = 12, base = d0.map((_, i) => { let s = 0, k = 0; for (let j = -ven; j <= ven; j++) { const v = d0[i + j]; if (v != null) { s += v; k++; } } return s / k; });
  // quiebres de los bloques cada 0.35–1.1 m (a escala de la labor)
  const rnd = azar(semilla), esc = Math.min(B, H) / 5.5, quiebres: { s: number; a: number }[] = [{ s: 0, a: 0 }];
  for (let s = (0.3 + rnd() * 0.5) * esc; s < acc - 0.2 * esc; s += (0.35 + rnd() * 0.75) * esc) {
    const i = Math.min(N - 1, arco.findIndex(x => x >= s)), v = d0[i] ?? 0, A = Math.max(0.06, Math.abs(v) * 0.5);
    // en sobreexcavación dominan los bloques caídos (afuera); en subexcavación, los cachos (adentro)
    const r = rnd(), a = v >= 0 ? A * (r < 0.2 ? -0.45 * rnd() : r < 0.35 ? 0.9 + 0.5 * rnd() : -0.15 + rnd() * 0.85) : A * (r < 0.25 ? 0.35 * rnd() : -0.3 - rnd() * 0.9);
    quiebres.push({ s, a });
    // realce: un escalón que sigue una diaclasa (dos quiebres muy juntos con salto)
    if (dirs.length && rnd() < 0.3) quiebres.push({ s: s + 0.08 * esc, a: a + (v >= 0 ? 1 : -1) * A * (0.35 + 0.4 * rnd()) });
  }
  quiebres.push({ s: acc, a: 0 });
  const rug = arco.map(s => { let k = 0; while (k < quiebres.length - 2 && quiebres[k + 1]!.s < s) k++; const q0 = quiebres[k]!, q1 = quiebres[k + 1]!, f = (s - q0.s) / Math.max(1e-9, q1.s - q0.s); return q0.a + (q1.a - q0.a) * Math.min(1, Math.max(0, f)); });
  const out = pts.map((p, i) => {
    const y = p[1], pie = Math.min(1, y / (H * 0.12));  // al pie del hastial la voladura respeta el piso
    const d = base[i]! * Math.max(pie, 0.4) + rug[i]! * pie;
    return i === 0 || i === N - 1 ? [p[0] + normal[i]![0] * d, 0] as P : [p[0] + normal[i]![0] * d, p[1] + normal[i]![1] * d] as P;
  });
  return { pts: out, normal, zona };
}

const longPerno = (txt: string) => /(\d+(?:[.,]\d+)?)\s*(pies|ft|')/i.test(txt) ? Number(RegExp.$1.replace(',', '.')) * 0.3048 : /(\d(?:[.,]\d+)?)\s*m\b/.test(txt) ? Number(RegExp.$1.replace(',', '.')) : null;

/** Perno indicado en el texto de sostenimiento: tipo, largo, malla de espaciamiento y capacidad típica. */
export interface PernoInfo { tipo: string; largo: number; pies: number | null; esp: number; intercalado: boolean; cap: number }
export function pernoInfo(txt: string): PernoInfo | null {
  const t = txt.toLowerCase(), largo = longPerno(txt);
  if (largo == null || !/perno|split|helicoidal|bolt|swellex|cable/.test(t)) return null;
  const tipo = /cable/.test(t) ? 'Cable bolting' : /split/.test(t) ? 'Split set' : /swellex/.test(t) ? 'Swellex' : 'Helicoidal';
  // capacidad de carga típica por perno (t); referencial, se debe confirmar con pruebas de arranque en mina
  const cap = tipo === 'Cable bolting' ? 25 : tipo === 'Split set' ? 6 : tipo === 'Swellex' ? 11 : 18;
  const esp = Number(t.match(/(\d(?:[.,]\d+)?)\s*[x×]\s*\d/)?.[1]?.replace(',', '.')) || 1.5;
  const pies = /(\d+(?:[.,]\d+)?)\s*(pies|ft|')/i.test(txt) ? Number(RegExp.$1.replace(',', '.')) : null;
  return { tipo, largo, pies, esp, intercalado: /intercal|tresbolillo|alternad/.test(t), cap };
}
const enPies = (m: number) => { const p = Math.ceil(m / 0.3048); return [5, 6, 7, 8, 10, 12, 14, 16, 20, 25, 30].find(x => x >= p) ?? p; };

/** Espesor total de shotcrete estructural indicado (m): suma las pulgadas/cm de shotcrete, sin el de sacrificio. */
export function espesorShotcrete(txt: string): number {
  let e = 0;
  for (const l of txt.split(/\n|;|\+|•|·/)) {
    if (!/shotcrete|lanzado/i.test(l) || /sacrifici/i.test(l)) continue;
    const m = l.match(/(\d+(?:[.,]\d+)?)\s*("|''|pulg|in\b|cm)/i); if (!m) continue;
    const v = Number(m[1]!.replace(',', '.')); e += /cm/i.test(m[2]!) ? v / 100 : v * 0.0254;
  }
  return e;
}

/** Nivel de riesgo de una cuña con el sostenimiento indicado (equilibrio límite 2D, por metro de labor).
 *  - Pernos: se reparten a lo largo de la base de la cuña con su espaciamiento; cada perno cuenta solo si
 *    cruza la cara de la cuña y queda anclado ≥ 0.5 m detrás (los de los bordes suelen pasar, los del centro no).
 *  - Shotcrete: resiste por corte en los dos bordes de la cuña (τ = 0.35 MPa, valor conservador a edad temprana).
 *  - Corona: cae por su peso. Hastial: desliza por el plano de deslizamiento con fricción de 30°.
 *  FS ≥ 2 bajo, 1.5–2 medio, < 1.5 alto. */
export interface Riesgo { nivel: 'ALTO' | 'MEDIO' | 'BAJO'; fs: number; fsPernos: number; pernosUtiles: number; pernosBase: number; motivo: string; accion: string }
export function riesgoCuna(c: Cuna, perno: PernoInfo | null, shot = 0): Riesgo {
  const W = Math.max(c.peso, 0.01), psi = rad(c.incl ?? 90), TAU = 35;  // t/m²
  const caras: [P, P][] = c.zona === 'CORONA' ? [[c.pol[0]!, c.pol[1]!], [c.pol[1]!, c.pol[2]!]] : [[c.pol[0]!, c.pol[1]!], [c.pol[1]!, c.pol[2]!]];
  let utiles = 0, total = 0;
  if (perno && c.base && c.base.length > 1) {
    const arco = [0]; for (let i = 1; i < c.base.length; i++) arco.push(arco[i - 1]! + Math.hypot(c.base[i]!.p[0] - c.base[i - 1]!.p[0], c.base[i]!.p[1] - c.base[i - 1]!.p[1]));
    const L = arco.at(-1)!;
    for (let s = perno.esp / 2; s < L; s += perno.esp) {
      const k = Math.max(1, arco.findIndex(x => x >= s)), f = (s - arco[k - 1]!) / Math.max(1e-9, arco[k]! - arco[k - 1]!);
      const a = c.base[k - 1]!, b = c.base[k]!, o: P = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f], n: P = [a.n[0] + (b.n[0] - a.n[0]) * f, a.n[1] + (b.n[1] - a.n[1]) * f];
      let t = Infinity;
      for (const [p, q] of caras) { const x = cruceRayo(o, n, p, q); if (x != null && x < t) t = x; }
      total++; if (t !== Infinity && perno.largo - t >= 0.5) utiles++;
    }
  }
  const T = perno ? (utiles * perno.cap) / perno.esp : 0, S = 2 * shot * TAU;
  const fsCon = (R: number) => c.zona === 'CORONA' ? R / W : (W * Math.cos(psi) * Math.tan(rad(30)) + R) / Math.max(W * Math.sin(psi), 0.01);
  const fsPernos = fsCon(T), fs = fsCon(T + S);
  const nivel = fs >= 2 ? 'BAJO' : fs >= 1.5 ? 'MEDIO' : 'ALTO';
  const req = enPies(c.altura + 0.5);
  const pp = perno ? `${perno.pies != null ? perno.pies + "'" : perno.largo.toFixed(1) + ' m'}` : '';
  const motivo = !perno ? `sin pernos; FS ${fs.toFixed(1)} solo con shotcrete` : `${utiles} de ${total} pernos de ${pp} anclan detrás de la cuña; FS ${fs.toFixed(1)}`;
  const accion = nivel === 'BAJO' ? 'mantener el sostenimiento indicado'
    : perno && utiles < total ? (req > 12 ? `usar cable bolting de ${req}'` : `usar pernos de ${req}'`)
    : perno ? `cerrar pernos a ${Math.max(1, +(perno.esp - 0.2).toFixed(1))}×${Math.max(1, +(perno.esp - 0.2).toFixed(1))} m` : 'colocar pernos';
  return { nivel, fs, fsPernos, pernosUtiles: utiles, pernosBase: total, motivo, accion };
}
/** Distancia a lo largo del rayo o + t·n hasta el segmento p–q (o null si no lo corta). */
function cruceRayo(o: P, n: P, p: P, q: P): number | null {
  const d: P = [q[0] - p[0], q[1] - p[1]], den = n[0] * d[1] - n[1] * d[0];
  if (Math.abs(den) < 1e-9) return null;
  const w: P = [p[0] - o[0], p[1] - o[1]], t = (w[0] * d[1] - w[1] * d[0]) / den, u = (w[0] * n[1] - w[1] * n[0]) / den;
  return t > 0 && u >= -1e-6 && u <= 1 + 1e-6 ? t : null;
}

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
  // voladura real en planta: hastiales y frente con bloques y cachos (amplitud según la excavación medida)
  const rnd = azar(`${r.id}|${r.labor}|${r.fecha}|planta`), so = r.sobreexc ?? {};
  const ampl = (z: Zona) => Math.max(0.07, Math.abs(so[z] ?? 0) * 0.8);
  const quebrar = (pts: P[], fuera: (p: P) => P, base: number, A: number): P[] => {
    const out: P[] = [pts[0]!]; const esc = B / 5.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!, Lg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s0 = (0.25 + rnd() * 0.5) * esc; s0 < Lg; s0 += (0.35 + rnd() * 0.7) * esc) {
        const f = s0 / Lg, q: P = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], n = fuera(q), r0 = rnd();
        const dd = base + A * (base >= 0 ? (r0 < 0.2 ? -0.45 * rnd() : -0.1 + rnd() * 1.1) : (r0 < 0.25 ? 0.3 * rnd() : -0.3 - rnd()));
        out.push([q[0] + n[0] * dd, q[1] + n[1] * dd]);
      }
      out.push(b);
    }
    return out;
  };
  const izq: P = [-v[0], -v[1]], der: P = v, centroF = en(-av * 0.6, 0);
  const paredI = quebrar([en(-L, -B / 2), en(-av, -B / 2)], () => izq, so.HI ?? 0, ampl('HI'));
  const paredD = quebrar([en(-L, B / 2), en(-av, B / 2)], () => der, so.HD ?? 0, ampl('HD'));
  const fr0 = quebrar(frente, q => { const d: P = [q[0] - centroF[0], q[1] - centroF[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }, 0, 0.1);
  const frenteR: P[] = [paredI.at(-1)!, ...fr0.slice(1, -1), paredD.at(-1)!];
  const prims: Prim[] = [
    { t: 'poly', pts: frenteR, cerrado: true, relleno: colorTipo(rmr.CORONA), opac: 0.55 },
    { t: 'poly', pts: paredI, borde: '#000000', ancho: 0.7 },
    { t: 'poly', pts: paredD, borde: '#000000', ancho: 0.7 },
    { t: 'poly', pts: [en(-L, -B / 2), en(-av, -B / 2)], borde: GRIS, ancho: 0.35, trazos: [2, 1.5] },
    { t: 'poly', pts: [en(-L, B / 2), en(-av, B / 2)], borde: GRIS, ancho: 0.35, trazos: [2, 1.5] },
    { t: 'poly', pts: frenteR, borde: '#000000', ancho: 1.3 },
    { t: 'poly', pts: [en(-av, -B / 2), en(-av, B / 2)], borde: GRIS, ancho: 0.4, trazos: [2, 1.5] },
  ];
  const fams = familiasMedidas(r), R = B * 1.35;
  const cx = en(-av * 0.5, 0), ext = Math.max(R * 1.25, L * 0.62);
  const caja: Vista['caja'] = [cx[0] - ext, cx[1] - ext * 0.78, cx[0] + ext, cx[1] + ext * 0.78];
  const w = caja[2] - caja[0], h = caja[3] - caja[1], mpp = w / 278;  // metros por punto en el PDF
  // cajas ocupadas por textos y trazos ya puestos, para que los rótulos no se monten
  type Caja = [number, number, number, number];
  const ocupadas: Caja[] = [], trazos: [P, P][] = [];
  const cajaTexto = (p: P, txt: string, tam: number, ancla: 'izq' | 'der' | 'centro'): Caja => {
    const an = txt.length * tam * 0.6 * mpp, al = tam * mpp;
    const x0 = ancla === 'izq' ? p[0] : ancla === 'der' ? p[0] - an : p[0] - an / 2;
    return [x0 - mpp, p[1] - al * 0.3, x0 + an + mpp, p[1] + al * 0.95];
  };
  const choca = (c: Caja) => {
    let n = 0;
    if (c[0] < caja[0] || c[2] > caja[2] || c[1] < caja[1] || c[3] > caja[3]) n += 100;
    for (const o of ocupadas) if (c[0] < o[2] && c[2] > o[0] && c[1] < o[3] && c[3] > o[1]) n += 10;
    for (const [a, b] of trazos) for (let i = 0; i <= 24; i++) { const x = a[0] + ((b[0] - a[0]) * i) / 24, y = a[1] + ((b[1] - a[1]) * i) / 24; if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) { n += 1; break; } }
    return n;
  };
  ocupadas.push([caja[0], caja[3] - h * 0.2, caja[0] + w * 0.45, caja[3]], [caja[2] - w * 0.12, caja[3] - h * 0.25, caja[2], caja[3]], [caja[0], caja[1], caja[0] + w * 0.36, caja[1] + h * 0.47]);
  frente.slice(1, -1).forEach((p, i, a) => { if (i) trazos.push([a[i - 1]!, p]); });
  const lineas = fams.map((f, k) => {
    const rumbo = rad(f.dipdir - 90), d: P = [Math.sin(rumbo), Math.cos(rumbo)];
    // cada estructura pasa por el último avance, repartidas a lo ancho para que no se tapen
    const fr = (k + 0.5) / Math.max(1, fams.length), o = f.pos ? en(f.pos.s, f.pos.t) : en(-av * 0.5 - (fr - 0.5) * B * 0.9, B * (-0.32 + 0.64 * fr));
    const a: P = [o[0] - d[0] * R, o[1] - d[1] * R], b: P = [o[0] + d[0] * R, o[1] + d[1] * R];
    trazos.push([a, b]);
    return { f, d, o, a, b };
  });
  for (const { f, d, o, a, b } of lineas) {
    const st = estilo(f);
    if (f.potencia && f.potencia > 0.05) { // falla o veta con potencia: banda
      const wd = Math.max(f.potencia, B * 0.03) / 2, nn: P = [-d[1], d[0]];
      prims.push({ t: 'poly', pts: [[a[0] + nn[0] * wd, a[1] + nn[1] * wd], [b[0] + nn[0] * wd, b[1] + nn[1] * wd], [b[0] - nn[0] * wd, b[1] - nn[1] * wd], [a[0] - nn[0] * wd, a[1] - nn[1] * wd]], cerrado: true, relleno: f.abrev === 'V' ? '#BFE3C6' : '#F3D9B1', opac: 0.9, borde: st.borde, ancho: 0.4 });
    }
    prims.push({ t: 'poly', pts: [a, b], ...st });
    // símbolo de buzamiento: tick hacia la dirección de buzamiento + valor del dip
    const dd = rad(f.dipdir), tk: P = [Math.sin(dd) * B * 0.13, Math.cos(dd) * B * 0.13];
    prims.push({ t: 'poly', pts: [o, [o[0] + tk[0], o[1] + tk[1]]], borde: st.borde, ancho: Math.max(st.ancho, 0.9) });
    trazos.push([o, [o[0] + tk[0], o[1] + tk[1]]]);
    const sd = String(Math.round(f.dip));
    let pd: P = [o[0] + tk[0] * 1.9, o[1] + tk[1] * 1.9 - B * 0.03], mejorD = Infinity;
    for (const m of [1.9, 2.6, 3.3, 1.5]) for (const dx of [0, 1, -1]) {
      const c: P = [o[0] + tk[0] * m + dx * B * 0.08, o[1] + tk[1] * m - B * 0.03], n = choca(cajaTexto(c, sd, 5.5, 'centro')) * 1 + Math.abs(dx) * 0.3 + (m - 1.9) * 0.2;
      if (n < mejorD) { mejorD = n; pd = c; }
    }
    prims.push({ t: 'texto', p: pd, s: sd, tam: 5.5, color: st.borde, ancla: 'centro', fondo: true });
    ocupadas.push(cajaTexto(pd, sd, 5.5, 'centro'));
  }
  // número y rótulo: se prueba en ambos extremos y a varias distancias; gana el sitio más despejado
  for (const { f, d, o } of lineas) {
    const st = estilo(f), txt = rotulo(f).replace(/^\S+ /, `${f.abrev} `) + (f.potencia ? ` · ${f.potencia} m` : '');
    let mejor: { p: P; an: 'izq' | 'der'; c: Caja; n: number } | null = null;
    for (const t of [1, -1, 0.85, -0.85, 1.12, -1.12, 0.65, -0.65, 0.45, -0.45]) {
      const e: P = [o[0] + d[0] * R * t, o[1] + d[1] * R * t], sg = (t > 0 ? d[0] : -d[0]) >= 0 ? 1 : -1, an = sg > 0 ? 'izq' as const : 'der' as const;
      for (const dy of [0, 1.4, -1.4]) {
        const p: P = [e[0] + sg * B * 0.04, e[1] + dy * 5 * mpp], c = cajaTexto(p, `${f.n}  ${txt}`, 5.6, an), n = choca(c) + Math.abs(dy) * 0.5;
        if (!mejor || n < mejor.n) mejor = { p, an, c, n };
      }
      if (mejor && mejor.n === 0) break;
    }
    const { p, an, c } = mejor!;
    ocupadas.push(c);
    const numAncho = 8 * mpp;
    if (an === 'izq') {
      prims.push({ t: 'texto', p, s: `${f.n}`, tam: 7, negrita: true, color: st.borde, ancla: 'izq' });
      prims.push({ t: 'texto', p: [p[0] + numAncho, p[1]], s: txt, tam: 5, color: st.borde, ancla: 'izq', fondo: true });
    } else {
      prims.push({ t: 'texto', p, s: `${f.n}`, tam: 7, negrita: true, color: st.borde, ancla: 'der' });
      prims.push({ t: 'texto', p: [p[0] - numAncho, p[1]], s: txt, tam: 5, color: st.borde, ancla: 'der', fondo: true });
    }
  }
  leyenda(prims, r, rmr, [caja[0] + w * 0.015, caja[1] + h * 0.02], mpp);
  const manijas: Manija[] = lineas.map(l => ({ n: l.f.n, abrev: l.f.abrev, o: l.o, d: l.d, R, u, v }));
  if (norte) {
    const nx = caja[2] - w * 0.07, ny = caja[3] - h * 0.06;
    prims.push({ t: 'poly', pts: [[nx, ny - h * 0.13], [nx - w * 0.018, ny - h * 0.13], [nx, ny]], cerrado: true, relleno: '#000000' }, { t: 'poly', pts: [[nx, ny - h * 0.13], [nx + w * 0.018, ny - h * 0.13], [nx, ny]], cerrado: true, borde: '#000000', ancho: 0.5 });
    prims.push({ t: 'texto', p: [nx, ny + h * 0.015], s: 'N', tam: 6.5, negrita: true, ancla: 'centro' });
  }
  prims.push({ t: 'texto', p: [caja[0] + w * 0.03, caja[3] - h * 0.07], s: `${r.labor || 'Labor'} · Az ${Math.round(r.azimut)}°`, tam: 5.5, negrita: true, color: GRIS, ancla: 'izq' });
  escala(prims, [caja[0] + w * 0.04, caja[3] - h * 0.17], w * 0.22);
  return { prims, caja, notas: [], manijas };
}

/** Leyenda compacta (planta): tipos de roca presentes, estructuras, contornos, cuñas y sostenimiento. */
function leyenda(prims: Prim[], r: Reporte, rmr: RmrZonas, o: P, mpp: number) {
  const fams = familiasMedidas(r), sost = (r.sostenimiento ?? []).join(' ').toLowerCase(), fila = 7.2 * mpp, sw = 11 * mpp;
  const items: { dib: (p: P) => void; txt: string }[] = [];
  const tipos = [...new Set((['HI', 'CORONA', 'HD'] as Zona[]).map(z => rmr[z]).filter((v): v is number => v != null).map(v => tipoRoca(v)))];
  for (const t of tipos) items.push({ txt: `Roca tipo ${t}`, dib: p => prims.push({ t: 'poly', pts: [p, [p[0] + sw, p[1]], [p[0] + sw, p[1] + fila * 0.6], [p[0], p[1] + fila * 0.6]], cerrado: true, relleno: TIPOS.find(x => x.tipo === t)?.color ?? '#C9C9C9', opac: 0.55, borde: '#555555', ancho: 0.3 }) });
  const linea = (txt: string, st: Partial<Prim & { t: 'poly' }>) => items.push({ txt, dib: p => prims.push({ t: 'poly', pts: [[p[0], p[1] + fila * 0.3], [p[0] + sw, p[1] + fila * 0.3]], ...st } as Prim) });
  items.push({ txt: `Último avance${r.avance ? ` (${r.avance} m)` : ''}`, dib: p => prims.push({ t: 'poly', pts: [p, [p[0] + sw, p[1]], [p[0] + sw, p[1] + fila * 0.6], [p[0], p[1] + fila * 0.6]], cerrado: true, relleno: colorTipo(rmr.CORONA), opac: 0.55, borde: '#000000', ancho: 0.9 }) });
  const tipoE: Record<string, string> = { SD: 'Diaclasa (SD)', F: 'Falla (F)', V: 'Veta (V)', C: 'Contacto (C)' };
  for (const a of ['SD', 'F', 'V', 'C']) { const f = fams.find(x => x.abrev === a); if (f) linea(tipoE[a]!, { ...estilo(f) }); }
  items.push({ txt: 'Buzamiento (dip)', dib: p => { prims.push({ t: 'poly', pts: [[p[0], p[1] + fila * 0.3], [p[0] + sw, p[1] + fila * 0.3]], borde: '#000000', ancho: 0.5 }, { t: 'poly', pts: [[p[0] + sw / 2, p[1] + fila * 0.3], [p[0] + sw / 2, p[1] - fila * 0.1]], borde: '#000000', ancho: 0.9 }); } });
  linea('Contorno de diseño', { borde: '#555555', ancho: 0.45, trazos: [2.2, 1.6] });
  linea('Contorno real (voladura)', { borde: '#000000', ancho: 0.9 });
  if (cunas(r).length) items.push({ txt: 'Cuña potencial', dib: p => prims.push({ t: 'poly', pts: [p, [p[0] + sw, p[1]], [p[0] + sw / 2, p[1] + fila * 0.7]], cerrado: true, relleno: '#35506B', opac: 0.35, borde: '#0B1A2A', ancho: 0.5, trazos: [3, 1.2] }) });
  if (/shotcrete|lanzado/.test(sost)) linea('Shotcrete', { borde: '#8C8C8C', ancho: 1.1 });
  if (/malla/.test(sost)) items.push({ txt: 'Malla electrosoldada', dib: p => prims.push({ t: 'poly', pts: Array.from({ length: 7 }, (_, i) => [p[0] + (sw * i) / 6, p[1] + fila * (i % 2 ? 0.5 : 0.1)] as P), borde: '#1F4E9E', ancho: 0.35 }) });
  if (/perno|split|helicoidal|bolt|swellex/.test(sost)) linea('Perno', { borde: '#000000', ancho: 1.2 });
  const alto = (items.length + 1.3) * fila, ancho = 92 * mpp;
  prims.push({ t: 'poly', pts: [o, [o[0] + ancho, o[1]], [o[0] + ancho, o[1] + alto], [o[0], o[1] + alto]], cerrado: true, relleno: '#FFFFFF', opac: 0.92, borde: '#7F7F7F', ancho: 0.4 });
  prims.push({ t: 'texto', p: [o[0] + 3 * mpp, o[1] + alto - fila * 0.85], s: 'LEYENDA', tam: 5.2, negrita: true, ancla: 'izq' });
  items.forEach((it, k) => {
    const p: P = [o[0] + 3 * mpp, o[1] + alto - fila * (k + 1.85)];
    it.dib(p);
    prims.push({ t: 'texto', p: [p[0] + sw + 3 * mpp, p[1] + fila * 0.05], s: it.txt, tam: 4.8, ancla: 'izq' });
  });
}

export function flecha(a: P, b: P, t: number): P[] {
  const d: P = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1, u: P = [d[0] / n, d[1] / n], w: P = [-u[1], u[0]];
  return [b, [b[0] - u[0] * t * 2 + w[0] * t * 0.7, b[1] - u[1] * t * 2 + w[1] * t * 0.7], [b[0] - u[0] * t * 2 - w[0] * t * 0.7, b[1] - u[1] * t * 2 - w[1] * t * 0.7]];
}
/** Barra de escala gráfica con su largo redondeado. */
export function escala(prims: Prim[], p: P, largo: number) {
  const m = [1, 2, 5, 10, 20].reduce((a, b) => (b <= largo ? b : a), 1), x0 = p[0], y = p[1];
  prims.push({ t: 'poly', pts: [[x0, y], [x0 + m / 2, y], [x0 + m / 2, y + largo * 0.03], [x0, y + largo * 0.03]], cerrado: true, relleno: '#000000' });
  prims.push({ t: 'poly', pts: [[x0, y], [x0 + m, y], [x0 + m, y + largo * 0.03], [x0, y + largo * 0.03]], cerrado: true, borde: '#000000', ancho: 0.4 });
  prims.push({ t: 'texto', p: [x0, y + largo * 0.07], s: '0', tam: 4.8, ancla: 'centro' }, { t: 'texto', p: [x0 + m, y + largo * 0.07], s: `${m} m`, tam: 4.8, ancla: 'centro' });
}

// ---------- SECCIÓN ----------
export interface Cuna { zona: 'CORONA' | 'HI' | 'HD'; familias: [number, number]; pol: P[]; altura: number; area: number; peso: number; ancla: number | null; incl?: number; base?: { p: P; n: P }[]; persist?: number }

/** Zona de influencia: las cuñas solo se desprenden dentro de este % de la sección más allá del perfil real
 *  (criterio del área de geomecánica de Justa): I/II 8 %, III-A 10 %, III-B 13 %, IV 15 %, V 20 %. */
export const INFLUENCIA: Record<string, number> = { 'I/II': 0.08, 'III-A': 0.10, 'III-B': 0.13, 'IV': 0.15, 'V': 0.20 };
export function zonaInfluencia(r: Reporte): { tipo: string; pct: number; corona: number; hastial: number } | null {
  const v = rmrTotal(r.rmr.CORONA, r.ajuste.CORONA) ?? rmrTotal(r.rmr.HI, r.ajuste.HI);
  const tipo = v != null ? tipoRoca(v) : r.tipoGeologo;
  if (!tipo || !r.ancho || !r.alto) return null;
  const pct = INFLUENCIA[tipo] ?? 0.13;
  return { tipo, pct, corona: pct * r.alto, hastial: pct * r.ancho };
}

/** Largo de traza (m) de una familia: el medido, o el de la clase de persistencia del RMR (6 <1 m, 4 1–3, 2 3–10, 1 10–20, 0 >20). */
const largoTraza = (r: Reporte, f: { persistencia?: number | null }) => {
  if (f.persistencia != null && f.persistencia > 0) return f.persistencia;
  const p = r.rmr.CORONA.persistencia; return p == null ? Infinity : p >= 6 ? 1 : p >= 4 ? 3 : p >= 2 ? 10 : p >= 1 ? 20 : Infinity;
};

/** Cuñas potenciales en la sección (2D): corona por dos familias que convergen hacia arriba; hastiales por un
 *  plano que aflora hacia la labor con buzamiento aparente > fricción (30°) y otro que lo libera. */
export function cunas(r: Reporte): Cuna[] {
  if (!r.ancho || !r.alto || r.azimut == null) return [];
  const B = r.ancho, H = r.alto, fams = familiasMedidas(r);
  // Perfil real remuestreado cada ~5 cm: las cuñas chicas (zona de influencia) necesitan bases cortas.
  const real0 = seccionReal(B, H, r.sobreexc ?? {}), nor0 = seccionTeorica(B, H).normal, real: P[] = [], nor: P[] = [];
  real0.forEach((p, i) => {
    const q = real0[i + 1]; const n = q ? Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.05)) : 1;
    for (let k = 0; k < n; k++) { const t = k / n; real.push(q ? [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])] : p); nor.push(nor0[i]!); }
  });
  const ap = fams.map(f => ({ f, ...aparente(f.dip, f.dipdir, r.azimut!) }));
  const dir = (a: { ang: number; bajaDerecha: boolean }, haciaArriba: 'izq' | 'der'): P => { const t = rad(a.ang); return haciaArriba === 'der' ? [Math.cos(t), Math.sin(t)] : [-Math.cos(t), Math.sin(t)]; };
  const perno = longPerno((r.sostenimiento ?? []).join(' '));
  const zi = zonaInfluencia(r);
  const out: Cuna[] = [];
  const hw = H - Math.min(H * 0.45, B * 0.31);
  const iz = real.findIndex(p => p[1] >= hw - 1e-6), de = real.length - 1 - [...real].reverse().findIndex(p => p[1] >= hw - 1e-6);
  const SL = real[iz]!, SR = real[de]!, techo = Math.max(...real.map(p => p[1]));
  const baseDe = (i0: number, i1: number) => real.slice(i0, i1 + 1).map((p, k) => ({ p, n: nor[i0 + k]! }));
  // Corona: cara izquierda baja a la izquierda (sube hacia la derecha), cara derecha baja a la derecha.
  let mejor: Cuna | null = null;
  for (const a of ap) for (const b of ap) {
    if (a === b || a.bajaDerecha || !b.bajaDerecha || a.ang < 12 || b.ang < 12) continue;
    // La cuña no puede tener caras más largas que la persistencia de sus familias: se achica hacia el centro.
    const L = Math.min(largoTraza(r, a.f), largoTraza(r, b.f)), hMax = zi ? zi.corona : Infinity;
    let i0 = iz, i1 = de, A: P | null = null;
    while (i1 - i0 >= 2) {
      A = cruce(real[i0]!, dir(a, 'der'), real[i1]!, dir(b, 'izq'));
      const alto = A ? A[1] - Math.max(...real.slice(i0, i1 + 1).map(p => p[1])) : 0;
      if (!A || (Math.max(Math.hypot(A[0] - real[i0]![0], A[1] - real[i0]![1]), Math.hypot(A[0] - real[i1]![0], A[1] - real[i1]![1])) <= L && alto <= hMax)) break;
      const cx = (real[i0]![0] + real[i1]![0]) / 2;
      if (Math.abs(real[i0 + 1]![0] - cx) > Math.abs(real[i1 - 1]![0] - cx)) i0++; else i1--;
    }
    if (!A) continue;
    const top = Math.max(...real.slice(i0, i1 + 1).map(p => p[1]));
    if (A[1] <= top + 0.05 || A[1] - top > hMax + 0.05) continue;
    const pol: P[] = [real[i0]!, A, real[i1]!, ...real.slice(i0, i1 + 1).reverse()];
    const ar = area(pol), c: Cuna = { zona: 'CORONA', familias: [a.f.n, b.f.n], pol, altura: A[1] - top, area: ar, peso: ar * GAMMA, ancla: perno != null ? perno - (A[1] - top) : null, base: baseDe(i0, i1), persist: Number.isFinite(L) ? L : undefined };
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
      let pol: P[] = [pie, A, cab], prof = s * A[0] - B / 2;
      if (zi && prof > zi.hastial) { // se achica (semejante) hasta la zona de influencia
        const k = zi.hastial / prof, M: P = [(pie[0] + cab[0]) / 2, (pie[1] + cab[1]) / 2];
        pol = pol.map(q => [M[0] + k * (q[0] - M[0]), M[1] + k * (q[1] - M[1])] as P); prof = zi.hastial;
      }
      const ar = area(pol);
      const c: Cuna = { zona: lado, familias: [a.f.n, b.f.n], pol, altura: prof, area: ar, peso: ar * GAMMA, ancla: perno != null ? perno - prof : null, incl: a.ang, base: lado === 'HD' ? baseDe(de, real.length - 1) : baseDe(0, iz) };
      if (prof < B && (!m || c.area > m.area)) m = c;
    }
    if (m) out.push(m);
  }
  return out;
}

export function vistaSeccion(r: Reporte, rmr: RmrZonas): Vista {
  const espTxt = (c: Cuna) => { const e = c.familias.map(n => familiasMedidas(r).find(f => f.n === n)?.espaciamiento).filter((x): x is number => x != null && x > 0); return e.length === 2 ? ` Con espaciados de ${e[0]} y ${e[1]} m se repiten bloques de ese tamaño a lo largo de la corona.` : ''; };
  const B = r.ancho ?? 5, H = r.alto ?? 5, e = B * 0.55;
  const az0 = r.azimut ?? 0, dirsAp = familiasMedidas(r).map(f => { const a = aparente(f.dip, f.dipdir, az0), t = rad(a.bajaDerecha ? -a.ang : a.ang); return [Math.cos(t), Math.sin(t)] as P; });
  const semilla = `${r.id}|${r.labor}|${r.fecha}`, vol = contornoVoladura(B, H, r.sobreexc ?? {}, semilla, dirsAp);
  const teo = seccionTeorica(B, H).pts, real = vol.pts;
  // ventana con la proporción del recuadro del formato (272 × 215 pt); se agranda si la sobreexcavación no entra
  const techoReal = Math.max(...real.map(p => p[1])), lado = Math.max(...real.map(p => Math.abs(p[0])));
  const apice = Math.max(0, ...cunas(r).filter(c => c.zona === 'CORONA').map(c => c.pol[1]![1]).filter(y => y < H * 1.5));
  const alto = Math.max(H * 1.17, techoReal + 0.55 + H * 0.07, apice + 0.35 + H * 0.07, (2 * lado + B * 0.5) * 215 / 272), y0 = -alto * 0.06;
  const caja: Vista['caja'] = [-(alto * 272) / 215 / 2, y0, (alto * 272) / 215 / 2, y0 + alto];
  void e;
  const marco: P[] = [[caja[0], caja[1]], [caja[2], caja[1]], [caja[2], caja[3]], [caja[0], caja[3]]];
  const prims: Prim[] = [];
  const notas: string[] = [];
  // roca por zona: H.I. a la izquierda, corona arriba, H.D. a la derecha
  const cC = colorTipo(rmr.CORONA ?? rmr.HI ?? rmr.HD), cI = colorTipo(rmr.HI ?? rmr.CORONA), cD = colorTipo(rmr.HD ?? rmr.CORONA);
  prims.push({ t: 'poly', pts: marco, cerrado: true, relleno: '#FFFFFF' }, { t: 'poly', pts: marco, cerrado: true, relleno: cC, opac: 0.5 });
  const hw = H - Math.min(H * 0.45, B * 0.31);
  if (cI !== cC) prims.push({ t: 'poly', pts: [[caja[0], caja[1]], [-B / 2, caja[1]], [-B / 2, hw], [caja[0], hw + (caja[0] + B / 2) * -0.6]], cerrado: true, relleno: cI, opac: 0.5 });
  if (cD !== cC) prims.push({ t: 'poly', pts: [[caja[2], caja[1]], [B / 2, caja[1]], [B / 2, hw], [caja[2], hw + (caja[2] - B / 2) * 0.6]], cerrado: true, relleno: cD, opac: 0.5 });
  // rótulo del tipo de roca de cada zona coloreada (no es litología: sale del RMR de la zona)
  const litZ = (zona: string) => (zona.startsWith('H.I') ? r.litologia.HI : zona.startsWith('H.D') ? r.litologia.HD : r.litologia.CORONA) || '';
  const etq = (v: number | null | undefined, zona: string) => v == null ? null : `${zona}Tipo ${tipoRoca(v)} · RMR ${Math.round(v)}${litZ(zona) ? ` · ${litZ(zona)}` : ''}`;
  const tTop = caja[3] - (caja[3] - caja[1]) * 0.05, tBot = caja[1] + (caja[3] - caja[1]) * 0.03;
  if (cI === cC && cD === cC) { const t = etq(rmr.CORONA ?? rmr.HI ?? rmr.HD, ''); if (t) prims.push({ t: 'texto', p: [caja[2] - B * 0.03, tTop], s: t, tam: 5, negrita: true, color: '#3A3A3A', ancla: 'der', fondo: true }); }
  else {
    const tc = etq(rmr.CORONA, 'Corona: '), ti = etq(rmr.HI, 'H.I.: '), td = etq(rmr.HD, 'H.D.: ');
    if (tc) prims.push({ t: 'texto', p: [caja[2] - B * 0.03, tTop], s: tc, tam: 5, negrita: true, color: '#3A3A3A', ancla: 'der', fondo: true });
    if (ti && cI !== cC) prims.push({ t: 'texto', p: [caja[0] + B * 0.03, tBot], s: ti, tam: 5, negrita: true, color: '#3A3A3A', ancla: 'izq', fondo: true });
    if (td && cD !== cC) prims.push({ t: 'texto', p: [caja[2] - B * 0.03, tBot], s: td, tam: 5, negrita: true, color: '#3A3A3A', ancla: 'der', fondo: true });
  }
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
        prims.push({ t: 'poly', pts: [a, b], borde: '#4A4A4A', ancho: 0.3 });
      }
    }
  });
  // sobreexcavación / subexcavación entre el contorno teórico y el real
  const so = r.sobreexc ?? {};
  const iHueco = prims.length;  // las cuñas se meten antes del hueco, así el hueco recorta su base
  prims.push({ t: 'poly', pts: real, cerrado: true, relleno: '#FFFFFF' });
  {
    for (const z of ['HI', 'CORONA', 'HD'] as Zona[]) {
      const v = so[z]; if (!v) continue;
      const p: P = z === 'CORONA' ? [0, H + Math.max(v, 0) + 0.25] : [(z === 'HD' ? 1 : -1) * (B / 2 + Math.max(v, 0) + 0.15), H * 0.32];
      prims.push({ t: 'texto', p, s: `${v > 0 ? 'Sobreexc.' : 'Subexc.'} ${Math.abs(v).toFixed(2)} m`, tam: 5, color: v > 0 ? '#1F4E79' : ROJO, ancla: z === 'HD' ? 'izq' : z === 'HI' ? 'der' : 'centro', fondo: true });
      notas.push(`${z === 'CORONA' ? 'Corona' : z === 'HI' ? 'Hastial izquierdo' : 'Hastial derecho'}: ${v > 0 ? 'sobreexcavación' : 'subexcavación'} de ${Math.abs(v).toFixed(2)} m.`);
    }
  }
  // cuñas potenciales con su nivel de riesgo
  const pinfo = pernoInfo((r.sostenimiento ?? []).join(' '));
  const zi = zonaInfluencia(r);
  if (zi && familiasMedidas(r).length >= 2) {
    // límite de la zona de influencia (corona: % del alto; hastiales: % del ancho), línea discontinua
    const lim = real.map((p, i) => { const n = vol.normal[i]!, d = n[1] > 0.5 ? zi.corona : zi.hastial; return [p[0] + n[0] * d, p[1] + n[1] * d] as P; }).filter(p => p[1] > 0.05);
    prims.push({ t: 'poly', pts: lim, borde: '#0B1A2A', ancho: 0.5, trazos: [2, 1.5] });
    const tope = lim.reduce((a, p) => (p[1] > a[1] ? p : a), lim[0]!);
    prims.push({ t: 'texto', p: [tope[0] - B * 0.1, tope[1] + 0.1], s: `Zona de influencia ${Math.round(zi.pct * 100)} % (${zi.tipo})`, tam: 4.2, color: '#0B1A2A', ancla: 'der', fondo: true });
    notas.push(`Zona de influencia de cuñas para roca ${zi.tipo}: ${Math.round(zi.pct * 100)} % de la sección (${zi.corona.toFixed(2)} m sobre la corona, ${zi.hastial.toFixed(2)} m detrás de los hastiales). Las cuñas se dibujan solo dentro de esa franja.`);
  }
  for (const c of cunas(r)) {
    prims.splice(iHueco, 0, { t: 'poly', pts: c.pol, cerrado: true, relleno: '#35506B', opac: 0.35, borde: '#0B1A2A', ancho: 0.7, trazos: [3, 1.2] });
    const ce: P = [c.pol.reduce((a, p) => a + p[0], 0) / c.pol.length, c.pol.reduce((a, p) => a + p[1], 0) / c.pol.length];
    // rótulo dentro de la labor (zona blanca, legible); flecha hasta la cuña
    const lbl: P = c.zona === 'CORONA' ? [0, hw + (H - hw) * 0.15] : [(c.zona === 'HD' ? 1 : -1) * B * 0.12, H * 0.45 - (c.zona === 'HD' ? 0.5 : 0)];
    const meta: P = c.zona === 'CORONA' ? [0, Math.max(...real.map(p => p[1])) + 0.05] : [(c.zona === 'HD' ? 1 : -1) * (B / 2 + 0.25), Math.min(ce[1], hw * 0.6)];
    prims.push({ t: 'poly', pts: [[lbl[0], lbl[1] + 0.22], meta], borde: '#0B1A2A', ancho: 0.45 });
    prims.push({ t: 'poly', pts: flecha([lbl[0], lbl[1] + 0.22], meta, Math.min(B, H) * 0.035), cerrado: true, relleno: '#0B1A2A' });
    const nom = c.zona === 'CORONA' ? 'Cuña en corona' : `Cuña en ${c.zona === 'HD' ? 'H.D.' : 'H.I.'}`;
    const an = c.zona === 'CORONA' ? 'centro' : c.zona === 'HD' ? 'der' : 'izq';
    const rg = riesgoCuna(c, pinfo, espesorShotcrete((r.sostenimiento ?? []).join('\n')));
    const col = (n: string) => n === 'ALTO' ? '#C00000' : n === 'MEDIO' ? '#B26B00' : '#2E7D32';
    // riesgo propio de la cuña (sin sostener) y riesgo residual con el sostenimiento indicado
    const psi = rad(c.incl ?? 90), fs0 = c.zona === 'CORONA' ? 0 : Math.cos(psi) * Math.tan(rad(30)) / Math.max(Math.sin(psi), 0.01);
    const n0 = c.zona === 'CORONA' ? (c.peso >= 1 ? 'ALTO' : 'MEDIO') : fs0 < 1.5 ? 'ALTO' : fs0 < 2 ? 'MEDIO' : 'BAJO';
    prims.push({ t: 'texto', p: lbl, s: `${nom} (${c.familias.map(n => { const f = fams.find(x => x.n === n); return f ? f.abrev + n : n; }).join(' + ')}) · sin sostener: RIESGO ${n0}`, tam: 4.9, negrita: true, color: col(n0), ancla: an, fondo: true });
    prims.push({ t: 'texto', p: [lbl[0], lbl[1] - 0.3], s: `${c.zona === 'CORONA' ? 'h' : 'prof.'} ${c.altura.toFixed(1)} m · ${c.peso.toFixed(1)} t/m · ${rg.motivo.split(';')[0]}`, tam: 4.4, color: '#0B1A2A', ancla: an, fondo: true });
    prims.push({ t: 'texto', p: [lbl[0], lbl[1] - 0.58], s: `Con sostenimiento: FS ${rg.fs.toFixed(1)} · RIESGO ${rg.nivel}${rg.nivel === 'BAJO' ? '' : ` · ${rg.accion}`}`, tam: 4.4, negrita: true, color: col(rg.nivel), ancla: an, fondo: true });
    notas.push(`${nom} formada por ${c.familias.map(n => rotulo(fams.find(f => f.n === n)!)).join(' y ')}: ${c.zona === 'CORONA' ? 'altura' : 'profundidad'} ${c.altura.toFixed(1)} m, área ${c.area.toFixed(1)} m², ${c.peso.toFixed(1)} t por metro de labor. ` +
      `Sin sostener: riesgo ${n0}. Con el sostenimiento indicado: riesgo ${rg.nivel}, FS ${rg.fs.toFixed(1)} con pernos y shotcrete (${rg.fsPernos.toFixed(1)} solo con pernos); ${rg.motivo.split(';')[0]}. Recomendación: ${rg.accion}.` + (c.persist != null ? ` Tamaño limitado por la persistencia de las familias (trazas de hasta ${c.persist} m).` : c.altura > 3 ? ' Es la cuña máxima teórica (persistencia ilimitada); ingrese la persistencia de cada familia para el tamaño real.' : '') + espTxt(c));
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
    const fija = trazaSeccion(f, r); // movida a mano en la planta: pasa donde la puso el ingeniero
    if (fija) { o = fija.o; d[0] = fija.d[0]; d[1] = fija.d[1]; nn[0] = -d[1]; nn[1] = d[0]; }
    else for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
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
      const [p0, p1] = lar, fy = Math.abs(p1[1] - p0[1]) > 1e-6 ? Math.min(0.85, Math.max(0.15, (H * 0.42 - p0[1]) / (p1[1] - p0[1]))) : 0.5, q: P = [p0[0] + (p1[0] - p0[0]) * fy, p0[1] + (p1[1] - p0[1]) * fy], lado = q[0] < 0 ? 1 : -1;
      prims.push({ t: 'texto', p: [q[0] + lado * (0.15 + (f.potencia ?? 0)), q[1]], s: `${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${f.potencia ? ` · pot. ${f.potencia} m` : ''}`, tam: 5.2, color: st.borde, negrita: true, ancla: lado > 0 ? 'izq' : 'der', fondo: true });
    }
  });
  // contornos: teórico a trazos y real continuo
  prims.push({ t: 'poly', pts: teo, borde: '#555555', ancho: 0.45, trazos: [2.2, 1.6] });
  prims.push({ t: 'poly', pts: real, borde: '#000000', ancho: 0.9 });
  prims.push({ t: 'poly', pts: [real[0]!, real.at(-1)!], borde: '#000000', ancho: 0.6 });
  // sostenimiento
  const sost = (r.sostenimiento ?? []).join(' ').toLowerCase(), esp = Math.min(B, H) * 0.018, interior: P[] = real.map((p, i) => i === 0 || i === real.length - 1 ? [p[0] - vol.normal[i]![0] * esp, 0] as P : [p[0] - vol.normal[i]![0] * esp, p[1] - vol.normal[i]![1] * esp] as P);
  // shotcrete: banda gris pegada al contorno real (sin hueco entre roca y shotcrete)
  if (/shotcrete|lanzado/.test(sost)) prims.push({ t: 'poly', pts: [...real, ...[...interior].reverse()], cerrado: true, relleno: '#9A9A9A', opac: 0.9 }, { t: 'poly', pts: interior, borde: '#6E6E6E', ancho: 0.3 });
  prims.push({ t: 'poly', pts: real, borde: '#000000', ancho: 0.9 });
  if (/malla/.test(sost)) {
    const soloCorona = /corona/.test(sost) && !/hastial|secci[oó]n completa|toda/.test(sost.match(/malla[^.;\n]*/)?.[0] ?? '');
    // malla: zigzag continuo dentro de la banda de shotcrete, a lo largo de la zona indicada
    const amp = esp * 0.45, zig: P[] = [];
    real.forEach((p, k) => { if (k % 2 || p[1] <= (soloCorona ? hw : H * 0.15)) return; const q = interior[k]!, n = vol.normal[k]!, sg = zig.length % 2 ? 1 : -1; zig.push([(p[0] + q[0]) / 2 + n[0] * amp * sg, (p[1] + q[1]) / 2 + n[1] * amp * sg]); });
    prims.push({ t: 'poly', pts: zig, borde: '#1F4E9E', ancho: 0.4 });
  }
  const lp = longPerno(sost);
  if (lp && /perno|split|helicoidal|bolt|swellex/.test(sost)) {
    // un perno cada ~1.3 m de contorno (o el espaciamiento indicado, p. ej. 1.5x1.5)
    const espP = Number(sost.match(/(\d(?:[.,]\d+)?)\s*[x×]\s*\d/)?.[1]?.replace(',', '.')) || 1.3;
    let ultimo = -Infinity, sArc = 0; const puntas: P[] = [];
    for (let i = 1; i < real.length - 1; i++) {
      sArc += Math.hypot(real[i]![0] - real[i - 1]![0], real[i]![1] - real[i - 1]![1]);
      const p = real[i]!, nv = vol.normal[i]!; if (p[1] < H * 0.18 || sArc - ultimo < espP) continue;
      ultimo = sArc;
      const q: P = [p[0] + nv[0] * lp, p[1] + nv[1] * lp];
      prims.push({ t: 'poly', pts: [p, q], borde: '#000000', ancho: 1.2 });
      puntas.push(q);
      prims.push({ t: 'poly', pts: [[p[0] - nv[1] * 0.12, p[1] + nv[0] * 0.12], [p[0] + nv[1] * 0.12, p[1] - nv[0] * 0.12]], borde: '#000000', ancho: 1.5 });
    }
    // rótulo corto del perno, a un lado, con guía hasta la punta del perno más cercano
    if (pinfo && puntas.length) {
      const pos: P = [caja[2] - B * 0.03, caja[3] - (caja[3] - caja[1]) * 0.12];
      const txtP = `${pinfo.tipo} ${pinfo.pies != null ? pinfo.pies + "'" : pinfo.largo.toFixed(1) + ' m'} · ${pinfo.esp}×${pinfo.esp} m${pinfo.intercalado ? ' intercalado' : ''}`;
      const guia: P = [pos[0] - (txtP.length * 5 * 0.5 * B) / 152 / 2, pos[1] - 0.06];
      const pt = puntas.reduce((m, q) => Math.hypot(q[0] - guia[0], q[1] - guia[1]) < Math.hypot(m[0] - guia[0], m[1] - guia[1]) ? q : m);
      prims.push({ t: 'poly', pts: [pt, guia], borde: '#000000', ancho: 0.35 });
      prims.push({ t: 'texto', p: pos, s: txtP, tam: 5, negrita: true, ancla: 'der', fondo: true });
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

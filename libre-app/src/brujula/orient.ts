// Cálculos de orientación (los mismos de la Fase 0). Mundo: x = Este, y = Norte, z = Arriba. W3C ZXY.
const D = Math.PI / 180;
export type M3 = [[number, number, number], [number, number, number], [number, number, number]];
export function rot(alpha: number, beta: number, gamma: number): M3 {
  const a = alpha * D, b = beta * D, c = gamma * D;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(c), sG = Math.sin(c);
  return [
    [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG],
    [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
    [-cB * sG, sB, cB * cG],
  ];
}
const col = (R: M3, j: number): [number, number, number] => [R[0][j]!, R[1][j]!, R[2][j]!];
export const norm360 = (x: number) => ((x % 360) + 360) % 360;
export const wrap180 = (x: number) => { x = norm360(x); return x > 180 ? x - 360 : x; };
export const heading = (v: number[]) => norm360(Math.atan2(v[0]!, v[1]!) / D);
/** Eje de la cámara trasera (−Z del celular). */
export function camera(a: number, b: number, g: number) {
  const z = col(rot(a, b, g), 2); const v = [-z[0], -z[1], -z[2]];
  const h = Math.hypot(v[0]!, v[1]!);
  return { az: heading(v), plunge: Math.atan2(v[2]!, h) / D };
}
export const top = (a: number, b: number, g: number) => heading(col(rot(a, b, g), 1));
/** Plano donde se apoya el celular: dip y dip direction (normal hacia arriba). */
export function plane(a: number, b: number, g: number) {
  let n = col(rot(a, b, g), 2);
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  return { dip: Math.acos(Math.min(1, n[2])) / D, dipdir: heading(n) };
}
export function circStats(list: number[]) {
  if (!list.length) return { mean: NaN, sd: NaN };
  let s = 0, c = 0; for (const x of list) { s += Math.sin(x * D); c += Math.cos(x * D); }
  s /= list.length; c /= list.length; const R = Math.min(1, Math.hypot(s, c));
  return { mean: norm360(Math.atan2(s, c) / D), sd: R > 0 ? Math.sqrt(-2 * Math.log(R)) / D : 180 };
}
export function linStats(list: number[]) {
  if (!list.length) return { mean: NaN, sd: NaN };
  const m = list.reduce((a, b) => a + b, 0) / list.length;
  return { mean: m, sd: Math.sqrt(list.reduce((a, b) => a + (b - m) ** 2, 0) / list.length) };
}
/** Magnético → verdadero (declinación, Oeste negativa) → cuadrícula UTM (menos convergencia). */
export const toGrid = (mag: number, decl: number, conv = 0) => norm360(mag + decl - conv);

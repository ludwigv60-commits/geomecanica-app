// Control de calidad de la foto y mejora para poca luz (Módulo 5). Todo en el celular.

export interface Calidad { apta: boolean; motivos: string[]; nitidez: number; brillo: number; contraste: number; quemado: number }

/** Luminancia 0..1 de una imagen RGBA. */
function lum(d: Uint8ClampedArray, n: number) {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = (0.299 * d[4 * i]! + 0.587 * d[4 * i + 1]! + 0.114 * d[4 * i + 2]!) / 255;
  return g;
}

/**
 * Evalúa la foto (idealmente reducida a ~800 px).
 * Nitidez = varianza del Laplaciano (normalizada por el contraste para no castigar la roca oscura).
 */
export function evaluar(d: Uint8ClampedArray, w: number, h: number): Calidad {
  const g = lum(d, w * h);
  let s = 0, s2 = 0, alto = 0;
  for (const v of g) { s += v; s2 += v * v; if (v > 0.97) alto++; }
  const n = g.length, brillo = s / n, contraste = Math.sqrt(Math.max(0, s2 / n - brillo * brillo)), quemado = alto / n;
  let l = 0, l2 = 0, m = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x;
    const v = 4 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - w]! - g[i + w]!;
    l += v; l2 += v * v; m++;
  }
  const varLap = l2 / m - (l / m) ** 2;
  const nitidez = varLap / Math.max(1e-4, contraste * contraste);
  const motivos: string[] = [];
  if (brillo < 0.12) motivos.push('muy oscura, use linterna o reflector');
  if (quemado > 0.12) motivos.push('sobreexpuesta (zona blanca por la luz)');
  if (contraste < 0.05) motivos.push('sin contraste (polvo, neblina o lente mojado)');
  if (nitidez < 0.02) motivos.push('movida o desenfocada');
  return { apta: motivos.length === 0, motivos, nitidez, brillo, contraste, quemado };
}

export const mensajeCalidad = (c: Calidad) => (c.apta ? 'Foto apta.' : `FOTO NO APTA – ${c.motivos.join('; ')}. Tome una nueva.`);

/** Mejora para poca luz: estiramiento por percentiles 1–99 % y gamma. Devuelve una copia. */
export function mejorar(d: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const g = lum(d, w * h);
  const hist = new Uint32Array(256); for (const v of g) hist[Math.min(255, Math.round(v * 255))]!++;
  const pct = (p: number) => { let acc = 0; const obj = g.length * p; for (let i = 0; i < 256; i++) { acc += hist[i]!; if (acc >= obj) return i / 255; } return 1; };
  const lo = pct(0.01), hi = Math.max(lo + 0.05, pct(0.99));
  const media = g.reduce((a, b) => a + b, 0) / g.length;
  const gamma = media < 0.35 ? 0.7 : 1;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < w * h; i++) {
    const v = g[i]!; const nv = Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma);
    const k = v > 0.004 ? nv / v : 0;
    for (let c = 0; c < 3; c++) out[4 * i + c] = Math.min(255, d[4 * i + c]! * k);
    out[4 * i + 3] = 255;
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { desdeMapa, esqueleto } from './modelo-trazas';

/** Mapa de probabilidad sintético: dos familias de trazas (30° y 120°) como las daría la red. */
function mapa(w = 480, h = 360) {
  const p = new Float32Array(w * h);
  const linea = (ang: number, off: number) => {
    const a = ang * Math.PI / 180, nx = Math.sin(a), ny = Math.cos(a);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs((x - w / 2) * nx + (y - h / 2) * ny - off) < 2) p[y * w + x] = 0.9;
  };
  for (let k = -4; k <= 4; k++) linea(30, k * 45);
  for (let k = -3; k <= 3; k++) linea(120, k * 60);
  return { w, h, p };
}

describe('Trazas con red neuronal (post-proceso)', () => {
  it('el esqueleto deja líneas de 1 píxel', () => {
    const w = 40, h = 20, m = new Uint8Array(w * h);
    for (let y = 8; y <= 12; y++) for (let x = 5; x < 35; x++) m[y * w + x] = 1;
    esqueleto(m, w, h);
    const filas = new Set<number>(); for (let i = 0; i < w * h; i++) if (m[i]) filas.add(Math.floor(i / w));
    expect(filas.size).toBeLessThanOrEqual(2);
  });
  it('encuentra las 2 familias, con confianza', () => {
    const t = desdeMapa(mapa());
    const angs = t.familias.map(f => f.ang).sort((a, b) => a - b);
    expect(t.familias.length).toBe(2);
    expect(Math.abs(angs[0]! - 30)).toBeLessThanOrEqual(4);
    expect(Math.abs(angs[1]! - 120)).toBeLessThanOrEqual(4);
    expect(t.confianza).toBeGreaterThan(0.25);
  });
  it('fuera de la zona de roca no cuenta trazas', () => {
    const m = mapa(); const zona = new Uint8Array(m.w * m.h);
    expect(desdeMapa(m, { zona }).segmentos.length).toBe(0);
  });
});

import { separarZonas } from './modelo-trazas';
describe('Zonas de la labor en una sola foto', () => {
  it('separa H.I., corona y H.D. alrededor del frente', () => {
    const w = 100, h = 80, c = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = x >= 30 && x < 70 && y >= 25 && y < 70 ? 1 : y < 70 ? 2 : 4;
    const { zona, frente } = separarZonas(c, w, h);
    expect(frente).not.toBeNull();
    expect(zona[40 * w + 50]).toBe(1);   // frente
    expect(zona[50 * w + 5]).toBe(2);    // H.I.
    expect(zona[5 * w + 50]).toBe(3);    // corona
    expect(zona[50 * w + 95]).toBe(4);   // H.D.
    expect(zona[75 * w + 50]).toBe(0);   // piso
  });
});

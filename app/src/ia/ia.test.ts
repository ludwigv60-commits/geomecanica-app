import { describe, expect, it } from 'vitest';
import { analizar } from './trazas';
import { medidasFoto, proponer, aplicar, consejos } from './sugerencias';
import { nuevoReporte } from '../model';
import { calcular } from '../calc';

/** Imagen sintética: roca gris con ruido y dos familias de fracturas oscuras. */
function sintetica(w = 480, h = 360) {
  const d = new Uint8ClampedArray(w * h * 4);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < w * h; i++) { const v = 150 + rnd() * 30; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  const linea = (ang: number, off: number) => {
    const a = ang * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dist = Math.abs((x - w / 2) * nx + (y - h / 2) * ny - off);
      if (dist < 1.6) { const i = y * w + x; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = 40; }
    }
  };
  for (let k = -5; k <= 5; k++) linea(30, k * 40);
  for (let k = -4; k <= 4; k++) linea(120, k * 60);
  return { d, w, h };
}

describe('IA en el celular', () => {
  const { d, w, h } = sintetica();
  const t = analizar(d, w, h);
  it('encuentra 2 familias con su orientación aparente', () => {
    const angs = t.familias.map(f => f.ang).sort((a, b) => a - b);
    expect(t.familias.length).toBe(2);
    expect(Math.abs(angs[0]! - 30)).toBeLessThanOrEqual(3);
    expect(Math.abs(angs[1]! - 120)).toBeLessThanOrEqual(3);
  });
  it('mide el espaciamiento de cada familia', () => {
    const e = t.familias.map(f => [f.ang, f.espaciamientoPx!] as const).sort((a, b) => a[0] - b[0]);
    expect(Math.abs(e[0]![1] - 40)).toBeLessThanOrEqual(6);
    expect(Math.abs(e[1]![1] - 60)).toBeLessThanOrEqual(8);
  });
  it('convierte a metros, Jv y propone RQD y Jn', () => {
    const m = medidasFoto(t, 4.8)!; // 480 px = 4.8 m → 100 px/m
    expect(m.jv).toBeGreaterThan(3.5); expect(m.jv).toBeLessThan(5.5); // 1/0.4 + 1/0.6 ≈ 4.2
    const r = nuevoReporte();
    const props = proponer(r, [], m);
    expect(props.find(p => p.clave === 'q.jn')!.valor).toBe(4);
    const n = aplicar(r, props);
    expect(n.jv).toBe(m.jv);
    expect(n.sugeridos).toContain('jv');
  });
});

describe('Propuestas desde el historial y consejos', () => {
  it('no sobreescribe lo ya llenado y usa la moda de la misma labor', () => {
    const prev = [1, 2, 3].map(() => {
      const p = nuevoReporte(); p.labor = 'Rampa Norte';
      p.rmr.CORONA = { ucs: 7, agua: 15 }; p.q.CORONA = { jr: 3, ja: 2, jw: 1, srf: 2.5 }; p.litologia.CORONA = 'Piroclasto';
      return p;
    });
    const r = nuevoReporte(); r.labor = 'Rampa Norte'; r.rmr = { HI: { agua: 10 }, CORONA: { agua: 10 }, HD: { agua: 10 } };
    const n = aplicar(r, proponer(r, prev, null));
    expect(n.rmr.CORONA.ucs).toBe(7);
    expect(n.rmr.CORONA.agua).toBe(10);
    expect(n.q.HD.srf).toBe(2.5);
    expect(n.litologia.HI).toBe('Piroclasto');
    const avisos = consejos(n, calcular(n), prev);
    expect(avisos.some(a => a.includes('Sugerido por IA'))).toBe(true);
    expect(avisos.some(a => a.includes('azimut'))).toBe(true);
  });
});

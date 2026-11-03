import { describe, expect, it } from 'vitest';
import { aparente, recortarSegmento, vistaSeccion, vistaPlanta } from './croquis';
import { nuevoReporte } from '../model';

describe('planta y sección', () => {
  it('buzamiento aparente en el frente', () => {
    // plano que buza hacia la derecha del frente (azimut 0 → derecha = este): aparente = real
    expect(aparente(60, 90, 0).ang).toBeCloseTo(60, 5); expect(aparente(60, 90, 0).bajaDerecha).toBe(true);
    // plano paralelo al eje de la labor (buza hacia el frente): traza horizontal
    expect(aparente(60, 0, 0).ang).toBeCloseTo(0, 5);
    expect(aparente(45, 270, 0).bajaDerecha).toBe(false);
  });
  it('recorta segmentos al recuadro', () => {
    expect(recortarSegmento([-10, 5], [20, 5], [0, 0, 10, 10])).toEqual([[0, 5], [10, 5]]);
    expect(recortarSegmento([-10, -5], [-1, -5], [0, 0, 10, 10])).toBeNull();
  });
  it('dibuja con los datos del reporte', () => {
    const r = { ...nuevoReporte(), azimut: 330, ancho: 5.7, alto: 5.4, familias: [{ abrev: 'SD', dip: 75, dipdir: 45 }, { abrev: 'F', dip: 85, dipdir: 230 }] };
    expect(vistaPlanta(r, { CORONA: 51 })!.prims.filter(p => p.t === 'texto').map(p => (p as { s: string }).s)).toContain('2');
    expect(vistaSeccion(r, { CORONA: 51 }).prims.some(p => p.t === 'poly' && p.borde === '#C00000')).toBe(true);
    expect(vistaPlanta({ ...r, azimut: null }, { CORONA: 51 })).toBeNull();
  });
});

import { trazaSeccion } from './croquis';
describe('trazaSeccion', () => {
  it('plano vertical paralelo al avance: traza vertical en x = t', () => {
    const t = trazaSeccion({ dip: 90, dipdir: 90, pos: { s: -2, t: 1.2 } }, { azimut: 0, alto: 5 })!;
    expect(t.o[0]).toBeCloseTo(1.2); expect(Math.abs(t.d[0])).toBeCloseTo(0);
  });
  it('mover la estructura a la derecha mueve su traza en la sección', () => {
    const a = trazaSeccion({ dip: 60, dipdir: 120, pos: { s: 0, t: 0 } }, { azimut: 30, alto: 5 })!;
    const b = trazaSeccion({ dip: 60, dipdir: 120, pos: { s: 0, t: 1 } }, { azimut: 30, alto: 5 })!;
    const n = [-a.d[1], a.d[0]] as const, off = (o: number[]) => n[0] * o[0]! + n[1] * o[1]!;
    expect(Math.abs(off(b.o) - off(a.o))).toBeGreaterThan(0.5);
  });
});

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
    expect(vistaPlanta(r, 51)!.prims.filter(p => p.t === 'texto').map(p => (p as { s: string }).s)).toContain('2');
    expect(vistaSeccion(r, 51).prims.some(p => p.t === 'poly' && p.borde === '#FF0000')).toBe(true);
    expect(vistaPlanta({ ...r, azimut: null }, 51)).toBeNull();
  });
});

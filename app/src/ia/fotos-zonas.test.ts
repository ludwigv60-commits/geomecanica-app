import { describe, expect, it } from 'vitest';
import { afinarFamilias, anguloEnFoto, difAng, esperadas, familiaDeTraza, rellenarZona } from './fotos-zonas';
import { anguloEnFrente } from './lineas';
import { nuevoReporte, type Reporte } from '../model';

describe('fotos de hastiales y corona', () => {
  it('en el frente coincide con anguloEnFrente', () => {
    for (const [dip, dd, az] of [[70, 250, 168], [45, 30, 330], [80, 120, 10]]) expect(anguloEnFoto(dip!, dd!, az!, 'FRENTE')).toBeCloseTo(anguloEnFrente(dip!, dd!, az!)!, 6);
  });
  it('plano horizontal: horizontal en los hastiales y sin traza en la corona', () => {
    expect(difAng(anguloEnFoto(0.1, 0, 0, 'HI')!, 0)).toBeLessThan(1);
    expect(anguloEnFoto(0.1, 0, 0, 'CORONA')).toBeNull();
  });
  it('asigna la traza a la familia más cercana dentro de ±15°', () => {
    const esp = [{ i: 0, ang: 30 }, { i: 1, ang: 120 }];
    expect(familiaDeTraza(40, esp)).toBe(0); expect(familiaDeTraza(178, esp)).toBe(-1); expect(familiaDeTraza(110, esp)).toBe(1);
  });
  it('afina la orientación con trazas en frente y hastial', () => {
    const r: Reporte = { ...nuevoReporte(), azimut: 168, familias: [{ abrev: 'SD', dip: 60, dipdir: 240 }] };
    const real = [70, 250] as const; // orientación verdadera; lo medido tiene 10° de error
    const seg = (zona: 'FRENTE' | 'HI' | 'CORONA') => { const a = anguloEnFoto(real[0], real[1], 168, zona)!; return { id: zona, zona, data: '', fecha: '', trazas: { w: 100, h: 100, segmentos: [{ x1: 0, y1: 0, x2: 1, y2: 1, ang: a, largo: 50, familia: 0 }] } }; };
    const af = afinarFamilias({ ...r, fotos: [seg('FRENTE'), seg('HI'), seg('CORONA')] });
    expect(af).toHaveLength(1);
    expect(Math.abs(af[0]!.dip - 70)).toBeLessThanOrEqual(1); expect(difAng(af[0]!.dipdir, 250)).toBeLessThanOrEqual(1);
    expect(esperadas(r, 'HD')).toHaveLength(1);
  });
  it('rellena solo lo vacío de la zona con los datos de las otras', () => {
    const r = nuevoReporte();
    r.rmr.CORONA.rqd = 13; r.litologia.CORONA = 'Andesita'; r.rmr.HD.rqd = 8;
    const { r: n, n: k } = rellenarZona(r, 'HD');
    expect(n.rmr.HD.rqd).toBe(8); expect(n.litologia.HD).toBe('Andesita'); expect(k).toBe(1);
  });
});

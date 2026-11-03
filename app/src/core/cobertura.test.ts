import { describe, expect, it } from 'vitest';
import { cobertura, coberturaEn, rampaDeLabor } from './cobertura';

// parámetros de prueba (no son los de la mina)
const T = { Norte: { base: 100, pkInicio: 20, angulo: 6.84 }, Sur: { base: 80, pkInicio: 10, angulo: 6.84 } };
const s = Math.sin(6.84 * Math.PI / 180);
describe('cobertura', () => {
  it('sigue la fórmula de la hoja coberturas', () => {
    expect(coberturaEn(5, T.Norte)).toBe(0);
    expect(coberturaEn(20, T.Norte)).toBeCloseTo(100 * s, 6);
    expect(coberturaEn(945.45, T.Norte)).toBeCloseTo((100 + 945 - 20) * s, 6);
  });
  it('usa PK inicial o el promedio con el final', () => {
    expect(cobertura({ rampa: 'Sur', desde: '0+822.8', hasta: '' }, T)!.pk).toBeCloseTo(822.8);
    const c = cobertura({ rampa: 'Sur', desde: '0+822.8', hasta: '0+826.7' }, T)!;
    expect(c.pk).toBeCloseTo(824.75); expect(c.m).toBeCloseTo(Math.round((80 + 824 - 10) * s * 10) / 10);
    expect(cobertura({ rampa: '', desde: '1', hasta: '' }, T)).toBeNull();
    expect(cobertura({ rampa: 'Norte', desde: '1', hasta: '' }, {})).toBeNull();
  });
  it('deduce la rampa del nombre', () => {
    expect(rampaDeLabor('Rampa Norte')).toBe('Norte'); expect(rampaDeLabor('RP SUR')).toBe('Sur'); expect(rampaDeLabor('Cámara 2')).toBe('');
  });
});

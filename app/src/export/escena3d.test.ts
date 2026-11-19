import { describe, expect, it } from 'vitest';
import { nuevoReporte, type Reporte } from '../model';
import { escena3d, triangular } from './escena3d';
import { analizarCunas } from './cunas2d';

const pz = { ucs: 7, rqd: 8, espaciamiento: 10, persistencia: 2, abertura: 1, rugosidad: 3, relleno: 2, alteracion: 3, agua: 10 };
const ej = (): Reporte => ({ ...nuevoReporte(), avance: 3, azimut: 330, ancho: 5, alto: 5, rmr: { HI: pz, CORONA: pz, HD: pz }, ajuste: { HI: -5, CORONA: -5, HD: -5 },
  familias: [{ abrev: 'SD', dip: 68, dipdir: 115, espaciamiento: 0.5, persistencia: 3 }, { abrev: 'SD', dip: 62, dipdir: 290, espaciamiento: 0.5, persistencia: 3 }, { abrev: 'F', dip: 78, dipdir: 50, potencia: 0.1 }] } as Reporte);

describe('vista 3D de cuñas', () => {
  it('triangula polígonos cóncavos', () => {
    expect(triangular([[0, 0], [2, 0], [2, 2], [1, 1], [0, 2]]).length).toBe(9);
  });
  it('arma la escena: labor, cuñas a lo largo del avance y la falla como plano', () => {
    const r = ej(), e = escena3d(r, { CORONA: 50 })!;
    expect(e.L).toBe(3);
    expect(e.mallas.some(m => m.capa === 'cunas')).toBe(true);
    expect(e.mallas.some(m => m.capa === 'fallas')).toBe(true);
    expect(e.volTotal).toBeGreaterThan(0);
    // todo dentro del avance (z entre el frente y el Desde, con un margen por el corrimiento de las cuñas)
    const z = e.mallas.filter(m => m.capa === 'cunas').flatMap(m => m.pos.filter((_, i) => i % 3 === 2));
    expect(Math.min(...z)).toBeGreaterThanOrEqual(-0.01); expect(Math.max(...z)).toBeLessThanOrEqual(3.01);
  });
  it('la sección a 0 m sin reubicar la falla es la misma red que la del frente', () => {
    const r = ej(), a = analizarCunas(r)!, b = analizarCunas(r, { sSec: 0, ubicar: false })!;
    expect(b.lineas.filter(l => l.fam.abrev === 'SD').length).toBe(a.lineas.filter(l => l.fam.abrev === 'SD').length);
  });
  it('sin azimut no hay escena', () => { expect(escena3d({ ...ej(), azimut: null }, {})).toBeNull(); });
});

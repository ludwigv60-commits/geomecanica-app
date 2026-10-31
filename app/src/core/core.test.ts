// Pruebas contra los 7 reportes reales de Rampa Norte y CME-616-SW (valores leídos de las fotos).
import { describe, expect, it } from 'vitest';
import { PARAMETROS, rmrBasico, rmrTotal, rmrDiseno, tipoRoca, puntajeRqd, type PuntajesZona } from './rmr';
import { rqdDesdeJv, jv } from './rqd';
import { valorQ, redondear, controlRmrQ, claseQ } from './q';
import { ajusteSugerido, anguloRumboEje } from './orientacion';
import { proponer, filaInterseccion, seccionInterseccion, cmAPulg, mAPies, tresbolillo } from './sostenimiento';

const zona = (v: number[]): PuntajesZona => Object.fromEntries(PARAMETROS.map((p, i) => [p.id, v[i]]));

interface Rep { id: string; p: number[]; ajuste: number; basico: number; total: number; tipo: string;
  jv: number; rqd: number; q: [number, number, number, number, number]; qForm: number | null; qCalc: number; az?: number;
  fam?: { dip: number; dipdir: number }[] }

const REPORTES: Rep[] = [
  { id: '238', p: [7, 8, 8, 2, 4, 3, 1, 3, 15], ajuste: -5, basico: 51, total: 46, tipo: 'III-B', jv: 25, rqd: 32.5, q: [12, 3, 3, 1, 2.5], qForm: 1.08, qCalc: 1.08,
    az: 330, fam: [{ dip: 85, dipdir: 310 }, { dip: 15, dipdir: 300 }, { dip: 80, dipdir: 210 }, { dip: 65, dipdir: 270 }] },
  { id: '240', p: [7, 3, 8, 2, 4, 3, 1, 3, 15], ajuste: -5, basico: 46, total: 41, tipo: 'IV', jv: 28, rqd: 22.6, q: [15, 3, 2, 1, 2.5], qForm: null, qCalc: 0.9,
    az: 330, fam: [{ dip: 80, dipdir: 70 }, { dip: 80, dipdir: 70 }, { dip: 15, dipdir: 190 }, { dip: 35, dipdir: 10 }, { dip: 45, dipdir: 270 }] },
  { id: '243', p: [7, 8, 8, 2, 4, 3, 1, 3, 15], ajuste: -5, basico: 51, total: 46, tipo: 'III-B', jv: 25, rqd: 32.5, q: [9, 3, 2, 1, 2.5], qForm: 2.17, qCalc: 2.17 },
  { id: '252', p: [12, 8, 10, 2, 4, 3, 2, 3, 15], ajuste: -5, basico: 59, total: 54, tipo: 'III-B', jv: 21, rqd: 45.7, q: [12, 3, 2, 1, 2.5], qForm: null, qCalc: 2.29 },
  { id: '259', p: [7, 8, 5, 2, 4, 3, 1, 1, 15], ajuste: -5, basico: 46, total: 41, tipo: 'IV', jv: 23, rqd: 39.1, q: [12, 3, 2, 1, 2.5], qForm: 1.96, qCalc: 1.96 },
  { id: '261', p: [7, 8, 5, 2, 4, 3, 1, 1, 15], ajuste: -5, basico: 46, total: 41, tipo: 'IV', jv: 23, rqd: 39.1, q: [12, 3, 2, 1, 2.5], qForm: 1.96, qCalc: 1.96 },
  // CME-616-SW: el formato dice Q = 3.26; el valor exacto es 3.2667, que redondea a 3.27.
  { id: 'CME-616-SW', p: [12, 8, 8, 2, 4, 3, 2, 3, 15], ajuste: -5, basico: 57, total: 52, tipo: 'III-B', jv: 20, rqd: 49, q: [9, 3, 2, 1, 2.5], qForm: 3.26, qCalc: 3.27 },
];

describe('Reportes reales', () => {
  for (const r of REPORTES) {
    it(`reporte ${r.id}`, () => {
      const z = zona(r.p);
      expect(rmrBasico(z)).toBe(r.basico);
      expect(rmrTotal(z, r.ajuste)).toBe(r.total);
      expect(tipoRoca(r.total)).toBe(r.tipo);
      expect(rqdDesdeJv(r.jv)).toBe(r.rqd);
      expect(puntajeRqd(r.rqd)).toBe(r.p[1]);
      const [jn, jr, ja, jw, srf] = r.q;
      const q = valorQ({ rqd: r.rqd, jn, jr, ja, jw, srf })!;
      expect(redondear(q)).toBe(r.qCalc);
      if (r.qForm != null) expect(Math.abs(redondear(q) - r.qForm)).toBeLessThanOrEqual(0.0100001);
      expect(controlRmrQ(r.total, q).alerta).toBeNull();
      const d = rmrDiseno({ HI: r.total, CORONA: r.total, HD: r.total })!;
      expect(d.rmr).toBe(r.total);
      expect(d.alerta).toBeNull();
    });
  }
});

describe('RMR de diseño', () => {
  it('tipos distintos → alerta y promedio', () => {
    const d = rmrDiseno({ HI: 41, CORONA: 46, HD: 58 })!;
    expect(d.rmr).toBe(48.3);
    expect(d.tipo).toBe('III-B');
    expect(d.alerta).toMatch(/promedio 48.3/);
  });
  it('incompleto → null', () => expect(rmrDiseno({ HI: 41, CORONA: null, HD: 41 })).toBeNull());
});

describe('Jv, RQD y Q', () => {
  it('Jv por espaciamientos', () => expect(jv([{ espaciamiento_m: 0.2 }, { espaciamiento_m: 0.25 }], 10)).toBeCloseTo(11));
  it('RQD = 100 si Jv < 4.5; tope 0', () => { expect(rqdDesdeJv(4)).toBe(100); expect(rqdDesdeJv(40)).toBe(0); });
  it('Palmström 2005', () => expect(rqdDesdeJv(20, 'palmstrom2005')).toBe(60));
  it('RQD < 10 usa 10', () => expect(valorQ({ rqd: 5, jn: 1, jr: 1, ja: 1, jw: 1, srf: 1 })).toBe(10));
  it('falta un parámetro → null', () => expect(valorQ({ rqd: 50, jn: 9 })).toBeNull());
  it('clase Q', () => expect(claseQ(1.96)).toBe('Mala'));
  it('control RMR–Q incoherente', () => expect(controlRmrQ(75, 0.5).alerta).not.toBeNull());
});

describe('Ajuste por orientación (sugerido)', () => {
  it('ángulo rumbo–eje', () => expect(anguloRumboEje(70, 330)).toBe(10));
  it('240: falla 80/070 casi paralela a la rampa 330 → muy desfavorable', () => {
    const a = ajusteSugerido(REPORTES[1]!.fam!, 330)!;
    expect(a.ajuste).toBe(-12);
  });
  it('perpendicular a favor del buzamiento, buz. fuerte → 0', () =>
    expect(ajusteSugerido([{ dip: 85, dipdir: 310 }], 330)!.ajuste).toBe(0));
  it('perpendicular contra el buzamiento, buz. 20–45 → −10', () =>
    expect(ajusteSugerido([{ dip: 30, dipdir: 150 }], 330)!.ajuste).toBe(-10));
  it('buz. < 20 → −5', () => expect(ajusteSugerido([{ dip: 15, dipdir: 0 }], 330)!.ajuste).toBe(-5));
});

describe('Sostenimiento', () => {
  it('unidades', () => {
    expect([cmAPulg(2.5), cmAPulg(5), cmAPulg(10)]).toEqual([1, 2, 4]);
    expect([mAPies(2.1), mAPies(3.0)]).toEqual([7, 10]);
  });
  it('III-B como en el reporte 238', () => {
    const p = proponer('III-B', 4.2);
    expect(p.lineas).toEqual([
      'Shotcrete 2" en sección completa.',
      'Shotcrete 1" en sacrificio a altura de gradiente.',
      "Pernos helicoidales de 7' E=1.50x1.50 Filas = 7x8.",
    ]);
    expect(p.casillas).toMatchObject({ st: 'III-B', perno: 'HELICOIDAL', longitud: '7 PIES', shotcrete: '5 cm', sacrificio: 'SHOTCRETE 1"' });
    expect(p.filas).toBe(3);
  });
  it('IV como en el reporte 259', () => {
    const p = proponer('IV', 4.0, { ordenFilas: 'mayorPrimero' });
    expect(p.lineas).toEqual([
      'Shotcrete 2" en sección completa.',
      'Shotcrete 1" en sacrificio a altura de gradiente.',
      "Pernos helicoidales de 7' E=1.20x1.20 Filas = 11x10.",
      'Shotcrete 4" sobre pernos.',
    ]);
    expect(p.casillas.shotcrete).toBe('15 cm');
    expect(p.filas).toBe(4);
  });
  it('tresbolillo', () => expect(tresbolillo(8)).toBe('7x8'));
  it('intersección del reporte 243 (RMR 46, cobertura ≤ 350 m)', () => {
    const r = filaInterseccion('Intersección tipo cruz', '<=350', 46);
    expect(r.seccion).toBe('ST-II');
    expect(r.fila).toMatchObject({ shotcreteCm: 25, malla: false, pernos: { esp: [1.5, 2.0], longitudM: 3 }, cables: { esp: [2.5, 2.5], longitudM: 7 }, avanceMax: 3.4 });
  });
  it('intersección con RMR < 45 → sin fila y alerta', () => {
    const s = seccionInterseccion(41);
    expect(s.seccion).toBeNull();
    expect(s.alerta).toMatch(/no tiene fila/);
  });
});

import { siguienteCorrelativo } from '../model';
test('siguiente correlativo', () => {
  expect(siguienteCorrelativo([{ correlativo: '259' }, { correlativo: '261' }, { correlativo: 'x' }])).toBe('262');
  expect(siguienteCorrelativo([{ correlativo: '009' }])).toBe('010');
  expect(siguienteCorrelativo([])).toBe('');
});

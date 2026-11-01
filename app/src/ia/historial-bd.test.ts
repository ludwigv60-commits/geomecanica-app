import { describe, expect, it } from 'vitest';
import { claveLabor, desdeFilas } from './historial-bd';
import { proponer } from './sugerencias';
import { nuevoReporte } from '../model';

const CAB = ['Item', 'Fecha', 'Labor', 'Turno', 'Litologia', 'Progresiva - Desde', 'Progresiva - Hasta', 'Resistencia a la compresión uniaxial (MPa)', 'RQD', 'Espaciamiento de discontinuidades (m)', 'Persistencia', 'Abertura', 'Rugosidad', 'Relleno', 'Alteración', 'Agua subterránea', 'Orientación', 'Número de discontinuidades (Jn)', 'Número de rugosidad (Jr)', 'Número de alteración (Ja)', 'Número de agua subterránea (Jw)', 'Factor de reducción de esfuerzos (SRF)', 'Buzamiento (Familia 1)', '/D. Buz (Familia 1)', 'Descripcion (Familia 1)'];
const fila = (i: number, fecha: string, ucs: number) => [String(i), fecha, 'RP Norte', 'Noche', 'Andesita', '10', '12', String(ucs), '8', '8', '2', '4', '3', '2', '3', '15', '-5', '12', '3', '2', '1', '2.5', '75', '45', 'Diaclasa'];

describe('historial importado de la BD', () => {
  it('normaliza los nombres de labor', () => {
    expect(claveLabor('Rampa Norte')).toBe(claveLabor('RP NORTE'));
    expect(claveLabor('Rp_Norte')).toBe('rpnorte');
  });
  it('convierte filas a reportes y la IA propone la moda de los últimos de la labor', () => {
    const rs = desdeFilas([CAB, fila(1, '45930', 7), fila(2, '2025-10-30', 12), fila(3, '2025-10-31', 12)]);
    expect(rs).toHaveLength(3);
    expect(rs[0]!.fecha).toBe('2025-09-30');
    expect(rs[1]!.rmr.CORONA).toMatchObject({ ucs: 12, rqd: 8, agua: 15 });
    expect(rs[1]!.q.HI).toMatchObject({ jn: 12, srf: 2.5 });
    expect(rs[1]!.familias).toEqual([{ abrev: 'SD', dip: 75, dipdir: 45 }]);
    const r = { ...nuevoReporte(), labor: 'Rampa Norte', fecha: '2025-11-01' };
    const p = proponer(r, rs, null);
    expect(p.find(x => x.clave === 'rmr.ucs')?.valor).toBe(12);
    expect(p.find(x => x.clave === 'familias')).toBeTruthy();
  });
});

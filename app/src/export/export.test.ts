// Genera el reporte 259 en Excel y PDF y revisa el contenido.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { nuevoReporte, type Reporte } from '../model';
import { proponer } from '../core/sostenimiento';
import { generarXlsx } from './xlsx';
import { generarPdf } from './pdf';
import { deducirCasillas } from './datos';

export function reporte259(): Reporte {
  const r = nuevoReporte();
  const pz = { ucs: 7, rqd: 8, espaciamiento: 5, persistencia: 2, abertura: 4, rugosidad: 3, relleno: 1, alteracion: 1, agua: 15 };
  const q = { jn: 12, jr: 3, ja: 2, jw: 1, srf: 2.5 };
  return {
    ...r, labor: 'Rampa Norte', supervisor: 'Kliutsmann Julca Miranda', fecha: '2026-10-23', turno: 'Noche',
    desde: '0+924.7', hasta: '0+928.7', avance: 4.0, ancho: 5.45, alto: 5.8, azimut: 330, nivelRiesgo: 'Alto', correlativo: '259',
    rmr: { HI: pz, CORONA: pz, HD: pz }, ajuste: { HI: -5, CORONA: -5, HD: -5 }, jv: 23,
    litologia: { HI: 'Piroclasto', CORONA: 'Piroclasto', HD: 'Piroclasto' },
    familias: [{ abrev: 'SD', dip: 50, dipdir: 170 }, { abrev: 'SD', dip: 85, dipdir: 230 }, { abrev: 'SD', dip: 60, dipdir: 280 }, { abrev: 'SD', dip: 45, dipdir: 40 }],
    q: { HI: q, CORONA: q, HD: q },
    condicion: 'Macizo rocoso muy fracturado con relleno blando, resistencia de regular a baja, alterado.',
    verificacion: { SHOTCRETE: 'CUMPLE', PERNO: 'CUMPLE', MALLA: 'NO APLICA', 'MARCO RETICULADO': 'NO APLICA', SACRIFICIO: 'NO APLICA' },
    sostenimiento: proponer('IV', 4.0, { ordenFilas: 'mayorPrimero' }).lineas, ordenFilas: 'mayorPrimero',
    adicionales: [{ fecha: '2026-10-29', hora: '', nombre: 'Wilson Castillo', indicacion: 'Los mayores sobreanchos son por condiciones operativas; se considera el 4% de sobreancho EETT.' }],
    firmas: [
      { rol: 'GEOMECÁNICA AESA', nombre: 'Kliutsmann Julca', fecha: '2026-10-23' }, { rol: 'OPERACIONES AESA', nombre: '', fecha: '' },
      { rol: 'SUPERVISIÓN SYSTRA', nombre: 'Wilson Castillo', fecha: '2026-10-23' }, { rol: 'SUPERVISIÓN MARCOBRE', nombre: '', fecha: '' }],
  };
}

describe('Exportación', () => {
  it('casillas deducidas del texto de sostenimiento', () => {
    expect(deducirCasillas(reporte259().sostenimiento)).toEqual({ perno: 'HELICOIDAL', pies: 7, shotcreteCm: 15, sacrificio: '1', malla: false });
  });
  it('Excel con los valores del 259', async () => {
    const out = await generarXlsx(reporte259(), readFileSync('public/plantilla/formato.xlsx'));
    mkdirSync('/tmp/claude-0/exp', { recursive: true }); writeFileSync('/tmp/claude-0/exp/259.xlsx', out);
    const xml = await (await JSZip.loadAsync(out)).file('xl/worksheets/sheet1.xml')!.async('string');
    const cel = (ref: string) => xml.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`))?.[1] ?? '';
    expect(cel('F7')).toContain('Rampa Norte');
    expect(cel('S20')).toContain('<v>46</v>');
    expect(cel('S20')).toContain('<f');
    expect(cel('U22')).toContain('<v>41</v>');
    expect(cel('W29')).toContain('<v>1.96</v>');
    expect(cel('D28')).toContain('<v>39.1</v>');
    expect(cel('M31')).toContain('✔ CUMPLE');
    expect(cel('A60')).toContain('✔ ST - IV');
    expect(cel('I59')).toContain('✔ 15 cm');
    expect(cel('N57')).toContain('Filas = 11x10');
  });
  it('PDF de una página', async () => {
    const out = await generarPdf(reporte259(), readFileSync('public/plantilla/formato.pdf'));
    writeFileSync('/tmp/claude-0/exp/259.pdf', out);
    expect(out.byteLength).toBeGreaterThan(10000);
  });
});

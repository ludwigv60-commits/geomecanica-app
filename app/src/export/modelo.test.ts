import { describe, expect, it } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { nuevoReporte, type Reporte } from '../model';
import { codigoSLT, datosModelo } from './modelo';
import { generarModeloPdf } from './modeloPdf';
import { generarModeloXlsx, logosDePlantilla } from './modeloXlsx';
import JSZip from 'jszip';

function ejemplo(): Reporte {
  const r = nuevoReporte();
  Object.assign(r, { labor: 'Rampa Norte', rampa: 'Norte', correlativo: '236', desde: '0+943.6', hasta: '0+947.3', avance: 3.7, ancho: 5, alto: 5, azimut: 330, supervisor: 'Supervisor de prueba', jv: 12 });
  const p = { ucs: 7, rqd: 8, espaciamiento: 8, persistencia: 2, abertura: 4, rugosidad: 3, relleno: 1, alteracion: 3, agua: 15 };
  r.rmr = { HI: { ...p }, CORONA: { ...p }, HD: { ...p } }; r.ajuste = { HI: -5, CORONA: -5, HD: -5 };
  const q = { jn: 12, jr: 3, ja: 2, jw: 1, srf: 2.5 }; r.q = { HI: { ...q }, CORONA: { ...q }, HD: { ...q } };
  r.familias = [{ abrev: 'SD', dip: 50, dipdir: 60, espaciamiento: 0.3 }, { abrev: 'SD', dip: 85, dipdir: 290 }, { abrev: 'SD', dip: 45, dipdir: 250 }, { abrev: 'F', dip: 70, dipdir: 120, potencia: 0.2 }];
  r.sostenimiento = ['Shotcrete 2" + perno helicoidal de 7\' a 1.5 x 1.5 m'];
  return r;
}
const T = { Norte: { base: 100, pkInicio: 20, angulo: 6.84 } };

describe('reporte modelo', () => {
  it('arma los datos de la ficha VG', () => {
    const d = datosModelo(ejemplo(), { coberturas: T });
    expect(d.cobertura?.pk).toBeCloseTo(945.45);
    expect(d.estructuras.map(e => e.codigo)).toEqual(['D1', 'D2', 'D3', 'F1']);
    expect(d.estructuras[0]!.slt).toBe('S3-L3-T3-R3-F4-A3-W1');
    expect(d.zonas[1]!.qPrima).toBeCloseTo(Math.round((Math.max(10, d.rqd!) / 12) * 1.5 * 100) / 100);
    expect(d.zonas[1]!.gsi).toBe(Math.round(9 * Math.log(d.zonas[1]!.qPrima!) + 44));
  });
  it('código sin datos', () => expect(codigoSLT({ abrev: 'SD', dip: 1, dipdir: 1 }, {})).toBe('S--L--T--R--F--A--W-'));
  it('genera el PDF en A4', async () => {
    const r = ejemplo();
    const foto = process.env.FOTO_PRUEBA; if (foto && existsSync(foto)) r.fotos = [{ id: 'f', zona: 'FRENTE', fecha: '', data: 'data:image/jpeg;base64,' + readFileSync(foto).toString('base64') }];
    const logos = await logosDePlantilla(readFileSync('public/plantilla/formato.xlsx'));
    expect(logos.logoAesa?.length).toBeGreaterThan(1000); expect(logos.logoMarcobre?.length).toBeGreaterThan(1000);
    const pdf = await generarModeloPdf(r, { coberturas: T }, logos);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    for (const p of doc.getPages()) { expect(Math.round(p.getWidth())).toBe(595); expect(Math.round(p.getHeight())).toBe(842); }
    if (process.env.SALIDA_MODELO) writeFileSync(process.env.SALIDA_MODELO, pdf);
  });
  it('genera el Excel en A4', async () => {
    const x = await generarModeloXlsx(ejemplo(), { coberturas: T }, await logosDePlantilla(readFileSync('public/plantilla/formato.xlsx')));
    const z = await JSZip.loadAsync(x);
    const hoja = await z.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(hoja).toContain('paperSize="9"'); expect(hoja).toContain('fitToHeight="1"'); expect(hoja).toContain('S3-L3-T3-R3-F4-A3-W1');
    if (process.env.SALIDA_MODELO) writeFileSync(process.env.SALIDA_MODELO.replace('.pdf', '.xlsx'), x);
  });
});

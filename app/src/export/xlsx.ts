// Llena la plantilla oficial .xlsx tocando solo las celdas necesarias (logos, bordes y fórmulas quedan intactos).
import JSZip from 'jszip';
import type { Reporte } from '../model';
import { casillas } from './datos';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function reemplazarCelda(xml: string, ref: string, f: (attrs: string, interior: string) => string): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = xml.match(re);
  if (!m) throw new Error(`La plantilla no tiene la celda ${ref}`);
  return xml.replace(re, f(m[1] ?? '', m[2] ?? ''));
}
const estilo = (attrs: string) => (attrs.match(/\ss="\d+"/)?.[0] ?? '');

function texto(xml: string, ref: string, v: string): string {
  return reemplazarCelda(xml, ref, a => `<c r="${ref}"${estilo(a)} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
}
function numero(xml: string, ref: string, v: number): string {
  return reemplazarCelda(xml, ref, a => `<c r="${ref}"${estilo(a)}><v>${v}</v></c>`);
}
function valorDeFormula(xml: string, ref: string, v: number | string): string {
  return reemplazarCelda(xml, ref, (a, interior) => {
    const f = interior.match(/<f[\s\S]*?<\/f>/)?.[0] ?? '';
    return typeof v === 'number'
      ? `<c r="${ref}"${estilo(a)}>${f}<v>${v}</v></c>`
      : `<c r="${ref}"${estilo(a)} t="str">${f}<v>${esc(v)}</v></c>`;
  });
}

export async function generarXlsx(r: Reporte, plantilla: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(plantilla);
  const ruta = 'xl/worksheets/sheet1.xml';
  let xml = await zip.file(ruta)!.async('string');
  const { casillas: cs, marcas } = casillas(r);
  for (const c of cs) {
    if (c.celda === 'K9') { xml = texto(xml, 'K9', String(c.valor)); continue; } // avance medido por topografía, no la fórmula Hasta − Desde
    if (c.formula) xml = valorDeFormula(xml, c.celda, c.valor);
    else if (typeof c.valor === 'number') xml = numero(xml, c.celda, c.valor);
    else xml = texto(xml, c.celda, c.valor);
  }
  for (const m of marcas) xml = texto(xml, m.celda, `✔ ${m.texto}`);
  zip.file(ruta, xml);
  // Que Excel recalcule al abrir (por si el ingeniero cambia algo en la PC).
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  wb = wb.replace(/<calcPr([^>]*?)\/>/, (_s, a: string) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
  zip.file('xl/workbook.xml', wb);
  zip.remove('xl/calcChain.xml');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

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

/** Agrega una imagen PNG sobre un rango de celdas (col/fila desde 0, fin exclusivo) en el dibujo de la hoja 1. */
async function agregarImagen(zip: JSZip, png: Uint8Array, nombre: string, [c0, r0, c1, r1]: [number, number, number, number], id: number) {
  const media = `xl/media/${nombre}.png`; zip.file(media, png);
  const relsRuta = 'xl/drawings/_rels/drawing1.xml.rels';
  let rels = await zip.file(relsRuta)!.async('string');
  const rid = `rIdV${id}`;
  rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${nombre}.png"/></Relationships>`);
  zip.file(relsRuta, rels);
  const dRuta = 'xl/drawings/drawing1.xml';
  let d = await zip.file(dRuta)!.async('string');
  const pos = (c: number, r: number) => `<xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  const ancla = `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${pos(c0, r0)}</xdr:from><xdr:to>${pos(c1, r1)}</xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${100 + id}" name="${nombre}" descr="${nombre}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  d = d.replace(/<\/xdr:wsDr>\s*$/, `${ancla}</xdr:wsDr>`);
  zip.file(dRuta, d);
}

export async function generarXlsx(r: Reporte, plantilla: ArrayBuffer | Uint8Array, vistas: { planta?: Uint8Array; seccion?: Uint8Array } = {}): Promise<Uint8Array> {
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
  // Vistas planta (A37:L55) y sección (M37:X55), las mismas del PDF.
  if (vistas.planta) await agregarImagen(zip, vistas.planta, 'vista_planta', [0, 36, 12, 55], 1);
  if (vistas.seccion) await agregarImagen(zip, vistas.seccion, 'vista_seccion', [12, 36, 24, 55], 2);
  // Que Excel recalcule al abrir (por si el ingeniero cambia algo en la PC).
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  wb = wb.replace(/<calcPr([^>]*?)\/>/, (_s, a: string) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
  zip.file('xl/workbook.xml', wb);
  zip.remove('xl/calcChain.xml');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

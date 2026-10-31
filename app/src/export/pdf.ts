// Llena el PDF del formato oficial en blanco escribiendo en las posiciones exactas de cada celda.
// Las posiciones (mapa-celdas.json) se midieron sobre el mismo PDF que genera la plantilla Excel.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Reporte } from '../model';
import { casillas } from './datos';
import MAPA from './mapa-celdas.json';

const TINTA = rgb(0.05, 0.2, 0.62); // azul lapicero, como en los reportes llenados a mano
const celdas = MAPA.celdas as unknown as Record<string, [number, number, number, number]>;

/** Quita lo que la fuente estándar (WinAnsi) no puede dibujar. */
const limpiar = (s: string) => s.replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[−–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF•\n]/g, '');

function partirLineas(t: string, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of t.split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) <= ancho || !linea) linea = prueba;
      else { out.push(linea); linea = palabra; }
    }
    out.push(linea);
  }
  return out;
}

function escribir(page: PDFPage, font: PDFFont, rect: [number, number, number, number], valor: string, multilinea: boolean, alinear: 'centro' | 'izq') {
  const [x0, y0, x1, y1] = rect;
  const ancho = x1 - x0, alto = y1 - y0;
  const t = limpiar(valor);
  if (multilinea) {
    for (let size = 8; size >= 4.5; size -= 0.5) {
      const lineas = partirLineas(t, font, size, ancho);
      const lh = size * 1.18;
      if (lineas.length * lh <= alto + 2 || size <= 4.5) {
        lineas.forEach((l, i) => page.drawText(l, { x: x0, y: y1 - size - i * lh + 1, size, font, color: TINTA }));
        return;
      }
    }
  }
  let size = Math.min(8.5, alto + 2.5);
  while (size > 4 && font.widthOfTextAtSize(t, size) > ancho + 1) size -= 0.25;
  const w = font.widthOfTextAtSize(t, size);
  const x = alinear === 'centro' ? x0 + (ancho - w) / 2 : x0;
  page.drawText(t, { x, y: y0 + (alto - size * 0.7) / 2, size, font, color: TINTA });
}

export async function generarPdf(r: Reporte, plantilla: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(plantilla);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { casillas: cs, marcas } = casillas(r);
  const izquierda = new Set(['labor', 'supervisor', 'condicion', 'observaciones', 'indicaciones', 'otroLong']);
  for (const c of cs) {
    const rect = celdas[c.clave];
    if (!rect) continue;
    const izq = izquierda.has(c.clave) || c.clave.startsWith('firma') || c.clave.endsWith('_indicacion');
    const valor = typeof c.valor === 'number' ? String(c.valor) : c.valor;
    if (c.clave.startsWith('firmaNombre') || c.clave.startsWith('firmaFecha')) {
      // La celda ya dice "Nombre:" / "Fecha:"; se escribe solo el dato a continuación.
      const dato = valor.replace(/^(Nombre|Fecha):\s*/, '');
      const [x0, y0, x1, y1] = rect;
      escribir(page, font, [x0 + 30, y0, x1, y1], dato, false, 'izq');
    } else if (c.clave === 'otroLong') {
      const [x0, y0, x1, y1] = rect;
      escribir(page, font, [x0 + 18, y0, x1, y1], valor.replace(/^OTRO:\s*/, ''), false, 'izq');
    } else escribir(page, font, rect, valor, !!c.multilinea, izq ? 'izq' : 'centro');
  }
  for (const m of marcas) {
    const rect = celdas[m.clave];
    if (!rect) continue;
    const [x0, y0, x1, y1] = rect;
    page.drawEllipse({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, xScale: Math.max(6, (x1 - x0) / 2 - 1.5), yScale: Math.max(3.2, (y1 - y0) / 2 + 0.6), borderColor: TINTA, borderWidth: 0.9 });
  }
  doc.setTitle(`Indicación Geomecánica ${r.labor} ${r.desde}`);
  doc.setProducer('App Geomecánica (PRT-JS-CLD-16)');
  return doc.save();
}

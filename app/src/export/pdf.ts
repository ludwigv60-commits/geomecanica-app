// Llena el PDF del formato oficial en blanco escribiendo en las posiciones exactas de cada celda.
// Las posiciones (mapa-celdas.json) se midieron sobre el mismo PDF que genera la plantilla Excel.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Reporte } from '../model';
import { casillas } from './datos';
import MAPA from './mapa-celdas.json';
import { colorFamilia, rotulos, textoFamilia } from '../ia/anotacion';

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
    for (let size = 7; size >= 4.5; size -= 0.5) { // proporcional al texto impreso del formato
      const lineas = partirLineas(t, font, size, ancho);
      const lh = size * 1.18;
      if (lineas.length * lh <= alto + 2 || size <= 4.5) {
        lineas.forEach((l, i) => page.drawText(l, { x: x0, y: y1 - size - i * lh + 1, size, font, color: TINTA }));
        return;
      }
    }
  }
  // Tamaño proporcional a la casilla: ~65 % de su alto, entre 5 y 7.5 pt (el impreso usa 6–7 pt).
  let size = Math.max(5, Math.min(7, alto * 0.62));
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
  await anexoFotos(doc, font, r);
  doc.setTitle(`Indicación Geomecánica ${r.labor} ${r.desde}`);
  doc.setProducer('App Geomecánica (PRT-JS-CLD-16)');
  return doc.save();
}

const NOMBRE_ZONA_FOTO: Record<string, string> = { FRENTE: 'Frente', HI: 'Hastial izquierdo', CORONA: 'Corona', HD: 'Hastial derecho' };
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Anexo: fotos por zona con sus trazas, azimut e inclinación de la cámara (Módulo 18). */
async function anexoFotos(doc: PDFDocument, font: PDFFont, r: Reporte) {
  const fotos = (r.fotos ?? []).slice(0, 12);
  if (!fotos.length) return;
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89], m = 36, altoCaja = (H - 2 * m - 30) / 2;
  let page: PDFPage | null = null, slot = 0;
  for (const f of fotos) {
    if (!page || slot === 2) {
      page = doc.addPage([W, H]); slot = 0;
      page.drawText(limpiar(`Anexo: fotos de campo · ${r.labor} ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''} · ${r.fecha}`), { x: m, y: H - m, size: 10, font: negrita });
    }
    const bytes = Uint8Array.from(atob(f.data.split(',')[1] ?? ''), ch => ch.charCodeAt(0));
    const im = f.data.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const k = Math.min((W - 2 * m) / im.width, (altoCaja - 24) / im.height);
    const w = im.width * k, h = im.height * k;
    const top = H - m - 20 - slot * altoCaja;
    const x = m + (W - 2 * m - w) / 2, y = top - 16 - h;
    page.drawText(limpiar(`${NOMBRE_ZONA_FOTO[f.zona] ?? f.zona}${f.az != null ? ` · cámara azimut ${f.az}° UTM, inclinación ${f.plunge ?? '-'}°` : ''}${f.calidad && !f.calidad.apta ? ' · FOTO NO APTA' : ''}`), { x: m, y: top - 10, size: 8.5, font });
    page.drawImage(im, { x, y, width: w, height: h });
    if (f.trazas) {
      const kt = w / f.trazas.w;
      const P = (px: number, py: number) => ({ x: x + px * kt, y: y + h - py * kt });
      for (const sgm of f.trazas.segmentos) {
        const color = hex(colorFamilia(r.familias, sgm.familia));
        const pts = sgm.pts ?? [[sgm.x1, sgm.y1], [sgm.x2, sgm.y2]];
        for (let i = 1; i < pts.length; i++) page.drawLine({ start: P(pts[i - 1]![0], pts[i - 1]![1]), end: P(pts[i]![0], pts[i]![1]), thickness: 1.8, color });
      }
      for (const ro of rotulos(f.trazas.segmentos)) {
        const t = limpiar(textoFamilia(r.familias, ro.familia)); const size = 7.5;
        const tw = negrita.widthOfTextAtSize(t, size); const c = P(ro.x, ro.y);
        const a = -ro.ang * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        const ox = -tw / 2 - 3, oy = -size / 2 - 2; // esquina inferior izquierda de la caja, girada
        page.drawRectangle({ x: c.x + ox * cos - oy * sin, y: c.y + ox * sin + oy * cos, width: tw + 6, height: size + 4, color: rgb(1, 1, 1), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.4, rotate: degrees(-ro.ang) });
        const tx = -tw / 2, ty = -size * 0.35;
        page.drawText(t, { x: c.x + tx * cos - ty * sin, y: c.y + tx * sin + ty * cos, size, font: negrita, color: rgb(0, 0, 0), rotate: degrees(-ro.ang) });
      }
    }
    slot++;
  }
}

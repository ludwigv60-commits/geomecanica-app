// Dibuja en una página PDF la misma hoja que se exporta a Excel (Libro): mismas celdas, colores, textos e
// imágenes, escalada para entrar en la hoja A4. Así el PDF y el Excel del reporte modelo son idénticos.
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Libro } from './xlsxSimple';
import { hex, limpiar, partirLineas } from './pdf';

export interface Geometria { k: number; x: number[]; y: number[]; ox: number; oy: number }

/** Posición de cada columna y fila en la página (puntos, y hacia abajo). */
export function geometria(L: Libro, page: PDFPage, margen = 14): Geometria {
  const nC = L.anchos.length, nF = L.filas;
  const x = [0], y = [0];
  for (let c = 0; c < nC; c++) x.push(x[c]! + L.anchoDe(c));
  for (let f = 0; f < nF; f++) y.push(y[f]! + L.altoDe(f));
  const W = page.getWidth() - 2 * margen, H = page.getHeight() - 2 * margen;
  const k = Math.min(W / x[nC]!, H / y[nF]!);
  return { k, x: x.map(v => v * k), y: y.map(v => v * k), ox: margen + (W - x[nC]! * k) / 2, oy: margen };
}

export async function libroAPagina(L: Libro, doc: PDFDocument, page: PDFPage, f: PDFFont, fb: PDFFont, fi: PDFFont, margen = 14) {
  const g = geometria(L, page, margen), PH = page.getHeight();
  const cubiertas = new Set<string>(), rango = new Map<string, [number, number, number, number]>();
  for (const [f0, c0, f1, c1] of L.rangos) {
    rango.set(`${f0},${c0}`, [f0, c0, f1, c1]);
    for (let i = f0; i <= f1; i++) for (let j = c0; j <= c1; j++) if (i !== f0 || j !== c0) cubiertas.add(`${i},${j}`);
  }
  const rect = (f0: number, c0: number, f1: number, c1: number): [number, number, number, number] => [g.ox + g.x[c0]!, g.oy + g.y[f0]!, g.ox + g.x[c1 + 1]!, g.oy + g.y[f1 + 1]!];
  const bordes: [number, number, number, number][] = [];
  for (const [fila, cols] of L.celdas) for (const [c, { v, s }] of cols) {
    if (cubiertas.has(`${fila},${c}`)) continue;
    const e = L.estilos[s] ?? {}, [f0, c0, f1, c1] = rango.get(`${fila},${c}`) ?? [fila, c, fila, c];
    const [x0, y0, x1, y1] = rect(f0, c0, f1, c1);
    if (e.fondo) page.drawRectangle({ x: x0, y: PH - y1, width: x1 - x0, height: y1 - y0, color: hex(e.fondo) });
    if (e.borde !== false) bordes.push([x0, y0, x1, y1]);
    const t = limpiar(String(v ?? '')); if (!t) continue;
    const font = e.b ? fb : e.i ? fi : f, color = hex(e.color ?? '#000000'), pad = 1.6 * g.k, ancho = x1 - x0 - 2 * pad, alto = y1 - y0;
    let size = (e.tam ?? 9) * g.k * 0.96;
    if (e.ajustar || t.includes('\n')) {
      let lineas = partirLineas(t, font, size, ancho);
      while (size > 3.4 && lineas.length * size * 1.18 > alto - pad) { size -= 0.2; lineas = partirLineas(t, font, size, ancho); }
      const lh = size * 1.18, total = lineas.length * lh;
      let yy = e.arriba ? y0 + pad + size * 0.85 : y0 + (alto - total) / 2 + size * 0.85;
      for (const l of lineas) {
        const w = font.widthOfTextAtSize(l, size), xx = e.izq ? x0 + pad : e.der ? x1 - pad - w : x0 + (x1 - x0 - w) / 2;
        page.drawText(l, { x: xx, y: PH - yy, size, font, color }); yy += lh;
      }
    } else {
      while (size > 3.4 && font.widthOfTextAtSize(t, size) > ancho) size -= 0.15;
      const w = font.widthOfTextAtSize(t, size), xx = e.izq ? x0 + pad : e.der ? x1 - pad - w : x0 + (x1 - x0 - w) / 2;
      const yy = e.arriba ? y0 + pad + size * 0.85 : y0 + alto / 2 + size * 0.34;
      page.drawText(t, { x: xx, y: PH - yy, size, font, color });
    }
  }
  for (const im of L.imagenes) {
    const caja = rect(im.r0, im.c0, im.r1 - 1, im.c1 - 1);
    if (im.pdf) { await im.pdf(caja); continue; }
    if (!im.datos) continue;
    const img = im.ext === 'png' ? await doc.embedPng(im.datos) : await doc.embedJpg(im.datos);
    const [x0, y0, x1, y1] = caja, kk = Math.min((x1 - x0 - 2) / img.width, (y1 - y0 - 2) / img.height);
    const w = img.width * kk, h = img.height * kk;
    page.drawImage(img, { x: x0 + (x1 - x0 - w) / 2, y: PH - y0 - (y1 - y0 + h) / 2, width: w, height: h });
  }
  for (const [x0, y0, x1, y1] of bordes) page.drawRectangle({ x: x0, y: PH - y1, width: x1 - x0, height: y1 - y0, borderColor: rgb(0.35, 0.38, 0.44), borderWidth: 0.45 * g.k });
  return g;
}

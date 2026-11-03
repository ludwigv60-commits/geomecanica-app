// PDF del REPORTE MODELO: la misma hoja A4 del Excel (modeloHoja), con planta, sección y foto en vectores.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Listas, Reporte } from '../model';
import { hojaModelo, type RecursosModelo } from './modeloHoja';
import { libroAPagina } from './libroPdf';
import { medidas } from './xlsxSimple';
import { dibujarFoto, dibujarVista, rmrDe } from './pdf';
import { vistaPlanta, vistaSeccion } from './croquis';
import { vistaCunas } from './cunas2d';

export const A4: [number, number] = [595.28, 841.89];

export async function generarModeloPdf(r: Reporte, listas?: Partial<Listas>, rec: RecursosModelo = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold), fi = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage(A4), rmr = rmrDe(r);
  const pl = vistaPlanta(r, rmr, true);
  const frente = (r.fotos ?? []).find(x => x.zona === 'FRENTE') ?? r.fotos?.[0];
  const caja = (c: [number, number, number, number], m = 1.5): [number, number, number, number] => [c[0] + m, c[1] + m, c[2] - m, c[3] - m];
  // forma de la foto (ancho/alto) para darle su espacio en la hoja
  let frenteAspecto: number | undefined;
  if (frente?.data.startsWith('data:')) try { const [w, h] = medidas(Uint8Array.from(atob(frente.data.split(',')[1] ?? ''), ch => ch.charCodeAt(0))); if (w && h) frenteAspecto = w / h; } catch { /* sin medida */ }
  const L = hojaModelo(r, listas, {
    logoAesa: rec.logoAesa, logoMarcobre: rec.logoMarcobre, frenteAspecto,
    pdf: {
      planta: pl ? c => dibujarVista(page, f, fb, pl, caja(c)) : undefined,
      seccion: r.ancho && r.alto && r.familias.some(x => x.dip != null && x.dipdir != null) ? c => {
        const [x0, y0, x1, y1] = caja(c), w = (x1 - x0) / 2, h = y1 - y0;
        const a = vistaCunas(r, rmr, 'antes', (w - 3) / h), d = vistaCunas(r, rmr, 'despues', (w - 3) / h);
        if (a && d) { dibujarVista(page, f, fb, a, [x0, y0, x0 + w - 1.5, y1]); dibujarVista(page, f, fb, d, [x0 + w + 1.5, y0, x1, y1]); }
        else dibujarVista(page, f, fb, vistaSeccion(r, rmr), [x0, y0, x1, y1]);
      } : undefined,
      frente: frente ? async c => { await dibujarFoto(doc, page, fb, r, frente, caja(c, 2), { grosor: 2.8, letra: 4.6 }).catch(() => false); } : undefined,
    },
  });
  await libroAPagina(L, doc, page, f, fb, fi);
  doc.setTitle(`Reporte modelo ${r.labor} ${r.desde}`);
  doc.setProducer('App Geomecánica (Reporte modelo)');
  return doc.save();
}

// Vistas planta y sección como imágenes PNG (para el Excel), dibujadas igual que en la app y el PDF.
import type { Reporte } from '../model';
import { calcular } from '../calc';
import { aSvg, vistaPlanta, vistaSeccion } from './croquis';

/** Recuadros del formato .xlsx (A37:L55 y M37:X55) medidos en píxeles de Excel. */
export const CAJA_PLANTA = { w: 565, h: 418 }, CAJA_SECCION = { w: 555, h: 418 };

export async function svgAPng(svg: string, w: number, h: number): Promise<Uint8Array> {
  const fijo = svg.replace('width="100%"', `width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([fijo], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const b = await new Promise<Blob>((ok, mal) => cv.toBlob(x => (x ? ok(x) : mal(new Error('sin imagen'))), 'image/png'));
    return new Uint8Array(await b.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

export async function vistasPng(r: Reporte): Promise<{ planta?: Uint8Array; seccion?: Uint8Array }> {
  const z = calcular(r).zonas, rmr = { HI: z.HI.total, CORONA: z.CORONA.total, HD: z.HD.total };
  const out: { planta?: Uint8Array; seccion?: Uint8Array } = {};
  const k = 2; // doble resolución para que se vea nítido al imprimir
  const pl = vistaPlanta(r, rmr, true);
  if (pl) out.planta = await svgAPng(aSvg(pl, CAJA_PLANTA.w * k, CAJA_PLANTA.h * k), CAJA_PLANTA.w * k, CAJA_PLANTA.h * k);
  if (r.ancho && r.alto && r.familias.some(f => f.dip != null && f.dipdir != null))
    out.seccion = await svgAPng(aSvg(vistaSeccion(r, rmr), CAJA_SECCION.w * k, CAJA_SECCION.h * k), CAJA_SECCION.w * k, CAJA_SECCION.h * k);
  return out;
}

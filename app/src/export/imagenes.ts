// Vistas planta y sección como imágenes PNG (para el Excel), dibujadas igual que en la app y el PDF.
import type { FotoZona, Reporte } from '../model';
import { colorFamilia, rotulos, textoFamilia } from '../ia/anotacion';
import { calcular } from '../calc';
import { vistaPlanta, vistaSeccion, type Vista } from './croquis';
import { graficoFS, vistaCunas } from './cunas2d';

/** Recuadros del formato .xlsx (A37:L55 y M37:X55) medidos en píxeles de Excel. */
export const CAJA_PLANTA = { w: 565, h: 418 }, CAJA_SECCION = { w: 555, h: 418 };

/** Dibuja una vista directamente en un canvas (mismo trazado que aSvg). No depende de que el
 *  navegador sepa convertir SVG a imagen, que en iPhone/Safari falla a veces sin avisar. */
export function dibujarCanvas(ctx: CanvasRenderingContext2D, v: Vista, ox0: number, oy0: number, W: number, Hh: number) {
  const [x0, y0, x1, y1] = v.caja, k = Math.min((W - 6) / (x1 - x0), (Hh - 6) / (y1 - y0));
  const ox = ox0 + (W - (x1 - x0) * k) / 2, oy = (Hh - (y1 - y0) * k) / 2;
  const X = (q: [number, number]): [number, number] => [ox + (q[0] - x0) * k, oy0 + Hh - oy - (q[1] - y0) * k];
  const s = W / 280;
  ctx.save(); ctx.beginPath(); ctx.rect(ox0, oy0, W, Hh); ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const p of v.prims) {
    if (p.t === 'poly') {
      if (p.pts.length < 2) continue;
      ctx.beginPath(); p.pts.forEach((q, i) => { const [x, y] = X(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (p.cerrado) ctx.closePath();
      if (p.relleno && p.relleno !== 'none') { ctx.globalAlpha = p.opac ?? 1; ctx.fillStyle = p.relleno; ctx.fill(); ctx.globalAlpha = 1; }
      if (p.borde && p.borde !== 'none') {
        ctx.strokeStyle = p.borde; ctx.lineWidth = (p.ancho ?? 1) * s; ctx.setLineDash(p.trazos ? p.trazos.map(n => n * s) : []); ctx.stroke(); ctx.setLineDash([]);
      }
    } else {
      const [x, y] = X(p.p);
      ctx.font = `${p.negrita ? '700 ' : ''}${((p.tam ?? 6) * s * 1.15).toFixed(1)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = p.ancla === 'centro' ? 'center' : p.ancla === 'der' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      if (p.fondo) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.strokeText(p.s, x, y); }
      ctx.fillStyle = p.color ?? '#000'; ctx.fillText(p.s, x, y);
    }
  }
  ctx.restore();
}

async function lienzoAPng(w: number, h: number, pinta: (ctx: CanvasRenderingContext2D) => void): Promise<Uint8Array> {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d'); if (!ctx) throw new Error('sin canvas');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); pinta(ctx);
  const b = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/png'));
  if (b) return new Uint8Array(await b.arrayBuffer());
  const bin = atob(cv.toDataURL('image/png').split(',')[1]!); // respaldo si toBlob no responde
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** `modelo`: vistas para la hoja única del reporte modelo (sección compacta, cajas de esa hoja). */
export async function vistasPng(r: Reporte, modelo = false): Promise<{ planta?: Uint8Array; seccion?: Uint8Array; fs?: Uint8Array; errores?: string[] }> {
  const z = calcular(r).zonas, rmr = { HI: z.HI.total, CORONA: z.CORONA.total, HD: z.HD.total };
  const out: { planta?: Uint8Array; seccion?: Uint8Array; fs?: Uint8Array; errores?: string[] } = {};
  const err = (q: string, e: unknown) => { (out.errores ??= []).push(`${q}: ${e instanceof Error ? e.message : String(e)}`); };
  const k = 2; // doble resolución para que se vea nítido al imprimir
  const [cP, cS] = modelo ? [{ w: 272, h: 165 }, { w: 346, h: 143 }] : [CAJA_PLANTA, CAJA_SECCION];
  const wP = cP.w * k, hP = cP.h * k, wS = cS.w * k, hS = cS.h * k;
  try {
    const pl = vistaPlanta(r, rmr, true);
    if (pl) out.planta = await lienzoAPng(wP, hP, ctx => dibujarCanvas(ctx, pl, 0, 0, wP, hP));
  } catch (e) { err('planta', e); }
  try {
    const a = vistaCunas(r, rmr, 'antes', (wS / 2) / hS, modelo), d = vistaCunas(r, rmr, 'despues', (wS / 2) / hS, modelo);
    if (a && d) out.seccion = await lienzoAPng(wS, hS, ctx => {   // antes | después del sostenimiento
      dibujarCanvas(ctx, a, 0, 0, wS / 2, hS); dibujarCanvas(ctx, d, wS / 2, 0, wS / 2, hS);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2 * k; ctx.beginPath(); ctx.moveTo(wS / 2, 0); ctx.lineTo(wS / 2, hS); ctx.stroke();
    });
    else if (r.ancho && r.alto && r.familias.some(f => f.dip != null && f.dipdir != null)) {
      const se = vistaSeccion(r, rmr);
      out.seccion = await lienzoAPng(wS, hS, ctx => dibujarCanvas(ctx, se, 0, 0, wS, hS));
    }
  } catch (e) { err('sección', e); }
  if (modelo) try {
    const wF = 247 * k, hF = 88 * k, g = graficoFS(r, wF / hF, true);
    if (g) out.fs = await lienzoAPng(wF, hF, ctx => dibujarCanvas(ctx, g, 0, 0, wF, hF));
  } catch (e) { err('FS', e); }
  return out;
}

/** Foto con sus trazas y rótulos como JPEG (para el Excel del reporte modelo). */
export async function fotoConTrazas(r: Reporte, f: FotoZona, maxLado = 1600): Promise<Uint8Array | null> {
  const img = await new Promise<HTMLImageElement | null>(ok => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = f.data; });
  if (!img) return null;
  const k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  if (f.trazas) {
    const kt = w / f.trazas.w, s = Math.max(1, w / 700);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const g of f.trazas.segmentos) {
      const pts = g.pts ?? [[g.x1, g.y1], [g.x2, g.y2]];
      ctx.strokeStyle = colorFamilia(r.familias, g.familia); ctx.lineWidth = 3 * s; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * kt, y * kt) : ctx.moveTo(x * kt, y * kt))); ctx.stroke();
    }
    ctx.font = `700 ${Math.round(13 * s)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const ro of rotulos(f.trazas.segmentos)) {
      const t = textoFamilia(r.familias, ro.familia), tw = ctx.measureText(t).width;
      ctx.save(); ctx.translate(ro.x * kt, ro.y * kt); ctx.rotate(ro.ang * Math.PI / 180);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.fillRect(-tw / 2 - 4 * s, -9 * s, tw + 8 * s, 18 * s); ctx.strokeRect(-tw / 2 - 4 * s, -9 * s, tw + 8 * s, 18 * s);
      ctx.fillStyle = '#000'; ctx.fillText(t, 0, 0); ctx.restore();
    }
  }
  const b = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  return b ? new Uint8Array(await b.arrayBuffer()) : null;
}

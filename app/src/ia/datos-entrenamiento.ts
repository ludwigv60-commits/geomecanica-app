// Paquete para entrenar la IA con fotos de Justa: cada foto con trazas revisadas por el ingeniero se guarda
// como foto (JPG) + máscara de trazas (PNG, blanco = traza) + datos (JSON: tipo, familia, dip/dd medidos).
// Con unas 50–100 fotos así se puede reentrenar el modelo para que aprenda el criterio del geomecánico.
import type { Reporte } from '../model';

const lienzo = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const aBytes = (cv: HTMLCanvasElement, tipo: string, q?: number) =>
  new Promise<Uint8Array>((res, rej) => cv.toBlob(b => (b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('toBlob'))), tipo, q));
const cargar = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Fotos del reporte que tienen trazas (dibujadas o revisadas). */
export const fotosConTrazas = (r: Reporte) => (r.fotos ?? []).filter(f => f.trazas?.segmentos.length && (!f.labor || f.labor.es === 'labor' || f.labor.confirmada));

export async function paqueteEntrenamiento(r: Reporte): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const base = [r.labor, r.fecha, r.correlativo].filter(Boolean).join('_').replace(/[^\w.+-]+/g, '_') || 'reporte';
  for (const [n, f] of fotosConTrazas(r).entries()) {
    const im = await cargar(f.data), t = f.trazas!;
    const W = im.width, H = im.height, kx = W / t.w, ky = H / t.h;
    const foto = lienzo(W, H); foto.getContext('2d')!.drawImage(im, 0, 0);
    const m = lienzo(W, H), c = m.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(2, Math.round(Math.max(W, H) / 400));
    for (const s of t.segmentos) {
      c.beginPath();
      const pts = s.pts && s.pts.length > 1 ? s.pts : [[s.x1, s.y1], [s.x2, s.y2]] as [number, number][];
      pts.forEach(([x, y], i) => (i ? c.lineTo(x * kx, y * ky) : c.moveTo(x * kx, y * ky)));
      c.stroke();
    }
    const nombre = `${base}_${f.zona}_${n + 1}`;
    zip.file(`${nombre}.jpg`, await aBytes(foto, 'image/jpeg', 0.92));
    zip.file(`${nombre}_trazas.png`, await aBytes(m, 'image/png'));
    zip.file(`${nombre}.json`, JSON.stringify({
      zona: f.zona, azimutFoto: f.az ?? null, inclinacionFoto: f.plunge ?? null, ia: t.ia ?? null,
      familias: r.familias.map((fa, i) => ({ id: i, tipo: fa.abrev, dip: fa.dip, dipdir: fa.dipdir })),
      segmentos: t.segmentos.map(s => ({ ...s, x1: s.x1 * kx, y1: s.y1 * ky, x2: s.x2 * kx, y2: s.y2 * ky, pts: s.pts?.map(([x, y]) => [x * kx, y * ky]) })),
    }, null, 1));
  }
  return zip.generateAsync({ type: 'uint8array' });
}

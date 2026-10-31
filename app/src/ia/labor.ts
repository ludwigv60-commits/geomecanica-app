// ¿Es una labor? Modelo de visión YOLO11n-cls (ImageNet, AGPL-3.0, Ultralytics) usado como extractor de
// rasgos (256 valores) y comparado con el "centro" de fotos reales de frentes de Justa. Aprende con el uso:
// cada foto que el ingeniero confirma como labor se suma al centro.
import ref from './modelos/labor_ref.json';
import { ort, sesion } from './onnx';
import { guardarConfig, leerConfig } from '../store';

export const UMBRAL = 0.9, DUDOSO = 0.86;
type Aprendido = { suma: number[]; n: number };
const CLAVE = 'labor-aprendido';

const norma = (v: number[]) => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };

/** Recorte central 224×224, valores 0–1, orden canal-alto-ancho (igual que en el entrenamiento). */
export function entrada(img: CanvasImageSource & { width: number; height: number }): Float32Array {
  const S = 224, k = S / Math.min(img.width, img.height);
  const w = Math.max(S, Math.round(img.width * k)), h = Math.max(S, Math.round(img.height * k));
  const cv = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, -Math.floor((w - S) / 2), -Math.floor((h - S) / 2), w, h);
  const d = ctx.getImageData(0, 0, S, S).data, out = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) { out[i] = d[i * 4]! / 255; out[S * S + i] = d[i * 4 + 1]! / 255; out[2 * S * S + i] = d[i * 4 + 2]! / 255; }
  return out;
}

export async function rasgos(img: CanvasImageSource & { width: number; height: number }): Promise<number[]> {
  const [o, s] = await Promise.all([ort(), sesion('labor.onnx')]);
  const r = await s.run({ img: new o.Tensor('float32', entrada(img), [1, 3, 224, 224]) });
  return norma(Array.from(r.emb!.data as Float32Array));
}

async function centro(): Promise<number[]> {
  const a = await leerConfig<Aprendido>(CLAVE).catch(() => undefined);
  const base = ref.centro.map(x => x * ref.n);
  return norma(a ? base.map((x, i) => x + (a.suma[i] ?? 0)) : base);
}

export type Veredicto = { es: 'labor' | 'dudoso' | 'no'; similitud: number; rasgos: number[] };
export async function esLabor(img: CanvasImageSource & { width: number; height: number }): Promise<Veredicto> {
  const [v, c] = await Promise.all([rasgos(img), centro()]);
  const s = v.reduce((a, x, i) => a + x * c[i]!, 0);
  return { es: s >= UMBRAL ? 'labor' : s >= DUDOSO ? 'dudoso' : 'no', similitud: Math.round(s * 1000) / 1000, rasgos: v };
}

/** El ingeniero confirmó que es una labor: se agrega a lo aprendido. */
export async function aprender(r: number[]) {
  const a = (await leerConfig<Aprendido>(CLAVE).catch(() => undefined)) ?? { suma: r.map(() => 0), n: 0 };
  await guardarConfig(CLAVE, { suma: a.suma.map((x, i) => x + r[i]!), n: a.n + 1 });
}

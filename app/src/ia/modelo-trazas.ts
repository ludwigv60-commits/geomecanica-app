// Trazas con red neuronal entrenada (TrazasNet: U-Net con MobileNetV3, ~1 M parámetros, 4 MB).
// Entrenada con GeoCrack (CC0, Harvard Dataverse doi:10.7910/DVN/E4OXHQ): 12 mil recortes de afloramientos
// reales con las trazas marcadas por geólogos. La red da, para cada píxel, la probabilidad de ser traza;
// luego: rectas largas (Hough ponderado con orientación local, ver lineas.ts) → familias. Con el modelo
// privado entrenado con las fotos del usuario y guiado por los ángulos del mapeo anterior de la labor.
// Corre en el celular sin señal (onnxruntime-web). Todo es PROPUESTA: el ingeniero valida.
import { agrupar, estadisticas, segmentoDe, type ResultadoTrazas } from './trazas';
import { lineasPrincipales } from './lineas';

export interface Mapa { w: number; h: number; p: Float32Array } // probabilidad 0..1 por píxel
export interface ResultadoRed extends ResultadoTrazas { confianza: number; nivel: 'alta' | 'media' | 'baja'; mapa: Mapa }

/** Lado mayor con que se analiza la foto (múltiplo de 16). */
export const LADO = 640;
/** La red de trazas se entrenó con fotos de 384 px de lado mayor: se analiza a ese tamaño. */
export const LADO_RED = 384;

/** Adelgaza una máscara binaria a líneas de 1 píxel (Zhang-Suen). Modifica y devuelve `m`. */
export function esqueleto(m: Uint8Array, w: number, h: number): Uint8Array {
  const borrar: number[] = [];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (let paso = 0; paso < 2; paso++) {
      borrar.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; if (!m[i]) continue;
        const p2 = m[i - w]!, p3 = m[i - w + 1]!, p4 = m[i + 1]!, p5 = m[i + w + 1]!, p6 = m[i + w]!, p7 = m[i + w - 1]!, p8 = m[i - 1]!, p9 = m[i - w - 1]!;
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (+(!p2 && p3) + +(!p3 && p4) + +(!p4 && p5) + +(!p5 && p6) + +(!p6 && p7) + +(!p7 && p8) + +(!p8 && p9) + +(!p9 && p2));
        if (a !== 1) continue;
        if (paso === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        borrar.push(i);
      }
      for (const i of borrar) m[i] = 0;
      if (borrar.length) cambio = true;
    }
  }
  return m;
}

/** Quita manchas pequeñas (componentes conexas con menos de `min` píxeles). */
export function limpiar(m: Uint8Array, w: number, h: number, min: number): Uint8Array {
  const vis = new Uint8Array(w * h), pila: number[] = [], comp: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || vis[s]) continue;
    pila.push(s); vis[s] = 1; comp.length = 0;
    while (pila.length) {
      const i = pila.pop()!; comp.push(i); const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (m[j] && !vis[j]) { vis[j] = 1; pila.push(j); }
      }
    }
    if (comp.length < min) for (const i of comp) m[i] = 0;
  }
  return m;
}

/** Máximo 5 estructuras, numeradas por importancia: la de trazas más largas y persistentes es la 1. */
export function porImportancia(r: ResultadoTrazas): ResultadoTrazas {
  const orden = [...r.familias].sort((a, b) => b.largoTotal - a.largoTotal).slice(0, 5).map(f => f.id);
  const nuevo = new Map(orden.map((id, i) => [id, i]));
  return estadisticas(r.segmentos.map(s => ({ ...s, familia: nuevo.get(s.familia) ?? -1 })), r.w, r.h);
}

/** Del mapa de probabilidad a trazas y familias, con un índice de confianza honesto (0–1). */
export interface Opciones { zona?: Uint8Array | null; prior?: number[] | null; maxLineas?: number; largoMin?: number }
export function desdeMapa(mapa: Mapa, o: Opciones = {}): ResultadoRed {
  const { w, h, p } = mapa;
  const segs = lineasPrincipales(p, w, h, { zona: o.zona, prior: o.prior, maxLineas: o.maxLineas, largoMin: o.largoMin })
    .map(l => { const { familia: _, ...sg } = segmentoDe(l.x1, l.y1, l.x2, l.y2, -1); return sg; });
  const r = porImportancia(agrupar(segs, w, h, 5));
  // Confianza: (a) qué tan segura está la red sobre las trazas encontradas, (b) qué parte del largo
  // total cae en familias definidas (no aleatorio), (c) hay suficiente evidencia (largo de trazas).
  let sp = 0, n = 0;
  for (const s of r.segmentos) {
    const pasos = Math.max(2, Math.round(s.largo / 3));
    for (let k = 0; k <= pasos; k++) {
      const x = Math.round(s.x1 + (s.x2 - s.x1) * k / pasos), y = Math.round(s.y1 + (s.y2 - s.y1) * k / pasos);
      if (x >= 0 && y >= 0 && x < w && y < h) { sp += p[y * w + x]!; n++; }
    }
  }
  const largo = r.segmentos.reduce((a, s) => a + s.largo, 0) || 1;
  const enFam = r.segmentos.filter(s => s.familia >= 0).reduce((a, s) => a + s.largo, 0) / largo;
  const evidencia = Math.min(1, largo / (2 * Math.max(w, h)));
  const confianza = r.segmentos.length ? Math.round((n ? sp / n : 0) * enFam * evidencia * 100) / 100 : 0;
  // Umbrales calibrados con las fotos de Justa: incluso en "alta" el ingeniero debe revisar.
  const nivel = confianza >= 0.45 ? 'alta' : confianza >= 0.25 ? 'media' : 'baja';
  return { ...r, confianza, nivel, mapa };
}

/** Entrada de la red: imagen escalada a lado mayor LADO (múltiplos de 16), RGB 0..1, canal-alto-ancho. */
export function preparar(img: CanvasImageSource & { width: number; height: number }, lado = LADO) {
  const k = lado / Math.max(img.width, img.height);
  const w = Math.max(16, Math.round(img.width * k / 16) * 16), h = Math.max(16, Math.round(img.height * k / 16) * 16);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, x = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) { x[i] = d[4 * i]! / 255; x[w * h + i] = d[4 * i + 1]! / 255; x[2 * w * h + i] = d[4 * i + 2]! / 255; }
  return { x, w, h };
}

/** Zonas de la labor en una foto: 0 nada útil (shotcrete, piso, fuera), 1 frente, 2 H.I., 3 corona, 4 H.D. */
export const ZONA_IDS = ['', 'FRENTE', 'HI', 'CORONA', 'HD'] as const;

/** Separa la roca de contorno en H.I., corona y H.D. según su posición respecto al frente. Puro (testeable). */
export function separarZonas(clase: Uint8Array, w: number, h: number) {
  // Caja del frente (percentiles 5–95 % para no depender de manchas sueltas).
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < w * h; i++) if (clase[i] === 1) { xs.push(i % w); ys.push((i / w) | 0); }
  const zona = new Uint8Array(w * h);
  if (xs.length < w * h * 0.03) { for (let i = 0; i < w * h; i++) zona[i] = clase[i] === 1 || clase[i] === 2 ? 1 : 0; return { zona, frente: null }; }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.floor(v.length * f))]!;
  const x0 = q(xs, 0.05), x1 = q(xs, 0.95), y0 = q(ys, 0.05), y1 = q(ys, 0.95), cx = (x0 + x1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = clase[i];
    if (c === 1) zona[i] = 1;
    else if (c === 2) zona[i] = y < y0 + (y1 - y0) * 0.15 && x > x0 - (x1 - x0) * 0.1 && x < x1 + (x1 - x0) * 0.1 ? 3 : x < cx ? 2 : 4;
  }
  return { zona, frente: { x0, x1, y0, y1 } };
}

/**
 * Zonas de la foto (red "zona", entrenada con 101 frentes de túnel, Zenodo 10.5281/zenodo.10261105, CC-BY 4.0):
 * frente, roca de contorno, shotcrete/revestimiento y piso. Con una sola foto del frente donde se ven los
 * hastiales y la corona, separa Frente / H.I. / Corona / H.D. Devuelve el mapa de zonas al tamaño w×h.
 */
export async function zonasLabor(img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const { ort, sesion } = await import('./onnx');
  const [o, s] = await Promise.all([ort(), sesion('zona.onnx')]);
  const e = preparar(img, 384);
  const r = await s.run({ img: new o.Tensor('float32', e.x, [1, 3, e.h, e.w]) });
  const z = r.zonas!.data as Float32Array, n = e.w * e.h;
  const clase = new Uint8Array(w * h), cuenta = [0, 0, 0, 0, 0];
  const cl = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let b = 0; for (let c = 1; c < 5; c++) if (z[c * n + i]! > z[b * n + i]!) b = c; cl[i] = b; cuenta[b]!++; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) clase[y * w + x] = cl[Math.min(e.h - 1, Math.floor(y * e.h / h)) * e.w + Math.min(e.w - 1, Math.floor(x * e.w / w))]!;
  const sep = separarZonas(clase, w, h);
  return { ...sep, fr: { roca: (cuenta[1]! + cuenta[2]!) / n, shotcrete: cuenta[3]! / n, piso: cuenta[4]! / n } };
}

/** Corre la red en el celular. Devuelve trazas en coordenadas de una imagen w×h (lado mayor LADO). */
export type Deteccion = ResultadoRed & { roca: number; zonaSeg: number[]; frente: { x0: number; x1: number; y0: number; y1: number } | null; zonaFr: Record<string, number> };
export async function detectarConRed(img: CanvasImageSource & { width: number; height: number }, prior?: number[] | null, op: { maxLineas?: number } = {}): Promise<Deteccion> {
  const { ort, sesion } = await import('./onnx');
  const [o, s] = await Promise.all([ort(), sesion('trazas.onnx')]);
  const { x, w, h } = preparar(img, LADO_RED);
  const r = await s.run({ img: new o.Tensor('float32', x, [1, 3, h, w]) });
  const p = Float32Array.from(r.prob!.data as Float32Array);
  // Solo se cuentan trazas sobre roca (no shotcrete ni piso). Si la red de zonas falla, se usa toda la foto.
  const z = await zonasLabor(img, w, h).catch(() => null);
  const usarZona = z && z.fr.roca > 0.15;
  const t = desdeMapa({ w, h, p }, { zona: usarZona ? z.zona : null, prior, maxLineas: op.maxLineas });
  // Zona de cada traza (por su punto medio) y cuánto de cada zona se ve en la foto.
  const zonaSeg = t.segmentos.map(sg => (usarZona ? z.zona[Math.round((sg.y1 + sg.y2) / 2) * w + Math.round((sg.x1 + sg.x2) / 2)] ?? 0 : 1));
  const zonaFr: Record<string, number> = {};
  if (usarZona) for (let k = 1; k <= 4; k++) { let c = 0; for (let i = 0; i < w * h; i++) if (z.zona[i] === k) c++; zonaFr[ZONA_IDS[k]!] = Math.round(c / (w * h) * 100) / 100; }
  return { ...t, roca: z ? Math.round(z.fr.roca * 100) / 100 : 1, zonaSeg, frente: usarZona ? z.frente : null, zonaFr };
}

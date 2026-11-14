// Detección de trazas de discontinuidades en la foto del frente, 100 % en el celular (sin señal, sin costo).
// Método clásico y explicable (para la tesis): gradiente de Sobel → transformada de Hough → segmentos →
// agrupación por orientación aparente → familias → espaciamiento y Jv (Palmström).
// Todo es una PROPUESTA: el ingeniero quita o corrige familias antes de aplicar.

export interface Imagen { w: number; h: number; gris: Float32Array } // 0..1
export interface Segmento { x1: number; y1: number; x2: number; y2: number; ang: number; largo: number; familia: number }
export interface FamiliaFoto { id: number; ang: number; segmentos: number; largoTotal: number; espaciamientoPx: number | null; persistenciaPx: number }
export interface ResultadoTrazas { segmentos: Segmento[]; familias: FamiliaFoto[]; aleatorios: number; w: number; h: number }

export function aGris(rgba: Uint8ClampedArray, w: number, h: number): Imagen {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (0.299 * rgba[4 * i]! + 0.587 * rgba[4 * i + 1]! + 0.114 * rgba[4 * i + 2]!) / 255;
  return { w, h, gris: g };
}

function suavizar(im: Imagen): Imagen {
  const { w, h, gris } = im; const k = [1, 4, 6, 4, 1]; const tmp = new Float32Array(w * h); const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let i = -2; i <= 2; i++) { const xx = x + i; if (xx >= 0 && xx < w) { s += gris[y * w + xx]! * k[i + 2]!; n += k[i + 2]!; } }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let i = -2; i <= 2; i++) { const yy = y + i; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]! * k[i + 2]!; n += k[i + 2]!; } }
    out[y * w + x] = s / n;
  }
  return { w, h, gris: out };
}

/** Bordes: magnitud de Sobel, umbral por percentil y supresión de no máximos. */
export function bordes(im: Imagen, fraccion = 0.07): Uint8Array {
  const { w, h, gris } = suavizar(im);
  const mag = new Float32Array(w * h), dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = (dx: number, dy: number) => gris[(y + dy) * w + x + dx]!;
    const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
    const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
    mag[y * w + x] = Math.hypot(gx, gy); dir[y * w + x] = Math.atan2(gy, gx);
  }
  const muestra = Array.from(mag.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b);
  const umbral = muestra[Math.floor(muestra.length * (1 - fraccion))] ?? 0;
  const e = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i]!;
    if (m < umbral || m === 0) continue;
    const dx = Math.round(Math.cos(dir[i]!)), dy = Math.round(Math.sin(dir[i]!));
    if (m >= mag[i + dy * w + dx]! && m >= mag[i - dy * w - dx]!) e[i] = 1;
  }
  return e;
}

/** Hough con extracción de segmentos sobre cada recta fuerte. */
export function segmentos(e: Uint8Array, w: number, h: number, opts: { largoMin?: number; hueco?: number; maxRectas?: number } = {}): Omit<Segmento, 'familia'>[] {
  const largoMin = opts.largoMin ?? Math.max(25, Math.round(Math.min(w, h) * 0.08));
  const hueco = opts.hueco ?? 4;
  const maxRectas = opts.maxRectas ?? 120;
  const NT = 180, diag = Math.ceil(Math.hypot(w, h)), NR = 2 * diag + 1;
  const cs = new Float32Array(NT), sn = new Float32Array(NT);
  for (let t = 0; t < NT; t++) { cs[t] = Math.cos(t * Math.PI / NT); sn[t] = Math.sin(t * Math.PI / NT); }
  const acc = new Uint32Array(NT * NR);
  const usado = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (e[y * w + x])
    for (let t = 0; t < NT; t++) { const j = t * NR + Math.round(x * cs[t]! + y * sn[t]!) + diag; acc[j] = acc[j]! + 1; }
  // Picos con supresión local.
  const picos: { t: number; r: number; v: number }[] = [];
  const minVotos = largoMin * 0.6;
  for (let t = 0; t < NT; t++) for (let r = 1; r < NR - 1; r++) {
    const v = acc[t * NR + r]!;
    if (v < minVotos) continue;
    let max = true;
    for (let dt = -2; dt <= 2 && max; dt++) for (let dr = -3; dr <= 3; dr++) {
      const tt = (t + dt + NT) % NT, rr = r + dr;
      if (rr < 0 || rr >= NR || (dt === 0 && dr === 0)) continue;
      if (acc[tt * NR + rr]! > v) { max = false; break; }
    }
    if (max) picos.push({ t, r: r - diag, v });
  }
  picos.sort((a, b) => b.v - a.v);
  const out: Omit<Segmento, 'familia'>[] = [];
  for (const p of picos.slice(0, maxRectas * 3)) {
    if (out.length >= maxRectas * 2) break;
    const c = cs[p.t]!, s = sn[p.t]!;
    // Recorre la recta x·cos + y·sin = r dentro de la imagen.
    const x0 = c * p.r, y0 = s * p.r, dx = -s, dy = c;
    let ini: [number, number] | null = null, fin: [number, number] | null = null, gap = 0;
    const pts: [number, number][] = [];
    const cerrar = () => {
      if (ini && fin) {
        const largo = Math.hypot(fin[0] - ini[0], fin[1] - ini[1]);
        if (largo >= largoMin) {
          for (const [px, py] of pts) usado[py * w + px] = 1;
          let ang = Math.atan2(-(fin[1] - ini[1]), fin[0] - ini[0]) * 180 / Math.PI; // 0° = horizontal, antihorario
          ang = ((ang % 180) + 180) % 180;
          out.push({ x1: ini[0], y1: ini[1], x2: fin[0], y2: fin[1], ang, largo });
        }
      }
      ini = fin = null; gap = 0; pts.length = 0;
    };
    for (let k = -diag; k <= diag; k++) {
      const x = Math.round(x0 + k * dx), y = Math.round(y0 + k * dy);
      if (x < 0 || y < 0 || x >= w || y >= h) { if (ini) cerrar(); continue; }
      let hit = false;
      for (let o = -1; o <= 1 && !hit; o++) {
        const xx = Math.round(x + o * c), yy = Math.round(y + o * s);
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && e[yy * w + xx] && !usado[yy * w + xx]) { hit = true; pts.push([xx, yy]); }
      }
      if (hit) { if (!ini) ini = [x, y]; fin = [x, y]; gap = 0; }
      else if (ini && ++gap > hueco) cerrar();
    }
    cerrar();
  }
  // Fuera bordes de la imagen (marcos, recortes): segmentos pegados y paralelos al borde.
  const m = Math.max(4, Math.min(w, h) * 0.025);
  return out.filter(sg => !((sg.y1 < m && sg.y2 < m) || (sg.y1 > h - m && sg.y2 > h - m) || (sg.x1 < m && sg.x2 < m) || (sg.x1 > w - m && sg.x2 > w - m)));
}

const difAxial = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** Agrupa segmentos por orientación aparente (datos axiales 0–180°) ponderando por largo. */
export function agrupar(segs: Omit<Segmento, 'familia'>[], w: number, h: number, maxFamilias = 4): ResultadoTrazas {
  const hist = new Float32Array(180);
  for (const s of segs) hist[Math.round(s.ang) % 180]! += s.largo;
  const suave = new Float32Array(180);
  for (let i = 0; i < 180; i++) for (let k = -8; k <= 8; k++) suave[i]! += hist[(i + k + 180) % 180]! * Math.exp(-(k * k) / 32);
  const total = segs.reduce((a, s) => a + s.largo, 0) || 1;
  const picos: number[] = [];
  for (let i = 0; i < 180; i++) {
    const v = suave[i]!;
    let max = true;
    for (let k = -15; k <= 15 && max; k++) if (k && suave[(i + k + 180) % 180]! > v) max = false;
    if (max && v > 0) picos.push(i);
  }
  picos.sort((a, b) => suave[b]! - suave[a]!);
  const centros: number[] = [];
  for (const p of picos) {
    if (centros.length >= maxFamilias) break;
    const masa = segs.filter(s => difAxial(s.ang, p) <= 12).reduce((a, s) => a + s.largo, 0);
    if (masa / total < 0.1) continue;
    if (centros.every(c => difAxial(c, p) > 20)) centros.push(p);
  }
  const conFam: Segmento[] = segs.map(s => {
    let best = -1, bd = 99;
    centros.forEach((c, i) => { const d = difAxial(s.ang, c); if (d < bd) { bd = d; best = i; } });
    return { ...s, familia: bd <= 15 ? best : -1 };
  });
  return estadisticas(conFam, w, h);
}

export function analizar(rgba: Uint8ClampedArray, w: number, h: number): ResultadoTrazas {
  const im = aGris(rgba, w, h);
  const e = bordes(im);
  return agrupar(segmentos(e, w, h), w, h);
}


function angMedioDe(ss: { ang: number; largo: number }[]) {
  let sx = 0, sy = 0;
  for (const s of ss) { sx += s.largo * Math.cos(2 * s.ang * Math.PI / 180); sy += s.largo * Math.sin(2 * s.ang * Math.PI / 180); }
  return ((Math.atan2(sy, sx) * 90 / Math.PI) + 180) % 180;
}

/** Estadísticas por familia a partir de segmentos ya asignados (automáticos o dibujados a mano). */
export function estadisticas(segs: Segmento[], w: number, h: number): ResultadoTrazas {
  const ids = [...new Set(segs.map(s => s.familia).filter(f => f >= 0))].sort((a, b) => a - b);
  const tol = Math.max(8, w * 0.02);
  const familias: FamiliaFoto[] = ids.map(id => {
    const ss = segs.filter(s => s.familia === id);
    const c = angMedioDe(ss);
    // Espaciamiento: posición de cada traza sobre la normal a la familia; huecos entre trazas distintas.
    const nr = (c + 90) * Math.PI / 180, nx = Math.cos(nr), ny = -Math.sin(nr);
    const pos = ss.map(s => ((s.x1 + s.x2) / 2) * nx + ((s.y1 + s.y2) / 2) * ny).sort((a, b) => a - b);
    const unicos: number[] = [];
    for (const p of pos) if (!unicos.length || p - unicos[unicos.length - 1]! > tol) unicos.push(p);
    const huecos = unicos.slice(1).map((p, i) => p - unicos[i]!);
    const med = huecos.length ? huecos.sort((a, b) => a - b)[Math.floor(huecos.length / 2)]! : null;
    const angMedio = c;
    return { id, ang: Math.round(angMedio), segmentos: ss.length, largoTotal: ss.reduce((a, s) => a + s.largo, 0), espaciamientoPx: med,
      persistenciaPx: ss.length ? ss.reduce((a, s) => a + s.largo, 0) / ss.length : 0 };
  });
  return { segmentos: segs, familias, aleatorios: segs.filter(s => s.familia < 0).length, w, h };
}

/** Segmento a partir de dos puntos (para trazas dibujadas con el dedo). */
export function segmentoDe(x1: number, y1: number, x2: number, y2: number, familia: number): Segmento {
  let ang = Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI; ang = ((ang % 180) + 180) % 180;
  return { x1, y1, x2, y2, ang, largo: Math.hypot(x2 - x1, y2 - y1), familia };
}

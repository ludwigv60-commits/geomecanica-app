// Líneas principales a partir del mapa de probabilidad de la red de trazas.
// Busca solo rectas largas (por defecto más de 1/4 del lado menor, unos 1–1.5 m en un frente de 5×5 m):
// Hough ponderado por la probabilidad, votando solo en la orientación local del mapa (tensor de estructura),
// con supresión de rectas repetidas. Si se conocen los ángulos de las trazas del mapeo anterior de la
// labor, las rectas con esos ángulos pesan más. 

export interface OpcionesLineas {
  zona?: Uint8Array | null;   // 1 = roca (frente o contorno); fuera de ella no se buscan trazas
  prior?: number[] | null;    // ángulos (0–180°, como Segmento.ang) esperados por el historial
  maxLineas?: number; largoMin?: number; t0?: number; ts?: number; hueco?: number;
}
export interface Recta { x1: number; y1: number; x2: number; y2: number; soporte: number }

const desenfoque = (a: Float32Array, w: number, h: number, s: number) => {
  const r = Math.max(1, Math.round(s * 2)), k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * s * s)));
  const sum = k.reduce((x, y) => x + y, 0), t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += a[y * w + Math.min(w - 1, Math.max(0, x + i))]! * k[i + r]!; t[y * w + x] = v / sum; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += t[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + r]!; o[y * w + x] = v / sum; }
  return o;
};

/** Ángulo de la recta en la foto (0–180°, antihorario desde la horizontal, como Segmento.ang) para una normal θ. */
const angDeNormal = (t: number) => ((Math.atan2(-Math.cos(t * Math.PI / 180), -Math.sin(t * Math.PI / 180)) * 180 / Math.PI) % 180 + 180) % 180;
const difAng = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

export function lineasPrincipales(p: Float32Array, w: number, h: number, o: OpcionesLineas = {}): Recta[] {
  const md = Math.min(w, h), t0 = o.t0 ?? 0.2, ts = o.ts ?? 0.3, maxL = o.maxLineas ?? 5;
  const largoMin = o.largoMin ?? 0.25 * md, hueco = (o.hueco ?? 0.25) * md, VEN = 12;
  const q = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) q[i] = !o.zona || o.zona[i] ? p[i]! : 0;
  // Orientación local: tensor de estructura del mapa suavizado.
  const g = desenfoque(q, w, h, 2), gxx = new Float32Array(w * h), gyy = new Float32Array(w * h), gxy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = g[i - w + 1]! + 2 * g[i + 1]! + g[i + w + 1]! - g[i - w - 1]! - 2 * g[i - 1]! - g[i + w - 1]!;
    const gy = g[i + w - 1]! + 2 * g[i + w]! + g[i + w + 1]! - g[i - w - 1]! - 2 * g[i - w]! - g[i - w + 1]!;
    gxx[i] = gx * gx; gyy[i] = gy * gy; gxy[i] = gx * gy;
  }
  const Jxx = desenfoque(gxx, w, h, 4), Jyy = desenfoque(gyy, w, h, 4), Jxy = desenfoque(gxy, w, h, 4);
  // Píxeles que votan.
  const xs: number[] = [], ys: number[] = [], wt: number[] = [], th: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = q[i]! - t0; if (v <= 0) continue;
    xs.push(x); ys.push(y); wt.push(v);
    th.push(((0.5 * Math.atan2(2 * Jxy[i]!, Jxx[i]! - Jyy[i]!) * 180 / Math.PI) % 180 + 180) % 180);
  }
  const n = xs.length; if (n < 10) return [];
  const D = Math.floor(Math.hypot(w, h) / 2) + 2, NR = 2 * D + 1;
  const cs = new Float32Array(180), sn = new Float32Array(180), pw = new Float32Array(180).fill(1);
  for (let t = 0; t < 180; t++) { cs[t] = Math.cos(t * Math.PI / 180); sn[t] = Math.sin(t * Math.PI / 180); }
  if (o.prior?.length) for (let t = 0; t < 180; t++) {
    const dm = Math.min(...o.prior.map(a => difAng(angDeNormal(t), a)));
    pw[t] = 1 + 3 * Math.exp(-(dm * dm) / 200);
  }
  const vivo = new Uint8Array(n).fill(1), acc = new Float32Array(180 * NR), out: Recta[] = [], acept: [number, number][] = [];
  for (let it = 0; it < maxL * 3 && out.length < maxL; it++) {
    acc.fill(0); let vivos = 0;
    for (let k = 0; k < n; k++) {
      if (!vivo[k]) continue; vivos++;
      const t0k = Math.round(th[k]!);
      for (let d = -VEN; d <= VEN; d++) {
        const t = ((t0k + d) % 180 + 180) % 180;
        const j = t * NR + Math.round((xs[k]! * cs[t]! + ys[k]! * sn[t]!) / 2) + D; acc[j] = acc[j]! + wt[k]! * pw[t]!;
      }
    }
    if (vivos < 10) break;
    let best = -1, bi = 0;
    for (let t = 0; t < 180; t++) for (let r = 1; r < NR - 1; r++) {
      const i = t * NR + r, tp = ((t + 1) % 180) * NR + r, tm = ((t + 179) % 180) * NR + r;
      const v = acc[i]! * 2 + acc[i - 1]! + acc[i + 1]! + acc[tp]! + acc[tm]!;
      if (v > best) { best = v; bi = i; }
    }
    const t = Math.floor(bi / NR), r = (bi % NR - D) * 2, c = cs[t]!, s = sn[t]!;
    const us: number[] = []; let quitados = 0;
    for (let k = 0; k < n; k++) if (vivo[k] && Math.abs(xs[k]! * c + ys[k]! * s - r) <= 4 && p[ys[k]! * w + xs[k]!]! >= ts) us.push(-xs[k]! * s + ys[k]! * c);
    let a = 0, b = -1;
    if (us.length >= 5) {
      us.sort((x, y) => x - y);
      let ini = 0;
      for (let k = 1; k <= us.length; k++) if (k === us.length || us[k]! - us[k - 1]! > hueco) { if (us[k - 1]! - us[ini]! > b - a) { a = us[ini]!; b = us[k - 1]!; } ini = k; }
    }
    for (let k = 0; k < n; k++) {
      if (!vivo[k] || Math.abs(xs[k]! * c + ys[k]! * s - r) > 0.04 * md) continue;
      const u = -xs[k]! * s + ys[k]! * c;
      if (b < a || (u >= a - 10 && u <= b + 10)) { vivo[k] = 0; quitados++; }
    }
    if (!quitados) break;
    if (b - a < largoMin) continue;
    if (acept.some(([t2, r2]) => difAng(t, t2) < 10 && Math.abs(r - r2) < 0.18 * md)) continue;
    acept.push([t, r]);
    out.push({ x1: r * c - a * s, y1: r * s + a * c, x2: r * c - b * s, y2: r * s + b * c, soporte: us.length });
  }
  return out;
}


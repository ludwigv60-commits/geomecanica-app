// Vista en planta y vista en sección de la ficha AESA, calculadas (no dibujadas a mano):
// - Planta (norte arriba): la labor según su azimut y el rumbo de cada familia (dip direction − 90°),
//   con su número y una marca hacia donde buza.
// - Sección (mirando el frente): contorno de la labor, roca alrededor con el color del tipo de roca,
//   trazas de cada familia con su buzamiento aparente en el plano del frente, shotcrete y pernos.
import { TIPOS, tipoRoca } from '../core/rmr';
import type { Reporte } from '../model';

export type P = [number, number];
export type Prim =
  | { t: 'poly'; pts: P[]; cerrado?: boolean; relleno?: string; borde?: string; ancho?: number; opac?: number }
  | { t: 'texto'; p: P; s: string; tam?: number; color?: string };
export interface Vista { prims: Prim[]; caja: [number, number, number, number] } // caja: xmin, ymin, xmax, ymax (m)

const rad = (g: number) => (g * Math.PI) / 180;
const TINTA = '#0D3399';
export const COLOR_FAM = ['#1F4E9E', '#2E7D32', '#6A1B9A', '#00838F', '#795548'];
const colorDe = (abrev: string, k: number) => (abrev === 'F' ? '#FF0000' : COLOR_FAM[k % COLOR_FAM.length]!);

/** Buzamiento aparente (°) de un plano en el plano vertical del frente, y si baja hacia la derecha. */
export function aparente(dip: number, dipdir: number, azimut: number): { ang: number; bajaDerecha: boolean } {
  const c = Math.cos(rad(dipdir - (azimut + 90)));        // rumbo del frente: azimut + 90° (hacia la derecha)
  const ang = (Math.atan(Math.tan(rad(Math.min(dip, 89.9))) * Math.abs(c)) * 180) / Math.PI;
  return { ang, bajaDerecha: c > 0 };
}

function dentro(p: P, pol: P[]): boolean {
  let s = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i]!, [xj, yj] = pol[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}
/** Partes de la recta a→b que quedan dentro de `fuera` y fuera de `hueco`. */
function recortar(a: P, b: P, fuera: P[], hueco: P[] | null, n = 160): [P, P][] {
  const out: P[][] = []; let cur: P[] = [];
  for (let i = 0; i <= n; i++) {
    const p: P = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
    if (dentro(p, fuera) && !(hueco && dentro(p, hueco))) cur.push(p);
    else { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out.map(s => [s[0]!, s[s.length - 1]!] as [P, P]);
}

/** Contorno de la sección (bóveda de medio punto rebajado + hastiales verticales), base en y = 0. */
export function contorno(ancho: number, alto: number, ext = 0): P[] {
  const a = ancho / 2 + ext, f = Math.min(alto * 0.45, ancho * 0.3) + ext * 0.6, hw = alto - Math.min(alto * 0.45, ancho * 0.3);
  const pts: P[] = [[-a, ext ? -ext * 0.3 : 0], [-a, hw]];
  for (let i = 1; i < 24; i++) { const t = Math.PI - (Math.PI * i) / 24; pts.push([a * Math.cos(t), hw + f * Math.sin(t)]); }
  pts.push([a, hw], [a, ext ? -ext * 0.3 : 0]);
  return pts;
}

const familiasMedidas = (r: Reporte) => r.familias.map((f, i) => ({ ...f, n: i + 1 })).filter(f => f.dip != null && f.dipdir != null) as { abrev: string; dip: number; dipdir: number; n: number }[];

export function colorTipo(r: Reporte, rmr: number | null): string {
  if (rmr == null) return '#BDBDBD';
  return TIPOS.find(t => t.tipo === tipoRoca(rmr))?.color ?? '#BDBDBD';
}

export function vistaPlanta(r: Reporte, rmr: number | null, norte = true): Vista | null {
  if (r.azimut == null) return null;
  const B = r.ancho ?? 5, L = Math.max(2.2 * B, 10), az = rad(r.azimut);
  const u: P = [Math.sin(az), Math.cos(az)], v: P = [Math.cos(az), -Math.sin(az)];
  const en = (s: number, t: number): P => [u[0] * s + v[0] * t, u[1] * s + v[1] * t];
  const huella: P[] = [en(-L, -B / 2), en(-B * 0.25, -B / 2)];
  for (let i = 1; i < 12; i++) { const t = -Math.PI / 2 + (Math.PI * i) / 12; huella.push(en(-B * 0.25 + B * 0.25 * Math.cos(t), (B / 2) * Math.sin(t))); }
  huella.push(en(-B * 0.25, B / 2), en(-L, B / 2));
  const prims: Prim[] = [{ t: 'poly', pts: huella, cerrado: true, relleno: colorTipo(r, rmr), opac: 0.55, borde: '#000000', ancho: 1.2 }];
  const R = L * 0.75, c: P = en(-L / 2, 0);
  familiasMedidas(r).forEach((f, k) => {
    const rumbo = rad(f.dipdir - 90), d: P = [Math.sin(rumbo), Math.cos(rumbo)];
    const o: P = en(-L * (0.25 + 0.5 * ((k + 0.5) / Math.max(1, familiasMedidas(r).length))), 0);
    const a: P = [o[0] - d[0] * R, o[1] - d[1] * R], b: P = [o[0] + d[0] * R, o[1] + d[1] * R];
    const col = colorDe(f.abrev, k);
    prims.push({ t: 'poly', pts: [a, b], borde: col, ancho: 0.9 });
    const dd = rad(f.dipdir), tick: P = [o[0] + Math.sin(dd) * B * 0.18, o[1] + Math.cos(dd) * B * 0.18];
    prims.push({ t: 'poly', pts: [o, tick], borde: col, ancho: 2 });
    prims.push({ t: 'texto', p: [b[0] + d[0] * 0.6, b[1] + d[1] * 0.6], s: String(f.n), tam: 9, color: col });
  });
  // norte y rótulo del azimut
  const xs = [...huella.map(p => p[0]), c[0] - R, c[0] + R], ys = [...huella.map(p => p[1]), c[1] - R, c[1] + R];
  const caja: Vista['caja'] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const w = caja[2] - caja[0], h = caja[3] - caja[1], nx = caja[2] - w * 0.06, ny = caja[3] - h * 0.04;
  if (norte) {
    prims.push({ t: 'poly', pts: [[nx, ny - h * 0.12], [nx, ny]], borde: '#000000', ancho: 1.2 }, { t: 'poly', pts: [[nx - w * 0.02, ny - h * 0.04], [nx, ny], [nx + w * 0.02, ny - h * 0.04]], borde: '#000000', ancho: 1.2 });
    prims.push({ t: 'texto', p: [nx - w * 0.015, ny + h * 0.01], s: 'N', tam: 8 });
  }
  prims.push({ t: 'texto', p: [caja[0] + w * 0.02, caja[1] + h * 0.02], s: `Az ${Math.round(r.azimut)}°`, tam: 7, color: TINTA });
  return { prims, caja };
}

export function vistaSeccion(r: Reporte, rmr: number | null): Vista {
  const B = r.ancho ?? 5, H = r.alto ?? 5, e = B * 0.38;
  const hueco = contorno(B, H), fuera = contorno(B, H, e);
  const prims: Prim[] = [{ t: 'poly', pts: fuera, cerrado: true, relleno: colorTipo(r, rmr), opac: 0.6, borde: '#000000', ancho: 1 },
    { t: 'poly', pts: hueco, cerrado: true, relleno: '#FFFFFF' }];
  const fams = familiasMedidas(r), az = r.azimut ?? 0, ext = Math.hypot(B + 2 * e, H + e);
  fams.forEach((f, k) => {
    const { ang, bajaDerecha } = aparente(f.dip, f.dipdir, az);
    const t = rad(bajaDerecha ? -ang : ang), d: P = [Math.cos(t), Math.sin(t)], nrm: P = [-d[1], d[0]];
    const paso = (B + 2 * e) / (4 + fams.length), col = colorDe(f.abrev, k);
    let rot = false;
    for (let j = -8; j <= 8; j++) {
      const o: P = [nrm[0] * paso * (j + k / Math.max(1, fams.length)), H / 2 + nrm[1] * paso * (j + k / Math.max(1, fams.length))];
      for (const [a, b] of recortar([o[0] - d[0] * ext, o[1] - d[1] * ext], [o[0] + d[0] * ext, o[1] + d[1] * ext], fuera, hueco)) {
        prims.push({ t: 'poly', pts: [a, b], borde: col, ancho: 0.7 });
        if (!rot && b[0] > B / 2 + e * 0.4) { prims.push({ t: 'texto', p: [b[0] + 0.15, b[1] - 0.1], s: String(f.n), tam: 8, color: col }); rot = true; }
      }
    }
  });
  const sost = (r.sostenimiento ?? []).join(' ').toLowerCase();
  if (/shotcrete|lanzado/.test(sost)) prims.push({ t: 'poly', pts: contorno(B, H, B * 0.035), borde: '#7F7F7F', ancho: 2.2 });
  if (/perno|split|helicoidal|bolt/.test(sost)) {
    const lp = Math.min(e * 0.85, /7\s*pies|2\.1/.test(sost) ? 2.1 : /5\s*pies|1\.5/.test(sost) ? 1.5 : 1.8);
    const hw = H - Math.min(H * 0.45, B * 0.3), f = Math.min(H * 0.45, B * 0.3);
    for (let i = 0; i <= 8; i++) { // bóveda
      const t = Math.PI * (0.06 + (0.88 * i) / 8), p: P = [(B / 2) * Math.cos(t), hw + f * Math.sin(t)];
      const n0 = [Math.cos(t) / (B / 2), Math.sin(t) / f], nn = Math.hypot(n0[0]!, n0[1]!);
      prims.push({ t: 'poly', pts: [p, [p[0] + (n0[0]! / nn) * lp, p[1] + (n0[1]! / nn) * lp]], borde: '#3A3A3A', ancho: 1.6 });
    }
    for (const s of [-1, 1]) for (const y of [hw * 0.45, hw * 0.8]) prims.push({ t: 'poly', pts: [[(s * B) / 2, y], [s * (B / 2 + lp), y]], borde: '#3A3A3A', ancho: 1.6 });
  }
  prims.push({ t: 'poly', pts: hueco, borde: '#000000', ancho: 1.3 });
  prims.push({ t: 'texto', p: [-B / 2 - e, -e * 0.55], s: `${B} x ${H} m`, tam: 7, color: TINTA });
  return { prims, caja: [-B / 2 - e * 1.05, -e * 0.7, B / 2 + e * 1.35, H + e * 1.05] };
}

/** Para mostrar en la app. */
export function aSvg(v: Vista, W = 300, Hh = 230): string {
  const [x0, y0, x1, y1] = v.caja, k = Math.min((W - 10) / (x1 - x0), (Hh - 10) / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (Hh - (y1 - y0) * k) / 2;
  const X = (p: P) => `${(ox + (p[0] - x0) * k).toFixed(1)},${(Hh - oy - (p[1] - y0) * k).toFixed(1)}`;
  const body = v.prims.map(p => p.t === 'poly'
    ? `<polyline points="${p.pts.map(X).join(' ')}${p.cerrado ? ' ' + X(p.pts[0]!) : ''}" fill="${p.relleno ?? 'none'}" fill-opacity="${p.opac ?? 1}" stroke="${p.borde ?? 'none'}" stroke-width="${(p.ancho ?? 1) * 0.9}"/>`
    : `<text x="${X(p.p).split(',')[0]}" y="${X(p.p).split(',')[1]}" font-size="${(p.tam ?? 8) * 1.2}" fill="${p.color ?? '#000'}" font-family="sans-serif">${p.s}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="100%">${body}</svg>`;
}

// ---- Dibujo en el PDF del formato (coordenadas en puntos, y hacia abajo) ----
export type Q = [number, number];
type Rect = [number, number, number, number]; // x0, y0, x1, y1 (y hacia abajo)
/** Recorta un polígono a un rectángulo (Sutherland–Hodgman). */
export function recortarPoligono(pts: Q[], [x0, y0, x1, y1]: Rect): Q[] {
  const lados: [(p: Q) => boolean, (a: Q, b: Q) => Q][] = [
    [p => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [p => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = pts;
  for (const [ok, cruce] of lados) {
    const ent = out; out = [];
    ent.forEach((b, i) => { const a = ent[(i + ent.length - 1) % ent.length]!; if (ok(b)) { if (!ok(a)) out.push(cruce(a, b)); out.push(b); } else if (ok(a)) out.push(cruce(a, b)); });
    if (!out.length) break;
  }
  return out;
}
/** Recorta un segmento a un rectángulo (Liang–Barsky). */
export function recortarSegmento(a: Q, b: Q, [x0, y0, x1, y1]: Rect): [Q, Q] | null {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as [number, number][]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
/** Pasa una vista a primitivas en puntos del PDF dentro de `caja`. `fijo` fuerza la escala (x, y) y el origen. */
export function aPuntos(v: Vista, caja: Rect, fijo?: { kx: number; ky: number; ox: number; oy: number }): { polys: (Prim & { t: 'poly' })[]; textos: (Prim & { t: 'texto' })[] } {
  const [bx0, by0, bx1, by1] = caja, [x0, y0, x1, y1] = v.caja;
  const k = Math.min((bx1 - bx0 - 8) / (x1 - x0), (by1 - by0 - 8) / (y1 - y0));
  const T = fijo ?? { kx: k, ky: k, ox: bx0 + (bx1 - bx0 - (x1 - x0) * k) / 2 - x0 * k, oy: by1 - (by1 - by0 - (y1 - y0) * k) / 2 + y0 * k };
  const X = (p: P): Q => [T.ox + p[0] * T.kx, T.oy - p[1] * T.ky];
  const polys: (Prim & { t: 'poly' })[] = [], textos: (Prim & { t: 'texto' })[] = [];
  for (const p of v.prims) {
    if (p.t === 'texto') { const q = X(p.p); if (q[0] > bx0 && q[0] < bx1 - 4 && q[1] > by0 + 6 && q[1] < by1) textos.push({ ...p, p: q }); continue; }
    const pts = p.pts.map(X);
    if (p.cerrado) { const c = recortarPoligono(pts, caja); if (c.length > 2) polys.push({ ...p, pts: c }); continue; }
    for (let i = 1; i < pts.length; i++) { const s = recortarSegmento(pts[i - 1]!, pts[i]!, caja); if (s) polys.push({ ...p, pts: s }); }
  }
  return { polys, textos };
}

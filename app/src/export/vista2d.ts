// Respaldo del visor 3D cuando el equipo no tiene WebGL 2 (aceleración por hardware apagada, GPU bloqueada
// o driver antiguo): la misma escena dibujada en un canvas 2D (pintor: triángulos ordenados por profundidad,
// con luz simple). Se puede girar con el mouse o el dedo, acercar con la rueda y usar las mismas vistas.
import type { Capa, Escena3, V3 } from './escena3d';
import type { Preset, Tema, Vista3D } from './render3d';

const OSCURO: Record<string, string> = { '#111111': '#E8ECF1', '#333333': '#C9D1DA', '#444444': '#AEB7C2', '#2B1B12': '#1A0F0A', '#0D2A6B': '#9CC3F0', '#1F4E8C': '#8DB7EA', '#2F6FB3': '#5FA0E6', '#9AA0A6': '#56606B', '#8A939C': '#6B7480', '#333': '#C9D1DA' };
const tono = (c: string, t: Tema) => (t === 'oscuro' ? OSCURO[c] ?? c : c);
const rgb = (h: string): V3 => { let x = h.replace('#', ''); if (x.length === 3) x = [...x].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255) as V3; };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

interface Tri { capa: Capa; p: [V3, V3, V3]; c: V3; a: number; n: V3; borde: boolean }
interface Seg { capa: Capa; a: V3; b: V3; color: string; ancho: number; trazos: boolean; opac: number }

export function crearVista2D(canvas: HTMLCanvasElement, esc: Escena3, o: { tema?: Tema; interactivo?: boolean; w: number; h: number; pr?: number; rotulos?: number }): Vista3D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sin canvas 2D');
  const tema = o.tema ?? 'oscuro', pr = o.pr ?? 1;
  let W = o.w, H = o.h;
  const fondo = tema === 'oscuro' ? '#161C24' : '#FFFFFF';
  const visibles: Record<string, boolean> = {};
  const vis = (c: Capa) => visibles[c] !== false;

  // geometría
  const tris: Tri[] = [];
  for (const m of esc.mallas) {
    const base = rgb(m.color);
    for (let i = 0; i + 8 < m.pos.length; i += 9) {
      const p: [V3, V3, V3] = [[m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!], [m.pos[i + 3]!, m.pos[i + 4]!, m.pos[i + 5]!], [m.pos[i + 6]!, m.pos[i + 7]!, m.pos[i + 8]!]];
      let c = base;
      if (m.colores) { const k = i; c = [0, 1, 2].map(j => ((m.colores![k + j] ?? base[j]!) + (m.colores![k + 3 + j] ?? base[j]!) + (m.colores![k + 6 + j] ?? base[j]!)) / 3) as V3; }
      tris.push({ capa: m.capa, p, c, a: m.opac, n: unit(cruz(sub(p[1], p[0]), sub(p[2], p[0]))), borde: m.capa === 'cunas' });
    }
  }
  const segs: Seg[] = [];
  for (const l of esc.lineas) for (let i = 0; i + 1 < l.pts.length; i++)
    segs.push({ capa: l.capa, a: l.pts[i]!, b: l.pts[i + 1]!, color: tono(l.color, tema), ancho: l.ancho, trazos: !!l.trazos, opac: l.opac ?? 1 });

  // cámara en órbita
  const centro = esc.centro;
  const fov = (32 * Math.PI) / 180;
  const dirs: Record<Preset, V3> = { lateral: [1, 0.78, -0.58], frente: [0.18, 0.32, 1], contra: [-1, 0.55, 0.55], planta: [0.0001, 1, 0.0001] };
  let az = 0, el = 0, dist = 1, zoom = 1, correr: [number, number] = [0, 0], upPlanta: V3 | null = null;
  const ponerPreset = (p: Preset) => {
    const d = unit(dirs[p]);
    az = Math.atan2(d[0], d[2]); el = Math.asin(Math.max(-0.999, Math.min(0.999, d[1])));
    const asp = Math.min(1, W / H);
    dist = (esc.radio / Math.sin((fov * asp) / 2)) * (p === 'planta' ? 0.92 : 0.86);
    upPlanta = p === 'planta' ? [esc.norte[0], 0, esc.norte[1]] : null;
  };
  ponerPreset('lateral');

  const luz = unit([-0.4, 0.85, -0.35]), luz2 = unit([0.6, 0.4, -0.5]);
  const dibujar = () => {
    canvas.width = Math.round(W * pr); canvas.height = Math.round(H * pr);
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
    const ojo: V3 = [centro[0] + dist * Math.cos(el) * Math.sin(az), centro[1] + dist * Math.sin(el), centro[2] + dist * Math.cos(el) * Math.cos(az)];
    const f = unit(sub(centro, ojo));
    let up: V3 = upPlanta && Math.abs(el) > 1.4 ? upPlanta : [0, 1, 0];
    let r = cruz(f, up); if (Math.hypot(...r) < 1e-6) { up = [0, 0, 1]; r = cruz(f, up); }
    r = unit(r); const u = cruz(r, f);
    const foc = (H / 2) / Math.tan(fov / 2) * zoom;
    const cx = W / 2 + correr[0] * W * zoom, cy = H / 2 + correr[1] * H * zoom;
    const proy = (p: V3): [number, number, number] => { const d = sub(p, ojo); const z = punto(d, f); const zz = Math.max(z, 0.05); return [cx + (punto(d, r) * foc) / zz, cy - (punto(d, u) * foc) / zz, z]; };

    type Item = { z: number; dib: () => void };
    const items: Item[] = [];
    for (const t of tris) {
      if (!vis(t.capa)) continue;
      const a = proy(t.p[0]), b = proy(t.p[1]), c = proy(t.p[2]);
      if (a[2] <= 0.05 && b[2] <= 0.05 && c[2] <= 0.05) continue;
      const n = punto(t.n, f) > 0 ? ([-t.n[0], -t.n[1], -t.n[2]] as V3) : t.n; // doble cara
      const k = Math.min(1.25, 0.42 + 0.55 * Math.max(0, punto(n, luz)) + 0.28 * Math.max(0, punto(n, luz2)));
      const col = `rgba(${Math.round(Math.min(1, t.c[0] * k) * 255)},${Math.round(Math.min(1, t.c[1] * k) * 255)},${Math.round(Math.min(1, t.c[2] * k) * 255)},${t.a})`;
      items.push({ z: (a[2] + b[2] + c[2]) / 3, dib: () => {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        if (t.a >= 0.9) { ctx.strokeStyle = t.borde ? 'rgba(20,8,5,.35)' : col; ctx.lineWidth = t.borde ? 0.6 : 0.5; ctx.stroke(); }
      } });
    }
    for (const s of segs) {
      if (!vis(s.capa)) continue;
      const a = proy(s.a), b = proy(s.b);
      if (a[2] <= 0.05 || b[2] <= 0.05) continue;
      items.push({ z: Math.min(a[2], b[2]) - 0.02, dib: () => {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = s.color; ctx.globalAlpha = s.opac; ctx.lineWidth = Math.max(1, s.ancho * 0.7); ctx.setLineDash(s.trazos ? [6, 5] : []);
        ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
      } });
    }
    items.sort((x, y) => y.z - x.z);
    ctx.lineJoin = 'round';
    for (const it of items) it.dib();
    // rótulos encima
    const tam = Math.max(10, Math.min(14, Math.min(W, H) / 40)) * (o.rotulos ?? 1);
    ctx.font = `700 ${tam}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of esc.rotulos) {
      if (!vis(t.capa)) continue;
      const p = proy(t.p); if (p[2] <= 0.05) continue;
      const s = t.s, w = ctx.measureText(s).width + 10, h = tam + 6, col = tono(t.color, tema);
      if (t.fondo) {
        ctx.fillStyle = tema === 'oscuro' ? 'rgba(18,24,32,.82)' : 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - h / 2, w, h, 4); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      } else { ctx.lineWidth = 3; ctx.strokeStyle = tema === 'oscuro' ? 'rgba(10,14,20,.85)' : 'rgba(255,255,255,.92)'; ctx.strokeText(s, p[0], p[1]); }
      ctx.fillStyle = col; ctx.fillText(s, p[0], p[1]);
    }
  };

  // interacción
  let pedido = 0, activo = !!o.interactivo, gira = false, vivo = true;
  const pedir = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; if (vivo) dibujar(); }); };
  let arrastre: { x: number; y: number; az: number; el: number } | null = null;
  const abajo = (e: PointerEvent) => { if (!activo) return; arrastre = { x: e.clientX, y: e.clientY, az, el }; canvas.setPointerCapture?.(e.pointerId); };
  const mover = (e: PointerEvent) => {
    if (!arrastre) return;
    az = arrastre.az - (e.clientX - arrastre.x) * 0.008;
    el = Math.max(-1.45, Math.min(1.5, arrastre.el + (e.clientY - arrastre.y) * 0.008));
    pedir();
  };
  const arriba = () => { arrastre = null; };
  const rueda = (e: WheelEvent) => { if (!activo) return; e.preventDefault(); dist = Math.max(esc.radio * 0.4, Math.min(esc.radio * 7, dist * (e.deltaY > 0 ? 1.1 : 0.9))); pedir(); };
  if (o.interactivo) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', abajo); canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', arriba); canvas.addEventListener('pointercancel', arriba);
    canvas.addEventListener('wheel', rueda, { passive: false });
  }
  let rafGiro = 0;
  const bucleGiro = () => { if (!vivo || !gira) return; az += 0.01; dibujar(); rafGiro = requestAnimationFrame(bucleGiro); };
  dibujar();

  return {
    canvas,
    capa: (c, v) => { visibles[c] = v; pedir(); },
    preset: p => { ponerPreset(p); pedir(); },
    girar: si => { gira = si; cancelAnimationFrame(rafGiro); if (si) bucleGiro(); },
    interactivo: si => { activo = si; },
    tamano: (w, h) => { W = w; H = h; pedir(); },
    encuadre: (c, z) => { correr = c; zoom = z; },
    render: dibujar,
    destruir: () => {
      vivo = false; cancelAnimationFrame(pedido); cancelAnimationFrame(rafGiro);
      canvas.removeEventListener('pointerdown', abajo); canvas.removeEventListener('pointermove', mover);
      canvas.removeEventListener('pointerup', arriba); canvas.removeEventListener('pointercancel', arriba); canvas.removeEventListener('wheel', rueda);
    },
  };
}

/** Qué soporta el navegador (para explicar por qué no hay 3D acelerado). */
export function diagnosticoWebGL(): 'webgl2' | 'solo-webgl1' | 'ninguno' {
  try {
    const c = document.createElement('canvas');
    if (c.getContext('webgl2')) return 'webgl2';
    const c1 = document.createElement('canvas');
    return c1.getContext('webgl') || c1.getContext('experimental-webgl') ? 'solo-webgl1' : 'ninguno';
  } catch { return 'ninguno'; }
}

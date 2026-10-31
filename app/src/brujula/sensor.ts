// Brújula con fusión giroscopio + magnetómetro (versión 3 de la Fase 0, aprobada en iPhone y Redmi).
import { camera, circStats, linStats, norm360, plane, rot, top, wrap180, toGrid, type M3 } from './orient';

type Ang = { a: number; b: number; g: number };
export type Modo = 'az' | 'pl';
export interface Muestra { t: number; az?: number; plunge?: number; dip?: number; dd?: number; gm?: number }
export interface Lectura { modo: Modo; az?: number; plunge?: number; dip?: number; dd?: number; sd: number; n: number; interferencia?: number; metodo: string }

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class Brujula {
  modo: Modo = 'az';
  private abs: Ang | null = null; private rel: Ang | null = null;
  private iosHeading: number | null = null; private iosOff: number | null = null; private iosBuf: number[] = [];
  private gyro = false; private rotMag = 0; private off: number | null = null; private outlier = 0;
  private ema: Record<string, number> = {}; private lastT = 0; private ios = esIOS();
  metodo = '';
  private hs: [string, EventListener][] = [];

  async iniciar(): Promise<string | null> {
    this.gyro = this.ios;
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (this.ios && DOE?.requestPermission) {
      try { if ((await DOE.requestPermission()) !== 'granted') return 'Permiso de sensores denegado. En iPhone: Ajustes › Safari › Movimiento y orientación.'; }
      catch (e) { return 'No se pudo pedir permiso: ' + (e as Error).message; }
      const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
      try { await DME?.requestPermission?.(); } catch { /* opcional */ }
    }
    const on = (n: string, f: (e: never) => void) => { window.addEventListener(n, f as EventListener); this.hs.push([n, f as EventListener]); };
    on('deviceorientationabsolute', (e: DeviceOrientationEvent) => { if (e.alpha != null) this.abs = { a: e.alpha, b: e.beta!, g: e.gamma! }; });
    on('deviceorientation', (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (e.alpha == null) return;
      if (e.absolute === true && !this.ios) { this.abs = { a: e.alpha, b: e.beta!, g: e.gamma! }; return; }
      this.rel = { a: e.alpha, b: e.beta!, g: e.gamma! };
      if (this.ios && typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        this.iosHeading = e.webkitCompassHeading;
        if (Math.abs(e.beta!) < 25 && Math.abs(e.gamma!) < 25) {
          this.iosBuf.push(norm360(wrap180(this.iosHeading - top(e.alpha, e.beta!, e.gamma!))));
          if (this.iosBuf.length > 60) this.iosBuf.shift();
          this.iosOff = circStats(this.iosBuf).mean;
        }
      }
    });
    on('devicemotion', (e: DeviceMotionEvent) => {
      const r = e.rotationRate;
      if (r && (r.alpha != null || r.beta != null)) { this.rotMag = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0); this.gyro = true; }
    });
    return null;
  }
  detener() { for (const [n, f] of this.hs) window.removeEventListener(n, f); this.hs = []; }
  get necesitaEcharIOS() { return this.ios && this.iosOff == null; }

  private circEma(k: string, v: number, tau: number, dt: number) {
    const p = this.ema[k]; if (p == null) return (this.ema[k] = v);
    return (this.ema[k] = norm360(p + wrap180(v - p) * Math.min(1, dt / tau)));
  }
  private linEma(k: string, v: number, tau: number, dt: number) {
    const p = this.ema[k]; if (p == null) return (this.ema[k] = v);
    return (this.ema[k] = p + (v - p) * Math.min(1, dt / tau));
  }
  private parRef(Aa: Ang, Ar: Ang) {
    const Ra = rot(Aa.a, Aa.b, Aa.g), Rr = rot(Ar.a, Ar.b, Ar.g);
    const cam = Math.hypot(Rr[0][2], Rr[1][2]) >= Math.hypot(Rr[0][1], Rr[1][1]);
    const j = cam ? 2 : 1, sg = cam ? -1 : 1;
    const h = (R: M3) => norm360(Math.atan2(sg * R[0][j]!, sg * R[1][j]!) * 180 / Math.PI);
    return wrap180(h(Ra) - h(Rr));
  }

  /** Una muestra filtrada (llamar en cada cuadro). Ángulos magnéticos. */
  muestra(): (Muestra & { vista: { az?: number; plunge?: number; dip?: number; dd?: number } }) | null {
    const now = Date.now(); const dt = this.lastT ? Math.min(0.2, (now - this.lastT) / 1000) : 0.016; this.lastT = now;
    let A: Ang | null = null, yaw = 0, gm: number | undefined;
    if (!this.ios && this.abs && this.rel && this.gyro) {
      const raw = this.parRef(this.abs, this.rel); gm = norm360(raw);
      if (this.off == null) this.off = raw;
      else {
        const d = wrap180(raw - this.off);
        if (Math.abs(d) < 20) { const tau = Math.abs(d) > 3 ? 0.35 : this.rotMag < 4 ? 0.5 : 3; this.off = wrap180(this.off + d * Math.min(1, dt / tau)); this.outlier = 0; }
        else { if (!this.outlier) this.outlier = now; if (now - this.outlier > 700) { this.off = raw; this.outlier = 0; } }
      }
      A = this.rel; yaw = this.off; this.metodo = 'android-giro+brujula';
    } else if (!this.ios && this.abs) { A = this.abs; this.metodo = 'android-brujula-filtrada'; }
    else if (this.ios && this.rel && this.iosOff != null) { A = this.rel; yaw = this.iosOff; this.metodo = 'ios-giro+ref'; }
    if (!A) return null;
    const sinGiro = this.metodo === 'android-brujula-filtrada';
    if (this.modo === 'az') {
      const c = camera(A.a, A.b, A.g); let az = norm360(c.az + yaw);
      if (sinGiro) az = this.circEma('azng', az, Math.abs(wrap180(az - (this.ema.azng ?? az))) > 4 ? 0.2 : 0.8, dt);
      return { t: now, az, plunge: c.plunge, gm, vista: { az: this.circEma('vaz', az, 0.12, dt), plunge: this.linEma('vpl', c.plunge, 0.12, dt) } };
    }
    const p = plane(A.a, A.b, A.g); let dd = norm360(p.dipdir + yaw);
    if (sinGiro) dd = this.circEma('ddng', dd, Math.abs(wrap180(dd - (this.ema.ddng ?? dd))) > 4 ? 0.2 : 0.8, dt);
    return { t: now, dip: p.dip, dd, gm, vista: { dip: this.linEma('vdip', p.dip, 0.12, dt), dd: this.circEma('vdd', dd, 0.12, dt) } };
  }
}

/** Promedia una ventana de muestras (3 s) y pasa a cuadrícula UTM. */
export function resumir(ms: Muestra[], modo: Modo, decl: number, conv: number, metodo: string): Lectura {
  const g = ms.filter(m => m.gm != null).map(m => m.gm!);
  const interferencia = g.length ? circStats(g).sd : undefined;
  if (modo === 'az') {
    const c = circStats(ms.map(m => m.az!));
    return { modo, az: toGrid(c.mean, decl, conv), plunge: linStats(ms.map(m => m.plunge!)).mean, sd: c.sd, n: ms.length, interferencia, metodo };
  }
  const d = linStats(ms.map(m => m.dip!)), dd = circStats(ms.map(m => m.dd!));
  return { modo, dip: d.mean, dd: toGrid(dd.mean, decl, conv), sd: Math.max(d.sd, dd.sd), n: ms.length, interferencia, metodo };
}

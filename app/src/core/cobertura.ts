// Cobertura (m de roca sobre la labor) según la rampa y la progresiva, como la hoja "coberturas" del formato VG:
// cobertura = (base + PK − PKinicio) · sen(ángulo), con PK en metros. Antes del PK de inicio la cobertura es 0.
// Los parámetros de cada rampa son datos de la mina: se guardan en el celular (⚙️ Listas), no en el código.
import { pk } from '../ia/autollenado';

export type Rampa = 'Norte' | 'Sur';
export const RAMPAS: Rampa[] = ['Norte', 'Sur'];
export interface ParamCobertura { base: number; pkInicio: number; angulo: number }

export function coberturaEn(pkM: number, p: ParamCobertura): number {
  const k = Math.floor(pkM + 1e-9); // la tabla del Excel va por metro entero (BUSCARV aproximado)
  if (k < p.pkInicio) return 0;
  return (p.base + k - p.pkInicio) * Math.sin((p.angulo * Math.PI) / 180);
}

/** Rampa del reporte: la marcada; si no se marcó nada todavía, la que dice el nombre de la labor ('' = ninguna). */
export const rampaDe = (r: { rampa?: Rampa | ''; labor?: string }): Rampa | '' => (r.rampa !== undefined ? r.rampa : rampaDeLabor(r.labor ?? ''));

/** Cobertura del reporte: PK inicial; si hay PK final, el promedio de ambos (como el formato VG). */
export function cobertura(r: { rampa?: Rampa | ''; labor?: string; desde: string; hasta: string }, tabla?: Partial<Record<Rampa, ParamCobertura>>): { m: number; pk: number } | null {
  const rp = rampaDe(r); if (!rp) return null;
  const p = tabla?.[rp]; if (!p) return null;
  const d = pk(r.desde); if (d == null) return null;
  const h = pk(r.hasta);
  const x = h != null && h > d ? (d + h) / 2 : d;
  return { m: Math.round(coberturaEn(x, p) * 10) / 10, pk: x };
}

/** Rampa que se deduce del nombre de la labor ("Rampa Norte", "RP SUR", "Cámara 3 RN"…). */
export function rampaDeLabor(labor: string): Rampa | '' {
  const t = labor.toLowerCase();
  if (/\bnorte\b|\brn\b/.test(t)) return 'Norte';
  if (/\bsur\b|\brs\b/.test(t)) return 'Sur';
  return '';
}

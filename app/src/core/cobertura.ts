// Cobertura (m de roca sobre la labor) según la rampa y la progresiva, como la hoja "coberturas" del formato VG:
// cobertura = (base + PK − PKinicio) · sen(ángulo), con PK en metros. Antes del PK de inicio la cobertura es 0.
// Parámetros de cada rampa tomados de la hoja "coberturas" de los formatos VG (el usuario pidió el 03-nov que
// vengan integrados en la app). En ⚙️ Listas se pueden corregir; lo escrito ahí manda.
import { pk } from '../ia/autollenado';

export type Rampa = 'Norte' | 'Sur';
export const RAMPAS: Rampa[] = ['Norte', 'Sur'];
export interface ParamCobertura { base: number; pkInicio: number; angulo: number }
export const COBERTURAS_VG: Record<Rampa, ParamCobertura> = {
  Norte: { base: 187.55, pkInicio: 20, angulo: 6.84 },
  Sur: { base: 148.07, pkInicio: 10, angulo: 6.84 },
};

export function coberturaEn(pkM: number, p: ParamCobertura): number {
  const k = Math.floor(pkM + 1e-9); // la tabla del Excel va por metro entero (BUSCARV aproximado)
  if (k < p.pkInicio) return 0;
  return (p.base + k - p.pkInicio) * Math.sin((p.angulo * Math.PI) / 180);
}

/** Rampa del reporte: la marcada; si no se marcó nada todavía, la que dice el nombre de la labor ('' = ninguna). */
export const rampaDe = (r: { rampa?: Rampa | ''; labor?: string }): Rampa | '' => (r.rampa !== undefined ? r.rampa : rampaDeLabor(r.labor ?? ''));

/** Cobertura del reporte: PK inicial; si hay PK final, el promedio de ambos (como el formato VG). */
/** ¿Es cámara? La marcada; si no se marcó, por el nombre de la labor ("Cámara 616", "CMB660SE", "CME-616-SW"). */
export const esCamara = (r: { tipoLabor?: 'RAMPA' | 'CAMARA'; labor?: string }) => r.tipoLabor ? r.tipoLabor === 'CAMARA' : /c[aá]mara|\bcm[a-z]?[-\s]?\d/i.test(r.labor ?? '');

export function cobertura(r: { rampa?: Rampa | ''; labor?: string; desde: string; hasta: string; tipoLabor?: 'RAMPA' | 'CAMARA'; pkRampa?: string }, tabla?: Partial<Record<Rampa, ParamCobertura>>, justa = true): { m: number; pk: number } | null {
  const rp = rampaDe(r); if (!rp) return null;
  const p = justa ? COBERTURAS_VG[rp] : tabla?.[rp]; if (!p) return null; // Justa: tabla integrada; otra mina: la que suba el usuario
  // cámara: su PK propio empieza en 0+00; la cobertura se toma en el PK de la rampa donde nace
  if (esCamara(r)) { const pr = pk(r.pkRampa ?? ''); return pr == null ? null : { m: Math.round(coberturaEn(pr, p) * 10) / 10, pk: pr }; }
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

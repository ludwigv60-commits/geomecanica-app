// Factor de seguridad del SOSTENIMIENTO COMPLETO de la excavación (no solo de las cuñas), por metro de labor.
// Se revisan los dos mecanismos que mandan en una labor de 5 x 5 m:
//  1. Esfuerzos: esfuerzo in situ por la cobertura (σv = γ·z) contra la resistencia del macizo de Hoek-Brown
//     (Hoek, Carranza-Torres y Corkum 2002). Si σcm/p0 es alto no hay deformación por esfuerzos (Hoek y Marinos 2000).
//  2. Gravedad: carga de la zona aflojada sobre la corona, la mayor de Unal (1983) con el RMR
//     (P = γ·B·(100 − RMR)/100) y Barton (1974) con Q y Jr (P = 2·Jr⁻¹·Q^(−1/3) kg/cm²).
// Capacidad del sostenimiento (Hoek y Brown 1980, Carranza-Torres): shotcrete como anillo delgado
// p = σcc/2·[1 − ((ri − t)/ri)²] y pernos p = T/(eT·eL).
// FS global = capacidad / carga. Todo es una PROPUESTA referencial: los valores supuestos se indican.
import type { Reporte } from '../model';
import { calcular } from '../calc';
import { cobertura } from '../core/cobertura';
import type { Analisis } from './cunas2d';

const GAMMA = 0.027;   // MN/m³ (2.7 t/m³)
const SCC = 25;        // MPa, shotcrete a 28 días (referencial; a pocas horas es mucho menor)
const UCS: Record<number, number> = { 15: 250, 12: 150, 7: 75, 4: 37, 2: 15, 1: 3, 0: 1 }; // MPa, centro de la clase RMR
const mi = (lito: string) => /andesit|diorit|basalt/i.test(lito) ? 25 : /piroclast|tob|toba|brech/i.test(lito) ? 15 : /granit|granodior/i.test(lito) ? 32 : /arenisc/i.test(lito) ? 17 : 20;

export interface Global {
  cobertura: number | null; p0: number | null; ucs: number; gsi: number; mi: number; scm: number; deformacion: number | null;
  carga: number; cargaFuente: string; capShot: number; capPernos: number; capacidad: number; fs: number; nota: string;
}

export function sostenimientoGlobal(r: Reporte, a: Analisis): Global | null {
  if (!r.ancho || !r.alto) return null;
  const c = calcular(r), z = c.zonas.CORONA, rm = r.rmr.CORONA;
  const rmr = c.rmrFinal ?? z.total; if (rmr == null || z.basico == null) return null;
  const ucs = UCS[rm.ucs ?? 7] ?? 75;
  // GSI = RMR89 en seco (agua = 15) − 5 (Hoek 1995); más fiable que desde Q' cuando el RQD sale alto
  const gsi = Math.max(10, Math.min(100, z.basico - (rm.agua ?? 15) + 15 - 5)), m = mi(r.litologia.CORONA ?? ''), D = 0.5; // voladura regular
  const mb = m * Math.exp((gsi - 100) / (28 - 14 * D)), s = Math.exp((gsi - 100) / (9 - 3 * D)), av = 0.5 + (Math.exp(-gsi / 15) - Math.exp(-20 / 3)) / 6;
  const scm = ucs * (mb + 4 * s - av * (mb - 8 * s)) * Math.pow(mb / 4 + s, av - 1) / (2 * (1 + av) * (2 + av));
  const cob = cobertura(r)?.m ?? null, p0 = cob != null ? GAMMA * cob : null;
  const deformacion = p0 ? 0.2 * Math.pow(scm / p0, -2) : null; // % de deformación sin sostener
  const B = r.ancho, unal = GAMMA * B * (100 - rmr) / 100;
  const q = z.q, jr = r.q.CORONA.jr, barton = q && jr ? (2 / jr) * Math.pow(q, -1 / 3) * 0.0981 : 0;
  const carga = Math.max(unal, barton), cargaFuente = barton > unal ? `Barton (Q ${q}, Jr ${jr})` : `Unal (RMR ${rmr})`;
  const ri = B / 2, t = a.shot, capShot = t > 0 ? (SCC / 2) * (1 - Math.pow((ri - t) / ri, 2)) : 0;
  const capPernos = a.perno ? (a.perno.cap * 0.00981) / (a.perno.esp * a.perno.esp) : 0;
  const capacidad = capShot + capPernos, fs = carga > 0 ? capacidad / carga : 0;
  const nota = deformacion == null ? 'sin cobertura: no se revisan esfuerzos'
    : deformacion < 1 ? `resistencia/esfuerzo = ${(scm / p0!).toFixed(1)}: sin deformación por esfuerzos (deformación ${deformacion < 0.01 ? '<0.01' : deformacion.toFixed(2)} %), manda la gravedad`
      : `resistencia/esfuerzo = ${(scm / p0!).toFixed(1)}: deformación ${deformacion.toFixed(1)} %, revisar convergencia`;
  return { cobertura: cob, p0, ucs, gsi, mi: m, scm, deformacion, carga, cargaFuente, capShot, capPernos, capacidad, fs, nota };
}

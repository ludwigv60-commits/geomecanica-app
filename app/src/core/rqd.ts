// Jv y RQD (Palmström).

export interface Familia { espaciamiento_m: number }

/** Jv = Σ(1/espaciamiento de cada familia) + fracturas aleatorias / 5. */
export function jv(familias: Familia[], aleatoriasPorM3 = 0): number {
  const s = familias.filter(f => f.espaciamiento_m > 0).reduce((a, f) => a + 1 / f.espaciamiento_m, 0);
  return s + aleatoriasPorM3 / 5;
}

export type FormulaRqd = 'palmstrom1982' | 'palmstrom2005';

/**
 * RQD a partir de Jv.
 * Palmström (1982): RQD = 115 − 3.3·Jv (la del formato; RQD = 100 si Jv < 4.5).
 * Palmström (2005): RQD = 110 − 2.5·Jv (opcional).
 * El resultado se limita a 0–100 y se redondea a 1 decimal, como en los reportes.
 */
export function rqdDesdeJv(jvValor: number, formula: FormulaRqd = 'palmstrom1982'): number {
  let r: number;
  if (formula === 'palmstrom1982') r = jvValor < 4.5 ? 100 : 115 - 3.3 * jvValor;
  else r = jvValor < 4 ? 100 : 110 - 2.5 * jvValor;
  r = Math.max(0, Math.min(100, r));
  return Math.round(r * 10) / 10;
}

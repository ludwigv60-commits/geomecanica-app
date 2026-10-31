// Sostenimiento según las tablas de Systra (JU-002-05-00845-S400-20-25-0002 Rev2) y la tabla de
// intersecciones, más la forma de escribirlo que usa Geomecánica AESA en el formato.
// Todo lo que sale de aquí es una PROPUESTA: el ingeniero la edita y firma.

import type { TipoRoca } from './rmr';

// ---------- Unidades (el formato se llena en pulgadas y pies) ----------
/** cm → pulgadas nominales: 2.5→1", 5→2", 10→4", 15→6". */
export const cmAPulg = (cm: number) => Math.round(cm / 2.54 * 2) / 2;
/** m → pies nominales: 1.5→5', 2.1→7', 3.0→10'. */
export const mAPies = (m: number) => Math.round(m / 0.3048);
export const pulgTxt = (p: number) => (p === 0.5 ? '1/2' : String(p)) + '"';

// ---------- Tabla Systra, sección típica 5.0 x 5.0 ----------
export interface FilaSystra {
  tipo: TipoRoca | 'V-A' | 'V-B';
  pernosPorFila: number | null;
  espaciamiento: [number, number] | null; // eT x eL (m)
  shotcreteCm: number[];                  // capas en orden de colocación
  marcos: string | null;
  avanceMax: number;                      // m
}
export const PERNO_SYSTRA = { tipo: 'Helicoidal' as const, diametroMm: 22, longitudM: 2.1 };
export const SYSTRA_5x5: FilaSystra[] = [
  { tipo: 'I/II', pernosPorFila: 6, espaciamiento: [2.0, 2.0], shotcreteCm: [], marcos: null, avanceMax: 5.0 },
  { tipo: 'III-A', pernosPorFila: 6, espaciamiento: [1.6, 1.6], shotcreteCm: [5], marcos: null, avanceMax: 4.0 },
  { tipo: 'III-B', pernosPorFila: 8, espaciamiento: [1.5, 1.5], shotcreteCm: [5], marcos: null, avanceMax: 3.4 },
  { tipo: 'IV', pernosPorFila: 11, espaciamiento: [1.2, 1.2], shotcreteCm: [5, 10], marcos: null, avanceMax: 1.8 },
  { tipo: 'V-A', pernosPorFila: null, espaciamiento: null, shotcreteCm: [10, 15], marcos: 'Marcos reticulados @ 1.0 m', avanceMax: 1.0 },
  { tipo: 'V-B', pernosPorFila: null, espaciamiento: null, shotcreteCm: [10, 15, 10], marcos: 'Marcos reticulados @ 1.0 m', avanceMax: 1.0 },
];

// ---------- Tabla de intersecciones ----------
export type Componente = 'Cámara de carguío' | 'Ensanche vehicular' | 'Intersección tipo cruz';
export type Cobertura = '<=350' | '350-570';
export type SeccionInt = 'ST-I' | 'ST-II';
export interface FilaInterseccion {
  componente: Componente; cobertura: Cobertura; seccion: SeccionInt;
  shotcreteCm: number; malla: boolean;
  pernos: { esp: [number, number]; longitudM: number };
  cables: { esp: [number, number]; longitudM: number };
  avanceMax: number;
}
const F = (componente: Componente, cobertura: Cobertura, seccion: SeccionInt, shotcreteCm: number, malla: boolean,
  pe: [number, number], ce: [number, number], cl: number): FilaInterseccion =>
  ({ componente, cobertura, seccion, shotcreteCm, malla, pernos: { esp: pe, longitudM: 3.0 }, cables: { esp: ce, longitudM: cl }, avanceMax: 3.4 });

export const INTERSECCIONES: FilaInterseccion[] = [
  F('Cámara de carguío', '<=350', 'ST-I', 10, false, [2.5, 2.5], [3.0, 3.0], 7),
  F('Cámara de carguío', '<=350', 'ST-II', 25, false, [1.5, 2.0], [2.5, 2.5], 7),
  F('Cámara de carguío', '350-570', 'ST-I', 15, true, [2.0, 2.0], [2.5, 2.5], 10),
  F('Cámara de carguío', '350-570', 'ST-II', 25, true, [1.0, 2.0], [2.0, 2.0], 10),
  ...(['Ensanche vehicular', 'Intersección tipo cruz'] as Componente[]).flatMap(c => [
    F(c, '<=350', 'ST-I', 15, false, [2.5, 2.5], [3.0, 3.0], 7),
    F(c, '<=350', 'ST-II', 25, false, [1.5, 2.0], [2.5, 2.5], 7),
    F(c, '350-570', 'ST-I', 15, true, [2.0, 2.0], [2.5, 2.5], 10),
    F(c, '350-570', 'ST-II', 25, true, [1.0, 2.0], [2.0, 2.0], 10),
  ]),
];
/** Nota de la tabla: en la H de comunicación (esquema de avance 5) el avance por ciclo es 1.8 m. */
export const AVANCE_H_COMUNICACION = 1.8;

/**
 * Sección de intersección según RMR. La tabla dice "mayor a 57" (ST-I) y "45-56" (ST-II);
 * RMR = 57 se trata como ST-I por coincidir con el límite inferior de III-A. RMR < 45 no tiene fila:
 * se devuelve null con alerta para que el ingeniero decida.
 */
export function seccionInterseccion(rmr: number): { seccion: SeccionInt | null; alerta: string | null } {
  const r = Math.round(rmr);
  if (r >= 57) return { seccion: 'ST-I', alerta: r === 57 ? 'RMR = 57 está en el límite de la tabla ("mayor a 57"); se propone ST-I.' : null };
  if (r >= 45) return { seccion: 'ST-II', alerta: null };
  return { seccion: null, alerta: `RMR ${r} < 45: la tabla de intersecciones no tiene fila. Defina el sostenimiento manualmente.` };
}

export function filaInterseccion(c: Componente, cob: Cobertura, rmr: number) {
  const s = seccionInterseccion(rmr);
  return { ...s, fila: s.seccion ? INTERSECCIONES.find(f => f.componente === c && f.cobertura === cob && f.seccion === s.seccion) ?? null : null };
}

// ---------- Tresbolillo ----------
/** Pernos por fila alternados: n y n−1 (ej. 8 → "7x8", 11 → "11x10" según cómo lo escriba el usuario). */
export function tresbolillo(n: number, orden: 'menorPrimero' | 'mayorPrimero' = 'menorPrimero'): string {
  return orden === 'menorPrimero' ? `${n - 1}x${n}` : `${n}x${n - 1}`;
}
/** Número de filas para un avance dado: ceil(avance / eL). Editable en la app. */
export function filasParaAvance(avanceM: number, eL: number): number {
  return Math.max(1, Math.ceil(Number((avanceM / eL).toPrecision(12))));
}

// ---------- Propuesta para una labor de línea ----------
export interface Propuesta {
  tipoPerno: 'Helicoidal' | 'Split Set' | 'Cable Bolting';
  longitudPies: number | null;
  espaciamiento: [number, number] | null;
  pernosPorFila: number | null;
  filas: number | null;
  shotcreteCm: number[];
  sacrificioPulg: number | null;   // capa de sacrificio (1" a altura de gradiente)
  malla: boolean;
  marcos: string | null;
  lineas: string[];                // texto para "Indicaciones de sostenimiento"
  casillas: Casillas;              // lo que se marca en la leyenda del formato
}

export interface Casillas {
  st: TipoRoca;
  perno: 'HELICOIDAL' | 'SPLIT SET' | 'CABLE BOLTING' | null;
  longitud: '5 PIES' | '7 PIES' | '10 PIES' | { otro: string } | null;
  shotcrete: '5 cm' | '15 cm' | '20 cm' | '25 cm' | { otro: string } | null;
  sacrificio: 'SHOTCRETE 1/2"' | 'SHOTCRETE 1"' | 'SHOTCRETE 2"' | null;
  malla: boolean;
}

const espTxt = (e: [number, number]) => `${e[0].toFixed(2)}x${e[1].toFixed(2)}`;

export function casillaShotcrete(totalCm: number): Casillas['shotcrete'] {
  if (totalCm <= 0) return null;
  const v = ['5 cm', '15 cm', '20 cm', '25 cm'] as const;
  const hit = v.find(x => parseFloat(x) === totalCm);
  return hit ?? { otro: `${totalCm} cm` };
}
export function casillaLongitud(pies: number): Casillas['longitud'] {
  if (pies === 5) return '5 PIES';
  if (pies === 7) return '7 PIES';
  if (pies === 10) return '10 PIES';
  return { otro: `${pies}'` };
}

/** Propuesta de sostenimiento para labor de línea según tipo de roca (Systra 5x5) y la práctica observada. */
export function proponer(tipo: TipoRoca, avanceM: number | null, opts: { sacrificioPulg?: number | null; ordenFilas?: 'menorPrimero' | 'mayorPrimero' } = {}): Propuesta {
  const fila = SYSTRA_5x5.find(f => f.tipo === tipo) ?? SYSTRA_5x5.find(f => f.tipo === 'V-A')!;
  const sac = opts.sacrificioPulg === undefined ? 1 : opts.sacrificioPulg;
  const lineas: string[] = [];
  const [capa1, ...resto] = fila.shotcreteCm;
  if (capa1) lineas.push(`Shotcrete ${pulgTxt(cmAPulg(capa1))} en sección completa.`);
  if (sac) lineas.push(`Shotcrete ${pulgTxt(sac)} en sacrificio a altura de gradiente.`);
  const pies = fila.pernosPorFila ? mAPies(PERNO_SYSTRA.longitudM) : null;
  if (fila.pernosPorFila && fila.espaciamiento) {
    lineas.push(`Pernos helicoidales de ${pies}' E=${espTxt(fila.espaciamiento)} Filas = ${tresbolillo(fila.pernosPorFila, opts.ordenFilas)}.`);
  }
  for (const c of resto) lineas.push(`Shotcrete ${pulgTxt(cmAPulg(c))} sobre pernos.`);
  if (fila.marcos) lineas.push(`${fila.marcos}.`);
  const total = fila.shotcreteCm.reduce((a, b) => a + b, 0);
  return {
    tipoPerno: 'Helicoidal',
    longitudPies: pies,
    espaciamiento: fila.espaciamiento,
    pernosPorFila: fila.pernosPorFila,
    filas: fila.espaciamiento && avanceM ? filasParaAvance(avanceM, fila.espaciamiento[1]) : null,
    shotcreteCm: fila.shotcreteCm,
    sacrificioPulg: sac ?? null,
    malla: false,
    marcos: fila.marcos,
    lineas,
    casillas: {
      st: tipo,
      perno: fila.pernosPorFila ? 'HELICOIDAL' : null,
      longitud: pies ? casillaLongitud(pies) : null,
      shotcrete: casillaShotcrete(total),
      sacrificio: sac === 0.5 ? 'SHOTCRETE 1/2"' : sac === 1 ? 'SHOTCRETE 1"' : sac === 2 ? 'SHOTCRETE 2"' : null,
      malla: false,
    },
  };
}

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
  seccion: SeccionTipo;            // sección tipo usada
  seccionOtra: boolean;            // true: la sección del reporte no está en la lista y se usó la más parecida
  avanceMax: number | null;
  alertas: string[];
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

// ---------- Secciones tipo (planos de sostenimiento "Rampa y desarrollo" y tabla 1 de la especificación) ----------
// Cada sección trae su patrón por tipo de roca. Lo que el plano no define para un tipo de roca se toma de la
// sección 5x5 con alerta (ej. ST-V solo está desarrollado en la 5x5).
export interface PatronSeccion {
  pernos: number | null;             // pernos por fila (null = sin pernos sistemáticos)
  esp: [number, number] | null;      // eT x eL (m)
  longitudM: number;                 // longitud del perno (m)
  shotcreteCm: number[];
  malla: boolean;
  marcos?: string | null;
  avanceMax?: number | null;
}
export interface SeccionTipo {
  id: string;
  nombre: string;                    // lo que se ve en el desplegable
  uso: string;
  ancho: number; alto: number;
  cables?: { longitudM: number; esp: [number, number]; nota: string };
  nota?: string;
  // por tipo de roca; para los ensanches de 9 m el plano distingue solo ST-I (RMR 57–100) y ST-II (RMR 0–56)
  filas: Partial<Record<TipoRoca, PatronSeccion>>;
}

const P = (pernos: number | null, e: number | null, longitudM: number, shotcreteCm: number[], malla = false, extra: Partial<PatronSeccion> = {}): PatronSeccion =>
  ({ pernos, esp: e ? [e, e] : null, longitudM, shotcreteCm, malla, ...extra });
const desde5x5 = (t: FilaSystra): PatronSeccion => ({
  pernos: t.pernosPorFila, esp: t.espaciamiento, longitudM: PERNO_SYSTRA.longitudM, shotcreteCm: t.shotcreteCm,
  malla: t.tipo === 'I/II', marcos: t.marcos, avanceMax: t.avanceMax,
});
const f5 = (t: FilaSystra['tipo']) => desde5x5(SYSTRA_5x5.find(f => f.tipo === t)!);
const CABLES_9 = { longitudM: 10, esp: [2.4, 2.4] as [number, number], nota: 'cables birdcage doble Ø15.2 mm, de empleo ocasional según el terreno (se instalan en el pre-minado)' };
const ENSANCHE_I = P(11, 1.6, 3.0, [5]);
const ENSANCHE_II = P(19, 1.0, 3.0, [10, 15], true, { avanceMax: 1.0 });

export const SECCION_DEFECTO = '5x5';
export const SECCIONES: SeccionTipo[] = [
  { id: '5x5', nombre: '5.0 × 5.0 · Rampa, accesos, cámaras (estándar)', uso: 'Rampa, accesos, cámara de acumulación, carguío, bombeo y ventilación', ancho: 5, alto: 5,
    filas: { 'I/II': f5('I/II'), 'III-A': f5('III-A'), 'III-B': f5('III-B'), 'IV': f5('IV'), 'V': f5('V-A') } },
  { id: '5x4.5', nombre: '5.0 × 4.5 · Subniveles, ventanas, ventilación', uso: 'Ventilación, subniveles, ventanas, talleres', ancho: 5, alto: 4.5,
    filas: { 'I/II': P(6, 2.0, 2.1, [], true), 'III-A': P(6, 1.6, 2.1, [5]), 'III-B': P(8, 1.5, 2.1, [5]), 'IV': P(9, 1.2, 2.1, [5, 10]) } },
  { id: '4.5x4', nombre: '4.5 × 4.0 · Cámara de backfill / ventilación', uso: 'Cámaras de backfill y de ventilación', ancho: 4.5, alto: 4,
    filas: { 'I/II': P(4, 2.0, 2.1, [], true), 'III-A': P(6, 1.6, 2.1, [5]), 'III-B': P(6, 1.5, 2.1, [5]), 'IV': P(9, 1.2, 2.1, [5, 10]) } },
  { id: '6x4', nombre: '6.0 × 4.0 · Polvorín', uso: 'Polvorín', ancho: 6, alto: 4,
    filas: { 'I/II': P(6, 2.0, 2.1, [], true), 'III-A': P(6, 1.6, 2.1, [5]), 'III-B': P(8, 1.5, 2.1, [5]), 'IV': P(9, 1.2, 2.1, [5, 10]) } },
  { id: '6x5', nombre: '6.0 × 5.0 · Subestación eléctrica', uso: 'Cámara de subestación eléctrica móvil', ancho: 6, alto: 5,
    filas: { 'I/II': P(6, 2.0, 3.0, [], true), 'III-A': P(8, 1.6, 3.0, [5]), 'III-B': P(8, 1.5, 3.0, [5]), 'IV': P(11, 1.2, 3.0, [5, 10]) } },
  { id: '6x6', nombre: '6.0 × 6.0 · Talleres', uso: 'Taller mecánico', ancho: 6, alto: 6,
    filas: { 'I/II': P(8, 2.0, 3.0, [], true), 'III-A': P(10, 1.6, 3.0, [5]), 'III-B': P(10, 1.5, 3.0, [5]), 'IV': P(13, 1.2, 3.0, [5, 10]) } },
  { id: '7.1x6.5', nombre: '7.1 × 6.5 · Cámara de raise boring / ventilación', uso: 'Cámara de raise boring y de ventilación', ancho: 7.1, alto: 6.5,
    cables: { longitudM: 10, esp: [2.4, 2.4], nota: 'cables birdcage doble Ø15.2 mm (se instalan en el pre-minado)' },
    filas: { 'I/II': P(8, 2.0, 2.1, [], true), 'III-A': P(10, 1.6, 2.1, [5]), 'III-B': P(12, 1.5, 2.1, [5]), 'IV': P(15, 1.2, 2.1, [5, 10]) } },
  { id: '7.1x7.1', nombre: '7.1 × 7.1 · Cámara de raise boring (alta)', uso: 'Cámara de raise boring', ancho: 7.1, alto: 7.1,
    cables: { longitudM: 10, esp: [2.4, 2.4], nota: 'cables birdcage doble Ø15.2 mm (se instalan en el pre-minado)' },
    nota: 'El plano distingue ST-I (RMR 57–100) y ST-II (RMR 0–56).',
    filas: { 'I/II': P(11, 1.6, 2.1, [5]), 'III-A': P(11, 1.6, 2.1, [5]), 'III-B': P(19, 1.0, 3.0, [10, 15], true), 'IV': P(19, 1.0, 3.0, [10, 15], true), 'V': P(19, 1.0, 3.0, [10, 15], true) } },
  { id: '9x5', nombre: '9.0 × 5.0 · Ensanche vehicular', uso: 'Ensanche vehicular (bahía de 9 m)', ancho: 9, alto: 5, cables: CABLES_9,
    nota: 'El plano distingue ST-I (RMR 57–100) y ST-II (RMR 0–56).',
    filas: { 'I/II': ENSANCHE_I, 'III-A': ENSANCHE_I, 'III-B': ENSANCHE_II, 'IV': ENSANCHE_II, 'V': ENSANCHE_II } },
  { id: '9x6.5', nombre: '9.0 × 6.5 · Ensanche de carguío', uso: 'Cámara / ensanche de carguío (5 m de rampa + 4 m de ensanche)', ancho: 9, alto: 6.5, cables: CABLES_9,
    nota: 'El plano distingue ST-I (RMR 57–100) y ST-II (RMR 0–56). Las cámaras de carguío solo van en roca I, II, III-A y III-B; en IV o V se espacian a 20 m entre ejes.',
    filas: { 'I/II': ENSANCHE_I, 'III-A': ENSANCHE_I, 'III-B': ENSANCHE_II, 'IV': ENSANCHE_II, 'V': ENSANCHE_II } },
  { id: '2x2', nombre: '2.0 × 2.0 · Refugio peatonal', uso: 'Refugio peatonal', ancho: 2, alto: 2,
    nota: 'El plano solo desarrolla el refugio en III-A; se usa ese patrón para cualquier roca.',
    filas: { 'I/II': P(3, 1.6, 1.5, [5]), 'III-A': P(3, 1.6, 1.5, [5]), 'III-B': P(3, 1.6, 1.5, [5]), 'IV': P(3, 1.6, 1.5, [5]), 'V': P(3, 1.6, 1.5, [5]) } },
];
export const SECCION_OTRA = 'otra';

export const seccionPorId = (id?: string | null) => SECCIONES.find(s => s.id === (id || SECCION_DEFECTO)) ?? null;

/** Para una sección que no está en la lista (ancho x alto escrito a mano): la sección tipo de luz (ancho) más parecida. */
export function seccionParecida(ancho: number | null, alto: number | null): SeccionTipo {
  if (!ancho) return seccionPorId(SECCION_DEFECTO)!;
  const cand = SECCIONES.filter(s => s.id !== '2x2' || ancho <= 3);
  return cand.reduce((m, s) => {
    const d = Math.abs(s.ancho - ancho) * 2 + Math.abs(s.alto - (alto ?? s.alto)), dm = Math.abs(m.ancho - ancho) * 2 + Math.abs(m.alto - (alto ?? m.alto));
    // a igual distancia se prefiere la sección más ancha (lado seguro)
    return d < dm - 1e-9 || (Math.abs(d - dm) < 1e-9 && s.ancho > m.ancho) ? s : m;
  });
}

/** Sección que manda en el reporte: la elegida; "otra" → la más parecida por ancho y alto. */
export function seccionDe(r: { tipoSeccion?: string; ancho?: number | null; alto?: number | null }): { sec: SeccionTipo; otra: boolean } {
  if (r.tipoSeccion === SECCION_OTRA) return { sec: seccionParecida(r.ancho ?? null, r.alto ?? null), otra: true };
  if (!r.tipoSeccion && r.ancho && r.alto) { // reportes de antes del campo: se deduce de ancho x alto (±0.5 m)
    const s = SECCIONES.find(x => Math.abs(x.ancho - r.ancho!) <= 0.5 && Math.abs(x.alto - r.alto!) <= 0.5);
    return s ? { sec: s, otra: false } : { sec: seccionParecida(r.ancho, r.alto), otra: true };
  }
  return { sec: seccionPorId(r.tipoSeccion) ?? seccionPorId(SECCION_DEFECTO)!, otra: false };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
export const rotuloSeccion = (s: { ancho: number; alto: number }) => `${fmt(s.ancho)}×${fmt(s.alto)}`;

/** Patrón de la sección para un tipo de roca (o el de la 5x5 si el plano no lo define, con alerta). */
export function patronSeccion(sec: SeccionTipo, tipo: TipoRoca): { patron: PatronSeccion; alerta: string | null } {
  const p = sec.filas[tipo];
  if (p) return { patron: p, alerta: null };
  return { patron: seccionPorId(SECCION_DEFECTO)!.filas[tipo] ?? f5('V-A'), alerta: `El plano de la sección ${rotuloSeccion(sec)} no desarrolla roca ${tipo}; se propone el patrón de la sección 5×5. Verifíquelo.` };
}

/** Propuesta de sostenimiento según tipo de roca y sección tipo (por defecto 5x5), con la forma de escribir de AESA. */
export function proponer(tipo: TipoRoca, avanceM: number | null, opts: { sacrificioPulg?: number | null; ordenFilas?: 'menorPrimero' | 'mayorPrimero'; tipoSeccion?: string; ancho?: number | null; alto?: number | null } = {}): Propuesta {
  const { sec, otra } = seccionDe({ tipoSeccion: opts.tipoSeccion, ancho: opts.ancho, alto: opts.alto });
  const { patron: fila, alerta } = patronSeccion(sec, tipo);
  const alertas: string[] = [];
  if (otra) alertas.push(`Sección ${opts.ancho && opts.alto ? rotuloSeccion({ ancho: opts.ancho, alto: opts.alto }) : 'sin medidas'} no está en los planos: se propone el patrón de la sección tipo más parecida, ${sec.nombre}. Confirme con el plano de diseño.`);
  if (alerta) alertas.push(alerta);
  if (sec.id === '9x6.5' && (tipo === 'IV' || tipo === 'V')) alertas.push('Cámara de carguío en roca IV o V: el plano indica espaciarlas a 20 m entre ejes.');
  const sac = opts.sacrificioPulg === undefined ? 1 : opts.sacrificioPulg;
  const lineas: string[] = [];
  const [capa1, ...resto] = fila.shotcreteCm;
  if (capa1) lineas.push(`Shotcrete ${pulgTxt(cmAPulg(capa1))} en sección completa.`);
  if (sac) lineas.push(`Shotcrete ${pulgTxt(sac)} en sacrificio a altura de gradiente.`);
  const pies = fila.pernos ? mAPies(fila.longitudM) : null;
  if (fila.pernos && fila.esp) {
    lineas.push(`Pernos helicoidales de ${pies}' E=${espTxt(fila.esp)} Filas = ${tresbolillo(fila.pernos, opts.ordenFilas)}.`);
  }
  for (const c of resto) lineas.push(`Shotcrete ${pulgTxt(cmAPulg(c))} sobre pernos.`);
  if (fila.malla) lineas.push('Malla electrosoldada 4.2x100x100 mm en bóveda y hastiales.');
  if (fila.marcos) lineas.push(`${fila.marcos}.`);
  if (sec.cables) lineas.push(`Cable bolting L=${fmt(sec.cables.longitudM)} m E=${espTxt(sec.cables.esp)} (${sec.cables.nota}).`);
  const total = fila.shotcreteCm.reduce((a, b) => a + b, 0);
  return {
    tipoPerno: 'Helicoidal',
    longitudPies: pies,
    espaciamiento: fila.esp,
    pernosPorFila: fila.pernos,
    filas: fila.esp && avanceM ? filasParaAvance(avanceM, fila.esp[1]) : null,
    shotcreteCm: fila.shotcreteCm,
    sacrificioPulg: sac ?? null,
    malla: fila.malla,
    marcos: fila.marcos ?? null,
    lineas,
    seccion: sec, seccionOtra: otra, avanceMax: fila.avanceMax ?? null, alertas,
    casillas: {
      st: tipo,
      perno: fila.pernos ? 'HELICOIDAL' : null,
      longitud: pies ? casillaLongitud(pies) : null,
      shotcrete: casillaShotcrete(total),
      sacrificio: sac === 0.5 ? 'SHOTCRETE 1/2"' : sac === 1 ? 'SHOTCRETE 1"' : sac === 2 ? 'SHOTCRETE 2"' : null,
      malla: fila.malla,
    },
  };
}

// RMR89 (Bieniawski) tal como está impreso en el formato PRT-JS-CLD-16.
// Cada parámetro tiene sus clases en el mismo orden y con los mismos puntajes del formato.

export type Zona = 'HI' | 'CORONA' | 'HD';
export const ZONAS: Zona[] = ['HI', 'CORONA', 'HD'];
export const NOMBRE_ZONA: Record<Zona, string> = { HI: 'H. I.', CORONA: 'Corona', HD: 'H. D.' };

export interface Clase { etiqueta: string; puntaje: number }
export interface Parametro { id: ParamId; nombre: string; clases: Clase[] }

export type ParamId =
  | 'ucs' | 'rqd' | 'espaciamiento' | 'persistencia' | 'abertura'
  | 'rugosidad' | 'relleno' | 'alteracion' | 'agua';

export const PARAMETROS: Parametro[] = [
  { id: 'ucs', nombre: 'Resistencia a la compresión uniaxial (MPa)', clases: [
    { etiqueta: 'R6 · > 250 MPa', puntaje: 15 }, { etiqueta: 'R5 · 100 - 250 MPa', puntaje: 12 },
    { etiqueta: 'R4 · 50 - 100 MPa', puntaje: 7 }, { etiqueta: 'R3 · 25 - 50 MPa', puntaje: 4 },
    { etiqueta: 'R2 · 5 - 25 MPa', puntaje: 2 }, { etiqueta: 'R1 · 1 - 5 MPa', puntaje: 1 } ] },
  { id: 'rqd', nombre: 'RQD', clases: [
    { etiqueta: '90 - 100 %', puntaje: 20 }, { etiqueta: '75 - 90 %', puntaje: 17 },
    { etiqueta: '50 - 75 %', puntaje: 13 }, { etiqueta: '25 - 50 %', puntaje: 8 }, { etiqueta: '< 25 %', puntaje: 3 } ] },
  { id: 'espaciamiento', nombre: 'Espaciamiento de discontinuidades (m)', clases: [
    { etiqueta: '> 2 m', puntaje: 20 }, { etiqueta: '0.6 - 2 m', puntaje: 15 },
    { etiqueta: '0.2 - 0.6 m', puntaje: 10 }, { etiqueta: '0.06 - 0.2 m', puntaje: 8 }, { etiqueta: '< 0.06 m', puntaje: 5 } ] },
  { id: 'persistencia', nombre: 'Persistencia', clases: [
    { etiqueta: '< 1 m', puntaje: 6 }, { etiqueta: '1 - 3 m', puntaje: 4 },
    { etiqueta: '3 - 10 m', puntaje: 2 }, { etiqueta: '10 - 20 m', puntaje: 1 }, { etiqueta: '> 20 m', puntaje: 0 } ] },
  { id: 'abertura', nombre: 'Abertura', clases: [
    { etiqueta: 'Cerrada', puntaje: 6 }, { etiqueta: '< 0.1 mm', puntaje: 5 },
    { etiqueta: '0.1 - 1 mm', puntaje: 4 }, { etiqueta: '1 - 5 mm', puntaje: 1 }, { etiqueta: '> 5 mm', puntaje: 0 } ] },
  { id: 'rugosidad', nombre: 'Rugosidad', clases: [
    { etiqueta: 'Muy rugosa', puntaje: 6 }, { etiqueta: 'Rugosa', puntaje: 5 },
    { etiqueta: 'Lig. rugosa', puntaje: 3 }, { etiqueta: 'Lisa', puntaje: 1 }, { etiqueta: 'Espejo de falla', puntaje: 0 } ] },
  { id: 'relleno', nombre: 'Relleno', clases: [
    { etiqueta: 'Limpia', puntaje: 6 }, { etiqueta: 'Duro < 5 mm', puntaje: 4 },
    { etiqueta: 'Duro > 5 mm', puntaje: 2 }, { etiqueta: 'Suave < 5 mm', puntaje: 1 }, { etiqueta: 'Suave > 5 mm', puntaje: 0 } ] },
  { id: 'alteracion', nombre: 'Alteración', clases: [
    { etiqueta: 'Sana', puntaje: 6 }, { etiqueta: 'Ligera intemp.', puntaje: 5 },
    { etiqueta: 'Moderada intemp.', puntaje: 3 }, { etiqueta: 'Muy intemperizada', puntaje: 1 }, { etiqueta: 'Descompuesta', puntaje: 0 } ] },
  { id: 'agua', nombre: 'Agua subterránea', clases: [
    { etiqueta: 'Seco', puntaje: 15 }, { etiqueta: 'Húmedo', puntaje: 10 },
    { etiqueta: 'Mojado', puntaje: 7 }, { etiqueta: 'Goteo', puntaje: 4 }, { etiqueta: 'Flujo', puntaje: 0 } ] },
];

export const AJUSTES_ORIENTACION: Clase[] = [
  { etiqueta: 'Muy favorable', puntaje: 0 }, { etiqueta: 'Favorable', puntaje: -2 },
  { etiqueta: 'Regular', puntaje: -5 }, { etiqueta: 'Desfavorable', puntaje: -10 },
  { etiqueta: 'Muy desfavorable', puntaje: -12 },
];

/** Puntajes elegidos para una zona. `undefined` = todavía no llenado. */
export type PuntajesZona = Partial<Record<ParamId, number>>;

export function rmrBasico(p: PuntajesZona): number | null {
  const vals = PARAMETROS.map(par => p[par.id]);
  if (vals.some(v => v == null)) return null;
  return (vals as number[]).reduce((a, b) => a + b, 0);
}

export function rmrTotal(p: PuntajesZona, ajuste: number | null | undefined): number | null {
  const b = rmrBasico(p);
  if (b == null) return null;
  return b + (ajuste ?? 0);
}

/** Puntaje RMR del parámetro RQD a partir del valor de RQD (%). */
export function puntajeRqd(rqd: number): number {
  if (rqd >= 90) return 20;
  if (rqd >= 75) return 17;
  if (rqd >= 50) return 13;
  if (rqd >= 25) return 8;
  return 3;
}

/** Tipos de roca de la leyenda del formato. */
export type TipoRoca = 'I/II' | 'III-A' | 'III-B' | 'IV' | 'V';
export const TIPOS: { tipo: TipoRoca; min: number; max: number; color: string; texto: string }[] = [
  { tipo: 'I/II', min: 66, max: 100, color: '#2E75B6', texto: '#FFFFFF' },
  { tipo: 'III-A', min: 57, max: 65, color: '#FFFF00', texto: '#000000' },
  { tipo: 'III-B', min: 45, max: 56, color: '#ED7D31', texto: '#000000' },
  { tipo: 'IV', min: 36, max: 44, color: '#C00000', texto: '#FFFFFF' },
  { tipo: 'V', min: 0, max: 35, color: '#CC0099', texto: '#FFFFFF' },
];

export function tipoRoca(rmr: number): TipoRoca {
  const r = Math.round(rmr);
  for (const t of TIPOS) if (r >= t.min && r <= t.max) return t.tipo;
  return r > 100 ? 'I/II' : 'V';
}

/**
 * RMR de diseño (regla confirmada por el usuario, 31/10/2026):
 * si las tres zonas caen en el mismo tipo de roca, se usa ese RMR (el menor, que coincide en la práctica);
 * si caen en tipos distintos, se alerta y se propone el promedio de los tres. El ingeniero decide.
 */
export function rmrDiseno(totales: Record<Zona, number | null>): { rmr: number; tipo: TipoRoca; alerta: string | null } | null {
  const vals = ZONAS.map(z => totales[z]);
  if (vals.some(v => v == null)) return null;
  const v = vals as number[];
  const tipos = new Set(v.map(tipoRoca));
  if (tipos.size === 1) {
    const rmr = Math.min(...v);
    return { rmr, tipo: tipoRoca(rmr), alerta: null };
  }
  const prom = Math.round((v.reduce((a, b) => a + b, 0) / 3) * 10) / 10;
  return {
    rmr: prom,
    tipo: tipoRoca(prom),
    alerta: `Las zonas tienen tipos de roca distintos (${ZONAS.map((z, i) => `${NOMBRE_ZONA[z]} ${v[i]} ${tipoRoca(v[i]!)}`).join(', ')}). Se propone el promedio ${prom}. Revise y decida.`,
  };
}

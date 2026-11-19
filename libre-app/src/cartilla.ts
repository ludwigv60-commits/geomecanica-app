// Cartilla geomecánica (versión 2026-01), transcrita de la tabla entregada por el usuario.
// Parte 1: cartilla GSI (condición estructural × condición de discontinuidades → tipo de roca).
// Parte 2: sostenimiento recomendado por tipo de roca (rangos de RMR), por grupo de sección
// y por labor permanente / temporal; tiempo de autosoporte, frecuencia de desatado y sostenimiento de sacrificio.
//
// Lecturas propias donde la cartilla no es explícita (se muestran también en la app, sección "Notas de la cartilla"):
//  1. RMR > 70 no figura en la cartilla: se toma como tipo I y se recomienda lo del tipo II como mínimo.
//  2. RMR con decimales se redondea al entero más cercano antes de buscar el rango (60.5 → 61 → II).
//  3. Grupo de sección: lado mayor ≤ 3.5 m → tabla "3.5 x 3.5 m o menores"; entre 3.5 y 4.5 m → tabla
//     "4.0 x 4.0 / 4.5 x 4.5 m" (la más exigente de las dos para ese tamaño); > 4.5 m está fuera de la cartilla:
//     se usa la tabla de 4.0/4.5 con alerta para que el ingeniero lo defina.
//  4. "e=G" (tipo II temporal, secciones ≤ 3.5 m) se lee como: perno Split Set puntual, solo bajo indicación geomecánica.
//  5. "G: ..." al final de una opción = refuerzo que se coloca SOLO si el geomecánico lo indica (leyenda de la cartilla).
//  6. Donde hay opción 1 y 2, la 1 es con shotcrete y la 2 con malla; el ingeniero elige (la app propone la 1).
//  7. Tipo V permanente: el texto dice "... + Sht 2" SF / Cimbras viga H 6W20 ó G: Arcos noruegos"; se lee como
//     cimbras H 6W20 o, si el geomecánico lo indica, arcos noruegos (como alternativa a las cimbras).

export type TipoRoca = 'I' | 'II' | 'III-A' | 'III-B' | 'IV-A' | 'IV-B' | 'V';

export interface ClaseRoca { tipo: TipoRoca; min: number; max: number; color: string; texto: string; nombre: string }

/** Rangos de RMR y colores de la cartilla (parte 2). */
export const CLASES: ClaseRoca[] = [
  { tipo: 'I', min: 71, max: 100, color: '#1e88e5', texto: '#ffffff', nombre: 'Muy buena (fuera de cartilla)' },
  { tipo: 'II', min: 61, max: 70, color: '#00e000', texto: '#000000', nombre: 'Buena' },
  { tipo: 'III-A', min: 51, max: 60, color: '#ffff00', texto: '#000000', nombre: 'Regular A' },
  { tipo: 'III-B', min: 41, max: 50, color: '#ffc000', texto: '#000000', nombre: 'Regular B' },
  { tipo: 'IV-A', min: 31, max: 40, color: '#ff0000', texto: '#ffffff', nombre: 'Mala A' },
  { tipo: 'IV-B', min: 21, max: 30, color: '#9b1c1c', texto: '#ffffff', nombre: 'Mala B' },
  { tipo: 'V', min: 0, max: 20, color: '#0000ff', texto: '#ffffff', nombre: 'Muy mala' },
];

export function claseDe(rmr: number): ClaseRoca {
  const r = Math.max(0, Math.min(100, Math.round(rmr)));
  return CLASES.find(c => r >= c.min && r <= c.max)!;
}
export const clasePorTipo = (t: TipoRoca) => CLASES.find(c => c.tipo === t)!;

// ---------------------------------------------------------------- Parte 1: cartilla GSI

export type Estructura = 'F' | 'MF' | 'IF' | 'T';
export type CondicionDisc = 'B' | 'R' | 'P' | 'MP';

export const ESTRUCTURAS: { id: Estructura; nombre: string; detalle: string; rqd: string }[] = [
  { id: 'F', nombre: 'Fracturada', detalle: 'Muy bien trabada, no disturbada, bloques cúbicos formados por tres sistemas de discontinuidades ortogonales (6 a 11 fracturas por m).', rqd: 'RQD 75-90 %' },
  { id: 'MF', nombre: 'Muy fracturada', detalle: 'Moderadamente trabada y/o parcialmente disturbada, bloques angulosos formados por 4 o más sistemas de discontinuidades (12 a 20 fracturas por m).', rqd: 'RQD 50-75 %' },
  { id: 'IF', nombre: 'Intensamente fracturada', detalle: 'Afectada por fallas y por la intersección de muchas familias de discontinuidades; matriz rocosa muy perturbada (más de 20 fracturas por m).', rqd: 'RQD 25-50 %' },
  { id: 'T', nombre: 'Triturada o brechada', detalle: 'Masa rocosa triturada, asociada a fragmentos angulosos y redondeados; matriz rocosa desintegrada.', rqd: 'RQD 0-25 %' },
];

export const CONDICIONES: { id: CondicionDisc; nombre: string; rcu: string; detalle: string; ucsSugerido: number }[] = [
  { id: 'B', nombre: 'Buena', rcu: 'RCU 100-250 MPa', detalle: 'Muy resistente, ligeramente alterada. La muestra se rompe con más de 3 golpes de picota o barretilla de punta de 4 pies.', ucsSugerido: 12 },
  { id: 'R', nombre: 'Regular', rcu: 'RCU 50-100 MPa', detalle: 'Resistente, moderadamente alterada. La muestra requiere de 2 a 3 golpes con la picota o barretilla de punta de 4 pies para fracturarla.', ucsSugerido: 7 },
  { id: 'P', nombre: 'Pobre', rcu: 'RCU 25-50 MPa', detalle: 'Blanda, alterada. La muestra puede ser fracturada con un golpe firme de picota o barretilla de punta de 4 pies o se hunde ligeramente.', ucsSugerido: 4 },
  { id: 'MP', nombre: 'Muy pobre', rcu: 'RCU 0-25 MPa', detalle: 'Muy blanda, muy alterada. La punta de la picota o barretilla de 4 pies se hunde profundamente o la muestra se desmorona con un simple golpe.', ucsSugerido: 2 },
];

/** Celda de la cartilla GSI: [color superior, color inferior]; null = combinación que no aplica (raya en la cartilla). */
export const MATRIZ_GSI: Record<Estructura, Record<CondicionDisc, [TipoRoca, TipoRoca] | null>> = {
  F: { B: ['II', 'II'], R: ['II', 'III-A'], P: ['III-A', 'III-B'], MP: null },
  MF: { B: ['II', 'III-A'], R: ['III-A', 'III-B'], P: ['III-B', 'IV-A'], MP: ['IV-A', 'IV-B'] },
  IF: { B: ['III-A', 'III-B'], R: ['III-B', 'IV-A'], P: ['IV-A', 'IV-B'], MP: ['V', 'V'] },
  T: { B: null, R: null, P: ['V', 'V'], MP: ['V', 'V'] },
};

export const FACTORES = [
  { id: 'agua', texto: 'Presencia de agua de filtración' },
  { id: 'orientacion', texto: 'Orientación desfavorable de discontinuidades' },
  { id: 'fallas', texto: 'Presencia de fallas' },
  { id: 'deformaciones', texto: 'Presencia de deformaciones' },
] as const;
export type FactorId = typeof FACTORES[number]['id'];

/** "Si la celda tiene dos colores: con factores influyentes se escoge el inferior; si no, el superior." */
export function tipoGsi(e?: Estructura, c?: CondicionDisc, conFactores = false): TipoRoca | null {
  if (!e || !c) return null;
  const celda = MATRIZ_GSI[e][c];
  if (!celda) return null;
  return conFactores ? celda[1] : celda[0];
}

// ---------------------------------------------------------------- Parte 2: sostenimiento

export type GrupoSeccion = 'S35' | 'S45';
export type TipoLabor = 'PERMANENTE' | 'TEMPORAL';

export const GRUPOS: Record<GrupoSeccion, string> = {
  S35: 'Secciones 3.5 x 3.5 m o menores',
  S45: 'Secciones 4.0 x 4.0 / 4.5 x 4.5 m',
};
export const LABORES: Record<TipoLabor, { nombre: string; ejemplos: string }> = {
  PERMANENTE: { nombre: 'Labor permanente', ejemplos: 'RP, CX y galerías principales' },
  TEMPORAL: { nombre: 'Labor temporal', ejemplos: 'RP de producción, ventanas, subniveles, tajos' },
};

/** Una opción de sostenimiento: texto de la cartilla + refuerzo G (solo bajo indicación geomecánica). */
export interface Opcion { texto: string; refuerzoG?: string }

type Tabla = Record<Exclude<TipoRoca, 'I'>, Record<TipoLabor, Opcion[]>>;

export const TABLAS: Record<GrupoSeccion, Tabla> = {
  S35: {
    'II': {
      PERMANENTE: [{ texto: 'Perno (Hc ó Xp) e=1.80 m' }],
      TEMPORAL: [{ texto: 'Perno Ss puntual (e=G: solo bajo indicación geomecánica)' }],
    },
    'III-A': {
      PERMANENTE: [{ texto: "Perno Hc ó Xp 7' e=1.50 m" }],
      TEMPORAL: [{ texto: 'Malla + Ss e=1.20 m' }],
    },
    'III-B': {
      PERMANENTE: [{ texto: 'Sht 2" CF + Hc ó Xp e=1.40 m' }, { texto: 'Malla + (Hc ó Xp) e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
      TEMPORAL: [{ texto: 'Sht 2" CF + Ss e=1.40 m' }, { texto: 'Malla + Ss e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
    },
    'IV-A': {
      PERMANENTE: [{ texto: 'Sht 2" CF + Hc ó Xp e=1.40 m' }, { texto: 'Malla + Xp e=1.20 m', refuerzoG: 'Shotcrete 3" SF' }],
      TEMPORAL: [{ texto: 'Sht 2" CF + Ss e=1.40 m' }, { texto: 'Malla + Ss e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
    },
    'IV-B': {
      PERMANENTE: [{ texto: 'Sht 3" CF + Malla + Xp e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
      TEMPORAL: [{ texto: 'Sht 3" CF + Malla + Ss e=1.10 m', refuerzoG: 'Shotcrete 2" SF' }],
    },
    'V': {
      PERMANENTE: [{ texto: 'Sht 3" CF + Malla + Xp e=1.10 m + Sht 2" SF + Cimbras viga H 6W20', refuerzoG: 'Arcos noruegos (en lugar de cimbras)' }],
      TEMPORAL: [{ texto: 'Sht 3" CF + Malla + (Ss ó Xp) e=1.10 m + Sht 2" SF' }],
    },
  },
  S45: {
    'II': {
      PERMANENTE: [{ texto: 'Perno Hc ó Xp e=1.40 m' }],
      TEMPORAL: [{ texto: 'Perno Ss e=1.40 m' }],
    },
    'III-A': {
      PERMANENTE: [{ texto: 'Malla + Hc ó Xp e=1.20 m' }],
      TEMPORAL: [{ texto: "Malla + Ss 7' e=1.20 m" }],
    },
    'III-B': {
      PERMANENTE: [{ texto: 'Sht 2" CF + Hc ó Xp e=1.40 m' }, { texto: 'Malla + Hc ó Xp e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
      TEMPORAL: [{ texto: 'Sht 2" CF + Ss e=1.40 m' }, { texto: "Malla + Ss 7' e=1.20 m", refuerzoG: 'Shotcrete 2" SF' }],
    },
    'IV-A': {
      PERMANENTE: [{ texto: 'Sht 2" CF + Xp e=1.20 m' }, { texto: "Malla + Xp 7' e=1.20 m + Sht 2\" SF" }],
      TEMPORAL: [{ texto: 'Sht 2" CF + Ss e=1.20 m' }, { texto: 'Malla + Ss e=1.20 m', refuerzoG: 'Shotcrete 2" SF' }],
    },
    'IV-B': {
      PERMANENTE: [{ texto: "Sht 3\" CF + Malla + Xp 7' e=1.10 m + Sht 2\" SF" }],
      TEMPORAL: [{ texto: "Sht 3\" CF + Malla + Ss ó Xp 7' e=1.10 m", refuerzoG: 'Shotcrete 2" ó 3" SF' }],
    },
    'V': {
      PERMANENTE: [{ texto: "Sht 3\" CF + Malla + Xp 7' + Sht 2\" SF + Cimbras viga H 6W20", refuerzoG: 'Arcos noruegos (en lugar de cimbras)' }],
      TEMPORAL: [{ texto: "Sht 3\" CF + Malla + Ss ó Xp 7' e=1.10 m + Sht 2\" SF" }],
    },
  },
};

/** Tiempo de autosoporte (longitud 2 a 4.5 m) y frecuencia de desatado de rocas. */
export const AUTOSOPORTE: Record<Exclude<TipoRoca, 'I'>, { tiempo: string; desatado: string }> = {
  'II': { tiempo: '5 días', desatado: 'Cada 3 horas' },
  'III-A': { tiempo: '3 días (6 guardias)', desatado: 'Cada 1 hora' },
  'III-B': { tiempo: '2 días (4 guardias)', desatado: 'Cada 25 min' },
  'IV-A': { tiempo: '1 día (2 guardias)', desatado: 'Cada 12 min' },
  'IV-B': { tiempo: '12 horas', desatado: 'Cada 8 min' },
  'V': { tiempo: 'Inmediato', desatado: 'Colapso inmediato' },
};

/** Diseño de perno y malla de sacrificio (desde gradiente, 1.5 m sobre el piso). */
export interface FilaSacrificio { seccion: string; ancho: number; alto: number; perimetro: number; cocadas: number; filas11: string; filas12: string; longitud: string }
export const SACRIFICIO: FilaSacrificio[] = [
  { seccion: '4.5x4.5', ancho: 4.5, alto: 4.5, perimetro: 10.7, cocadas: 141, filas11: '10-9-10', filas12: '9-8-9', longitud: "7'" },
  { seccion: '4.0x4.0', ancho: 4.0, alto: 4.0, perimetro: 9.7, cocadas: 127, filas11: '9-8-9', filas12: '8-7-8', longitud: "7'" },
  { seccion: '3.5x3.5', ancho: 3.5, alto: 3.5, perimetro: 8.2, cocadas: 107, filas11: '8-7-8', filas12: '7-6-7', longitud: "7'" },
  { seccion: '3.0x3.5', ancho: 3.0, alto: 3.5, perimetro: 7.7, cocadas: 100, filas11: '7-6-7', filas12: '7-6-7', longitud: "7' corona / 5' hastial" },
  { seccion: '2.4x2.7', ancho: 2.4, alto: 2.7, perimetro: 5.0, cocadas: 68, filas11: '6-5-6', filas12: '5-4-5', longitud: "5' corona / 4' hastial" },
  { seccion: '2.4x3.0', ancho: 2.4, alto: 3.0, perimetro: 6.6, cocadas: 89, filas11: '6-5-6', filas12: '5-4-5', longitud: "5' corona / 4' hastial" },
];

export const LEYENDA = [
  'Sht: Shotcrete · CF: con fibra · SF: sin fibra · Malla: malla electrosoldada',
  "Hc: perno helicoidal 7', 6' · Xp: perno expansivo 7' · Ss: perno Split Set 7', 5', 4'",
  'G: reforzar sostenimiento solo bajo indicación geomecánica',
  'Perno con malla: distribución rómbica · Perno sin malla: distribución cuadrada y/o rómbica según indicación geomecánica',
];

export const NOTA_CARTILLA = 'En toda labor de avance y explotación se colocará sostenimiento de sacrificio según estándar aprobado. ' +
  'Toda labor de rehabilitación contará con una inspección previa del comité multidisciplinario para detallar los puntos a rehabilitar. ' +
  'En labores con indicios de aguas ácidas se comprobará mediante pruebas y se evaluará el uso de elementos de sostenimiento galvanizado. ' +
  'El sostenimiento en intersecciones será según estándar.';

export const SECCIONES_COMUNES = ['2.4x2.7', '2.4x3.0', '3.0x3.5', '3.5x3.5', '4.0x4.0', '4.5x4.5'];

export function grupoSeccion(ancho: number, alto: number): { grupo: GrupoSeccion; alerta: string | null } {
  const lado = Math.max(ancho || 0, alto || 0);
  if (lado > 0 && lado <= 3.5) return { grupo: 'S35', alerta: null };
  if (lado > 4.5) return { grupo: 'S45', alerta: `La sección ${ancho} x ${alto} m es mayor que 4.5 x 4.5 m y no figura en la cartilla: se muestra lo de 4.0/4.5 m como referencia; el ingeniero debe definir el sostenimiento.` };
  if (!(lado > 0)) return { grupo: 'S35', alerta: 'Falta el ancho y alto de la sección.' };
  return { grupo: 'S45', alerta: null };
}

export function filaSacrificio(ancho: number, alto: number): FilaSacrificio | null {
  return SACRIFICIO.find(f => Math.abs(f.ancho - ancho) < 0.05 && Math.abs(f.alto - alto) < 0.05) ?? null;
}

export interface Recomendacion {
  clase: ClaseRoca;
  tipoTabla: Exclude<TipoRoca, 'I'>;
  grupo: GrupoSeccion;
  opciones: Opcion[];
  autosoporte: { tiempo: string; desatado: string };
  sacrificio: FilaSacrificio | null;
  alertas: string[];
}

export function recomendar(rmr: number, ancho: number, alto: number, labor: TipoLabor): Recomendacion {
  const clase = claseDe(rmr);
  const alertas: string[] = [];
  const tipoTabla = clase.tipo === 'I' ? 'II' : clase.tipo;
  if (clase.tipo === 'I') alertas.push('RMR mayor que 70 (tipo I) no figura en la cartilla: se recomienda como mínimo lo indicado para roca tipo II.');
  const g = grupoSeccion(ancho, alto);
  if (g.alerta) alertas.push(g.alerta);
  return {
    clase, tipoTabla, grupo: g.grupo,
    opciones: TABLAS[g.grupo][tipoTabla][labor],
    autosoporte: AUTOSOPORTE[tipoTabla],
    sacrificio: filaSacrificio(ancho, alto),
    alertas,
  };
}

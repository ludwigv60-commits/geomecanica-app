// Modelo de un reporte = un formato PRT-JS-CLD-16 lleno.
import type { PuntajesZona, Zona } from './core/rmr';
import type { ParametrosQ } from './core/q';
import type { ParamCobertura, Rampa } from './core/cobertura';

export type Verif = 'CUMPLE' | 'NO CUMPLE' | 'NO APLICA' | '';
export const ITEMS_VERIF = ['SHOTCRETE', 'PERNO', 'MALLA', 'MARCO RETICULADO', 'SACRIFICIO'] as const;
export const ABREVS = ['SD', 'F', 'V', 'C'] as const;

export type ZonaFoto = 'FRENTE' | 'HI' | 'CORONA' | 'HD';
export const ZONAS_FOTO: { id: ZonaFoto; nombre: string }[] = [
  { id: 'FRENTE', nombre: 'Frente' }, { id: 'HI', nombre: 'H. I.' }, { id: 'CORONA', nombre: 'Corona' }, { id: 'HD', nombre: 'H. D.' }];
export interface Trazas { w: number; h: number; ia?: { metodo: 'red' | 'clasico'; confianza: number; nivel: 'alta' | 'media' | 'baja'; roca?: number; zonas?: Record<string, number>; anchoFotoM?: number }; segmentos: { x1: number; y1: number; x2: number; y2: number; ang: number; largo: number; familia: number; pts?: [number, number][]; mano?: boolean }[]; revisada?: boolean } // mano = dibujada por el usuario (la IA nunca la mueve ni la borra)
export interface FotoZona {
  id: string; zona: ZonaFoto; data: string; fecha: string;
  az?: number; plunge?: number;      // eje de la cámara (UTM) al tomarla
  calidad?: { apta: boolean; motivos: string[] };
  labor?: { es: 'labor' | 'dudoso' | 'no'; sim: number; confirmada?: boolean }; // ¿la foto muestra una labor?
  trazas?: Trazas;
}

export interface Familia { abrev: string; dip: number | null; dipdir: number | null; potencia?: number | null; espaciamiento?: number | null; persistencia?: number | null; pos?: { s: number; t: number } } // pos: dónde pasa la falla/veta/contacto en la planta (m: s a lo largo del avance desde el frente, t a la derecha del eje), movida a mano // potencia (m) de F/V; espaciamiento (m) entre diaclasas de la familia; persistencia (m) = largo de la traza

export interface Reporte {
  id: string;
  creado: string;
  modificado: string;
  sincronizado: boolean;
  foto?: string;           // foto del frente (JPEG reducido)
  sugeridos?: string[];
  importado?: boolean;     // viene de la BD de mapeos (historial, solo lectura)
  enviado?: string;        // fecha en que se preparó el envío al panel de mapeos
  panel?: { subidoPor?: string; subidoEn?: string; dispositivo?: string; editadoEn?: string };
  sobreexc?: Partial<Record<Zona, number | null>>; // m medidos: + sobreexcavación, − subexcavación
  trazasFoto?: Trazas;     // (versión anterior, se migra a fotos)
  fotos?: FotoZona[];    // campos llenados por la IA y aún no confirmados
  correlativo: string;
  labor: string;
  rampa?: Rampa | '';       // rampa donde está la labor (cámaras en rampa): define la cobertura. Sin marcar = según el nombre de la labor; '' = ninguna
  supervisor: string;
  fecha: string;            // AAAA-MM-DD
  turno: 'Día' | 'Noche' | '';
  desde: string;            // PK, ej. 0+924.7
  hasta: string;
  avance: number | null;    // medido por topografía
  ancho: number | null;
  alto: number | null;
  azimut: number | null;    // cuadrícula UTM
  nivelRiesgo: string;
  tipoGeologo?: 'I/II' | 'III-A' | 'III-B' | 'IV' | 'V'; // tipo de roca que indica el geólogo a cargo al iniciar
  rmr: Record<Zona, PuntajesZona>;
  ajuste: Record<Zona, number | null>;
  rmrDisenoManual: number | null;
  jv: number | null;
  rqdManual?: number | null; // RQD escrito en campo (reemplaza al calculado con Jv)
  litologia: Record<Zona, string>;
  familias: Familia[];
  q: Record<Zona, Partial<Omit<ParametrosQ, 'rqd'>>>;
  condicion: string;
  verificacion: Record<(typeof ITEMS_VERIF)[number], Verif>;
  observaciones: string;
  sostenimiento: string[];
  ordenFilas: 'menorPrimero' | 'mayorPrimero';
  adicionales: { fecha: string; hora: string; nombre: string; indicacion: string }[];
  firmas: { rol: string; nombre: string; fecha: string }[];
}

const z3 = <T,>(f: () => T): Record<Zona, T> => ({ HI: f(), CORONA: f(), HD: f() });

/** Pasa reportes antiguos (una sola foto) al modelo de fotos por zona. */
export function migrar(r: Reporte): Reporte {
  if (r.fotos || !r.foto) return r;
  return { ...r, fotos: [{ id: crypto.randomUUID(), zona: 'FRENTE', data: r.foto, fecha: r.modificado, az: r.azimut ?? undefined, trazas: r.trazasFoto }], foto: undefined, trazasFoto: undefined };
}

/** Siguiente N° correlativo: el mayor de los reportes guardados + 1 (conserva ceros a la izquierda). */
export function siguienteCorrelativo(reportes: { correlativo: string }[]): string {
  const nums = reportes.map(r => r.correlativo.trim()).filter(c => /^\d+$/.test(c));
  if (!nums.length) return '';
  const max = nums.reduce((a, c) => (Number(c) > Number(a) ? c : a));
  return String(Number(max) + 1).padStart(max.length, '0');
}

export function nuevoReporte(prev?: Reporte, correlativo = ''): Reporte {
  const d = new Date(), ahora = d.toISOString(), h = d.getHours();
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: crypto.randomUUID(), creado: ahora, modificado: ahora, sincronizado: false,
    correlativo, labor: prev?.labor ?? '', rampa: prev?.rampa, supervisor: prev?.supervisor ?? '',
    fecha: hoy, turno: h >= 7 && h < 19 ? 'Día' : 'Noche', desde: prev?.hasta ?? '', hasta: '', avance: null,
    ancho: prev?.ancho ?? null, alto: prev?.alto ?? null, azimut: null, nivelRiesgo: '',
    rmr: z3(() => ({})), ajuste: z3(() => null), rmrDisenoManual: null, jv: null,
    litologia: z3(() => ''), familias: [{ abrev: 'SD', dip: null, dipdir: null }],
    q: z3(() => ({})), condicion: '',
    verificacion: { SHOTCRETE: '', PERNO: '', MALLA: '', 'MARCO RETICULADO': '', SACRIFICIO: '' },
    observaciones: '', sostenimiento: [], ordenFilas: 'menorPrimero',
    fotos: [], adicionales: [], firmas: [
      { rol: 'GEOMECÁNICA AESA', nombre: prev?.supervisor ?? '', fecha: '' },
      { rol: 'OPERACIONES AESA', nombre: '', fecha: '' },
      { rol: 'SUPERVISIÓN SYSTRA', nombre: '', fecha: '' },
      { rol: 'SUPERVISIÓN MARCOBRE', nombre: '', fecha: '' },
    ],
  };
}

export interface Listas { labores: string[]; supervisores: string[]; litologias: string[]; riesgos: string[]; declinacion?: number; convergencia?: number; coberturas?: Partial<Record<Rampa, ParamCobertura>> }
export const LISTAS_INICIALES: Listas = {
  labores: ['Rampa Norte', 'Rampa Sur'],
  supervisores: ['Kliutsmann Julca Miranda'],
  litologias: ['Andesita', 'Piroclasto'],
  riesgos: ['Bajo', 'Medio', 'Alto'],
  declinacion: -7,
  convergencia: 0,
};

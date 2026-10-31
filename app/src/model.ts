// Modelo de un reporte = un formato PRT-JS-CLD-16 lleno.
import type { PuntajesZona, Zona } from './core/rmr';
import type { ParametrosQ } from './core/q';

export type Verif = 'CUMPLE' | 'NO CUMPLE' | 'NO APLICA' | '';
export const ITEMS_VERIF = ['SHOTCRETE', 'PERNO', 'MALLA', 'MARCO RETICULADO', 'SACRIFICIO'] as const;
export const ABREVS = ['SD', 'F', 'V', 'C'] as const;

export type ZonaFoto = 'FRENTE' | 'HI' | 'CORONA' | 'HD';
export const ZONAS_FOTO: { id: ZonaFoto; nombre: string }[] = [
  { id: 'FRENTE', nombre: 'Frente' }, { id: 'HI', nombre: 'H. I.' }, { id: 'CORONA', nombre: 'Corona' }, { id: 'HD', nombre: 'H. D.' }];
export interface Trazas { w: number; h: number; segmentos: { x1: number; y1: number; x2: number; y2: number; ang: number; largo: number; familia: number }[] }
export interface FotoZona {
  id: string; zona: ZonaFoto; data: string; fecha: string;
  az?: number; plunge?: number;      // eje de la cámara (UTM) al tomarla
  calidad?: { apta: boolean; motivos: string[] };
  trazas?: Trazas;
}

export interface Familia { abrev: string; dip: number | null; dipdir: number | null }

export interface Reporte {
  id: string;
  creado: string;
  modificado: string;
  sincronizado: boolean;
  foto?: string;           // foto del frente (JPEG reducido)
  sugeridos?: string[];
  trazasFoto?: Trazas;     // (versión anterior, se migra a fotos)
  fotos?: FotoZona[];    // campos llenados por la IA y aún no confirmados
  correlativo: string;
  labor: string;
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
  rmr: Record<Zona, PuntajesZona>;
  ajuste: Record<Zona, number | null>;
  rmrDisenoManual: number | null;
  jv: number | null;
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

export function nuevoReporte(prev?: Reporte): Reporte {
  const ahora = new Date().toISOString();
  return {
    id: crypto.randomUUID(), creado: ahora, modificado: ahora, sincronizado: false,
    correlativo: '', labor: prev?.labor ?? '', supervisor: prev?.supervisor ?? '',
    fecha: ahora.slice(0, 10), turno: '', desde: prev?.hasta ?? '', hasta: '', avance: null,
    ancho: null, alto: null, azimut: null, nivelRiesgo: '',
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

export interface Listas { labores: string[]; supervisores: string[]; litologias: string[]; riesgos: string[]; declinacion?: number; convergencia?: number }
export const LISTAS_INICIALES: Listas = {
  labores: ['Rampa Norte', 'Rampa Sur'],
  supervisores: ['Kliutsmann Julca Miranda'],
  litologias: ['Andesita', 'Piroclasto'],
  riesgos: ['Bajo', 'Medio', 'Alto'],
  declinacion: -7,
  convergencia: 0,
};

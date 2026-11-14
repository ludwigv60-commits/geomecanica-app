import type { CondicionDisc, Estructura, FactorId, TipoLabor } from './cartilla';
import { claseDe, recomendar, tipoGsi } from './cartilla';
import { rmrBasico, rmrDiseno, rmrTotal, ZONAS, type PuntajesZona, type Zona } from './rmr';

export type TipoEstructura = 'D' | 'F' | 'V' | 'C' | 'E';
export const TIPOS_ESTRUCTURA: Record<TipoEstructura, { nombre: string; color: string }> = {
  D: { nombre: 'Diaclasa', color: '#ffd400' },
  F: { nombre: 'Falla', color: '#ff2a2a' },
  V: { nombre: 'Veta', color: '#00e5ff' },
  C: { nombre: 'Contacto', color: '#7CFF4F' },
  E: { nombre: 'Estratificación', color: '#ff8a00' },
};

export interface Discontinuidad {
  id: string;
  tipo: TipoEstructura;
  nombre: string;          // D1, F1...
  dip: number | null;
  dd: number | null;
  espaciamiento: string;   // texto libre (m)
  persistencia: string;
  relleno: string;
  obs: string;
}

export interface Traza { tipo: TipoEstructura; nombre: string; pts: [number, number][] } // coordenadas 0..1
export interface Foto { id: string; titulo: string; src: string; w: number; h: number; trazas: Traza[] }

export interface Mapeo {
  id: string;
  creado: number;
  actualizado: number;
  fecha: string;
  hora: string;
  labor: string;
  nivel: string;
  ubicacion: string;
  desde: string;
  hasta: string;
  azimut: string;
  ancho: number;
  alto: number;
  tipoLabor: TipoLabor;
  litologia: string;
  mapeadoPor: string;
  revisadoPor: string;
  porZonas: boolean;
  zonas: Record<Zona, PuntajesZona>;
  ajuste: number | null;
  jv: string;
  rqdManual: string;
  rmrManual: string;       // si el ingeniero decide otro RMR de diseño
  gsiEstructura?: Estructura;
  gsiCondicion?: CondicionDisc;
  factores: FactorId[];
  disc: Discontinuidad[];
  fotos: Foto[];
  opcion: number;          // índice de la opción de sostenimiento elegida
  sostFinal: string;       // texto final (editable); vacío = el de la cartilla
  observaciones: string;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function nuevoMapeo(prev?: Mapeo): Mapeo {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    id: uid(), creado: Date.now(), actualizado: Date.now(),
    fecha: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    hora: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    labor: prev?.labor ?? '', nivel: prev?.nivel ?? '', ubicacion: '', desde: prev?.hasta ?? '', hasta: '', azimut: prev?.azimut ?? '',
    ancho: prev?.ancho ?? 3.5, alto: prev?.alto ?? 3.5, tipoLabor: prev?.tipoLabor ?? 'PERMANENTE',
    litologia: prev?.litologia ?? '', mapeadoPor: prev?.mapeadoPor ?? '', revisadoPor: prev?.revisadoPor ?? '',
    porZonas: false, zonas: { HI: {}, CORONA: {}, HD: {} }, ajuste: null, jv: '', rqdManual: '', rmrManual: '',
    factores: [], disc: [], fotos: [], opcion: 0, sostFinal: '', observaciones: '',
  };
}

export interface Calculo {
  rmrZonas: Record<Zona, number | null>;
  rmrCalc: number | null;
  rmr: number | null;            // de diseño (manual si lo escribió)
  alertaZonas: string | null;
  tipoGsi: ReturnType<typeof tipoGsi>;
  alertaGsi: string | null;
  rec: ReturnType<typeof recomendar> | null;
  sostenimiento: string;
}

export function calcular(m: Mapeo): Calculo {
  const rmrZonas = { HI: null, CORONA: null, HD: null } as Record<Zona, number | null>;
  let rmrCalc: number | null = null; let alertaZonas: string | null = null;
  if (m.porZonas) {
    for (const z of ZONAS) rmrZonas[z] = rmrTotal(m.zonas[z], m.ajuste);
    const d = rmrDiseno(rmrZonas);
    if (d) { rmrCalc = d.rmr; alertaZonas = d.alerta; }
  } else {
    rmrCalc = rmrTotal(m.zonas.CORONA, m.ajuste);
  }
  const manual = parseFloat(m.rmrManual.replace(',', '.'));
  const rmr = Number.isFinite(manual) ? manual : rmrCalc;
  const tg = tipoGsi(m.gsiEstructura, m.gsiCondicion, m.factores.length > 0);
  let alertaGsi: string | null = null;
  if (m.gsiEstructura && m.gsiCondicion && !tg) alertaGsi = `La combinación ${m.gsiEstructura}/${m.gsiCondicion} no aplica en la cartilla GSI (casilla con raya). Revise la estructura o la condición.`;
  else if (tg && rmr != null && claseDe(rmr).tipo !== tg) alertaGsi = `La cartilla GSI da roca ${tg} y el RMR ${rmr} da ${claseDe(rmr).tipo}. El sostenimiento se toma del RMR; revise si corresponde.`;
  const rec = rmr != null ? recomendar(rmr, m.ancho, m.alto, m.tipoLabor) : null;
  let sostenimiento = m.sostFinal.trim();
  if (!sostenimiento && rec) {
    const o = rec.opciones[Math.min(m.opcion, rec.opciones.length - 1)]!;
    sostenimiento = o.texto;
  }
  return { rmrZonas, rmrCalc, rmr, alertaZonas, tipoGsi: tg, alertaGsi, rec, sostenimiento };
}

export const basico = (m: Mapeo, z: Zona) => rmrBasico(m.zonas[z]);

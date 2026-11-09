// REPORTE MODELO: une el formato PRT-JS-CLD-16 con la ficha VG (caracterización geomecánica de la supervisión):
// progresivas, cobertura, Q de Barton con Q' y GSI, RMR básico y corregido, descripción geológica con los códigos
// S-L-T-R-F-A-W de cada estructura, vistas, sostenimiento y firmas. Lo usan el PDF y el Excel del reporte modelo.
import { NOMBRE_ZONA, PARAMETROS, ZONAS, type ParamId, type Zona } from '../core/rmr';
import { claseQ, redondear } from '../core/q';
import { cobertura, rampaDe } from '../core/cobertura';
import { calcular } from '../calc';
import { redactarCondicion } from '../ia/redaccion';
import type { Familia, Listas, Reporte } from '../model';

export const TITULO_MODELO = 'REPORTE MODELO';
const NOMBRE_TIPO: Record<string, string> = { SD: 'Familia de discontinuidad', F: 'Falla', V: 'Veta', C: 'Contacto', A: 'Aleatoria' };
const LETRA: Record<string, string> = { SD: 'D', F: 'F', V: 'V', C: 'C', A: 'A' };

/** Clases 1 a 5 de la leyenda S-L-T-R-F-A-W (mismas clases que el RMR del formato). */
export const LEYENDA: { letra: string; nombre: string; id: ParamId }[] = [
  { letra: 'S', nombre: 'Espaciado', id: 'espaciamiento' }, { letra: 'L', nombre: 'Persistencia', id: 'persistencia' },
  { letra: 'T', nombre: 'Apertura', id: 'abertura' }, { letra: 'R', nombre: 'Rugosidad', id: 'rugosidad' },
  { letra: 'F', nombre: 'Relleno', id: 'relleno' }, { letra: 'A', nombre: 'Alteración', id: 'alteracion' }, { letra: 'W', nombre: 'Agua', id: 'agua' }];
export const clasesLeyenda = (id: ParamId) => PARAMETROS.find(p => p.id === id)!.clases.map(c => c.etiqueta);

const claseDePuntaje = (id: ParamId, pts: number | undefined) => {
  if (pts == null) return null;
  const i = PARAMETROS.find(p => p.id === id)!.clases.findIndex(c => c.puntaje === pts);
  return i < 0 ? null : i + 1;
};
const claseEsp = (m: number) => (m > 2 ? 1 : m >= 0.6 ? 2 : m >= 0.2 ? 3 : m >= 0.06 ? 4 : 5);
const clasePers = (m: number) => (m < 1 ? 1 : m < 3 ? 2 : m < 10 ? 3 : m < 20 ? 4 : 5);

/** Código S-L-T-R-F-A-W de una estructura: espaciado y persistencia propios si se midieron; lo demás, de la zona. */
export function codigoSLT(f: Familia, p: Partial<Record<ParamId, number>>): string {
  const v: Record<string, number | null> = {
    S: f.espaciamiento != null && f.espaciamiento > 0 ? claseEsp(f.espaciamiento) : claseDePuntaje('espaciamiento', p.espaciamiento),
    L: f.persistencia != null && f.persistencia > 0 ? clasePers(f.persistencia) : claseDePuntaje('persistencia', p.persistencia),
    T: claseDePuntaje('abertura', p.abertura), R: claseDePuntaje('rugosidad', p.rugosidad), F: claseDePuntaje('relleno', p.relleno),
    A: claseDePuntaje('alteracion', p.alteracion), W: claseDePuntaje('agua', p.agua),
  };
  return Object.entries(v).map(([k, n]) => `${k}${n ?? '-'}`).join('-');
}

export interface EstructuraModelo { codigo: string; tipo: string; dip: number | null; dipdir: number | null; slt: string; espaciamiento?: number | null; persistencia?: number | null; potencia?: number | null }
export interface ZonaModelo {
  zona: Zona; nombre: string; litologia: string;
  params: { id: ParamId; nombre: string; puntaje: number | null; clase: string }[];
  basico: number | null; ajuste: number | null; total: number | null; tipo: string | null;
  rqd: number | null; jn?: number; jr?: number; ja?: number; jw?: number; srf?: number;
  q: number | null; qPrima: number | null; gsi: number | null; claseQ: string | null;
}

export function datosModelo(r: Reporte, listas?: Partial<Listas>) {
  const c = calcular(r);
  const cob = cobertura(r, listas?.coberturas, listas?.coberturaJusta !== false), rampa = rampaDe(r);
  const zonas: ZonaModelo[] = ZONAS.map(z => {
    const p = r.rmr[z], q = r.q[z], cz = c.zonas[z];
    const qp = c.rqd != null && q.jn && q.jr != null && q.ja ? (Math.max(10, c.rqd) / q.jn) * (q.jr / q.ja) : null;
    return {
      zona: z, nombre: NOMBRE_ZONA[z], litologia: r.litologia[z],
      params: PARAMETROS.map(par => ({ id: par.id, nombre: par.nombre, puntaje: p[par.id] ?? null, clase: par.clases.find(k => k.puntaje === p[par.id])?.etiqueta ?? '' })),
      basico: cz.basico, ajuste: r.ajuste[z], total: cz.total, tipo: cz.tipo,
      rqd: c.rqd, jn: q.jn, jr: q.jr, ja: q.ja, jw: q.jw, srf: q.srf,
      q: cz.q, qPrima: qp != null ? redondear(qp) : null, gsi: qp != null && qp > 0 ? Math.round(9 * Math.log(qp) + 44) : null,
      claseQ: cz.q != null ? claseQ(cz.q) : null,
    };
  });
  // numeración por tipo, como en la ficha VG: D1, D2…, F1, C1, V1
  const cuenta: Record<string, number> = {};
  const pz = r.rmr.CORONA && Object.keys(r.rmr.CORONA).length ? r.rmr.CORONA : r.rmr.HI;
  const estructuras: EstructuraModelo[] = r.familias.filter(f => f.dip != null || f.dipdir != null).map(f => {
    const l = LETRA[f.abrev] ?? f.abrev; cuenta[l] = (cuenta[l] ?? 0) + 1;
    return { codigo: `${l}${cuenta[l]}`, tipo: NOMBRE_TIPO[f.abrev] ?? f.abrev, dip: f.dip, dipdir: f.dipdir, slt: codigoSLT(f, pz), espaciamiento: f.espaciamiento, persistencia: f.persistencia, potencia: f.potencia };
  });
  const dd = (n: number | null) => (n == null ? '—' : String(Math.round(n)).padStart(3, '0'));
  const lit = [...new Set(ZONAS.map(z => r.litologia[z]).filter(Boolean))].join(' / ');
  const nSD = estructuras.filter(e => e.codigo.startsWith('D')).length, nOtras = estructuras.length - nSD;
  const discont = estructuras.length
    ? `Presenta ${String(nSD).padStart(2, '0')} familia(s)${nOtras ? ` y ${nOtras} estructura(s) mayor(es)` : ''}:\n` + estructuras.map(e => `${e.codigo}: ${e.dip != null ? Math.round(e.dip) : '—'}°/${dd(e.dipdir)}°, ${e.tipo}: ${e.slt}.`).join('\n')
    : 'Sin estructuras medidas.';
  const hora = r.creado ? new Date(r.creado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const tipo = c.tipoFinal;
  return {
    titulo: TITULO_MODELO,
    proyecto: `PROYECTO JUSTA SUBTERRÁNEA${rampa ? ` · RAMPA ${rampa.toUpperCase()}` : ''}`,
    ficha: `VG - ${(r.labor || 'LABOR').toUpperCase()}${r.correlativo ? ` - ${r.correlativo}` : ''}`,
    labor: r.labor, rampa, correlativo: r.correlativo,
    desde: r.desde, hasta: r.hasta, avance: r.avance, ancho: r.ancho, alto: r.alto, azimut: r.azimut,
    supervisor: r.supervisor, fecha: r.fecha, turno: r.turno, hora, riesgo: r.nivelRiesgo,
    cobertura: cob, zonas, rqd: c.rqd, jv: r.jv,
    rmrFinal: c.rmrFinal, tipoFinal: tipo, estructuras, propuesta: c.propuesta,
    formacion: lit, macizo: r.condicion || redactarCondicion(r, c), discontinuidades: discont,
    sostenimiento: r.sostenimiento.filter(Boolean), tipoSostenimiento: tipo ? `ST - ${tipo.replace('-', ' ')}` : '',
    observaciones: r.observaciones, verificacion: r.verificacion, adicionales: r.adicionales, firmas: r.firmas,
  };
}
export type DatosModelo = ReturnType<typeof datosModelo>;
export const nombreModelo = (r: Reporte, ext: string) =>
  `REPORTE MODELO ${(r.labor || 'labor').replace(/[^\wÁÉÍÓÚÑáéíóúñ.+-]+/g, '_')} ${r.desde.replace(/[^\w.+-]+/g, '')} ${r.fecha}.${ext}`.replace(/\s+/g, '_');

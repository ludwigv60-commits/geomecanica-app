import { calcular, type Mapeo } from './model';
import { ZONAS } from './rmr';

const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Tabla de todos los mapeos (separador ; para Excel en español). */
export function aCsv(lista: Mapeo[]): string {
  const cab = ['Fecha', 'Hora', 'Labor', 'Nivel', 'Ubicación', 'Desde (m)', 'Hasta (m)', 'Azimut', 'Ancho (m)', 'Alto (m)', 'Tipo de labor', 'Litología',
    'RMR H.I.', 'RMR Corona', 'RMR H.D.', 'RMR calculado', 'RMR diseño', 'Tipo de roca', 'Tipo GSI', 'Sostenimiento', 'Autosoporte', 'Desatado', 'Discontinuidades', 'Mapeado por', 'Revisado por', 'Observaciones'];
  const filas = lista.map(m => {
    const c = calcular(m);
    return [m.fecha, m.hora, m.labor, m.nivel, m.ubicacion, m.desde, m.hasta, m.azimut, m.ancho, m.alto, m.tipoLabor, m.litologia,
      ...ZONAS.map(z => m.porZonas ? c.rmrZonas[z] : ''), c.rmrCalc, c.rmr, c.rec?.clase.tipo, c.tipoGsi, c.sostenimiento,
      c.rec?.autosoporte.tiempo, c.rec?.autosoporte.desatado,
      m.disc.map(d => `${d.nombre} ${d.dip ?? ''}/${d.dd ?? ''}`).join(', '), m.mapeadoPor, m.revisadoPor, m.observaciones];
  });
  return '﻿' + [cab, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
}

export const respaldo = (lista: Mapeo[]) => JSON.stringify({ app: 'aplicativo-geomecanico-libre', version: 1, mapeos: lista });

export async function importarRespaldo(txt: string, guardar: (m: Mapeo) => Promise<unknown>): Promise<number> {
  const d = JSON.parse(txt);
  if (d?.app !== 'aplicativo-geomecanico-libre' || !Array.isArray(d.mapeos)) throw new Error('no es un respaldo de esta app');
  for (const m of d.mapeos) await guardar(m);
  return d.mapeos.length;
}

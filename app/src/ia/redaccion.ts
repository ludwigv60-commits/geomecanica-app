// Redacción de la CONDICIÓN GEOMECÁNICA con plantillas (Módulo 10), offline y sin API de pago.
import { PARAMETROS, ZONAS, NOMBRE_ZONA, type ParamId } from '../core/rmr';
import type { Reporte } from '../model';
import type { Calculo } from '../calc';

const etiqueta = (id: ParamId, pts: number | undefined) => {
  const p = PARAMETROS.find(x => x.id === id)!; const c = p.clases.find(c => c.puntaje === pts);
  return c ? c.etiqueta.replace(/^R\d · /, '') : null;
};
const lower = (s: string | null) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');

function frases(r: Reporte, z: (typeof ZONAS)[number]): string[] {
  const p = r.rmr[z]; const out: string[] = [];
  const ucs = p.ucs;
  if (ucs != null) out.push(`resistencia ${ucs >= 12 ? 'alta' : ucs >= 7 ? 'media a alta' : ucs >= 4 ? 'media' : 'baja'} (${etiqueta('ucs', ucs)})`);
  const esp = etiqueta('espaciamiento', p.espaciamiento);
  const frac = p.espaciamiento == null ? null : p.espaciamiento <= 8 ? 'muy fracturado' : p.espaciamiento <= 10 ? 'fracturado' : 'moderadamente fracturado';
  if (frac) out.push(`${frac} (espaciamiento ${esp})`);
  const juntas = [lower(etiqueta('abertura', p.abertura)) && `abertura ${lower(etiqueta('abertura', p.abertura))}`, lower(etiqueta('rugosidad', p.rugosidad)) && `superficie ${lower(etiqueta('rugosidad', p.rugosidad))}`,
    p.relleno != null && (p.relleno === 6 ? 'sin relleno' : `relleno ${lower(etiqueta('relleno', p.relleno))}`), p.persistencia != null && `persistencia ${etiqueta('persistencia', p.persistencia)}`].filter(Boolean);
  if (juntas.length) out.push(`juntas con ${juntas.join(', ')}`);
  if (p.alteracion != null) out.push(p.alteracion >= 5 ? 'roca sana a ligeramente alterada' : p.alteracion >= 3 ? 'alteración moderada' : 'roca muy alterada');
  if (p.agua != null) out.push(`condición ${lower(etiqueta('agua', p.agua))}`);
  return out;
}

export function redactarCondicion(r: Reporte, c: Calculo): string {
  const lit = [...new Set(ZONAS.map(z => r.litologia[z]).filter(Boolean))].join(' / ') || 'Macizo rocoso';
  const fr = ZONAS.map(z => frases(r, z).join(', '));
  const partes: string[] = [];
  if (fr.every(f => f === fr[0])) partes.push(`${lit}, ${fr[0] || 'sin datos'}.`);
  else ZONAS.forEach((z, i) => fr[i] && partes.push(`${NOMBRE_ZONA[z]}: ${fr[i]}.`));
  if (partes.length && !fr.every(f => f === fr[0])) partes.unshift(`${lit}.`);
  const fams = r.familias.filter(f => f.dip != null && f.dipdir != null);
  if (fams.length) partes.push(`Se identifican ${fams.length} estructura(s): ${fams.map((f, i) => `${f.abrev}${i + 1} ${Math.round(f.dip!)}°/${String(Math.round(f.dipdir!)).padStart(3, '0')}°`).join(', ')}.`);
  if (c.rqd != null) partes.push(`Jv ${r.jv}, RQD ${c.rqd}%.`);
  if (c.rmrFinal != null) partes.push(`RMR ${c.rmrFinal} (ST-${c.tipoFinal})${ZONAS.some(z => c.zonas[z].q != null) ? `, Q ${ZONAS.map(z => c.zonas[z].q ?? '—').join(' / ')}` : ''}.`);
  if (fams.length >= 3) partes.push('Posible formación de cuñas por intersección de familias; desatar y sostener oportunamente.');
  if (r.familias.some(f => f.abrev === 'F')) partes.push('Presencia de falla: controlar caída de rocas en su zona de influencia.');
  return partes.join(' ');
}

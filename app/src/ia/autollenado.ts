// Autollenado del formato: todo lo que se puede deducir de lo ya ingresado se llena solo y queda
// marcado como sugerido (morado). Lo que el usuario escribe a mano nunca se pisa.
import type { Familia, Reporte } from '../model';
import { ZONAS, puntajeRqd } from '../core/rmr';
import { rqdDesdeJv } from '../core/rqd';
import { calcular } from '../calc';
import { redactarCondicion } from './redaccion';
import { jnDe, pEsp, pPers } from './sugerencias';

/** Progresiva "0+924.7" o "924.7" → metros. */
export function pk(s: string): number | null {
  const t = s.trim().replace(',', '.');
  const m = t.match(/^(\d+)\s*\+\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 1000 + Number(m[2]);
  const n = Number(t); return t !== '' && Number.isFinite(n) ? n : null;
}
/** Hasta = Desde + Avance, con el mismo estilo de escritura que Desde. */
export function hastaDe(desde: string, avance: number | null): string | null {
  const d = pk(desde); if (d == null || avance == null || !(avance > 0)) return null;
  const v = Math.round((d + avance) * 10) / 10;
  if (/\+/.test(desde)) return `${Math.floor(v / 1000)}+${(v % 1000).toFixed(1).padStart(5, '0')}`;
  return String(v);
}
/** Jv = Σ 1/espaciado de las familias de diaclasas (SD) que tienen espaciado. */
export function jvDeFamilias(fams: Familia[]): number | null {
  const s = fams.filter(f => f.abrev !== 'F' && f.abrev !== 'V' && f.espaciamiento != null && f.espaciamiento > 0).map(f => f.espaciamiento!);
  return s.length ? Math.round(s.reduce((a, x) => a + 1 / x, 0) * 10) / 10 : null;
}

export function completar(r: Reporte, o: { soloDerivados?: boolean; rehacer?: boolean } = {}): Reporte {
  const sug = new Set(r.sugeridos ?? []);
  const libre = (clave: string, vacio: boolean) => vacio || sug.has(clave);
  let n: Reporte = r, cambio = false;
  const poner = (parche: Partial<Reporte>, clave: string) => { n = { ...n, ...parche }; sug.add(clave); cambio = true; };

  const h = hastaDe(r.desde, r.avance);
  if (h && h !== r.hasta && libre('hasta', !r.hasta.trim())) poner({ hasta: h }, 'hasta');

  const jf = jvDeFamilias(r.familias);
  if (jf != null) {
    if (jf !== r.jv && libre('jv', r.jv == null)) poner({ jv: jf }, 'jv');
    const ponerRmr = (id: 'espaciamiento' | 'persistencia' | 'rqd', v: number) => {
      if (ZONAS.every(z => n.rmr[z][id] === v) || !libre(`rmr.${id}`, ZONAS.every(z => n.rmr[z][id] == null))) return;
      const rmr = { ...n.rmr }; for (const z of ZONAS) rmr[z] = { ...rmr[z], [id]: v };
      poner({ rmr }, `rmr.${id}`);
    };
    ponerRmr('rqd', puntajeRqd(rqdDesdeJv(jf)));
    const esp = r.familias.filter(f => f.abrev !== 'F' && f.abrev !== 'V' && f.espaciamiento != null && f.espaciamiento > 0).map(f => f.espaciamiento!);
    ponerRmr('espaciamiento', pEsp(Math.min(...esp)));
    const nSD = r.familias.filter(f => f.abrev !== 'F' && f.abrev !== 'V').length;
    const jn = jnDe(nSD, false);
    if (ZONAS.some(z => n.q[z].jn !== jn) && libre('q.jn', ZONAS.every(z => n.q[z].jn == null))) {
      const q = { ...n.q }; for (const z of ZONAS) q[z] = { ...q[z], jn }; poner({ q }, 'q.jn');
    }
  }
  const pers = r.familias.filter(f => f.persistencia != null && f.persistencia > 0).map(f => f.persistencia!);
  if (pers.length) {
    const v = pPers(Math.max(...pers));
    if (!ZONAS.every(z => n.rmr[z].persistencia === v) && libre('rmr.persistencia', ZONAS.every(z => n.rmr[z].persistencia == null))) {
      const rmr = { ...n.rmr }; for (const z of ZONAS) rmr[z] = { ...rmr[z], persistencia: v }; poner({ rmr }, 'rmr.persistencia');
    }
  }

  if (!o.soloDerivados) {
    const cc = calcular(n);
    if (cc.propuesta && libre('sostenimiento', !n.sostenimiento.length) && n.sostenimiento.join('|') !== cc.propuesta.lineas.join('|')) poner({ sostenimiento: [...cc.propuesta.lineas] }, 'sostenimiento');
    if (cc.rmrFinal != null && libre('condicion', !n.condicion.trim())) {
      const t = redactarCondicion(n, calcular(n));
      if (t !== n.condicion) poner({ condicion: t }, 'condicion');
    }
  }
  return cambio ? { ...n, sugeridos: [...sug] } : r;
}

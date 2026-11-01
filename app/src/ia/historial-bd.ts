// Historial importado de la base de mapeos del usuario (BD_Mapeos_Geomecanicos.xlsx).
// Se lee en el celular y se guarda solo ahí: con él la IA propone los valores habituales de cada labor.
// Validado con 724 mapeos de Justa: la moda de los últimos 5 de la misma labor acierta el valor exacto
// en 65–100 % según el parámetro (agua 99 %, Jr 92 %, RQD 83 %, resistencia 73 %, relleno 65 %).
import { nuevoReporte, type Familia, type Reporte } from '../model';
import { ZONAS, type ParamId } from '../core/rmr';

/** Lee la primera hoja de un .xlsx como filas de texto (sin librerías pesadas). */
export async function leerHoja(datos: ArrayBuffer): Promise<string[][]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(datos);
  const xml = (p: string) => zip.file(p)?.async('string');
  const dom = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
  const ss = await xml('xl/sharedStrings.xml');
  const compartidos = ss ? [...dom(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent ?? '').join('')) : [];
  // la hoja que tenga la columna "Labor" (la BD puede traer hojas auxiliares)
  const hojas = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.slice(19)) - parseInt(b.slice(19)));
  const col = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  for (const h of hojas) {
    const d = dom((await xml(h))!);
    const filas: string[][] = [];
    for (const row of d.getElementsByTagName('row')) {
      const f: string[] = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        f[col(c.getAttribute('r') ?? 'A')] = t === 's' ? compartidos[+v] ?? '' : t === 'inlineStr' ? c.getElementsByTagName('t')[0]?.textContent ?? '' : v;
      }
      filas.push(Array.from(f, x => x ?? ''));
    }
    if (filas.slice(0, 10).some(f => f.some(x => norm(x) === 'labor'))) return filas;
  }
  throw new Error('No encontré una hoja con la columna "Labor".');
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** "Rampa Norte", "RP NORTE", "Rp_Norte" → "rpnorte" para comparar labores. */
export const claveLabor = (s: string) => norm(s).replace(/\brampa\b/g, 'rp').replace(/[^a-z0-9]/g, '');

const fechaISO = (v: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const n = Number(v); if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) { const [, d, mo, a] = m as unknown as [string, string, string, string]; return `${a.length === 2 ? '20' + a : a}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  return '';
};

const COL_RMR: [ParamId, string][] = [
  ['ucs', 'resistencia a la compresion'], ['rqd', 'rqd'], ['espaciamiento', 'espaciamiento'], ['persistencia', 'persistencia'],
  ['abertura', 'abertura'], ['rugosidad', 'rugosidad'], ['relleno', 'relleno'], ['alteracion', 'alteracion'], ['agua', 'agua subterranea'],
];
const COL_Q: [string, string][] = [['jn', '(jn)'], ['jr', '(jr)'], ['ja', '(ja)'], ['jw', '(jw)'], ['srf', '(srf)']];
const abrevDe = (d: string) => { const x = norm(d); return x.startsWith('falla') ? 'F' : x.startsWith('veta') ? 'V' : x.startsWith('contacto') ? 'C' : 'SD'; };

/** Convierte las filas de la BD en reportes "de historial" (solo lectura, marcados con importado). */
export function desdeFilas(filas: string[][]): Reporte[] {
  const ih = filas.findIndex(f => f.some(x => norm(x) === 'labor'));
  if (ih < 0) return [];
  const cab = filas[ih]!.map(norm);
  const exacta = (n: string) => cab.indexOf(n);
  const contiene = (n: string, no?: string) => cab.findIndex(c => c.includes(n) && (!no || !c.includes(no)));
  const num = (f: string[], i: number) => { if (i < 0) return null; const v = Number(String(f[i] ?? '').replace(',', '.')); return f[i] !== '' && Number.isFinite(v) ? v : null; };
  const iL = exacta('labor'), iF = exacta('fecha'), iT = exacta('turno'), iLit = exacta('litologia'), iD = contiene('progresiva - desde'), iH = contiene('progresiva - hasta');
  const iOr = exacta('orientacion'), iItem = exacta('item'), iRqdQ = exacta('rqd (rqd)');
  const iR: Record<string, number> = Object.fromEntries(COL_RMR.map(([id, n]) => [id, id === 'rqd' ? exacta('rqd') : contiene(n, 'numero')]));
  const iQ: Record<string, number> = Object.fromEntries(COL_Q.map(([id, n]) => [id, contiene(n)]));
  const out: Reporte[] = [];
  filas.slice(ih + 1).forEach((f, k) => {
    const labor = (f[iL] ?? '').trim(); if (!labor) return;
    const r = nuevoReporte();
    r.id = `bd-${f[iItem] || k + 1}`; r.importado = true; r.labor = labor; r.fecha = fechaISO(f[iF] ?? '');
    r.creado = r.modificado = (r.fecha || '2000-01-01') + 'T00:00:00.000Z'; r.sincronizado = true;
    r.turno = /noche/i.test(f[iT] ?? '') ? 'Noche' : /d[ií]a/i.test(f[iT] ?? '') ? 'Día' : '';
    r.desde = f[iD] ?? ''; r.hasta = f[iH] ?? '';
    for (const z of ZONAS) {
      for (const [id] of COL_RMR) { const v = num(f, iR[id] ?? -1); if (v != null) r.rmr[z][id] = v; }
      r.ajuste[z] = num(f, iOr); r.litologia[z] = (f[iLit] ?? '').trim();
      for (const [id] of COL_Q) { const v = num(f, iQ[id] ?? -1); if (v != null) (r.q[z] as Record<string, number>)[id] = v; }
    }
    // RQD (%) del bloque Q → Jv equivalente (RQD = 115 − 3.3·Jv), para que el Q del historial se pueda recalcular.
    const rq = num(f, iRqdQ); if (rq != null && rq > 0) r.jv = Math.max(0, Math.round((115 - Math.min(100, rq)) / 3.3 * 10) / 10);
    const fams: Familia[] = [];
    for (let j = 1; j <= 5; j++) {
      const dip = num(f, contiene(`buzamiento (familia ${j})`, 'd. buz')), dd = num(f, contiene(`d. buz (familia ${j})`));
      if (dip != null && dd != null) fams.push({ abrev: abrevDe(f[contiene(`descripcion (familia ${j})`)] ?? ''), dip, dipdir: dd });
    }
    if (fams.length) r.familias = fams;
    out.push(r);
  });
  return out;
}

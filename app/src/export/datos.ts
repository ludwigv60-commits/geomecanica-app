// Qué va en cada casilla del formato. Lo usan la exportación a Excel y a PDF.
import { PARAMETROS, ZONAS, type Zona } from '../core/rmr';
import { calcular } from '../calc';
import { ITEMS_VERIF, type Reporte } from '../model';

const COL: Record<Zona, string> = { HI: 'S', CORONA: 'U', HD: 'W' };
const ST_IDX: Record<string, number> = { 'I/II': 0, 'III-A': 1, 'III-B': 2, 'IV': 3, 'V': 4 };

export const fechaCorta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const fmt = (n: number | null | undefined, d = 1) => (n == null ? '' : Number.isInteger(n) && d === 1 ? n.toFixed(1) : n.toFixed(d));
const ang = (n: number | null) => (n == null ? '' : `${String(Math.round(n)).padStart(3, '0')}°`);

export interface Casilla {
  clave: string;          // clave del mapa de celdas (ver mapa-celdas.json)
  celda: string;          // celda superior izquierda en Excel
  valor: string | number;
  formula?: boolean;      // la celda tiene fórmula en la plantilla; solo se escribe el valor calculado
  multilinea?: boolean;
}
export interface Marca { clave: string; celda: string; texto: string }

export function casillas(r: Reporte): { casillas: Casilla[]; marcas: Marca[] } {
  const c = calcular(r);
  const out: Casilla[] = [];
  const put = (clave: string, celda: string, valor: string | number | null | undefined, extra: Partial<Casilla> = {}) => {
    if (valor === null || valor === undefined || valor === '') return;
    out.push({ clave, celda, valor, ...extra });
  };
  put('labor', 'F7', r.labor); put('correlativo', 'U7', r.correlativo);
  put('supervisor', 'E8', r.supervisor); put('ancho', 'O8', r.ancho); put('fecha', 'S8', fechaCorta(r.fecha)); put('turno', 'W8', r.turno);
  put('desde', 'C9', r.desde); put('hasta', 'F9', r.hasta); put('avance', 'K9', r.avance != null ? fmt(r.avance) : null);
  put('alto', 'O9', r.alto); put('azimut', 'S9', r.azimut != null ? `${Math.round(r.azimut)}°` : null); put('riesgo', 'W9', r.nivelRiesgo);

  for (const z of ZONAS) {
    const col = COL[z];
    PARAMETROS.forEach((p, i) => put(`${z}_${11 + i}`, `${col}${11 + i}`, r.rmr[z][p.id]));
    put(`${z}_20`, `${col}20`, c.zonas[z].basico, { formula: true });
    put(`${z}_21`, `${col}21`, r.ajuste[z]);
    put(`${z}_22`, `${col}22`, c.zonas[z].total, { formula: true });
    put(`${z}_q23`, `${col}23`, c.rqd);
    const q = r.q[z];
    put(`${z}_q24`, `${col}24`, q.jn); put(`${z}_q25`, `${col}25`, q.jr); put(`${z}_q26`, `${col}26`, q.ja);
    put(`${z}_q27`, `${col}27`, q.jw); put(`${z}_q28`, `${col}28`, q.srf);
    put(`${z}_q29`, `${col}29`, c.zonas[z].q, { formula: true });
  }
  put('jv', 'D26', r.jv); put('rqd', 'D28', c.rqd, { formula: true });
  ZONAS.forEach((z, i) => {
    const row = 24 + 2 * i;
    put(`lit_${z}`, `F${row}`, r.litologia[z]);
    put(`litRmr_${z}`, `I${row}`, c.zonas[z].total, { formula: true });
  });
  r.familias.slice(0, 5).forEach((f, i) => {
    const row = 25 + i; // la columna Familia ya trae impreso 1 a 5 (filas 25-29)
    put(`abrev_${i}`, `K${row}`, f.abrev); put(`dip_${i}`, `M${row}`, f.dip != null ? `${Math.round(f.dip)}°` : null); put(`dd_${i}`, `N${row}`, ang(f.dipdir));
  });
  put('condicion', 'A31', r.condicion, { multilinea: true });
  put('observaciones', 'S31', r.observaciones, { multilinea: true });
  put('indicaciones', 'N57', r.sostenimiento.filter(Boolean).map(l => `• ${l}`).join('\n'), { multilinea: true });
  r.adicionales.slice(0, 2).forEach((a, i) => {
    const row = 64 + 2 * i;
    put(`ad_${i}_fecha`, `A${row}`, fechaCorta(a.fecha)); put(`ad_${i}_hora`, `D${row}`, a.hora);
    put(`ad_${i}_nombre`, `F${row}`, a.nombre); put(`ad_${i}_indicacion`, `N${row}`, a.indicacion, { multilinea: true });
  });
  ['A', 'G', 'M', 'S'].forEach((col, i) => {
    const f = r.firmas[i];
    if (!f) return;
    if (f.nombre) out.push({ clave: `firmaNombre_${i}`, celda: `${col}71`, valor: `Nombre: ${f.nombre}` });
    if (f.fecha) out.push({ clave: `firmaFecha_${i}`, celda: `${col}72`, valor: `Fecha: ${fechaCorta(f.fecha)}` });
  });

  // Opciones que en papel se encierran en un círculo.
  const marcas: Marca[] = [];
  ITEMS_VERIF.forEach((it, i) => {
    const v = r.verificacion[it];
    if (!v) return;
    const col = v === 'CUMPLE' ? 'M' : v === 'NO CUMPLE' ? 'O' : 'Q';
    marcas.push({ clave: `verif_${i}_${v}`, celda: `${col}${31 + i}`, texto: v });
  });
  const tipo = c.tipoFinal;
  if (tipo) {
    const ST = ['ST - I / II', 'ST - III A', 'ST - III B', 'ST - IV', 'ST - V'];
    const i = ST_IDX[tipo]!;
    marcas.push({ clave: `st_${i}`, celda: `A${57 + i}`, texto: ST[i]! });
  }
  const cas = deducirCasillas(r.sostenimiento);
  if (cas.perno) marcas.push({ clave: `perno_${cas.perno}`, celda: { HELICOIDAL: 'E58', 'SPLIT SET': 'E59', 'CABLE BOLTING': 'E60' }[cas.perno], texto: cas.perno });
  if (cas.pies === 5 || cas.pies === 7 || cas.pies === 10) marcas.push({ clave: `long_${cas.pies} PIES`, celda: `H${{ 5: 58, 7: 59, 10: 60 }[cas.pies]}`, texto: `${cas.pies} PIES` });
  else if (cas.pies) out.push({ clave: 'otroLong', celda: 'H61', valor: `OTRO: ${cas.pies}'` });
  if (cas.shotcreteCm) {
    const fila = { 5: 58, 15: 59, 20: 60, 25: 61 }[cas.shotcreteCm];
    if (fila) marcas.push({ clave: `shot_${cas.shotcreteCm} cm`, celda: `I${fila}`, texto: `${cas.shotcreteCm} cm` });
  }
  if (cas.sacrificio) {
    const t = `SHOTCRETE ${cas.sacrificio}"`;
    const fila = { '1/2': 58, '1': 59, '2': 60 }[cas.sacrificio];
    if (fila) marcas.push({ clave: `sac_${t}`, celda: `K${fila}`, texto: t });
  }
  if (cas.malla) marcas.push({ clave: 'malla', celda: 'K61', texto: 'MALLA ELECTROSOLDADA' });
  return { casillas: out, marcas };
}

/**
 * Lee las líneas de sostenimiento que el ingeniero dejó (editadas o no) y deduce qué marcar en la leyenda,
 * para que las casillas siempre coincidan con lo escrito.
 */
export function deducirCasillas(lineas: string[]) {
  const t = lineas.join(' \n ').toLowerCase().replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  const perno = /cable/.test(t) && !/perno/.test(t) ? 'CABLE BOLTING' as const : /split/.test(t) ? 'SPLIT SET' as const : /helicoidal|perno/.test(t) ? 'HELICOIDAL' as const : null;
  const mp = t.match(/pernos?[^\n]*?(\d+(?:[.,]\d+)?)\s*'/);
  const pies = mp ? Number(mp[1]!.replace(',', '.')) : null;
  // Shotcrete estructural (no el de sacrificio): suma de espesores en pulgadas → cm nominales.
  let pulg = 0;
  for (const linea of t.split('\n')) {
    if (!/shotcrete/.test(linea) || /sacrificio/.test(linea)) continue;
    for (const m of linea.matchAll(/(\d+(?:\/\d+)?)\s*"/g)) pulg += m[1]!.includes('/') ? 0.5 : Number(m[1]);
  }
  const cmNom: Record<number, number> = { 2: 5, 4: 10, 6: 15, 8: 20, 10: 25 };
  const shotcreteCm = pulg ? cmNom[pulg] ?? Math.round(pulg * 2.54) : null;
  const ms = t.match(/shotcrete\s*(1\/2|\d+)\s*"[^\n]*sacrificio/);
  const sacrificio = ms ? (ms[1] as '1/2' | '1' | '2') : null;
  const malla = /malla/.test(t);
  return { perno, pies, shotcreteCm, sacrificio, malla };
}

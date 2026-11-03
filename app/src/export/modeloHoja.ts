// REPORTE MODELO en UNA hoja A4, con el diseño del formato oficial PRT-JS-CLD-16 (logos AESA y Marcobre,
// bandas azules, celdas grises) y los datos de la ficha VG: cobertura, Q' y GSI, códigos S-L-T-R-F-A-W y foto
// real del frente. La misma hoja se exporta a Excel y se dibuja en el PDF (libroPdf), así salen idénticos.
import type { Listas, Reporte } from '../model';
import { ITEMS_VERIF } from '../model';
import { datosModelo, LEYENDA, clasesLeyenda } from './modelo';
import { deducirCasillas } from './datos';
import { analizarCunas, resumen } from './cunas2d';
import { SYSTRA_5x5, PERNO_SYSTRA, mAPies } from '../core/sostenimiento';
import { Libro, medidas, type Estilo, type ImagenLibro } from './xlsxSimple';

export const NC = 24;
const AZUL = '#1F5FA8', GRIS = '#D9D9D9', GRIS2 = '#EDEDED', TINTA = '#1F3A93', AMARILLO = '#FFF2CC';
const ST_ROTULO: Record<string, string> = { 'I/II': 'ST - I / II', 'III-A': 'ST - III A', 'III-B': 'ST - III B', 'IV': 'ST - IV', 'V': 'ST - V' };
const ST_COLOR: Record<string, [string, string]> = { 'I/II': ['#2E75B6', '#FFFFFF'], 'III-A': ['#FFFF00', '#000000'], 'III-B': ['#ED7D31', '#000000'], 'IV': ['#C00000', '#FFFFFF'], 'V': ['#CC0099', '#FFFFFF'] };
const RANGO: Record<string, string> = { 'I/II': '66-100', 'III-A': '57-65', 'III-B': '45-56', 'IV': '36-44', 'V': '0-35' };

export interface RecursosModelo {
  logoAesa?: Uint8Array; logoMarcobre?: Uint8Array;
  planta?: Uint8Array; seccion?: Uint8Array; frente?: Uint8Array; fs?: Uint8Array; frenteAspecto?: number;
  /** Dibujo en vectores para el PDF (caja en puntos, y hacia abajo). */
  pdf?: { planta?: ImagenLibro['pdf']; seccion?: ImagenLibro['pdf']; frente?: ImagenLibro['pdf']; fs?: ImagenLibro['pdf'] };
}

const num = (v: number | null | undefined, d = 0): string | number => (v == null ? '' : d ? Number(v.toFixed(d)) : v);
const fechaPe = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

export function hojaModelo(r: Reporte, listas: Partial<Listas> | undefined, rec: RecursosModelo = {}): Libro {
  const d = datosModelo(r, listas);
  const L = new Libro('REPORTE MODELO', Array(NC).fill(4)); L.unaHoja = true;
  const put = (f: number, c0: number, c1: number, v: string | number | null | undefined, e: Estilo = {}, f1 = f) => L.poner(f, c0, v, { tam: 6.5, ...e }, f1 > f || c1 > c0 ? [f1, c1] : undefined);
  const et = (f: number, c0: number, c1: number, v: string, e: Estilo = {}, f1 = f) => put(f, c0, c1, v, { b: true, fondo: GRIS, tam: 6, ...e }, f1);
  const val = (f: number, c0: number, c1: number, v: string | number | null | undefined, e: Estilo = {}, f1 = f) => put(f, c0, c1, v === '' || v == null ? '' : v, { color: TINTA, tam: 7, ...e }, f1);
  const banda = (f: number, c0: number, c1: number, v: string) => put(f, c0, c1, v, { b: true, fondo: AZUL, color: '#FFFFFF', tam: 7.5 });
  const alto = (f0: number, f1: number, h: number) => { for (let i = f0; i <= f1; i++) L.alto(i, h); };

  // ---- encabezado (como el formato oficial) ----
  alto(0, 0, 18); alto(1, 2, 12);
  put(0, 0, 3, '', {}, 2); put(0, 19, 23, '', {});
  if (rec.logoAesa) L.imagen(rec.logoAesa, 'png', [0, 0, 4, 3]);
  if (rec.logoMarcobre) L.imagen(rec.logoMarcobre, 'png', [19, 0, 24, 1]);
  put(0, 4, 18, 'SISTEMA DE GESTIÓN DE CALIDAD', { b: true, tam: 7 });
  put(1, 4, 18, `${d.titulo} · INDICACIÓN Y CARACTERIZACIÓN GEOMECÁNICA`, { b: true, tam: 9 });
  put(2, 4, 18, 'UNIDAD MINERA MINA JUSTA', { b: true, tam: 7 });
  put(1, 19, 23, 'Código Aesa: PRT-JS-CLD-16', { b: true, tam: 6 }); put(2, 19, 23, 'Ficha VG · Caracterización y clasificación', { tam: 5.5 });
  alto(3, 3, 11);
  et(3, 0, 1, 'Obra:', { izq: true }); put(3, 2, 15, 'CONSTRUCCIÓN DE RAMPAS NORTE Y SUR Y PREPARACIÓN DE MINA DEL PROYECTO JUSTA SUBTERRÁNEA', { b: true, tam: 6 });
  et(3, 16, 17, 'Cliente:', { izq: true }); put(3, 18, 23, 'MARCOBRE S.A.C', { b: true, tam: 6.5 });
  alto(4, 4, 13); banda(4, 0, 23, d.ficha);

  // ---- datos de la labor y cobertura ----
  alto(5, 8, 11);
  et(5, 0, 4, 'LABOR'); et(5, 5, 7, 'RAMPA'); et(5, 8, 9, 'N° CORREL.'); et(5, 10, 15, 'SUP. DE GEOMECÁNICA'); et(5, 16, 18, 'FECHA'); et(5, 19, 20, 'TURNO'); et(5, 21, 23, 'HORA');
  val(6, 0, 4, d.labor); val(6, 5, 7, d.rampa ? `Rampa ${d.rampa}` : ''); val(6, 8, 9, d.correlativo); val(6, 10, 15, d.supervisor); val(6, 16, 18, fechaPe(d.fecha)); val(6, 19, 20, d.turno); val(6, 21, 23, d.hora);
  et(7, 0, 2, 'DESDE (PK)'); et(7, 3, 5, 'HASTA (PK)'); et(7, 6, 7, 'AVANCE (m)'); et(7, 8, 9, 'ANCHO (m)'); et(7, 10, 11, 'ALTO (m)'); et(7, 12, 14, 'AZIMUT'); et(7, 15, 17, 'NIVEL DE RIESGO'); et(7, 18, 23, d.rampa ? `COBERTURA · RAMPA ${d.rampa.toUpperCase()}` : 'COBERTURA', { fondo: '#FFD966' });
  val(8, 0, 2, d.desde); val(8, 3, 5, d.hasta); val(8, 6, 7, num(d.avance, 1)); val(8, 8, 9, num(d.ancho, 1)); val(8, 10, 11, num(d.alto, 1)); val(8, 12, 14, d.azimut != null ? `${Math.round(d.azimut)}° UTM` : '');
  val(8, 15, 17, d.riesgo);
  val(8, 18, 23, d.cobertura ? `${d.cobertura.m} m` : d.rampa ? 'sin tabla' : '—', { b: true, tam: 8.5, fondo: AMARILLO });

  // ---- RMR (izquierda) y Q de Barton (derecha), fila a fila ----
  alto(9, 9, 12); banda(9, 0, 13, 'MAPEO GEOMECÁNICO SEGÚN RMR89 (BIENIAWSKI)'); banda(9, 14, 23, "CLASIFICACIÓN Q (BARTON) · Q' · GSI");
  alto(10, 23, 10.5);
  et(10, 0, 4, 'Parámetro'); d.zonas.forEach((z, i) => et(10, 5 + 3 * i, 7 + 3 * i, z.nombre));
  et(10, 14, 17, 'Parámetro'); d.zonas.forEach((z, i) => et(10, 18 + 2 * i, 19 + 2 * i, z.nombre));
  d.zonas[0]!.params.forEach((p, i) => {
    const f = 11 + i;
    put(f, 0, 4, p.nombre.replace(' a la compresión uniaxial (MPa)', ' compresión uniaxial').replace(' de discontinuidades (m)', ''), { b: true, tam: 5.8, izq: true, fondo: GRIS2 });
    d.zonas.forEach((z, k) => { put(f, 5 + 3 * k, 6 + 3 * k, z.params[i]!.clase, { tam: 5.2, izq: true, color: TINTA }); val(f, 7 + 3 * k, 7 + 3 * k, num(z.params[i]!.puntaje), { b: true }); });
  });
  const q: [string, (z: (typeof d.zonas)[number]) => string | number, boolean?][] = [
    ['RQD (%)', z => num(z.rqd)], ['Jn · discontinuidades', z => num(z.jn)], ['Jr · rugosidad', z => num(z.jr)], ['Ja · alteración', z => num(z.ja)], ['Jw · agua', z => num(z.jw)], ['SRF · esfuerzos', z => num(z.srf)],
    ['Q = (RQD/Jn)(Jr/Ja)(Jw/SRF)', z => num(z.q), true], ["Q' = (RQD/Jn)(Jr/Ja)", z => num(z.qPrima), true], ["GSI = 9 ln(Q') + 44", z => num(z.gsi), true], ['Clase Q', z => z.claseQ ?? '']];
  q.forEach(([t, v, b], i) => {
    const f = 11 + i;
    put(f, 14, 17, t, { b: true, tam: 5.8, izq: true, fondo: b ? GRIS : GRIS2 });
    d.zonas.forEach((z, k) => val(f, 18 + 2 * k, 19 + 2 * k, v(z), { b, tam: i === 9 ? 5.5 : 7 }));
  });
  const fRes: [string, (z: (typeof d.zonas)[number]) => string | number, Estilo?][] = [['VALOR RMR BÁSICO', z => num(z.basico)], ['AJUSTE ORIENTACIÓN', z => num(z.ajuste)], ['VALOR TOTAL RMR', z => num(z.total)]];
  fRes.forEach(([t, v], i) => { et(20 + i, 0, 4, t, { izq: true }); d.zonas.forEach((z, k) => val(20 + i, 5 + 3 * k, 7 + 3 * k, v(z), { b: i !== 1 })); });
  et(23, 0, 4, 'TIPO DE ROCA', { izq: true });
  d.zonas.forEach((z, k) => { const c = z.tipo ? ST_COLOR[z.tipo] : null; put(23, 5 + 3 * k, 7 + 3 * k, z.tipo ? ST_ROTULO[z.tipo] : '', { b: true, tam: 6.5, ...(c ? { fondo: c[0], color: c[1] } : {}) }); });
  et(21, 14, 15, 'Jv', { tam: 5.8 }); val(21, 16, 17, num(d.jv)); et(21, 18, 19, 'RQD', { tam: 5.8 }); put(21, 20, 23, 'RQD = 115 − 3.3·Jv', { i: true, tam: 6 });
  et(22, 14, 17, 'LITOLOGÍA', { izq: true }); d.zonas.forEach((z, k) => val(22, 18 + 2 * k, 19 + 2 * k, z.litologia, { tam: 5.8 }));
  const cT = d.tipoFinal ? ST_COLOR[d.tipoFinal] : null;
  et(23, 14, 16, 'RMR DISEÑO'); val(23, 17, 18, num(d.rmrFinal), { b: true, tam: 8 });
  put(23, 19, 23, d.tipoFinal ? ST_ROTULO[d.tipoFinal] : '', { b: true, tam: 8, ...(cT ? { fondo: cT[0], color: cT[1] } : {}) });

  // ---- discontinuidades con códigos S-L-T-R-F-A-W + leyenda ----
  alto(24, 24, 12); banda(24, 0, 15, 'DISCONTINUIDADES'); banda(24, 16, 23, 'LEYENDA S-L-T-R-F-A-W');
  alto(25, 31, 10.5);
  const cab: [string, number, number][] = [['N°', 0, 0], ['Código', 1, 1], ['Tipo', 2, 4], ['Dip', 5, 5], ['Dip Dir.', 6, 7], ['Espac. (m)', 8, 9], ['Pers./Pot. (m)', 10, 11], ['S-L-T-R-F-A-W', 12, 15]];
  for (const [t, a, b] of cab) et(25, a, b, t, { tam: 5.6 });
  for (let i = 0; i < 6; i++) {
    const e = d.estructuras[i], f = 26 + i;
    put(f, 0, 0, i + 1, { tam: 6 });
    val(f, 1, 1, e?.codigo, { b: true }); val(f, 2, 4, e?.tipo, { tam: 5.6 }); val(f, 5, 5, e?.dip != null ? Math.round(e.dip) : '');
    val(f, 6, 7, e?.dipdir != null ? String(Math.round(e.dipdir)).padStart(3, '0') : ''); val(f, 8, 9, num(e?.espaciamiento, 2)); val(f, 10, 11, num(e?.persistencia ?? e?.potencia, 1));
    val(f, 12, 15, e?.slt, { b: true, tam: 6.2 });
  }
  et(25, 16, 16, '', {}); LEYENDA.forEach((l, i) => et(25, 17 + i, 17 + i, l.letra, { tam: 6.5 }));
  for (let k = 0; k < 5; k++) {
    et(26 + k, 16, 16, String(k + 1), { tam: 6 });
    LEYENDA.forEach((l, i) => put(26 + k, 17 + i, 17 + i, clasesLeyenda(l.id)[k] ?? '', { tam: 4.4 }));
  }
  put(31, 16, 23, 'S espaciado · L persistencia · T apertura · R rugosidad · F relleno · A alteración · W agua', { tam: 4.6, i: true });

  // ---- fotografía del frente (la del celular, con las trazas) | vista planta ----
  // el ancho de la foto sigue su forma: vertical (celular parado) más angosta, horizontal más ancha
  const a = analizarCunas(r), rs = a && a.bloques.length ? resumen(a) : null;
  const [iw, ih] = rec.frente ? medidas(rec.frente) : [0, 0], asp = rec.frenteAspecto ?? (iw && ih ? iw / ih : 0.75);
  const cF = asp < 0.95 ? 7 : asp < 1.2 ? 9 : 12;            // columnas de la foto
  const anchoF = cF * L.anchoDe(0), filasF = Math.min(15, Math.max(12, Math.round(anchoF / asp / 11)));
  const f0 = 33, f1 = f0 + filasF - 1, fc = f1 + 1;
  alto(32, 32, 12); banda(32, 0, cF - 1, 'FOTOGRAFÍA DEL FRENTE'); banda(32, cF, 23, 'VISTA PLANTA');
  alto(f0, f1, 11);
  put(f0, 0, cF - 1, rec.frente || rec.pdf?.frente ? '' : 'Sin fotografía del frente', { tam: 6 }, f1);
  put(f0, cF, 23, rec.planta || rec.pdf?.planta ? '' : 'Falta azimut y estructuras', { tam: 6 }, f1);
  if (rec.frente || rec.pdf?.frente) L.imagen(rec.frente, 'jpeg', [0, f0, cF, f1 + 1], rec.pdf?.frente);
  if (rec.planta || rec.pdf?.planta) L.imagen(rec.planta, 'png', [cF, f0, 24, f1 + 1], rec.pdf?.planta);
  alto(fc, fc, 10);
  put(fc, 0, cF - 1, 'Amarillo: diaclasas · rojo: fallas', { tam: 5, i: true });
  put(fc, cF, 23, `${d.labor || 'Labor'}${d.azimut != null ? ` · Az ${Math.round(d.azimut)}°` : ''} · fallas, vetas y contactos en su posición`, { tam: 5.2, i: true });

  // ---- sección antes del desatado | con sostenimiento, cada una con su factor de seguridad ----
  const b0 = fc + 1, s0 = b0 + 1, s1 = s0 + 13, sc = s1 + 1;
  alto(b0, b0, 12); banda(b0, 0, 11, 'SECCIÓN · ANTES DEL DESATADO'); banda(b0, 12, 23, 'SECCIÓN · CON SOSTENIMIENTO');
  alto(s0, s1, 11);
  put(s0, 0, 23, rec.seccion || rec.pdf?.seccion ? '' : 'Falta ancho, alto o estructuras', { tam: 6 }, s1);
  if (rec.seccion || rec.pdf?.seccion) L.imagen(rec.seccion, 'png', [0, s0, 24, s1 + 1], rec.pdf?.seccion);
  alto(sc, sc, 16);
  put(sc, 0, 23, `FS = fuerza que sostiene la cuña ÷ fuerza que la hace caer (por metro de labor). FS < 1 cae · 1 – 1.5 riesgo ALTO · 1.5 – 2 MEDIO · ≥ 2 BAJO (estable)${a?.zi ? ` · zona de influencia ${Math.round(a.zi.pct * 100)} % (${a.zi.tipo})` : ''}${(a?.notas ?? []).find(n => /no corta (el frente|la labor)/.test(n)) ? ' · ' + (a!.notas.find(n => /no corta (el frente|la labor)/.test(n))) : ''}`, { tam: 5.2, i: true, ajustar: true });
  const g0 = sc + 1; // fila donde sigue la hoja
  // ---- condición geomecánica | sostenimiento (como la ficha Systra) ----
  alto(g0, g0, 12); banda(g0, 0, 11, 'CONDICIÓN GEOMECÁNICA'); banda(g0, 12, 23, 'TIPO DE SOSTENIMIENTO');
  alto(g0 + 1, g0 + 8, 10.5);
  const cond = [d.formacion ? `Formación geológica / alteración: ${d.formacion}.` : '', /^macizo rocoso/i.test(d.macizo) ? d.macizo : `Macizo rocoso: ${d.macizo}`, `Discontinuidades: ${d.discontinuidades.replace(/\n/g, ' ')}`].filter(Boolean).join('\n');
  put(g0 + 1, 0, 11, cond, { tam: 5.6, izq: true, arriba: true, ajustar: true, color: TINTA }, g0 + 6);
  et(g0 + 7, 0, 1, 'Verif. sost. anterior', { tam: 4.6, ajustar: true }, g0 + 8);
  ITEMS_VERIF.slice(0, 5).forEach((it, i) => { et(g0 + 7, 2 + 2 * i, 3 + 2 * i, it, { tam: 4.6 }); val(g0 + 8, 2 + 2 * i, 3 + 2 * i, d.verificacion[it] || '', { tam: 5.6, b: true }); });
  const tS = d.tipoFinal, cS = tS ? ST_COLOR[tS] : null;
  et(g0 + 1, 12, 15, 'Colocar sostenimiento para roca', { tam: 5.6 });
  put(g0 + 1, 16, 23, tS ? `TIPO ${ST_ROTULO[tS]}  (RMR ${RANGO[tS]})` : 'Sin RMR de diseño', { b: true, tam: 8, ...(cS ? { fondo: cS[0], color: cS[1] } : {}) });
  put(g0 + 2, 12, 23, d.sostenimiento.length ? d.sostenimiento.join(' + ').replace(/\.\s*\+/g, ' +') : 'Sin indicación de sostenimiento', { tam: 6.6, b: true, izq: true, arriba: true, ajustar: true, color: TINTA }, g0 + 4);
  const cas = deducirCasillas(d.sostenimiento), txt = d.sostenimiento.join(' ').replace(/,/g, '.');
  const me = txt.match(/(\d+(?:\.\d+)?)\s*m?\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  const chips: [string, string][] = [['Perno', cas.perno ? cas.perno.replace('HELICOIDAL', 'Helicoidal').replace('SPLIT SET', 'Split Set').replace('CABLE BOLTING', 'Cable') : '—'], ['Longitud', cas.pies ? `${cas.pies}'` : '—'], ['Espaciam.', me ? `${me[1]} × ${me[2]} m` : '—'], ['Shotcrete', cas.shotcreteCm ? `${cas.shotcreteCm} cm` : '—'], ['Sacrificio', cas.sacrificio ? `${cas.sacrificio}"` : '—'], ['Malla', cas.malla ? 'Sí' : '—']];
  chips.forEach(([t, v], i) => { et(g0 + 5, 12 + 2 * i, 13 + 2 * i, t, { tam: 5 }); val(g0 + 6, 12 + 2 * i, 13 + 2 * i, v, { tam: 6.2, b: true }); });
  const sy = tS ? SYSTRA_5x5.find(x => x.tipo === (tS === 'V' ? 'V-A' : tS)) : null;
  put(g0 + 7, 12, 23, sy ? `Referencia Systra (sección 5×5) ${ST_ROTULO[tS!]}: ${[sy.pernosPorFila ? `${sy.pernosPorFila} pernos helicoidales/fila de ${mAPies(PERNO_SYSTRA.longitudM)}' a ${sy.espaciamiento![0].toFixed(1)} × ${sy.espaciamiento![1].toFixed(1)} m` : '', sy.shotcreteCm.length ? `shotcrete ${sy.shotcreteCm.join(' + ')} cm` : 'sin shotcrete', sy.marcos ?? '', `avance máx. ${sy.avanceMax} m`].filter(Boolean).join(' · ')}` : '', { tam: 5.2, i: true, izq: true, ajustar: true, color: '#444444' }, g0 + 8);

  // ---- observaciones e indicaciones adicionales ----
  alto(g0 + 9, g0 + 9, 12); banda(g0 + 9, 0, 11, 'OBSERVACIONES'); banda(g0 + 9, 12, 23, 'INDICACIONES ADICIONALES');
  alto(g0 + 10, g0 + 12, 10.5);
  const obs = [cond && rs && rs.antes.ALTO ? `Formación de cuñas en ${[...new Set(a!.bloques.filter(b => b.riesgo0 === 'ALTO').map(b => b.zona))].map(z => z === 'CORONA' ? 'la corona' : z === 'HI' ? 'el hastial izquierdo' : 'el hastial derecho').join(', ')}: desatar y sostener de inmediato.` : '', d.observaciones || ''].filter(Boolean).join('\n');
  put(g0 + 10, 0, 11, obs, { tam: 5.8, izq: true, arriba: true, ajustar: true, color: TINTA }, g0 + 12);
  const adic = d.adicionales.filter(x => x && (x.indicacion || x.nombre)).map(x => `${fechaPe(x.fecha)} ${x.hora ?? ''} · ${x.nombre ?? ''}: ${x.indicacion ?? ''}`).join('\n');
  put(g0 + 10, 12, 23, adic, { tam: 5.8, izq: true, arriba: true, ajustar: true, color: TINTA }, g0 + 12);

  // ---- firmas ----
  alto(g0 + 13, g0 + 13, 20); alto(g0 + 14, g0 + 16, 10);
  d.firmas.slice(0, 4).forEach((x, i) => {
    const c0 = i * 6, c1 = c0 + 5;
    put(g0 + 13, c0, c1, 'Firma:', { tam: 5.6, izq: true, arriba: true });
    put(g0 + 14, c0, c1, `Nombre: ${x.nombre}`, { tam: 5.8, izq: true, color: TINTA });
    put(g0 + 15, c0, c1, `Fecha: ${fechaPe(x.fecha)}`, { tam: 5.8, izq: true, color: TINTA });
    put(g0 + 16, c0, c1, x.rol, { b: true, tam: 5.8, fondo: GRIS2 });
  });
  return L;
}

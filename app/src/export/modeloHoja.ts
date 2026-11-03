// REPORTE MODELO en UNA hoja A4, con el diseño del formato oficial PRT-JS-CLD-16 (logos AESA y Marcobre,
// bandas azules, celdas grises) y los datos de la ficha VG: cobertura, Q' y GSI, códigos S-L-T-R-F-A-W y foto
// real del frente. La misma hoja se exporta a Excel y se dibuja en el PDF (libroPdf), así salen idénticos.
import type { Listas, Reporte } from '../model';
import { ITEMS_VERIF } from '../model';
import { datosModelo, LEYENDA, clasesLeyenda } from './modelo';
import { deducirCasillas } from './datos';
import { analizarCunas, resumen } from './cunas2d';
import { Libro, type Estilo, type ImagenLibro } from './xlsxSimple';

export const NC = 24;
const AZUL = '#1F5FA8', GRIS = '#D9D9D9', GRIS2 = '#EDEDED', TINTA = '#1F3A93', AMARILLO = '#FFF2CC';
const ST_ROTULO: Record<string, string> = { 'I/II': 'ST - I / II', 'III-A': 'ST - III A', 'III-B': 'ST - III B', 'IV': 'ST - IV', 'V': 'ST - V' };
const ST_COLOR: Record<string, [string, string]> = { 'I/II': ['#2E75B6', '#FFFFFF'], 'III-A': ['#FFFF00', '#000000'], 'III-B': ['#ED7D31', '#000000'], 'IV': ['#C00000', '#FFFFFF'], 'V': ['#CC0099', '#FFFFFF'] };
const RANGO: Record<string, string> = { 'I/II': '66-100', 'III-A': '57-65', 'III-B': '45-56', 'IV': '36-44', 'V': '0-35' };

export interface RecursosModelo {
  logoAesa?: Uint8Array; logoMarcobre?: Uint8Array;
  planta?: Uint8Array; seccion?: Uint8Array; frente?: Uint8Array;
  /** Dibujo en vectores para el PDF (caja en puntos, y hacia abajo). */
  pdf?: { planta?: ImagenLibro['pdf']; seccion?: ImagenLibro['pdf']; frente?: ImagenLibro['pdf'] };
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
  et(7, 0, 2, 'DESDE (PK)'); et(7, 3, 5, 'HASTA (PK)'); et(7, 6, 7, 'AVANCE (m)'); et(7, 8, 9, 'ANCHO (m)'); et(7, 10, 11, 'ALTO (m)'); et(7, 12, 14, 'AZIMUT'); et(7, 15, 17, 'NIVEL DE RIESGO'); et(7, 18, 20, 'PK DE COBERTURA'); et(7, 21, 23, 'COBERTURA', { fondo: '#FFD966' });
  val(8, 0, 2, d.desde); val(8, 3, 5, d.hasta); val(8, 6, 7, num(d.avance, 1)); val(8, 8, 9, num(d.ancho, 1)); val(8, 10, 11, num(d.alto, 1)); val(8, 12, 14, d.azimut != null ? `${Math.round(d.azimut)}° UTM` : '');
  val(8, 15, 17, d.riesgo); val(8, 18, 20, d.cobertura ? Number(d.cobertura.pk.toFixed(1)) : '');
  val(8, 21, 23, d.cobertura ? `${d.cobertura.m} m` : d.rampa ? 'sin tabla' : '—', { b: true, tam: 8.5, fondo: AMARILLO });

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

  // ---- condición geomecánica, verificación y observaciones ----
  alto(32, 32, 12); banda(32, 0, 11, 'CONDICIÓN GEOMECÁNICA'); banda(32, 12, 17, 'VERIFICACIÓN SOSTENIMIENTO ANTERIOR'); banda(32, 18, 23, 'OBSERVACIONES');
  alto(33, 38, 11);
  const cond = [d.formacion ? `Formación / alteración: ${d.formacion}.` : '', /^macizo rocoso/i.test(d.macizo) ? d.macizo : `Macizo rocoso: ${d.macizo}`, `Discontinuidades: ${d.discontinuidades.replace(/\n/g, ' ')}`].filter(Boolean).join('\n');
  put(33, 0, 11, cond, { tam: 5.6, izq: true, arriba: true, ajustar: true, color: TINTA }, 38);
  ITEMS_VERIF.forEach((it, i) => { et(33 + i, 12, 14, it, { tam: 5.4 }); val(33 + i, 15, 17, d.verificacion[it] || '', { tam: 5.8, b: true }); });
  put(38, 12, 17, '', {});
  put(33, 18, 23, d.observaciones || '', { tam: 6, izq: true, arriba: true, ajustar: true, color: TINTA }, 38);

  // ---- vistas: planta | sección | foto real del frente ----
  alto(39, 39, 12); banda(39, 0, 6, 'VISTA PLANTA'); banda(39, 7, 16, 'VISTA SECCIÓN · ANTES Y DESPUÉS DEL DESATADO'); banda(39, 17, 23, 'FOTO DEL FRENTE');
  const fv0 = 40, fv1 = 58; alto(fv0, fv1, 11);
  put(fv0, 0, 6, rec.planta || rec.pdf?.planta ? '' : 'Falta azimut y estructuras', { tam: 6 }, fv1);
  put(fv0, 7, 16, rec.seccion || rec.pdf?.seccion ? '' : 'Falta ancho, alto o estructuras', { tam: 6 }, fv1);
  put(fv0, 17, 23, rec.frente || rec.pdf?.frente ? '' : 'Sin foto del frente', { tam: 6 }, fv1);
  if (rec.planta || rec.pdf?.planta) L.imagen(rec.planta, 'png', [0, fv0, 7, fv1 + 1], rec.pdf?.planta);
  if (rec.seccion || rec.pdf?.seccion) L.imagen(rec.seccion, 'png', [7, fv0, 17, fv1 + 1], rec.pdf?.seccion);
  if (rec.frente || rec.pdf?.frente) L.imagen(rec.frente, 'jpeg', [17, fv0, 24, fv1 + 1], rec.pdf?.frente);
  const a = analizarCunas(r), rs = a && a.bloques.length ? resumen(a) : null;
  alto(59, 59, 16);
  put(59, 0, 6, `${d.labor || 'Labor'}${d.azimut != null ? ` · Az ${Math.round(d.azimut)}°` : ''} · fallas, vetas y contactos en su posición`, { tam: 5.2, ajustar: true });
  put(59, 7, 16, rs ? `${a!.bloques.length} cuñas en la zona de influencia · ${rs.caen} caen al desatar · quedan ${rs.quedan}${rs.fsMin != null ? ` · FS mín. sostenido ${rs.fsMin > 10 ? '>10' : rs.fsMin.toFixed(2)}` : ''}` : 'Sin cuñas potenciales con las estructuras medidas', { tam: 5.2, ajustar: true, b: true });
  put(59, 17, 23, 'Foto real con las trazas mapeadas (amarillo diaclasas, rojo fallas)', { tam: 5.2, ajustar: true });

  // ---- sostenimiento ----
  alto(60, 60, 12); banda(60, 0, 9, 'SOSTENIMIENTO'); banda(60, 10, 23, 'INDICACIONES DE SOSTENIMIENTO');
  alto(61, 66, 10.5);
  et(61, 0, 2, 'Sostenimiento', { tam: 5.6 }); et(61, 3, 4, 'RMR', { tam: 5.6 }); et(61, 5, 9, 'Lo indicado', { tam: 5.6 });
  (['I/II', 'III-A', 'III-B', 'IV', 'V'] as const).forEach((t, i) => {
    const [fo, co] = ST_COLOR[t]!, sel = d.tipoFinal === t;
    put(62 + i, 0, 2, `${sel ? '» ' : ''}${ST_ROTULO[t]}`, { b: true, fondo: fo, color: co, tam: sel ? 6.6 : 6 });
    put(62 + i, 3, 4, RANGO[t], { b: sel, tam: 6 });
  });
  const cas = deducirCasillas(d.sostenimiento);
  const filasS: [string, string][] = [['Perno', cas.perno ? `${cas.perno}${cas.pies ? ` ${cas.pies}'` : ''}` : '—'], ['Shotcrete', cas.shotcreteCm ? `${cas.shotcreteCm} cm` : '—'], ['Sacrificio', cas.sacrificio ? `${cas.sacrificio}"` : '—'], ['Malla', cas.malla ? 'Electrosoldada' : '—'], ['Cobertura', d.cobertura ? `${d.cobertura.m} m` : '—']];
  filasS.forEach(([t, v], i) => { et(62 + i, 5, 6, t, { tam: 5.6 }); val(62 + i, 7, 9, v, { tam: 6, b: true }); });
  put(61, 10, 23, d.sostenimiento.length ? d.sostenimiento.map(l => `• ${l}`).join('\n') : '', { tam: 6.4, izq: true, arriba: true, ajustar: true, color: TINTA }, 66);

  // ---- indicaciones adicionales ----
  alto(67, 67, 12); banda(67, 0, 23, 'INDICACIONES ADICIONALES');
  alto(68, 70, 10.5);
  et(68, 0, 2, 'FECHA'); et(68, 3, 4, 'HORA'); et(68, 5, 10, 'NOMBRE Y APELLIDOS'); et(68, 11, 13, 'FIRMA'); et(68, 14, 23, 'INDICACIÓN');
  for (let i = 0; i < 2; i++) {
    const x = d.adicionales[i], f = 69 + i;
    val(f, 0, 2, x ? fechaPe(x.fecha) : ''); val(f, 3, 4, x?.hora); val(f, 5, 10, x?.nombre, { tam: 6 }); put(f, 11, 13, ''); val(f, 14, 23, x?.indicacion, { tam: 5.8, izq: true, ajustar: true });
  }

  // ---- firmas ----
  alto(71, 71, 20); alto(72, 74, 10);
  d.firmas.slice(0, 4).forEach((x, i) => {
    const c0 = i * 6, c1 = c0 + 5;
    put(71, c0, c1, 'Firma:', { tam: 5.6, izq: true, arriba: true });
    put(72, c0, c1, `Nombre: ${x.nombre}`, { tam: 5.8, izq: true, color: TINTA });
    put(73, c0, c1, `Fecha: ${fechaPe(x.fecha)}`, { tam: 5.8, izq: true, color: TINTA });
    put(74, c0, c1, x.rol, { b: true, tam: 5.8, fondo: GRIS2 });
  });
  return L;
}

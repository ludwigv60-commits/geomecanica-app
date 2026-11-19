// Hoja A4 "VISTA 3D DE CUÑAS · ANTES DEL DESATADO": la perspectiva lateral grande, la planta, la vista desde la
// labor, la sección del frente, los indicadores de riesgo, las estructuras y la lectura del análisis.
// Todo medido para una sola hoja A4 vertical (595 × 842 pt). También: la vista planta del formato con la
// perspectiva 3D y la planta chica en una esquina.
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Reporte } from '../model';
import { calcular } from '../calc';
import { TIPOS } from '../core/rmr';
import { familiasMedidas, vistaPlanta, dd3, type RmrZonas } from './croquis';
import { COLOR_CAE, COLOR_RIESGO, analizarCunas, fsTxt, resumen, vistaCunas } from './cunas2d';
import { dibujarVista, hex, limpiar, partirLineas, rmrDe } from './pdf';
import type { Imagenes3D } from './imagenes3d';

const NAVY = '#0D2A6B', GRAFITO = '#1B2330', ACERO = '#2F6FB3', BORDE = '#D3D9E1', TENUE = '#5B6470', FONDO = '#F4F6F9';
type Caja = [number, number, number, number]; // x0, y0, x1, y1 (y hacia abajo)

/** Rectángulo de esquinas redondeadas (coordenadas con y hacia abajo). */
function redondo(page: PDFPage, [x0, y0, x1, y1]: Caja, r: number, o: { relleno?: string; borde?: string; ancho?: number; opac?: number }) {
  const d = `M${x0 + r} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  page.drawSvgPath(d, { x: 0, y: page.getHeight(), ...(o.relleno ? { color: hex(o.relleno), opacity: o.opac ?? 1 } : {}), ...(o.borde ? { borderColor: hex(o.borde), borderWidth: o.ancho ?? 0.6 } : {}) });
}
async function embeber(doc: PDFDocument, b: Uint8Array): Promise<PDFImage> {
  return b[0] === 0x89 ? doc.embedPng(b) : doc.embedJpg(b);
}
/** Imagen dentro de la caja, del tamaño justo (sin deformar), centrada. */
function imagenEn(page: PDFPage, im: PDFImage, [x0, y0, x1, y1]: Caja) {
  const k = Math.min((x1 - x0) / im.width, (y1 - y0) / im.height), w = im.width * k, h = im.height * k;
  const x = x0 + (x1 - x0 - w) / 2, y = y0 + (y1 - y0 - h) / 2;
  page.drawImage(im, { x, y: page.getHeight() - y - h, width: w, height: h });
  return [x, y, x + w, y + h] as Caja;
}

/** Recuadro de la VISTA PLANTA del formato: perspectiva 3D (antes del desatado) con la planta chica arriba a la izquierda. */
export async function plantaConPerspectiva(doc: PDFDocument, page: PDFPage, font: PDFFont, negrita: PDFFont, r: Reporte, rmr: RmrZonas, img: Uint8Array, caja: Caja) {
  const im = await embeber(doc, img), [x0, y0, x1, y1] = imagenEn(page, im, caja), H = page.getHeight();
  const w = x1 - x0, h = y1 - y0, ih = h * 0.56, iw = Math.min(w * 0.44, ih * 1.25), ins: Caja = [x0 + 3, y0 + 3, x0 + 3 + iw, y0 + 3 + ih];
  redondo(page, ins, 3, { relleno: '#FFFFFF', borde: '#7F8A97', ancho: 0.5, opac: 0.96 });
  const mini = vistaPlanta(r, rmr, true, true);
  if (mini) dibujarVista(page, font, negrita, mini, [ins[0] + 1, ins[1] + 7, ins[2] - 1, ins[3] - 1]);
  page.drawText('PLANTA', { x: ins[0] + 3, y: H - ins[1] - 6, size: 5.2, font: negrita, color: hex(NAVY) });
  const t = limpiar('PERSPECTIVA 3D · ANTES DEL DESATADO'), tw = negrita.widthOfTextAtSize(t, 5);
  void font;
  redondo(page, [x1 - tw - 9, y1 - 11, x1 - 3, y1 - 3], 3, { relleno: '#FFFFFF', opac: 0.9, borde: '#9E1B1B', ancho: 0.4 });
  page.drawText(t, { x: x1 - tw - 6, y: H - y1 + 5, size: 5, font: negrita, color: hex('#9E1B1B') });
}

/** Hoja A4 completa de la vista 3D. */
export async function hojaCunas3D(doc: PDFDocument, font: PDFFont, negrita: PDFFont, r: Reporte, img: Imagenes3D) {
  if (!img.ancho) return;
  const W = 595.28, Hp = 841.89, m = 24, page = doc.addPage([W, Hp]), rmr = rmrDe(r), c = calcular(r);
  const T = (s: string, x: number, y: number, size: number, f = font, color = '#111111', ancla: 'izq' | 'der' | 'centro' = 'izq') => {
    const t = limpiar(s), w = f.widthOfTextAtSize(t, size), xx = ancla === 'der' ? x - w : ancla === 'centro' ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: Hp - y, size, font: f, color: hex(color) }); return w;
  };
  const rect = (b: Caja, color: string, opac = 1) => page.drawRectangle({ x: b[0], y: Hp - b[3], width: b[2] - b[0], height: b[3] - b[1], color: hex(color), opacity: opac });

  // ---- encabezado ----
  rect([0, 0, W, 60], NAVY);
  rect([0, 60, W * 0.34, 63], '#D32F2F'); rect([W * 0.34, 60, W, 63], ACERO);
  T('LK GEOMECÁNICA  ·  INDICACIÓN GEOMECÁNICA PRT-JS-CLD-16', m, 17, 6.4, negrita, '#9CC3F0');
  T('VISTA 3D DE CUÑAS', m, 39, 18, negrita, '#FFFFFF');
  T('Condición antes del desatado · sin sostenimiento · cuñas proyectadas a lo largo del avance', m, 52, 7.4, font, '#DDE6F3');
  const fechaPe = r.fecha ? r.fecha.split('-').reverse().join('/') : '';
  T(r.labor || 'Labor', W - m, 22, 11, negrita, '#FFFFFF', 'der');
  T(`PK ${r.desde || '—'}  a  ${r.hasta || '—'}`, W - m, 36, 8.5, negrita, '#9CC3F0', 'der');
  T([fechaPe, r.turno ? `Turno ${r.turno}` : '', r.correlativo ? `N° ${r.correlativo}` : ''].filter(Boolean).join('  ·  '), W - m, 49, 7.2, font, '#DDE6F3', 'der');

  // ---- fila de datos ----
  const tipo = c.tipoFinal, colT = TIPOS.find(t => t.tipo === tipo);
  const chips: [string, string, string?, string?][] = [
    ['SECCIÓN', r.ancho && r.alto ? `${r.ancho} × ${r.alto} m` : '—'], ['AZIMUT', r.azimut != null ? `${Math.round(r.azimut)}° UTM` : '—'], ['AVANCE', `${img.esc.L.toFixed(1)} m`],
    ['TIPO DE ROCA', tipo ? `${tipo} · RMR ${c.rmrFinal}` : '—', colT?.color, colT?.texto], ['ZONA DE INFLUENCIA', img.esc.zi ? `${Math.round(img.esc.zi.pct * 100)} % · ${img.esc.zi.tipo}` : '—'], ['NIVEL DE RIESGO', r.nivelRiesgo || '—'],
  ];
  const yC = 71, hC = 28, gap = 6, wC = (W - 2 * m - gap * (chips.length - 1)) / chips.length;
  chips.forEach(([et, v, fondo, tinta], i) => {
    const x = m + i * (wC + gap);
    redondo(page, [x, yC, x + wC, yC + hC], 5, { relleno: fondo ?? FONDO, borde: fondo ? undefined : BORDE, ancho: 0.5 });
    T(et, x + 7, yC + 10, 5.4, negrita, fondo ? tinta ?? '#000' : TENUE);
    let s = 9.4; while (s > 6 && negrita.widthOfTextAtSize(limpiar(v), s) > wC - 12) s -= 0.2;
    T(v, x + 7, yC + 22.5, s, negrita, fondo ? tinta ?? '#000' : NAVY);
  });

  // ---- perspectiva principal ----
  const cajaP: Caja = [m, 107, W - m, 107 + (W - 2 * m) / 2];
  const imP = await embeber(doc, img.ancho);
  const [px0, py0, px1, py1] = imagenEn(page, imP, cajaP);
  redondo(page, [px0, py0, px1, py1], 6, { borde: BORDE, ancho: 0.8 });
  { // rótulo arriba a la izquierda
    const t = 'PERSPECTIVA LATERAL · ÚLTIMO AVANCE', tw = negrita.widthOfTextAtSize(limpiar(t), 6.6);
    redondo(page, [px0 + 8, py0 + 8, px0 + 20 + tw, py0 + 22], 7, { relleno: NAVY });
    T(t, px0 + 14, py0 + 17.6, 6.6, negrita, '#FFFFFF');
    T('Antes del desatado: sin pernos, malla ni shotcrete', px0 + 9, py0 + 32, 6, font, '#9E1B1B');
  }
  { // leyenda en una franja bajo la imagen
    const items: { c: string; t: string; linea?: boolean }[] = [{ c: COLOR_CAE, t: 'Cae al desatar (FS < 1)' }, { c: COLOR_RIESGO.ALTO, t: 'Riesgo alto (FS 1 – 1.5)' }, { c: COLOR_RIESGO.MEDIO, t: 'Medio (FS 1.5 – 2)' }, { c: COLOR_RIESGO.BAJO, t: 'Bajo (FS ≥ 2)' },
      ...img.esc.familias.map(f => ({ c: f.color, t: f.texto.split(' · ')[0]!, linea: true })), { c: ACERO, t: 'Zona de influencia', linea: true }];
    const porFila = Math.ceil(items.length / 2), lw = (px1 - px0 - 16) / porFila, lh = 10, by = py1 + 5;
    redondo(page, [px0, by, px1, by + 2 * lh + 6], 5, { relleno: FONDO, borde: BORDE, ancho: 0.5 });
    items.forEach((it, i) => {
      const x = px0 + 8 + (i % porFila) * lw, y = by + 5 + Math.floor(i / porFila) * lh;
      if (it.linea) rect([x, y + 2, x + 11, y + 3.8], it.c); else redondo(page, [x, y, x + 11, y + 5.8], 1.2, { relleno: it.c });
      T(it.t, x + 15, y + 5.4, 5.7, font, '#222222');
    });
  }
  const pyL = py1 + 5 + 26;

  // ---- tres paneles: planta | vista desde la labor | sección del frente ----
  const yR = pyL + 8, hR = 184, wR = (W - 2 * m - 2 * 8) / 3;
  const panel = (i: number, titulo: string) => {
    const x = m + i * (wR + 8), b: Caja = [x, yR, x + wR, yR + hR];
    redondo(page, b, 5, { relleno: '#FFFFFF', borde: BORDE, ancho: 0.7 });
    redondo(page, [x, yR, x + wR, yR + 15], 5, { relleno: GRAFITO }); rect([x, yR + 9, x + wR, yR + 15], GRAFITO);
    T(titulo, x + 7, yR + 10.4, 6.3, negrita, '#FFFFFF');
    return [x + 3, yR + 18, x + wR - 3, yR + hR - 3] as Caja;
  };
  const b1 = panel(0, 'PLANTA · NORTE ARRIBA'), pl = vistaPlanta(r, rmr, true, true);
  if (pl) dibujarVista(page, font, negrita, pl, b1);
  const b2 = panel(1, 'VISTA DESDE LA LABOR HACIA EL FRENTE');
  if (img.frente) imagenEn(page, await embeber(doc, img.frente), b2);
  const b3 = panel(2, 'SECCIÓN DEL FRENTE · ANTES DEL DESATADO');
  const va = vistaCunas(r, rmr, 'antes', (b3[2] - b3[0]) / (b3[3] - b3[1]), true);
  if (va) dibujarVista(page, font, negrita, va, b3);

  // ---- indicadores ----
  const a = analizarCunas(r), rs = a && a.bloques.length ? resumen(a) : null;
  const yK = yR + hR + 9, hK = 50, nK = 6, wK = (W - 2 * m - 6 * (nK - 1)) / nK;
  const kpis: [string, string, string, string][] = [
    ['CUÑAS EN EL FRENTE', String(a?.bloques.length ?? 0), a?.zi ? `zona de influencia ${Math.round(a.zi.pct * 100)} %` : 'zona de influencia', NAVY],
    ['CAEN AL DESATAR', String(rs?.caen ?? 0), rs ? `${rs.pesoCae.toFixed(2)} t por metro` : '—', COLOR_CAE],
    ['RIESGO ALTO', String(rs ? rs.antes.ALTO - rs.caen : 0), 'FS 1 – 1.5', COLOR_RIESGO.ALTO],
    ['RIESGO MEDIO', String(rs?.antes.MEDIO ?? 0), 'FS 1.5 – 2', '#C77700'],
    ['RIESGO BAJO', String(rs?.antes.BAJO ?? 0), 'FS ≥ 2', COLOR_RIESGO.BAJO],
    ['CAE EN EL AVANCE', `${img.esc.volCae.toFixed(2)} m³`, `${img.esc.pesoCae.toFixed(1)} t en ${img.esc.L.toFixed(1)} m`, '#6E0B0B'],
  ];
  kpis.forEach(([et, v, sub, col], i) => {
    const x = m + i * (wK + 6);
    redondo(page, [x, yK, x + wK, yK + hK], 5, { relleno: FONDO, borde: BORDE, ancho: 0.5 });
    rect([x, yK + 4, x + 2.6, yK + hK - 4], col);
    T(et, x + 8, yK + 11, 5.3, negrita, TENUE);
    let s = 16; while (s > 9 && negrita.widthOfTextAtSize(limpiar(v), s) > wK - 14) s -= 0.5;
    T(v, x + 8, yK + 31, s, negrita, col);
    T(sub, x + 8, yK + 43, 5.5, font, TENUE);
  });

  // ---- estructuras | lectura del análisis ----
  const yE = yK + hK + 9, wE = (W - 2 * m - 10) / 2, hE = Hp - 44 - yE;
  const titulo = (x: number, t: string) => { T(t, x, yE + 8, 7.2, negrita, NAVY); rect([x, yE + 11, x + wE, yE + 11.8], NAVY); };
  titulo(m, 'ESTRUCTURAS MAPEADAS');
  const fams = familiasMedidas(r), nombre: Record<string, string> = { SD: 'Diaclasa', F: 'Falla', V: 'Veta', C: 'Contacto' };
  const cols: [string, number][] = [['', 12], ['Código', 34], ['Tipo', 50], ['Dip / Dip dir.', 58], ['Espac. / Pot.', 56], ['Persist.', 40]];
  let x = m, yt = yE + 16;
  rect([m, yt, m + wE, yt + 11], GRAFITO);
  for (const [t, w] of cols) { T(t, x + 3, yt + 7.8, 5.6, negrita, '#FFFFFF'); x += w * (wE / 250); }
  fams.slice(0, 6).forEach((f, i) => {
    const y = yt + 11 + i * 11.5; if (i % 2) rect([m, y, m + wE, y + 11.5], FONDO);
    const col = img.esc.familias.find(q => q.n === f.n)?.color ?? '#555';
    const vals = ['', `${f.abrev}${f.n}`, nombre[f.abrev] ?? f.abrev, `${Math.round(f.dip)}° / ${dd3(f.dipdir)}°`, f.abrev === 'F' || f.abrev === 'V' ? (f.potencia ? `${f.potencia} m` : '—') : (a?.esp[f.n] ? `${a.esp[f.n]!.s} m${a.esp[f.n]!.fuente !== 'medido' ? '*' : ''}` : '—'), f.persistencia ? `${f.persistencia} m` : '—'];
    let xx = m;
    vals.forEach((v, k) => { if (k === 0) rect([xx + 3, y + 4.6, xx + 3 + 8 * (wE / 250), y + 6.8], col); else T(v, xx + 3, y + 8, 6.2, k === 1 ? negrita : font, k === 1 ? col : '#111111'); xx += cols[k]![1] * (wE / 250); });
  });
  if (a && fams.some(f => f.abrev === 'SD' && a.esp[f.n] && a.esp[f.n]!.fuente !== 'medido')) T('* espaciamiento de la clase del RMR (no medido)', m, yt + 11 + Math.min(6, fams.length) * 11.5 + 8, 5.2, font, TENUE);

  const xL = m + wE + 10; titulo(xL, 'LECTURA DEL ANÁLISIS');
  const ptos: string[] = [];
  if (rs && a) {
    const z = (zz: string) => (zz === 'CORONA' ? 'la corona' : zz === 'HI' ? 'el hastial izquierdo' : 'el hastial derecho');
    const zonas = [...new Set(a.bloques.filter(b => b.riesgo0 === 'ALTO').map(b => b.zona))].map(z);
    ptos.push(`En el frente se forman ${a.bloques.length} cuñas dentro de la zona de influencia${a.zi ? ` (${Math.round(a.zi.pct * 100)} %, roca ${a.zi.tipo})` : ''}${zonas.length ? `, con riesgo alto en ${zonas.join(', ')}` : ''}.`);
    if (rs.mayor) ptos.push(`Cuña mayor en ${z(rs.mayor.zona)}: ${rs.mayor.familias.map(n => { const f = fams.find(q => q.n === n); return f ? `${f.abrev}${n}` : n; }).join(' + ')}, altura ${rs.mayor.prof.toFixed(2)} m, ${rs.mayor.peso.toFixed(2)} t por metro.`);
    ptos.push(`FS mínimo sin sostener: ${fsTxt(rs.fs0Min ?? 0)}. Caen al desatar ${rs.caen} cuñas; a lo largo de los ${img.esc.L.toFixed(1)} m de avance se desprenderían unos ${img.esc.volCae.toFixed(2)} m³ (${img.esc.pesoCae.toFixed(1)} t).`);
  } else ptos.push('No se forman cuñas removibles dentro de la zona de influencia con las estructuras medidas.');
  for (const f of fams.filter(q => q.abrev !== 'SD')) {
    const nota = a?.notas.find(n => n.startsWith(`${f.abrev}${f.n} `));
    ptos.push(`${nombre[f.abrev] ?? f.abrev} ${f.abrev}${f.n} ${Math.round(f.dip)}°/${dd3(f.dipdir)}°${f.potencia ? ` (potencia ${f.potencia} m)` : ''}: ${nota ? nota.replace(/^\S+ /, '') : 'cruza la labor en el último avance; las cuñas que toca se apoyan en un plano débil.'}`);
  }
  const fs0 = rs?.fs0Min ?? 99;
  ptos.push(fs0 < 1.5 ? 'Recomendación: desatar de forma sistemática desde lo sostenido hacia el frente y sostener de inmediato, antes de ingresar con personal.' : 'Recomendación: desatar y verificar el contorno antes de sostener.');
  let yy = yE + 22;
  for (const p of ptos) {
    const lin = partirLineas(limpiar(p), font, 6.5, wE - 10);
    if (yy + lin.length * 8.4 > yE + hE) break;
    redondo(page, [xL, yy - 4.8, xL + 3.2, yy - 1.6], 1.6, { relleno: ACERO });
    lin.forEach((l, i) => T(l, xL + 7, yy + i * 8.4, 6.5, font, '#1A1A1A'));
    yy += lin.length * 8.4 + 3.4;
  }

  // ---- pie ----
  rect([m, Hp - 38, W - m, Hp - 37.5], BORDE);
  const nota = `Método: análisis de equilibrio límite 2D de la sección (phi = atan(Jr/Ja) de Barton, sin cohesión, peso unitario 2.7 t/m³) repetido en ${img.esc.tramos} secciones entre el frente y el Desde; cada plano se corre según su orientación respecto del eje, así la red de cuñas es la misma red 3D de diaclasas. Zona de influencia: I/II 8 %, III-A 10 %, III-B 13 %, IV 15 %, V 20 %. Referencial: para el FS 3D de cuñas de tres planos use Unwedge.`;
  partirLineas(limpiar(nota), font, 5, W - 2 * m - 120).forEach((l, i) => T(l, m, Hp - 30 + i * 6.2, 5, font, TENUE));
  const ahora = new Date();
  T('LK Geomecánica', W - m, Hp - 28, 6.5, negrita, NAVY, 'der');
  T(`Generado ${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, W - m, Hp - 20, 5.4, font, TENUE, 'der');
  void rgb;
}

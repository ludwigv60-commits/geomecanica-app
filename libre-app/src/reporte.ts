// Reporte PDF (A4 vertical), diseño propio tipo ficha técnica, sin logos ni marcas.
// Página 1: resultados (RMR, GSI, discontinuidades con estereograma, sostenimiento, firmas).
// Páginas siguientes: registro fotográfico con trazas.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { CLASES, CONDICIONES, ESTRUCTURAS, FACTORES, GRUPOS, LABORES, MATRIZ_GSI, clasePorTipo, type CondicionDisc, type Estructura } from './cartilla';
import { AJUSTES_ORIENTACION, NOMBRE_ZONA, PARAMETROS, ZONAS, rmrBasico, type Zona } from './rmr';
import { TIPOS_ESTRUCTURA, calcular, type Mapeo } from './model';
import { fotoConTrazas } from './Foto';

const W = 595.28, H = 841.89, M = 28, CW = W - 2 * M;
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = hex('#1c2326'), GRIS = hex('#6b757b'), LINEA = hex('#cfd5d8'), SUAVE = hex('#f3f5f6'), CEBRA = hex('#f8f9fa'), OSCURO = hex('#22303a'), BLANCO = rgb(1, 1, 1);
const EXTRA = new Set('–—‘’“”•…€·°'.split(''));
const limpio = (s: string) => [...(s ?? '')].map(c => (c.charCodeAt(0) < 256 || EXTRA.has(c)) ? c : c === '≤' ? '<=' : c === '≥' ? '>=' : c === '−' ? '-' : '').join('');
const mezcla = (c: RGB, k: number): RGB => rgb(c.red + (1 - c.red) * k, c.green + (1 - c.green) * k, c.blue + (1 - c.blue) * k);

interface Ctx { pg: PDFPage; f: PDFFont; fb: PDFFont; fi: PDFFont }
type TOpt = { size?: number; font?: PDFFont; color?: RGB; align?: 'l' | 'c' | 'r'; w?: number };

function herramientas(c: Ctx) {
  const ancho = (s: string, size = 7, font = c.f) => font.widthOfTextAtSize(limpio(s), size);
  const recortar = (s: string, w: number, size: number, font: PDFFont) => {
    let t = limpio(s); if (font.widthOfTextAtSize(t, size) <= w) return t;
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1);
    return t + '…';
  };
  const txt = (s: string, x: number, y: number, o: TOpt = {}) => {
    const size = o.size ?? 7, font = o.font ?? c.f;
    const t = o.w ? recortar(s, o.w, size, font) : limpio(s);
    const tw = font.widthOfTextAtSize(t, size);
    const xx = o.align === 'c' && o.w ? x + (o.w - tw) / 2 : o.align === 'r' && o.w ? x + o.w - tw : x;
    c.pg.drawText(t, { x: xx, y, size, font, color: o.color ?? TINTA });
  };
  const partir = (s: string, w: number, size = 7, font = c.f): string[] => {
    const out: string[] = [];
    for (const par of limpio(s).split('\n')) {
      let l = '';
      for (const p of par.split(' ')) { const t = l ? l + ' ' + p : p; if (font.widthOfTextAtSize(t, size) > w && l) { out.push(l); l = p; } else l = t; }
      out.push(l);
    }
    return out;
  };
  const rect = (x: number, y: number, w: number, h: number, fill?: RGB, borde?: RGB, bw = 0.5) =>
    c.pg.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: borde, borderWidth: borde ? bw : 0 });
  const linea = (x1: number, y1: number, x2: number, y2: number, color = LINEA, t = 0.5) => c.pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color });
  /** Encabezado de sección: número en círculo, título en versalitas espaciado y filete. */
  const seccion = (n: string, t: string, x: number, y: number, w: number) => {
    c.pg.drawCircle({ x: x + 6, y: y - 5, size: 6, color: OSCURO });
    txt(n, x + 6 - ancho(n, 6.5, c.fb) / 2, y - 7.3, { size: 6.5, font: c.fb, color: BLANCO });
    const tt = t.toUpperCase().split('').join(' ');
    txt(tt, x + 16, y - 7.5, { size: 7, font: c.fb, color: OSCURO });
    linea(x + 20 + ancho(tt, 7, c.fb), y - 5, x + w, y - 5, LINEA, 0.6);
  };
  return { ancho, txt, partir, rect, linea, seccion };
}

/** Estereograma de igual área (Schmidt), hemisferio inferior: círculos máximos y polos. */
function estereograma(c: Ctx, cx: number, cy: number, R: number, m: Mapeo) {
  const h = herramientas(c); const D = Math.PI / 180;
  c.pg.drawCircle({ x: cx, y: cy, size: R, borderColor: TINTA, borderWidth: 0.7, color: BLANCO });
  for (const a of [0, 90, 180, 270]) {
    const s = Math.sin(a * D), co = Math.cos(a * D);
    h.linea(cx + s * R, cy + co * R, cx + s * (R + 3), cy + co * (R + 3), TINTA, 0.7);
  }
  h.txt('N', cx - 2.2, cy + R + 4, { size: 7, font: c.fb });
  h.linea(cx - 2.5, cy, cx + 2.5, cy, GRIS, 0.4); h.linea(cx, cy - 2.5, cx, cy + 2.5, GRIS, 0.4);
  const proy = (trend: number, plunge: number): [number, number] => {
    const r = R * Math.SQRT2 * Math.sin((90 - plunge) * D / 2);
    return [cx + r * Math.sin(trend * D), cy + r * Math.cos(trend * D)];
  };
  const az = parseFloat(m.azimut);
  if (Number.isFinite(az)) {
    const [x1, y1] = proy(az, 0), [x2, y2] = proy(az + 180, 0);
    c.pg.drawLine({ start: { x: x2, y: y2 }, end: { x: x1, y: y1 }, thickness: 0.8, color: GRIS, dashArray: [3, 2] });
    h.txt(`Eje ${Math.round(az)}°`, x1 + (x1 >= cx ? 2 : -24), y1 + (y1 >= cy ? 2 : -7), { size: 5.5, color: GRIS });
  }
  for (const d of m.disc) {
    if (d.dip == null || d.dd == null) continue;
    const col = hex(TIPOS_ESTRUCTURA[d.tipo].color === '#ffd400' ? '#d4a800' : TIPOS_ESTRUCTURA[d.tipo].color);
    const a = d.dd * D, dl = d.dip * D;
    const s = [Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2), 0];
    const dv = [Math.sin(a) * Math.cos(dl), Math.cos(a) * Math.cos(dl), -Math.sin(dl)];
    let prev: [number, number] | null = null;
    for (let k = 0; k <= 36; k++) {
      const t = k * Math.PI / 36;
      const v = [0, 1, 2].map(i => Math.cos(t) * s[i]! + Math.sin(t) * dv[i]!);
      const tr = Math.atan2(v[0]!, v[1]!) / D, pl = Math.asin(Math.max(-1, Math.min(1, -v[2]!))) / D;
      const p = proy(tr, pl);
      if (prev) c.pg.drawLine({ start: { x: prev[0], y: prev[1] }, end: { x: p[0], y: p[1] }, thickness: 1.1, color: col });
      prev = p;
    }
    const [px, py] = proy(d.dd + 180, 90 - d.dip);
    c.pg.drawCircle({ x: px, y: py, size: 1.8, color: col, borderColor: TINTA, borderWidth: 0.3 });
    h.txt(d.nombre, px + 2.5, py + 1.5, { size: 5.5, font: c.fb, color: TINTA });
  }
}

export async function generarPdf(m: Mapeo): Promise<Uint8Array> {
  const calc = calcular(m);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Mapeo geomecánico ${m.labor} ${m.fecha}`);
  pdf.setCreator('Aplicativo Geomecánico Libre'); pdf.setProducer('Aplicativo Geomecánico Libre');
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold), fi = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const paginas: PDFPage[] = [];
  const nueva = () => { const pg = pdf.addPage([W, H]); paginas.push(pg); return pg; };
  const c: Ctx = { pg: nueva(), f, fb, fi };
  let h = herramientas(c);
  const rec = calc.rec, cl = rec?.clase;
  const acento = cl ? hex(cl.color) : GRIS, acentoTxt = cl ? hex(cl.texto) : BLANCO;
  const fecha = m.fecha.split('-').reverse().join('/');

  // ===================================================== Encabezado
  let y = H - M;
  h.rect(0, H - 6, W, 6, acento);
  h.txt('FICHA DE MAPEO GEOMECÁNICO', M, y - 10, { size: 7.5, font: fb, color: GRIS });
  h.txt(m.labor || 'Labor sin nombre', M, y - 32, { size: 21, font: fb, w: CW - 150 });
  const sub = [m.nivel, m.ubicacion, m.litologia].filter(Boolean).join('  ·  ');
  if (sub) h.txt(sub, M, y - 46, { size: 9, color: GRIS, w: CW - 150 });
  // insignia del tipo de roca
  const bw = 132, bh = 56, bx = W - M - bw, by = y - 58;
  h.rect(bx, by, bw, bh, acento);
  if (cl) {
    h.txt('TIPO DE ROCA', bx + 10, by + bh - 12, { size: 6.5, font: fb, color: acentoTxt });
    h.txt(cl.tipo, bx + 10, by + 14, { size: 26, font: fb, color: acentoTxt });
    h.txt('RMR', bx + bw - 44, by + bh - 12, { size: 6.5, font: fb, color: acentoTxt, w: 34, align: 'r' });
    h.txt(String(calc.rmr), bx + bw - 54, by + 14, { size: 26, font: fb, color: acentoTxt, w: 44, align: 'r' });
    h.txt(cl.nombre, bx + 10, by + 5, { size: 6, color: acentoTxt, w: bw - 20 });
  } else h.txt('RMR incompleto', bx + 10, by + 24, { size: 11, font: fb, color: BLANCO });
  y = by - 10;

  // Franja de datos clave
  const datos: [string, string][] = [
    ['Fecha', `${fecha}  ${m.hora}`], ['Progresiva', m.desde || m.hasta ? `${m.desde || '—'} – ${m.hasta || '—'} m` : '—'],
    ['Sección', `${m.ancho} × ${m.alto} m`], ['Azimut', m.azimut ? `${m.azimut}°` : '—'], ['Labor', LABORES[m.tipoLabor].nombre.replace('Labor ', '')],
  ];
  const dh = 28, dw = CW / datos.length;
  h.rect(M, y - dh, CW, dh, SUAVE);
  datos.forEach(([k, v], i) => {
    const x = M + i * dw;
    if (i) h.linea(x, y - dh + 5, x, y - 5, LINEA, 0.6);
    h.txt(k.toUpperCase(), x + 8, y - 10, { size: 5.8, font: fb, color: GRIS, w: dw - 12 });
    h.txt(v, x + 8, y - 22, { size: 9, font: fb, w: dw - 12 });
  });
  y -= dh + 14;

  // ===================================================== 1. RMR (izquierda) + escala y GSI (derecha)
  const izq = 330, gap = 16, der = CW - izq - gap, xd = M + izq + gap;
  h.seccion('1', 'Clasificación RMR89', M, y, izq);
  h.seccion('2', 'Escala y cartilla GSI', xd, y, der);
  y -= 16;
  const zonas: Zona[] = m.porZonas ? ZONAS : ['CORONA'];
  const c0 = 108, cz = (izq - c0) / zonas.length, rh = 12.5;
  let yt = y;
  h.txt('PARÁMETRO', M + 4, yt - 9, { size: 6, font: fb, color: GRIS });
  zonas.forEach((z, i) => h.txt(m.porZonas ? NOMBRE_ZONA[z].toUpperCase() : 'VALORACIÓN', M + c0 + i * cz, yt - 9, { size: 6, font: fb, color: GRIS, w: cz - 4, align: 'c' }));
  yt -= 12; h.linea(M, yt, M + izq, yt, TINTA, 0.8);
  const nombres: Record<string, string> = { ucs: 'Resistencia uniaxial', rqd: 'RQD', espaciamiento: 'Espaciamiento', persistencia: 'Persistencia', abertura: 'Abertura', rugosidad: 'Rugosidad', relleno: 'Relleno', alteracion: 'Alteración', agua: 'Agua subterránea' };
  PARAMETROS.forEach((p, k) => {
    if (k % 2) h.rect(M, yt - rh, izq, rh, CEBRA);
    h.txt(nombres[p.id]!, M + 4, yt - 8.7, { size: 7 });
    zonas.forEach((z, i) => {
      const v = m.zonas[z][p.id]; const x = M + c0 + i * cz;
      if (v == null) { h.txt('—', x, yt - 8.7, { size: 7, color: GRIS, w: cz - 4, align: 'c' }); return; }
      const et = p.clases.find(q => q.puntaje === v)?.etiqueta.replace(/^R\d · /, '') ?? '';
      h.txt(et, x + 3, yt - 8.7, { size: 6.2, color: GRIS, w: cz - 22 });
      h.txt(String(v), x + cz - 18, yt - 8.7, { size: 7.5, font: fb, w: 14, align: 'r' });
    });
    yt -= rh;
  });
  h.linea(M, yt, M + izq, yt, LINEA, 0.6);
  const totales: [string, (z: Zona) => string, boolean][] = [
    ['RMR básico', z => String(rmrBasico(m.zonas[z]) ?? '—'), false],
    ['Ajuste por orientación', () => m.ajuste == null ? '0' : String(m.ajuste), false],
    ['RMR corregido', z => String((m.porZonas ? calc.rmrZonas[z] : calc.rmrCalc) ?? '—'), true],
  ];
  for (const [k, fn, fuerte] of totales) {
    if (fuerte) h.rect(M, yt - rh, izq, rh, mezcla(acento, 0.78));
    h.txt(k, M + 4, yt - 8.7, { size: 7, font: fuerte ? fb : f });
    zonas.forEach((z, i) => h.txt(fn(z), M + c0 + i * cz + cz - 22, yt - 8.7, { size: fuerte ? 8.5 : 7.5, font: fb, w: 18, align: 'r' }));
    yt -= rh;
  }
  const aj = AJUSTES_ORIENTACION.find(a => a.puntaje === m.ajuste);
  const notaRmr = [aj && `Orientación: ${aj.etiqueta.toLowerCase()}`, m.jv && `Jv ${m.jv} fract/m³`, m.rqdManual && `RQD ${m.rqdManual} %`, m.rmrManual && `RMR de diseño definido por el ingeniero: ${m.rmrManual}`].filter(Boolean).join('   ·   ');
  if (notaRmr) { h.txt(notaRmr, M + 4, yt - 9, { size: 6.2, font: fi, color: GRIS, w: izq - 8 }); yt -= 12; }
  if (calc.alertaZonas) for (const l of h.partir(calc.alertaZonas, izq - 8, 6.2)) { h.txt(l, M + 4, yt - 8, { size: 6.2, font: fi, color: hex('#b45309') }); yt -= 8.5; }

  // Derecha: escala RMR
  let yr = y - 4;
  h.txt('ESCALA RMR · CARTILLA', xd, yr - 6, { size: 5.8, font: fb, color: GRIS });
  yr -= 12;
  const segs = [...CLASES].reverse();
  const sw = der / 100;
  for (const k of segs) h.rect(xd + k.min * sw, yr - 10, (Math.min(100, k.max) - k.min + (k.max >= 100 ? 0 : 1)) * sw, 10, hex(k.color));
  for (const k of segs) h.txt(k.tipo, xd + k.min * sw, yr - 18, { size: 5.3, font: fb, color: GRIS, w: (Math.min(100, k.max) - k.min) * sw, align: 'c' });
  for (const v of [0, 20, 40, 60, 80, 100]) h.txt(String(v), xd + v * sw - (v === 100 ? 12 : v ? 5 : 0), yr - 25, { size: 4.8, color: GRIS, w: 12, align: v === 100 ? 'r' : v ? 'c' : 'l' });
  if (calc.rmr != null) {
    const mx = xd + Math.max(0, Math.min(100, calc.rmr)) * sw;
    c.pg.drawSvgPath(`M ${mx} ${H - (yr + 1)} l -4 -6 l 8 0 z`, { x: 0, y: H, color: TINTA });
    h.linea(mx, yr, mx, yr - 10, TINTA, 1.2);
  }
  yr -= 36;

  // Derecha: matriz GSI
  h.txt('CARTILLA GSI · ESTRUCTURA × CONDICIÓN', xd, yr - 6, { size: 5.8, font: fb, color: GRIS });
  yr -= 11;
  const conds: CondicionDisc[] = ['B', 'R', 'P', 'MP'], ests: Estructura[] = ['F', 'MF', 'IF', 'T'];
  const lab = 16, gw = (der - lab) / 4, gh = 15;
  conds.forEach((cd, i) => h.txt(cd, xd + lab + i * gw, yr - 6, { size: 6, font: fb, color: GRIS, w: gw, align: 'c' }));
  yr -= 9;
  ests.forEach((e, j) => {
    const yy = yr - (j + 1) * gh;
    h.txt(e, xd, yy + 5, { size: 6, font: fb, color: GRIS, w: lab - 2, align: 'c' });
    conds.forEach((cd, i) => {
      const x = xd + lab + i * gw, celda = MATRIZ_GSI[e][cd];
      if (!celda) { h.rect(x + 0.5, yy + 0.5, gw - 1, gh - 1, SUAVE); h.txt('—', x, yy + 5, { size: 6, color: GRIS, w: gw, align: 'c' }); return; }
      const [a, b] = celda.map(clasePorTipo) as [ReturnType<typeof clasePorTipo>, ReturnType<typeof clasePorTipo>];
      h.rect(x + 0.5, yy + 0.5, gw - 1, gh - 1, mezcla(hex(a.color), 0.25));
      if (a.tipo !== b.tipo) c.pg.drawSvgPath(`M ${x + gw - 0.5} ${H - (yy + gh - 0.5)} L ${x + gw - 0.5} ${H - (yy + 0.5)} L ${x + 0.5} ${H - (yy + 0.5)} Z`, { x: 0, y: H, color: mezcla(hex(b.color), 0.25) });
      const t = a.tipo === b.tipo ? a.tipo : `${a.tipo}/${b.tipo}`;
      h.txt(t, x, yy + 5, { size: 5.3, font: fb, color: a.texto === '#ffffff' && b.texto === '#ffffff' ? BLANCO : TINTA, w: gw, align: 'c' });
      if (m.gsiEstructura === e && m.gsiCondicion === cd) h.rect(x, yy, gw, gh, undefined, TINTA, 1.6);
    });
  });
  yr -= 4 * gh + 6;
  const e = ESTRUCTURAS.find(x => x.id === m.gsiEstructura), cd = CONDICIONES.find(x => x.id === m.gsiCondicion);
  const gsiTxt = e && cd ? `${e.nombre} · ${cd.nombre} → ${calc.tipoGsi ?? 'no aplica'}` : 'No evaluada';
  h.txt(gsiTxt, xd, yr - 7, { size: 6.8, font: fb, w: der });
  if (m.factores.length) { h.txt('Con factores: ' + m.factores.map(id => FACTORES.find(x => x.id === id)!.texto.replace('Presencia de ', '').replace(' de discontinuidades', '')).join(', '), xd, yr - 16, { size: 5.8, font: fi, color: GRIS, w: der }); yr -= 9; }
  yr -= 12;
  if (calc.alertaGsi) for (const l of h.partir(calc.alertaGsi, der, 5.8)) { h.txt(l, xd, yr - 6, { size: 5.8, font: fi, color: hex('#b45309') }); yr -= 7.5; }
  y = Math.min(yt, yr) - 14;

  // ===================================================== 3. Discontinuidades + estereograma
  const est = 132, tw = CW - est - gap;
  h.seccion('3', 'Discontinuidades', M, y, tw);
  h.seccion('4', 'Estereograma', M + tw + gap, y, est);
  y -= 16;
  const cols: [string, number, 'l' | 'c'][] = [['Cód.', 28, 'l'], ['Tipo', 50, 'l'], ['Buz.', 28, 'c'], ['Dir.', 30, 'c'], ['Espac. (m)', 46, 'c'], ['Persist. (m)', 48, 'c'], ['Relleno', 0, 'l']];
  const fija = cols.reduce((a, q) => a + q[1], 0); cols[6]![1] = tw - fija;
  let yd = y, x0 = M;
  cols.forEach(([n, w, al]) => { h.txt(n.toUpperCase(), x0 + 3, yd - 9, { size: 5.8, font: fb, color: GRIS, w: w - 6, align: al }); x0 += w; });
  yd -= 12; h.linea(M, yd, M + tw, yd, TINTA, 0.8);
  const filas = m.disc;
  const nFilas = Math.max(5, filas.length);
  for (let i = 0; i < nFilas; i++) {
    const d = filas[i];
    if (i % 2) h.rect(M, yd - rh, tw, rh, CEBRA);
    if (d) {
      const vals = [d.nombre, TIPOS_ESTRUCTURA[d.tipo].nombre, d.dip?.toString() ?? '', d.dd != null ? String(d.dd).padStart(3, '0') : '', d.espaciamiento, d.persistencia, [d.relleno, d.obs].filter(Boolean).join(' · ')];
      x0 = M;
      vals.forEach((v, j) => {
        const [, w, al] = cols[j]!;
        if (j === 0) h.rect(x0 + 3, yd - rh + 3.5, 5, 5, hex(TIPOS_ESTRUCTURA[d.tipo].color));
        h.txt(v, x0 + (j === 0 ? 11 : 3), yd - 8.7, { size: 7, font: j === 0 || j === 2 || j === 3 ? fb : f, w: w - (j === 0 ? 12 : 6), align: al });
        x0 += w;
      });
    }
    yd -= rh;
  }
  h.linea(M, yd, M + tw, yd, LINEA, 0.6);
  h.txt('Buzamiento / dirección de buzamiento en grados (azimut verdadero).', M + 3, yd - 9, { size: 5.8, font: fi, color: GRIS });
  yd -= 12;
  const R = Math.max(36, Math.min(52, (y - yd) / 2 - 8));
  estereograma(c, M + tw + gap + est / 2, y - 6 - R - 4, R, m);
  h.txt('Igual área · hemisferio inferior', M + tw + gap, y - 2 * R - 22, { size: 5.5, font: fi, color: GRIS, w: est, align: 'c' });
  y = Math.min(yd, y - 2 * R - 26) - 12;

  // ===================================================== 5. Sostenimiento
  h.seccion('5', 'Sostenimiento recomendado', M, y, CW);
  y -= 16;
  if (rec && cl) {
    const o = rec.opciones[Math.min(m.opcion, rec.opciones.length - 1)]!;
    const ls = h.partir(calc.sostenimiento, CW - 40, 12, fb);
    const ch = 30 + ls.length * 15;
    h.rect(M, y - ch, CW, ch, mezcla(acento, 0.86));
    h.rect(M, y - ch, 6, ch, acento);
    h.txt(`COLOCAR PARA ROCA TIPO ${rec.tipoTabla}${cl.tipo === 'I' ? ' (RMR > 70, SE APLICA TIPO II)' : ''} · ${GRUPOS[rec.grupo].toUpperCase()} · ${LABORES[m.tipoLabor].nombre.toUpperCase()}`, M + 16, y - 12, { size: 6.2, font: fb, color: OSCURO, w: CW - 24 });
    ls.forEach((l, i) => h.txt(l, M + 16, y - 28 - i * 15, { size: 12, font: fb }));
    y -= ch + 6;
    const met: [string, string][] = [['Autosoporte', rec.autosoporte.tiempo], ['Desatado', rec.autosoporte.desatado], ['Opción de la cartilla', rec.opciones.length > 1 ? `${Math.min(m.opcion, rec.opciones.length - 1) + 1} de ${rec.opciones.length}` : 'Única'], ['Refuerzo G', !m.sostFinal.trim() && o.refuerzoG ? o.refuerzoG : '—']];
    const mw = (CW - 3 * 6) / 4;
    met.forEach(([k, v], i) => {
      const x = M + i * (mw + 6);
      h.rect(x, y - 30, mw, 30, undefined, LINEA, 0.7);
      h.txt(k.toUpperCase(), x + 7, y - 10, { size: 5.8, font: fb, color: GRIS, w: mw - 14 });
      h.txt(v, x + 7, y - 23, { size: 8.5, font: fb, w: mw - 14, color: k === 'Refuerzo G' && v !== '—' ? hex('#c62828') : TINTA });
    });
    y -= 38;
    const extra: string[] = [];
    if (rec.sacrificio) extra.push(`Sacrificio (sección ${rec.sacrificio.seccion}): perímetro ${rec.sacrificio.perimetro} m, ${rec.sacrificio.cocadas} cocadas, filas ${rec.sacrificio.filas11} (e=1.1 m) / ${rec.sacrificio.filas12} (e=1.2 m), perno ${rec.sacrificio.longitud}.`);
    else extra.push('Sacrificio: según estándar (la sección no figura en la tabla de la cartilla).');
    if (rec.opciones.length > 1) extra.push('Opciones de la cartilla: ' + rec.opciones.map((q, i) => `(${i + 1}) ${q.texto}${q.refuerzoG ? ` · G: ${q.refuerzoG}` : ''}`).join('   '));
    if (m.sostFinal.trim()) extra.push('Sostenimiento definido por el ingeniero (difiere de la cartilla).');
    extra.push(...rec.alertas);
    for (const t of extra) for (const l of h.partir(t, CW - 6, 6.5)) { h.txt(l, M + 3, y - 7, { size: 6.5, color: GRIS }); y -= 8.5; }
    y -= 2;
    h.txt('Sht: shotcrete · CF/SF: con/sin fibra · Hc: helicoidal · Xp: expansivo · Ss: Split Set · G: solo bajo indicación geomecánica · Perno con malla: rómbica; sin malla: cuadrada y/o rómbica.', M + 3, y - 7, { size: 5.6, font: fi, color: GRIS, w: CW - 6 });
    y -= 12;
  } else { h.txt('Complete el RMR para obtener el sostenimiento.', M + 3, y - 10, { size: 9, font: fb, color: hex('#b45309') }); y -= 18; }

  // ===================================================== 6. Observaciones + firmas (al pie)
  const yFirmas = M + 44;
  h.seccion('6', 'Observaciones', M, y, CW);
  y -= 16;
  for (let ly = y - 11; ly > yFirmas + 22; ly -= 13) h.linea(M, ly, M + CW, ly, hex('#e4e8ea'), 0.5);
  const lsO = h.partir(m.observaciones.trim() || ' ', CW - 6, 7.5);
  const maxL = Math.max(1, Math.floor((y - yFirmas - 22) / 13));
  lsO.slice(0, maxL).forEach((l, i) => h.txt(l + (i === maxL - 1 && lsO.length > maxL ? '…' : ''), M + 3, y - 9 - i * 13, { size: 7.5 }));
  const fw = (CW - 30) / 2;
  [[m.mapeadoPor, 'Mapeado por'], [m.revisadoPor, 'Revisado por']].forEach(([n, k], i) => {
    const x = M + i * (fw + 30);
    h.linea(x, yFirmas, x + fw, yFirmas, TINTA, 0.7);
    h.txt(n || ' ', x, yFirmas - 10, { size: 8, font: fb, w: fw });
    h.txt(`${k!.toUpperCase()}  ·  ${fecha}`, x, yFirmas - 19, { size: 6, font: fb, color: GRIS, w: fw });
  });

  // ===================================================== Registro fotográfico
  if (m.fotos.length) {
    let yy = 0; let primera = true;
    for (const fo of m.fotos) {
      const img = await pdf.embedJpg(await fotoConTrazas(fo));
      const maxW = CW, maxH = 520;
      const k = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * k, hh = img.height * k;
      if (primera || yy - hh - 40 < M + 20) {
        c.pg = nueva(); h = herramientas(c);
        h.rect(0, H - 6, W, 6, acento);
        h.txt('REGISTRO FOTOGRÁFICO', M, H - M - 10, { size: 7.5, font: fb, color: GRIS });
        h.txt(`${m.labor}  ·  ${fecha}`, M, H - M - 26, { size: 13, font: fb });
        if (cl) { h.rect(W - M - 70, H - M - 30, 70, 22, acento); h.txt(`${cl.tipo} · ${calc.rmr}`, W - M - 70, H - M - 23, { size: 10, font: fb, color: acentoTxt, w: 70, align: 'c' }); }
        yy = H - M - 44; primera = false;
      }
      c.pg.drawImage(img, { x: M + (maxW - w) / 2, y: yy - hh, width: w, height: hh });
      yy -= hh + 6;
      h.txt(fo.titulo || 'Fotografía', M, yy - 8, { size: 8, font: fb });
      let x = W - M;
      for (const t of [...new Set(fo.trazas.map(q => q.tipo))].reverse()) {
        const n = TIPOS_ESTRUCTURA[t].nombre; x -= h.ancho(n, 6.5) + 18;
        h.rect(x, yy - 7, 12, 3, hex(TIPOS_ESTRUCTURA[t].color)); h.txt(n, x + 15, yy - 8, { size: 6.5 });
      }
      yy -= 22;
    }
  }

  // Pie de página en todas las hojas
  paginas.forEach((pg, i) => {
    c.pg = pg; const t = herramientas(c);
    t.linea(M, M - 6, W - M, M - 6, LINEA, 0.5);
    t.txt(`${m.labor || 'Mapeo'} · ${fecha} ${m.hora}`, M, M - 15, { size: 6, color: GRIS });
    t.txt(`Hoja ${i + 1} de ${paginas.length}`, W - M - 80, M - 15, { size: 6, color: GRIS, w: 80, align: 'r' });
  });
  return pdf.save();
}

// Llena el PDF del formato oficial en blanco escribiendo en las posiciones exactas de cada celda.
// Las posiciones (mapa-celdas.json) se midieron sobre el mismo PDF que genera la plantilla Excel.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Reporte } from '../model';
import { casillas } from './datos';
import MAPA from './mapa-celdas.json';
import { colorFamilia, rotulos, textoFamilia } from '../ia/anotacion';
import { aPuntos, vistaPlanta, vistaSeccion, type Vista } from './croquis';
import { COLOR_CAE, COLOR_RIESGO, analizarCunas, fsTxt, graficoFS, resumen, tablaCunas, vistaCunas } from './cunas2d';
import { calcular } from '../calc';

const TINTA = rgb(0.05, 0.2, 0.62); // azul lapicero, como en los reportes llenados a mano
const celdas = MAPA.celdas as unknown as Record<string, [number, number, number, number]>;

/** Quita lo que la fuente estándar (WinAnsi) no puede dibujar. */
const limpiar = (s: string) => s.replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[−–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF•\n]/g, '');

function partirLineas(t: string, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of t.split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) <= ancho || !linea) linea = prueba;
      else { out.push(linea); linea = palabra; }
    }
    out.push(linea);
  }
  return out;
}

function escribir(page: PDFPage, font: PDFFont, rect: [number, number, number, number], valor: string, multilinea: boolean, alinear: 'centro' | 'izq') {
  const [x0, y0, x1, y1] = rect;
  const ancho = x1 - x0, alto = y1 - y0;
  const t = limpiar(valor);
  if (multilinea) {
    for (let size = 7; size >= 4.5; size -= 0.5) { // proporcional al texto impreso del formato
      const lineas = partirLineas(t, font, size, ancho);
      const lh = size * 1.18;
      if (lineas.length * lh <= alto + 2 || size <= 4.5) {
        lineas.forEach((l, i) => page.drawText(l, { x: x0, y: y1 - size - i * lh + 1, size, font, color: TINTA }));
        return;
      }
    }
  }
  // Tamaño proporcional a la casilla: ~65 % de su alto, entre 5 y 7.5 pt (el impreso usa 6–7 pt).
  let size = Math.max(5, Math.min(7, alto * 0.62));
  while (size > 4 && font.widthOfTextAtSize(t, size) > ancho + 1) size -= 0.25;
  const w = font.widthOfTextAtSize(t, size);
  const x = alinear === 'centro' ? x0 + (ancho - w) / 2 : x0;
  page.drawText(t, { x, y: y0 + (alto - size * 0.7) / 2, size, font, color: TINTA });
}

export async function generarPdf(r: Reporte, plantilla: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(plantilla);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { casillas: cs, marcas } = casillas(r);
  const izquierda = new Set(['labor', 'supervisor', 'condicion', 'observaciones', 'indicaciones', 'otroLong']);
  for (const c of cs) {
    const rect = celdas[c.clave];
    if (!rect) continue;
    const izq = izquierda.has(c.clave) || c.clave.startsWith('firma') || c.clave.endsWith('_indicacion');
    const valor = typeof c.valor === 'number' ? String(c.valor) : c.valor;
    if (c.clave.startsWith('firmaNombre') || c.clave.startsWith('firmaFecha')) {
      // La celda ya dice "Nombre:" / "Fecha:"; se escribe solo el dato a continuación.
      const dato = valor.replace(/^(Nombre|Fecha):\s*/, '');
      const [x0, y0, x1, y1] = rect;
      escribir(page, font, [x0 + 30, y0, x1, y1], dato, false, 'izq');
    } else if (c.clave === 'otroLong') {
      const [x0, y0, x1, y1] = rect;
      escribir(page, font, [x0 + 18, y0, x1, y1], valor.replace(/^OTRO:\s*/, ''), false, 'izq');
    } else escribir(page, font, rect, valor, !!c.multilinea, izq ? 'izq' : 'centro');
  }
  for (const m of marcas) {
    const rect = celdas[m.clave];
    if (!rect) continue;
    const [x0, y0, x1, y1] = rect;
    page.drawEllipse({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, xScale: Math.max(6, (x1 - x0) / 2 - 1.5), yScale: Math.max(3.2, (y1 - y0) / 2 + 0.6), borderColor: TINTA, borderWidth: 0.9 });
  }
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  croquis(page, font, negrita, r);
  anexoCunas(doc, font, negrita, r);
  await anexoFotos(doc, font, r);
  doc.setTitle(`Indicación Geomecánica ${r.labor} ${r.desde}`);
  doc.setProducer('App Geomecánica (PRT-JS-CLD-16)');
  return doc.save();
}

const NOMBRE_ZONA_FOTO: Record<string, string> = { FRENTE: 'Frente', HI: 'Hastial izquierdo', CORONA: 'Corona', HD: 'Hastial derecho' };
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Anexo: fotos por zona con sus trazas, azimut e inclinación de la cámara (Módulo 18). */
async function anexoFotos(doc: PDFDocument, font: PDFFont, r: Reporte) {
  const fotos = (r.fotos ?? []).slice(0, 12);
  if (!fotos.length) return;
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89], m = 36, altoCaja = (H - 2 * m - 30) / 2;
  let page: PDFPage | null = null, slot = 0;
  for (const f of fotos) {
    if (!page || slot === 2) {
      page = doc.addPage([W, H]); slot = 0;
      page.drawText(limpiar(`Anexo: fotos de campo · ${r.labor} ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''} · ${r.fecha}`), { x: m, y: H - m, size: 10, font: negrita });
    }
    const bytes = Uint8Array.from(atob(f.data.split(',')[1] ?? ''), ch => ch.charCodeAt(0));
    const im = f.data.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const k = Math.min((W - 2 * m) / im.width, (altoCaja - 24) / im.height);
    const w = im.width * k, h = im.height * k;
    const top = H - m - 20 - slot * altoCaja;
    const x = m + (W - 2 * m - w) / 2, y = top - 16 - h;
    page.drawText(limpiar(`${NOMBRE_ZONA_FOTO[f.zona] ?? f.zona}${f.az != null ? ` · cámara azimut ${f.az}° UTM, inclinación ${f.plunge ?? '-'}°` : ''}${f.calidad && !f.calidad.apta ? ' · FOTO NO APTA' : ''}`), { x: m, y: top - 10, size: 8.5, font });
    page.drawImage(im, { x, y, width: w, height: h });
    if (f.trazas) {
      const kt = w / f.trazas.w;
      const P = (px: number, py: number) => ({ x: x + px * kt, y: y + h - py * kt });
      for (const sgm of f.trazas.segmentos) {
        const color = hex(colorFamilia(r.familias, sgm.familia));
        const pts = sgm.pts ?? [[sgm.x1, sgm.y1], [sgm.x2, sgm.y2]];
        for (let i = 1; i < pts.length; i++) page.drawLine({ start: P(pts[i - 1]![0], pts[i - 1]![1]), end: P(pts[i]![0], pts[i]![1]), thickness: 1.8, color });
      }
      for (const ro of rotulos(f.trazas.segmentos)) {
        const t = limpiar(textoFamilia(r.familias, ro.familia)); const size = 7.5;
        const tw = negrita.widthOfTextAtSize(t, size); const c = P(ro.x, ro.y);
        const a = -ro.ang * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        const ox = -tw / 2 - 3, oy = -size / 2 - 2; // esquina inferior izquierda de la caja, girada
        page.drawRectangle({ x: c.x + ox * cos - oy * sin, y: c.y + ox * sin + oy * cos, width: tw + 6, height: size + 4, color: rgb(1, 1, 1), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.4, rotate: degrees(-ro.ang) });
        const tx = -tw / 2, ty = -size * 0.35;
        page.drawText(t, { x: c.x + tx * cos - ty * sin, y: c.y + tx * sin + ty * cos, size, font: negrita, color: rgb(0, 0, 0), rotate: degrees(-ro.ang) });
      }
    }
    slot++;
  }
}

/** Dibuja una vista (en metros) dentro de un rectángulo del PDF [x0, y0, x1, y1] (puntos, y hacia abajo). */
function dibujarVista(page: PDFPage, font: PDFFont, negrita: PDFFont, vista: Vista, caja: [number, number, number, number]) {
  const H = page.getHeight(), v = aPuntos(vista, caja);
  for (const p of v.polys) {
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' ') + (p.cerrado ? ' Z' : '');
    page.drawSvgPath(d, { x: 0, y: H, ...(p.relleno ? { color: hex(p.relleno), opacity: p.opac ?? 1 } : {}),
      ...(p.borde ? { borderColor: hex(p.borde), borderWidth: p.ancho ?? 1, borderOpacity: 1, borderLineCap: 1, ...(p.trazos ? { borderDashArray: p.trazos } : {}) } : {}) });
  }
  for (const t of v.textos) {
    const f = t.negrita ? negrita : font, s = limpiar(t.s), size = t.tam ?? 6, w = f.widthOfTextAtSize(s, size);
    const x = t.ancla === 'centro' ? t.p[0] - w / 2 : t.ancla === 'der' ? t.p[0] - w : t.p[0];
    if (t.fondo) page.drawRectangle({ x: x - 0.6, y: H - t.p[1] - size * 0.22, width: w + 1.2, height: size * 0.95, color: rgb(1, 1, 1), opacity: 0.8 });
    page.drawText(s, { x, y: H - t.p[1], size, font: f, color: hex(t.color ?? '#000000') });
  }
}
const rmrDe = (r: Reporte) => { const z = calcular(r).zonas; return { HI: z.HI.total, CORONA: z.CORONA.total, HD: z.HD.total }; };

/** Vista planta y vista sección en los recuadros del formato. La sección va en dos: ANTES del desatado
 *  (sin sostener, con las cuñas y su riesgo) y DESPUÉS (con shotcrete y pernos, con su FS). */
function croquis(page: PDFPage, font: PDFFont, negrita: PDFFont, r: Reporte) {
  const rmr = rmrDe(r), Hp = page.getHeight();
  // Recuadros medidos en la plantilla (puntos, y hacia abajo): planta x 20–300, sección x 300–574, y 398–615.
  const pl = vistaPlanta(r, rmr, false);
  if (pl) dibujarVista(page, font, negrita, pl, [21, 399, 299, 614]);
  const antes = vistaCunas(r, rmr, 'antes', 135 / 214), despues = vistaCunas(r, rmr, 'despues', 135 / 214);
  if (antes && despues) {
    page.drawRectangle({ x: 300.6, y: Hp - 614.4, width: 272.8, height: 215.8, color: rgb(1, 1, 1) }); // tapa el contorno impreso
    dibujarVista(page, font, negrita, antes, [301, 399, 436.6, 614]);
    dibujarVista(page, font, negrita, despues, [437.4, 399, 573, 614]);
    page.drawLine({ start: { x: 437, y: Hp - 399 }, end: { x: 437, y: Hp - 614 }, thickness: 0.8, color: rgb(0, 0, 0) });
  } else if (r.ancho && r.alto && r.familias.some(f => f.dip != null && f.dipdir != null)) {
    dibujarVista(page, font, negrita, vistaSeccion(r, rmr), [301, 399, 573, 614]);
  }
}

/** Hoja de análisis de cuñas: las dos secciones en grande, el gráfico de FS y la tabla de cada cuña. */
function anexoCunas(doc: PDFDocument, font: PDFFont, negrita: PDFFont, r: Reporte) {
  const a = analizarCunas(r); if (!a || !a.bloques.length) return;
  const rmr = rmrDe(r), [W, Hp] = [595.28, 841.89], m = 30;
  const page = doc.addPage([W, Hp]);
  const T = (s: string, x: number, y: number, size: number, f = font, color = rgb(0, 0, 0)) => page.drawText(limpiar(s), { x, y: Hp - y, size, font: f, color });
  T(`ANÁLISIS DE CUÑAS EN LA SECCIÓN · ${r.labor} ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''} · ${r.fecha}`, m, m + 4, 10.5, negrita, hex('#0D2A6B'));
  const rs = resumen(a);
  partirLineas(limpiar(`${a.bloques.length} cuñas potenciales dentro de la zona de influencia${a.zi ? ` (${Math.round(a.zi.pct * 100)} %, roca ${a.zi.tipo})` : ''}. Antes del desatado: ${rs.caen} CAEN (FS<1, ${rs.pesoCae.toFixed(2)} t/m; ${rs.caida} en caída libre), ${rs.antes.ALTO - rs.caen} ALTO, ${rs.antes.MEDIO} MEDIO, ${rs.antes.BAJO} BAJO. Después del desatado quedan ${rs.quedan}; con sostenimiento FS mínimo ${fsTxt(rs.fsMin ?? 0)}: ${rs.despues.ALTO} ALTO, ${rs.despues.MEDIO} MEDIO, ${rs.despues.BAJO} BAJO.`), font, 7, W - 2 * m)
    .forEach((l, i) => T(l, m, m + 17 + i * 8.5, 7));
  const y0 = m + 34, hV = 330, wV = (W - 2 * m - 8) / 2;
  const va = vistaCunas(r, rmr, 'antes', wV / hV), vd = vistaCunas(r, rmr, 'despues', wV / hV);
  for (const [v, x] of [[va, m], [vd, m + wV + 8]] as [Vista | null, number][]) {
    if (!v) continue;
    dibujarVista(page, font, negrita, v, [x, y0, x + wV, y0 + hV]);
    page.drawRectangle({ x, y: Hp - y0 - hV, width: wV, height: hV, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
  }
  const hG = 200, g = graficoFS(r, (W - 2 * m) / hG), yG = y0 + hV + 8;
  if (g) { dibujarVista(page, font, negrita, g, [m, yG, W - m, yG + hG]); page.drawRectangle({ x: m, y: Hp - yG - hG, width: W - 2 * m, height: hG, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 }); }
  // tabla de cuñas (mismo número que en las secciones y el gráfico)
  const filas = tablaCunas(r), yT = yG + hG + 10;
  const cols: [string, number][] = [['N°', 16], ['Zona', 34], ['Familias', 54], ['h (m)', 28], ['t/m', 28], ['Modo', 66], ['FS antes', 36], ['Riesgo', 38], ['FS sost.', 36], ['Riesgo', 38]];
  const fa = 8.6, anchoT = cols.reduce((s, c) => s + c[1], 0), caben = Math.floor((Hp - m - 22 - yT) / fa) - 1;
  const dos = filas.length > caben, esc = dos ? ((W - 2 * m - 8) / 2) / anchoT : 1, tam = dos ? 4.6 : 5.6;
  const tabla = (lista: typeof filas, x0: number) => {
    let x = x0;
    for (const [t, w] of cols) { page.drawRectangle({ x, y: Hp - yT - fa, width: w * esc, height: fa, color: hex('#0D2A6B') }); T(t, x + 1.2, yT + fa - 2.4, tam, negrita, rgb(1, 1, 1)); x += w * esc; }
    lista.forEach((f, i) => {
      const y = yT + fa * (i + 1); let x1 = x0;
      const vals = [String(f.n), f.zona, f.familias, f.prof.toFixed(2), f.peso.toFixed(2), f.modo, fsTxt(f.fs0), f.cae ? 'CAE' : f.riesgo0, f.cae ? 'desatada' : fsTxt(f.fs), f.cae ? '-' : f.riesgo];
      if (i % 2) page.drawRectangle({ x: x0, y: Hp - y - fa, width: anchoT * esc, height: fa, color: hex('#F2F4F8') });
      vals.forEach((v, k) => {
        const w = cols[k]![1] * esc, esR = k === 7 || k === 9;
        if (esR && v !== '-') page.drawRectangle({ x: x1 + 0.8, y: Hp - y - fa + 0.8, width: w - 1.6, height: fa - 1.6, color: hex(v === 'CAE' ? COLOR_CAE : COLOR_RIESGO[v as 'ALTO']), opacity: 0.9 });
        T(v, x1 + 1.2, y + fa - 2.4, tam, esR ? negrita : font, esR ? rgb(1, 1, 1) : rgb(0, 0, 0)); x1 += w;
      });
    });
  };
  tabla(filas.slice(0, caben), m);
  if (dos) tabla(filas.slice(caben, caben * 2), m + (W - 2 * m) / 2 + 4);
  const nota = 'Análisis 2D en el plano del frente: equilibrio límite por metro de labor, phi de las caras = atan(Jr/Ja) de Barton (30° si falta), sin cohesión, gamma 2.7 t/m3. Red de diaclasas con el espaciamiento de cada familia, partida en celdas: toda celda cerrada pegada al contorno es una cuña; solo dentro de la zona de influencia y con caras no mayores que la persistencia. FS<1: cae al desatar y se retira (contorno nuevo). Pernos: densidad 1/esp² sobre la base de la cuña, si anclan >= 0.5 m detrás. Shotcrete: corte en los dos bordes, tau 0.35 MPa. Para el FS 3D de cuñas de tres planos use Unwedge.';
  partirLineas(limpiar(nota), font, 5.4, W - 2 * m).forEach((l, i) => T(l, m, Hp - m - 10 + i * 6.4, 5.4, font, rgb(0.3, 0.3, 0.3)));
}

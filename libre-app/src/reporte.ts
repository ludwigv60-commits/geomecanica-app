// Reporte PDF genérico (A4 vertical), sin logos ni marcas.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { CONDICIONES, ESTRUCTURAS, FACTORES, GRUPOS, LABORES, LEYENDA, NOTA_CARTILLA, clasePorTipo } from './cartilla';
import { AJUSTES_ORIENTACION, NOMBRE_ZONA, PARAMETROS, ZONAS, rmrBasico, type Zona } from './rmr';
import { TIPOS_ESTRUCTURA, calcular, type Mapeo } from './model';
import { fotoConTrazas } from './Foto';

const W = 595.28, H = 841.89, M = 30;
const GRIS = rgb(0.93, 0.94, 0.96), BORDE = rgb(0.55, 0.58, 0.62), OSC = rgb(0.12, 0.16, 0.22), AZ = rgb(0.16, 0.3, 0.45);
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const EXTRA = new Set('–—‘’“”•…€'.split(''));
const limpio = (s: string) => [...(s ?? '')].map(c => (c.charCodeAt(0) < 256 || EXTRA.has(c)) ? c : c === '≤' ? '<=' : c === '≥' ? '>=' : '').join('');

export async function generarPdf(m: Mapeo): Promise<Uint8Array> {
  const c = calcular(m);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Reporte de mapeo geomecánico ${m.labor} ${m.fecha}`);
  pdf.setCreator('Aplicativo Geomecánico Libre'); pdf.setProducer('Aplicativo Geomecánico Libre');
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pg: PDFPage = pdf.addPage([W, H]); let y = H - M; let nPag = 1;

  const txt = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: RGB } = {}) =>
    pg.drawText(limpio(s), { x, y: yy, size: o.size ?? 8, font: o.font ?? f, color: o.color ?? OSC });
  const ancho = (s: string, size = 8, font = f) => font.widthOfTextAtSize(limpio(s), size);
  const partir = (s: string, w: number, size = 8, font = f): string[] => {
    const out: string[] = [];
    for (const par of limpio(s).split('\n')) {
      let l = '';
      for (const p of par.split(' ')) { const t = l ? l + ' ' + p : p; if (font.widthOfTextAtSize(t, size) > w && l) { out.push(l); l = p; } else l = t; }
      out.push(l);
    }
    return out;
  };
  const caja = (x: number, yy: number, w: number, h: number, fill?: RGB) =>
    pg.drawRectangle({ x, y: yy, width: w, height: h, borderColor: BORDE, borderWidth: 0.5, color: fill });
  const espacio = (h: number) => { if (y - h < M + 20) { pie(); pg = pdf.addPage([W, H]); nPag++; y = H - M; } };
  const pie = () => txt(`Aplicativo Geomecánico Libre · ${m.labor || 'labor'} · ${m.fecha} · pág. ${nPag}`, M, M - 12, { size: 6.5, color: BORDE });
  const titulo = (s: string) => { espacio(30); y -= 6; pg.drawRectangle({ x: M, y: y - 13, width: W - 2 * M, height: 14, color: AZ }); txt(s, M + 5, y - 9.5, { size: 9, font: fb, color: rgb(1, 1, 1) }); y -= 18; };

  // Encabezado
  txt('REPORTE DE MAPEO GEOMECÁNICO', M, y - 14, { size: 16, font: fb });
  txt('Clasificación RMR89 (Bieniawski) · Sostenimiento por rangos de RMR según cartilla geomecánica', M, y - 27, { size: 8.5, color: AZ });
  const fh = `${m.fecha.split('-').reverse().join('/')}  ${m.hora}`;
  txt(fh, W - M - ancho(fh, 10, fb), y - 14, { size: 10, font: fb });
  y -= 36; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: OSC }); y -= 6;

  // 1. Datos generales
  titulo('1. DATOS GENERALES');
  const datos: [string, string][] = [
    ['Labor', m.labor], ['Nivel', m.nivel], ['Ubicación / zona', m.ubicacion], ['Litología', m.litologia],
    ['Progresiva desde (m)', m.desde], ['Progresiva hasta (m)', m.hasta], ['Azimut de avance', m.azimut ? `${m.azimut}°` : ''], ['Sección (ancho x alto)', `${m.ancho} x ${m.alto} m`],
    ['Tipo de labor', LABORES[m.tipoLabor].nombre], ['Mapeado por', m.mapeadoPor], ['Revisado por', m.revisadoPor], ['', ''],
  ];
  const cw = (W - 2 * M) / 4, rh = 22;
  for (let i = 0; i < datos.length; i += 4) {
    espacio(rh);
    for (let j = 0; j < 4; j++) {
      const [k, v] = datos[i + j] ?? ['', ''];
      const x = M + j * cw; caja(x, y - rh, cw, rh);
      if (!k) continue;
      txt(k, x + 3, y - 8, { size: 6.5, color: BORDE });
      const ls = partir(v || '—', cw - 6, 8, fb);
      txt(ls[0]! + (ls.length > 1 ? '…' : ''), x + 3, y - 18, { size: 8, font: fb });
    }
    y -= rh;
  }

  // 2. RMR
  titulo('2. CLASIFICACIÓN GEOMECÁNICA RMR89');
  const zonas: Zona[] = m.porZonas ? ZONAS : ['CORONA'];
  const cols = m.porZonas ? zonas.map(z => NOMBRE_ZONA[z]) : ['Valoración'];
  const c0 = 170, cz = (W - 2 * M - c0) / cols.length;
  const fila = (cells: string[], o: { bold?: boolean; fill?: RGB; h?: number } = {}) => {
    const h = o.h ?? 12; espacio(h);
    caja(M, y - h, c0, h, o.fill); txt(cells[0]!, M + 3, y - h + 3.5, { size: 7.5, font: o.bold ? fb : f });
    cells.slice(1).forEach((s, i) => { const x = M + c0 + i * cz; caja(x, y - h, cz, h, o.fill); txt(s, x + 3, y - h + 3.5, { size: 7.5, font: o.bold ? fb : f }); });
    y -= h;
  };
  fila(['Parámetro', ...cols], { bold: true, fill: GRIS });
  const nombreCorto: Record<string, string> = { ucs: 'Resistencia compresión uniaxial', rqd: 'RQD', espaciamiento: 'Espaciamiento', persistencia: 'Persistencia', abertura: 'Abertura', rugosidad: 'Rugosidad', relleno: 'Relleno', alteracion: 'Alteración / meteorización', agua: 'Agua subterránea' };
  for (const p of PARAMETROS) {
    fila([nombreCorto[p.id] ?? p.nombre, ...zonas.map(z => {
      const v = m.zonas[z][p.id]; if (v == null) return '—';
      const cl = p.clases.find(k => k.puntaje === v);
      return `${cl ? cl.etiqueta.replace(/^R\d · /, '') : ''}  (${v})`;
    })]);
  }
  fila(['RMR básico', ...zonas.map(z => String(rmrBasico(m.zonas[z]) ?? '—'))], { bold: true });
  const aj = AJUSTES_ORIENTACION.find(a => a.puntaje === m.ajuste);
  fila(['Ajuste por orientación', ...zonas.map(() => m.ajuste == null ? '—' : `${aj?.etiqueta ?? ''} (${m.ajuste})`)]);
  fila(['RMR corregido', ...zonas.map(z => String(c.rmrZonas[z] ?? (m.porZonas ? '—' : c.rmrCalc ?? '—')))], { bold: true, fill: GRIS });
  const jvTxt = [m.jv && `Jv = ${m.jv} fract/m³`, m.rqdManual && `RQD = ${m.rqdManual} %`].filter(Boolean).join(' · ');
  if (jvTxt) { espacio(12); txt(jvTxt, M + 3, y - 9, { size: 7.5 }); y -= 12; }
  if (c.alertaZonas) for (const l of partir('Nota: ' + c.alertaZonas, W - 2 * M - 6, 7.5)) { espacio(10); txt(l, M + 3, y - 8, { size: 7.5, color: rgb(0.7, 0.2, 0) }); y -= 10; }

  // Caja del tipo de roca
  espacio(30); y -= 4;
  if (c.rmr != null && c.rec) {
    const cl = c.rec.clase;
    pg.drawRectangle({ x: M, y: y - 26, width: 150, height: 26, color: hex(cl.color), borderColor: OSC, borderWidth: 0.6 });
    txt(`ROCA TIPO ${cl.tipo}`, M + 8, y - 12, { size: 11, font: fb, color: hex(cl.texto) });
    txt(`RMR de diseño = ${c.rmr}${m.rmrManual ? ' (definido por el ingeniero)' : ''}`, M + 8, y - 22, { size: 7, color: hex(cl.texto) });
    txt(`Rango RMR ${cl.min}-${cl.max} · ${cl.nombre}`, M + 160, y - 12, { size: 9, font: fb });
    if (m.rmrManual && c.rmrCalc != null) txt(`RMR calculado: ${c.rmrCalc}`, M + 160, y - 22, { size: 7.5 });
  } else txt('RMR incompleto: complete todos los parámetros.', M, y - 14, { size: 9, font: fb, color: rgb(0.7, 0.2, 0) });
  y -= 32;

  // 3. GSI
  if (m.gsiEstructura || m.gsiCondicion) {
    titulo('3. VERIFICACIÓN CON CARTILLA GSI');
    const e = ESTRUCTURAS.find(x => x.id === m.gsiEstructura), cd = CONDICIONES.find(x => x.id === m.gsiCondicion);
    const lineas = [
      `Condición estructural: ${e ? `${e.nombre} (${e.id}) · ${e.rqd}` : '—'}`,
      `Condición de discontinuidades: ${cd ? `${cd.nombre} (${cd.id}) · ${cd.rcu}` : '—'}`,
      `Factores influyentes: ${m.factores.length ? m.factores.map(id => FACTORES.find(x => x.id === id)?.texto).join('; ') : 'ninguno'}`,
      `Tipo de roca según cartilla GSI: ${c.tipoGsi ?? '—'}${e && cd ? `  (celda ${e.id}/${cd.id})` : ''}`,
    ];
    for (const l of lineas) { espacio(11); txt(l, M + 3, y - 8.5, { size: 8 }); y -= 11; }
    if (c.alertaGsi) for (const l of partir('Nota: ' + c.alertaGsi, W - 2 * M - 6, 7.5)) { espacio(10); txt(l, M + 3, y - 8, { size: 7.5, color: rgb(0.7, 0.2, 0) }); y -= 10; }
    y -= 3;
  }

  // 4. Discontinuidades
  if (m.disc.length) {
    titulo('4. DISCONTINUIDADES');
    const anchos = [40, 70, 45, 50, 70, 70, 80];
    const restante = W - 2 * M - anchos.reduce((a, b) => a + b, 0);
    const hdr = ['Nombre', 'Tipo', 'Buz. (°)', 'Dir. buz. (°)', 'Espaciam.', 'Persistencia', 'Relleno', 'Observación'];
    const ws = [...anchos, restante];
    const filaD = (cells: string[], bold = false, fill?: RGB) => {
      espacio(12); let x = M;
      cells.forEach((s, i) => { caja(x, y - 12, ws[i]!, 12, fill); const ls = partir(s, ws[i]! - 4, 7.5, bold ? fb : f); txt(ls[0]! + (ls.length > 1 ? '…' : ''), x + 2, y - 8.5, { size: 7.5, font: bold ? fb : f }); x += ws[i]!; });
      y -= 12;
    };
    filaD(hdr, true, GRIS);
    for (const d of m.disc) filaD([d.nombre, TIPOS_ESTRUCTURA[d.tipo].nombre, d.dip?.toString() ?? '', d.dd != null ? String(d.dd).padStart(3, '0') : '', d.espaciamiento, d.persistencia, d.relleno, d.obs]);
    y -= 4;
  }

  // 5. Sostenimiento
  titulo('5. SOSTENIMIENTO RECOMENDADO');
  if (c.rec) {
    const r = c.rec;
    const lineas: [string, string][] = [
      ['Criterio', `Cartilla geomecánica por rangos de RMR · ${GRUPOS[r.grupo]} · ${LABORES[m.tipoLabor].nombre}`],
      ['Tipo de roca', `${r.clase.tipo} (RMR ${c.rmr})${r.clase.tipo === 'I' ? ' → se aplica tipo II' : ''}`],
    ];
    if (r.opciones.length > 1) r.opciones.forEach((o, i) => lineas.push([`Opción ${i + 1} de la cartilla`, o.texto + (o.refuerzoG ? `   G: ${o.refuerzoG}` : '')]));
    lineas.push(['Tiempo de autosoporte', `${r.autosoporte.tiempo} (longitud 2 a 4.5 m)`], ['Frecuencia de desatado', r.autosoporte.desatado]);
    if (r.sacrificio) lineas.push(['Sostenimiento de sacrificio', `Sección ${r.sacrificio.seccion}: perímetro ${r.sacrificio.perimetro} m, ${r.sacrificio.cocadas} cocadas, filas ${r.sacrificio.filas11} (e=1.1 m) / ${r.sacrificio.filas12} (e=1.2 m), perno ${r.sacrificio.longitud}`]);
    for (const [k, v] of lineas) {
      const ls = partir(v, W - 2 * M - 130, 8);
      espacio(ls.length * 10 + 2);
      txt(k, M + 3, y - 8.5, { size: 8, font: fb });
      ls.forEach((l, i) => txt(l, M + 128, y - 8.5 - i * 10, { size: 8 }));
      y -= ls.length * 10 + 2;
    }
    // Recuadro final
    const o = r.opciones[Math.min(m.opcion, r.opciones.length - 1)]!;
    const fin = c.sostenimiento + (!m.sostFinal.trim() && o.refuerzoG ? `\nG: ${o.refuerzoG} (solo bajo indicación geomecánica)` : '');
    const ls = partir(fin, W - 2 * M - 16, 10.5, fb);
    const hh = 18 + ls.length * 13;
    espacio(hh + 6); y -= 4;
    const cl = clasePorTipo(r.tipoTabla);
    pg.drawRectangle({ x: M, y: y - hh, width: 6, height: hh, color: hex(cl.color) });
    caja(M, y - hh, W - 2 * M, hh);
    txt('SOSTENIMIENTO A COLOCAR', M + 12, y - 11, { size: 7.5, font: fb, color: AZ });
    ls.forEach((l, i) => txt(l, M + 12, y - 24 - i * 13, { size: 10.5, font: fb }));
    y -= hh + 4;
    for (const a of r.alertas) for (const l of partir('Nota: ' + a, W - 2 * M - 6, 7.5)) { espacio(10); txt(l, M + 3, y - 8, { size: 7.5, color: rgb(0.7, 0.2, 0) }); y -= 10; }
    for (const l of LEYENDA) for (const s of partir(l, W - 2 * M - 6, 6.5)) { espacio(8.5); txt(s, M + 3, y - 7, { size: 6.5, color: rgb(0.35, 0.38, 0.42) }); y -= 8.5; }
    for (const s of partir(NOTA_CARTILLA, W - 2 * M - 6, 6.5)) { espacio(8.5); txt(s, M + 3, y - 7, { size: 6.5, color: rgb(0.35, 0.38, 0.42) }); y -= 8.5; }
  } else { espacio(14); txt('Sin RMR de diseño no se puede recomendar sostenimiento.', M + 3, y - 10, { size: 8.5 }); y -= 14; }

  // 6. Observaciones
  if (m.observaciones.trim()) {
    titulo('6. OBSERVACIONES');
    for (const l of partir(m.observaciones, W - 2 * M - 6, 8.5)) { espacio(11); txt(l, M + 3, y - 9, { size: 8.5 }); y -= 11; }
  }

  // Firmas
  espacio(52); y -= 40;
  const fw = (W - 2 * M - 40) / 2;
  [[m.mapeadoPor, 'Mapeado por'], [m.revisadoPor, 'Revisado por']].forEach(([n, k], i) => {
    const x = M + i * (fw + 40);
    pg.drawLine({ start: { x, y }, end: { x: x + fw, y }, thickness: 0.6, color: OSC });
    txt(n || ' ', x + (fw - ancho(n || ' ', 8, fb)) / 2, y - 10, { size: 8, font: fb });
    txt(k!, x + (fw - ancho(k!, 7)) / 2, y - 19, { size: 7, color: BORDE });
  });
  y -= 26;

  // 7. Fotografías
  if (m.fotos.length) {
    let primera = true;
    for (const fo of m.fotos) {
      const src = await fotoConTrazas(fo);
      const img = await pdf.embedJpg(src);
      const maxW = W - 2 * M, maxH = 330;
      const k = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * k, h = img.height * k;
      if (primera) { titulo('7. REGISTRO FOTOGRÁFICO'); primera = false; }
      espacio(h + 26);
      txt(fo.titulo || 'Fotografía', M, y - 9, { size: 8.5, font: fb });
      pg.drawImage(img, { x: M + (maxW - w) / 2, y: y - 14 - h, width: w, height: h });
      y -= h + 18;
      const tipos = [...new Set(fo.trazas.map(t => t.tipo))];
      if (tipos.length) {
        espacio(10); let x = M;
        for (const t of tipos) { pg.drawRectangle({ x, y: y - 7, width: 12, height: 3, color: hex(TIPOS_ESTRUCTURA[t].color) }); txt(TIPOS_ESTRUCTURA[t].nombre, x + 15, y - 8, { size: 7 }); x += 20 + ancho(TIPOS_ESTRUCTURA[t].nombre, 7) + 10; }
        y -= 12;
      }
    }
  }
  pie();
  return pdf.save();
}

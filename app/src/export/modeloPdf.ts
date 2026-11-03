// PDF del REPORTE MODELO (A4 vertical): ficha VG + formato PRT-JS-CLD-16 en un solo documento.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { Listas, Reporte } from '../model';
import { TIPOS } from '../core/rmr';
import { datosModelo, LEYENDA, clasesLeyenda } from './modelo';
import { anexoCunas, anexoFotos, dibujarFoto, dibujarVista, hex, limpiar, partirLineas, rmrDe } from './pdf';
import { vistaPlanta, vistaSeccion } from './croquis';
import { analizarCunas, resumen, vistaCunas } from './cunas2d';

export const A4: [number, number] = [595.28, 841.89];
const M = 28, AZUL = hex('#0D2A6B'), GRIS = hex('#E9EDF4'), BORDE = rgb(0.35, 0.38, 0.45), BLANCO = rgb(1, 1, 1), NEGRO = rgb(0, 0, 0);

type Celda = { t: string; w: number; b?: boolean; fondo?: RGB; color?: RGB; izq?: boolean; tam?: number };

class Hoja {
  y = M; // cursor (y hacia abajo)
  constructor(public page: PDFPage, public f: PDFFont, public fb: PDFFont) {}
  get H() { return this.page.getHeight(); }
  texto(s: string, x: number, y: number, size: number, o: { b?: boolean; color?: RGB; ancla?: 'izq' | 'centro' | 'der' } = {}) {
    const font = o.b ? this.fb : this.f, t = limpiar(s), w = font.widthOfTextAtSize(t, size);
    const xx = o.ancla === 'centro' ? x - w / 2 : o.ancla === 'der' ? x - w : x;
    this.page.drawText(t, { x: xx, y: this.H - y, size, font, color: o.color ?? NEGRO });
  }
  caja(x: number, y: number, w: number, h: number, fondo?: RGB, borde = true) {
    this.page.drawRectangle({ x, y: this.H - y - h, width: w, height: h, ...(fondo ? { color: fondo } : {}), ...(borde ? { borderColor: BORDE, borderWidth: 0.5 } : {}) });
  }
  /** Fila de celdas; el texto se achica para caber. */
  fila(celdas: Celda[], h = 13, x0 = M) {
    let x = x0;
    for (const c of celdas) {
      this.caja(x, this.y, c.w, h, c.fondo);
      const font = c.b ? this.fb : this.f; let size = c.tam ?? 7.2; const t = limpiar(c.t);
      while (size > 4.2 && font.widthOfTextAtSize(t, size) > c.w - 4) size -= 0.2;
      const yy = this.y + h / 2 + size * 0.35;
      if (c.izq) this.texto(t, x + 2.5, yy, size, { b: c.b, color: c.color }); else this.texto(t, x + c.w / 2, yy, size, { b: c.b, color: c.color, ancla: 'centro' });
      x += c.w;
    }
    this.y += h;
  }
  barra(t: string, h = 15, fondo = AZUL) { this.caja(M, this.y, A4[0] - 2 * M, h, fondo, false); this.texto(t, A4[0] / 2, this.y + h / 2 + 3.4, 9.5, { b: true, color: BLANCO, ancla: 'centro' }); this.y += h; }
  titulo(t: string) { this.y += 6; this.texto(t, M, this.y + 9, 9, { b: true, color: AZUL }); this.y += 13; }
  parrafo(t: string, size = 7.4, x = M, ancho = A4[0] - 2 * M, negritaAntes?: string) {
    const lh = size * 1.25;
    for (const [i, l] of partirLineas(limpiar((negritaAntes ? negritaAntes + ' ' : '') + t), this.f, size, ancho).entries()) {
      if (i === 0 && negritaAntes && l.startsWith(limpiar(negritaAntes))) {
        const nb = limpiar(negritaAntes); this.texto(nb, x, this.y + size, size, { b: true });
        this.texto(l.slice(nb.length), x + this.fb.widthOfTextAtSize(nb, size), this.y + size, size);
      } else this.texto(l, x, this.y + size, size);
      this.y += lh;
    }
  }
}

const n = (v: number | null | undefined, d = 0) => (v == null ? '—' : d ? v.toFixed(d) : String(v));
const colorTipo = (t: string | null) => { const x = TIPOS.find(k => k.tipo === t); return x ? { fondo: hex(x.color), color: hex(x.texto) } : {}; };

function encabezado(h: Hoja, d: ReturnType<typeof datosModelo>) {
  const W = A4[0];
  h.caja(M, M, W - 2 * M, 40, GRIS);
  h.texto(d.titulo, M + 8, M + 17, 15, { b: true, color: AZUL });
  h.texto('Mapeo geomecánico PRT-JS-CLD-16 · Ficha VG', M + 8, M + 31, 7.5, { color: BORDE });
  h.texto(d.proyecto, W - M - 8, M + 15, 8.5, { b: true, ancla: 'der' });
  h.texto('Caracterización geomecánica y clasificación de roca', W - M - 8, M + 26, 7.2, { ancla: 'der' });
  h.y = M + 46;
}

export async function generarModeloPdf(r: Reporte, listas?: Partial<Listas>): Promise<Uint8Array> {
  const d = datosModelo(r, listas);
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0], UT = W - 2 * M;

  // ---------- Hoja 1: datos, RMR y Q ----------
  let h = new Hoja(doc.addPage(A4), f, fb);
  encabezado(h, d);
  h.barra(d.ficha);
  const c6 = UT / 6;
  h.fila([{ t: 'FRENTE / LABOR', w: c6 * 2, b: true, fondo: GRIS }, { t: 'RAMPA', w: c6, b: true, fondo: GRIS }, { t: 'N° CORRELATIVO', w: c6, b: true, fondo: GRIS }, { t: 'SUP. DE GEOMECÁNICA', w: c6 * 2, b: true, fondo: GRIS }]);
  h.fila([{ t: d.labor || '—', w: c6 * 2 }, { t: d.rampa || '—', w: c6 }, { t: d.correlativo || '—', w: c6 }, { t: d.supervisor || '—', w: c6 * 2 }]);
  h.fila([{ t: 'PROGRESIVAS', w: c6 * 2, b: true, fondo: GRIS }, { t: 'AVANCE', w: c6, b: true, fondo: GRIS }, { t: 'PK DE COBERTURA', w: c6, b: true, fondo: GRIS }, { t: 'COBERTURA', w: c6 * 2, b: true, fondo: GRIS }]);
  h.fila([{ t: d.desde || '—', w: c6 }, { t: d.hasta || '—', w: c6 }, { t: d.avance != null ? `${d.avance} m` : '—', w: c6 }, { t: d.cobertura ? d.cobertura.pk.toFixed(1) : '—', w: c6 },
    { t: d.cobertura ? `${d.cobertura.m} m` : d.rampa ? 'falta tabla de cobertura' : 'marque la rampa', w: c6 * 2, b: !!d.cobertura, tam: 9 }], 16);
  const c7 = UT / 7;
  h.fila(['FECHA', 'TURNO', 'HORA', 'ANCHO', 'ALTO', 'AZIMUT', 'RIESGO'].map(t => ({ t, w: c7, b: true, fondo: GRIS })));
  h.fila([d.fecha ? d.fecha.split('-').reverse().join('/') : '—', d.turno || '—', d.hora || '—', d.ancho != null ? `${d.ancho} m` : '—', d.alto != null ? `${d.alto} m` : '—', d.azimut != null ? `${Math.round(d.azimut)}° UTM` : '—', d.riesgo || '—'].map(t => ({ t, w: c7 })));

  // RMR89 por zona
  h.titulo('Clasificación RMR89 (Bieniawski) por zona');
  const wp = 150, wz = (UT - wp) / 3, wc = wz - 26;
  h.fila([{ t: 'Parámetro', w: wp, b: true, fondo: AZUL, color: BLANCO }, ...d.zonas.map(z => ({ t: `${z.nombre}${z.litologia ? ` · ${z.litologia}` : ''}`, w: wz, b: true, fondo: AZUL, color: BLANCO }))]);
  d.zonas[0]!.params.forEach((p, i) => h.fila([{ t: p.nombre, w: wp, izq: true }, ...d.zonas.flatMap(z => [{ t: z.params[i]!.clase || '—', w: wc, izq: true, tam: 6.4 }, { t: n(z.params[i]!.puntaje), w: 26, b: true }])], 12));
  h.fila([{ t: 'RMR básico', w: wp, izq: true, b: true, fondo: GRIS }, ...d.zonas.map(z => ({ t: n(z.basico), w: wz, b: true, fondo: GRIS }))]);
  h.fila([{ t: 'Ajuste por orientación de discontinuidades', w: wp, izq: true }, ...d.zonas.map(z => ({ t: n(z.ajuste), w: wz }))]);
  h.fila([{ t: 'RMR corregido (RMR c)', w: wp, izq: true, b: true, fondo: GRIS }, ...d.zonas.map(z => ({ t: n(z.total), w: wz, b: true, fondo: GRIS }))]);
  h.fila([{ t: 'Tipo de roca', w: wp, izq: true, b: true }, ...d.zonas.map(z => ({ t: z.tipo ? `ST-${z.tipo}` : '—', w: wz, b: true, ...colorTipo(z.tipo) }))]);

  // Q de Barton por zona
  h.titulo("Valuación del parámetro Q según Barton · Q' y GSI");
  h.fila([{ t: 'Parámetro', w: wp, b: true, fondo: AZUL, color: BLANCO }, ...d.zonas.map(z => ({ t: z.nombre, w: wz, b: true, fondo: AZUL, color: BLANCO }))]);
  const filasQ: [string, (z: (typeof d.zonas)[number]) => string, boolean?][] = [
    ['RQD (%)', z => n(z.rqd)], ['Jn', z => n(z.jn)], ['Jr', z => n(z.jr)], ['Ja', z => n(z.ja)], ['Jw', z => n(z.jw)], ['SRF', z => n(z.srf)],
    ['Q = (RQD/Jn)·(Jr/Ja)·(Jw/SRF)', z => n(z.q), true], ["Q' = (RQD/Jn)·(Jr/Ja)", z => n(z.qPrima), true], ["GSI = 9·ln(Q') + 44", z => n(z.gsi), true], ['Clase Q', z => z.claseQ ?? '—']];
  for (const [t, v, b] of filasQ) h.fila([{ t, w: wp, izq: true, b, fondo: b ? GRIS : undefined }, ...d.zonas.map(z => ({ t: v(z), w: wz, b, fondo: b ? GRIS : undefined }))], 12);
  h.y += 4;
  h.parrafo('Clase I: Q>60 · II-A: 7<Q<=60 · III-A: 0,64<Q<=7 · IV-F: 0,08<Q<=0,64 · V-(E,F): Q<=0,08.   Roca tipo I/II 66<=RMRc<=100 · IIIA 57-65 · IIIB 45-56 · IV 36-44 · V 0-35.', 6.2);

  // RMR de diseño y sostenimiento
  h.y += 4;
  const ct = colorTipo(d.tipoFinal);
  h.fila([{ t: 'RMR DE DISEÑO', w: UT * 0.25, b: true, fondo: GRIS }, { t: n(d.rmrFinal), w: UT * 0.15, b: true, tam: 10 }, { t: 'TIPO DE SOSTENIMIENTO', w: UT * 0.3, b: true, fondo: GRIS }, { t: d.tipoSostenimiento || '—', w: UT * 0.3, b: true, tam: 10, ...ct }], 18);
  h.y += 4;
  if (d.sostenimiento.length) { h.texto('Indicación de sostenimiento:', M, h.y + 8, 7.6, { b: true }); h.y += 11; for (const l of d.sostenimiento) h.parrafo(`• ${l}`, 7.4); }

  // ---------- Hoja 2: descripción geológica, estructuras y vistas ----------
  h = new Hoja(doc.addPage(A4), f, fb);
  encabezado(h, d);
  h.barra('Levantamiento geológico y clasificación geomecánica');
  h.y += 4;
  h.parrafo(d.formacion || '—', 7.6, M, UT, 'Formación geológica / Alteración:');
  h.y += 2; h.parrafo(d.macizo || '—', 7.6, M, UT, 'Macizo rocoso:');
  h.y += 2; h.parrafo(d.discontinuidades, 7.6, M, UT, 'Discontinuidades:');
  h.titulo('Discontinuidades');
  const cw = [26, 40, 92, 40, 54, 52, 52]; cw.push(UT - cw.reduce((a, b) => a + b, 0));
  h.fila(['Item', 'Código', 'Tipo', 'Dip', 'Dip Direction', 'Espaciado (m)', 'Persist. (m)', 'S-L-T-R-F-A-W'].map((t, i) => ({ t, w: cw[i]!, b: true, fondo: AZUL, color: BLANCO })));
  d.estructuras.forEach((e, i) => h.fila([String(i + 1), e.codigo, e.tipo, e.dip != null ? `${Math.round(e.dip)}°` : '—', e.dipdir != null ? `${String(Math.round(e.dipdir)).padStart(3, '0')}°` : '—',
    n(e.espaciamiento, e.espaciamiento != null ? 2 : 0), n(e.persistencia, e.persistencia != null ? 1 : 0), e.slt].map((t, k) => ({ t, w: cw[k]!, b: k === 1 || k === 7 })), 12));
  if (!d.estructuras.length) h.fila([{ t: 'Sin estructuras medidas', w: UT }]);
  h.y += 6;
  const wl = UT / 8;
  h.fila([{ t: '', w: wl * 0.4, fondo: GRIS }, ...LEYENDA.map(l => ({ t: `${l.nombre} (${l.letra})`, w: (UT - wl * 0.4) / 7, b: true, fondo: GRIS, tam: 6.6 }))], 12);
  for (let k = 0; k < 5; k++) h.fila([{ t: String(k + 1), w: wl * 0.4, b: true, fondo: GRIS }, ...LEYENDA.map(l => ({ t: clasesLeyenda(l.id)[k] ?? '', w: (UT - wl * 0.4) / 7, tam: 6.2 }))], 11);
  // vistas
  h.titulo('Vista en planta y vista en sección');
  const rmr = rmrDe(r), yV = h.y, hV = Math.min(300, h.H - M - 14 - yV), wV = (UT - 6) / 2;
  const pl = vistaPlanta(r, rmr, false);
  h.caja(M, yV, wV, hV); h.caja(M + wV + 6, yV, wV, hV);
  if (pl) dibujarVista(h.page, f, fb, pl, [M + 2, yV + 2, M + wV - 2, yV + hV - 2]); else h.texto('Faltan azimut y estructuras', M + wV / 2, yV + hV / 2, 8, { ancla: 'centro', color: BORDE });
  const xs = M + wV + 6, antes = vistaCunas(r, rmr, 'antes', (wV / 2) / hV), despues = vistaCunas(r, rmr, 'despues', (wV / 2) / hV);
  if (antes && despues) {
    dibujarVista(h.page, f, fb, antes, [xs + 1, yV + 1, xs + wV / 2 - 1, yV + hV - 1]);
    dibujarVista(h.page, f, fb, despues, [xs + wV / 2 + 1, yV + 1, xs + wV - 1, yV + hV - 1]);
    h.page.drawLine({ start: { x: xs + wV / 2, y: h.H - yV }, end: { x: xs + wV / 2, y: h.H - yV - hV }, thickness: 0.6, color: BORDE });
  } else if (r.ancho && r.alto) dibujarVista(h.page, f, fb, vistaSeccion(r, rmr), [xs + 2, yV + 2, xs + wV - 2, yV + hV - 2]);

  // ---------- Hoja 3: frente, perfil, observaciones y firmas ----------
  h = new Hoja(doc.addPage(A4), f, fb);
  encabezado(h, d);
  h.barra(d.ficha);
  const frente = (r.fotos ?? []).find(x => x.zona === 'FRENTE') ?? r.fotos?.[0];
  const yF = h.y + 4, hF = 330;
  h.caja(M, yF, UT, hF);
  if (frente) await dibujarFoto(doc, h.page, fb, r, frente, [M + 3, yF + 3, M + UT - 3, yF + hF - 3]).catch(() => false);
  else h.texto('Sin foto del frente', W / 2, yF + hF / 2, 9, { ancla: 'centro', color: BORDE });
  h.y = yF + hF; h.fila([{ t: frente ? (frente.zona === 'FRENTE' ? 'Frontal' : frente.zona) : 'Frontal', w: UT, b: true, fondo: GRIS }]);
  h.y += 4;
  const a = analizarCunas(r), rs = a && a.bloques.length ? resumen(a) : null;
  h.parrafo(rs ? `${a!.bloques.length} cuñas potenciales en la zona de influencia; ${rs.caen} caen al desatar (FS<1), ${rs.desatadas} se retiran con el desatado y quedan ${rs.quedan}; con el sostenimiento indicado el FS mínimo es ${rs.fsMin == null ? '—' : rs.fsMin > 10 ? 'mayor que 10' : rs.fsMin.toFixed(2)}.` : 'Sin cuñas potenciales con las estructuras medidas.', 7.6, M, UT, 'Perfil de la sección de excavación:');
  h.y += 4;
  h.parrafo(d.observaciones || '—', 7.6, M, UT, 'Observaciones:');
  h.y += 4;
  const verif = Object.entries(d.verificacion).filter(([, v]) => v);
  if (verif.length) h.parrafo(verif.map(([k, v]) => `${k}: ${v}`).join(' · '), 7.4, M, UT, 'Verificación del sostenimiento:');
  if (d.adicionales.length) { h.y += 2; h.parrafo(d.adicionales.map(x => `${x.fecha} ${x.hora} ${x.nombre}: ${x.indicacion}`).join('\n'), 7.2, M, UT, 'Indicaciones adicionales:'); }
  // firmas al pie
  const yFi = h.H - M - 46, wf = UT / 4;
  h.y = yFi;
  h.fila(d.firmas.slice(0, 4).map(x => ({ t: x.rol, w: wf, b: true, fondo: GRIS, tam: 6.4 })), 12);
  h.fila(d.firmas.slice(0, 4).map(x => ({ t: x.nombre ? `Nombre: ${x.nombre}` : 'Nombre:', w: wf, izq: true, tam: 6.4 })), 18);
  h.fila(d.firmas.slice(0, 4).map(x => ({ t: `Fecha: ${x.fecha ? x.fecha.split('-').reverse().join('/') : ''}`, w: wf, izq: true, tam: 6.4 })), 12);

  // anexos: análisis de cuñas y fotos por zona
  anexoCunas(doc, f, fb, r);
  await anexoFotos(doc, f, r);
  const N = doc.getPageCount();
  doc.getPages().forEach((p, i) => p.drawText(`${d.titulo} · Hoja ${i + 1} de ${N}`, { x: W - M - f.widthOfTextAtSize(`${d.titulo} · Hoja ${i + 1} de ${N}`, 6), y: 12, size: 6, font: f, color: BORDE }));
  doc.setTitle(`Reporte modelo ${r.labor} ${r.desde}`);
  doc.setProducer('App Geomecánica (Reporte modelo)');
  return doc.save();
}

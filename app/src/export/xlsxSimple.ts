// Escritor mínimo de .xlsx (una hoja, estilos, celdas combinadas, imágenes y A4), sin plantilla.
import JSZip from 'jszip';

export interface Estilo { b?: boolean; i?: boolean; color?: string; fondo?: string; tam?: number; izq?: boolean; der?: boolean; borde?: boolean; ajustar?: boolean; arriba?: boolean }
/** Imagen anclada a un rango de celdas; `pdf` la dibuja en vectores en el PDF (si no, se usa `datos`). */
export interface ImagenLibro { datos?: Uint8Array; ext: 'png' | 'jpeg'; c0: number; r0: number; c1: number; r1: number; pdf?: (caja: [number, number, number, number]) => Promise<void> | void; ajustar?: boolean }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
export const col = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const argb = (h: string) => 'FF' + h.replace('#', '').toUpperCase();

/** Ancho y alto en píxeles de un PNG o JPEG. */
export function medidas(b: Uint8Array): [number, number] {
  if (b[0] === 0x89 && b[1] === 0x50) return [(b[16]! << 24 | b[17]! << 16 | b[18]! << 8 | b[19]!) >>> 0, (b[20]! << 24 | b[21]! << 16 | b[22]! << 8 | b[23]!) >>> 0];
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1]!, len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [(b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!];
    i += 2 + len;
  }
  return [100, 100];
}

export class Libro {
  readonly celdas = new Map<number, Map<number, { v: string | number; s: number }>>();
  readonly merges: string[] = [];
  readonly rangos: [number, number, number, number][] = []; // f0, c0, f1, c1 de cada combinación
  readonly altos = new Map<number, number>();
  readonly estilos: Estilo[] = [{}];
  private fuentes: string[] = ['<font><sz val="9"/><name val="Arial"/></font>'];
  private rellenos: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private claves = new Map<string, number>();
  readonly imagenes: ImagenLibro[] = [];
  private saltos: number[] = [];
  unaHoja = false;
  constructor(public nombreHoja: string, public anchos: number[]) {}

  private estilo(e: Estilo): number {
    const k = JSON.stringify(e); const ya = this.claves.get(k); if (ya != null) return ya;
    const f = `<font>${e.b ? '<b/>' : ''}${e.i ? '<i/>' : ''}<sz val="${e.tam ?? 9}"/>${e.color ? `<color rgb="${argb(e.color)}"/>` : ''}<name val="Arial"/></font>`;
    let fi = this.fuentes.indexOf(f); if (fi < 0) { this.fuentes.push(f); fi = this.fuentes.length - 1; }
    let fl = 0;
    if (e.fondo) { const x = `<fill><patternFill patternType="solid"><fgColor rgb="${argb(e.fondo)}"/><bgColor indexed="64"/></patternFill></fill>`; fl = this.rellenos.indexOf(x); if (fl < 0) { this.rellenos.push(x); fl = this.rellenos.length - 1; } }
    const al = `<alignment horizontal="${e.izq ? 'left' : e.der ? 'right' : 'center'}" vertical="${e.arriba ? 'top' : 'center'}"${e.ajustar ? ' wrapText="1"' : ' shrinkToFit="1"'}/>`;
    this.xfs.push(`<xf numFmtId="0" fontId="${fi}" fillId="${fl}" borderId="${e.borde === false ? 0 : 1}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
    const i = this.xfs.length - 1; this.claves.set(k, i); this.estilos[i] = e; return i;
  }
  /** Escribe en (fila, col) desde 0; con `hasta` combina el rango y aplica el estilo a todas sus celdas (bordes). */
  poner(f: number, c: number, v: string | number | null | undefined, e: Estilo = {}, hasta?: [number, number]) {
    const s = this.estilo(e);
    const [f1, c1] = hasta ?? [f, c];
    for (let i = f; i <= f1; i++) for (let j = c; j <= c1; j++) {
      let row = this.celdas.get(i); if (!row) this.celdas.set(i, (row = new Map()));
      row.set(j, { v: i === f && j === c ? (v ?? '') : '', s });
    }
    if (f1 > f || c1 > c) { this.merges.push(`${col(c)}${f + 1}:${col(c1)}${f1 + 1}`); this.rangos.push([f, c, f1, c1]); }
  }
  alto(f: number, pt: number) { this.altos.set(f, pt); }
  salto(f: number) { this.saltos.push(f); }
  imagen(datos: Uint8Array | undefined, ext: 'png' | 'jpeg', [c0, r0, c1, r1]: [number, number, number, number], pdf?: ImagenLibro['pdf'], ajustar = true) { this.imagenes.push({ datos, ext, c0, r0, c1, r1, pdf, ajustar }); }
  /** Alto de fila en puntos (13 por defecto). */
  altoDe(f: number) { return this.altos.get(f) ?? 13; }
  /** Ancho de columna en puntos (como Excel: px = ancho·7 + 5 a 96 ppp). */
  anchoDe(c: number) { return (Math.trunc((this.anchos[c] ?? 8.43) * 7 + 5)) * 0.75; }
  get filas() { return Math.max(-1, ...this.celdas.keys(), ...this.altos.keys()) + 1; }

  async generar(titulo: string): Promise<Uint8Array> {
    const z = new JSZip();
    const imagenes = this.imagenes.filter((im): im is ImagenLibro & { datos: Uint8Array } => !!im.datos);
    const filas = [...this.celdas.keys(), ...this.altos.keys()].sort((a, b) => a - b).filter((x, i, a) => a.indexOf(x) === i);
    const sheetData = filas.map(f => {
      const row = this.celdas.get(f);
      const cs = row ? [...row.entries()].sort((a, b) => a[0] - b[0]).map(([c, { v, s }]) => {
        const ref = `${col(c)}${f + 1}`;
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
        return v === '' ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
      }).join('') : '';
      const h = this.altos.get(f);
      return `<row r="${f + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
    }).join('');
    const cols = this.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const breaks = this.saltos.length ? `<rowBreaks count="${this.saltos.length}" manualBreakCount="${this.saltos.length}">${this.saltos.map(f => `<brk id="${f}" max="16383" man="1"/>`).join('')}</rowBreaks>` : '';
    const ultCol = col(this.anchos.length - 1), ultFila = Math.max(...filas, 0) + 1;
    z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ultCol}${ultFila}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13"/><cols>${cols}</cols><sheetData>${sheetData}</sheetData>${merges}<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.25" bottom="0.25" header="0" footer="0"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="${this.unaHoja ? 1 : 0}"/>${breaks}${imagenes.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`);
    if (imagenes.length) {
      z.file('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
      const x0 = (c: number) => { let x = 0; for (let i = 0; i < c; i++) x += this.anchoDe(i); return x; };
      const y0 = (f: number) => { let y = 0; for (let i = 0; i < f; i++) y += this.altoDe(i); return y; };
      const EMU = 12700;
      const anclas = imagenes.map((im, i) => {
        // la imagen se centra en su recuadro sin deformarse (posición absoluta en la hoja)
        const X = x0(im.c0), Y = y0(im.r0), W = x0(im.c1) - X, H = y0(im.r1) - Y, [iw, ih] = medidas(im.datos);
        const k = Math.min((W - 4) / iw, (H - 4) / ih), w = im.ajustar === false ? W : iw * k, h = im.ajustar === false ? H : ih * k;
        const px = X + (W - w) / 2, py = Y + (H - h) / 2;
        // anclada a celdas (desde/hasta con desfase), así Excel y LibreOffice la ponen en su recuadro aunque midan distinto las columnas
        const celda = (v: number, n: number, d: (i: number) => number) => { let i = 0, a = 0; while (i < n - 1 && a + d(i) <= v) { a += d(i); i++; } return [i, Math.round((v - a) * EMU)] as const; };
        const nC = this.anchos.length, nF = this.filas + 1, ad = (i: number) => this.altoDe(i), an = (i: number) => this.anchoDe(i);
        const [ca, xa] = celda(px, nC, an), [fa, ya] = celda(py, nF, ad), [cb, xb] = celda(px + w, nC, an), [fb, yb] = celda(py + h, nF, ad);
        return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${ca}</xdr:col><xdr:colOff>${xa}</xdr:colOff><xdr:row>${fa}</xdr:row><xdr:rowOff>${ya}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${cb}</xdr:col><xdr:colOff>${xb}</xdr:colOff><xdr:row>${fb}</xdr:row><xdr:rowOff>${yb}</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Imagen ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${i}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="${Math.round(px * EMU)}" y="${Math.round(py * EMU)}"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
      }).join('');
      z.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas}</xdr:wsDr>`);
      z.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imagenes.map((im, i) => `<Relationship Id="rIdI${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imagen${i + 1}.${im.ext === 'png' ? 'png' : 'jpeg'}"/>`).join('')}</Relationships>`);
      imagenes.forEach((im, i) => z.file(`xl/media/imagen${i + 1}.${im.ext === 'png' ? 'png' : 'jpeg'}`, im.datos));
    }
    z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts><fills count="${this.rellenos.length}">${this.rellenos.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF5A6170"/></left><right style="thin"><color rgb="FF5A6170"/></right><top style="thin"><color rgb="FF5A6170"/></top><bottom style="thin"><color rgb="FF5A6170"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(this.nombreHoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${esc(this.nombreHoja.slice(0, 31))}'!$A$1:$${ultCol}$${ultFila}</definedName></definedNames></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(titulo)}</dc:title><dc:creator>App Geomecánica</dc:creator></cp:coreProperties>`);
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${imagenes.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
}

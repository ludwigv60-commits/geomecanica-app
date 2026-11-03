// Escritor mínimo de .xlsx (una hoja, estilos, celdas combinadas, imágenes y A4), sin plantilla.
import JSZip from 'jszip';

export interface Estilo { b?: boolean; color?: string; fondo?: string; tam?: number; izq?: boolean; borde?: boolean; ajustar?: boolean; arriba?: boolean }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
export const col = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const argb = (h: string) => 'FF' + h.replace('#', '').toUpperCase();

export class Libro {
  private celdas = new Map<number, Map<number, { v: string | number; s: number }>>();
  private merges: string[] = [];
  private altos = new Map<number, number>();
  private fuentes: string[] = ['<font><sz val="9"/><name val="Arial"/></font>'];
  private rellenos: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private claves = new Map<string, number>();
  private imagenes: { datos: Uint8Array; ext: 'png' | 'jpeg'; c0: number; r0: number; c1: number; r1: number }[] = [];
  private saltos: number[] = [];
  constructor(public nombreHoja: string, public anchos: number[]) {}

  private estilo(e: Estilo): number {
    const k = JSON.stringify(e); const ya = this.claves.get(k); if (ya != null) return ya;
    const f = `<font>${e.b ? '<b/>' : ''}<sz val="${e.tam ?? 9}"/>${e.color ? `<color rgb="${argb(e.color)}"/>` : ''}<name val="Arial"/></font>`;
    let fi = this.fuentes.indexOf(f); if (fi < 0) { this.fuentes.push(f); fi = this.fuentes.length - 1; }
    let fl = 0;
    if (e.fondo) { const x = `<fill><patternFill patternType="solid"><fgColor rgb="${argb(e.fondo)}"/><bgColor indexed="64"/></patternFill></fill>`; fl = this.rellenos.indexOf(x); if (fl < 0) { this.rellenos.push(x); fl = this.rellenos.length - 1; } }
    const al = `<alignment horizontal="${e.izq ? 'left' : 'center'}" vertical="${e.arriba ? 'top' : 'center'}"${e.ajustar ? ' wrapText="1"' : ''}/>`;
    this.xfs.push(`<xf numFmtId="0" fontId="${fi}" fillId="${fl}" borderId="${e.borde === false ? 0 : 1}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
    const i = this.xfs.length - 1; this.claves.set(k, i); return i;
  }
  /** Escribe en (fila, col) desde 0; con `hasta` combina el rango y aplica el estilo a todas sus celdas (bordes). */
  poner(f: number, c: number, v: string | number | null | undefined, e: Estilo = {}, hasta?: [number, number]) {
    const s = this.estilo(e);
    const [f1, c1] = hasta ?? [f, c];
    for (let i = f; i <= f1; i++) for (let j = c; j <= c1; j++) {
      let row = this.celdas.get(i); if (!row) this.celdas.set(i, (row = new Map()));
      row.set(j, { v: i === f && j === c ? (v ?? '') : '', s });
    }
    if (f1 > f || c1 > c) this.merges.push(`${col(c)}${f + 1}:${col(c1)}${f1 + 1}`);
  }
  alto(f: number, pt: number) { this.altos.set(f, pt); }
  salto(f: number) { this.saltos.push(f); }
  imagen(datos: Uint8Array, ext: 'png' | 'jpeg', [c0, r0, c1, r1]: [number, number, number, number]) { this.imagenes.push({ datos, ext, c0, r0, c1, r1 }); }

  async generar(titulo: string): Promise<Uint8Array> {
    const z = new JSZip();
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
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ultCol}${ultFila}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13"/><cols>${cols}</cols><sheetData>${sheetData}</sheetData>${merges}<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>${breaks}${this.imagenes.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`);
    if (this.imagenes.length) {
      z.file('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
      const anclas = this.imagenes.map((im, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${im.c0}</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>${im.r0}</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:to><xdr:col>${im.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Imagen ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${i}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`).join('');
      z.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas}</xdr:wsDr>`);
      z.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.imagenes.map((im, i) => `<Relationship Id="rIdI${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imagen${i + 1}.${im.ext === 'png' ? 'png' : 'jpeg'}"/>`).join('')}</Relationships>`);
      this.imagenes.forEach((im, i) => z.file(`xl/media/imagen${i + 1}.${im.ext === 'png' ? 'png' : 'jpeg'}`, im.datos));
    }
    z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts><fills count="${this.rellenos.length}">${this.rellenos.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF5A6170"/></left><right style="thin"><color rgb="FF5A6170"/></right><top style="thin"><color rgb="FF5A6170"/></top><bottom style="thin"><color rgb="FF5A6170"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(this.nombreHoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${esc(this.nombreHoja.slice(0, 31))}'!$A$1:$${ultCol}$${ultFila}</definedName></definedNames></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(titulo)}</dc:title><dc:creator>App Geomecánica</dc:creator></cp:coreProperties>`);
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${this.imagenes.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
}

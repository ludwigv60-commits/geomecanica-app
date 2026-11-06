// Excel del Centro de Control: varias hojas ordenadas, encabezado con estilo, filtros de Excel, panel inmovilizado
// y el tipo de roca pintado con su color. Escritor mínimo propio (el de los reportes es de una sola hoja).
import JSZip from 'jszip';
import { col } from '../export/xlsxSimple';
import { TIPOS } from '../core/rmr';

export type Valor = string | number | null | undefined;
export interface Columna { titulo: string; ancho: number; num?: boolean; dec?: number }
export interface Hoja { nombre: string; titulo: string; subtitulo?: string; columnas: Columna[]; filas: Valor[][]; colorTipo?: number /* índice de la columna con el tipo de roca */; totales?: Valor[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const argb = (h: string) => 'FF' + h.replace('#', '').toUpperCase();

export async function libroExcel(hojas: Hoja[], titulo: string): Promise<Uint8Array> {
  // estilos fijos: 0 normal, 1 título, 2 subtítulo, 3 encabezado, 4 texto, 5 número 0, 6 número 0.0, 7 número 0.00, 8 total, 9+ tipos de roca
  const fonts = ['<font><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="15"/><color rgb="FF1B2330"/><name val="Calibri"/></font>', '<font><i/><sz val="10"/><color rgb="FF5B6470"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', `<fill><patternFill patternType="solid"><fgColor rgb="FF1B2330"/><bgColor indexed="64"/></patternFill></fill>`, `<fill><patternFill patternType="solid"><fgColor rgb="FFE6ECF3"/><bgColor indexed="64"/></patternFill></fill>`,
    ...TIPOS.map(t => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(t.color)}"/><bgColor indexed="64"/></patternFill></fill>`)];
  const b = 'borderId="1" applyBorder="1"';
  const al = (h: string) => `<alignment horizontal="${h}" vertical="center" wrapText="1"/>`;
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    `<xf numFmtId="0" fontId="3" fillId="2" ${b} xfId="0" applyFont="1" applyFill="1" applyAlignment="1">${al('center')}</xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" ${b} xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`,
    `<xf numFmtId="1" fontId="0" fillId="0" ${b} xfId="0" applyNumberFormat="1" applyAlignment="1">${al('center')}</xf>`,
    `<xf numFmtId="164" fontId="0" fillId="0" ${b} xfId="0" applyNumberFormat="1" applyAlignment="1">${al('center')}</xf>`,
    `<xf numFmtId="2" fontId="0" fillId="0" ${b} xfId="0" applyNumberFormat="1" applyAlignment="1">${al('center')}</xf>`,
    `<xf numFmtId="164" fontId="4" fillId="3" ${b} xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1">${al('center')}</xf>`,
    ...TIPOS.map((t, i) => `<xf numFmtId="0" fontId="${t.texto === '#FFFFFF' ? 5 : 6}" fillId="${4 + i}" ${b} xfId="0" applyFont="1" applyFill="1" applyAlignment="1">${al('center')}</xf>`),
  ];
  const estTipo = (v: Valor) => { const i = TIPOS.findIndex(t => t.tipo === v); return i < 0 ? 4 : 9 + i; };

  const z = new JSZip();
  hojas.forEach((h, n) => {
    const filas: string[] = [];
    const celda = (ref: string, v: Valor, s: number) => (v == null || v === '' ? `<c r="${ref}" s="${s}"/>`
      : typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
      : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
    filas.push(`<row r="1" ht="22" customHeight="1">${celda('A1', h.titulo, 1)}</row>`);
    filas.push(`<row r="2">${celda('A2', h.subtitulo ?? '', 2)}</row>`);
    const F0 = 4; // fila del encabezado
    filas.push(`<row r="${F0}" ht="30" customHeight="1">${h.columnas.map((c, i) => celda(`${col(i)}${F0}`, c.titulo, 3)).join('')}</row>`);
    h.filas.forEach((f, k) => {
      const r = F0 + 1 + k;
      filas.push(`<row r="${r}">${h.columnas.map((c, i) => {
        const v = f[i];
        const s = i === h.colorTipo ? estTipo(v) : c.num && typeof v === 'number' ? (c.dec === 0 ? 5 : c.dec === 2 ? 7 : 6) : 4;
        return celda(`${col(i)}${r}`, v, s);
      }).join('')}</row>`);
    });
    const ult = F0 + h.filas.length;
    if (h.totales) filas.push(`<row r="${ult + 1}">${h.columnas.map((_, i) => celda(`${col(i)}${ult + 1}`, h.totales![i], 8)).join('')}</row>`);
    const cols = h.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho}" customWidth="1"/>`).join('');
    const ultCol = col(h.columnas.length - 1);
    z.file(`xl/worksheets/sheet${n + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ultCol}${Math.max(ult + 1, F0)}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ''}><pane xSplit="0" ySplit="${F0}" topLeftCell="A${F0 + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${filas.join('')}</sheetData>${h.filas.length ? `<autoFilter ref="A${F0}:${ultCol}${ult}"/>` : ''}<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0" footer="0"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`);
  });
  z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFC9D0D9"/></left><right style="thin"><color rgb="FFC9D0D9"/></right><top style="thin"><color rgb="FFC9D0D9"/></top><bottom style="thin"><color rgb="FFC9D0D9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  const nombre = (h: Hoja) => esc(h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${nombre(h)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${hojas.map((h, i) => (h.filas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${nombre(h)}'!$A$4:$${col(h.columnas.length - 1)}$${4 + h.filas.length}</definedName>` : '')).join('')}</definedNames></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(titulo)}</dc:title><dc:creator>Centro de Control LK</dc:creator></cp:coreProperties>`);
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

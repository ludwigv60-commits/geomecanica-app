// Excel del REPORTE MODELO: una hoja A4 con el diseño del formato oficial (modeloHoja).
import JSZip from 'jszip';
import type { Listas, Reporte } from '../model';
import { hojaModelo, type RecursosModelo } from './modeloHoja';

export async function generarModeloXlsx(r: Reporte, listas?: Partial<Listas>, rec: RecursosModelo = {}): Promise<Uint8Array> {
  return hojaModelo(r, listas, rec).generar(`Reporte modelo ${r.labor} ${r.desde}`);
}

/** Logos de AESA y Marcobre: se toman de la plantilla oficial (formato.xlsx) que ya trae la app. */
export async function logosDePlantilla(plantilla: ArrayBuffer | Uint8Array): Promise<{ logoAesa?: Uint8Array; logoMarcobre?: Uint8Array }> {
  const z = await JSZip.loadAsync(plantilla);
  const rels = await z.file('xl/drawings/_rels/drawing1.xml.rels')?.async('string') ?? '';
  const dib = await z.file('xl/drawings/drawing1.xml')?.async('string') ?? '';
  // el logo de AESA está anclado en la columna 1 y el de Marcobre en la 19, fila 0
  const porCol = (col: number) => {
    const m = [...dib.matchAll(/<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?r:embed="([^"]+)"/g)].find(x => Number(x[1]) === col && Number(x[2]) === 0);
    const t = m ? new RegExp(`Id="${m[3]}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1] : null;
    return t ? z.file(`xl/media/${t}`)?.async('uint8array') : undefined;
  };
  return { logoAesa: await porCol(1), logoMarcobre: await porCol(19) };
}

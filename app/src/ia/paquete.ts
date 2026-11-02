// Carga de los datos privados de la empresa (solo en el celular, nunca se publican):
// la BD de mapeos (.xlsx) o el paquete de Justa (.json con los mapeos ya leídos y el modelo de IA).
import type { Reporte } from '../model';
import { guardarConfig } from '../store';

/** Primeros bytes útiles del archivo (sin BOM ni espacios): sirve para reconocer JSON aunque el iPhone lo guarde como .txt o sin extensión. */
function inicio(b: ArrayBuffer): Uint8Array {
  const u = new Uint8Array(b, 0, Math.min(b.byteLength, 64));
  let i = 0; if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) i = 3;
  while (i < u.length && (u[i] === 0x20 || u[i] === 0x0a || u[i] === 0x0d || u[i] === 0x09)) i++;
  return u.subarray(i);
}
const guardar = async (clave: string, v: unknown, que: string) => {
  try { await guardarConfig(clave, v); }
  catch (e) { throw new Error(`no hay espacio para guardar ${que} en este navegador (${(e as Error).name || 'error'}). Libere espacio en el celular o borre reportes antiguos y vuelva a intentar.`); }
};

export async function cargarDatos(f: File): Promise<string> {
  let b: ArrayBuffer;
  try { b = await f.arrayBuffer(); } catch { throw new Error('el celular no dejó abrir el archivo. Si está en iCloud, ábralo una vez en Archivos para que se descargue y vuelva a elegirlo.'); }
  if (!b.byteLength) throw new Error('el archivo está vacío. Descárguelo de nuevo.');
  const ini = inicio(b);
  if (ini[0] === 0x7b /* { */) {
    let p: { tipo?: string; historial?: Reporte[]; modelo?: string };
    try { p = JSON.parse(new TextDecoder().decode(b).replace(/^\uFEFF/, '')); }
    catch { throw new Error(`el archivo .json está incompleto (${(b.byteLength / 1e6).toFixed(1)} MB; debe pesar unos 6 MB). Descárguelo de nuevo y espere a que termine.`); }
    if (p.tipo !== 'paquete-justa' || !Array.isArray(p.historial)) throw new Error('el archivo .json no es un paquete de datos de la app (justa_datos.json).');
    // Se reemplaza lo anterior: primero se borra para no ocupar el doble de espacio.
    await guardarConfig('historialBD', []).catch(() => {});
    await guardar('historialBD', p.historial, 'los mapeos');
    let extra = '';
    if (p.modelo) {
      let bin: Uint8Array;
      try { bin = Uint8Array.from(atob(p.modelo), c => c.charCodeAt(0)); } catch { throw new Error('el modelo de IA dentro del .json está dañado. Descárguelo de nuevo.'); }
      await guardarConfig('modelo:trazas.onnx', undefined).catch(() => {});
      await guardar('modelo:trazas.onnx', bin.buffer, 'la IA de trazas');
      (await import('./onnx')).olvidarSesion('trazas.onnx');
      extra = ' y la IA de trazas entrenada con sus fotos';
    }
    return `Listo: ${p.historial.length} mapeos${extra}. Reemplazó lo anterior y queda solo en este celular.`;
  }
  if (!(ini[0] === 0x50 && ini[1] === 0x4b)) { // los .xlsx empiezan con "PK"
    const txt = new TextDecoder().decode(ini.slice(0, 15)).replace(/[^\x20-\x7e]/g, '·');
    throw new Error(`"${f.name}" no es un .json ni un .xlsx (empieza con "${txt}"). Elija justa_datos.json o la BD de mapeos en Excel.`);
  }
  const { leerHoja, desdeFilas } = await import('./historial-bd');
  const rs = desdeFilas(await leerHoja(b));
  if (!rs.length) throw new Error('no encontré mapeos en el Excel.');
  await guardarConfig('historialBD', []).catch(() => {});
  await guardar('historialBD', rs, 'los mapeos');
  return `Listo: ${rs.length} mapeos de ${new Set(rs.map(r => r.labor)).size} labores. Reemplazó lo anterior y queda solo en este celular.`;
}

/** Modelo .onnx suelto: valida que sea un modelo y lo reemplaza. */
export async function cargarModelo(f: File): Promise<string> {
  let b: ArrayBuffer;
  try { b = await f.arrayBuffer(); } catch { throw new Error('el celular no dejó abrir el archivo. Si está en iCloud, ábralo una vez en Archivos y vuelva a elegirlo.'); }
  const ini = inicio(b);
  if (ini[0] === 0x7b) return cargarDatos(f); // eligió el paquete .json: también trae el modelo
  if (b.byteLength < 100000) throw new Error(`ese archivo no parece un modelo .onnx (pesa ${(b.byteLength / 1e3).toFixed(0)} KB; trazas_justa.onnx pesa unos 4 MB).`);
  if (ini[0] !== 0x08) throw new Error('ese archivo no es un modelo .onnx. Elija trazas_justa.onnx.');
  await guardarConfig('modelo:trazas.onnx', undefined).catch(() => {});
  await guardar('modelo:trazas.onnx', b, 'la IA de trazas');
  (await import('./onnx')).olvidarSesion('trazas.onnx');
  return `Modelo cargado (${(b.byteLength / 1e6).toFixed(1)} MB). Reemplazó al anterior; la próxima vez que busque trazas usará este.`;
}

// Carga de los datos privados de la empresa (solo en el celular, nunca se publican):
// la BD de mapeos (.xlsx) o el paquete de Justa (.json con los mapeos ya leídos y el modelo de IA).
import type { Reporte } from '../model';
import { guardarConfig } from '../store';

export async function cargarDatos(f: File): Promise<string> {
  const b = await f.arrayBuffer();
  if (/\.json$/i.test(f.name) || new Uint8Array(b.slice(0, 1))[0] === 0x7b) {
    const p = JSON.parse(new TextDecoder().decode(b)) as { tipo?: string; historial?: Reporte[]; modelo?: string };
    if (p.tipo !== 'paquete-justa' || !Array.isArray(p.historial)) throw new Error('El archivo no es un paquete de datos de la app.');
    await guardarConfig('historialBD', p.historial);
    let extra = '';
    if (p.modelo) {
      const bin = Uint8Array.from(atob(p.modelo), c => c.charCodeAt(0));
      await guardarConfig('modelo:trazas.onnx', bin.buffer);
      (await import('./onnx')).olvidarSesion('trazas.onnx');
      extra = ' y la IA de trazas entrenada con sus fotos';
    }
    return `Listo: ${p.historial.length} mapeos${extra}. Quedan solo en este celular.`;
  }
  const { leerHoja, desdeFilas } = await import('./historial-bd');
  const rs = desdeFilas(await leerHoja(b));
  if (!rs.length) throw new Error('No encontré mapeos en el archivo.');
  await guardarConfig('historialBD', rs);
  return `Listo: ${rs.length} mapeos de ${new Set(rs.map(r => r.labor)).size} labores. Quedan solo en este celular.`;
}

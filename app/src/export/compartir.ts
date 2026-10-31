// Descargar o compartir (WhatsApp, correo, OneDrive) el archivo generado.
export function nombreArchivo(r: { labor: string; desde: string; fecha: string; correlativo: string }, ext: string) {
  const base = ['IG', r.correlativo, r.labor, r.desde, r.fecha].filter(Boolean).join('_').replace(/[^\w.+-]+/g, '_');
  return `${base}.${ext}`;
}
export async function entregar(datos: Uint8Array, nombre: string, tipo: string): Promise<'compartido' | 'descargado'> {
  const blob = new Blob([datos as Uint8Array<ArrayBuffer>], { type: tipo });
  const archivo = new File([blob], nombre, { type: tipo });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [archivo] })) {
    try { await nav.share({ files: [archivo], title: nombre }); return 'compartido'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'compartido'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descargado';
}
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MIME_PDF = 'application/pdf';

// APK Android (Capacitor): el WebView no descarga archivos; se guardan en Documentos y se abre el menú de compartir.
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const esApk = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

function base64(d: Uint8Array): string {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function entregaNativa(datos: Uint8Array, nombre: string) {
  const data = base64(datos);
  await Filesystem.writeFile({ path: `Geomecanico Libre/${nombre}`, data, directory: Directory.Documents, recursive: true }).catch(() => {});
  const { uri } = await Filesystem.writeFile({ path: `compartir/${nombre}`, data, directory: Directory.Cache, recursive: true });
  try { await Share.share({ title: nombre, files: [uri], dialogTitle: 'Enviar o guardar' }); } catch { /* menú cerrado: el archivo quedó guardado */ }
}

/** Entrega un archivo: en el APK, menú de compartir; en el navegador, descarga (o compartir si se pide). */
export async function entregar(datos: Uint8Array, nombre: string, tipo: string, compartir = false) {
  if (esApk()) return entregaNativa(datos, nombre);
  const blob = new Blob([datos as BlobPart], { type: tipo });
  if (compartir) {
    const file = new File([blob], nombre, { type: tipo });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nombre }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

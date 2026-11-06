// APK Android (Capacitor): el WebView no descarga archivos ni tiene el menú de compartir de la web,
// así que los Excel/PDF/envíos se guardan en el celular y se abre el menú nativo de compartir.
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const esApk = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

function base64(d: Uint8Array): string {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function entregaNativa(datos: Uint8Array, nombre: string, _tipo: string): Promise<'compartido' | 'descargado'> {
  const data = base64(datos);
  // Copia en Documentos/LK Geomecanica para encontrarla luego con el explorador de archivos.
  await Filesystem.writeFile({ path: `LK Geomecanica/${nombre}`, data, directory: Directory.Documents, recursive: true }).catch(() => {});
  const { uri } = await Filesystem.writeFile({ path: `compartir/${nombre}`, data, directory: Directory.Cache, recursive: true });
  try { await Share.share({ title: nombre, files: [uri], dialogTitle: 'Enviar o guardar' }); }
  catch { /* el usuario cerró el menú: el archivo igual quedó guardado */ }
  return 'compartido';
}

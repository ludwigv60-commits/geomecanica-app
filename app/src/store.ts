// Almacenamiento local en IndexedDB (funciona sin señal en Android e iPhone).
// Regla de oro: un reporte no sincronizado nunca se borra.
import type { Listas, Reporte } from './model';
import { LISTAS_INICIALES, nuevoReporte } from './model';

const DB = 'geomecanica';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('reportes', { keyPath: 'id' });
      r.result.createObjectStore('config');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(d => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const q = f(t.objectStore(store));
    t.oncomplete = () => res(q.result as T);
    t.onerror = () => rej(t.error);
  }));
}

export const listarReportes = () => tx<Reporte[]>('reportes', 'readonly', s => s.getAll())
  .then(l => l.sort((a, b) => b.modificado.localeCompare(a.modificado)));
export const guardarReporte = (r: Reporte) =>
  tx<IDBValidKey>('reportes', 'readwrite', s => s.put({ ...r, modificado: new Date().toISOString(), sincronizado: false }));

/** Marca reportes como enviados al panel sin cambiar su fecha de modificación. */
export async function marcarEnviado(ids: string[], fecha: string, alCentro = false): Promise<void> {
  const todos = await listarReportes();
  for (const r of todos) if (ids.includes(r.id)) await tx('reportes', 'readwrite', s => s.put({ ...r, enviado: fecha, ...(alCentro ? { alCentro: fecha } : {}) }));
}

/** Trae de vuelta mapeos de un respaldo o del Centro. No pisa un mapeo del celular más nuevo que el del archivo. */
export async function restaurarReportes(lista: Reporte[]): Promise<{ nuevos: number; actualizados: number; iguales: number }> {
  const hay = new Map((await listarReportes()).map(r => [r.id, r]));
  let nuevos = 0, actualizados = 0, iguales = 0;
  for (const r of lista) {
    if (!r?.id) continue;
    const ex = hay.get(r.id);
    if (ex && (ex.modificado ?? '') >= (r.modificado ?? '')) { iguales++; continue; }
    // se guarda tal cual (con su fecha y su estado de envío), sin marcarlo como modificado ahora
    await tx('reportes', 'readwrite', s => s.put({ ...nuevoReporte(), ...r, importado: undefined, panel: undefined })); // completa campos de versiones antiguas
    ex ? actualizados++ : nuevos++;
  }
  return { nuevos, actualizados, iguales };
}

export async function borrarReporte(r: Reporte): Promise<void> {
  await tx('reportes', 'readwrite', s => s.delete(r.id));
}

export const leerListas = () => tx<Listas | undefined>('config', 'readonly', s => s.get('listas')).then(l => ({ ...LISTAS_INICIALES, ...(l ?? {}) }));
export const guardarListas = (l: Listas) => tx('config', 'readwrite', s => s.put(l, 'listas'));

/** Pide al navegador que no borre los datos por falta de espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false); } catch { return false; }
}

/**
 * ¿Puede el navegador borrar solo los mapeos? En iPhone, Safari borra los datos de una página que no se abre en 7 días
 * si no está instalada en la pantalla de inicio; el ícono de inicio guarda sus datos aparte de Safari.
 * El APK (Capacitor) y la app instalada no corren ese riesgo.
 */
export function riesgoDeBorrado(persistente: boolean): 'ios-safari' | 'navegador' | null {
  const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return null;
  const instalada = matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return instalada ? null : 'ios-safari';
  return persistente || instalada ? null : 'navegador';
}

/** Valores sueltos de configuración (por ejemplo, lo que la IA aprende de las fotos del usuario). */
export const leerConfig = <T>(k: string) => tx<T | undefined>('config', 'readonly', s => s.get(k));
export const guardarConfig = <T>(k: string, v: T) => tx('config', 'readwrite', s => s.put(v, k));

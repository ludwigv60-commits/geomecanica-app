// Almacenamiento local en IndexedDB (funciona sin señal en Android e iPhone).
// Regla de oro: un reporte no sincronizado nunca se borra.
import type { Listas, Reporte } from './model';
import { LISTAS_INICIALES } from './model';

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

export async function borrarReporte(r: Reporte): Promise<void> {
  await tx('reportes', 'readwrite', s => s.delete(r.id));
}

export const leerListas = () => tx<Listas | undefined>('config', 'readonly', s => s.get('listas')).then(l => ({ ...LISTAS_INICIALES, ...(l ?? {}) }));
export const guardarListas = (l: Listas) => tx('config', 'readwrite', s => s.put(l, 'listas'));

/** Pide al navegador que no borre los datos por falta de espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

// Guardado local en el celular (IndexedDB). Nada sale del equipo salvo lo que el usuario exporte.
import type { Mapeo } from './model';

const DB = 'geomecanico-libre';
const ST = 'mapeos';

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(ST, { keyPath: 'id' }); r.result.createObjectStore('config'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(store: string, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((res, rej) => {
    const t = db.transaction(store, modo);
    const q = f(t.objectStore(store));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

export const listar = async () => (await tx<Mapeo[]>(ST, 'readonly', s => s.getAll() as IDBRequest<Mapeo[]>)).sort((a, b) => b.actualizado - a.actualizado);
export const guardar = (m: Mapeo) => tx(ST, 'readwrite', s => s.put({ ...m, actualizado: Date.now() }));
export const borrar = (id: string) => tx(ST, 'readwrite', s => s.delete(id));

export interface Config { declinacion: number }
export const leerConfig = async (): Promise<Config> => ({ declinacion: 0, ...((await tx<Config | undefined>('config', 'readonly', s => s.get('cfg') as IDBRequest<Config | undefined>)) ?? {}) });
export const guardarConfig = (c: Config) => tx('config', 'readwrite', s => s.put(c, 'cfg'));

export async function persistir() { try { await navigator.storage?.persist?.(); } catch { /* opcional */ } }

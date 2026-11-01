// Motor de modelos de IA en el celular (onnxruntime-web, sin señal). Se carga solo cuando se usa.
import type { InferenceSession } from 'onnxruntime-web/wasm';
import { leerConfig } from '../store';

let ortP: Promise<typeof import('onnxruntime-web/wasm')> | null = null;
const sesiones = new Map<string, Promise<InferenceSession>>();

export function ort() {
  return ortP ??= import('onnxruntime-web/wasm').then(o => {
    o.env.wasm.numThreads = 1; // GitHub Pages no permite hilos (sin aislamiento de origen)
    return o;
  });
}
/** Abre un modelo. Si el usuario cargó su modelo privado (entrenado con sus fotos), se usa ese: vive solo
 *  en el celular (IndexedDB) y nunca se publica. Si no, el modelo público de la app. */
export function sesion(nombre: string) {
  let s = sesiones.get(nombre);
  if (!s) {
    s = ort().then(async o => {
      const privado = await leerConfig<ArrayBuffer>(`modelo:${nombre}`).catch(() => undefined);
      if (privado) return o.InferenceSession.create(new Uint8Array(privado), { executionProviders: ['wasm'] });
      return o.InferenceSession.create(new URL(`./modelos/${nombre}`, document.baseURI).href, { executionProviders: ['wasm'] });
    });
    sesiones.set(nombre, s);
  }
  return s;
}
export const olvidarSesion = (nombre: string) => sesiones.delete(nombre);

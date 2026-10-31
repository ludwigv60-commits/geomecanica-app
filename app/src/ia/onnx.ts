// Motor de modelos de IA en el celular (onnxruntime-web, sin señal). Se carga solo cuando se usa.
import type { InferenceSession } from 'onnxruntime-web/wasm';

let ortP: Promise<typeof import('onnxruntime-web/wasm')> | null = null;
const sesiones = new Map<string, Promise<InferenceSession>>();

export function ort() {
  return ortP ??= import('onnxruntime-web/wasm').then(o => {
    o.env.wasm.numThreads = 1; // GitHub Pages no permite hilos (sin aislamiento de origen)
    return o;
  });
}
export function sesion(nombre: string) {
  let s = sesiones.get(nombre);
  if (!s) { s = ort().then(o => o.InferenceSession.create(new URL(`./modelos/${nombre}`, document.baseURI).href, { executionProviders: ['wasm'] })); sesiones.set(nombre, s); }
  return s;
}

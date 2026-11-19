// Motor de modelos de IA en el celular (onnxruntime-web, sin señal). Se carga solo cuando se usa.
// En el APK viene el modelo entrenado con fotos propias (modelos/trazas_justa.onnx, nunca va al repositorio);
// si no está, se usa el modelo general (trazas.onnx).
import type { InferenceSession } from 'onnxruntime-web/wasm';

let ortP: Promise<typeof import('onnxruntime-web/wasm')> | null = null;
const sesiones = new Map<string, Promise<InferenceSession>>();
export let modeloUsado = '';

export function ort() {
  return ortP ??= import('onnxruntime-web/wasm').then(o => { o.env.wasm.numThreads = 1; return o; });
}
const url = (n: string) => new URL(`./modelos/${n}`, document.baseURI).href;
const bajar = async (n: string) => { try { const r = await fetch(url(n)); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } };

export function sesion(nombre: string) {
  let s = sesiones.get(nombre);
  if (!s) {
    s = ort().then(async o => {
      if (nombre === 'trazas.onnx') {
        const propio = await bajar('trazas_justa.onnx');
        modeloUsado = propio ? 'modelo entrenado con fotos propias' : 'modelo general';
        if (propio) return o.InferenceSession.create(propio, { executionProviders: ['wasm'] });
      }
      return o.InferenceSession.create(url(nombre), { executionProviders: ['wasm'] });
    });
    sesiones.set(nombre, s);
  }
  return s;
}

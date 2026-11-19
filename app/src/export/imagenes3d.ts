// Imágenes fijas de la vista 3D (antes del desatado) para el PDF y el Excel. Solo en el navegador (WebGL);
// si el equipo no puede dibujar 3D, el reporte sale con la planta 2D de siempre.
import type { Reporte } from '../model';
import type { RmrZonas } from './croquis';
import type { Escena3 } from './escena3d';

export interface Imagenes3D {
  /** Para el recuadro de la vista planta (272 × 215 pt), con sitio arriba a la izquierda para la planta chica. */
  caja?: Uint8Array;
  /** Para el recuadro apaisado del reporte modelo (≈ 2.4 : 1). */
  apaisada?: Uint8Array;
  /** Imagen principal de la hoja 3D (ancha). */
  ancho?: Uint8Array;
  /** Vista desde la labor hacia el frente. */
  frente?: Uint8Array;
  esc: Pick<Escena3, 'conteo' | 'volCae' | 'pesoCae' | 'volTotal' | 'tramos' | 'L' | 'familias' | 'zi' | 'tipo'>;
}

export async function imagenes3d(r: Reporte, rmr: RmrZonas): Promise<Imagenes3D | null> {
  try {
    const [{ escena3d }, { imagen3d }] = await Promise.all([import('./escena3d'), import('./render3d')]);
    const e = escena3d(r, rmr); if (!e) return null;
    const caja = await imagen3d(e, { w: 1500, h: 1186, preset: 'lateral', tema: 'claro', correr: [0.19, -0.03], zoom: 0.9, rotulos: 1.45 });
    if (!caja) return null;
    const apaisada = await imagen3d(e, { w: 2200, h: 900, preset: 'lateral', tema: 'claro', correr: [0.14, -0.02], zoom: 1.15, rotulos: 1.7 });
    const ancho = await imagen3d(e, { w: 2200, h: 1100, preset: 'lateral', tema: 'claro', correr: [0.06, -0.01], zoom: 1.1, rotulos: 1.1 });
    const frente = await imagen3d(e, { w: 1000, h: 1000, preset: 'frente', tema: 'claro', capas: { anterior: false }, zoom: 1.05, rotulos: 1.7 });
    const { conteo, volCae, pesoCae, volTotal, tramos, L, familias, zi, tipo } = e;
    return { caja, apaisada: apaisada ?? undefined, ancho: ancho ?? undefined, frente: frente ?? undefined, esc: { conteo, volCae, pesoCae, volTotal, tramos, L, familias, zi, tipo } };
  } catch { return null; }
}

// Envío de mapeos al panel (artefacto privado en Claude).
// Envío directo (sin archivos): "Enviar" abre el panel; en el panel "📲 Recibir del celular" abre la app en una
// ventana y la app le pasa los mapeos pendientes por mensaje entre ventanas (postMessage). Ningún servidor externo.
// Si eso no es posible (APK, ícono del iPhone), queda el envío como archivo ("📥 Subir mapeos" en el panel).
import type { Listas, Reporte } from '../model';
import { entregar } from './compartir';

export const PANEL_URL = 'https://claude.ai/artifact/KpFptt8mrvLPkxn8pNGUcd';
export const PANEL_LISTO = true;
const FORMATO = 'mapeos-geomecanica/1';
export const APP_URL = 'https://ludwigv60-commits.github.io/geomecanica-app/formulario/';
export const APP_ORIGEN = new URL(APP_URL).origin;
/** Orígenes desde los que Claude sirve el panel. */
export const esOrigenPanel = (o: string) => o === 'https://claude.ai' || /^https:\/\/([a-z0-9-]+\.)+claudeusercontent\.com$/.test(o);
/** Mensajes entre la app y el panel. */
export type MsgEnvio =
  | { tipo: 'geo-listo'; pendientes: number }
  | { tipo: 'geo-pedir'; todos?: boolean }
  | { tipo: 'geo-paquete'; paquete: Paquete }
  | { tipo: 'geo-progreso'; texto: string }
  | { tipo: 'geo-recibido'; ids: string[]; enviadoEn: string; texto: string }
  | { tipo: 'geo-error'; texto: string };
/** La app corre aislada (APK o ícono del iPhone): no comparte datos con el navegador donde se abre el panel. */
export function appAislada(): boolean {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios && ((navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches);
}

function dispositivo(): string {
  try {
    let id = localStorage.getItem('dispositivo');
    if (!id) { id = crypto.randomUUID().slice(0, 8); localStorage.setItem('dispositivo', id); }
    return id;
  } catch { return 'sin-id'; }
}

export interface Paquete { formato: string; enviadoEn: string; dispositivo: string; listas?: Partial<Listas>; reportes: Reporte[] }

export function armarPaquete(reportes: Reporte[], listas: Listas): Paquete {
  return { formato: FORMATO, enviadoEn: new Date().toISOString(), dispositivo: dispositivo(), listas, reportes: reportes.map(r => ({ ...r, importado: undefined })) };
}

/** Arma el archivo y abre el menú para guardarlo o enviarlo. */
export async function enviarMapeos(reportes: Reporte[], listas: Listas) {
  const p = armarPaquete(reportes, listas);
  const datos = new TextEncoder().encode(JSON.stringify(p));
  const f = p.enviadoEn.slice(0, 16).replace(/[:T]/g, '-');
  const res = await entregar(datos, `mapeos_${reportes.length === 1 ? (reportes[0]!.labor || 'labor').replace(/[^\w.+-]+/g, '_') + '_' : ''}${f}.json`, 'application/json');
  return { res, enviadoEn: p.enviadoEn };
}

/** Lee un archivo de envío (en el panel). */
export function leerPaquete(texto: string | Paquete): Paquete {
  const p = (typeof texto === 'string' ? JSON.parse(texto.replace(/^﻿/, '')) : texto) as Paquete;
  if (p?.formato !== FORMATO || !Array.isArray(p.reportes)) throw new Error('Este archivo no es un envío de mapeos de la app.');
  return p;
}

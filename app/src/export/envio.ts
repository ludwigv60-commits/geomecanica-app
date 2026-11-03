// Envío de mapeos al panel (artefacto privado en Claude).
// El celular trabaja sin señal y fuera de Claude, y el panel no puede abrir ni recibir datos de otras ventanas,
// así que el envío es un archivo: la app lo arma (mapeos + fotos + listas) y en el panel se sube con "📥 Subir mapeos".
import type { Listas, Reporte } from '../model';
import { entregar } from './compartir';

export const PANEL_URL = 'https://claude.ai/artifact/KpFptt8mrvLPkxn8pNGUcd';
export const PANEL_LISTO = true;
const FORMATO = 'mapeos-geomecanica/1';

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

// Recepción automática: el APK envía cada mapeo al puente (Apps Script en la cuenta Google del usuario), que se lo
// manda a su propio Gmail con el asunto "[MAPEO-LK] …" en partes base64 ("MAPEO-LK|id|i|n" + datos).
// El Centro lee esos correos con el conector Gmail del usuario, arma los paquetes y los guarda en la base.
import { leerPaquete, type Paquete } from '../export/envio';

export type Mcp = { callTool(server: string, tool: string, input: unknown): Promise<{ payload?: unknown }> };
export const GMAIL = 'Gmail';
type Obj = Record<string, unknown>;
const lista = (x: unknown, ...k: string[]): Obj[] => { for (const c of k) { const v = (x as Obj | undefined)?.[c]; if (Array.isArray(v)) return v as Obj[]; } return Array.isArray(x) ? (x as Obj[]) : []; };
const texto = (m: Obj): string => String(m.plaintextBody ?? m.plaintext_body ?? m.body ?? m.snippet ?? '');

function decodificar(b64: string): string {
  const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export interface Recibido { hilo: string; otros?: string[]; paquete: Paquete }
export interface Lectura { recibidos: Recibido[]; incompletos: number; errores: string[]; yaCargados?: string[] }

/** Busca los correos del puente que aún no se cargaron. `hechos` = hilos ya procesados. */
export async function leerGmail(mcp: Mcp, hechos: Set<string>, avance: (t: string) => void): Promise<Lectura> {
  const hilos: string[] = [], ya: string[] = [];
  let token: string | undefined;
  for (let pag = 0; pag < 6; pag++) {
    const r = await mcp.callTool(GMAIL, 'search_threads', { query: '"MAPEO-LK" newer_than:120d', pageSize: 50, view: 'THREAD_VIEW_IDS_ONLY', ...(token ? { pageToken: token } : {}) });
    const p = r.payload as Obj | undefined;
    for (const t of lista(p, 'threads')) { const id = String(t.id ?? ''); if (!id) continue; if (hechos.has(id)) { if (!ya.includes(id)) ya.push(id); } else if (!hilos.includes(id)) hilos.push(id); }
    token = (p?.nextPageToken ?? p?.next_page_token) as string | undefined;
    if (!token) break;
  }
  const res: Lectura = { recibidos: [], incompletos: 0, errores: [], yaCargados: ya };
  // mapeos grandes llegan en trozos (cada trozo es un correo/hilo distinto): se unen cuando están todos
  const trozos = new Map<string, { n: number; p: Map<number, string>; hilos: string[] }>();
  for (const [i, hilo] of hilos.entries()) {
    avance(`Leyendo correo ${i + 1} de ${hilos.length} del celular…`);
    try {
      const r = await mcp.callTool(GMAIL, 'get_thread', { threadId: hilo, messageFormat: 'PLAIN_TEXT' });
      const msgs = lista(r.payload, 'messages');
      const partes = new Map<string, { n: number; p: Map<number, string> }>();
      for (const m of msgs) {
        const t = texto(m);
        const c = /MAPEO-LK\|([\w-]+)\|(\d+)\|(\d+)\s*\n?([\s\S]*)/.exec(t);
        if (!c) continue;
        const [, id, iS, nS, datos] = c as unknown as [string, string, string, string, string];
        const g = partes.get(id) ?? { n: Number(nS), p: new Map() };
        g.p.set(Number(iS), datos); partes.set(id, g);
      }
      if (!partes.size) { res.errores.push('un correo sin datos de mapeo'); continue; }
      let completo = true;
      for (const g of partes.values()) {
        if (g.p.size < g.n) { completo = false; continue; }
        const b64 = [...Array(g.n).keys()].map(k => g.p.get(k + 1) ?? '').join('');
        const obj = JSON.parse(decodificar(b64).replace(/^\uFEFF/, '')) as Obj & { trozo?: { id: string; i: number; n: number; datos: string } };
        if (obj.trozo) {
          const t = trozos.get(obj.trozo.id) ?? { n: obj.trozo.n, p: new Map<number, string>(), hilos: [] as string[] };
          t.p.set(obj.trozo.i, obj.trozo.datos); t.hilos.push(hilo); trozos.set(obj.trozo.id, t);
        } else res.recibidos.push({ hilo, paquete: leerPaquete(obj as unknown as Paquete) });
      }
      if (!completo) res.incompletos++;
    } catch (e) {
      const x = e as { code?: string; message?: string };
      if (x.code && x.code !== 'tool_error') throw e; // conector no disponible: lo maneja quien llama
      res.errores.push(x.message ?? String(e));
    }
  }
  for (const t of trozos.values()) {
    if (t.p.size < t.n) { res.incompletos++; continue; }
    try {
      const s = [...Array(t.n).keys()].map(k => t.p.get(k + 1) ?? '').join('');
      const [h0, ...otros] = t.hilos;
      res.recibidos.push({ hilo: h0!, otros, paquete: leerPaquete(s) });
    } catch (e) { res.errores.push((e as Error).message); }
  }
  return res;
}

import { leerGmail } from './gmail';
import { cuerpos } from '../export/autoenvio';

// Simula el puente: cada cuerpo → un correo (hilo) con "MAPEO-LK|id|1|1\n" + base64(UTF-8)
function correo(s: string) { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return `MAPEO-LK|x|1|1\n${btoa(bin)}`; }

test('el Centro une los trozos de un mapeo grande y marca todos sus hilos', async () => {
  const p = { formato: 'mapeos-geomecanica/1', enviadoEn: '2026-11-09', dispositivo: 'd', reportes: [{ id: 'r1', labor: 'Rampa Sur ñ', foto: 'B'.repeat(250000) }] };
  const cs = cuerpos(p as never);
  const hilos = cs.map((c, i) => ({ id: 'h' + i, body: correo(c) })).reverse();
  const mcp = { callTool: async (_s: string, tool: string, input: { threadId?: string }) => tool === 'search_threads'
    ? { payload: { threads: hilos.map(h => ({ id: h.id })) } }
    : { payload: { messages: [{ plaintextBody: hilos.find(h => h.id === input.threadId)!.body }] } } };
  const l = await leerGmail(mcp, new Set(), () => {});
  expect(l.errores).toEqual([]);
  expect(l.recibidos.length).toBe(1);
  expect(l.recibidos[0]!.paquete.reportes[0]).toEqual(p.reportes[0]);
  expect([l.recibidos[0]!.hilo, ...(l.recibidos[0]!.otros ?? [])].sort()).toEqual(hilos.map(h => h.id).sort());
  // si falta un trozo, queda incompleto y no se marca
  const l2 = await leerGmail(mcp, new Set(['h0']), () => {});
  expect(l2.recibidos.length).toBe(0); expect(l2.incompletos).toBe(1);
});

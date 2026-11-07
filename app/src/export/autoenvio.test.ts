import { vi } from 'vitest';
vi.mock('../store', () => ({ marcarEnviado: vi.fn(async () => {}) }));
import { enviarPendientes } from './autoenvio';
import { marcarEnviado } from '../store';
import { LISTAS_INICIALES, type Reporte } from '../model';

const r = (id: string, extra: Partial<Reporte> = {}) => ({ id, labor: 'Rampa Norte', modificado: "2026-11-06T10:00", ...extra }) as unknown as Reporte;

test('envía solo los pendientes, uno por mapeo, y los marca', async () => {
  const cuerpos: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, o: RequestInit) => { cuerpos.push(o.body as string); return new Response('{"ok":true}'); }));
  const n = await enviarPendientes([r('a'), r('b', { alCentro: "2026-11-06T20:00" } as never), r('c', { alCentro: "2026-11-06T05:00" } as never), r('d', { enviado: "2026-11-06T20:00" } as never)], { ...LISTAS_INICIALES, puenteUrl: 'https://script.google.com/macros/s/x/exec?k=c' });
  expect(n).toBe(3);
  expect(cuerpos.map(c => JSON.parse(c).reportes[0].id)).toEqual(['a', 'c', 'd']);
  expect(marcarEnviado).toHaveBeenCalledTimes(3);
});

test('sin puente no envía; error del puente no marca', async () => {
  vi.mocked(marcarEnviado).mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false,"error":"x"}')));
  expect(await enviarPendientes([r('a')], LISTAS_INICIALES)).toBe(0);
  await expect(enviarPendientes([r('a')], { ...LISTAS_INICIALES, puenteUrl: 'https://script.google.com/macros/s/x/exec?k=c' })).rejects.toThrow();
  expect(marcarEnviado).not.toHaveBeenCalled();
});

import { problemaUrl } from './autoenvio';
describe('problemaUrl', () => {
  it('detecta la URL sin clave', () => {
    expect(problemaUrl('https://script.google.com/macros/s/AKfy/exec')).toMatch(/clave/);
    expect(problemaUrl('https://script.google.com/macros/s/AKfy/exec?k=abc')).toBeNull();
    expect(problemaUrl('https://example.com/exec?k=abc')).toMatch(/script\.google/);
  });
});

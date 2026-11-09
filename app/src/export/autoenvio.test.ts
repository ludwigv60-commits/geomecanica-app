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

import { cuerpos, TROZO } from './autoenvio';
test('un mapeo grande se parte en trozos que vuelven a unirse igual', () => {
  const p = { formato: 'mapeos-geomecanica/1', enviadoEn: 'x', dispositivo: 'd', reportes: [{ id: 'r1', labor: 'Rampa Sur', foto: 'A'.repeat(TROZO * 2.5) }] } as never;
  const c = cuerpos(p).map(s => JSON.parse(s));
  expect(c.length).toBe(3);
  expect(c.every(x => x.formato === 'mapeos-geomecanica/1' && x.reportes.length === 1 && JSON.stringify(x).length < TROZO + 1000)).toBe(true);
  expect(c.map(x => x.trozo.datos).join('')).toBe(JSON.stringify(p));
  expect(cuerpos({ ...(p as object), reportes: [{ id: 'r' }] } as never).length).toBe(1);
});

import { turnoActual, proximoTurno, enviarProgramado } from './autoenvio';
test('turnos de envío a las 7:00 y 19:00', () => {
  const h = (s: string) => { const d = turnoActual(new Date(s)); return `${d.getDate()} ${d.getHours()}`; };
  expect(h('2026-11-09T06:59:00')).toBe('8 19');
  expect(h('2026-11-09T07:00:00')).toBe('9 7');
  expect(h('2026-11-09T18:59:00')).toBe('9 7');
  expect(h('2026-11-09T19:30:00')).toBe('9 19');
  expect(proximoTurno(new Date('2026-11-09T10:00:00')).getHours()).toBe(19);
});

test('una vez por turno, solo los nuevos; los corregidos no se mandan solos', async () => {
  const mem: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } });
  const cuerpos: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, o: RequestInit) => { cuerpos.push(o.body as string); return new Response('{"ok":true}'); }));
  const L = { ...LISTAS_INICIALES, puenteUrl: 'https://script.google.com/macros/s/x/exec?k=c' };
  const lista = [r('nuevo'), r('corr', { alCentro: '2026-11-05T00:00', modificado: '2026-11-06T00:00' } as never), r('ok', { alCentro: '2026-11-07T00:00' } as never)];
  expect(await enviarProgramado(lista, L, new Date('2026-11-09T08:00:00'))).toBe(1);
  expect(cuerpos.map(c => JSON.parse(c).reportes[0].id)).toEqual(['nuevo']);
  expect(await enviarProgramado(lista, L, new Date('2026-11-09T12:00:00'))).toBe(-1); // mismo turno
  expect(await enviarProgramado(lista, L, new Date('2026-11-09T19:05:00'))).toBe(1);  // turno de la noche
});

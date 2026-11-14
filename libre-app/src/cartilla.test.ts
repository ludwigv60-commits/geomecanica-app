import { claseDe, recomendar, tipoGsi } from './cartilla';

test('rangos de RMR de la cartilla', () => {
  expect(claseDe(70).tipo).toBe('II'); expect(claseDe(61).tipo).toBe('II');
  expect(claseDe(60.5).tipo).toBe('II'); expect(claseDe(60).tipo).toBe('III-A');
  expect(claseDe(41).tipo).toBe('III-B'); expect(claseDe(40).tipo).toBe('IV-A');
  expect(claseDe(21).tipo).toBe('IV-B'); expect(claseDe(20).tipo).toBe('V'); expect(claseDe(75).tipo).toBe('I');
});
test('sostenimiento por sección y labor', () => {
  expect(recomendar(55, 3.5, 3.5, 'PERMANENTE').opciones[0]!.texto).toBe("Perno Hc ó Xp 7' e=1.50 m");
  expect(recomendar(55, 4.5, 4.5, 'TEMPORAL').opciones[0]!.texto).toBe("Malla + Ss 7' e=1.20 m");
  const r = recomendar(35, 4, 4, 'PERMANENTE');
  expect(r.opciones.map(o => o.texto)).toEqual(['Sht 2" CF + Xp e=1.20 m', "Malla + Xp 7' e=1.20 m + Sht 2\" SF"]);
  expect(r.autosoporte.desatado).toBe('Cada 12 min');
  expect(recomendar(80, 3, 3.5, 'PERMANENTE').alertas.length).toBe(1);
  expect(recomendar(50, 5, 5, 'PERMANENTE').alertas[0]).toMatch(/mayor que 4.5/);
  expect(recomendar(50, 3, 3.5, 'PERMANENTE').sacrificio?.cocadas).toBe(100);
});
test('cartilla GSI', () => {
  expect(tipoGsi('MF', 'P', false)).toBe('III-B'); expect(tipoGsi('MF', 'P', true)).toBe('IV-A');
  expect(tipoGsi('F', 'MP')).toBeNull(); expect(tipoGsi('T', 'P')).toBe('V');
});

// Sistema Q de Barton (Barton et al. 1974; Barton 2002). Tablas con los valores habituales.
// Q = (RQD/Jn) · (Jr/Ja) · (Jw/SRF). Si RQD < 10 se usa 10 (Barton).

export interface OpcionQ { valor: number; texto: string; rango?: [number, number] }

export const JN: OpcionQ[] = [
  { valor: 0.5, texto: 'Masivo, sin o con pocas diaclasas', rango: [0.5, 1] },
  { valor: 2, texto: 'Una familia' },
  { valor: 3, texto: 'Una familia + aleatorias' },
  { valor: 4, texto: 'Dos familias' },
  { valor: 6, texto: 'Dos familias + aleatorias' },
  { valor: 9, texto: 'Tres familias' },
  { valor: 12, texto: 'Tres familias + aleatorias' },
  { valor: 15, texto: 'Cuatro o más familias, muy fracturado' },
  { valor: 20, texto: 'Roca triturada, tipo suelo' },
];

export const JR: OpcionQ[] = [
  { valor: 4, texto: 'Discontinuas' },
  { valor: 3, texto: 'Rugosas o irregulares, onduladas' },
  { valor: 2, texto: 'Lisas, onduladas' },
  { valor: 1.5, texto: 'Pulidas (slickensided), onduladas' },
  { valor: 1.5, texto: 'Rugosas o irregulares, planas' },
  { valor: 1.0, texto: 'Lisas, planas' },
  { valor: 0.5, texto: 'Pulidas (slickensided), planas' },
  { valor: 1.0, texto: 'Sin contacto entre paredes (relleno grueso o triturado)' },
];

export const JA: OpcionQ[] = [
  { valor: 0.75, texto: 'Cerradas, duras, relleno impermeable (cuarzo, epidota)' },
  { valor: 1, texto: 'Paredes sanas, solo manchas de óxido' },
  { valor: 2, texto: 'Paredes ligeramente alteradas, partículas arenosas' },
  { valor: 3, texto: 'Recubrimiento limo-arcilloso o arenoso con poca arcilla' },
  { valor: 4, texto: 'Recubrimiento de minerales blandos (clorita, talco, yeso, grafito)' },
  { valor: 4, texto: 'Partículas arenosas, roca desintegrada sin arcilla (contacto tras < 10 cm de corte)' },
  { valor: 6, texto: 'Relleno de arcilla sobreconsolidada, < 5 mm' },
  { valor: 8, texto: 'Relleno de arcilla blanda, < 5 mm' },
  { valor: 10, texto: 'Relleno de arcilla expansiva, < 5 mm', rango: [8, 12] },
  { valor: 8, texto: 'Zonas de roca triturada y arcilla (sin contacto)', rango: [6, 12] },
  { valor: 5, texto: 'Zonas de arcilla limosa o arenosa, poca arcilla (sin contacto)' },
  { valor: 13, texto: 'Zonas gruesas de arcilla (sin contacto)', rango: [10, 20] },
];

export const JW: OpcionQ[] = [
  { valor: 1.0, texto: 'Seco o flujo mínimo (< 5 l/min local)' },
  { valor: 0.66, texto: 'Flujo o presión media, lavado ocasional de rellenos' },
  { valor: 0.5, texto: 'Flujo grande o presión alta en roca competente sin relleno' },
  { valor: 0.33, texto: 'Flujo grande o presión alta, lavado considerable de rellenos' },
  { valor: 0.15, texto: 'Flujo excepcional al disparar, decae con el tiempo', rango: [0.1, 0.2] },
  { valor: 0.075, texto: 'Flujo excepcional continuo, sin decaer', rango: [0.05, 0.1] },
];

export const SRF: { grupo: string; opciones: OpcionQ[] }[] = [
  { grupo: 'Zonas débiles que cortan la excavación', opciones: [
    { valor: 10, texto: 'Varias zonas débiles con arcilla, roca muy suelta (cualquier profundidad)' },
    { valor: 5, texto: 'Zona débil aislada con arcilla (profundidad ≤ 50 m)' },
    { valor: 2.5, texto: 'Zona débil aislada con arcilla (profundidad > 50 m)' },
    { valor: 7.5, texto: 'Varias zonas de corte en roca competente sin arcilla, roca suelta' },
    { valor: 5, texto: 'Zona de corte aislada en roca competente sin arcilla (≤ 50 m)' },
    { valor: 2.5, texto: 'Zona de corte aislada en roca competente sin arcilla (> 50 m)' },
    { valor: 5, texto: 'Diaclasas abiertas sueltas, muy fracturado (cualquier profundidad)' },
  ] },
  { grupo: 'Roca competente, problemas de esfuerzos', opciones: [
    { valor: 2.5, texto: 'Esfuerzo bajo, cerca de superficie, diaclasas abiertas (σc/σ1 > 200)' },
    { valor: 1, texto: 'Esfuerzo medio, condición favorable (σc/σ1 200–10)' },
    { valor: 1, texto: 'Esfuerzo alto, estructura muy cerrada (σc/σ1 10–5)', rango: [0.5, 2] },
    { valor: 25, texto: 'Lajamiento moderado tras > 1 h en roca masiva (σθ/σc 0.65–1)', rango: [5, 50] },
    { valor: 100, texto: 'Lajamiento y estallido a los pocos minutos (σθ/σc 1–1.5)', rango: [50, 200] },
    { valor: 300, texto: 'Estallido intenso, deformación dinámica inmediata (σθ/σc > 1.5)', rango: [200, 400] },
  ] },
  { grupo: 'Roca que fluye (squeezing)', opciones: [
    { valor: 7.5, texto: 'Presión de flujo moderada (σθ/σc 1–5)', rango: [5, 10] },
    { valor: 15, texto: 'Presión de flujo alta (σθ/σc > 5)', rango: [10, 20] },
  ] },
  { grupo: 'Roca expansiva', opciones: [
    { valor: 7.5, texto: 'Presión de expansión moderada', rango: [5, 10] },
    { valor: 12.5, texto: 'Presión de expansión alta', rango: [10, 15] },
  ] },
];

export interface ParametrosQ { rqd: number; jn: number; jr: number; ja: number; jw: number; srf: number }

/** Redondeo "mitad hacia arriba" a n decimales, tolerante a errores de coma flotante (1.955 → 1.96). */
export function redondear(x: number, n = 2): number {
  const f = 10 ** n;
  return Math.round(Number((x * f).toPrecision(12))) / f;
}

export function valorQ(p: Partial<ParametrosQ>): number | null {
  const { rqd, jn, jr, ja, jw, srf } = p;
  if ([rqd, jn, jr, ja, jw, srf].some(v => v == null || !Number.isFinite(v))) return null;
  if (jn! <= 0 || ja! <= 0 || srf! <= 0) return null;
  const r = Math.max(10, rqd!);
  return (r / jn!) * (jr! / ja!) * (jw! / srf!);
}

/** Clase Q de Barton (texto). */
export function claseQ(q: number): string {
  if (q < 0.01) return 'Excepcionalmente mala';
  if (q < 0.1) return 'Extremadamente mala';
  if (q < 1) return 'Muy mala';
  if (q < 4) return 'Mala';
  if (q < 10) return 'Regular';
  if (q < 40) return 'Buena';
  if (q < 100) return 'Muy buena';
  if (q < 400) return 'Extremadamente buena';
  return 'Excepcionalmente buena';
}

/** Control cruzado RMR ≈ 9·ln(Q) + 44 (Bieniawski 1976). Alerta si difiere más de `tol` puntos. */
export function controlRmrQ(rmr: number, q: number, tol = 15): { rmrDesdeQ: number; diferencia: number; alerta: string | null } {
  const rq = 9 * Math.log(q) + 44;
  const d = rmr - rq;
  return {
    rmrDesdeQ: redondear(rq, 1),
    diferencia: redondear(d, 1),
    alerta: Math.abs(d) > tol
      ? `El RMR (${rmr}) y el Q (${redondear(q)}) no son coherentes: 9·lnQ + 44 = ${redondear(rq, 1)}. Revise los parámetros.`
      : null,
  };
}

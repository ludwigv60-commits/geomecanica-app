// Cálculos de orientación (Fase 0). Marco del mundo: x = Este, y = Norte, z = Arriba.
// Ángulos alpha, beta, gamma según la especificación W3C DeviceOrientation (orden Z-X'-Y'').
(function (g) {
  const D = Math.PI / 180;

  // Matriz de rotación dispositivo -> mundo (W3C). Devuelve filas [r0, r1, r2].
  function rot(alpha, beta, gamma) {
    const a = alpha * D, b = beta * D, c = gamma * D;
    const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(c), sG = Math.sin(c);
    return [
      [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG],
      [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
      [-cB * sG, sB, cB * cG]
    ];
  }
  const col = (R, j) => [R[0][j], R[1][j], R[2][j]];
  const norm360 = x => ((x % 360) + 360) % 360;
  const wrap180 = x => { x = norm360(x); return x > 180 ? x - 360 : x; };
  // Rumbo (azimut) de un vector del mundo proyectado al plano horizontal.
  const heading = v => norm360(Math.atan2(v[0], v[1]) / D);

  // Eje de la cámara trasera = -Z del dispositivo.
  function camera(alpha, beta, gamma) {
    const z = col(rot(alpha, beta, gamma), 2);
    const v = [-z[0], -z[1], -z[2]];
    const h = Math.hypot(v[0], v[1]);
    return { az: heading(v), plunge: Math.atan2(v[2], h) / D, horiz: h };
  }
  // Borde superior del teléfono = +Y del dispositivo (lo que reporta una brújula con el equipo echado).
  function top(alpha, beta, gamma) {
    return heading(col(rot(alpha, beta, gamma), 1));
  }
  // Plano sobre el que se apoya el celular (dorso o pantalla contra la roca).
  // La normal hacia arriba se inclina hacia el dip direction; dip = ángulo de la normal con la vertical.
  function plane(alpha, beta, gamma) {
    let n = col(rot(alpha, beta, gamma), 2);
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const dip = Math.acos(Math.min(1, n[2])) / D;
    return { dip, dipdir: heading(n) };
  }
  // Estadística circular (grados): media y desviación estándar circular.
  function circStats(list) {
    if (!list.length) return { mean: NaN, sd: NaN, n: 0 };
    let s = 0, c = 0;
    for (const x of list) { s += Math.sin(x * D); c += Math.cos(x * D); }
    s /= list.length; c /= list.length;
    const Rb = Math.min(1, Math.hypot(s, c));
    return { mean: norm360(Math.atan2(s, c) / D), sd: Rb > 0 ? Math.sqrt(-2 * Math.log(Rb)) / D : 180, n: list.length };
  }
  function linStats(list) {
    if (!list.length) return { mean: NaN, sd: NaN, n: 0 };
    const m = list.reduce((a, b) => a + b, 0) / list.length;
    const v = list.reduce((a, b) => a + (b - m) * (b - m), 0) / list.length;
    return { mean: m, sd: Math.sqrt(v), n: list.length };
  }
  // Magnético -> verdadero (declinación, Oeste negativa) -> cuadrícula UTM (menos la convergencia).
  const toGrid = (mag, decl, conv) => norm360(mag + decl - (conv || 0));

  g.Orient = { rot, camera, top, plane, circStats, linStats, heading, norm360, wrap180, toGrid };
  if (typeof module !== 'undefined') module.exports = g.Orient;
})(typeof window !== 'undefined' ? window : globalThis);

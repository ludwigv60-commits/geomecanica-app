// Ajuste por orientación de discontinuidades en túneles (RMR89, Bieniawski 1989, tabla 6 / Sección F).
// Solo SUGIERE el ajuste; el ingeniero elige el valor final en el formato.

export interface Discontinuidad { dip: number; dipdir: number; tipo?: string; nombre?: string }

const norm360 = (x: number) => ((x % 360) + 360) % 360;
const D = Math.PI / 180;

/** Ángulo agudo (0–90°) entre el rumbo de la discontinuidad y el eje de la labor. */
export function anguloRumboEje(dipdir: number, azimutLabor: number): number {
  const rumbo = norm360(dipdir - 90);
  const d = Math.abs(norm360(rumbo - azimutLabor) % 180);
  return d > 90 ? 180 - d : d;
}

export interface AjusteSugerido { ajuste: number; calificacion: string; explicacion: string }

const CALIF: Record<number, string> = { 0: 'Muy favorable', [-2]: 'Favorable', [-5]: 'Regular', [-10]: 'Desfavorable', [-12]: 'Muy desfavorable' };

/** Ajuste para una discontinuidad respecto a una labor con azimut de avance dado. */
export function ajusteDiscontinuidad(d: Discontinuidad, azimutLabor: number): AjusteSugerido {
  const ang = anguloRumboEje(d.dipdir, azimutLabor);
  const aFavor = Math.cos((d.dipdir - azimutLabor) * D) > 0; // avance a favor del buzamiento
  const caso = (a: number, txt: string): AjusteSugerido => ({ ajuste: a, calificacion: CALIF[a]!, explicacion: txt });

  if (d.dip < 20) return caso(-5, `Buzamiento ${d.dip}° (0–20°): regular, independiente del rumbo.`);
  const fuerte = d.dip >= 45;
  const perp = (): AjusteSugerido => aFavor
    ? caso(fuerte ? 0 : -2, `Rumbo perpendicular al eje, avance a favor del buzamiento, buz. ${fuerte ? '45–90' : '20–45'}°.`)
    : caso(fuerte ? -5 : -10, `Rumbo perpendicular al eje, avance contra el buzamiento, buz. ${fuerte ? '45–90' : '20–45'}°.`);
  const par = (): AjusteSugerido =>
    caso(fuerte ? -12 : -5, `Rumbo paralelo al eje, buz. ${fuerte ? '45–90' : '20–45'}°.`);

  if (ang >= 60) return perp();
  if (ang <= 30) return par();
  // 30–60°: no está en la tabla de Bieniawski; se toma el caso más desfavorable de los dos vecinos.
  const a = perp(), b = par();
  const peor = a.ajuste <= b.ajuste ? a : b;
  return { ...peor, explicacion: `Rumbo a ${Math.round(ang)}° del eje (intermedio, fuera de tabla); se toma el más desfavorable: ${peor.explicacion}` };
}

/** Ajuste sugerido para la labor: el de la discontinuidad más desfavorable. */
export function ajusteSugerido(fams: Discontinuidad[], azimutLabor: number): (AjusteSugerido & { gobierna: Discontinuidad }) | null {
  let peor: (AjusteSugerido & { gobierna: Discontinuidad }) | null = null;
  for (const f of fams) {
    if (!Number.isFinite(f.dip) || !Number.isFinite(f.dipdir)) continue;
    const r = ajusteDiscontinuidad(f, azimutLabor);
    if (!peor || r.ajuste < peor.ajuste) peor = { ...r, gobierna: f };
  }
  return peor;
}

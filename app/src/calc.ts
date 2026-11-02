// Todo lo que se calcula a partir de un reporte (sin efectos secundarios).
import { ZONAS, rmrBasico, rmrTotal, rmrDiseno, tipoRoca, puntajeRqd, type Zona } from './core/rmr';
import { rqdDesdeJv } from './core/rqd';
import { valorQ, redondear, controlRmrQ } from './core/q';
import { ajusteSugerido } from './core/orientacion';
import { proponer } from './core/sostenimiento';
import type { Reporte } from './model';

export function calcular(r: Reporte) {
  const rqd = r.rqdManual ?? (r.jv != null ? rqdDesdeJv(r.jv) : null);
  const zonas = Object.fromEntries(ZONAS.map(z => {
    const basico = rmrBasico(r.rmr[z]);
    const total = rmrTotal(r.rmr[z], r.ajuste[z]);
    const qv = rqd != null ? valorQ({ rqd, ...r.q[z] }) : null;
    return [z, {
      basico, total,
      tipo: total != null ? tipoRoca(total) : null,
      q: qv != null ? redondear(qv) : null,
      control: total != null && qv != null ? controlRmrQ(total, qv) : null,
    }];
  })) as Record<Zona, { basico: number | null; total: number | null; tipo: ReturnType<typeof tipoRoca> | null; q: number | null; control: ReturnType<typeof controlRmrQ> | null }>;
  const diseno = rmrDiseno({ HI: zonas.HI.total, CORONA: zonas.CORONA.total, HD: zonas.HD.total });
  const rmrFinal = r.rmrDisenoManual ?? diseno?.rmr ?? null;
  const tipoFinal = rmrFinal != null ? tipoRoca(rmrFinal) : null;
  const fams = r.familias.filter(f => f.dip != null && f.dipdir != null) as { abrev: string; dip: number; dipdir: number }[];
  const ajusteIA = r.azimut != null && fams.length ? ajusteSugerido(fams, r.azimut) : null;
  const propuesta = tipoFinal ? proponer(tipoFinal, r.avance, { ordenFilas: r.ordenFilas }) : null;
  return { rqd, puntajeRqdSugerido: rqd != null ? puntajeRqd(rqd) : null, zonas, diseno, rmrFinal, tipoFinal, ajusteIA, propuesta };
}
export type Calculo = ReturnType<typeof calcular>;

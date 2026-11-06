// Vista en planta donde el ingeniero arrastra fallas, vetas y contactos a su posición real.
// La posición queda en la estructura (pos) y la sección del frente y el análisis de cuñas la usan.
import { useRef, useState } from 'react';
import type { Reporte } from '../model';
import { aSvg, vistaPlanta, type Manija, type P, type RmrZonas } from '../export/croquis';

const W = 300, HH = 230;
const NOMBRE: Record<string, string> = { SD: 'diaclasa', F: 'falla', V: 'veta', C: 'contacto' };

export function PlantaEditable({ r, rz, onMover }: { r: Reporte; rz: RmrZonas; onMover: (cambios: { n: number; pos: { s: number; t: number } | undefined }[]) => void }) {
  const [editar, setEditar] = useState(false);
  const [vivo, setVivo] = useState<{ n: number; pos: { s: number; t: number } } | null>(null);
  const arr = useRef<{ m: Manija; p0: P; id: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const rv = vivo ? { ...r, familias: r.familias.map((f, i) => (i + 1 === vivo.n ? { ...f, pos: vivo.pos } : f)) } : r;
  const pl = vistaPlanta(rv, rz);
  if (!pl) return <p className="tenue">Falta el azimut para la planta.</p>;
  const [x0, y0, x1, y1] = pl.caja, k = Math.min((W - 6) / (x1 - x0), (HH - 6) / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (HH - (y1 - y0) * k) / 2;
  const aSvgXY = (q: P): P => [ox + (q[0] - x0) * k, HH - oy - (q[1] - y0) * k];
  const aMundo = (e: React.PointerEvent): P => {
    const b = caja.current!.getBoundingClientRect(), sx = ((e.clientX - b.left) / b.width) * W, sy = ((e.clientY - b.top) / b.height) * HH;
    return [x0 + (sx - ox) / k, y0 + (HH - oy - sy) / k];
  };
  const manijas = pl.manijas ?? [];
  const movidas = r.familias.some((f, i) => f.pos && manijas.some(m => m.n === i + 1));
  const abajo = (e: React.PointerEvent) => {
    if (!editar || !manijas.length) return;
    const p = aMundo(e);
    let mejor: { m: Manija; dist: number } | null = null;
    for (const m of manijas) { // distancia al segmento de la traza
      const w: P = [p[0] - m.o[0], p[1] - m.o[1]], t = Math.max(-m.R, Math.min(m.R, w[0] * m.d[0] + w[1] * m.d[1]));
      const dist = Math.hypot(w[0] - m.d[0] * t, w[1] - m.d[1] * t) * k;
      if (!mejor || dist < mejor.dist) mejor = { m, dist };
    }
    if (!mejor || mejor.dist > 16) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    arr.current = { m: mejor.m, p0: [p[0] - mejor.m.o[0], p[1] - mejor.m.o[1]], id: e.pointerId };
    e.preventDefault();
  };
  const mover = (e: React.PointerEvent) => {
    const a = arr.current; if (!a || a.id !== e.pointerId) return;
    const p = aMundo(e), o: P = [p[0] - a.p0[0], p[1] - a.p0[1]];
    setVivo({ n: a.m.n, pos: { s: Math.round((o[0] * a.m.u[0] + o[1] * a.m.u[1]) * 100) / 100, t: Math.round((o[0] * a.m.v[0] + o[1] * a.m.v[1]) * 100) / 100 } });
  };
  const soltar = () => { if (arr.current && vivo) onMover([vivo]); arr.current = null; setVivo(null); };
  return (
    <div className="planta-editable">
      <div ref={caja} className={`vista-planta${editar ? ' editando' : ''}`} onPointerDown={abajo} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <div dangerouslySetInnerHTML={{ __html: aSvg(pl, W, HH) }} />
        {editar && <svg className="manijas" viewBox={`0 0 ${W} ${HH}`}>{manijas.map(m => { const [x, y] = aSvgXY(m.o); return <circle key={m.n} cx={x} cy={y} r={vivo?.n === m.n ? 7 : 5.5} />; })}</svg>}
      </div>
      {manijas.length > 0 && <div className="fila-botones">
        <button className={`btn mini${editar ? ' primario' : ''}`} onClick={() => setEditar(x => !x)}>{editar ? '✓ Listo' : '✋ Mover estructuras'}</button>
        {movidas && <button className="btn mini" onClick={() => onMover(manijas.map(m => ({ n: m.n, pos: undefined })))}>↺ Posición automática</button>}
      </div>}
      {editar && <p className="tenue">Arrastre {manijas.map(m => `la ${NOMBRE[m.abrev] ?? 'estructura'} ${m.abrev}${m.n}`).join(', ')} hasta donde la vio. El rumbo y el buzamiento no cambian; la sección del frente y las cuñas se recalculan solas con la nueva posición.</p>}
    </div>
  );
}

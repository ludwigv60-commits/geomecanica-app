// Fotos del frente/zonas con trazas dibujadas a mano (diaclasas, fallas, vetas, contactos).
import { useRef, useState } from 'react';
import { TIPOS_ESTRUCTURA, uid, type Discontinuidad, type Foto, type TipoEstructura, type Traza } from './model';

const MAX = 1600;

export async function leerFoto(file: File): Promise<Pick<Foto, 'src' | 'w' | 'h'>> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
    cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { src: cv.toDataURL('image/jpeg', 0.82), w, h };
  } finally { URL.revokeObjectURL(url); }
}

/** Dibuja la foto con sus trazas en un canvas (para el reporte). */
export async function fotoConTrazas(f: Foto, ancho = 1400): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = f.src; });
  const k = ancho / f.w; const w = ancho, h = Math.round(f.h * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c = cv.getContext('2d')!;
  c.drawImage(img, 0, 0, w, h);
  const lw = Math.max(3, w / 300);
  for (const t of f.trazas) {
    const col = TIPOS_ESTRUCTURA[t.tipo].color;
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); t.pts.forEach(([x, y], i) => i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h)); c.stroke();
    const [x, y] = t.pts[t.pts.length - 1]!;
    if (t.nombre) {
      c.font = `bold ${Math.round(w / 45)}px sans-serif`;
      const tx = Math.min(w - c.measureText(t.nombre).width - 6, x * w + 6), ty = Math.max(w / 40, y * h - 6);
      c.lineWidth = lw * 1.2; c.strokeStyle = '#000'; c.strokeText(t.nombre, tx, ty);
      c.fillStyle = col; c.fillText(t.nombre, tx, ty);
    }
  }
  return cv.toDataURL('image/jpeg', 0.85);
}

const etiquetaDisc = (d: Discontinuidad) => `${d.nombre}${d.dip != null && d.dd != null ? ` ${d.dip}/${String(d.dd).padStart(3, '0')}` : ''}`;

type Props = { foto: Foto; disc: Discontinuidad[]; onCambio: (f: Foto) => void; onCerrar: () => void };

export function EditorFoto({ foto, disc, onCambio, onCerrar }: Props) {
  const [tipo, setTipo] = useState<TipoEstructura>('D');
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<'dibujar' | 'borrar'>('dibujar');
  const [recta, setRecta] = useState(true);
  const [actual, setActual] = useState<[number, number][] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [ia, setIa] = useState<string | null>(null);

  const detectar = async () => {
    setIa('Analizando la foto con la IA…');
    try {
      const { detectarConRed } = await import('./ia/modelo-trazas');
      const { modeloUsado } = await import('./ia/onnx');
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = foto.src; });
      const r = await detectarConRed(img);
      const nuevas: Traza[] = r.segmentos.filter(sg => sg.familia >= 0).map(sg => ({
        tipo: 'D', nombre: `IA-D${sg.familia + 1}`, ia: true,
        pts: [[sg.x1 / r.w, sg.y1 / r.h], [sg.x2 / r.w, sg.y2 / r.h]],
      }));
      onCambio({ ...foto, trazas: [...foto.trazas.filter(t => !t.ia), ...nuevas] });
      const { modeloUsado: m2 } = await import('./ia/onnx');
      setIa(nuevas.length
        ? `IA (${m2 || modeloUsado}): ${nuevas.length} trazas en ${new Set(nuevas.map(t => t.nombre)).size} familias, confianza ${r.nivel}. Son propuestas (línea punteada): borre las que no correspondan y cambie el rótulo con dip/dd.`
        : 'La IA no encontró trazas largas claras en esta foto. Dibújelas a mano.');
    } catch (e) { setIa('No se pudo correr la IA: ' + (e as Error).message); }
  };

  const punto = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const abajo = (e: React.PointerEvent) => {
    e.preventDefault();
    const p = punto(e);
    if (modo === 'borrar') {
      const d2 = (t: Traza) => Math.min(...t.pts.map(([x, y]) => (x - p[0]) ** 2 * foto.w ** 2 + (y - p[1]) ** 2 * foto.h ** 2));
      const cerca = foto.trazas.map((t, i) => ({ i, d: d2(t) })).sort((a, b) => a.d - b.d)[0];
      if (cerca && cerca.d < (Math.max(foto.w, foto.h) * 0.05) ** 2) onCambio({ ...foto, trazas: foto.trazas.filter((_, i) => i !== cerca.i) });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setActual([p]);
  };
  const mover = (e: React.PointerEvent) => { if (actual) { e.preventDefault(); const p = punto(e); setActual(recta ? [actual[0]!, p] : [...actual, p]); } };
  const arriba = () => {
    if (!actual) return;
    const pts = actual; setActual(null);
    if (pts.length < 2) return;
    const [a, b] = [pts[0]!, pts[pts.length - 1]!];
    if (Math.hypot((a[0] - b[0]) * foto.w, (a[1] - b[1]) * foto.h) < 15) return;
    const simpl = recta ? [a, b] : pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
    onCambio({ ...foto, trazas: [...foto.trazas, { tipo, nombre: nombre.trim(), pts: simpl as [number, number][] }] });
  };
  const lw = Math.max(foto.w, foto.h) / 250;

  return (
    <div className="pantalla-foto">
      <div className="barra-foto">
        <button onClick={onCerrar}>✓ Listo</button>
        <button className={modo === 'dibujar' ? 'activo' : ''} onClick={() => setModo('dibujar')}>✏️ Dibujar</button>
        <button className={modo === 'borrar' ? 'activo' : ''} onClick={() => setModo('borrar')}>🧽 Borrar</button>
        <button onClick={() => onCambio({ ...foto, trazas: foto.trazas.slice(0, -1) })} disabled={!foto.trazas.length}>↶ Deshacer</button>
        <label className="chk"><input type="checkbox" checked={recta} onChange={e => setRecta(e.target.checked)} /> Recta</label>
        <button onClick={detectar}>🤖 IA trazas</button>
        {foto.trazas.some(t => t.ia) && <button onClick={() => onCambio({ ...foto, trazas: foto.trazas.map(t => t.ia ? { ...t, ia: false, nombre: t.nombre.replace(/^IA-/, '') } : t) })}>✓ Aceptar IA</button>}
      </div>
      {ia && <div className="barra-foto aviso-ia" onClick={() => setIa(null)}>{ia}</div>}
      <div className="barra-foto">
        {(Object.keys(TIPOS_ESTRUCTURA) as TipoEstructura[]).map(t => (
          <button key={t} className={tipo === t ? 'activo' : ''} style={{ borderColor: TIPOS_ESTRUCTURA[t].color }} onClick={() => setTipo(t)}>
            <span className="punto" style={{ background: TIPOS_ESTRUCTURA[t].color }} /> {TIPOS_ESTRUCTURA[t].nombre}
          </button>
        ))}
      </div>
      <div className="barra-foto">
        <span>Rótulo:</span>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="ej. D1 65/120" style={{ width: 130 }} />
        {disc.map(d => <button key={d.id} onClick={() => { setNombre(etiquetaDisc(d)); setTipo(d.tipo); }}>{etiquetaDisc(d)}</button>)}
      </div>
      <div className="lienzo">
        <div style={{ position: 'relative', width: '100%', maxWidth: `min(100%, calc((100dvh - 190px) * ${foto.w / foto.h}))`, margin: '0 auto' }}>
          <img src={foto.src} style={{ width: '100%', display: 'block' }} alt="" />
          <svg ref={svg} viewBox={`0 0 ${foto.w} ${foto.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
            onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={arriba}>
            {[...foto.trazas, ...(actual ? [{ tipo, nombre, pts: actual }] : [])].map((t, i) => {
              const col = TIPOS_ESTRUCTURA[t.tipo].color;
              const d = t.pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x * foto.w},${y * foto.h}`).join(' ');
              const [x, y] = t.pts[t.pts.length - 1]!;
              return <g key={i}>
                <path d={d} stroke="#000" strokeWidth={lw * 2} fill="none" strokeLinecap="round" opacity={0.4} />
                <path d={d} stroke={col} strokeWidth={lw} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={'ia' in t && t.ia ? `${lw * 3} ${lw * 2}` : undefined} />
                {t.nombre && <text x={x * foto.w + 6} y={y * foto.h - 6} fill={col} stroke="#000" strokeWidth={lw / 2} paintOrder="stroke" fontSize={Math.max(foto.w, foto.h) / 40} fontWeight="bold">{t.nombre}</text>}
              </g>;
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

export const nuevaFoto = (titulo: string, d: Pick<Foto, 'src' | 'w' | 'h'>): Foto => ({ id: uid(), titulo, trazas: [], ...d });

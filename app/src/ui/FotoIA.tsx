// Foto del frente con azimut (brújula) + trazas (IA o a mano) + propuestas de la IA.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reporte } from '../model';
import { Medidor } from './Medidor';
import { analizar, estadisticas, segmentoDe } from '../ia/trazas';
import { aplicar, medidasFoto, proponer } from '../ia/sugerencias';

export const COLORES = ['#ffd400', '#00e5ff', '#ff4fd8', '#7CFF4F', '#ff8a00'];
const MAX = 800; // las trazas se guardan en coordenadas de la foto reducida a 800 px

type Props = { r: Reporte; setR: (f: (p: Reporte) => Reporte) => void; historial: Reporte[]; decl: number; conv: number };
type Modo = 'ver' | 'dibujar' | 'borrar';

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export function FotoIA({ r, setR, historial, decl, conv }: Props) {
  const [camara, setCamara] = useState(false);
  const [modo, setModo] = useState<Modo>('ver');
  const [fam, setFam] = useState(0);
  const [anchoFoto, setAnchoFoto] = useState<number | null>(r.ancho);
  const [estado, setEstado] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const inicio = useRef<[number, number] | null>(null);
  const [arrastre, setArrastre] = useState<[number, number, number, number] | null>(null);

  useEffect(() => { if (r.foto) cargar(r.foto).then(setImg); else setImg(null); }, [r.foto]);
  useEffect(() => { if (anchoFoto == null && r.ancho != null) setAnchoFoto(r.ancho); }, [r.ancho]);

  const dims = img ? (() => { const k = Math.min(1, MAX / Math.max(img.width, img.height)); return { w: Math.round(img.width * k), h: Math.round(img.height * k) }; })() : null;
  const trazas = r.trazasFoto;
  const setSegs = (f: (s: NonNullable<Reporte['trazasFoto']>['segmentos']) => NonNullable<Reporte['trazasFoto']>['segmentos']) =>
    setR(p => ({ ...p, trazasFoto: { w: dims!.w, h: dims!.h, segmentos: f(p.trazasFoto?.segmentos ?? []) } }));

  const analizarFoto = () => {
    if (!img || !dims) return;
    setEstado('Analizando la foto…');
    setTimeout(() => {
      const cv = Object.assign(document.createElement('canvas'), dims);
      const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0, dims.w, dims.h);
      const t = analizar(ctx.getImageData(0, 0, dims.w, dims.h).data, dims.w, dims.h);
      setR(p => ({ ...p, trazasFoto: { w: dims.w, h: dims.h, segmentos: t.segmentos.filter(s => s.familia >= 0) } }));
      setEstado(t.familias.length
        ? `La IA propone ${t.familias.length} familia(s). Revise: borre las trazas que no sean fracturas (bordes, letreros, sombras) y dibuje las que falten.`
        : 'No se encontraron trazas claras. Dibújelas con el dedo.');
    }, 30);
  };

  // Dibujo de la foto y las trazas.
  useEffect(() => {
    const cv = lienzo.current; if (!cv || !img) return;
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const k = trazas ? img.width / trazas.w : dims ? img.width / dims.w : 1;
    ctx.lineWidth = Math.max(3, img.width / 250); ctx.lineCap = 'round';
    const linea = (x1: number, y1: number, x2: number, y2: number, c: string) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke(); };
    for (const s of trazas?.segmentos ?? []) linea(s.x1, s.y1, s.x2, s.y2, COLORES[s.familia % COLORES.length]!);
    if (arrastre) linea(...arrastre, '#ffffff');
  }, [img, trazas, arrastre]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * dims!.w, ((e.clientY - b.top) / b.height) * dims!.h];
  };
  const abajo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dims || modo === 'ver') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = punto(e);
    if (modo === 'borrar') {
      const segs = trazas?.segmentos ?? []; let best = -1, bd = 25;
      segs.forEach((s, i) => { const d = distSeg(p, s); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) setSegs(ss => ss.filter((_, i) => i !== best));
      return;
    }
    inicio.current = p;
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => { if (inicio.current) { const p = punto(e); setArrastre([...inicio.current, ...p]); } };
  const arriba = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inicio.current) return;
    const [x1, y1] = inicio.current, [x2, y2] = punto(e);
    inicio.current = null; setArrastre(null);
    if (Math.hypot(x2 - x1, y2 - y1) > 12) setSegs(ss => [...ss, segmentoDe(x1, y1, x2, y2, fam)]);
  };

  const stats = useMemo(() => (trazas?.segmentos.length ? estadisticas(trazas.segmentos.map(s => ({ ...s })), trazas.w, trazas.h) : null), [trazas]);
  const medidas = useMemo(() => (stats && anchoFoto ? medidasFoto(stats, anchoFoto) : null), [stats, anchoFoto]);
  const props = useMemo(() => proponer(r, historial, medidas), [r, historial, medidas]);
  const nFam = Math.max(3, r.familias.length, ...(trazas?.segmentos.map(s => s.familia + 1) ?? [0]));

  const galeria = async (file?: File) => {
    if (!file) return;
    const i = await cargar(URL.createObjectURL(file));
    const k = Math.min(1, 1600 / Math.max(i.width, i.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(i.width * k), height: Math.round(i.height * k) });
    cv.getContext('2d')!.drawImage(i, 0, 0, cv.width, cv.height);
    setR(p => ({ ...p, foto: cv.toDataURL('image/jpeg', 0.85), trazasFoto: undefined }));
  };

  if (camara) return (
    <Medidor modo="az" foto titulo="Foto del frente" decl={decl} conv={conv} onCancelar={() => setCamara(false)}
      onListo={(l, foto) => { setCamara(false); setR(p => ({ ...p, foto: foto ?? p.foto, trazasFoto: foto ? undefined : p.trazasFoto, azimut: l.az != null ? Math.round(l.az * 10) / 10 : p.azimut })); }} />
  );

  return (
    <section className="tarjeta">
      {img && <canvas ref={lienzo} className={`foto-lienzo ${modo}`} style={{ width: '100%', borderRadius: 8, touchAction: modo === 'ver' ? 'auto' : 'none' }}
        onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={() => { inicio.current = null; setArrastre(null); }} />}
      <button className="btn primario foto-btn" onClick={() => setCamara(true)}>📷 {r.foto ? 'Repetir foto y azimut' : 'Foto del frente + azimut'}</button>
      {r.azimut != null && <p className="tenue">Azimut de la labor: <b>{r.azimut}°</b> UTM.</p>}
      <label className="btn mini" style={{ textAlign: 'center' }}>Elegir foto de la galería (sin azimut)
        <input type="file" accept="image/*" hidden onChange={e => galeria(e.target.files?.[0])} /></label>
      {img && <>
        <button className="btn" onClick={analizarFoto}>🤖 Buscar trazas con IA</button>
        {estado && <p className="tenue">{estado}</p>}
        <div className="segmentos">
          {(['ver', 'dibujar', 'borrar'] as Modo[]).map(m => (
            <button key={m} className={modo === m ? 'sel' : ''} onClick={() => setModo(m)}>{m === 'ver' ? 'Ver' : m === 'dibujar' ? '✏️ Dibujar traza' : '🧽 Borrar traza'}</button>
          ))}
        </div>
        {modo === 'dibujar' && <div className="chips" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {Array.from({ length: Math.min(5, nFam) }, (_, i) => (
            <button key={i} className="chip" style={{ borderColor: COLORES[i], background: fam === i ? COLORES[i] : 'transparent', color: fam === i ? '#000' : undefined }} onClick={() => setFam(i)}>
              Familia {i + 1}{r.familias[i] ? ` · ${r.familias[i]!.abrev}` : ''}</button>
          ))}
        </div>}
        {stats && <p className="tenue">{stats.familias.map(f => `Familia ${f.id + 1}: ${f.segmentos} trazas${f.espaciamientoPx && medidas ? `, espaciamiento ≈ ${(f.espaciamientoPx / medidas.escala).toFixed(2)} m` : ''}`).join(' · ')}</p>}
        <label className="campo"><span>Ancho real que abarca la foto (m)</span>
          <input inputMode="decimal" value={anchoFoto ?? ''} onChange={e => setAnchoFoto(e.target.value ? Number(e.target.value.replace(',', '.')) : null)} /></label>
      </>}
      {props.length > 0 && <div className="propuestas">
        <h3>Propuesta de la IA <span className="sugerido">Sugerido por IA</span></h3>
        <ul>{props.map(p => <li key={p.clave}><b>{p.fuente === 'foto' ? 'Foto' : 'Historial'}:</b> {p.texto}</li>)}</ul>
        <button className="btn primario" onClick={() => setR(p => aplicar(p, props))}>Llenar lo que está vacío</button>
        <p className="tenue">Solo llena campos vacíos. Lo llenado queda marcado en morado hasta que usted lo confirme o cambie.</p>
      </div>}
    </section>
  );
}

function distSeg([px, py]: [number, number], s: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

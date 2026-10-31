// Fotos por zona (Frente, H.I., Corona, H.D.) desde varios ángulos, con azimut e inclinación de la cámara,
// control de calidad, mejora con poca luz, trazas (IA o a mano) y propuestas de la IA. Módulos 5, 6, 8 y 11.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ZONAS_FOTO, type FotoZona, type Reporte, type ZonaFoto } from '../model';
import { Medidor } from './Medidor';
import { analizar, estadisticas, segmentoDe } from '../ia/trazas';
import { aplicar, medidasFoto, proponer } from '../ia/sugerencias';
import { evaluar, mejorar, mensajeCalidad } from '../ia/calidad';

export const COLORES = ['#ffd400', '#00e5ff', '#ff4fd8', '#7CFF4F', '#ff8a00'];
const MAX = 800;

type Props = { r: Reporte; setR: (f: (p: Reporte) => Reporte) => void; historial: Reporte[]; decl: number; conv: number };
type Modo = 'ver' | 'dibujar' | 'borrar';

const cargar = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const reducida = (img: HTMLImageElement) => {
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  return { w, h, datos: ctx.getImageData(0, 0, w, h).data };
};

export function FotoIA({ r, setR, historial, decl, conv }: Props) {
  const fotos = r.fotos ?? [];
  const [zona, setZona] = useState<ZonaFoto>('FRENTE');
  const [selId, setSelId] = useState<string | null>(fotos[0]?.id ?? null);
  const [camara, setCamara] = useState(false);
  const [modo, setModo] = useState<Modo>('ver');
  const [fam, setFam] = useState(0);
  const [anchoFoto, setAnchoFoto] = useState<number | null>(r.ancho);
  const [estado, setEstado] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const inicio = useRef<[number, number] | null>(null);
  const [arrastre, setArrastre] = useState<[number, number, number, number] | null>(null);

  const deZona = fotos.filter(f => f.zona === zona);
  const sel = fotos.find(f => f.id === selId && f.zona === zona) ?? deZona[0] ?? null;
  useEffect(() => { if (sel) cargar(sel.data).then(setImg); else setImg(null); setEstado(null); }, [sel?.id]);
  useEffect(() => { if (anchoFoto == null && r.ancho != null) setAnchoFoto(r.ancho); }, [r.ancho]);

  const dims = img ? { w: Math.round(img.width * Math.min(1, MAX / Math.max(img.width, img.height))), h: Math.round(img.height * Math.min(1, MAX / Math.max(img.width, img.height))) } : null;
  const editarFoto = (id: string, f: (x: FotoZona) => FotoZona) => setR(p => ({ ...p, fotos: (p.fotos ?? []).map(x => (x.id === id ? f(x) : x)) }));

  /** Agrega una foto: evalúa calidad y, si es del frente, actualiza el azimut de la labor. */
  const agregar = async (data: string, az?: number, plunge?: number) => {
    const im = await cargar(data); const red = reducida(im);
    const c = evaluar(red.datos, red.w, red.h);
    const nueva: FotoZona = { id: crypto.randomUUID(), zona, data, fecha: new Date().toISOString(), az, plunge, calidad: { apta: c.apta, motivos: c.motivos } };
    setR(p => ({
      ...p, fotos: [...(p.fotos ?? []), nueva],
      // Azimut de la labor: promedio de las fotos del frente tomadas casi horizontales.
      azimut: zona === 'FRENTE' && az != null && Math.abs(plunge ?? 0) < 35 ? azimutFrente([...(p.fotos ?? []), nueva]) ?? p.azimut : p.azimut,
    }));
    setSelId(nueva.id);
    setEstado(mensajeCalidad(c));
  };

  const analizarFoto = () => {
    if (!img || !sel) return;
    setEstado('Analizando la foto…');
    setTimeout(() => {
      const red = reducida(img);
      const c = evaluar(red.datos, red.w, red.h);
      const datos = c.brillo < 0.35 || c.contraste < 0.12 ? mejorar(red.datos, red.w, red.h) : red.datos; // mejora para poca luz
      const t = analizar(datos, red.w, red.h);
      editarFoto(sel.id, f => ({ ...f, trazas: { w: red.w, h: red.h, segmentos: t.segmentos.filter(s => s.familia >= 0) } }));
      setEstado(t.familias.length
        ? `La IA propone ${t.familias.length} familia(s)${datos !== red.datos ? ' (con mejora de poca luz)' : ''}. Borre lo que no sea fractura (bordes, letreros, sombras) y dibuje lo que falte.`
        : 'No se encontraron trazas claras. Dibújelas con el dedo.');
    }, 30);
  };

  useEffect(() => {
    const cv = lienzo.current; if (!cv || !img || !dims) return;
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const k = img.width / dims.w; ctx.lineWidth = Math.max(3, img.width / 250); ctx.lineCap = 'round';
    const linea = (x1: number, y1: number, x2: number, y2: number, c: string) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke(); };
    for (const s of sel?.trazas?.segmentos ?? []) linea(s.x1, s.y1, s.x2, s.y2, COLORES[s.familia % COLORES.length]!);
    if (arrastre) linea(...arrastre, '#ffffff');
  }, [img, sel?.trazas, arrastre]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * dims!.w, ((e.clientY - b.top) / b.height) * dims!.h];
  };
  const setSegs = (f: (s: NonNullable<FotoZona['trazas']>['segmentos']) => NonNullable<FotoZona['trazas']>['segmentos']) =>
    sel && dims && editarFoto(sel.id, x => ({ ...x, trazas: { w: dims.w, h: dims.h, segmentos: f(x.trazas?.segmentos ?? []) } }));
  const abajo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dims || modo === 'ver') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = punto(e);
    if (modo === 'borrar') {
      let best = -1, bd = 25;
      (sel?.trazas?.segmentos ?? []).forEach((s, i) => { const d = distSeg(p, s); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) setSegs(ss => ss.filter((_, i) => i !== best));
      return;
    }
    inicio.current = p;
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => { if (inicio.current) setArrastre([...inicio.current, ...punto(e)]); };
  const arriba = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inicio.current) return;
    const [x1, y1] = inicio.current, [x2, y2] = punto(e);
    inicio.current = null; setArrastre(null);
    if (Math.hypot(x2 - x1, y2 - y1) > 12) setSegs(ss => [...ss, segmentoDe(x1, y1, x2, y2, fam)]);
  };

  // La propuesta usa la foto del FRENTE con más trazas (la que mejor muestra el fracturamiento).
  const base = useMemo(() => [...fotos].filter(f => f.zona === 'FRENTE' && f.trazas?.segmentos.length).sort((a, b) => b.trazas!.segmentos.length - a.trazas!.segmentos.length)[0]
    ?? fotos.find(f => f.trazas?.segmentos.length), [fotos]);
  const stats = useMemo(() => (base?.trazas ? estadisticas(base.trazas.segmentos.map(s => ({ ...s })), base.trazas.w, base.trazas.h) : null), [base]);
  const medidas = useMemo(() => (stats && anchoFoto ? medidasFoto(stats, anchoFoto) : null), [stats, anchoFoto]);
  const props = useMemo(() => proponer(r, historial, medidas), [r, historial, medidas]);
  const nFam = Math.max(3, r.familias.length);

  const galeria = async (file?: File) => {
    if (!file) return;
    const i = await cargar(URL.createObjectURL(file));
    const k = Math.min(1, 1600 / Math.max(i.width, i.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(i.width * k), height: Math.round(i.height * k) });
    cv.getContext('2d')!.drawImage(i, 0, 0, cv.width, cv.height);
    await agregar(cv.toDataURL('image/jpeg', 0.85));
  };

  if (camara) return (
    <Medidor modo="az" foto titulo={`Foto: ${ZONAS_FOTO.find(z => z.id === zona)!.nombre}`} decl={decl} conv={conv} onCancelar={() => setCamara(false)}
      onListo={(l, data) => { setCamara(false); if (data) agregar(data, l.az != null ? Math.round(l.az * 10) / 10 : undefined, l.plunge != null ? Math.round(l.plunge) : undefined); }} />
  );

  const faltan = ZONAS_FOTO.filter(z => !fotos.some(f => f.zona === z.id));
  return (
    <section className="tarjeta">
      <div className="segmentos zonas">
        {ZONAS_FOTO.map(z => { const n = fotos.filter(f => f.zona === z.id).length; return (
          <button key={z.id} className={zona === z.id ? 'sel' : ''} onClick={() => { setZona(z.id); setModo('ver'); }}>{z.nombre}<br /><small>{n ? `${n} foto${n > 1 ? 's' : ''} ✓` : 'falta'}</small></button>); })}
      </div>
      {deZona.length > 0 && <div className="miniaturas">
        {deZona.map(f => (
          <button key={f.id} className={f.id === sel?.id ? 'mini sel' : 'mini'} onClick={() => setSelId(f.id)}>
            <img src={f.data} alt="" />{f.calidad && !f.calidad.apta && <span className="no-apta">!</span>}
          </button>
        ))}
      </div>}
      {sel?.calidad && !sel.calidad.apta && <p className="alerta">FOTO NO APTA – {sel.calidad.motivos.join('; ')}. Tome una nueva.</p>}
      {img && <canvas ref={lienzo} className="foto-lienzo" style={{ width: '100%', borderRadius: 8, touchAction: modo === 'ver' ? 'auto' : 'none' }}
        onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={() => { inicio.current = null; setArrastre(null); }} />}
      {sel && <p className="tenue">
        {sel.az != null ? `Cámara: azimut ${sel.az}° UTM, inclinación ${sel.plunge ?? '—'}°. ` : 'Sin azimut (foto de galería). '}
        {zona === 'FRENTE' && r.azimut != null && <>Azimut de la labor: <b>{r.azimut}°</b>. </>}
        <button className="btn mini" onClick={() => { setR(p => ({ ...p, fotos: (p.fotos ?? []).filter(x => x.id !== sel.id) })); setSelId(null); }}>Quitar foto</button>
      </p>}
      <button className="btn primario foto-btn" onClick={() => setCamara(true)}>📷 Foto {ZONAS_FOTO.find(z => z.id === zona)!.nombre}{zona === 'FRENTE' ? ' + azimut' : ''}</button>
      <p className="tenue">{deZona.length < 2 ? 'Recomendado: 2 a 3 fotos por zona desde ángulos distintos. ' : ''}De pie, celular vertical, con buena luz y sin polvo.</p>
      <label className="btn mini" style={{ textAlign: 'center' }}>Elegir foto de la galería
        <input type="file" accept="image/*" hidden onChange={e => { galeria(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {faltan.length > 0 && fotos.length > 0 && <p className="tenue">Falta al menos una foto de: {faltan.map(z => z.nombre).join(', ')}.</p>}
      {img && <>
        <button className="btn" onClick={analizarFoto}>🤖 Buscar trazas con IA</button>
        {estado && <p className={estado.startsWith('FOTO NO APTA') ? 'alerta' : 'tenue'}>{estado}</p>}
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
      </>}
      {stats && <>
        <p className="tenue">Para la propuesta se usa la foto del frente con más trazas. {stats.familias.map(f => `Familia ${f.id + 1}: ${f.segmentos} trazas${f.espaciamientoPx && medidas ? `, espaciamiento ≈ ${(f.espaciamientoPx / medidas.escala).toFixed(2)} m` : ''}`).join(' · ')}</p>
        <label className="campo"><span>Ancho real que abarca esa foto (m)</span>
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

/** Azimut de la labor = promedio circular de las fotos del frente casi horizontales. */
function azimutFrente(fotos: FotoZona[]): number | null {
  const v = fotos.filter(f => f.zona === 'FRENTE' && f.az != null && Math.abs(f.plunge ?? 0) < 35).map(f => f.az!);
  if (!v.length) return null;
  let s = 0, c = 0; for (const a of v) { s += Math.sin(a * Math.PI / 180); c += Math.cos(a * Math.PI / 180); }
  return Math.round((((Math.atan2(s, c) * 180 / Math.PI) + 360) % 360) * 10) / 10;
}
function distSeg([px, py]: [number, number], s: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

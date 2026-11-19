// Visor 3D interactivo de la labor ANTES DEL DESATADO: girar con un dedo, zoom y mover con dos dedos (o el
// mouse: arrastrar, rueda y clic derecho). Cuñas por riesgo, diaclasas, fallas y zona de influencia.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reporte } from '../model';
import type { RmrZonas } from '../export/croquis';
import type { Capa, Escena3 } from '../export/escena3d';
import type { Preset, Vista3D } from '../export/render3d';
import { COLOR_CAE, COLOR_RIESGO } from '../export/cunas2d';

const CAPAS: { c: Capa; t: string }[] = [
  { c: 'cunas', t: 'Cuñas' }, { c: 'diaclasas', t: 'Diaclasas' }, { c: 'fallas', t: 'Fallas / vetas' }, { c: 'influencia', t: 'Zona de influencia' }, { c: 'anterior', t: 'Labor anterior' },
];
const PRESETS: { p: Preset; t: string }[] = [{ p: 'lateral', t: 'Costado' }, { p: 'frente', t: 'Frente' }, { p: 'planta', t: 'Planta' }, { p: 'contra', t: 'Otro lado' }];

/** Clave con lo que cambia la escena: si no cambia, no se recalcula. */
const claveEscena = (r: Reporte, rz: RmrZonas) => JSON.stringify([r.ancho, r.alto, r.azimut, r.avance, r.familias, r.sobreexc, r.rmr, r.ajuste, r.q, r.tipoGeologo, r.desde, r.hasta, r.id, r.fecha, rz]);

export function Visor3D({ r, rz }: { r: Reporte; rz: RmrZonas }) {
  const caja = useRef<HTMLDivElement>(null), lienzo = useRef<HTMLCanvasElement>(null), vista = useRef<Vista3D | null>(null);
  const [esc, setEsc] = useState<Escena3 | null>(null);
  const [estado, setEstado] = useState<'calculando' | 'listo' | 'sin-webgl' | 'sin-datos'>('calculando');
  const [capas, setCapas] = useState<Record<Capa, boolean>>({ cunas: true, diaclasas: true, fallas: true, influencia: true, anterior: true, labor: true, frente: true, piso: true });
  const [activo, setActivo] = useState(false), [completo, setCompleto] = useState(false), [gira, setGira] = useState(false), [preset, setPreset] = useState<Preset>('lateral');
  const clave = useMemo(() => claveEscena(r, rz), [r, rz]);
  // escena (pesada): se calcula un momento después de que se deja de escribir
  useEffect(() => {
    setEstado('calculando');
    const t = setTimeout(async () => {
      const { escena3d } = await import('../export/escena3d');
      const e = escena3d(r, rz);
      setEsc(e); setEstado(e ? 'listo' : 'sin-datos');
    }, 450);
    return () => clearTimeout(t);
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  // dibujo con three.js
  useEffect(() => {
    if (!esc || !lienzo.current || !caja.current) return;
    let v: Vista3D | null = null, vivo = true;
    (async () => {
      const { crearVista } = await import('../export/render3d');
      if (!vivo || !lienzo.current || !caja.current) return;
      const b = caja.current.getBoundingClientRect();
      try { v = crearVista(lienzo.current, esc, { tema: 'oscuro', interactivo: true, w: Math.max(200, b.width), h: Math.max(160, b.height), pr: Math.min(2, window.devicePixelRatio || 1) }); }
      catch { setEstado('sin-webgl'); return; }
      vista.current = v;
      (Object.keys(capas) as Capa[]).forEach(c => v!.capa(c, capas[c]));
      v.preset(preset); v.interactivo(activo || completo); v.girar(gira);
    })();
    return () => { vivo = false; v?.destruir(); vista.current = null; };
  }, [esc]); // eslint-disable-line react-hooks/exhaustive-deps
  // tamaño del lienzo
  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(() => { const b = el.getBoundingClientRect(); vista.current?.tamano(Math.max(200, b.width), Math.max(160, b.height)); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { vista.current?.interactivo(activo || completo); }, [activo, completo]);
  useEffect(() => { vista.current?.girar(gira); }, [gira]);
  useEffect(() => {
    if (!completo) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompleto(false); };
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [completo]);
  const cambiaCapa = (c: Capa) => setCapas(p => { const n = { ...p, [c]: !p[c] }; vista.current?.capa(c, n[c]); return n; });
  const irA = (p: Preset) => { setPreset(p); vista.current?.preset(p, true); };
  const k = esc?.conteo;

  if (estado === 'sin-datos') return <p className="tenue">Para la vista 3D falta el azimut, el ancho y alto de la sección o 2 estructuras medidas.</p>;
  return (
    <div className={`visor3d${completo ? ' completo' : ''}`}>
      <div ref={caja} className={`v3-lienzo${activo || completo ? ' activo' : ''}`}>
        <canvas ref={lienzo} />
        {estado === 'calculando' && <div className="v3-aviso"><span className="v3-giro" /> Proyectando cuñas a lo largo del avance…</div>}
        {estado === 'sin-webgl' && <div className="v3-aviso">Este equipo no puede dibujar 3D (sin WebGL).</div>}
        <div className="v3-titulo"><b>ANTES DEL DESATADO</b><span>{r.labor || 'Labor'} · {r.desde || '—'} → {r.hasta || '—'}{esc ? ` · avance ${esc.L.toFixed(1)} m` : ''}</span></div>
        {!activo && !completo && estado === 'listo' && <button className="v3-tocar" onClick={() => setActivo(true)}>✋ Tocar para girar</button>}
        <div className="v3-botones">
          <button title="Girar solo" className={gira ? 'on' : ''} onClick={() => setGira(g => !g)}>⟳</button>
          <button title="Pantalla completa" onClick={() => setCompleto(c => !c)}>{completo ? '✕' : '⛶'}</button>
        </div>
        {esc && <div className="v3-leyenda">
          <span><i style={{ background: COLOR_CAE }} />Cae al desatar</span>
          <span><i style={{ background: COLOR_RIESGO.ALTO }} />Alto</span>
          <span><i style={{ background: COLOR_RIESGO.MEDIO }} />Medio</span>
          <span><i style={{ background: COLOR_RIESGO.BAJO }} />Bajo</span>
          {esc.familias.map(f => <span key={f.n}><i className="ln" style={{ background: f.color }} />{f.abrev}{f.n}</span>)}
        </div>}
      </div>
      <div className="v3-controles">
        <div className="v3-fila">{PRESETS.map(x => <button key={x.p} className={`btn mini${preset === x.p ? ' primario' : ''}`} onClick={() => irA(x.p)}>{x.t}</button>)}
          {activo && !completo && <button className="btn mini" onClick={() => setActivo(false)}>✓ Listo</button>}</div>
        <div className="v3-fila">{CAPAS.map(x => <button key={x.c} className={`v3-capa${capas[x.c] ? ' on' : ''}`} onClick={() => cambiaCapa(x.c)}>{capas[x.c] ? '●' : '○'} {x.t}</button>)}</div>
      </div>
      {esc && k && <div className="v3-datos">
        <div><small>Volumen que cae al desatar</small><b>{esc.volCae.toFixed(2)} m³</b><span>{esc.pesoCae.toFixed(1)} t en {esc.L.toFixed(1)} m de avance</span></div>
        <div><small>Cuñas en la zona de influencia</small><b>{esc.volTotal.toFixed(2)} m³</b><span>{esc.zi ? `${Math.round(esc.zi.pct * 100)} % · roca ${esc.zi.tipo}` : 'sin tipo de roca'} · {esc.tramos} secciones</span></div>
      </div>}
      <p className="tenue">Un dedo gira, dos dedos acercan y mueven (mouse: arrastrar, rueda y clic derecho). Las cuñas salen del mismo análisis de la sección, repetido en {esc?.tramos ?? 'varias'} secciones entre el frente y el Desde con cada plano corrido según su orientación. Sin sostenimiento: es la condición antes del desatado.</p>
    </div>
  );
}

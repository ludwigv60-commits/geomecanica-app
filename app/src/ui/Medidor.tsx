// Pantalla de medición con la brújula del celular (integrada de la Fase 0).
import { useEffect, useRef, useState } from 'react';
import { Brujula, resumir, type Lectura, type Modo, type Muestra } from '../brujula/sensor';
import { circStats, linStats, toGrid } from '../brujula/orient';

type Props = { modo: Modo; titulo: string; decl: number; conv: number; foto?: boolean; onListo: (l: Lectura, foto?: string) => void; onCancelar: () => void };

export function Medidor({ modo, titulo, decl, conv, foto, onListo, onCancelar }: Props) {
  const b = useRef<Brujula | null>(null);
  const buf = useRef<Muestra[]>([]);
  const grab = useRef<Muestra[] | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [vista, setVista] = useState<{ a?: number; b?: number } | null>(null);
  const [estable, setEstable] = useState(false);
  const [interf, setInterf] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [iniciado, setIniciado] = useState(false);
  const [midiendo, setMidiendo] = useState(false);
  const [ios, setIos] = useState(false);

  const iniciar = async () => {
    const br = new Brujula(); br.modo = modo; b.current = br;
    const err = await br.iniciar();
    if (err) { setMsg(err); return; }
    setIniciado(true);
    try { await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request('screen'); } catch { /* opcional */ }
    if (modo === 'az') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      } catch { /* sin cámara se mide igual */ }
    }
    setTimeout(() => { if (!buf.current.length) setMsg('No llegan datos de la brújula. Use Chrome (Android) o Safari (iPhone) con https.'); }, 2500);
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const br = b.current;
      if (br) {
        const s = br.muestra();
        setIos(br.necesitaEcharIOS);
        if (s) {
          const now = s.t;
          buf.current.push(s); while (buf.current.length && now - buf.current[0]!.t > 1500) buf.current.shift();
          if (grab.current) grab.current.push(s);
          const v = modo === 'az' ? { a: s.vista.az, b: s.vista.plunge } : { a: s.vista.dip, b: s.vista.dd };
          setVista(v);
          const w = buf.current;
          const sd = modo === 'az' ? circStats(w.map(x => x.az!)).sd : Math.max(linStats(w.map(x => x.dip!)).sd, circStats(w.map(x => x.dd!)).sd);
          setEstable(w.length > 20 && sd < 0.8);
          const g = w.filter(x => x.gm != null).map(x => x.gm!);
          setInterf(g.length > 20 && circStats(g).sd > 3);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); b.current?.detener();
      const s = video.current?.srcObject as MediaStream | null; s?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const cuadro = (): string | undefined => {
    const v = video.current; if (!v || !v.videoWidth) return undefined;
    const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
    cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  };
  const registrar = () => {
    grab.current = []; setMidiendo(true);
    setTimeout(() => {
      const img = foto ? cuadro() : undefined;
      if (foto && !img) { grab.current = null; setMidiendo(false); setMsg('No se pudo tomar la foto: la cámara no está disponible.'); return; }
      const w = grab.current ?? []; grab.current = null; setMidiendo(false);
      if (w.length < 20) { setMsg('Pocas muestras. Repita.'); return; }
      const l = resumir(w, modo, decl, conv, b.current?.metodo ?? '');
      try { navigator.vibrate?.(80); } catch { /* opcional */ }
      if (l.sd > 2) setMsg(`Lectura inestable (±${l.sd.toFixed(1)}°). Conviene repetir.`);
      onListo(l, img);
    }, foto ? 1500 : 3000);
  };

  const fmt = (x?: number, pad = false) => (x == null ? '—' : pad ? String(Math.round(x)).padStart(3, '0') : x.toFixed(0));
  const vAz = vista?.a != null && modo === 'az' ? toGrid(vista.a, decl, conv) : undefined;
  const vDd = vista?.b != null && modo === 'pl' ? toGrid(vista.b, decl, conv) : undefined;

  return (
    <div className="medidor">
      <header className="barra"><button className="btn mini claro" onClick={onCancelar}>‹ Volver</button><h1>{titulo}</h1></header>
      <main className="contenido">
        {modo === 'az' && <div className="visor"><video ref={video} playsInline muted /><span className="mira" /></div>}
        <p className="tenue">{modo === 'az'
          ? 'Celular vertical, cámara apuntando al frente, parado en el eje de la labor.'
          : 'Apoye el dorso del celular sobre la cara de la discontinuidad.'}</p>
        {!iniciado ? <button className="btn primario grande" onClick={iniciar}>Activar brújula</button> : <>
          {ios && <p className="alerta">iPhone: ponga el celular echado (horizontal) 2 segundos para fijar el norte, luego mida.</p>}
          <div className="lectura">
            {modo === 'az'
              ? <><b>{fmt(vAz, true)}°</b><small>azimut UTM · cámara {vista?.b != null ? `${vista.b.toFixed(0)}°` : '—'}</small></>
              : <><b>{fmt(vista?.a)}° / {fmt(vDd, true)}°</b><small>dip / dip direction UTM</small></>}
          </div>
          <div className="chips">
            <span className={estable ? 'chip ok' : 'chip'}>{estable ? 'ESTABLE' : 'Quieto…'}</span>
            {interf && <span className="chip mal">Interferencia magnética</span>}
          </div>
          <button className="btn primario grande" disabled={midiendo} onClick={registrar}>{midiendo ? 'Midiendo… no mueva el celular' : foto ? '📷 Tomar foto y azimut' : 'Registrar (3 s)'}</button>
          <p className="tenue">Declinación {decl}°, convergencia {conv}°. Aléjese de pernos, malla y equipos.</p>
        </>}
        {msg && <p className="alerta">{msg}</p>}
      </main>
    </div>
  );
}

// Pantalla de medición con la brújula del celular (integrada de la Fase 0).
import { useEffect, useRef, useState } from 'react';
import { Brujula, resumir, type Lectura, type Modo, type Muestra } from '../brujula/sensor';
import { circStats, linStats, toGrid } from '../brujula/orient';

type Props = { modo: Modo; titulo: string; decl: number; conv: number; foto?: boolean; conAzimut?: boolean; onListo: (l: Lectura, foto?: string) => void; onCancelar: () => void };

export function Medidor({ modo, titulo, decl, conv, foto, conAzimut = true, onListo, onCancelar }: Props) {
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
  const [arriba, setArriba] = useState<[number, number, number] | null>(null);

  const iniciar = async () => {
    const br = new Brujula(); br.modo = modo; b.current = br;
    const err = await br.iniciar();
    if (err) { setMsg(err); return; }
    setIniciado(true);
    try { await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request('screen'); } catch { /* opcional */ }
    if (modo === 'az' && !foto) await abrirCamara();
    setTimeout(() => { if (!buf.current.length) setMsg('No llegan datos de la brújula. Use Chrome (Android) o Safari (iPhone) con https.'); }, 2500);
  };

  const abrirCamara = async () => {
    if (modo === 'az') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      } catch { setMsg('No se pudo abrir la cámara. Revise el permiso de cámara del navegador.'); }
    }
  };
  useEffect(() => { if (foto) abrirCamara(); }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const br = b.current;
      if (br) {
        const s = br.muestra();
        setIos(br.necesitaEcharIOS);
        setArriba(br.arriba());
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
    // Se guarda exactamente lo que se ve en la pantalla completa (mismo recorte que object-fit: cover).
    const ew = v.clientWidth || v.videoWidth, eh = v.clientHeight || v.videoHeight;
    const esc = Math.max(ew / v.videoWidth, eh / v.videoHeight);
    const sw = ew / esc, sh = eh / esc, sx = (v.videoWidth - sw) / 2, sy = (v.videoHeight - sh) / 2;
    const k = Math.min(1, 2000 / Math.max(sw, sh));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(sw * k), height: Math.round(sh * k) });
    cv.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  };
  const registrar = () => {
    if (foto && !conAzimut) { // fotos de hastiales y corona: sin brújula, al instante
      const img = cuadro();
      if (!img) { setMsg('No se pudo tomar la foto: la cámara no está disponible.'); return; }
      try { navigator.vibrate?.(60); } catch { /* opcional */ }
      onListo({ modo, sd: 0, n: 0, metodo: 'sin-brujula' }, img); return;
    }
    grab.current = []; setMidiendo(true);
    setTimeout(() => {
      const img = foto ? cuadro() : undefined;
      if (foto && !img) { grab.current = null; setMidiendo(false); setMsg('No se pudo tomar la foto: la cámara no está disponible.'); return; }
      const w = grab.current ?? []; grab.current = null; setMidiendo(false);
      if (w.length < 20) {
        if (foto && img) { setMsg(null); onListo({ modo, sd: 0, n: 0, metodo: 'sin-datos-brujula' }, img); return; } // se guarda la foto aunque la brújula no responda
        setMsg('Pocas muestras. Repita.'); return;
      }
      const l = resumir(w, modo, decl, conv, b.current?.metodo ?? '');
      try { navigator.vibrate?.(80); } catch { /* opcional */ }
      if (l.sd > 2) setMsg(`Lectura inestable (±${l.sd.toFixed(1)}°). Conviene repetir.`);
      onListo(l, img);
    }, foto ? 1500 : 3000);
  };

  const fmt = (x?: number, pad = false) => (x == null ? '—' : pad ? String(Math.round(x)).padStart(3, '0') : x.toFixed(0));
  const vAz = vista?.a != null && modo === 'az' ? toGrid(vista.a, decl, conv) : undefined;
  const vDd = vista?.b != null && modo === 'pl' ? toGrid(vista.b, decl, conv) : undefined;

  if (foto) return (
    <div className="camara">
      <video ref={video} playsInline muted />
      {conAzimut && <span className="mira" />}
      <div className="cam-arriba">
        <button className="btn mini claro" onClick={onCancelar}>‹ Volver</button><b>{titulo}</b>
      </div>
      <div className="cam-abajo">
        {conAzimut && (!iniciado
          ? <button className="btn primario" onClick={iniciar}>Activar brújula para el azimut</button>
          : <div className="cam-lectura">
              <b>{fmt(vAz, true)}°</b><span>azimut UTM · cámara {vista?.b != null ? `${vista.b.toFixed(0)}°` : '—'}</span>
              <span className={estable ? 'chip ok' : 'chip'}>{estable ? 'ESTABLE' : 'Quieto…'}</span>
              {interf && <span className="chip mal">Interferencia</span>}
              <Nivel modo="az" u={arriba} quieto={estable} chico />
            </div>)}
        {ios && conAzimut && iniciado && <p className="cam-aviso">Ponga el celular echado 2 s para fijar el norte.</p>}
        {msg && <p className="cam-aviso">{msg}</p>}
        <button className="obturador" aria-label="Tomar foto" disabled={midiendo || (conAzimut && !iniciado)} onClick={registrar}>{midiendo ? '…' : ''}</button>
        <small>{conAzimut ? 'Celular vertical, apuntando al frente, en el eje de la labor.' : 'Encuadre toda la zona.'}</small>
      </div>
    </div>
  );

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
          <Nivel modo={modo} u={arriba} quieto={estable} />
          <div className="chips">
            <span className={estable ? 'chip ok' : 'chip'}>{estable ? 'ESTABLE' : 'Quieto…'}</span>
            {interf && <span className="chip mal">Interferencia magnética</span>}
          </div>
          {modo === 'pl' && vista?.a != null && vista.a < 15 && <p className="alerta">Plano casi horizontal ({vista.a.toFixed(0)}°): el dip dir es poco confiable. Con este dip, 1° de inclinación de costado mueve el dip dir unos {Math.min(90, Math.round(1 / Math.sin(Math.max(1, vista.a) * Math.PI / 180)))}°. Apoye bien el celular y anote el dip dir solo como referencia.</p>}
          {modo === 'pl' && vista?.a != null && vista.a > 82 && <p className="alerta">Plano casi vertical ({vista.a.toFixed(0)}°): si el celular pasa de un lado a otro de la vertical, el dip dir salta 180°. Mantenga la pantalla siempre hacia el mismo lado; el promedio ya corrige ese salto.</p>}
          <button className="btn primario grande" disabled={midiendo} onClick={registrar}>{midiendo ? 'Midiendo… no mueva el celular' : 'Registrar (3 s)'}</button>
          <p className="tenue">Declinación {decl}°, convergencia {conv}°. Aléjese de pernos, malla y equipos.</p>
          {modo === 'pl' && <details className="ayuda">
            <summary>¿Cómo se calcula el dip y el dip direction?</summary>
            <ol>
              <li>El celular, apoyado por la espalda sobre la cara de la estructura, queda paralelo al plano. La perpendicular a la pantalla es la <b>normal del plano</b>.</li>
              <li>Los sensores (giroscopio + acelerómetro + brújula) dan la orientación del celular en el espacio: hacia dónde apunta la normal respecto a la vertical y al norte.</li>
              <li><b>Dip</b> = ángulo entre la normal y la vertical (0° plano horizontal, 90° vertical). Lo da la gravedad, por eso es estable.</li>
              <li><b>Dip direction</b> = rumbo hacia donde apunta la normal vista en planta (hacia donde "cae" el plano). Lo da la brújula: rumbo magnético {decl >= 0 ? '+' : '−'} {Math.abs(decl)}° de declinación − {conv}° de convergencia = rumbo UTM.</li>
              <li>Se promedian 3 s de lecturas como vectores (no ángulos sueltos).</li>
            </ol>
            <p><b>Si mueve solo el dip sin girar el celular, el dip dir debe quedar igual.</b> Varía mucho cuando: el plano es casi horizontal (dip &lt; 15°: la normal casi vertical no tiene una dirección clara), el celular cruza la vertical (salta 180°), o hay acero o magnetita cerca (pernos, malla, equipos; la app avisa "Interferencia"). Prueba rápida: apoye el celular en una mesa inclinada, gírela sin mover su dirección de caída y verifique que el dip dir no cambia.</p>
          </details>}
        </>}
        {msg && <p className="alerta">{msg}</p>}
      </main>
    </div>
  );
}

/** Ojo de pollo (nivel circular). La burbuja va siempre al lado más alto, como en una brújula Brunton.
 *  Azimut: centrada = celular vertical y sin ladear. Plano: muestra hacia dónde y cuánto buza la cara donde está apoyado. */
function Nivel({ modo, u, quieto, chico }: { modo: Modo; u: [number, number, number] | null; quieto: boolean; chico?: boolean }) {
  if (!u) return null;
  const R = chico ? 26 : 62, r = chico ? 7 : 14, D = 180 / Math.PI;
  let x: number, y: number, ok: boolean, txt: string;
  if (modo === 'az') {
    // celular vertical: arriba ≈ (0, 1, 0); x = ladeo, z = cabeceo de la cámara
    const lad = Math.asin(Math.max(-1, Math.min(1, u[0]))) * D, cab = Math.asin(Math.max(-1, Math.min(1, u[2]))) * D;
    const k = (R - r) / 10; x = Math.max(-1, Math.min(1, lad / 10)) * 10 * k; y = -Math.max(-1, Math.min(1, cab / 10)) * 10 * k;
    ok = Math.abs(lad) < 2 && Math.abs(cab) < 3;
    txt = ok ? 'Nivelado' : `Ladeo ${lad.toFixed(0)}° · cabeceo ${cab.toFixed(0)}°`;
  } else {
    // apoyado en el plano: la burbuja marca el lado alto; el radio es proporcional al dip (borde = 90°)
    const h = Math.hypot(u[0], u[1]), dip = Math.acos(Math.max(-1, Math.min(1, Math.abs(u[2])))) * D;
    const d = (dip / 90) * (R - r); x = h > 1e-6 ? (u[0] / h) * d : 0; y = h > 1e-6 ? (-u[1] / h) * d : 0;
    ok = quieto; txt = quieto ? 'Apoyo firme' : 'Sostenga el celular quieto sobre la cara';
  }
  const col = ok ? '#2E9E4F' : '#E07A12', S = 2 * R + 4;
  return (
    <div className={chico ? 'nivel chico' : 'nivel'} role="img" aria-label={`Nivel: ${txt}`}>
      <svg width={S} height={S} viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`}>
        <circle r={R} fill="rgba(255,255,255,.12)" stroke={col} strokeWidth={chico ? 2 : 3} />
        <circle r={r + 3} fill="none" stroke={col} strokeWidth={1.5} strokeDasharray="3 3" />
        <line x1={-R} x2={R} y1={0} y2={0} stroke={col} strokeOpacity={0.35} />
        <line y1={-R} y2={R} x1={0} x2={0} stroke={col} strokeOpacity={0.35} />
        <circle cx={x} cy={y} r={r} fill={col} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} />
      </svg>
      {!chico && <small style={{ color: col }}>{txt}</small>}
    </div>
  );
}

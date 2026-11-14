// Pantalla de medición con la brújula del celular (integrada de la Fase 0).
import { useEffect, useRef, useState } from 'react';
import { Brujula, resumir, type Lectura, type Modo, type Muestra } from './brujula/sensor';
import { circStats, linStats, toGrid } from './brujula/orient';

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

  // ---- cámara: lentes (gran angular 0.5×), zoom, linterna, flash y aclarado ----
  const pista = useRef<MediaStreamTrack | null>(null);
  const caps = useRef<{ zoom: { min: number; max: number } | null; torch: boolean; expo: { min: number; max: number } | null }>({ zoom: null, torch: false, expo: null });
  const [lentes, setLentes] = useState<{ normal?: string; ancha?: string; actual?: string }>({});
  const [zoomHw, setZoomHw] = useState(1);   // zoom óptico/hardware de la cámara (si lo permite)
  const [dz, setDz] = useState(1);           // zoom digital (recorte) cuando el hardware no llega
  const [luz, setLuz] = useState(false);     // linterna encendida
  const [hayFlash, setHayFlash] = useState(false);
  const [flash, setFlash] = useState(false); // flash real al tomar la foto (Android)
  const [aclarar, setAclarar] = useState(false);
  const [, refrescar] = useState(0);

  const abrirCamara = async (deviceId?: string) => {
    if (modo !== 'az') return;
    (video.current?.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    const res = { width: { ideal: 3840 }, height: { ideal: 2160 } };
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, ...res } : { facingMode: { ideal: 'environment' }, ...res }, audio: false });
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      const t = s.getVideoTracks()[0] ?? null; pista.current = t;
      if (!t) return;
      type Caps = MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean; exposureCompensation?: { min: number; max: number } };
      const c = (t.getCapabilities?.() ?? {}) as Caps;
      caps.current = { zoom: c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max } : null, torch: !!c.torch, expo: c.exposureCompensation ?? null };
      setZoomHw((t.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? 1); setDz(1); refrescar(x => x + 1);
      if (luz && caps.current.torch) await luzHw(true);
      const id = t.getSettings().deviceId;
      // Lentes traseras: el iPhone las nombra ("Cámara ultra gran angular trasera" / "Back Ultra Wide Camera").
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && !/front|frontal|user|delanter|facetime/i.test(d.label));
      const ancha = devs.find(d => /ultra/i.test(d.label))?.deviceId;
      setLentes(l => ({ normal: l.normal ?? (id !== ancha ? id : undefined), ancha, actual: id }));
      // Flash real (Android Chrome): ImageCapture con fillLightMode "flash".
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { getPhotoCapabilities: () => Promise<{ fillLightMode?: string[] }> } }).ImageCapture;
      if (IC) new IC(t).getPhotoCapabilities().then(pc => setHayFlash(!!pc.fillLightMode?.includes('flash'))).catch(() => setHayFlash(false));
    } catch { setMsg('No se pudo abrir la cámara. Revise el permiso de cámara del navegador.'); }
  };
  const luzHw = async (on: boolean) => {
    const t = pista.current; if (!t) return false;
    try {
      await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); return true;
    } catch { return false; }
  };
  const cambiarLuz = async () => {
    const on = !luz;
    if (caps.current.torch) { if (await luzHw(on)) { setLuz(on); return; } }
    setLuz(false);
    setMsg(hayFlash ? 'Este celular no deja prender la linterna desde la app, pero sí el flash al tomar la foto: active ⚡.' : 'Este celular no deja prender la linterna desde el navegador (pasa en iPhone). Use la lámpara del casco y active ☀️ Aclarar.');
  };
  const masLuzExpo = async (on: boolean) => { // exposición al máximo con poca luz, si la cámara lo permite
    const t = pista.current, e = caps.current.expo; if (!t || !e) return;
    try { await t.applyConstraints({ advanced: [{ exposureCompensation: on ? e.max : 0 } as MediaTrackConstraintSet] }); } catch { /* opcional */ }
  };
  const zoomTotal = (lentes.actual && lentes.actual === lentes.ancha ? 0.5 : 1) * zoomHw * dz;
  const ponerZoom = async (f: number, sinCambiarLente = false) => {
    const c = caps.current, t = pista.current, enAncha = !!lentes.actual && lentes.actual === lentes.ancha;
    const base = enAncha ? 0.5 : 1;
    if (!sinCambiarLente) {
      if (f < 0.9 && !enAncha && !(c.zoom && c.zoom.min <= f + 0.05) && lentes.ancha) { await abrirCamara(lentes.ancha); return; }
      if (f >= 0.9 && enAncha && lentes.normal) { await abrirCamara(lentes.normal); setTimeout(() => ponerZoom(f, true), 300); return; }
    }
    const rel = f / base;
    if (c.zoom && t) {
      const hw = Math.min(c.zoom.max, Math.max(c.zoom.min, rel));
      try { await t.applyConstraints({ advanced: [{ zoom: hw } as MediaTrackConstraintSet] }); setZoomHw(hw); setDz(Math.max(1, rel / hw)); return; } catch { /* zoom digital */ }
    }
    setZoomHw(1); setDz(Math.min(10, Math.max(1, rel)));
  };
  const pinzaCam = useRef<{ d0: number; z0: number } | null>(null);
  const dedosCam = useRef(new Map<number, [number, number]>());
  const tocarCam = (e: React.PointerEvent, tipo: 'abajo' | 'mover' | 'arriba') => {
    if (tipo === 'arriba') { dedosCam.current.delete(e.pointerId); if (dedosCam.current.size < 2) pinzaCam.current = null; return; }
    dedosCam.current.set(e.pointerId, [e.clientX, e.clientY]);
    const [a, b] = [...dedosCam.current.values()]; if (!a || !b) return;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (!pinzaCam.current) { pinzaCam.current = { d0: d, z0: zoomTotal }; return; }
    const base = lentes.actual && lentes.actual === lentes.ancha ? 0.5 : 1;
    ponerZoom(Math.max(base, Math.min(10, pinzaCam.current.z0 * d / pinzaCam.current.d0)), true);
  };
  const nivelesZoom = [...(lentes.ancha || (caps.current.zoom && caps.current.zoom.min <= 0.6) ? [0.5] : []), 1, 2, 3, 5, 10];

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

  /** Recorta lo que se ve en pantalla (object-fit: cover + zoom digital) desde una imagen o el video. */
  const recorte = (src: CanvasImageSource, iw: number, ih: number): string => {
    const v = video.current!;
    const ew = v.clientWidth || iw, eh = v.clientHeight || ih;
    const esc = Math.max(ew / iw, eh / ih);
    const sw = ew / esc / dz, sh = eh / esc / dz, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    const k = Math.min(1, 3000 / Math.max(sw, sh));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(sw * k), height: Math.round(sh * k) });
    const ctx = cv.getContext('2d')!; ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    if (aclarar) { // poca luz: curva gamma suave (sube sombras sin quemar las luces)
      const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
      const lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, 0.55));
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]!]!; d[i + 1] = lut[d[i + 1]!]!; d[i + 2] = lut[d[i + 2]!]!; }
      ctx.putImageData(im, 0, 0);
    }
    return cv.toDataURL('image/jpeg', 0.92);
  };
  const cuadro = (): string | undefined => {
    const v = video.current; if (!v || !v.videoWidth) return undefined;
    // Se guarda exactamente lo que se ve en la pantalla completa (mismo recorte que object-fit: cover).
    return recorte(v, v.videoWidth, v.videoHeight);
  };
  /** En Android toma una foto fija del sensor (resolución completa; con ⚡, con flash real). Si no se puede, usa el cuadro del video. */
  const captura = async (): Promise<string | undefined> => {
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: (o?: object) => Promise<Blob> } }).ImageCapture;
    if (IC && pista.current) {
      try {
        const bmp = await createImageBitmap(await new IC(pista.current).takePhoto(flash && hayFlash ? { fillLightMode: 'flash' } : {}));
        return recorte(bmp, bmp.width, bmp.height);
      } catch (e) { console.warn('flash', e); }
    }
    return cuadro();
  };
  const registrar = async () => {
    if (foto && !conAzimut) { // fotos de hastiales y corona: sin brújula, al instante
      setMidiendo(true); const img = await captura(); setMidiendo(false);
      if (!img) { setMsg('No se pudo tomar la foto: la cámara no está disponible.'); return; }
      try { navigator.vibrate?.(60); } catch { /* opcional */ }
      onListo({ modo, sd: 0, n: 0, metodo: 'sin-brujula' }, img); return;
    }
    grab.current = []; setMidiendo(true);
    setTimeout(async () => {
      const w = grab.current ?? []; grab.current = null;
      const img = foto ? await captura() : undefined;
      setMidiendo(false);
      if (foto && !img) { setMsg('No se pudo tomar la foto: la cámara no está disponible.'); return; }
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

  // Cámara nativa del celular: máxima calidad (modo noche, HDR, lentes 0.5×–10×, flash). El azimut se toma de la
  // brújula en el momento de tocar el botón (el celular ya apunta al frente), porque el navegador no recibe el rumbo de esa foto.
  const nativa = useRef<HTMLInputElement>(null);
  const lecturaNativa = useRef<Lectura | null>(null);
  const abrirNativa = () => {
    lecturaNativa.current = null;
    if (conAzimut) {
      const w = buf.current;
      if (w.length >= 20) lecturaNativa.current = resumir([...w], modo, decl, conv, b.current?.metodo ?? '');
    }
    nativa.current?.click();
  };
  const fotoNativa = async (file?: File) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
      const k = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
      const img = cv.toDataURL('image/jpeg', 0.92);
      const l = lecturaNativa.current ?? { modo, sd: 0, n: 0, metodo: conAzimut ? 'sin-datos-brujula' : 'sin-brujula' };
      onListo(l, img);
    } catch { setMsg('No se pudo leer la foto de la cámara.'); }
  };

  const fmt = (x?: number, pad = false) => (x == null ? '—' : pad ? String(Math.round(x)).padStart(3, '0') : x.toFixed(0));
  const vAz = vista?.a != null && modo === 'az' ? toGrid(vista.a, decl, conv) : undefined;
  const vDd = vista?.b != null && modo === 'pl' ? toGrid(vista.b, decl, conv) : undefined;

  if (foto) return (
    <div className="camara">
      <video ref={video} playsInline muted style={{ transform: dz > 1.001 ? `scale(${dz})` : undefined, filter: aclarar ? 'brightness(1.45) contrast(1.05)' : undefined }}
        onPointerDown={e => tocarCam(e, 'abajo')} onPointerMove={e => dedosCam.current.has(e.pointerId) && tocarCam(e, 'mover')} onPointerUp={e => tocarCam(e, 'arriba')} onPointerCancel={e => tocarCam(e, 'arriba')} />
      {conAzimut && <span className="mira" />}
      <div className="cam-arriba">
        <button className="btn mini claro" onClick={onCancelar}>‹ Volver</button><b>{titulo}</b>
        <div className="cam-luces">
          <button className={luz ? 'on' : ''} onClick={cambiarLuz} aria-label="Linterna">🔦</button>
          {hayFlash && <button className={flash ? 'on' : ''} onClick={() => setFlash(f => !f)} aria-label="Flash al tomar la foto">⚡</button>}
          <button className={aclarar ? 'on' : ''} onClick={() => { const on = !aclarar; setAclarar(on); masLuzExpo(on); }} aria-label="Aclarar con poca luz">☀️</button>
        </div>
      </div>
      <div className="cam-abajo">
        <div className="cam-zoom">
          {nivelesZoom.map(n => <button key={n} className={Math.abs(zoomTotal - n) < n * 0.08 ? 'on' : ''} onClick={() => ponerZoom(n)}>{n === 0.5 ? '0.5' : n}×</button>)}
          {!nivelesZoom.some(n => Math.abs(zoomTotal - n) < n * 0.08) && <span className="cam-zoom-val">{zoomTotal.toFixed(1)}×</span>}
        </div>
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
        <div className="cam-disparo">
          <span />
          <button className="obturador" aria-label="Tomar foto" disabled={midiendo || (conAzimut && !iniciado)} onClick={registrar}>{midiendo ? '…' : ''}</button>
          <button className="cam-nativa" disabled={conAzimut && !iniciado} onClick={abrirNativa}>📸<small>Cámara del celular</small></button>
        </div>
        <input ref={nativa} type="file" accept="image/*" capture="environment" hidden onChange={e => { fotoNativa(e.target.files?.[0]); e.target.value = ''; }} />
        <small>{conAzimut ? 'Celular vertical, apuntando al frente, en el eje de la labor.' : 'Encuadre toda la zona.'} Pellizque para acercar o alejar. Para la mejor calidad (modo noche, HDR) use 📸 Cámara del celular.</small>
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

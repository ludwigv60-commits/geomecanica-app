// Fotos por zona (Frente, H.I., Corona, H.D.) desde varios ángulos, con azimut e inclinación de la cámara,
// control de calidad, mejora con poca luz, trazas (IA o a mano) y propuestas de la IA. Módulos 5, 6, 8 y 11.
import { NumIn } from './NumIn';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ABREVS, ZONAS_FOTO, type FotoZona, type Reporte, type ZonaFoto } from '../model';
import { Medidor } from './Medidor';
import { analizar, estadisticas, segmentoDe } from '../ia/trazas';
import { aplicar, medidasFoto, proponer } from '../ia/sugerencias';
import { evaluar, mejorar, mensajeCalidad } from '../ia/calidad';
import { aprender, esLabor } from '../ia/labor';
import { detectarConRed } from '../ia/modelo-trazas';
import { fotosConTrazas, paqueteEntrenamiento } from '../ia/datos-entrenamiento';
import { entregar } from '../export/compartir';
import { rumboExif } from '../ia/exif';
import { toGrid } from '../brujula/orient';
import { colorFamilia, rotulos, simplificar, textoFamilia } from '../ia/anotacion';

export const COLORES = ['#ffd400', '#00e5ff', '#ff4fd8', '#7CFF4F', '#ff8a00'];
const MAX = 800;

type Props = { r: Reporte; setR: (f: (p: Reporte) => Reporte) => void; historial: Reporte[]; decl: number; conv: number; onMedir: (i: number) => void };
const NOMBRE_TIPO: Record<string, string> = { SD: 'Diaclasa', F: 'Falla', V: 'Veta', C: 'Contacto' };
type Modo = 'ver' | 'dibujar' | 'borrar';

const cargar = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const reducida = (img: HTMLImageElement) => {
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  return { w, h, datos: ctx.getImageData(0, 0, w, h).data };
};

export function FotoIA({ r, setR, historial, decl, conv, onMedir }: Props) {
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
  const trazo = useRef<[number, number][]>([]);
  const [arrastre, setArrastre] = useState<[number, number, number, number] | null>(null);
  const [confirmaTodo, setConfirmaTodo] = useState(false);
  // Zoom con dos dedos (o botones) para dibujar estructuras finas; con un dedo se dibuja o se mueve la foto.
  const [vistaZ, setVistaZ] = useState({ z: 1, tx: 0, ty: 0 });
  const marco = useRef<HTMLDivElement>(null);
  const dedos = useRef(new Map<number, [number, number]>());
  const pinza = useRef<{ d0: number; z0: number; m0: [number, number]; t0: [number, number] } | null>(null);
  const paneo = useRef<{ p0: [number, number]; t0: [number, number] } | null>(null);
  const limitar = (z: number, tx: number, ty: number) => {
    const b = marco.current?.getBoundingClientRect(); if (!b) return { z, tx, ty };
    z = Math.min(6, Math.max(1, z));
    return { z, tx: Math.min(0, Math.max(b.width - b.width * z, tx)), ty: Math.min(0, Math.max(b.height - b.height * z, ty)) };
  };
  const zoomBoton = (f: number) => setVistaZ(v => { const b = marco.current?.getBoundingClientRect(); const cx = (b?.width ?? 0) / 2, cy = (b?.height ?? 0) / 2; const z = Math.min(6, Math.max(1, v.z * f)); return limitar(z, cx - ((cx - v.tx) / v.z) * z, cy - ((cy - v.ty) / v.z) * z); });

  const deZona = fotos.filter(f => f.zona === zona);
  const sel = fotos.find(f => f.id === selId && f.zona === zona) ?? deZona[0] ?? null;
  useEffect(() => { if (sel) cargar(sel.data).then(setImg); else setImg(null); setEstado(null); }, [sel?.id]);
  useEffect(() => { setVistaZ({ z: 1, tx: 0, ty: 0 }); }, [sel?.id]);
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
    // ¿Es una labor? (modelo de IA en el celular)
    try {
      const v = await esLabor(im);
      editarFoto(nueva.id, f => ({ ...f, labor: { es: v.es, sim: v.similitud } }));
      if (v.es === 'labor') aprender(v.rasgos).catch(() => {});
      else rasgosPend.current.set(nueva.id, v.rasgos);
    } catch (e) { console.warn('IA labor', e); }
  };
  const rasgosPend = useRef(new Map<string, number[]>());
  const confirmarLabor = (id: string) => {
    const v = rasgosPend.current.get(id); if (v) aprender(v).catch(() => {});
    editarFoto(id, f => ({ ...f, labor: f.labor ? { ...f.labor, confirmada: true } : f.labor }));
  };
  const quitarFoto = (id: string) => { setR(p => ({ ...p, fotos: (p.fotos ?? []).filter(x => x.id !== id) })); setSelId(null); };

  /**
   * Busca trazas con la red neuronal (trazas.onnx + zona.onnx, en el celular). Si la red no carga
   * (celular antiguo o sin memoria), usa el método clásico. Todo queda como "Sugerido por IA".
   */
  const analizarFoto = async () => {
    if (!img || !sel || !dims) return;
    if (!util(sel)) { setEstado('Esta foto no es una labor: la IA no la analiza. Si sí es labor, toque "Sí es labor".'); return; }
    setEstado('Analizando la foto con IA… (puede tardar unos segundos)');
    await new Promise(r => setTimeout(r, 30));
    let segs: NonNullable<FotoZona['trazas']>['segmentos'] = [], ia: NonNullable<FotoZona['trazas']>['ia'], nFam = 0, extra = '';
    try {
      const t = await detectarConRed(img);
      const kx = dims.w / t.w, ky = dims.h / t.h;
      segs = t.segmentos.map((s, i) => ({ s, z: t.zonaSeg[i] })).filter(({ s }) => s.familia >= 0 && s.familia < 5)
        .map(({ s }) => segmentoDe(s.x1 * kx, s.y1 * ky, s.x2 * kx, s.y2 * ky, s.familia));
      nFam = t.familias.length;
      // Escala automática: el frente que reconoce la IA mide lo que el ancho de la labor.
      const anchoFotoM = t.frente && r.ancho ? Math.round(r.ancho * t.w / Math.max(1, t.frente.x1 - t.frente.x0) * 10) / 10 : undefined;
      ia = { metodo: 'red', confianza: t.confianza, nivel: t.nivel, roca: t.roca, zonas: t.zonaFr, anchoFotoM };
      if (anchoFotoM) setAnchoFoto(anchoFotoM);
      const vistas = Object.entries(t.zonaFr).filter(([, v]) => v > 0.04).map(([k]) => ZONAS_FOTO.find(z => z.id === k)?.nombre ?? k);
      if (vistas.length) extra += ` Zonas reconocidas en la foto: ${vistas.join(', ').replace(/\.$/, '')}.`;
      if (t.roca < 0.15) extra += ' Casi no se ve roca (¿shotcrete o piso?).';
    } catch (e) {
      console.warn('IA trazas (red)', e);
      const red = reducida(img);
      const c = evaluar(red.datos, red.w, red.h);
      const datos = c.brillo < 0.35 || c.contraste < 0.12 ? mejorar(red.datos, red.w, red.h) : red.datos;
      const t = analizar(datos, red.w, red.h);
      segs = t.segmentos.filter(s => s.familia >= 0 && s.familia < 5); nFam = t.familias.length;
      ia = { metodo: 'clasico', confianza: 0, nivel: 'baja' };
      extra = ' (método simple: el modelo de IA no cargó en este celular)';
    }
    const nNec = segs.reduce((m, s) => Math.max(m, s.familia + 1), 0);
    // Llenado automático (solo campos vacíos, en morado "Sugerido por IA"): Jv, RQD, espaciamiento, persistencia, Jn.
    const ancho = ia?.anchoFotoM ?? anchoFoto;
    const med = segs.length && ancho ? medidasFoto(estadisticas(segs.map(s => ({ ...s })), dims.w, dims.h), ancho) : null;
    setR(p => {
      const n = {
        ...p,
        familias: p.familias.length >= nNec ? p.familias : [...p.familias, ...Array.from({ length: nNec - p.familias.length }, () => ({ abrev: 'SD', dip: null, dipdir: null }))],
        fotos: (p.fotos ?? []).map(x => (x.id === sel.id ? { ...x, trazas: { w: dims.w, h: dims.h, ia, segmentos: segs } } : x)),
      };
      // Con confianza baja NO se llena nada solo: un Jv mal leído daría un RQD y un RMR falsamente altos.
      return med && ia?.nivel !== 'baja' ? aplicar(n, proponer(n, historial, med).filter(q => q.fuente === 'foto')) : n;
    });
    setEstado(nFam
      ? `Sugerido por IA · confianza ${ia!.nivel}: ${nFam} estructura(s), numeradas de la más a la menos importante (trazas más largas).${extra}${med ? (ia?.nivel === 'baja' ? ` Confianza baja: NO se llenaron parámetros (Jv ≈ ${med.jv} no es confiable).` : ` Jv ≈ ${med.jv}; se llenaron en morado los campos vacíos.`) : ' Para calcular Jv y espaciamiento falta el ancho de la labor.'} Revise: borre lo que no sea fractura y mida cada estructura con 🧭 (dip/dd para cuñas).`
      : `La IA no encontró trazas claras en la roca.${extra} Dibújelas con el dedo.`);
  };

  useEffect(() => {
    const cv = lienzo.current; if (!cv || !img || !dims) return;
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const k = img.width / dims.w; ctx.lineWidth = Math.max(3, img.width / 250); ctx.lineCap = 'round';
    const linea = (x1: number, y1: number, x2: number, y2: number, c: string) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke(); };
    for (const s of sel?.trazas?.segmentos ?? []) {
      const c = colorFamilia(r.familias, s.familia);
      if (s.pts) { ctx.strokeStyle = c; ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k))); ctx.stroke(); }
      else linea(s.x1, s.y1, s.x2, s.y2, c);
    }
    // Rótulos como en tus fotos: caja blanca con "D1:55°/350°".
    const fs = Math.max(14, img.width / 40); ctx.font = `bold ${fs}px Arial`;
    for (const ro of rotulos(sel?.trazas?.segmentos ?? [])) {
      const t = textoFamilia(r.familias, ro.familia) + (r.familias[ro.familia]?.dip == null ? ' (medir)' : ''); const tw = ctx.measureText(t).width;
      ctx.save(); ctx.translate(ro.x * k, ro.y * k); ctx.rotate(ro.ang * Math.PI / 180);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      ctx.fillRect(-tw / 2 - fs * 0.4, -fs * 0.75, tw + fs * 0.8, fs * 1.5); ctx.strokeRect(-tw / 2 - fs * 0.4, -fs * 0.75, tw + fs * 0.8, fs * 1.5);
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 0); ctx.restore();
    }
    if (arrastre) linea(...arrastre, '#ffffff');
  }, [img, sel?.trazas, arrastre, r.familias]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * dims!.w, ((e.clientY - b.top) / b.height) * dims!.h];
  };
  const setSegs = (f: (s: NonNullable<FotoZona['trazas']>['segmentos']) => NonNullable<FotoZona['trazas']>['segmentos']) =>
    sel && dims && editarFoto(sel.id, x => ({ ...x, trazas: { w: dims.w, h: dims.h, segmentos: f(x.trazas?.segmentos ?? []) } }));
  const rel = (e: React.PointerEvent): [number, number] => { const b = marco.current!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const abajo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dims) return;
    dedos.current.set(e.pointerId, rel(e));
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* opcional */ }
    if (dedos.current.size === 2) {  // dos dedos: zoom y desplazamiento; se cancela la traza en curso
      inicio.current = null; setArrastre(null); paneo.current = null;
      const [a, b] = [...dedos.current.values()] as [[number, number], [number, number]];
      pinza.current = { d0: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, z0: vistaZ.z, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t0: [vistaZ.tx, vistaZ.ty] };
      return;
    }
    if (modo === 'ver') { if (vistaZ.z > 1) paneo.current = { p0: rel(e), t0: [vistaZ.tx, vistaZ.ty] }; return; }
    const p = punto(e);
    if (modo === 'borrar') {
      const b = e.currentTarget.getBoundingClientRect();
      let best = -1, bd = 28 * dims.w / b.width; // ~28 px de pantalla: tamaño de un dedo
      (sel?.trazas?.segmentos ?? []).forEach((s, i) => { const d = distTraza(p, s); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) setSegs(ss => ss.filter((_, i) => i !== best));
      return;
    }
    inicio.current = p; trazo.current = [p];
  };
  const nuevaEstructura = (abrev: string) => {
    const usadas = new Set((r.fotos ?? []).flatMap(f => f.trazas?.segmentos.map(s => s.familia) ?? []));
    // Si solo está la familia vacía de inicio (sin medir ni dibujar), se reemplaza en vez de agregar otra.
    const reusar = r.familias.length === 1 && r.familias[0]!.dip == null && !usadas.has(0);
    if (!reusar && r.familias.length >= 5) { setEstado('El formato admite máximo 5 estructuras.'); return; }
    const i = reusar ? 0 : r.familias.length;
    setR(p => ({ ...p, familias: reusar ? [{ abrev, dip: null, dipdir: null }] : [...p.familias, { abrev, dip: null, dipdir: null }] }));
    setFam(i); setModo('dibujar');
  };
  const deshacer = () => setSegs(ss => ss.slice(0, -1));
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dedos.current.has(e.pointerId)) dedos.current.set(e.pointerId, rel(e));
    if (pinza.current && dedos.current.size >= 2) {
      const [a, b] = [...dedos.current.values()] as [[number, number], [number, number]], pz = pinza.current;
      const z = Math.min(6, Math.max(1, pz.z0 * Math.hypot(b[0] - a[0], b[1] - a[1]) / pz.d0)), m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const c: [number, number] = [(pz.m0[0] - pz.t0[0]) / pz.z0, (pz.m0[1] - pz.t0[1]) / pz.z0];
      setVistaZ(limitar(z, m[0] - c[0] * z, m[1] - c[1] * z)); return;
    }
    if (paneo.current) { const q = rel(e); setVistaZ(v => limitar(v.z, paneo.current!.t0[0] + q[0] - paneo.current!.p0[0], paneo.current!.t0[1] + q[1] - paneo.current!.p0[1])); return; }
    if (inicio.current) { const p = punto(e); trazo.current.push(p); setArrastre([...inicio.current, ...p]); }
  };
  const soltar = (e: React.PointerEvent<HTMLCanvasElement>) => { dedos.current.delete(e.pointerId); if (dedos.current.size < 2) pinza.current = null; if (!dedos.current.size) paneo.current = null; };
  const arriba = (e: React.PointerEvent<HTMLCanvasElement>) => {
    soltar(e);
    if (!inicio.current) return;
    const [x1, y1] = inicio.current, [x2, y2] = punto(e);
    inicio.current = null; setArrastre(null);
    if (Math.hypot(x2 - x1, y2 - y1) > 12) {
      const pts = simplificar([...trazo.current, [x2, y2]]);
      const sg = segmentoDe(x1, y1, x2, y2, fam);
      setSegs(ss => [...ss, pts ? { ...sg, pts, largo: pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0) } : sg]);
    }
  };

  // La propuesta usa la foto del FRENTE con más trazas (la que mejor muestra el fracturamiento).
  const util = (f: FotoZona) => !f.labor || f.labor.es === 'labor' || f.labor.confirmada;
  const base = useMemo(() => [...fotos].filter(f => util(f) && f.zona === 'FRENTE' && f.trazas?.segmentos.length).sort((a, b) => b.trazas!.segmentos.length - a.trazas!.segmentos.length)[0]
    ?? fotos.find(f => util(f) && f.trazas?.segmentos.length), [fotos]);
  const stats = useMemo(() => (base?.trazas ? estadisticas(base.trazas.segmentos.map(s => ({ ...s })), base.trazas.w, base.trazas.h) : null), [base]);
  const medidas = useMemo(() => (stats && anchoFoto ? medidasFoto(stats, anchoFoto) : null), [stats, anchoFoto]);
  const baja = base?.trazas?.ia?.nivel === 'baja';
  const props = useMemo(() => proponer(r, historial, baja ? null : medidas), [r, historial, medidas, baja]);

  const galeria = async (file?: File) => {
    if (!file) return;
    // Si la foto trae el rumbo de la cámara (EXIF), se usa como azimut: verdadero → UTM, magnético → + declinación.
    let az: number | undefined;
    try { const ru = rumboExif(await file.arrayBuffer()); if (ru) az = Math.round(toGrid(ru.dir, ru.ref === 'M' ? decl : 0, conv) * 10) / 10; } catch { /* sin EXIF */ }
    const i = await cargar(URL.createObjectURL(file));
    const k = Math.min(1, 1600 / Math.max(i.width, i.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(i.width * k), height: Math.round(i.height * k) });
    cv.getContext('2d')!.drawImage(i, 0, 0, cv.width, cv.height);
    await agregar(cv.toDataURL('image/jpeg', 0.85), az, az != null ? 0 : undefined);
    if (zona === 'FRENTE') setEstado(az != null ? `Azimut tomado de la foto (rumbo de la cámara guardado por el celular): ${az}° UTM. Revíselo: vale si la foto se tomó mirando de frente por el eje de la labor.` : 'Esta foto no trae el rumbo de la cámara. Para llenar el azimut solo, tome la foto con 📷 desde la app o active en el iPhone: Ajustes › Privacidad › Localización › Cámara.');
  };

  if (camara) return (
    <Medidor modo="az" foto conAzimut={zona === 'FRENTE'} titulo={`Foto: ${ZONAS_FOTO.find(z => z.id === zona)!.nombre}`} decl={decl} conv={conv} onCancelar={() => setCamara(false)}
      onListo={(l, data) => { setCamara(false); if (data) zona === 'FRENTE' ? agregar(data, l.az != null ? Math.round(l.az * 10) / 10 : undefined, l.plunge != null ? Math.round(l.plunge) : undefined) : agregar(data); }} />
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
            <img src={f.data} alt="" />{f.calidad && !f.calidad.apta && <span className="no-apta">!</span>}{f.labor?.es === 'no' && !f.labor.confirmada && <span className="no-lab">NO ES LABOR</span>}
          </button>
        ))}
      </div>}
      {sel?.labor && sel.labor.es !== 'labor' && !sel.labor.confirmada && <div className={sel.labor.es === 'no' ? 'no-labor' : 'no-labor dudosa'}>
        <b>{sel.labor.es === 'no' ? '⛔ ESTO NO ES UNA LABOR' : '⚠️ No parece una labor'}</b>
        <span>La IA no reconoce un frente, hastial o corona en esta foto. No se usará para llenar el reporte.</span>
        <div className="fila-btn"><button className="btn" onClick={() => quitarFoto(sel.id)}>Quitar foto</button>
          <button className="btn" onClick={() => confirmarLabor(sel.id)}>Sí es labor (la IA aprende)</button></div>
      </div>}
      {sel?.calidad && !sel.calidad.apta && <p className="alerta">FOTO NO APTA – {sel.calidad.motivos.join('; ')}. Tome una nueva.</p>}
      {img && <div className="barra-dibujo">
        <div className="segmentos">
          <button className={modo === 'ver' ? 'sel' : ''} onClick={() => setModo('ver')}>👆 Mover</button>
          <button className={modo === 'dibujar' ? 'sel' : ''} disabled={!r.familias.length} onClick={() => setModo('dibujar')}>✏️ Dibujar</button>
          <button className={modo === 'borrar' ? 'sel' : ''} onClick={() => setModo('borrar')}>🧽 Borrar</button>
          <button disabled={!sel?.trazas?.segmentos.length} onClick={deshacer}>↶</button>
        </div>
        <div className="chips-estr">
          {r.familias.map((f, i) => (
            <button key={i} className={modo === 'dibujar' && fam === i ? 'chip-estr sel' : 'chip-estr'} style={{ borderColor: colorFamilia(r.familias, i) }} onClick={() => { setFam(i); setModo('dibujar'); }}>
              <i style={{ background: colorFamilia(r.familias, i) }} />{textoFamilia(r.familias, i)}</button>
          ))}
          {ABREVS.map(a => <button key={a} className="chip-estr nueva" style={{ borderColor: colorTipo(a) }} onClick={() => nuevaEstructura(a)}>+ {a}</button>)}
        </div>
        <div className="zoom-btns">
          <button onClick={() => zoomBoton(1 / 1.5)} disabled={vistaZ.z <= 1}>－</button>
          <span>{vistaZ.z > 1 ? `${vistaZ.z.toFixed(1)}×` : 'Zoom'}</span>
          <button onClick={() => zoomBoton(1.5)} disabled={vistaZ.z >= 6}>＋</button>
          {vistaZ.z > 1 && <button onClick={() => setVistaZ({ z: 1, tx: 0, ty: 0 })}>1:1</button>}
          {modo === 'dibujar' && r.familias[fam] && <small>Dibujando <b>{textoFamilia(r.familias, fam)}</b></small>}
          {modo === 'borrar' && <small>Toque la traza a borrar</small>}
        </div>
      </div>}
      {img && dims && <div ref={marco} className="foto-marco" style={{ aspectRatio: `${dims.w} / ${dims.h}`, touchAction: modo === 'ver' && vistaZ.z <= 1 ? 'pan-y' : 'none' }}>
        <canvas ref={lienzo} className="foto-lienzo" style={{ width: '100%', transform: `translate(${vistaZ.tx}px, ${vistaZ.ty}px) scale(${vistaZ.z})`, transformOrigin: '0 0' }}
          onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={e => { soltar(e); inicio.current = null; setArrastre(null); }} />
      </div>}
      {img && <p className="tenue">Dos dedos: acercar y mover la foto. Un dedo: dibuja (✏️), borra (🧽) o mueve la foto con zoom (👆).</p>}
      {sel && <p className="tenue">
        {zona === 'FRENTE' && (sel.az != null ? `Azimut de esta foto: ${sel.az}° UTM. ` : 'Sin azimut (foto de galería). ')}
        {zona === 'FRENTE' && r.azimut != null && <>Azimut de la labor: <b>{r.azimut}°</b>. </>}
        <button className="btn mini" onClick={() => quitarFoto(sel.id)}>Quitar foto</button>
      </p>}
      <button className="btn primario foto-btn" onClick={() => setCamara(true)}>📷 Foto {ZONAS_FOTO.find(z => z.id === zona)!.nombre}{zona === 'FRENTE' ? ' + azimut' : ''}</button>
      <p className="tenue">{deZona.length < 2 ? 'Recomendado: 2 a 3 fotos por zona desde ángulos distintos. ' : ''}De pie, celular vertical, con buena luz y sin polvo.</p>
      <label className="btn mini" style={{ textAlign: 'center' }}>Elegir foto de la galería
        <input type="file" accept="image/*" hidden onChange={e => { galeria(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {faltan.length > 0 && fotos.length > 0 && <p className="tenue">Falta al menos una foto de: {faltan.map(z => z.nombre).join(', ')}.</p>}
      {img && <>
        <button className="btn" onClick={analizarFoto}>🤖 Buscar trazas con IA</button>
        {sel?.trazas?.ia && <p className="tenue"><span className="sugerido">Sugerido por IA</span> Confianza <b className={`conf-${sel.trazas.ia.nivel}`}>{sel.trazas.ia.nivel}</b>
          {sel.trazas.ia.metodo === 'red' ? ` (${Math.round(sel.trazas.ia.confianza * 100)} %)` : ' (método simple)'}. La IA marca trazas visibles y su orientación en la foto; el buzamiento y la dirección de cada familia se miden con 🧭.</p>}
        {estado && <p className={estado.startsWith('FOTO NO APTA') ? 'alerta' : 'tenue'}>{estado}</p>}
        <div className="herramientas">
          <p className="tenue"><b>1.</b> Elija qué va a dibujar:</p>
          <div className="tipos">
            {ABREVS.map(a => <button key={a} className="tipo" style={{ borderColor: colorTipo(a) }} onClick={() => nuevaEstructura(a)}>
              <i style={{ background: colorTipo(a) }} />+ {NOMBRE_TIPO[a] ?? a}</button>)}
          </div>
          {r.familias.length > 0 && <>
            <p className="tenue"><b>2.</b> Toque la estructura y trace con el dedo sobre la foto (recta o en arco):</p>
            <div className="estructuras">
              {r.familias.map((f, i) => (
                <div key={i} className={`estr ${modo === 'dibujar' && fam === i ? 'sel' : ''}`} style={{ borderColor: colorFamilia(r.familias, i) }}>
                  <button className="estr-nom" onClick={() => { setFam(i); setModo('dibujar'); }}>
                    <i style={{ background: colorFamilia(r.familias, i) }} />{textoFamilia(r.familias, i)}
                    <small>{NOMBRE_TIPO[f.abrev] ?? f.abrev}{f.dip == null ? ' · sin medir' : ''}</small></button>
                  <button className="estr-med" onClick={() => onMedir(i)}>🧭 {f.dip == null ? 'Medir' : 'Volver a medir'}</button>
                </div>
              ))}
            </div>
            <p className="tenue"><b>3.</b> Toque <b>🧭 Medir</b> y apoye el celular en esa estructura: el rótulo (ej. D1:55°/350°) aparece solo sobre la traza.</p>
          </>}
          <div className="fila-btn">
            <button className="btn mini" disabled={!sel?.trazas?.segmentos.length} onClick={deshacer}>↶ Deshacer última traza</button>
            <button className={`btn mini ${confirmaTodo ? 'peligro' : ''}`} disabled={!sel?.trazas?.segmentos.length}
              onClick={() => { if (confirmaTodo) { setSegs(() => []); setConfirmaTodo(false); } else { setConfirmaTodo(true); setTimeout(() => setConfirmaTodo(false), 3000); } }}>
              {confirmaTodo ? '¿Borrar todas? Toque otra vez' : '🗑 Borrar todas las trazas'}</button>
          </div>
        </div>
      </>}
      {stats && <>
        <p className="tenue">Para la propuesta se usa la foto del frente con más trazas. {stats.familias.map(f => `Familia ${f.id + 1}: ${f.segmentos} trazas${f.espaciamientoPx && medidas ? `, espaciamiento ≈ ${(f.espaciamientoPx / medidas.escala).toFixed(2)} m` : ''}`).join(' · ')}</p>
        <label className="campo"><span>Ancho real que abarca esa foto (m)</span>
          <NumIn valor={anchoFoto} on={setAnchoFoto} /></label>
        <button className="btn mini" onClick={async () => {
          setEstado('Preparando fotos y trazas para entrenar la IA…');
          try { const z = await paqueteEntrenamiento(r); await entregar(z, `entrenar_IA_${(r.labor || 'labor').replace(/[^\w.+-]+/g, '_')}_${r.fecha || ''}.zip`, 'application/zip'); setEstado('Listo. Súbalo al proyecto: con 50–100 fotos así la IA aprende su criterio.'); }
          catch (e) { setEstado('No se pudo preparar el paquete.'); console.warn(e); }
        }}>📦 Enviar {fotosConTrazas(r).length} foto(s) con trazas para entrenar la IA</button>
      </>}
      {props.length > 0 && <div className="propuestas">
        <h3>Propuesta de la IA <span className="sugerido">Sugerido por IA</span></h3>
        {baja && <p className="alerta">La detección de trazas de esta foto tiene confianza baja: los parámetros de la foto (Jv, RQD, espaciamiento) no se proponen. Corrija las trazas o llénelos usted.</p>}
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
const colorTipo = (a: string) => colorFamilia([{ abrev: a, dip: null, dipdir: null }], 0);
/** Distancia del dedo a una traza (recta o arco). */
function distTraza(p: [number, number], s: { x1: number; y1: number; x2: number; y2: number; pts?: [number, number][] }) {
  if (!s.pts || s.pts.length < 2) return distSeg(p, s);
  let d = Infinity;
  for (let i = 1; i < s.pts.length; i++) { const [a, b] = [s.pts[i - 1]!, s.pts[i]!]; d = Math.min(d, distSeg(p, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] })); }
  return d;
}
function distSeg([px, py]: [number, number], s: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

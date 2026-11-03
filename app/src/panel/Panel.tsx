// Panel de mapeos: todos los mapeos que envían los celulares, guardados en la base del artefacto (privado en Claude).
// Misma interfaz de la app para ver y editar; los mapeos quedan aquí aunque se borren del celular.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '../ui/Editor';
import { LISTAS_INICIALES, nuevoReporte, type FotoZona, type Listas, type Reporte } from '../model';
import { calcular } from '../calc';
import { TIPOS, tipoRoca } from '../core/rmr';
import { usarEntrega } from '../export/compartir';
import { APP_ORIGEN, APP_URL, leerPaquete, type MsgEnvio, type Paquete } from '../export/envio';

/* Capacidades del artefacto (tipos mínimos de lo que se usa). */
type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type QSnap = { docs: Snap[]; metadata: { fromCache: boolean } };
type DbErr = { code: string; message: string };
type DocRef = { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; onSnapshot(n: (s: Snap) => void, e?: (x: DbErr) => void): () => void };
type DB = { doc(p: string): DocRef; collection(p: string): { doc(id: string): DocRef; onSnapshot(n: (s: QSnap) => void, e?: (x: DbErr) => void): () => void } };
type Assets = { upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string }> };
type User = { id(): Promise<string | null>; canEdit(): Promise<boolean> | boolean; can(n: string): Promise<boolean | null> | boolean | null; profiles(ids: string[]): Promise<Record<string, { name?: string }>> };
type Downloads = { save(o: { filename: string; data: Uint8Array | Blob }): Promise<unknown> };
type Claude = { use(n: string): Promise<unknown> };

const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T; // sin undefined: la base guarda JSON puro
const LIMITE = 250_000; // un documento admite 256 KiB
function aDoc(r: Reporte): Record<string, unknown> {
  let d = json(r) as Reporte;
  if (JSON.stringify(d).length > LIMITE) // trazas muy detalladas: se guardan sin los puntos intermedios
    d = { ...d, fotos: d.fotos?.map(f => (f.trazas ? { ...f, trazas: { ...f.trazas, segmentos: f.trazas.segmentos.map(s => ({ ...s, pts: undefined })) } } : f)) };
  d = json(d);
  if (JSON.stringify(d).length > LIMITE) throw new Error('El mapeo es demasiado grande para guardarlo (fotos sin subir).');
  return d as unknown as Record<string, unknown>;
}
const sinMeta = (r: Reporte) => JSON.stringify({ ...r, modificado: undefined, panel: undefined, sincronizado: undefined });
function blobDeDataUrl(u: string): Blob {
  const [cab, b64] = u.split(',') as [string, string];
  const tipo = /data:([^;]+)/.exec(cab)?.[1] ?? 'image/jpeg';
  return new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: tipo });
}
const fechaHora = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function Panel() {
  const [db, setDb] = useState<DB | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'lento' | 'sin-acceso' | string>('cargando');
  const [mapeos, setMapeos] = useState<Reporte[]>([]);
  const ultimos = useRef<Reporte[]>([]);
  const [listas, setListas] = useState<Listas>(LISTAS_INICIALES);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [labor, setLabor] = useState('');
  const [editor, setEditor] = useState(false);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const cadena = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    let fin: (() => void)[] = [], t = 0;
    (async () => {
      const c = (window as unknown as { claude?: Claude }).claude;
      if (!c) { setEstado('sin-acceso'); return; }
      const [d, a, u, dl] = await Promise.all(['db', 'assets', 'user', 'downloads'].map(n => c.use(n).catch(() => null))) as [DB | null, Assets | null, User | null, Downloads | null];
      if (!d) { setEstado('sin-acceso'); return; }
      setDb(d); setAssets(a); setUser(u);
      if (dl) usarEntrega(async (datos, nombre) => { await dl.save({ filename: nombre, data: datos }); return 'descargado'; });
      if (u) { setUid(await u.id()); setEditor(!!(await u.canEdit())); }
      t = window.setTimeout(() => setEstado(e => (e === 'cargando' ? 'lento' : e)), 10000);
      fin.push(d.collection('mapeos').onSnapshot(s => {
        window.clearTimeout(t);
        const l = s.docs.map(x => x.data() as unknown as Reporte).filter(r => r?.id).map(r => ({ ...nuevoReporte(), ...r }) as Reporte); // completa campos de versiones antiguas
        ultimos.current = l; setMapeos(l); setEstado('listo');
      }, e => { window.clearTimeout(t); setEstado(`error:${e.message}`); }));
      fin.push(d.doc('config/listas').onSnapshot(s => { if (s.exists) setListas({ ...LISTAS_INICIALES, ...(s.data() as Partial<Listas>) }); }, () => {}));
    })();
    return () => { fin.forEach(f => f()); window.clearTimeout(t); };
  }, []);

  // nombres de quienes subieron (se resuelven cada vez; no se guardan)
  const ids = useMemo(() => [...new Set(mapeos.map(m => m.panel?.subidoPor).filter((x): x is string => !!x))].sort().join('|'), [mapeos]);
  useEffect(() => {
    if (!user || !ids) return;
    user.profiles(ids.split('|')).then(p => setNombres(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v?.name || 'Alguien'])))).catch(() => {});
  }, [user, ids]);

  /** Una escritura a la vez por mapeo. */
  const escribir = (id: string, r: Reporte) => {
    if (!db) return Promise.reject(new Error('Sin conexión con la base del panel'));
    const p = (cadena.current.get(id) ?? Promise.resolve()).catch(() => {}).then(() => db.collection('mapeos').doc(id).set(aDoc(r)));
    cadena.current.set(id, p); return p;
  };

  const subir = async (files: FileList | null) => {
    if (!files?.length || !db) return;
    try { await importar(await Promise.all([...files].map(async f => leerPaquete(await f.text())))); }
    catch (e) { setMsg(`No se pudo subir: ${(e as Error).message}`); }
  };

  /** Guarda en la base los mapeos de uno o más envíos. Devuelve los ids guardados y el texto del resultado. */
  const importar = async (paquetes: Paquete[], avance: (t: string) => void = () => {}): Promise<{ ids: string[]; texto: string }> => {
    if (!db) throw new Error('Sin conexión con la base del panel');
    setOcupado(true);
    let nuevos = 0, actualizados = 0, saltados = 0, fotosSub = 0;
    const ids: string[] = [];
    const listasNuevas: Partial<Listas> = {};
    try {
      for (const p of paquetes) {
        for (const [k, v] of Object.entries(p.listas ?? {})) if (Array.isArray(v)) (listasNuevas as Record<string, unknown[]>)[k] = [...new Set([...((listasNuevas as Record<string, unknown[]>)[k] ?? []), ...v])];
        for (const [i, r] of p.reportes.entries()) {
          const t = `Subiendo ${r.labor || 'mapeo'} ${r.desde ?? ''} (${i + 1} de ${p.reportes.length})…`;
          setMsg(t); avance(t);
          const ex = ultimos.current.find(m => m.id === r.id);
          // si alguien lo editó en el panel después de la última modificación del celular, se respeta el panel
          if (ex?.panel?.editadoEn && ex.panel.editadoEn > (r.modificado ?? '')) { saltados++; ids.push(r.id); continue; }
          const fotos: FotoZona[] = [];
          for (const f of r.fotos ?? []) {
            const prev = ex?.fotos?.find(x => x.id === f.id && !x.data.startsWith('data:'));
            if (prev) { fotos.push({ ...f, data: prev.data }); continue; }
            if (!f.data.startsWith('data:')) { fotos.push(f); continue; }
            if (!assets) continue; // sin permiso para subir fotos: el mapeo se guarda sin ellas
            const up = await assets.upload(blobDeDataUrl(f.data));
            fotos.push({ ...f, data: up.url }); fotosSub++;
          }
          await escribir(r.id, { ...r, importado: undefined, fotos, panel: { subidoPor: uid ?? undefined, subidoEn: new Date().toISOString(), dispositivo: p.dispositivo } });
          ex ? actualizados++ : nuevos++; ids.push(r.id);
        }
      }
      if (Object.keys(listasNuevas).length) {
        const l = { ...listas } as Record<string, unknown>;
        for (const [k, v] of Object.entries(listasNuevas)) l[k] = Array.isArray(l[k]) ? [...new Set([...(l[k] as unknown[]), ...(v as unknown[])])] : v;
        await db.doc('config/listas').set(json(l)).catch(() => {});
      }
      const texto = `Listo: ${nuevos} nuevo(s), ${actualizados} actualizado(s)${saltados ? `, ${saltados} sin cambiar (se editaron aquí después)` : ''} · ${fotosSub} foto(s) subidas.${!assets ? ' No tiene permiso para subir fotos: pida acceso de colaborador.' : ''}`;
      setMsg(texto);
      return { ids, texto };
    } catch (e) {
      const m = (e as DbErr).message ?? String(e);
      throw new Error(`${m}${(e as DbErr).code === 'invalid_argument' ? ' (puede que no tenga permiso para escribir: pida acceso de colaborador al dueño del panel)' : ''}`);
    } finally { setOcupado(false); }
  };

  /** "📲 Recibir del celular": abre la app en otra ventana y ella pasa sus mapeos pendientes por mensaje. */
  const ventana = useRef<Window | null>(null);
  const importarRef = useRef(importar); importarRef.current = importar;
  useEffect(() => {
    const alRecibir = async (e: MessageEvent) => {
      const w = ventana.current;
      if (!w || e.source !== w || e.origin !== APP_ORIGEN) return;
      const m = e.data as MsgEnvio;
      const responder = (x: MsgEnvio) => w.postMessage(x, APP_ORIGEN);
      if (m?.tipo === 'geo-listo') { setMsg(m.pendientes ? `Recibiendo ${m.pendientes} mapeo(s) del celular…` : 'Revisando los mapeos del celular…'); responder({ tipo: 'geo-pedir' }); }
      else if (m?.tipo === 'geo-paquete') {
        try {
          const r = await importarRef.current([leerPaquete(m.paquete)], texto => responder({ tipo: 'geo-progreso', texto }));
          responder({ tipo: 'geo-recibido', ids: r.ids, enviadoEn: m.paquete.enviadoEn, texto: r.texto });
        } catch (x) { const t = `No se pudo guardar: ${(x as Error).message}`; setMsg(t); responder({ tipo: 'geo-error', texto: t }); }
      } else if (m?.tipo === 'geo-recibido' && !m.ids.length) setMsg(`Del celular: ${m.texto}`);
    };
    addEventListener('message', alRecibir);
    return () => removeEventListener('message', alRecibir);
  }, []);
  const recibir = () => {
    const w = window.open(`${APP_URL}?panel=1`, '_blank');
    if (!w) { setMsg('El navegador no dejó abrir la app. Permita ventanas emergentes para este panel o use "📥 Subir mapeos" con el archivo.'); return; }
    ventana.current = w; setMsg('Abriendo la app del celular…');
  };

  const borrar = async (r: Reporte) => {
    if (confirmar !== r.id) { setConfirmar(r.id); setTimeout(() => setConfirmar(c => (c === r.id ? null : c)), 4000); return; }
    setConfirmar(null);
    try { await db?.collection('mapeos').doc(r.id).delete(); setMsg(`Se borró ${r.labor} ${r.desde}.`); } catch (e) { setMsg(`No se pudo borrar: ${(e as Error).message}`); }
  };

  const ordenados = useMemo(() => [...mapeos].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || (b.modificado ?? '').localeCompare(a.modificado ?? '')), [mapeos]);
  const filas = useMemo(() => ordenados.map(r => {
    const c = calcular(r), t = c.rmrFinal != null ? tipoRoca(c.rmrFinal) : null;
    return { r, c, t, info: t ? TIPOS.find(x => x.tipo === t) : undefined };
  }), [ordenados]);
  const labores = useMemo(() => [...new Set(mapeos.map(m => m.labor).filter(Boolean))].sort(), [mapeos]);
  const vistas = filas.filter(({ r, t }) => {
    if (tipo && t !== tipo) return false;
    if (labor && r.labor !== labor) return false;
    const s = q.trim().toLowerCase();
    return !s || [r.labor, r.desde, r.hasta, r.supervisor, r.fecha, r.correlativo, r.observaciones].join(' ').toLowerCase().includes(s);
  });
  const porTipo = useMemo(() => TIPOS.map(x => ({ ...x, n: filas.filter(f => f.t === x.tipo).length })).filter(x => x.n), [filas]);
  const ultimo = mapeos.reduce<string | undefined>((m, r) => (!m || (r.panel?.subidoEn ?? '') > m ? r.panel?.subidoEn : m), undefined);

  const csv = async () => {
    const cab = ['Correlativo', 'Labor', 'Desde', 'Hasta', 'Fecha', 'Turno', 'Supervisor', 'RMR', 'Tipo', 'Q corona', 'Nivel de riesgo', 'Sostenimiento', 'Subido'];
    const lin = filas.map(({ r, c, t }) => [r.correlativo, r.labor, r.desde, r.hasta, r.fecha, r.turno, r.supervisor, c.rmrFinal ?? '', t ?? '', c.zonas.CORONA.q ?? '', r.nivelRiesgo, (r.sostenimiento ?? []).join(' / '), r.panel?.subidoEn ?? '']
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));
    const { entregar } = await import('../export/compartir');
    await entregar(new TextEncoder().encode('﻿' + [cab.join(';'), ...lin].join('\r\n')), `mapeos_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  const sel = abierto ? mapeos.find(m => m.id === abierto) : null;
  if (sel) return (
    <div className="panel-editor">
      <Editor key={sel.id} inicial={sel} listas={listas} historial={mapeos.filter(m => m.id !== sel.id)} modoInicial="detalle" textoGuardado="Guardado en el panel"
        onGuardar={async r => { if (sinMeta(r) === sinMeta(sel)) return; await escribir(r.id, { ...r, modificado: new Date().toISOString(), panel: { ...sel.panel, editadoEn: new Date().toISOString() } }); }}
        onSalir={() => setAbierto(null)} />
    </div>
  );

  return (
    <div className="panel">
      <header className="panel-cab">
        <div className="panel-cab-in">
          <small>JUSTA · PRT-JS-CLD-16 · PANEL DE MAPEOS</small>
          <h1>Mapeos de todos los celulares</h1>
          <div className="panel-cifras">
            <span><b>{mapeos.length}</b> mapeos</span>
            <span><b>{labores.length}</b> labores</span>
            <span>Último envío <b>{fechaHora(ultimo)}</b></span>
          </div>
          {porTipo.length > 0 && <div className="panel-tipos">{porTipo.map(x => <span key={x.tipo} className="chip" style={{ background: x.color, color: x.texto, borderColor: x.color }}>ST-{x.tipo} · {x.n}</span>)}</div>}
        </div>
      </header>
      <main className="panel-cuerpo">
        <section className="panel-barra">
          <button className="btn primario" disabled={ocupado || !db} onClick={recibir}>📲 Recibir del celular</button>
          <label className={`btn panel-subir${ocupado || !db ? ' apagado' : ''}`}>📥 Subir mapeos
            <input id="subir" type="file" accept=".json,application/json,text/plain" multiple hidden disabled={ocupado || !db} onChange={e => { subir(e.target.files); e.target.value = ''; }} /></label>
          <input id="buscar" className="panel-buscar" placeholder="Buscar labor, PK, supervisor, fecha…" value={q} onChange={e => setQ(e.target.value)} />
          <select id="labor" value={labor} onChange={e => setLabor(e.target.value)}><option value="">Todas las labores</option>{labores.map(l => <option key={l}>{l}</option>)}</select>
          <select id="tipo" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{TIPOS.map(x => <option key={x.tipo} value={x.tipo}>ST-{x.tipo}</option>)}</select>
          <button className="btn" disabled={!mapeos.length} onClick={csv}>⬇ Resumen (CSV)</button>
        </section>
        {msg && <p className="panel-msg" onClick={() => setMsg(null)}>{msg}</p>}
        {estado === 'cargando' && <p className="tenue">Cargando los mapeos…</p>}
        {estado === 'lento' && <p className="alerta">La base del panel aún no responde. Revise su conexión; los mapeos aparecerán solos al conectar.</p>}
        {estado === 'sin-acceso' && <p className="alerta">Este panel funciona dentro de Claude: ábralo con su enlace de claude.ai, con su cuenta.</p>}
        {estado.startsWith('error:') && <p className="alerta">No se pudo leer la base del panel: {estado.slice(6)}</p>}
        {estado === 'listo' && !mapeos.length && <div className="vacio panel-vacio"><b>☁️</b>Todavía no hay mapeos en el panel.
          <span>En el celular, en la lista de reportes, toque <b>☁️ Enviar mapeos al panel</b> y guarde el archivo. Luego, aquí, toque <b>📥 Subir mapeos</b> y elíjalo.</span></div>}
        {vistas.length > 0 && <div className="panel-lista" role="list">
          {vistas.map(({ r, c, t, info }) => {
            const foto = r.fotos?.find(f => f.zona === 'FRENTE') ?? r.fotos?.[0];
            return (
              <article key={r.id} role="listitem" className="panel-fila" style={{ borderLeftColor: info?.color ?? 'var(--borde)' }} onClick={() => setAbierto(r.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setAbierto(r.id); }}>
                {foto ? <img className="pf-foto" src={foto.data} alt="" loading="lazy" /> : <span className="pf-foto vacia">📷</span>}
                <div className="pf-txt">
                  <b>{r.labor || 'Sin labor'}</b>
                  <span>{[r.desde && `PK ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''}`, r.fecha, r.turno, r.correlativo && `N° ${r.correlativo}`].filter(Boolean).join(' · ')}</span>
                  <small>{r.supervisor || 'Sin supervisor'} · subido {fechaHora(r.panel?.subidoEn)}{r.panel?.subidoPor ? ` por ${nombres[r.panel.subidoPor] ?? '…'}` : ''}{r.panel?.editadoEn ? ` · editado ${fechaHora(r.panel.editadoEn)}` : ''}</small>
                </div>
                <div className="pf-datos">
                  <span className="chip" style={info ? { background: info.color, color: info.texto, borderColor: info.color } : {}}>{t ? `ST-${t}` : 'Sin tipo'}</span>
                  <span className="pf-num">RMR <b>{c.rmrFinal ?? '—'}</b></span>
                  <span className="pf-num">Q <b>{c.zonas.CORONA.q ?? '—'}</b></span>
                  {r.nivelRiesgo && <span className="pf-num">Riesgo <b>{r.nivelRiesgo}</b></span>}
                </div>
                {editor && <button className={confirmar === r.id ? 'btn mini peligro' : 'btn mini'} aria-label="Borrar mapeo" onClick={e => { e.stopPropagation(); borrar(r); }}>{confirmar === r.id ? '¿Borrar? Toque otra vez' : '🗑'}</button>}
              </article>
            );
          })}
        </div>}
        {estado === 'listo' && mapeos.length > 0 && !vistas.length && <p className="tenue">Ningún mapeo coincide con el filtro.</p>}
      </main>
    </div>
  );
}

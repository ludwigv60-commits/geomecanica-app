// CENTRO DE CONTROL LUDWIG JUSTA SUBTERRÁNEA (antes Panel de mapeos): todos los mapeos que envían los celulares, guardados en la base del artefacto (privado en Claude).
// Misma interfaz de la app para ver y editar; los mapeos quedan aquí aunque se borren del celular.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '../ui/Editor';
import { LISTAS_INICIALES, nuevoReporte, siguienteCorrelativo, type FotoZona, type Listas, type Reporte } from '../model';
import { TIPOS } from '../core/rmr';
import { FILTRO_VACIO, filtrar, fila, infoTipo, type Filtro, type Herramienta } from './centro';
import { excelDe, Herramientas, Inicio, PESTANAS, ResumenPk, Tabla, Visor, type Pestana } from './vistas';
import { usarEntrega } from '../export/compartir';
import { GMAIL, leerGmail, type Mcp } from './gmail';
import { Puente } from './vistas';
import { leerPaquete, type Paquete } from '../export/envio';

/* Capacidades del artefacto (tipos mínimos de lo que se usa). */
type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type QSnap = { docs: Snap[]; metadata: { fromCache: boolean } };
type DbErr = { code: string; message: string };
type DocRef = { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; onSnapshot(n: (s: Snap) => void, e?: (x: DbErr) => void): () => void };
type DB = { doc(p: string): DocRef; collection(p: string): { doc(id: string): DocRef; onSnapshot(n: (s: QSnap) => void, e?: (x: DbErr) => void): () => void } };
type Assets = { upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string }>; delete?(id: string): Promise<void> };
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
  const [f, setF] = useState<Filtro>(FILTRO_VACIO);
  const [tab, setTab] = useState<Pestana>('inicio'); // siempre abre en "¿Qué vamos a hacer hoy?"
  const irA = (t: Pestana) => { setTab(t); window.scrollTo(0, 0); };
  const [app, setApp] = useState<Herramienta | null>(null);
  const [borrador, setBorrador] = useState<Reporte | null>(null);
  const [editor, setEditor] = useState(false);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const cadena = useRef(new Map<string, Promise<void>>());
  const [mcp, setMcp] = useState<Mcp | null>(null);
  const hechos = useRef<string[] | null>(null);
  const [gmail, setGmail] = useState<{ estado: 'nada' | 'leyendo' | 'ok' | 'error'; texto: string; cuando?: string }>({ estado: 'nada', texto: '' });
  const autoGmail = useRef(false);
  const [ocultas, setOcultas] = useState<string[]>([]);

  useEffect(() => {
    let fin: (() => void)[] = [], t = 0;
    (async () => {
      const c = (window as unknown as { claude?: Claude }).claude;
      if (!c) { setEstado('sin-acceso'); return; }
      const [d, a, u, dl, m] = await Promise.all(['db', 'assets', 'user', 'downloads', 'mcp'].map(n => c.use(n).catch(() => null))) as [DB | null, Assets | null, User | null, Downloads | null, Mcp | null];
      setMcp(m);
      if (!d) { setEstado('sin-acceso'); return; }
      setDb(d); setAssets(a); setUser(u);
      if (dl) usarEntrega(async (datos, nombre) => { await dl.save({ filename: nombre, data: datos }); return 'descargado'; });
      // las herramientas abiertas dentro del Centro descargan por aquí (ver descargas-polyfill.js)
      (window as unknown as { lkGuardar?: (n: string, d: Uint8Array) => Promise<unknown> }).lkGuardar = dl
        ? (nombre, datos) => dl.save({ filename: nombre, data: datos })
        : async () => { throw new Error('el Centro no tiene el permiso de descargas'); };
      if (u) { setUid(await u.id()); setEditor(!!(await u.canEdit())); }
      t = window.setTimeout(() => setEstado(e => (e === 'cargando' ? 'lento' : e)), 10000);
      fin.push(d.collection('mapeos').onSnapshot(s => {
        window.clearTimeout(t);
        const l = s.docs.map(x => x.data() as unknown as Reporte).filter(r => r?.id).map(r => ({ ...nuevoReporte(), ...r }) as Reporte); // completa campos de versiones antiguas
        ultimos.current = l; setMapeos(l); setEstado('listo');
      }, e => { window.clearTimeout(t); setEstado(`error:${e.message}`); }));
      fin.push(d.doc('config/herramientas').onSnapshot(s => { const o = (s.data() as { ocultas?: string[] } | undefined)?.ocultas; setOcultas(Array.isArray(o) ? o : []); }, () => {}));
      fin.push(d.doc('config/gmail').onSnapshot(s => { const h = (s.data() as { hechos?: string[] } | undefined)?.hechos; hechos.current = Array.isArray(h) ? h : []; }, () => { hechos.current = []; }));
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
          // el mapeo corregido reemplaza al antiguo: las fotos antiguas que ya no usa se borran para no llenar el Centro
          if (ex && assets?.delete) for (const f of ex.fotos ?? []) {
            if (fotos.some(x => x.data === f.data)) continue;
            const aid = /([0-9a-f]{32})/.exec(f.data)?.[1];
            if (aid) await assets.delete(aid).catch(() => {});
          }
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


  /** Trae del Gmail del usuario los mapeos que el APK mandó por el puente y los guarda en la base. */
  const recibirGmail = async (manual: boolean) => {
    if (!mcp || !db || gmail.estado === 'leyendo') return;
    setGmail({ estado: 'leyendo', texto: 'Buscando mapeos nuevos del celular en su Gmail…' });
    try {
      const ya = new Set(hechos.current ?? []);
      const l = await leerGmail(mcp, ya, t => setGmail({ estado: 'leyendo', texto: t }));
      let texto = l.recibidos.length ? '' : 'No hay mapeos nuevos del celular.';
      const borrar = async (ids: string[]) => {
        let n = 0;
        for (const h of ids) {
          try { await mcp.callTool(GMAIL, 'trash_thread', { threadId: h }); n++; }
          catch { try { await mcp.callTool(GMAIL, 'unlabel_thread', { threadId: h, labelIds: ['INBOX', 'UNREAD'] }); } catch { /* sin permiso */ } }
        }
        return n;
      };
      // correos de mapeos que ya estaban cargados y siguen en Gmail: a la papelera
      const viejos = l.yaCargados?.length ? await borrar(l.yaCargados) : 0;
      if (l.recibidos.length) {
        // el más reciente al final: un mapeo corregido y reenviado (mismo id) queda con su última versión
        const orden = [...l.recibidos].sort((a, b) => (a.paquete.enviadoEn ?? '').localeCompare(b.paquete.enviadoEn ?? ''));
        texto = (await importar(orden.map(x => x.paquete), t => setGmail({ estado: 'leyendo', texto: t }))).texto;
        const nuevos = [...new Set([...(hechos.current ?? []), ...l.recibidos.flatMap(x => [x.hilo, ...(x.otros ?? [])])])].slice(-3000);
        hechos.current = nuevos;
        await db.doc('config/gmail').set({ hechos: nuevos });
        // Ya cargados: los correos del puente van a la papelera de Gmail (el usuario no quiere verlos; Gmail los guarda 30 días).
        const borrados = await borrar(l.recibidos.flatMap(x => [x.hilo, ...(x.otros ?? [])]));
        if (borrados) texto += ` ${borrados} correo(s) del celular ya cargados se borraron de Gmail.`;
      }
      if (viejos) texto += ` ${viejos} correo(s) ya cargados se borraron de Gmail.`;
      if (l.incompletos) texto += ` ${l.incompletos} envío(s) aún incompleto(s): se completan al llegar el resto de correos.`;
      if (l.errores.length) texto += ` ${l.errores.length} correo(s) no se pudieron leer.`;
      setGmail({ estado: 'ok', texto, cuando: new Date().toISOString() });
    } catch (e) {
      const x = e as { code?: string; message?: string };
      const t = x.code === 'server_not_connected' ? 'Conecte Gmail en claude.ai → Configuración → Conectores para recibir solo los mapeos del celular.'
        : x.code === 'needs_reauth' ? 'Vuelva a conectar Gmail en claude.ai → Configuración → Conectores.'
        : x.code === 'approval_required' || x.code === 'not_in_manifest' ? 'Falta su permiso para leer los correos del puente: toque "📨 Recibir del celular" y acepte.'
        : `No se pudo leer Gmail: ${x.message ?? String(e)}`;
      setGmail({ estado: 'error', texto: t });
      if (manual) setMsg(t);
    }
  };
  useEffect(() => {
    if (estado !== 'listo' || !mcp || !db || autoGmail.current || hechos.current === null || !editor) return;
    autoGmail.current = true; void recibirGmail(false);
  });

  const borrar = async (r: Reporte) => {
    if (confirmar !== r.id) { setConfirmar(r.id); setTimeout(() => setConfirmar(c => (c === r.id ? null : c)), 4000); return; }
    setConfirmar(null);
    try { await db?.collection('mapeos').doc(r.id).delete(); setMsg(`Se borró ${r.labor} ${r.desde}.`); } catch (e) { setMsg(`No se pudo borrar: ${(e as Error).message}`); }
  };

  const filasTodas = useMemo(() => mapeos.map(r => fila(r, listas)).sort((a, b) => (b.r.fecha ?? '').localeCompare(a.r.fecha ?? '') || (b.r.modificado ?? '').localeCompare(a.r.modificado ?? '')), [mapeos, listas]);
  const vistas = useMemo(() => filtrar(filasTodas, f), [filasTodas, f]);
  const labores = useMemo(() => [...new Set(filasTodas.filter(x => (!f.tipoLabor || x.tipoLabor === f.tipoLabor) && (!f.rampa || x.rampa === f.rampa)).map(x => x.r.labor).filter(Boolean))].sort(), [filasTodas, f.tipoLabor, f.rampa]);
  const riesgos = useMemo(() => [...new Set(filasTodas.map(x => x.r.nivelRiesgo).filter(Boolean))].sort(), [filasTodas]);
  const ultimo = mapeos.reduce<string | undefined>((m, r) => (!m || (r.panel?.subidoEn ?? '') > m ? r.panel?.subidoEn : m), undefined);
  const metros = Math.round(vistas.reduce((s, x) => s + (x.avance ?? 0), 0) * 10) / 10;
  const hayFiltro = JSON.stringify(f) !== JSON.stringify(FILTRO_VACIO);
  const poner = <K extends keyof Filtro>(k: K, v: Filtro[K]) => setF(x => ({ ...x, [k]: v, ...(k === 'tipoLabor' || k === 'rampa' ? { labor: '' } : {}) }));

  const excel = async () => {
    try {
      setMsg('Armando el Excel…');
      const datos = await excelDe(vistas, f);
      const { entregar } = await import('../export/compartir');
      await entregar(datos, `Centro_Control_Justa_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMsg(`Excel listo: ${vistas.length} mapeo(s) en 3 hojas (Resumen, PK a PK y Detalle).`);
    } catch (e) { setMsg(`No se pudo armar el Excel: ${(e as Error).message}`); }
  };

  const nuevoMapeo = () => {
    const prev = [...mapeos].sort((a, b) => (b.modificado ?? '').localeCompare(a.modificado ?? ''))[0];
    setBorrador(nuevoReporte(prev, siguienteCorrelativo(mapeos)));
  };
  if (app) return <Visor h={app} cerrar={() => setApp(null)} />;
  if (borrador) return (
    <div className="panel-editor">
      <Editor key={borrador.id} inicial={borrador} listas={listas} historial={mapeos} modoInicial="campo" textoGuardado="Guardado en el Centro"
        onGuardar={async r => { await escribir(r.id, { ...r, modificado: new Date().toISOString(), panel: { subidoPor: uid ?? undefined, subidoEn: new Date().toISOString(), dispositivo: 'Centro de Control' } }); }}
        onSalir={() => setBorrador(null)} />
    </div>
  );
  const sel = abierto ? mapeos.find(m => m.id === abierto) : null;
  if (sel) return (
    <div className="panel-editor">
      <Editor key={sel.id} inicial={sel} listas={listas} historial={mapeos.filter(m => m.id !== sel.id)} modoInicial="detalle" textoGuardado="Guardado en el panel"
        onGuardar={async r => { if (sinMeta(r) === sinMeta(sel)) return; await escribir(r.id, { ...r, modificado: new Date().toISOString(), panel: { ...sel.panel, editadoEn: new Date().toISOString() } }); }}
        onSalir={() => setAbierto(null)} />
    </div>
  );

  return (
    <div className="centro">
      <header className="c-cab">
        <div className="c-cab-in">
          <div className="c-marca">
            <img src="logo-lk.png" alt="LK Geomecánica" className="c-logo" />
            <div>
              <small>LK GEOMECÁNICA · INGENIERÍA · GEOTÉCNICA</small>
              <h1>CENTRO DE CONTROL LUDWIG<br /><span>JUSTA SUBTERRÁNEA</span></h1>
            </div>
          </div>
          <div className="c-kpis">
            <div><b>{mapeos.length}</b><span>mapeos</span></div>
            <div><b>{new Set(mapeos.map(m => m.labor).filter(Boolean)).size}</b><span>labores</span></div>
            <div><b>{Math.round(filasTodas.reduce((s, x) => s + (x.avance ?? 0), 0))}</b><span>m mapeados</span></div>
            <div><b className="chico">{fechaHora(ultimo)}</b><span>último envío</span></div>
          </div>
          <nav className="c-tabs" role="tablist">
            {PESTANAS.map(p => <button key={p.id} role="tab" aria-selected={tab === p.id} className={tab === p.id ? 'sel' : ''} onClick={() => irA(p.id)}>{p.icono} {p.nombre}</button>)}
          </nav>
        </div>
      </header>
      <main className="c-cuerpo">
        {msg && <p className="panel-msg" onClick={() => setMsg(null)}>{msg}</p>}
        {gmail.estado !== 'nada' && tab !== 'herramientas' && <p className={`c-gmail ${gmail.estado}`}>📨 {gmail.texto}{gmail.cuando ? ` · ${fechaHora(gmail.cuando)}` : ''}</p>}
        {estado === 'cargando' && <p className="tenue">Cargando los mapeos…</p>}
        {estado === 'lento' && <p className="alerta">La base aún no responde. Revise su conexión; los mapeos aparecerán solos al conectar.</p>}
        {estado === 'sin-acceso' && <p className="alerta">Este Centro funciona dentro de Claude: ábralo con su enlace de claude.ai, con su cuenta.</p>}
        {estado.startsWith('error:') && <p className="alerta">No se pudo leer la base: {estado.slice(6)}</p>}

        {tab !== 'herramientas' && tab !== 'inicio' && <section className="c-filtros" aria-label="Filtros">
          <div className="c-seg" role="group" aria-label="Rampa o cámara">
            {([['', 'Todo'], ['RAMPA', '🛣️ Rampas'], ['CAMARA', '🏛️ Cámaras']] as const).map(([v, t]) => <button key={v} className={f.tipoLabor === v ? 'sel' : ''} onClick={() => poner('tipoLabor', v)}>{t}</button>)}
          </div>
          <div className="c-seg" role="group" aria-label="Rampa">
            {([['', 'Norte y Sur'], ['Norte', 'Norte'], ['Sur', 'Sur']] as const).map(([v, t]) => <button key={v} className={f.rampa === v ? 'sel' : ''} onClick={() => poner('rampa', v)}>{t}</button>)}
          </div>
          <select aria-label="Labor" value={f.labor} onChange={e => poner('labor', e.target.value)}><option value="">Todas las labores</option>{labores.map(l => <option key={l}>{l}</option>)}</select>
          <label className="c-pk">PK de<input inputMode="decimal" placeholder="0+900" value={f.pkDesde} onChange={e => poner('pkDesde', e.target.value)} /></label>
          <label className="c-pk">a<input inputMode="decimal" placeholder="0+960" value={f.pkHasta} onChange={e => poner('pkHasta', e.target.value)} /></label>
          <select aria-label="Tipo de roca" value={f.tipo} onChange={e => poner('tipo', e.target.value as Filtro['tipo'])}><option value="">Todo tipo de roca</option>{TIPOS.map(x => <option key={x.tipo} value={x.tipo}>Tipo {x.tipo}</option>)}</select>
          <select aria-label="Nivel de riesgo" value={f.riesgo} onChange={e => poner('riesgo', e.target.value)}><option value="">Todo riesgo</option>{riesgos.map(x => <option key={x}>{x}</option>)}</select>
          <label className="c-pk">Del<input type="date" value={f.fechaDesde} onChange={e => poner('fechaDesde', e.target.value)} /></label>
          <label className="c-pk">al<input type="date" value={f.fechaHasta} onChange={e => poner('fechaHasta', e.target.value)} /></label>
          <input className="c-buscar" placeholder="Buscar supervisor, N°, observación…" value={f.texto} onChange={e => poner('texto', e.target.value)} />
          {hayFiltro && <button className="btn mini" onClick={() => setF(FILTRO_VACIO)}>✕ Limpiar</button>}
          <div className="c-acciones">
            {mcp && editor && <button className={`btn${gmail.estado === 'leyendo' ? ' apagado' : ''}`} title={gmail.texto} onClick={() => recibirGmail(true)}>{gmail.estado === 'leyendo' ? '⏳ Recibiendo…' : '📨 Recibir del celular'}</button>}
            <span className="c-cuenta"><b>{vistas.length}</b> mapeo(s) · <b>{metros}</b> m</span>
            <label className={`btn${ocupado || !db ? ' apagado' : ''}`}>📥 Subir mapeos
              <input id="subir" type="file" accept=".json,application/json,text/plain" multiple hidden disabled={ocupado || !db} onChange={e => { subir(e.target.files); e.target.value = ''; }} /></label>
            <button className="btn primario" disabled={!vistas.length} onClick={excel}>⬇ Excel</button>
          </div>
        </section>}

        {tab === 'mapeos' && <>
          {estado === 'listo' && !mapeos.length && <div className="vacio panel-vacio"><b>☁️</b>Todavía no hay mapeos.
            <span>En el celular, toque <b>☁️ Enviar mapeos al panel</b> y guarde el archivo. Luego, aquí, toque <b>📥 Subir mapeos</b>.</span></div>}
          {vistas.length > 0 && <div className="panel-lista" role="list">
            {vistas.map(({ r, tipo, tipoLabor, cob, rmr, q }) => {
              const info = infoTipo(tipo);
              const foto = r.fotos?.find(x => x.zona === 'FRENTE') ?? r.fotos?.[0];
              return (
                <article key={r.id} role="listitem" className="panel-fila" style={{ borderLeftColor: info?.color ?? 'var(--borde)' }} onClick={() => setAbierto(r.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setAbierto(r.id); }}>
                  {foto ? <img className="pf-foto" src={foto.data} alt="" loading="lazy" /> : <span className="pf-foto vacia">📷</span>}
                  <div className="pf-txt">
                    <b>{tipoLabor === 'CAMARA' ? '🏛️ ' : ''}{r.labor || 'Sin labor'}</b>
                    <span>{[r.desde && `PK ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''}`, r.avance != null && `${r.avance} m`, r.fecha, r.turno, r.correlativo && `N° ${r.correlativo}`].filter(Boolean).join(' · ')}</span>
                    <small>{r.supervisor || 'Sin supervisor'} · subido {fechaHora(r.panel?.subidoEn)}{r.panel?.subidoPor ? ` por ${nombres[r.panel.subidoPor] ?? '…'}` : ''}{r.panel?.editadoEn ? ` · editado ${fechaHora(r.panel.editadoEn)}` : ''}</small>
                  </div>
                  <div className="pf-datos">
                    <span className="chip" style={info ? { background: info.color, color: info.texto, borderColor: info.color } : {}}>{tipo ? `Tipo ${tipo}` : 'Sin tipo'}</span>
                    <span className="pf-num">RMR <b>{rmr ?? '—'}</b></span>
                    <span className="pf-num">Q <b>{q.CORONA ?? '—'}</b></span>
                    {cob != null && <span className="pf-num">Cob. <b>{cob} m</b></span>}
                    {r.nivelRiesgo && <span className="pf-num">Riesgo <b>{r.nivelRiesgo}</b></span>}
                  </div>
                  {editor && <button className={confirmar === r.id ? 'btn mini peligro' : 'btn mini'} aria-label="Borrar mapeo" onClick={e => { e.stopPropagation(); borrar(r); }}>{confirmar === r.id ? '¿Borrar? Toque otra vez' : '🗑'}</button>}
                </article>
              );
            })}
          </div>}
          {estado === 'listo' && mapeos.length > 0 && !vistas.length && <p className="tenue">Ningún mapeo coincide con el filtro.</p>}
        </>}

        {tab === 'inicio' && <Puente abierto={!(hechos.current?.length)} />}
        {tab === 'inicio' && <Inicio filas={filasTodas} ocultas={ocultas} abrir={setApp} abrirMapeo={setAbierto} ir={irA} excel={excel}
          nuevo={db && editor ? nuevoMapeo : undefined} recibir={mcp && editor ? () => recibirGmail(true) : undefined} recibiendo={gmail.estado === 'leyendo'} />}
        {tab === 'resumen' && <ResumenPk filas={vistas} abrir={setAbierto} />}
        {tab === 'tabla' && <Tabla filas={vistas} abrir={setAbierto} />}
        {tab === 'herramientas' && <><Puente /><Herramientas ocultas={ocultas} abrir={setApp} cambiar={db && editor ? (n => { setOcultas(n); db.doc('config/herramientas').set({ ocultas: n }).catch(e => setMsg(`No se pudo guardar: ${(e as Error).message}`)); }) : undefined} /></>}
      </main>
      <footer className="c-pie">LK Geomecánica · Centro privado: los datos de Justa solo los ve quien usted invite.</footer>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { nuevoReporte, siguienteCorrelativo, LISTAS_INICIALES, type Listas, type Reporte } from '../model';
import { borrarReporte, guardarConfig, guardarListas, guardarReporte, leerConfig, leerListas, listarReportes, marcarEnviado, pedirPersistencia, restaurarReportes, riesgoDeBorrado } from '../store';
import { PANEL_LISTO, PANEL_URL, enviarMapeos, guardarRespaldo, leerPaquete } from '../export/envio';
import { corregido, nuevo, pendiente, proximoTurno } from '../export/autoenvio';
import { Editor } from './Editor';
import { EditorListas } from './EditorListas';
import { TIPOS, tipoRoca } from '../core/rmr';
import { calcular } from '../calc';

type Vista = { v: 'lista' } | { v: 'editor'; r: Reporte } | { v: 'listas' };

export function App() {
  const [vista, setVista] = useState<Vista>({ v: 'lista' });
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [listas, setListas] = useState<Listas>(LISTAS_INICIALES);
  // Con puente: falta lo que el Centro no confirmó. Sin puente: lo que no se preparó en archivo.
  const falta = (r: Reporte) => listas.puenteUrl ? pendiente(r) : !r.enviado || r.modificado > r.enviado;
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [bd, setBd] = useState<Reporte[]>([]);   // historial importado de la BD de mapeos
  const recargarBd = () => leerConfig<Reporte[]>('historialBD').then(l => setBd(l ?? [])).catch(() => {});

  const recargar = () => listarReportes().then(setReportes);
  // Protección contra el borrado del navegador: aviso si puede borrar solos los datos y respaldo en archivo.
  const [riesgo, setRiesgo] = useState<'ios-safari' | 'navegador' | null>(null);
  const [ultRespaldo, setUltRespaldo] = useState<string | null>(null);
  const [respaldo, setRespaldo] = useState<string | null>(null);
  const respaldar = async () => {
    setRespaldo('Preparando el respaldo…');
    try {
      const { res, enviadoEn } = await guardarRespaldo(reportes, listas);
      if (res === 'tocar') { setRespaldo('El celular pidió otro toque: toque 💾 Guardar respaldo otra vez.'); return; }
      await guardarConfig('ultimoRespaldo', enviadoEn).catch(() => {}); setUltRespaldo(enviadoEn);
      setRespaldo(`💾 Respaldo de ${reportes.length} mapeo(s) listo. Guárdelo en Archivos, OneDrive o Drive (no solo en el navegador).`);
    } catch (e) { setRespaldo(`No se pudo preparar el respaldo: ${(e as Error).message}`); }
  };
  const restaurar = async (files: FileList | null) => {
    if (!files?.length) return;
    setRespaldo('Leyendo el archivo…');
    try {
      let n = 0, a = 0, i = 0, listasRec: Partial<Listas> = {};
      for (const f of [...files]) {
        const p = leerPaquete(await f.text());
        const r = await restaurarReportes(p.reportes); n += r.nuevos; a += r.actualizados; i += r.iguales;
        listasRec = { ...listasRec, ...(p.listas ?? {}) };
      }
      // listas del archivo: se suman a las del celular (y vuelve el puente al Centro si venía en el respaldo)
      const l = { ...listas } as Record<string, unknown>;
      for (const [k, v] of Object.entries(listasRec)) {
        if (Array.isArray(v)) l[k] = [...new Set([...((Array.isArray(l[k]) ? l[k] : []) as unknown[]), ...v])];
        else if (l[k] == null || l[k] === '') l[k] = v;
      }
      await guardarListas(l as unknown as Listas); setListas(l as unknown as Listas);
      await recargar();
      setRespaldo(`📥 Listo: ${n} mapeo(s) recuperado(s)${a ? `, ${a} actualizado(s)` : ''}${i ? `, ${i} ya estaban` : ''}.`);
    } catch (e) { setRespaldo(`No se pudo recuperar: ${(e as Error).message}`); }
  };
  const [envio, setEnvio] = useState<string | null>(null);
  const [auto, setAuto] = useState<string | null>(null);
  const enviar = async (lista: Reporte[]) => {
    if (!lista.length) return;
    if (listas.puenteUrl) { // con el puente activo, ☁️ Enviar manda directo al Centro (no prepara archivo)
      setEnvio(null); setAuto('Enviando al Centro de Control…');
      try { const { enviarLista } = await import('../export/autoenvio'); const n = await enviarLista(lista, listas); setAuto(`☁️ ${n} mapeo(s) enviados al Centro de Control.`); await recargar(); }
      catch (e) { setAuto(`⚠️ No se pudo enviar al Centro de Control: ${(e as Error).message}`); }
      return;
    }
    setEnvio('Preparando el envío…');
    try {
      const { enviadoEn } = await enviarMapeos(lista, listas);
      await marcarEnviado(lista.map(r => r.id), enviadoEn); await recargar();
      setEnvio(`listo:${lista.length}`);
    } catch (e) { setEnvio(`No se pudo preparar el envío: ${(e as Error).message}`); }
  };
  const avisoEnvio = envio && (envio.startsWith('listo:')
    ? <div className="envio-ok"><b>☁️ {envio.slice(6)} mapeo(s) listos para el panel</b>
        <span>Ahora abra el panel, toque <b>📥 Subir mapeos</b> y elija el archivo que guardó.</span>
        <a className="btn primario" href={PANEL_URL} target="_blank" rel="noreferrer">Abrir el panel de mapeos</a>
        <button className="btn mini" onClick={() => setEnvio(null)}>Cerrar</button></div>
    : <p className="tenue">{envio}</p>);
  useEffect(() => {
    recargar(); recargarBd();
    pedirPersistencia().then(p => setRiesgo(riesgoDeBorrado(p))).catch(() => {});
    leerConfig<string>('ultimoRespaldo').then(u => setUltRespaldo(u ?? null)).catch(() => {});
    // Web (GitHub): el enlace privado …/formulario/#puente=URL deja el puente puesto en este navegador.
    // Lo que va después de # nunca sale del celular, así la clave no queda en el código público.
    // Se revisa al abrir y también si la app ya estaba abierta (Safari solo cambia el # sin recargar).
    const aplicarEnlace = async (l: Listas): Promise<Listas> => {
      const h = new URLSearchParams(location.hash.slice(1)).get('puente');
      if (!h) return l;
      history.replaceState(null, '', location.pathname + location.search);
      const { problemaUrl } = await import('../export/autoenvio');
      const mal = problemaUrl(h);
      if (mal) { setAviso(`⚠️ El enlace del Centro llegó incompleto: ${mal}`); return l; }
      l = { ...l, puenteUrl: h.trim() }; await guardarListas(l).catch(() => {});
      setAviso('☁️ Envío automático al Centro de Control activado en este celular.');
      return l;
    };
    leerListas().then(async l => {
      l = await aplicarEnlace(l);
      // APK: si el celular aún no tiene el puente al Centro, se pone solo el que viene de fábrica.
      if (!l.puenteUrl) { const u = await import('../export/autoenvio').then(m => m.puenteDeFabrica()).catch(() => null); if (u) { l = { ...l, puenteUrl: u }; await guardarListas(l).catch(() => {}); } }
      setListas(l);
    });
    const alCambiarEnlace = () => { leerListas().then(aplicarEnlace).then(setListas); };
    window.addEventListener('hashchange', alCambiarEnlace);
    // APK: los mapeos de Justa y la IA entrenada vienen dentro de la app y se cargan solos la primera vez.
    import('../ia/paquete').then(m => m.cargarPaqueteIncluido()).then(msg => { if (msg) { recargarBd(); setAviso(msg); } }).catch(() => {});
    // Deja listo en el celular todo lo necesario para exportar sin señal.
    const t = setTimeout(() => {
      import('../export/xlsx').catch(() => {}); import('../export/pdf').catch(() => {});
      fetch('./plantilla/formato.xlsx').catch(() => {}); fetch('./plantilla/formato.pdf').catch(() => {});
    }, 1500);
    return () => { clearTimeout(t); window.removeEventListener('hashchange', alCambiarEnlace); };
  }, []);

  // Envío automático al Centro: una vez por turno (7:00 y 19:00). Si a esa hora no hubo señal o la app estaba cerrada,
  // se envía apenas se pueda. Solo los mapeos nuevos; los corregidos esperan al botón Enviar.
  const [enviando, setEnviando] = useState(false);
  const intentarRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!listas.puenteUrl) return;
    const intentar = () => { setEnviando(true); import('../export/autoenvio').then(m => m.enviarProgramado(reportes, listas))
      .then(n => { if (n > 0) { setAuto(`☁️ ${n} mapeo(s) nuevos enviados solos al Centro de Control.`); recargar(); } else setAuto(a => a); })
      .catch(e => setAuto(`⚠️ No se pudo enviar al Centro de Control (se reintenta solo cada 2 min): ${(e as Error).message}`))
      .finally(() => setEnviando(false)); };
    // botón: manda ya los nuevos y los corregidos (el corregido reemplaza al antiguo en el Centro)
    intentarRef.current = () => { void enviar(reportes.filter(pendiente)); };
    intentar();
    window.addEventListener('online', intentar);
    const t = setInterval(intentar, 120000);
    return () => { window.removeEventListener('online', intentar); clearInterval(t); };
  }, [reportes, listas]);

  if (vista.v === 'editor') return (
    <Editor inicial={vista.r} listas={listas} historial={[...reportes, ...bd]}
      onGuardar={async r => { await guardarReporte(r); await recargar(); }}
      onSalir={() => { recargar(); setVista({ v: 'lista' }); }} onBase={recargarBd}
      onEnviar={!PANEL_LISTO ? undefined : async r => { await guardarReporte(r); await recargar(); await enviar([r]); }} />
  );
  if (vista.v === 'listas') return (
    <EditorListas listas={listas} historialBD={bd.length} onHistorial={recargarBd} onGuardar={async l => { await guardarListas(l); setListas(l); setVista({ v: 'lista' }); }}
      onCancelar={() => setVista({ v: 'lista' })} />
  );

  return (
    <div className="pantalla">
      <header className="portada">
        <button className="ajustes" aria-label="Ajustes" onClick={() => setVista({ v: 'listas' })}>⚙️</button>
        <div className="marca">
          <img src="./logo-lk.png" alt="LK Geomecánica" />
          <div><b>LK GEOMECÁNICA</b><small>INGENIERÍA · GEOTÉCNICA</small></div>
        </div>
        <h1>Mapeo geomecánico</h1>
        <p>Justa Subterránea · RMR · Q · sostenimiento</p>
        {reportes.length > 0 && (() => {
          const env = reportes.filter(x => !falta(x)).length;
          const ult = reportes[0] ? calcular(reportes[0]) : null;
          return <div className="kpis">
            <span><b>{reportes.length}</b>reportes</span>
            <span><b>{env}</b>enviados</span>
            <span><b>{ult?.rmrFinal ?? '—'}</b>RMR último</span>
          </div>;
        })()}
      </header>
      <main className="contenido">
        {aviso && <p className="alerta" onClick={() => setAviso(null)}>{aviso}</p>}
        {riesgo && <div className="autoenvio error">
          <b>⚠️ Este navegador puede borrar sus mapeos</b>
          <span>{riesgo === 'ios-safari'
            ? <>Safari borra los datos de esta página si pasan 7 días sin abrirla. Instálela: toque Compartir (cuadro con flecha) → <b>Agregar a inicio</b> y use siempre ese ícono. Ojo: el ícono guarda sus mapeos aparte de Safari; si ya tiene mapeos aquí, guarde un respaldo y recupérelo dentro del ícono.</>
            : <>Instale la app (menú ⋮ → Instalar aplicación o Agregar a pantalla principal) y guarde un respaldo de vez en cuando.</>}</span>
        </div>}
        {(() => {
          const viejo = reportes.length > 0 && (!ultRespaldo || Date.now() - Date.parse(ultRespaldo) > 7 * 864e5);
          return <div className={`respaldo${viejo ? ' viejo' : ''}`}>
            <b>💾 Respaldo de mis mapeos</b>
            <span>{reportes.length === 0
              ? '¿Se borraron sus mapeos? Recupérelos con un respaldo, o con el archivo "📲 Descargar para el celular" del Centro de Control, o con archivos que envió antes al panel.'
              : ultRespaldo ? `Último respaldo: ${new Date(ultRespaldo).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}.${viejo ? ' Guarde uno nuevo.' : ''}` : 'Todavía no guarda un respaldo en este celular.'}</span>
            <span className="fila-btn">
              {reportes.length > 0 && <button className="btn mini" onClick={respaldar}>💾 Guardar respaldo</button>}
              <label className="btn mini">📥 Recuperar mapeos<input type="file" accept=".json,application/json" multiple hidden onChange={e => { void restaurar(e.target.files); e.target.value = ''; }} /></label>
            </span>
            {respaldo && <small>{respaldo}</small>}
          </div>;
        })()}
        {!listas.puenteUrl && reportes.length > 0 && <div className="autoenvio error">
          <b>⚠️ Envío automático al Centro de Control apagado en este celular</b>
          <span>Abra una vez el enlace privado del Centro que le dieron, o toque ⚙️ y pegue la URL del puente.</span>
        </div>}
        {listas.puenteUrl && (() => {
          const nn = reportes.filter(nuevo).length, nc = reportes.filter(corregido).length;
          const prox = proximoTurno().toLocaleString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
          return <div className={`autoenvio${auto?.startsWith('⚠️') ? ' error' : ''}`}>
            <b>☁️ Envío automático a las 7:00 y 19:00</b>
            <span>{enviando ? 'Enviando…' : nn + nc === 0 ? 'Todo enviado al Centro de Control' : [nn ? `${nn} nuevo(s) se envían solos (próximo: ${prox})` : '', nc ? `${nc} corregido(s): toque Enviar para reemplazar el antiguo en el Centro` : ''].filter(Boolean).join(' · ')}</span>
            {auto && <small>{auto}</small>}
            {nn + nc > 0 && !enviando && <button className="btn mini" onClick={() => intentarRef.current()}>☁️ Enviar ahora</button>}
          </div>;
        })()}
        {reportes.length > 0 && PANEL_LISTO && <div className="enviar-panel">
          {(() => { const p = reportes.filter(falta); return p.length
            ? <button className="btn" onClick={() => enviar(p)}>☁️ Enviar {p.length} mapeo{p.length > 1 ? 's' : ''} {listas.puenteUrl ? 'al Centro de Control' : 'al panel'}</button>
            : <button className="btn" onClick={() => enviar(reportes)}>☁️ Todo enviado · reenviar todo</button>; })()}
          {avisoEnvio}
        </div>}
        {reportes.length === 0 && <div className="vacio"><b>⛏️</b>Todavía no hay reportes.<br />Toque <b style={{ display: 'inline', fontSize: 'inherit' }}>+ Nuevo reporte</b> para empezar.</div>}
        <ul className="lista">
          {reportes.map(r => {
            const c = calcular(r);
            const t = c.rmrFinal != null ? TIPOS.find(x => x.tipo === tipoRoca(c.rmrFinal!)) : null;
            const foto = r.fotos?.find(f => f.zona === 'FRENTE') ?? r.fotos?.[0];
            return (
              <li key={r.id} onClick={() => setVista({ v: 'editor', r })} style={{ borderLeftColor: t?.color ?? 'var(--borde)' }}>
                {foto ? <img className="li-foto" src={foto.data} alt="" /> : <span className="li-foto vacia">📷</span>}
                <span className="li-txt"><b>{r.labor || 'Sin labor'}</b>{r.desde && <> · PK {r.desde}{r.hasta ? ` a ${r.hasta}` : ''}</>}<br />
                  <small>{[r.fecha, r.turno, `RMR ${c.rmrFinal ?? '—'}`].filter(Boolean).join(' · ')}</small><br />
                  <span className="chip" style={t ? { background: t.color, color: t.texto, borderColor: t.color } : {}}>{t ? `ST-${t.tipo}` : 'Sin tipo'}</span>
                  {!falta(r) && <span className="chip enviado">☁️ {listas.puenteUrl ? 'en el Centro' : 'enviado'}</span>}
                  {listas.puenteUrl && corregido(r) && <span className="chip enviado">✏️ corregido · sin enviar</span>}</span>
                <button className={confirmar === r.id ? 'btn mini peligro' : 'btn mini'} onClick={async e => {
                  e.stopPropagation();
                  if (confirmar !== r.id) { setConfirmar(r.id); setTimeout(() => setConfirmar(c => (c === r.id ? null : c)), 4000); return; }
                  setConfirmar(null);
                  try { await borrarReporte(r); recargar(); } catch (err) { setAviso((err as Error).message); }
                }}>{confirmar === r.id ? '¿Borrar? Toque otra vez' : '🗑'}</button>
              </li>
            );
          })}
        </ul>
        <button className="fab" onClick={() => setVista({ v: 'editor', r: { ...nuevoReporte(reportes[0], siguienteCorrelativo(reportes)), ...(!reportes[0]?.supervisor && listas.supervisores[0] ? { supervisor: listas.supervisores[0] } : {}) } })}>＋ Nuevo reporte</button>
      </main>
    </div>
  );
}

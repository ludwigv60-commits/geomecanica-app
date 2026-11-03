import { useEffect, useState } from 'react';
import { nuevoReporte, siguienteCorrelativo, LISTAS_INICIALES, type Listas, type Reporte } from '../model';
import { borrarReporte, guardarListas, guardarReporte, leerConfig, leerListas, listarReportes, marcarEnviado, pedirPersistencia } from '../store';
import { PANEL_LISTO, PANEL_URL, enviarMapeos } from '../export/envio';
import { Editor } from './Editor';
import { EditorListas } from './EditorListas';
import { TIPOS, tipoRoca } from '../core/rmr';
import { calcular } from '../calc';

type Vista = { v: 'lista' } | { v: 'editor'; r: Reporte } | { v: 'listas' };

export function App() {
  const [vista, setVista] = useState<Vista>({ v: 'lista' });
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [listas, setListas] = useState<Listas>(LISTAS_INICIALES);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [bd, setBd] = useState<Reporte[]>([]);   // historial importado de la BD de mapeos
  const recargarBd = () => leerConfig<Reporte[]>('historialBD').then(l => setBd(l ?? [])).catch(() => {});

  const recargar = () => listarReportes().then(setReportes);
  const [envio, setEnvio] = useState<string | null>(null);
  const pendiente = (r: Reporte) => !r.enviado || r.modificado > r.enviado;
  const enviar = async (lista: Reporte[]) => {
    if (!lista.length) return;
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
    recargar(); recargarBd(); leerListas().then(setListas); pedirPersistencia();
    // Deja listo en el celular todo lo necesario para exportar sin señal.
    const t = setTimeout(() => {
      import('../export/xlsx').catch(() => {}); import('../export/pdf').catch(() => {});
      fetch('./plantilla/formato.xlsx').catch(() => {}); fetch('./plantilla/formato.pdf').catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  if (vista.v === 'editor') return (
    <Editor inicial={vista.r} listas={listas} historial={[...reportes, ...bd]}
      onGuardar={async r => { await guardarReporte(r); await recargar(); }}
      onSalir={() => { recargar(); setVista({ v: 'lista' }); }} onBase={recargarBd}
      onEnviar={!PANEL_LISTO ? undefined : async r => { await guardarReporte(r); const l = await listarReportes(); await enviar(l.filter(x => x.id === r.id)); }} />
  );
  if (vista.v === 'listas') return (
    <EditorListas listas={listas} historialBD={bd.length} onHistorial={recargarBd} onGuardar={async l => { await guardarListas(l); setListas(l); setVista({ v: 'lista' }); }}
      onCancelar={() => setVista({ v: 'lista' })} />
  );

  return (
    <div className="pantalla">
      <header className="portada">
        <button className="ajustes" aria-label="Editar listas" onClick={() => setVista({ v: 'listas' })}>⚙️</button>
        <small>JUSTA · PRT-JS-CLD-16</small>
        <h1>Indicación Geomecánica</h1>
        <p>{reportes.length ? `${reportes.length} reporte${reportes.length > 1 ? 's' : ''} en este celular` : 'Mapeo RMR · Q · sostenimiento'}</p>
      </header>
      <main className="contenido">
        {aviso && <p className="alerta" onClick={() => setAviso(null)}>{aviso}</p>}
        {reportes.length > 0 && PANEL_LISTO && <div className="enviar-panel">
          {(() => { const p = reportes.filter(pendiente); return p.length
            ? <button className="btn" onClick={() => enviar(p)}>☁️ Enviar {p.length} mapeo{p.length > 1 ? 's' : ''} al panel</button>
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
                  {!pendiente(r) && <span className="chip enviado">☁️ enviado</span>}</span>
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

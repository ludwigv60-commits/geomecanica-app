import { useEffect, useState } from 'react';
import { nuevoReporte, LISTAS_INICIALES, type Listas, type Reporte } from '../model';
import { borrarReporte, guardarListas, guardarReporte, leerListas, listarReportes, pedirPersistencia } from '../store';
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

  const recargar = () => listarReportes().then(setReportes);
  useEffect(() => {
    recargar(); leerListas().then(setListas); pedirPersistencia();
    // Deja listo en el celular todo lo necesario para exportar sin señal.
    const t = setTimeout(() => {
      import('../export/xlsx').catch(() => {}); import('../export/pdf').catch(() => {});
      fetch('./plantilla/formato.xlsx').catch(() => {}); fetch('./plantilla/formato.pdf').catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  if (vista.v === 'editor') return (
    <Editor inicial={vista.r} listas={listas}
      onGuardar={async r => { await guardarReporte(r); await recargar(); }}
      onSalir={() => { recargar(); setVista({ v: 'lista' }); }} />
  );
  if (vista.v === 'listas') return (
    <EditorListas listas={listas} onGuardar={async l => { await guardarListas(l); setListas(l); setVista({ v: 'lista' }); }}
      onCancelar={() => setVista({ v: 'lista' })} />
  );

  return (
    <div className="pantalla">
      <header className="barra"><h1>Indicación Geomecánica</h1><span className="sub">PRT-JS-CLD-16 · sin señal</span></header>
      <main className="contenido">
        <button className="btn primario grande" onClick={() => setVista({ v: 'editor', r: nuevoReporte(reportes[0]) })}>+ Nuevo reporte</button>
        {aviso && <p className="alerta" onClick={() => setAviso(null)}>{aviso}</p>}
        <h2>Reportes en este celular</h2>
        {reportes.length === 0 && <p className="tenue">Todavía no hay reportes.</p>}
        <ul className="lista">
          {reportes.map(r => {
            const c = calcular(r);
            const t = c.rmrFinal != null ? TIPOS.find(x => x.tipo === tipoRoca(c.rmrFinal!)) : null;
            return (
              <li key={r.id} onClick={() => setVista({ v: 'editor', r })}>
                <span className="chip" style={t ? { background: t.color, color: t.texto } : {}}>{t ? `ST-${t.tipo}` : '—'}</span>
                <span className="li-txt"><b>{r.labor || 'Sin labor'}</b> {r.desde && `· ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''}`}<br />
                  <small>{r.fecha} {r.turno} · RMR {c.rmrFinal ?? '—'} · {r.sincronizado ? 'sincronizado' : 'solo en este celular'}</small></span>
                <button className="btn mini" onClick={async e => {
                  e.stopPropagation();
                  try { await borrarReporte(r); recargar(); } catch (err) { setAviso((err as Error).message); }
                }}>Borrar</button>
              </li>
            );
          })}
        </ul>
        <button className="btn" onClick={() => setVista({ v: 'listas' })}>Editar listas (labores, supervisores, litologías, riesgo)</button>
      </main>
    </div>
  );
}

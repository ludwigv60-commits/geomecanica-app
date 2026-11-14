import { useEffect, useRef, useState } from 'react';
import { Editor, descargarPdf } from './Editor';
import { calcular, nuevoMapeo, type Mapeo } from './model';
import { borrar, guardar, guardarConfig, leerConfig, listar, persistir, type Config } from './store';
import { aCsv, importarRespaldo, respaldo } from './exportar';

export function App() {
  const [lista, setLista] = useState<Mapeo[]>([]);
  const [actual, setActual] = useState<Mapeo | null>(null);
  const [cfg, setCfg] = useState<Config>({ declinacion: 0 });
  const [ajustes, setAjustes] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>();

  const recargar = async () => setLista(await listar());
  useEffect(() => { recargar(); leerConfig().then(setCfg); persistir(); }, []);
  // guardado automático
  useEffect(() => {
    if (!actual) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { guardar(actual).catch(e => setMsg('No se pudo guardar: ' + (e as Error).message)); }, 400);
  }, [actual]);

  if (actual) return <Editor m={actual} set={f => setActual(p => p && f(p))} decl={cfg.declinacion}
    labores={[...new Set(lista.map(x => x.labor).filter(Boolean))]}
    onVolver={async () => { clearTimeout(timer.current); await guardar(actual); setActual(null); recargar(); }} />;

  const bajar = (nombre: string, contenido: BlobPart, tipo: string) => {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <div className="pantalla">
      <header className="barra">
        <h1>Aplicativo Geomecánico Libre<div className="sub">Mapeo RMR · sostenimiento por cartilla</div></h1>
        <button className="btn mini claro" onClick={() => setAjustes(!ajustes)} aria-label="Ajustes">⚙</button>
      </header>
      <main className="contenido">
        {ajustes && <div className="tarjeta">
          <h3>Ajustes</h3>
          <label className="campo"><span>Declinación magnética (°, verdadero = magnético + declinación)</span>
            <input inputMode="decimal" value={cfg.declinacion} onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); const n = { declinacion: Number.isFinite(v) ? v : 0 }; setCfg(n); guardarConfig(n); }} /></label>
          <div className="fila-btn" style={{ marginTop: 10 }}>
            <button className="btn mini" onClick={() => bajar(`mapeos_${new Date().toISOString().slice(0, 10)}.csv`, aCsv(lista), 'text/csv;charset=utf-8')} disabled={!lista.length}>Tabla Excel (CSV)</button>
            <button className="btn mini" onClick={() => bajar(`respaldo_mapeos_${new Date().toISOString().slice(0, 10)}.json`, respaldo(lista), 'application/json')} disabled={!lista.length}>Respaldo</button>
            <label className="btn mini">Restaurar respaldo<input type="file" accept=".json,application/json" hidden onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try { const n = await importarRespaldo(await f.text(), guardar); setMsg(`${n} mapeo(s) restaurados.`); recargar(); } catch (er) { setMsg('Archivo no válido: ' + (er as Error).message); }
            }} /></label>
          </div>
          <p className="tenue">Los mapeos se guardan solo en este equipo. Use «Respaldo» para pasarlos a otro celular o guardarlos.</p>
        </div>}
        <button className="btn primario grande" onClick={() => { const m = nuevoMapeo(lista[0]); setActual(m); }}>+ Nuevo mapeo</button>
        {msg && <p className="ok" onClick={() => setMsg(null)}>{msg}</p>}
        {!lista.length && <p className="tenue">Todavía no hay mapeos. Toque «Nuevo mapeo» para empezar.</p>}
        <ul className="lista">
          {lista.map(m => {
            const c = calcular(m); const k = c.rec?.clase;
            return <li key={m.id}>
              <div className="li-txt" onClick={() => setActual(m)}>
                <b>{m.labor || 'Sin labor'}</b> <span className="tenue">{m.desde && `${m.desde}–${m.hasta} m`}</span>
                <div className="tenue">{m.fecha} {m.hora} · {m.fotos.length} foto(s){c.sostenimiento && ` · ${c.sostenimiento}`}</div>
              </div>
              {k && <span className="chip" style={{ background: k.color, color: k.texto, borderColor: k.color }}>{k.tipo}<br />{c.rmr}</span>}
              <button className="btn mini" onClick={() => descargarPdf(m, false)} aria-label="PDF">PDF</button>
              <button className="btn mini" onClick={async () => { if (confirm(`¿Borrar el mapeo ${m.labor} ${m.fecha}?`)) { await borrar(m.id); recargar(); } }} aria-label="Borrar">🗑</button>
            </li>;
          })}
        </ul>
      </main>
    </div>
  );
}

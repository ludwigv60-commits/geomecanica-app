import { NumIn } from './NumIn';
import { useState } from 'react';
import type { Listas } from '../model';
import { guardarConfig } from '../store';

const NOMBRES: Record<'labores' | 'supervisores' | 'litologias' | 'riesgos', string> = { labores: 'Labores', supervisores: 'Supervisores de geomecánica', litologias: 'Litologías', riesgos: 'Niveles de riesgo' };

export function EditorListas({ listas, historialBD = 0, onHistorial, onGuardar, onCancelar }: { listas: Listas; historialBD?: number; onHistorial?: () => void; onGuardar: (l: Listas) => void; onCancelar: () => void }) {
  const [l, setL] = useState<Listas>(structuredClone(listas));
  const [msgBd, setMsgBd] = useState<string | null>(null);
  const importar = async (f: File | undefined) => {
    if (!f) return;
    setMsgBd('Leyendo…');
    try {
      const { leerHoja, desdeFilas } = await import('../ia/historial-bd');
      const rs = desdeFilas(await leerHoja(await f.arrayBuffer()));
      if (!rs.length) throw new Error('No encontré mapeos en el archivo.');
      await guardarConfig('historialBD', rs); onHistorial?.();
      const lab = new Set(rs.map(r => r.labor)).size, fechas = rs.map(r => r.fecha).filter(Boolean).sort();
      setMsgBd(`Listo: ${rs.length} mapeos de ${lab} labores (${fechas[0] ?? '?'} a ${fechas.at(-1) ?? '?'}). Quedan solo en este celular.`);
    } catch (e) { setMsgBd(`No se pudo leer: ${(e as Error).message}`); }
  };
  return (
    <div className="pantalla">
      <header className="barra"><h1>Listas</h1></header>
      <main className="contenido">
        {(Object.keys(NOMBRES) as (keyof typeof NOMBRES)[]).map(k => (
          <section key={k} className="tarjeta">
            <h3>{NOMBRES[k]}</h3>
            {l[k].map((v, i) => (
              <div key={i} className="fila">
                <input value={v} onChange={e => { const n = [...l[k]]; n[i] = e.target.value; setL({ ...l, [k]: n }); }} />
                <button className="btn mini" onClick={() => setL({ ...l, [k]: l[k].filter((_, j) => j !== i) })}>Quitar</button>
              </div>
            ))}
            <button className="btn mini" onClick={() => setL({ ...l, [k]: [...l[k], ''] })}>+ Agregar</button>
          </section>
        ))}
        <section className="tarjeta">
          <h3>Historial de mapeos</h3>
          <p className="ayuda">Importe su base de mapeos (por ejemplo BD_Mapeos_Geomecanicos.xlsx). La IA propone con ella los valores habituales de cada labor: tipo de roca, parámetros RMR y Q, y las familias del mapeo anterior. El archivo no sale del celular.</p>
          <p>{historialBD ? `${historialBD} mapeos importados.` : 'Sin historial importado.'}</p>
          <label className="btn mini">📥 Importar .xlsx<input type="file" accept=".xlsx" hidden onChange={e => importar(e.target.files?.[0])} /></label>
          {historialBD > 0 && <button className="btn mini" onClick={async () => { await guardarConfig('historialBD', []); onHistorial?.(); setMsgBd('Historial quitado.'); }}>Quitar historial</button>}
          {msgBd && <p className="ayuda">{msgBd}</p>}
        </section>
        <section className="tarjeta">
          <h3>Brújula</h3>
          <div className="rejilla2">
            <label className="campo"><span>Declinación magnética (°)</span><NumIn signo valor={l.declinacion} on={v => setL({ ...l, declinacion: v ?? 0 })} /></label>
            <label className="campo"><span>Convergencia UTM (°)</span><NumIn signo valor={l.convergencia} on={v => setL({ ...l, convergencia: v ?? 0 })} /></label>
          </div>
        </section>
      </main>
      <footer className="pie">
        <button className="btn" onClick={onCancelar}>Cancelar</button>
        <button className="btn primario" onClick={() => onGuardar(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Array.isArray(v) ? v.map(s => s.trim()).filter(Boolean) : v])) as unknown as Listas)}>Guardar</button>
      </footer>
    </div>
  );
}

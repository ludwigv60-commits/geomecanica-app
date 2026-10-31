import { useState } from 'react';
import type { Listas } from '../model';

const NOMBRES: Record<keyof Listas, string> = { labores: 'Labores', supervisores: 'Supervisores de geomecánica', litologias: 'Litologías', riesgos: 'Niveles de riesgo' };

export function EditorListas({ listas, onGuardar, onCancelar }: { listas: Listas; onGuardar: (l: Listas) => void; onCancelar: () => void }) {
  const [l, setL] = useState<Listas>(structuredClone(listas));
  return (
    <div className="pantalla">
      <header className="barra"><h1>Listas</h1></header>
      <main className="contenido">
        {(Object.keys(NOMBRES) as (keyof Listas)[]).map(k => (
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
      </main>
      <footer className="pie">
        <button className="btn" onClick={onCancelar}>Cancelar</button>
        <button className="btn primario" onClick={() => onGuardar(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, (v as string[]).map(s => s.trim()).filter(Boolean)])) as unknown as Listas)}>Guardar</button>
      </footer>
    </div>
  );
}

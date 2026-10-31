import { useEffect, useMemo, useRef, useState } from 'react';
import { ABREVS, ITEMS_VERIF, type Listas, type Reporte, type Verif } from '../model';
import { AJUSTES_ORIENTACION, NOMBRE_ZONA, PARAMETROS, TIPOS, ZONAS, type ParamId, type Zona } from '../core/rmr';
import { JA, JN, JR, JW, SRF, claseQ, type OpcionQ } from '../core/q';
import { calcular } from '../calc';

const PASOS = ['Cabecera', 'RMR', 'RQD y Q', 'Litología y estructuras', 'Condición', 'Sostenimiento', 'Firmas', 'Resumen'];

type Props = { inicial: Reporte; listas: Listas; onGuardar: (r: Reporte) => Promise<void>; onSalir: () => void };

export function Editor({ inicial, listas, onGuardar, onSalir }: Props) {
  const [r, setR] = useState<Reporte>(inicial);
  const [paso, setPaso] = useState(0);
  const [mismoEnZonas, setMismo] = useState(true);
  const [estado, setEstado] = useState('Guardado');
  const c = useMemo(() => calcular(r), [r]);
  const primera = useRef(true);

  // Autoguardado: cada cambio se escribe en el celular a los 400 ms.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setEstado('Guardando…');
    const t = setTimeout(() => onGuardar(r).then(() => setEstado('Guardado en el celular')), 400);
    return () => clearTimeout(t);
  }, [r]);

  const set = <K extends keyof Reporte>(k: K, v: Reporte[K]) => setR(p => ({ ...p, [k]: v }));
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const ponerRmr = (z: Zona, id: ParamId, v: number) => setR(p => {
    const zs = mismoEnZonas ? ZONAS : [z];
    const rmr = { ...p.rmr };
    for (const zz of zs) rmr[zz] = { ...rmr[zz], [id]: v };
    return { ...p, rmr };
  });
  const ponerAjuste = (z: Zona, v: number) => setR(p => {
    const a = { ...p.ajuste };
    for (const zz of mismoEnZonas ? ZONAS : [z]) a[zz] = v;
    return { ...p, ajuste: a };
  });
  const ponerQ = (z: Zona, k: 'jn' | 'jr' | 'ja' | 'jw' | 'srf', v: number) => setR(p => {
    const q = { ...p.q };
    for (const zz of mismoEnZonas ? ZONAS : [z]) q[zz] = { ...q[zz], [k]: v };
    return { ...p, q };
  });

  const toggleZonas = (
    <label className="interruptor"><input type="checkbox" checked={mismoEnZonas} onChange={e => setMismo(e.target.checked)} />
      Mismo valor en H.I., Corona y H.D.</label>
  );

  return (
    <div className="pantalla">
      <header className="barra">
        <button className="btn mini claro" onClick={onSalir}>‹ Reportes</button>
        <h1>{PASOS[paso]}</h1><span className="sub">{estado}</span>
      </header>
      <nav className="pasos">{PASOS.map((p, i) => <button key={p} className={i === paso ? 'activo' : ''} onClick={() => setPaso(i)}>{i + 1}</button>)}</nav>
      <main className="contenido">

        {paso === 0 && <>
          <Campo t="Labor"><Lista valor={r.labor} opciones={listas.labores} on={v => set('labor', v)} /></Campo>
          <Campo t="Sup. de geomecánica"><Lista valor={r.supervisor} opciones={listas.supervisores} on={v => set('supervisor', v)} /></Campo>
          <div className="rejilla2">
            <Campo t="Fecha"><input type="date" value={r.fecha} onChange={e => set('fecha', e.target.value)} /></Campo>
            <Campo t="Turno"><Segmentos valor={r.turno} opciones={['Día', 'Noche']} on={v => set('turno', v as Reporte['turno'])} /></Campo>
            <Campo t="Desde (PK)"><input inputMode="decimal" placeholder="0+924.7" value={r.desde} onChange={e => set('desde', e.target.value)} /></Campo>
            <Campo t="Hasta (PK)"><input inputMode="decimal" placeholder="0+928.7" value={r.hasta} onChange={e => set('hasta', e.target.value)} /></Campo>
            <Campo t="Avance (m), de topografía"><input inputMode="decimal" value={r.avance ?? ''} onChange={e => set('avance', num(e.target.value))} /></Campo>
            <Campo t="Azimut (°) UTM"><input inputMode="decimal" value={r.azimut ?? ''} onChange={e => set('azimut', num(e.target.value))} /></Campo>
            <Campo t="Ancho (m)"><input inputMode="decimal" value={r.ancho ?? ''} onChange={e => set('ancho', num(e.target.value))} /></Campo>
            <Campo t="Alto (m)"><input inputMode="decimal" value={r.alto ?? ''} onChange={e => set('alto', num(e.target.value))} /></Campo>
          </div>
          <Campo t="Nivel de riesgo"><Segmentos valor={r.nivelRiesgo} opciones={listas.riesgos} on={v => set('nivelRiesgo', v)} /></Campo>
          <Campo t="N° correlativo"><input value={r.correlativo} onChange={e => set('correlativo', e.target.value)} /></Campo>
        </>}

        {paso === 1 && <>
          {toggleZonas}
          {PARAMETROS.map(par => (
            <section key={par.id} className="tarjeta">
              <h3>{par.nombre}{par.id === 'rqd' && c.puntajeRqdSugerido != null && <span className="sugerido"> Sugerido por la app: {c.puntajeRqdSugerido} (RQD {c.rqd}%)</span>}</h3>
              {(mismoEnZonas ? (['CORONA'] as Zona[]) : ZONAS).map(z => (
                <div key={z}>
                  {!mismoEnZonas && <div className="zona">{NOMBRE_ZONA[z]}</div>}
                  <div className="opciones">
                    {par.clases.map(cl => (
                      <button key={cl.etiqueta} className={r.rmr[z][par.id] === cl.puntaje ? 'opcion sel' : 'opcion'} onClick={() => ponerRmr(z, par.id, cl.puntaje)}>
                        {cl.etiqueta} <b>({cl.puntaje})</b></button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
          <section className="tarjeta">
            <h3>Ajuste por orientación</h3>
            {c.ajusteIA && <p className="sugerido">Sugerido por la app: {c.ajusteIA.calificacion} ({c.ajusteIA.ajuste}). {c.ajusteIA.explicacion} Gobierna {c.ajusteIA.gobierna.dip}°/{String(c.ajusteIA.gobierna.dipdir).padStart(3, '0')}°.</p>}
            {(mismoEnZonas ? (['CORONA'] as Zona[]) : ZONAS).map(z => (
              <div key={z}>{!mismoEnZonas && <div className="zona">{NOMBRE_ZONA[z]}</div>}
                <div className="opciones">{AJUSTES_ORIENTACION.map(a => (
                  <button key={a.etiqueta} className={r.ajuste[z] === a.puntaje ? 'opcion sel' : 'opcion'} onClick={() => ponerAjuste(z, a.puntaje)}>{a.etiqueta} <b>({a.puntaje})</b></button>
                ))}</div></div>
            ))}
          </section>
          <TablaRmr c={c} />
        </>}

        {paso === 2 && <>
          <section className="tarjeta">
            <h3>Cálculo de RQD · RQD = 115 − 3.3·Jv</h3>
            <div className="rejilla2">
              <Campo t="N° fracturas por m³ (Jv)"><input inputMode="decimal" value={r.jv ?? ''} onChange={e => set('jv', num(e.target.value))} /></Campo>
              <Campo t="RQD (%)"><output className="resultado">{c.rqd ?? '—'}</output></Campo>
            </div>
          </section>
          {toggleZonas}
          {([['jn', 'Número de discontinuidades (Jn)', JN], ['jr', 'Número de rugosidad (Jr)', JR], ['ja', 'Número de alteración (Ja)', JA], ['jw', 'Agua subterránea (Jw)', JW]] as const).map(([k, t, ops]) => (
            <SelectorQ key={k} titulo={t} opciones={ops} r={r} mismo={mismoEnZonas} k={k} on={ponerQ} />
          ))}
          <SelectorQ titulo="Factor de reducción de esfuerzos (SRF)" opciones={SRF.flatMap(g => g.opciones.map(o => ({ ...o, texto: `${g.grupo}: ${o.texto}` })))} r={r} mismo={mismoEnZonas} k="srf" on={ponerQ} />
          <section className="tarjeta">
            <h3>Q = (RQD/Jn)·(Jr/Ja)·(Jw/SRF)</h3>
            <div className="tres">{ZONAS.map(z => <div key={z}><small>{NOMBRE_ZONA[z]}</small><b>{c.zonas[z].q ?? '—'}</b><small>{c.zonas[z].q != null ? claseQ(c.zonas[z].q!) : ''}</small></div>)}</div>
            {ZONAS.map(z => c.zonas[z].control?.alerta && <p key={z} className="alerta">{NOMBRE_ZONA[z]}: {c.zonas[z].control!.alerta}</p>)}
          </section>
        </>}

        {paso === 3 && <>
          <section className="tarjeta">
            <h3>Litología</h3>
            {ZONAS.map(z => <Campo key={z} t={NOMBRE_ZONA[z]}><Lista valor={r.litologia[z]} opciones={listas.litologias}
              on={v => setR(p => ({ ...p, litologia: mismoEnZonas ? { HI: v, CORONA: v, HD: v } : { ...p.litologia, [z]: v } }))} /></Campo>)}
          </section>
          <section className="tarjeta">
            <h3>Estructuras (máx. 5)</h3>
            <p className="tenue">SD sistema de diaclasas · F falla · V veta · C contacto. Dip y dip direction en grados.</p>
            {r.familias.map((f, i) => (
              <div key={i} className="fila">
                <span className="n">{i + 1}</span>
                <select value={f.abrev} onChange={e => set('familias', r.familias.map((x, j) => j === i ? { ...x, abrev: e.target.value } : x))}>
                  {ABREVS.map(a => <option key={a}>{a}</option>)}</select>
                <input inputMode="decimal" placeholder="Dip" value={f.dip ?? ''} onChange={e => set('familias', r.familias.map((x, j) => j === i ? { ...x, dip: num(e.target.value) } : x))} />
                <input inputMode="decimal" placeholder="D/D" value={f.dipdir ?? ''} onChange={e => set('familias', r.familias.map((x, j) => j === i ? { ...x, dipdir: num(e.target.value) } : x))} />
                <button className="btn mini" onClick={() => set('familias', r.familias.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {r.familias.length < 5 && <button className="btn mini" onClick={() => set('familias', [...r.familias, { abrev: 'SD', dip: null, dipdir: null }])}>+ Familia</button>}
            <p className="tenue">La medición con el celular y el dibujo de trazas sobre la foto llegan en la Fase 1B.</p>
          </section>
        </>}

        {paso === 4 && <>
          <Campo t="Condición geomecánica"><textarea rows={4} value={r.condicion} onChange={e => set('condicion', e.target.value)} /></Campo>
          <section className="tarjeta">
            <h3>Verificación de sostenimiento anterior</h3>
            {ITEMS_VERIF.map(it => (
              <div key={it} className="fila"><span className="etq">{it}</span>
                <Segmentos valor={r.verificacion[it]} opciones={['CUMPLE', 'NO CUMPLE', 'NO APLICA']}
                  on={v => set('verificacion', { ...r.verificacion, [it]: v as Verif })} /></div>
            ))}
          </section>
          <Campo t="Observaciones"><textarea rows={3} value={r.observaciones} onChange={e => set('observaciones', e.target.value)} /></Campo>
        </>}

        {paso === 5 && <>
          <TablaRmr c={c} />
          {c.diseno?.alerta && <p className="alerta">{c.diseno.alerta}</p>}
          <Campo t="RMR de diseño (vacío = el calculado)">
            <input inputMode="decimal" placeholder={String(c.diseno?.rmr ?? '')} value={r.rmrDisenoManual ?? ''} onChange={e => set('rmrDisenoManual', num(e.target.value))} /></Campo>
          {c.propuesta && <section className="tarjeta">
            <h3>Propuesta según Systra (sección 5.0×5.0) <span className="sugerido">Sugerido por la app</span></h3>
            <ul>{c.propuesta.lineas.map(l => <li key={l}>{l}</li>)}</ul>
            {c.propuesta.filas != null && <p className="tenue">Con {r.avance} m de avance salen {c.propuesta.filas} filas.</p>}
            <label className="interruptor"><input type="checkbox" checked={r.ordenFilas === 'mayorPrimero'} onChange={e => set('ordenFilas', e.target.checked ? 'mayorPrimero' : 'menorPrimero')} /> Escribir filas mayor primero (11x10)</label>
            <button className="btn primario" onClick={() => set('sostenimiento', [...c.propuesta!.lineas])}>Usar esta propuesta</button>
          </section>}
          <section className="tarjeta">
            <h3>Indicaciones de sostenimiento (lo que va al formato)</h3>
            {r.sostenimiento.map((l, i) => (
              <div key={i} className="fila"><input value={l} onChange={e => set('sostenimiento', r.sostenimiento.map((x, j) => j === i ? e.target.value : x))} />
                <button className="btn mini" onClick={() => set('sostenimiento', r.sostenimiento.filter((_, j) => j !== i))}>×</button></div>
            ))}
            <button className="btn mini" onClick={() => set('sostenimiento', [...r.sostenimiento, ''])}>+ Línea</button>
          </section>
        </>}

        {paso === 6 && <>
          <section className="tarjeta">
            <h3>Indicaciones adicionales</h3>
            {r.adicionales.map((a, i) => (
              <div key={i} className="bloque">
                <div className="rejilla2">
                  <input type="date" value={a.fecha} onChange={e => set('adicionales', r.adicionales.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x))} />
                  <input type="time" value={a.hora} onChange={e => set('adicionales', r.adicionales.map((x, j) => j === i ? { ...x, hora: e.target.value } : x))} />
                </div>
                <input placeholder="Nombre y apellidos" value={a.nombre} onChange={e => set('adicionales', r.adicionales.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                <textarea rows={2} placeholder="Indicación" value={a.indicacion} onChange={e => set('adicionales', r.adicionales.map((x, j) => j === i ? { ...x, indicacion: e.target.value } : x))} />
                <button className="btn mini" onClick={() => set('adicionales', r.adicionales.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            {r.adicionales.length < 2 && <button className="btn mini" onClick={() => set('adicionales', [...r.adicionales, { fecha: r.fecha, hora: '', nombre: '', indicacion: '' }])}>+ Indicación</button>}
          </section>
          <section className="tarjeta">
            <h3>Firmas</h3>
            {r.firmas.map((f, i) => (
              <div key={f.rol} className="bloque"><small>{f.rol}</small>
                <div className="rejilla2">
                  <input placeholder="Nombre" value={f.nombre} onChange={e => set('firmas', r.firmas.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                  <input type="date" value={f.fecha} onChange={e => set('firmas', r.firmas.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x))} />
                </div></div>
            ))}
            <p className="tenue">La firma dibujada con el dedo se agrega con la exportación a PDF.</p>
          </section>
        </>}

        {paso === 7 && <Resumen r={r} c={c} />}
      </main>
      <footer className="pie">
        <button className="btn" disabled={paso === 0} onClick={() => setPaso(paso - 1)}>‹ Anterior</button>
        <button className="btn primario" disabled={paso === PASOS.length - 1} onClick={() => setPaso(paso + 1)}>Siguiente ›</button>
      </footer>
    </div>
  );
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="campo"><span>{t}</span>{children}</label>;
}
function Lista({ valor, opciones, on }: { valor: string; opciones: string[]; on: (v: string) => void }) {
  const id = useMemo(() => 'l' + Math.random().toString(36).slice(2), []);
  return <><input list={id} value={valor} onChange={e => on(e.target.value)} /><datalist id={id}>{opciones.map(o => <option key={o} value={o} />)}</datalist></>;
}
function Segmentos({ valor, opciones, on }: { valor: string; opciones: string[]; on: (v: string) => void }) {
  return <div className="segmentos">{opciones.map(o => <button key={o} type="button" className={valor === o ? 'sel' : ''} onClick={() => on(valor === o ? '' : o)}>{o}</button>)}</div>;
}
function SelectorQ({ titulo, opciones, r, mismo, k, on }: { titulo: string; opciones: readonly OpcionQ[]; r: Reporte; mismo: boolean; k: 'jn' | 'jr' | 'ja' | 'jw' | 'srf'; on: (z: Zona, k: 'jn' | 'jr' | 'ja' | 'jw' | 'srf', v: number) => void }) {
  return (
    <section className="tarjeta"><h3>{titulo}</h3>
      {(mismo ? (['CORONA'] as Zona[]) : ZONAS).map(z => (
        <div key={z} className="fila">
          {!mismo && <span className="etq">{NOMBRE_ZONA[z]}</span>}
          <select value={r.q[z][k] ?? ''} onChange={e => on(z, k, Number(e.target.value))}>
            <option value="">—</option>
            {opciones.map((o, i) => <option key={i} value={o.valor}>{o.valor} · {o.texto}{o.rango ? ` (${o.rango[0]}–${o.rango[1]})` : ''}</option>)}
          </select>
          <input className="corto" inputMode="decimal" value={r.q[z][k] ?? ''} onChange={e => e.target.value !== '' && on(z, k, Number(e.target.value.replace(',', '.')))} />
        </div>
      ))}
    </section>
  );
}
function TablaRmr({ c }: { c: ReturnType<typeof calcular> }) {
  return (
    <section className="tarjeta">
      <div className="tres">{ZONAS.map(z => {
        const t = TIPOS.find(x => x.tipo === c.zonas[z].tipo);
        return <div key={z} style={t ? { background: t.color, color: t.texto } : {}}><small>{NOMBRE_ZONA[z]}</small>
          <b>{c.zonas[z].total ?? '—'}</b><small>básico {c.zonas[z].basico ?? '—'}{t ? ` · ST-${t.tipo}` : ''}</small></div>;
      })}</div>
    </section>
  );
}
function Resumen({ r, c }: { r: Reporte; c: ReturnType<typeof calcular> }) {
  const faltan: string[] = [];
  if (!r.labor) faltan.push('labor');
  if (r.avance == null) faltan.push('avance');
  if (r.azimut == null) faltan.push('azimut');
  ZONAS.forEach(z => c.zonas[z].total == null && faltan.push(`RMR ${NOMBRE_ZONA[z]}`));
  if (r.jv == null) faltan.push('Jv');
  ZONAS.forEach(z => c.zonas[z].q == null && faltan.push(`Q ${NOMBRE_ZONA[z]}`));
  if (!r.sostenimiento.length) faltan.push('indicaciones de sostenimiento');
  return (
    <>
      {faltan.length ? <p className="alerta">Falta: {faltan.join(', ')}.</p> : <p className="ok">Formato completo.</p>}
      <TablaRmr c={c} />
      <section className="tarjeta">
        <p><b>{r.labor}</b>{r.desde && ` · ${r.desde}${r.hasta ? ` a ${r.hasta}` : ''}`} · avance {r.avance ?? '—'} m · azimut {r.azimut ?? '—'}°</p>
        <p>RQD {c.rqd ?? '—'}% · Q {ZONAS.map(z => c.zonas[z].q ?? '—').join(' / ')}</p>
        <p>RMR de diseño {c.rmrFinal ?? '—'} → ST-{c.tipoFinal ?? '—'}</p>
        <ul>{r.sostenimiento.map(l => <li key={l}>{l}</li>)}</ul>
      </section>
      <p className="tenue">La descarga en Excel y PDF del formato oficial es el siguiente paso de la Fase 1A.</p>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ABREVS, ITEMS_VERIF, migrar, type Listas, type Reporte, type Verif } from '../model';
import { AJUSTES_ORIENTACION, NOMBRE_ZONA, PARAMETROS, TIPOS, ZONAS, type ParamId, type Zona } from '../core/rmr';
import { JA, JN, JR, JW, SRF, claseQ, type OpcionQ } from '../core/q';
import { calcular } from '../calc';
import { FotoIA } from './FotoIA';
import { Medidor } from './Medidor';
import { consejos } from '../ia/sugerencias';
import { redactarCondicion } from '../ia/redaccion';
import { textoFamilia } from '../ia/anotacion';
import { entregar, nombreArchivo, MIME_PDF, MIME_XLSX } from '../export/compartir';
import { aSvg, vistaPlanta, vistaSeccion } from '../export/croquis';


type Props = { inicial: Reporte; listas: Listas; historial: Reporte[]; onGuardar: (r: Reporte) => Promise<void>; onSalir: () => void };

export function Editor({ inicial, listas, historial, onGuardar, onSalir }: Props) {
  const [midiendo, setMidiendo] = useState<number | null>(null);
  const [enCadena, setEnCadena] = useState(false); // medir pendientes en orden
  const [r, setR] = useState<Reporte>(() => migrar(inicial));
  const [abierta, setAbierta] = useState<string | null>(inicial.labor ? null : 'cab');
  const [mismoEnZonas, setMismo] = useState(true);
  const [estado, setEstado] = useState('Guardado');
  const c = useMemo(() => calcular(r), [r]);
  const avisos = useMemo(() => consejos(r, c, historial), [r, c, historial]);
  const primera = useRef(true);

  // Autoguardado: cada cambio se escribe en el celular a los 400 ms.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setEstado('Guardando…');
    const t = setTimeout(() => onGuardar(r).then(() => setEstado('Guardado en el celular')), 400);
    return () => clearTimeout(t);
  }, [r]);

  const quitar = (p: Reporte, clave: string) => (p.sugeridos?.includes(clave) ? p.sugeridos.filter(x => x !== clave) : p.sugeridos);
  const set = <K extends keyof Reporte>(k: K, v: Reporte[K]) => setR(p => ({ ...p, [k]: v, sugeridos: quitar(p, String(k)) }));
  const sug = (clave: string) => (r.sugeridos?.includes(clave) ? ' sug' : '');
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const ponerRmr = (z: Zona, id: ParamId, v: number) => setR(p => {
    const zs = mismoEnZonas ? ZONAS : [z];
    const rmr = { ...p.rmr };
    for (const zz of zs) rmr[zz] = { ...rmr[zz], [id]: v };
    return { ...p, rmr, sugeridos: quitar(p, `rmr.${id}`) };
  });
  const ponerAjuste = (z: Zona, v: number) => setR(p => {
    const a = { ...p.ajuste };
    for (const zz of mismoEnZonas ? ZONAS : [z]) a[zz] = v;
    return { ...p, ajuste: a, sugeridos: quitar(p, 'ajuste') };
  });
  const ponerQ = (z: Zona, k: 'jn' | 'jr' | 'ja' | 'jw' | 'srf', v: number) => setR(p => {
    const q = { ...p.q };
    for (const zz of mismoEnZonas ? ZONAS : [z]) q[zz] = { ...q[zz], [k]: v };
    return { ...p, q, sugeridos: quitar(p, `q.${k}`) };
  });

  const listo = {
    cab: !!(r.labor && r.desde && r.avance != null && r.azimut != null),
    fotos: (r.fotos ?? []).some(f => f.zona === 'FRENTE'),
    rmr: ZONAS.every(z => c.zonas[z].total != null),
    q: ZONAS.every(z => c.zonas[z].q != null),
    est: r.familias.length > 0 && r.familias.every(f => f.dip != null && f.dipdir != null) && ZONAS.every(z => !!r.litologia[z]),
    cond: !!r.condicion.trim(),
    sos: r.sostenimiento.length > 0,
    fir: r.firmas.some(f => f.nombre),
  };
  const hechos = Object.values(listo).filter(Boolean).length, totalPasos = Object.keys(listo).length;
  const ir = (id: string) => { setAbierta(id); setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const cols = mismoEnZonas ? 'minmax(0,1.3fr) minmax(0,1fr)' : 'minmax(0,1.1fr) repeat(3, minmax(0,1fr))';
  const toggleZonas = (
    <label className="interruptor"><input type="checkbox" checked={mismoEnZonas} onChange={e => setMismo(e.target.checked)} />
      Mismo valor en H.I., Corona y H.D.</label>
  );

  const quitarFamilia = (i: number) => setR(p => ({
    ...p, familias: p.familias.filter((_, j) => j !== i),
    // Las trazas de esa estructura se borran y las demás conservan su estructura.
    fotos: (p.fotos ?? []).map(f => f.trazas ? { ...f, trazas: { ...f.trazas, segmentos: f.trazas.segmentos.filter(s => s.familia !== i).map(s => (s.familia > i ? { ...s, familia: s.familia - 1 } : s)) } } : f),
  }));
  const medidor = midiendo != null && (
    <Medidor modo="pl" titulo={`${textoFamilia(r.familias, midiendo).split(':')[0]}: apoye el celular en la estructura`} decl={listas.declinacion ?? -7} conv={listas.convergencia ?? 0}
      onCancelar={() => setMidiendo(null)}
      onListo={l => {
        const i = midiendo;
        const fams = r.familias.map((x, j) => j === i ? { ...x, dip: Math.round(l.dip!), dipdir: Math.round(l.dd!) % 360 } : x);
        set('familias', fams);
        const sig = fams.findIndex((f, j) => j > i && (f.dip == null || f.dipdir == null));
        setMidiendo(enCadena && sig >= 0 ? sig : null); // en cadena, la app pide medir la siguiente, en orden
      }} />
  );
  return (<>
    {medidor}
    <div className="pantalla" style={midiendo != null ? { display: 'none' } : undefined}>
      <header className="barra">
        <button className="btn-atras" onClick={onSalir} aria-label="Volver a reportes">‹</button>
        <div className="barra-tit"><h1>{r.labor || 'Nuevo reporte'}</h1><span className="sub">{[r.desde && `PK ${r.desde}`, r.fecha, estado].filter(Boolean).join(' · ')}</span></div>
      </header>
      <div className="progreso"><div style={{ width: `${(hechos / totalPasos) * 100}%` }} /><span>{hechos} de {totalPasos} listos</span></div>
      <main className="contenido">

        <Seccion titulo="Datos de la labor" listo={listo.cab} resumen={[r.labor, r.desde, r.avance != null ? `${r.avance} m` : ""].filter(Boolean).join(" · ") || 'Se llena una sola vez'} abierta={abierta} setAbierta={setAbierta} id="cab">
          <p className="nota">Se llenan una sola vez y valen para todo el reporte: Frente, H.I., Corona y H.D.</p>
          <Campo t="N° correlativo (sale en el formato)"><input inputMode="numeric" value={r.correlativo} onChange={e => set('correlativo', e.target.value)} /></Campo>
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
        </Seccion>

        <section className="seccion abierta" id="sec-fotos">
          <div className="sec-cab estatica"><span className={`sec-ico${listo.fotos ? ' listo' : ''}`}>{listo.fotos ? '✓' : '📷'}</span>
            <span className="sec-tit">Fotos y estructuras<small className="sec-res">La IA revisa la foto, avisa si no es labor y propone</small></span></div>
          <div className="sec-cuerpo">
            <FotoIA r={r} setR={setR} historial={historial} decl={listas.declinacion ?? -7} conv={listas.convergencia ?? 0} onMedir={i => { setEnCadena(false); setMidiendo(i); }} />
          </div>
        </section>

        <Seccion titulo="RMR (puntos)" resumen={resumenRmr(c)} abierta={abierta} setAbierta={setAbierta} id="rmr" listo={listo.rmr}>
          {toggleZonas}
          <div className="tabla-pts">
            <div className="tp-cab" style={{ gridTemplateColumns: cols }}><span />{(mismoEnZonas ? ['Puntos'] : ZONAS.map(z => NOMBRE_ZONA[z])).map(t => <b key={t}>{t}</b>)}</div>
            {PARAMETROS.map(par => (
              <div key={par.id} className="tp-fila" style={{ gridTemplateColumns: cols }}>
                <span className="tp-nom">{par.nombre}{par.id === 'rqd' && c.puntajeRqdSugerido != null && <em className="sugerido">Sugerido: {c.puntajeRqdSugerido}</em>}</span>
                {(mismoEnZonas ? (['CORONA'] as Zona[]) : ZONAS).map(z => (
                  <select key={z} className={sug(`rmr.${par.id}`)} value={r.rmr[z][par.id] ?? ''} onChange={e => e.target.value !== '' && ponerRmr(z, par.id, Number(e.target.value))}>
                    <option value="">—</option>
                    {par.clases.map(cl => <option key={cl.etiqueta} value={cl.puntaje}>{cl.puntaje} · {cl.etiqueta}</option>)}
                  </select>
                ))}
              </div>
            ))}
            <div className="tp-fila" style={{ gridTemplateColumns: cols }}>
              <span className="tp-nom">Ajuste por orientación{c.ajusteIA && <em className="sugerido">Sugerido: {c.ajusteIA.ajuste}</em>}</span>
              {(mismoEnZonas ? (['CORONA'] as Zona[]) : ZONAS).map(z => (
                <select key={z} className={sug('ajuste')} value={r.ajuste[z] ?? ''} onChange={e => e.target.value !== '' && ponerAjuste(z, Number(e.target.value))}>
                  <option value="">—</option>
                  {AJUSTES_ORIENTACION.map(a => <option key={a.etiqueta} value={a.puntaje}>{a.puntaje} · {a.etiqueta}</option>)}
                </select>
              ))}
            </div>
          </div>
          {c.ajusteIA && <p className="tenue">Ajuste sugerido: {c.ajusteIA.calificacion} ({c.ajusteIA.ajuste}). {c.ajusteIA.explicacion}</p>}
          <TablaRmr c={c} />
        </Seccion>

        <Seccion titulo="RQD y Q de Barton" resumen={resumenQ(c)} abierta={abierta} setAbierta={setAbierta} id="q" listo={listo.q}>
          <section className="tarjeta">
            <h3>Cálculo de RQD · RQD = 115 − 3.3·Jv</h3>
            <div className="rejilla2">
              <Campo t="N° fracturas por m³ (Jv)"><input className={sug('jv')} inputMode="decimal" value={r.jv ?? ''} onChange={e => set('jv', num(e.target.value))} /></Campo>
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
        </Seccion>

        <Seccion titulo="Litología y estructuras" resumen={`${r.familias.filter(f => f.dip != null).length} familias`} abierta={abierta} setAbierta={setAbierta} id="est" listo={listo.est}>
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
                <button className="btn mini btn-med" onClick={() => { setEnCadena(false); setMidiendo(i); }}>🧭 Medir</button>
                <button className="btn mini" onClick={() => quitarFamilia(i)}>×</button>
              </div>
            ))}
            {r.familias.length < 5 && <button className="btn mini" onClick={() => set('familias', [...r.familias, { abrev: 'SD', dip: null, dipdir: null }])}>+ Familia</button>}
            {r.familias.some(f => f.dip == null || f.dipdir == null) && <button className="btn primario" onClick={() => { setEnCadena(true); setMidiendo(r.familias.findIndex(f => f.dip == null || f.dipdir == null)); }}>🧭 Medir familias pendientes, en orden</button>}
            <details className="ayuda"><summary>¿Cómo medir Dip y Dip Direction?</summary>
              <ol>
                <li>Limpie la cara de la discontinuidad y apoye el <b>dorso</b> del celular bien plano sobre ella.</li>
                <li>Espere "ESTABLE" y toque Registrar; no mueva el celular durante 3 s.</li>
                <li>Dip = inclinación del plano (0–90°). Dip direction = hacia dónde baja el plano (0–360°), no el rumbo.</li>
                <li>Aléjese al menos 1 m de pernos, malla, rieles y equipos; si sale "Interferencia magnética", repita en otro punto de la misma cara.</li>
                <li>Si no alcanza la cara, mida una paralela accesible de la misma familia.</li>
              </ol>
            </details>
          </section>
          <section className="tarjeta">
            <h3>Excavación real</h3>
            <p className="tenue">Diferencia entre el contorno real y el de diseño, medida en el frente (m): positivo = sobreexcavación, negativo = subexcavación. Se dibuja en la sección y entra en el análisis de cuñas.</p>
            <div className="rejilla3">
              {ZONAS.map(z => <label key={z} className="campo"><span>{NOMBRE_ZONA[z]}</span>
                <NumConSigno valor={r.sobreexc?.[z] ?? null} on={v => set('sobreexc', { ...(r.sobreexc ?? {}), [z]: v })} /></label>)}
            </div>
            {r.familias.some(f => f.abrev === 'F' || f.abrev === 'V') && <div className="rejilla3">
              {r.familias.map((f, i) => (f.abrev === 'F' || f.abrev === 'V') && <label key={i} className="campo"><span>Potencia {f.abrev}{i + 1} (m)</span>
                <input inputMode="decimal" placeholder="0.05" value={f.potencia ?? ''} onChange={e => set('familias', r.familias.map((x, j) => j === i ? { ...x, potencia: num(e.target.value) } : x))} /></label>)}
            </div>}
          </section>
          {r.familias.some(f => f.dip != null && f.dipdir != null) && (() => {
            const rz = { HI: c.zonas.HI.total, CORONA: c.zonas.CORONA.total, HD: c.zonas.HD.total };
            const pl = vistaPlanta(r, rz), se = r.ancho && r.alto ? vistaSeccion(r, rz) : null;
            return <section className="tarjeta">
              <h3>Vista planta y vista sección</h3>
              <p className="tenue">Calculadas con el dip / dip direction de cada estructura, el azimut, la sección y la excavación real. Así salen en el PDF.</p>
              <div className="rejilla2">
                {pl ? <div dangerouslySetInnerHTML={{ __html: aSvg(pl) }} /> : <p className="tenue">Falta el azimut para la planta.</p>}
                {se ? <div dangerouslySetInnerHTML={{ __html: aSvg(se) }} /> : <p className="tenue">Falta ancho y alto para la sección.</p>}
              </div>
              {se && se.notas.length > 0 && <ul className="tenue">{se.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {se && <p className="tenue">Cuñas: análisis 2D en la sección del frente (como en la ficha). Para el factor de seguridad use Unwedge con estas orientaciones.</p>}
            </section>;
          })()}
        </Seccion>

        <Seccion titulo="Condición y verificación" resumen={r.condicion ? "lleno" : ""} abierta={abierta} setAbierta={setAbierta} id="cond" listo={listo.cond}>
          <button className="btn" onClick={() => setR(p => ({ ...p, condicion: redactarCondicion(p, calcular(p)), sugeridos: [...new Set([...(p.sugeridos ?? []), 'condicion'])] }))}>✍️ Redactar con IA</button>
          <Campo t="Condición geomecánica"><textarea className={sug('condicion')} rows={5} value={r.condicion} onChange={e => set('condicion', e.target.value)} /></Campo>
          <section className="tarjeta">
            <h3>Verificación de sostenimiento anterior</h3>
            {ITEMS_VERIF.map(it => (
              <div key={it} className="fila"><span className="etq">{it}</span>
                <Segmentos valor={r.verificacion[it]} opciones={['CUMPLE', 'NO CUMPLE', 'NO APLICA']}
                  on={v => set('verificacion', { ...r.verificacion, [it]: v as Verif })} /></div>
            ))}
          </section>
          <Campo t="Observaciones"><textarea rows={3} value={r.observaciones} onChange={e => set('observaciones', e.target.value)} /></Campo>
        </Seccion>

        <Seccion titulo="Sostenimiento" resumen={c.tipoFinal ? `ST-${c.tipoFinal}` : ""} abierta={abierta} setAbierta={setAbierta} id="sos" listo={listo.sos}>
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
        </Seccion>

        <Seccion titulo="Indicaciones y firmas" resumen={r.firmas.filter(f => f.nombre).length ? `${r.firmas.filter(f => f.nombre).length} firmas` : ""} abierta={abierta} setAbierta={setAbierta} id="fir" listo={listo.fir}>
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
        </Seccion>

        <Seccion titulo="Consejos de la IA" resumen={avisos.length ? `${avisos.length} aviso(s)` : 'sin avisos'} abierta={abierta} setAbierta={setAbierta} id="ia">
          {avisos.length ? <ul className="consejos">{avisos.map(a => <li key={a}>{a}</li>)}</ul> : <p className="ok">Nada que observar por ahora.</p>}
        </Seccion>
        <Seccion titulo="Revisar y descargar" resumen="PDF · Excel" abierta={abierta} setAbierta={setAbierta} id="res"><Resumen r={r} c={c} /></Seccion>
      </main>
      <nav className="barra-abajo">
        <button onClick={() => document.getElementById('sec-fotos')?.scrollIntoView({ behavior: 'smooth' })}><span>📷</span>Fotos</button>
        <button onClick={() => ir('rmr')}><span>🪨</span>RMR</button>
        <button onClick={() => ir('est')}><span>🧭</span>Medir</button>
        <button className="principal" onClick={() => ir('res')}><span>⬇</span>Descargar</button>
      </nav>
    </div>
  </>
  );
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="campo"><span>{t}</span>{children}</label>;
}
/** Número que puede ser negativo: guarda el texto mientras se escribe ("-", "-0.") y entrega el número válido. */
function NumConSigno({ valor, on }: { valor: number | null; on: (v: number | null) => void }) {
  const [t, setT] = useState(valor == null ? '' : String(valor));
  useEffect(() => { if (valor == null ? t !== '' && !/^[-+]?[.,]?$/.test(t) : Number(t.replace(',', '.')) !== valor) setT(valor == null ? '' : String(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input inputMode="text" placeholder="0.00" value={t} onChange={e => { const s = e.target.value; setT(s); const n = Number(s.replace(',', '.')); on(s.trim() === '' || !Number.isFinite(n) ? null : n); }} />;
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
          <select className={r.sugeridos?.includes(`q.${k}`) ? 'sug' : ''} value={r.q[z][k] ?? ''} onChange={e => on(z, k, Number(e.target.value))}>
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
      <Descargas r={r} />
    </>
  );
}

function Descargas({ r }: { r: Reporte }) {
  const [msg, setMsg] = useState<string | null>(null);
  const bajar = async (tipo: 'xlsx' | 'pdf') => {
    setMsg('Generando…');
    try {
      const plantilla = await fetch(`./plantilla/formato.${tipo}`).then(x => { if (!x.ok) throw new Error('No se encontró la plantilla'); return x.arrayBuffer(); });
      const datos = tipo === 'xlsx' ? await (await import('../export/xlsx')).generarXlsx(r, plantilla) : await (await import('../export/pdf')).generarPdf(r, plantilla);
      const res = await entregar(datos, nombreArchivo(r, tipo), tipo === 'xlsx' ? MIME_XLSX : MIME_PDF);
      setMsg(res === 'descargado' ? 'Archivo descargado.' : null);
    } catch (e) { setMsg(`No se pudo generar: ${(e as Error).message}`); }
  };
  return (
    <section className="tarjeta">
      <h3>Descargar el formato oficial lleno</h3>
      <div className="rejilla2">
        <button className="btn primario" onClick={() => bajar('pdf')}>PDF</button>
        <button className="btn primario" onClick={() => bajar('xlsx')}>Excel</button>
      </div>
      {msg && <p className="tenue">{msg}</p>}
      <p className="tenue">Funciona sin señal. En el celular se abre el menú para guardar o enviar por WhatsApp o correo.</p>
    </section>
  );
}

const ICONOS: Record<string, string> = { cab: '📋', rmr: '🪨', q: '🔢', est: '🧭', cond: '📝', sos: '🔩', fir: '✍️', ia: '💡', res: '📄' };
function Seccion({ id, titulo, resumen, abierta, setAbierta, children, listo }: { id: string; titulo: string; resumen?: string; abierta: string | null; setAbierta: (s: string | null) => void; children: React.ReactNode; listo?: boolean }) {
  const open = abierta === id;
  return (
    <section id={`sec-${id}`} className={open ? 'seccion abierta' : 'seccion'}>
      <button className="sec-cab" onClick={() => setAbierta(open ? null : id)}>
        <span className={`sec-ico${listo ? ' listo' : ''}`}>{listo ? '✓' : ICONOS[id] ?? '•'}</span>
        <span className="sec-tit">{titulo}<small className="sec-res">{resumen}</small></span><span className="sec-fl">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="sec-cuerpo">{children}</div>}
    </section>
  );
}
function resumenRmr(c: ReturnType<typeof calcular>) {
  const t = ZONAS.map(z => c.zonas[z].total);
  if (t.every(v => v == null)) return '';
  return `RMR ${t.map(v => v ?? '—').join(' / ')}${c.tipoFinal ? ` · ST-${c.tipoFinal}` : ''}`;
}
function resumenQ(c: ReturnType<typeof calcular>) {
  const q = ZONAS.map(z => c.zonas[z].q);
  return [c.rqd != null ? `RQD ${c.rqd}` : '', q.some(v => v != null) ? `Q ${q.map(v => v ?? '—').join(' / ')}` : ''].filter(Boolean).join(' · ');
}


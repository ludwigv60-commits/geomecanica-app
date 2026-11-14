import { useMemo, useState, type ReactNode } from 'react';
import {
  CLASES, CONDICIONES, ESTRUCTURAS, FACTORES, GRUPOS, LABORES, LEYENDA, MATRIZ_GSI, NOTA_CARTILLA, SECCIONES_COMUNES,
  TABLAS, clasePorTipo, type CondicionDisc, type TipoRoca, type Estructura, type TipoLabor,
} from './cartilla';
import { AJUSTES_ORIENTACION, NOMBRE_ZONA, PARAMETROS, ZONAS, puntajeRqd, type ParamId, type Zona } from './rmr';
import { rqdDesdeJv } from './rqd';
import { ajusteSugerido } from './orientacion';
import { TIPOS_ESTRUCTURA, calcular, uid, type Discontinuidad, type Foto, type Mapeo, type TipoEstructura } from './model';
import { EditorFoto, leerFoto, nuevaFoto } from './Foto';
import { Medidor } from './Medidor';
import { generarPdf } from './reporte';
import { entregar } from './nativo';

type Props = { m: Mapeo; set: (f: (m: Mapeo) => Mapeo) => void; decl: number; labores: string[]; onVolver: () => void };

function Seccion({ titulo, res, abierta: ini = false, children }: { titulo: string; res?: ReactNode; abierta?: boolean; children: ReactNode }) {
  const [ab, setAb] = useState(ini);
  return (
    <section className={'seccion' + (ab ? ' abierta' : '')}>
      <button className="sec-cab" onClick={() => setAb(!ab)}><span className="sec-tit">{titulo}</span><span className="sec-res">{res}</span><span className="sec-fl">{ab ? '▾' : '▸'}</span></button>
      {ab && <div className="sec-cuerpo">{children}</div>}
    </section>
  );
}

const Campo = ({ t, children }: { t: string; children: ReactNode }) => <label className="campo"><span>{t}</span>{children}</label>;
const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : null; };

export async function descargarPdf(m: Mapeo, compartir: boolean) {
  const bytes = await generarPdf(m);
  const nombre = `Reporte_${(m.labor || 'mapeo').replace(/[^\w.-]+/g, '_')}_${m.fecha}.pdf`;
  await entregar(bytes, nombre, 'application/pdf', compartir);
}

export function Editor({ m, set, decl, labores, onVolver }: Props) {
  const c = useMemo(() => calcular(m), [m]);
  const [medir, setMedir] = useState<string | null>(null);
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = <K extends keyof Mapeo>(k: K, v: Mapeo[K]) => set(p => ({ ...p, [k]: v }));
  const zonas: Zona[] = m.porZonas ? ZONAS : ['CORONA'];
  const setPunt = (z: Zona, id: ParamId, v: number | undefined) => set(p => ({ ...p, zonas: { ...p.zonas, [z]: { ...p.zonas[z], [id]: v } } }));
  const setTodas = (id: ParamId, v: number) => set(p => ({ ...p, zonas: Object.fromEntries(ZONAS.map(z => [z, { ...p.zonas[z], [id]: v }])) as Mapeo['zonas'] }));

  const jvNum = num(m.jv);
  const rqdSug = jvNum != null ? rqdDesdeJv(jvNum) : num(m.rqdManual);
  const az = num(m.azimut);
  const ajSug = az != null ? ajusteSugerido(m.disc.filter(d => d.dip != null && d.dd != null).map(d => ({ dip: d.dip!, dipdir: d.dd!, nombre: d.nombre })), az) : null;
  const condSug = CONDICIONES.find(x => x.id === m.gsiCondicion);

  const setDisc = (id: string, cambios: Partial<Discontinuidad>) => up('disc', m.disc.map(d => d.id === id ? { ...d, ...cambios } : d));
  const agregarDisc = (tipo: TipoEstructura) => {
    const n = m.disc.filter(d => d.tipo === tipo).length + 1;
    up('disc', [...m.disc, { id: uid(), tipo, nombre: `${tipo}${n}`, dip: null, dd: null, espaciamiento: '', persistencia: '', relleno: '', obs: '' }]);
  };
  const agregarFoto = async (file?: File) => {
    if (!file) return;
    try {
      const d = await leerFoto(file);
      const titulos = ['Frente', 'Hastial izquierdo', 'Corona', 'Hastial derecho'];
      const f = nuevaFoto(titulos[m.fotos.length] ?? `Foto ${m.fotos.length + 1}`, d);
      set(p => ({ ...p, fotos: [...p.fotos, f] }));
      setFotoAbierta(f.id);
    } catch { setError('No se pudo leer la foto.'); }
  };
  const setFoto = (f: Foto) => set(p => ({ ...p, fotos: p.fotos.map(x => x.id === f.id ? f : x) }));
  const pdf = async (compartir: boolean) => {
    setOcupado(true); setError(null);
    try { await descargarPdf(m, compartir); } catch (e) { setError('No se pudo generar el PDF: ' + (e as Error).message); }
    setOcupado(false);
  };

  const foto = m.fotos.find(f => f.id === fotoAbierta);
  if (foto) return <EditorFoto foto={foto} disc={m.disc} onCambio={setFoto} onCerrar={() => setFotoAbierta(null)} />;
  const dMed = m.disc.find(d => d.id === medir);
  if (dMed) return <Medidor modo="pl" titulo={`${dMed.nombre}: apoye el celular sobre la estructura`} decl={decl} conv={0}
    onCancelar={() => setMedir(null)}
    onListo={l => { if (l.dip != null && l.dd != null) setDisc(dMed.id, { dip: Math.round(l.dip), dd: Math.round(l.dd) % 360 }); setMedir(null); }} />;

  const rec = c.rec;
  const clase = rec?.clase;

  return (
    <div className="pantalla">
      <header className="barra">
        <button className="btn mini claro" onClick={onVolver}>‹ Mapeos</button>
        <h1>{m.labor || 'Nuevo mapeo'}<div className="sub">{m.fecha} {m.hora}</div></h1>
        {clase && <span className="chip" style={{ background: clase.color, color: clase.texto, borderColor: clase.color }}>{clase.tipo} · {c.rmr}</span>}
      </header>
      <main className="contenido">
        <Seccion titulo="1. Datos generales" res={m.labor} abierta={!m.labor}>
          <div className="rejilla2">
            <Campo t="Labor"><input list="labores" value={m.labor} onChange={e => up('labor', e.target.value)} placeholder="ej. RP 450" /></Campo>
            <Campo t="Nivel"><input value={m.nivel} onChange={e => up('nivel', e.target.value)} /></Campo>
            <Campo t="Fecha"><input type="date" value={m.fecha} onChange={e => up('fecha', e.target.value)} /></Campo>
            <Campo t="Hora"><input type="time" value={m.hora} onChange={e => up('hora', e.target.value)} /></Campo>
            <Campo t="Progresiva desde (m)"><input inputMode="decimal" value={m.desde} onChange={e => up('desde', e.target.value)} /></Campo>
            <Campo t="Progresiva hasta (m)"><input inputMode="decimal" value={m.hasta} onChange={e => up('hasta', e.target.value)} /></Campo>
            <Campo t="Ubicación / zona"><input value={m.ubicacion} onChange={e => up('ubicacion', e.target.value)} /></Campo>
            <Campo t="Litología"><input value={m.litologia} onChange={e => up('litologia', e.target.value)} /></Campo>
            <Campo t="Azimut de avance (°)"><input inputMode="decimal" value={m.azimut} onChange={e => up('azimut', e.target.value)} placeholder="0-360" /></Campo>
            <Campo t="Sección típica">
              <select value={SECCIONES_COMUNES.includes(`${m.ancho.toFixed(1)}x${m.alto.toFixed(1)}`) ? `${m.ancho.toFixed(1)}x${m.alto.toFixed(1)}` : ''}
                onChange={e => { const [a, h] = e.target.value.split('x').map(Number); if (a && h) set(p => ({ ...p, ancho: a, alto: h })); }}>
                <option value="">Otra (escriba abajo)</option>
                {SECCIONES_COMUNES.map(s => <option key={s} value={s}>{s.replace('x', ' x ')} m</option>)}
              </select>
            </Campo>
            <Campo t="Ancho (m)"><input inputMode="decimal" value={m.ancho} onChange={e => up('ancho', num(e.target.value) ?? 0)} /></Campo>
            <Campo t="Alto (m)"><input inputMode="decimal" value={m.alto} onChange={e => up('alto', num(e.target.value) ?? 0)} /></Campo>
          </div>
          <Campo t="Tipo de labor">
            <div className="segmentos">
              {(Object.keys(LABORES) as TipoLabor[]).map(t => <button key={t} className={m.tipoLabor === t ? 'sel' : ''} onClick={() => up('tipoLabor', t)}>{LABORES[t].nombre}<br /><small>{LABORES[t].ejemplos}</small></button>)}
            </div>
          </Campo>
          <div className="rejilla2">
            <Campo t="Mapeado por"><input value={m.mapeadoPor} onChange={e => up('mapeadoPor', e.target.value)} /></Campo>
            <Campo t="Revisado por"><input value={m.revisadoPor} onChange={e => up('revisadoPor', e.target.value)} /></Campo>
          </div>
          <datalist id="labores">{labores.map(l => <option key={l} value={l} />)}</datalist>
        </Seccion>

        <Seccion titulo="2. Discontinuidades" res={m.disc.length ? `${m.disc.length} registradas` : ''}>
          {m.disc.map(d => (
            <div className="disc" key={d.id} style={{ borderLeft: `6px solid ${TIPOS_ESTRUCTURA[d.tipo].color}` }}>
              <div className="fila">
                <input className="corto" value={d.nombre} onChange={e => setDisc(d.id, { nombre: e.target.value })} aria-label="Nombre" />
                <select value={d.tipo} onChange={e => setDisc(d.id, { tipo: e.target.value as TipoEstructura })}>
                  {(Object.keys(TIPOS_ESTRUCTURA) as TipoEstructura[]).map(t => <option key={t} value={t}>{TIPOS_ESTRUCTURA[t].nombre}</option>)}
                </select>
                <button className="btn mini" onClick={() => up('disc', m.disc.filter(x => x.id !== d.id))}>✕</button>
              </div>
              <div className="fila">
                <input className="corto" inputMode="numeric" placeholder="Buz." value={d.dip ?? ''} onChange={e => setDisc(d.id, { dip: num(e.target.value) })} aria-label="Buzamiento" />
                <span>/</span>
                <input className="corto" inputMode="numeric" placeholder="Dir. buz." value={d.dd ?? ''} onChange={e => setDisc(d.id, { dd: num(e.target.value) })} aria-label="Dirección de buzamiento" />
                <button className="btn mini btn-med" onClick={() => setMedir(d.id)}>📱 Medir</button>
              </div>
              <div className="fila">
                <input placeholder="Espaciamiento (m)" value={d.espaciamiento} onChange={e => setDisc(d.id, { espaciamiento: e.target.value })} />
                <input placeholder="Persistencia (m)" value={d.persistencia} onChange={e => setDisc(d.id, { persistencia: e.target.value })} />
              </div>
              <div className="fila">
                <input placeholder="Relleno" value={d.relleno} onChange={e => setDisc(d.id, { relleno: e.target.value })} />
                <input placeholder="Observación" value={d.obs} onChange={e => setDisc(d.id, { obs: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="fila-btn">
            {(Object.keys(TIPOS_ESTRUCTURA) as TipoEstructura[]).map(t => <button key={t} className="btn mini" onClick={() => agregarDisc(t)}>+ {TIPOS_ESTRUCTURA[t].nombre}</button>)}
          </div>
          <p className="tenue">Buzamiento / dirección de buzamiento en grados. Con «Medir», apoye el celular sobre la cara de la estructura (declinación magnética: {decl}°, se cambia en ⚙).</p>
        </Seccion>

        <Seccion titulo="3. Fotografías y trazas" res={m.fotos.length ? `${m.fotos.length} foto(s)` : ''}>
          <div className="fotos">
            {m.fotos.map(f => (
              <figure key={f.id}>
                <img src={f.src} alt="" onClick={() => setFotoAbierta(f.id)} />
                <figcaption>
                  <input value={f.titulo} onChange={e => setFoto({ ...f, titulo: e.target.value })} />
                  <div className="fila-btn">
                    <button className="btn mini" onClick={() => setFotoAbierta(f.id)}>✏️ Trazas ({f.trazas.length})</button>
                    <button className="btn mini" onClick={() => set(p => ({ ...p, fotos: p.fotos.filter(x => x.id !== f.id) }))}>✕</button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="fila-btn">
            <label className="btn primario foto-btn">📷 Tomar foto<input type="file" accept="image/*" capture="environment" hidden onChange={e => { agregarFoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <label className="btn foto-btn">🖼️ Galería<input type="file" accept="image/*" hidden onChange={e => { agregarFoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          <p className="tenue">Dibuje con el dedo las diaclasas, fallas, vetas y contactos; el rótulo (ej. D1 65/120) sale en el reporte.</p>
        </Seccion>

        <Seccion titulo="4. Clasificación RMR89" res={c.rmrCalc != null ? `RMR ${c.rmrCalc}` : 'incompleto'} abierta>
          <label className="interruptor"><input type="checkbox" checked={m.porZonas} onChange={e => up('porZonas', e.target.checked)} /> Evaluar por zonas (H.I., Corona, H.D.)</label>
          <div className="rejilla2">
            <Campo t="Jv (fracturas/m³)"><input inputMode="decimal" value={m.jv} onChange={e => up('jv', e.target.value)} /></Campo>
            <Campo t="RQD (%)"><input inputMode="decimal" value={m.rqdManual} placeholder={jvNum != null ? `${rqdDesdeJv(jvNum)} (de Jv)` : ''} onChange={e => up('rqdManual', e.target.value)} /></Campo>
          </div>
          {rqdSug != null && <p className="tenue">RQD {num(m.rqdManual) ?? rqdSug} % → puntaje {puntajeRqd(num(m.rqdManual) ?? rqdSug)} {jvNum != null && !m.rqdManual && '(RQD = 115 − 3.3·Jv, Palmström)'}
            {' '}<button className="btn mini" onClick={() => setTodas('rqd', puntajeRqd(num(m.rqdManual) ?? rqdSug))}>Usar</button></p>}
          <div className="rmr-fila" style={{ ['--n' as string]: zonas.length }}>
            <span />{zonas.map(z => <span key={z} className="tp-cab">{m.porZonas ? NOMBRE_ZONA[z] : 'Valoración'}</span>)}
          </div>
          {PARAMETROS.map(p => (
            <div className="rmr-fila" key={p.id} style={{ ['--n' as string]: zonas.length }}>
              <span>{p.nombre}</span>
              {zonas.map(z => (
                <select key={z} value={m.zonas[z][p.id] ?? ''} onChange={e => {
                  const v = e.target.value === '' ? undefined : Number(e.target.value);
                  // en la primera zona llenada, se copia a las otras si aún están vacías
                  if (m.porZonas && v != null) set(pp => ({ ...pp, zonas: Object.fromEntries(ZONAS.map(zz => [zz, zz === z || pp.zonas[zz][p.id] == null ? { ...pp.zonas[zz], [p.id]: v } : pp.zonas[zz]])) as Mapeo['zonas'] }));
                  else setPunt(z, p.id, v);
                }}>
                  <option value="">—</option>
                  {p.clases.map(k => <option key={k.etiqueta} value={k.puntaje}>{k.etiqueta} ({k.puntaje})</option>)}
                </select>
              ))}
            </div>
          ))}
          {condSug && <p className="tenue">La cartilla GSI ({condSug.nombre}) indica {condSug.rcu}. <button className="btn mini" onClick={() => setTodas('ucs', condSug.ucsSugerido)}>Usar para resistencia</button></p>}
          <Campo t="Ajuste por orientación de discontinuidades">
            <select value={m.ajuste ?? ''} onChange={e => up('ajuste', e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Sin ajuste (0)</option>
              {AJUSTES_ORIENTACION.map(a => <option key={a.etiqueta} value={a.puntaje}>{a.etiqueta} ({a.puntaje})</option>)}
            </select>
          </Campo>
          {ajSug && <p className="tenue">Sugerido por {ajSug.gobierna.nombre}: {ajSug.calificacion} ({ajSug.ajuste}). {ajSug.explicacion} {m.ajuste !== ajSug.ajuste && <button className="btn mini" onClick={() => up('ajuste', ajSug.ajuste)}>Usar</button>}</p>}
          {m.porZonas && <div className="tres">{ZONAS.map(z => <div key={z}><small>{NOMBRE_ZONA[z]}</small><b>{c.rmrZonas[z] ?? '—'}</b></div>)}</div>}
          {c.alertaZonas && <p className="alerta">{c.alertaZonas}</p>}
          <Campo t="RMR de diseño definido por el ingeniero (opcional)"><input inputMode="decimal" value={m.rmrManual} placeholder={c.rmrCalc != null ? `Calculado: ${c.rmrCalc}` : ''} onChange={e => up('rmrManual', e.target.value)} /></Campo>
          {clase && <div className="tipo-roca" style={{ background: clase.color, color: clase.texto }}><b>Tipo {clase.tipo}</b><span>RMR {c.rmr} · rango {clase.min}-{clase.max} · {clase.nombre}</span></div>}
        </Seccion>

        <Seccion titulo="5. Cartilla GSI (verificación)" res={c.tipoGsi ? `Tipo ${c.tipoGsi}` : ''}>
          <p className="tenue">Elija la condición estructural (filas) y la condición de las discontinuidades (columnas). Con factores influyentes se toma el color inferior de la casilla.</p>
          <div className="gsi">
            {CONDICIONES.map(cd => <div key={cd.id} className="gsi-cab">{cd.nombre} ({cd.id})<br />{cd.rcu.replace('RCU ', '')}</div>)}
            {ESTRUCTURAS.map(e => CONDICIONES.map(cd => {
              const celda = MATRIZ_GSI[e.id][cd.id];
              const sel = m.gsiEstructura === e.id && m.gsiCondicion === cd.id;
              if (!celda) return <button key={e.id + cd.id} className={'na' + (sel ? ' sel' : '')} onClick={() => set(p => ({ ...p, gsiEstructura: e.id as Estructura, gsiCondicion: cd.id as CondicionDisc }))}>{e.id}/{cd.id}<br />—</button>;
              const [a, b] = celda.map(clasePorTipo) as [ReturnType<typeof clasePorTipo>, ReturnType<typeof clasePorTipo>];
              return <button key={e.id + cd.id} className={sel ? 'sel' : ''} style={{ background: `linear-gradient(135deg, ${a.color} 50%, ${b.color} 50%)`, color: a.texto }}
                onClick={() => set(p => ({ ...p, gsiEstructura: e.id as Estructura, gsiCondicion: cd.id as CondicionDisc }))}>
                {e.id}/{cd.id}<br />{a.tipo === b.tipo ? a.tipo : `${a.tipo} | ${b.tipo}`}</button>;
            }))}
          </div>
          {m.gsiEstructura && <p className="tenue"><b>{ESTRUCTURAS.find(e => e.id === m.gsiEstructura)!.nombre}:</b> {ESTRUCTURAS.find(e => e.id === m.gsiEstructura)!.detalle} ({ESTRUCTURAS.find(e => e.id === m.gsiEstructura)!.rqd})</p>}
          {condSug && <p className="tenue"><b>{condSug.nombre}:</b> {condSug.detalle}</p>}
          <b>Factores influyentes</b>
          {FACTORES.map(fz => <label key={fz.id} className="interruptor"><input type="checkbox" checked={m.factores.includes(fz.id)} onChange={e => up('factores', e.target.checked ? [...m.factores, fz.id] : m.factores.filter(x => x !== fz.id))} /> {fz.texto}</label>)}
          {c.tipoGsi && <p className="ok">Según la cartilla GSI: roca tipo <b>{c.tipoGsi}</b>.</p>}
          {c.alertaGsi && <p className="alerta">{c.alertaGsi}</p>}
        </Seccion>

        <Seccion titulo="6. Sostenimiento (cartilla por rangos de RMR)" res={rec ? `Tipo ${rec.clase.tipo}` : ''} abierta>
          {!rec && <p className="alerta">Complete el RMR (sección 4) para obtener el sostenimiento.</p>}
          {rec && <>
            <p className="tenue">{GRUPOS[rec.grupo]} · {LABORES[m.tipoLabor].nombre} · Roca tipo {rec.clase.tipo}{rec.clase.tipo === 'I' && ' (se aplica tipo II)'}</p>
            {rec.alertas.map(a => <p key={a} className="alerta">{a}</p>)}
            {rec.opciones.length > 1 && rec.opciones.map((o, i) => (
              <label key={i} className="interruptor" style={{ alignItems: 'flex-start' }}>
                {rec.opciones.length > 1 && <input type="radio" name="op" checked={Math.min(m.opcion, rec.opciones.length - 1) === i} onChange={() => up('opcion', i)} />}
                <span>{rec.opciones.length > 1 && `Opción ${i + 1}: `}{o.texto}{o.refuerzoG && <span className="g"><br />G: {o.refuerzoG} (solo bajo indicación geomecánica)</span>}</span>
              </label>
            ))}
            <div className="sost" style={{ borderColor: clasePorTipo(rec.tipoTabla).color }}>{c.sostenimiento}
              {rec.opciones.length === 1 && rec.opciones[0]!.refuerzoG && !m.sostFinal.trim() && <div className="g">G: {rec.opciones[0]!.refuerzoG} (solo bajo indicación geomecánica)</div>}</div>
            <Campo t="Sostenimiento final (edite si el ingeniero decide otro)"><textarea rows={2} value={m.sostFinal} placeholder="Vacío = el de la cartilla" onChange={e => up('sostFinal', e.target.value)} /></Campo>
            <table className="tabla"><tbody>
              <tr><th>Tiempo de autosoporte</th><td>{rec.autosoporte.tiempo} (longitud 2 a 4.5 m)</td></tr>
              <tr><th>Frecuencia de desatado</th><td>{rec.autosoporte.desatado}</td></tr>
              {rec.sacrificio
                ? <tr><th>Sacrificio (sección {rec.sacrificio.seccion})</th><td>Perímetro {rec.sacrificio.perimetro} m · {rec.sacrificio.cocadas} cocadas · filas {rec.sacrificio.filas11} (e=1.1 m) / {rec.sacrificio.filas12} (e=1.2 m) · perno {rec.sacrificio.longitud}</td></tr>
                : <tr><th>Sacrificio</th><td>La sección {m.ancho} x {m.alto} m no está en la tabla de sacrificio de la cartilla; según estándar.</td></tr>}
            </tbody></table>
          </>}
          <details className="ayuda"><summary>Ver tabla completa de la cartilla</summary>
            {(['S35', 'S45'] as const).map(g => (
              <div key={g}><h3>{GRUPOS[g]}</h3>
                <table className="tabla"><thead><tr><th>Tipo</th><th>Permanente</th><th>Temporal</th></tr></thead><tbody>
                  {CLASES.filter(k => k.tipo !== 'I').map(k => {
                    const t = TABLA(g, k.tipo as Exclude<TipoRoca, 'I'>);
                    return <tr key={k.tipo}><td style={{ background: k.color, color: k.texto }}><b>{k.tipo}</b><br />{k.min}-{k.max}</td>
                      {(['PERMANENTE', 'TEMPORAL'] as const).map(l => <td key={l}>{t[l].map((o, i) => <div key={i}>{t[l].length > 1 && `${i + 1}. `}{o.texto}{o.refuerzoG && <span className="g"> G: {o.refuerzoG}</span>}</div>)}</td>)}</tr>;
                  })}
                </tbody></table></div>
            ))}
            <ul className="notas">{LEYENDA.map(l => <li key={l}>{l}</li>)}<li>{NOTA_CARTILLA}</li></ul>
          </details>
        </Seccion>

        <Seccion titulo="7. Observaciones" res={m.observaciones ? '✓' : ''}>
          <textarea rows={4} value={m.observaciones} onChange={e => up('observaciones', e.target.value)} placeholder="Condiciones especiales, agua, cuñas, recomendaciones…" />
        </Seccion>
        {error && <p className="alerta">{error}</p>}
      </main>
      <footer className="pie">
        <button className="btn primario" disabled={ocupado} onClick={() => pdf(false)}>{ocupado ? 'Generando…' : '⬇ Reporte PDF'}</button>
        <button className="btn" disabled={ocupado} onClick={() => pdf(true)}>Compartir</button>
      </footer>
    </div>
  );
}

const TABLA = (g: 'S35' | 'S45', t: Exclude<TipoRoca, 'I'>) => TABLAS[g][t];

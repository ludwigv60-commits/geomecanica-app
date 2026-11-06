// Vistas del Centro de Control: resumen PK a PK, tabla con filtros, herramientas y el Excel.
import { useMemo, useState } from 'react';
import { TIPOS } from '../core/rmr';
import { HERRAMIENTAS, infoTipo, ordenPk, pkTexto, resumir, type Fila, type Filtro, type Herramienta } from './centro';
import { libroExcel, type Columna, type Hoja, type Valor } from './excelCentro';

export type Pestana = 'mapeos' | 'resumen' | 'tabla' | 'herramientas';
export const PESTANAS: { id: Pestana; nombre: string; icono: string }[] = [
  { id: 'mapeos', nombre: 'Mapeos', icono: '🗺️' },
  { id: 'resumen', nombre: 'Resumen PK a PK', icono: '📈' },
  { id: 'tabla', nombre: 'Tabla', icono: '📋' },
  { id: 'herramientas', nombre: 'Mis herramientas', icono: '🧰' },
];

const lab = (x: Fila) => (x.tipoLabor === 'CAMARA' ? 'Cámara' : 'Rampa');

/* ───────── Resumen PK a PK ───────── */
export function ResumenPk({ filas, abrir }: { filas: Fila[]; abrir: (id: string) => void }) {
  const res = useMemo(() => resumir(filas), [filas]);
  const total = res.reduce((s, x) => s + x.metros, 0);
  const porTipo = TIPOS.map(t => ({ ...t, m: res.reduce((s, x) => s + (x.porTipo.find(p => p.tipo === t.tipo)?.m ?? 0), 0) })).filter(x => x.m > 0);
  if (!filas.length) return <p className="tenue">No hay mapeos con estos filtros.</p>;
  return (
    <div className="c-resumen">
      <section className="c-card">
        <h2>Metros por tipo de roca</h2>
        <p className="tenue">{Math.round(total * 10) / 10} m mapeados en {res.length} labor(es) y {filas.length} mapeo(s).</p>
        <Barra partes={porTipo.map(t => ({ tipo: t.tipo, m: t.m }))} total={total} grande />
      </section>
      {res.map(g => {
        const ancho = g.desde != null && g.hasta != null && g.hasta > g.desde ? g.hasta - g.desde : null;
        return (
          <section key={g.labor} className="c-card">
            <div className="c-card-cab">
              <div>
                <h2>{g.tipoLabor === 'CAMARA' ? '🏛️' : '🛣️'} {g.labor}</h2>
                <p className="tenue">{g.tipoLabor === 'CAMARA' ? 'Cámara' : 'Rampa'}{g.rampa ? ` · Rampa ${g.rampa}` : ''} · PK {pkTexto(g.desde) || '—'} a {pkTexto(g.hasta) || '—'} · {g.metros} m · {g.mapeos} mapeo(s)</p>
              </div>
              <div className="c-stats">
                <span>RMR prom. <b>{g.rmrProm ?? '—'}</b></span>
                <span>RMR mín. <b>{g.rmrMin ?? '—'}</b></span>
                <span>Q prom. <b>{g.qProm ?? '—'}</b></span>
                <span>Cobertura <b>{g.cobMin == null ? '—' : g.cobMin === g.cobMax ? `${g.cobMin} m` : `${g.cobMin}–${g.cobMax} m`}</b></span>
              </div>
            </div>
            <Barra partes={g.porTipo} total={g.metros} />
            {ancho != null && <div className="c-tira" aria-label="Tramos a lo largo del PK">
              {g.tramos.filter(x => x.pkIni != null).map(x => {
                const a = x.pkIni!, b = x.pkFin ?? a + (x.avance ?? 0.5), i = infoTipo(x.tipo);
                return <button key={x.r.id} title={`PK ${x.r.desde} a ${x.r.hasta || pkTexto(b)} · ${x.tipo ? `Tipo ${x.tipo}` : 'sin tipo'} · RMR ${x.rmr ?? '—'}`}
                  style={{ left: `${((a - g.desde!) / ancho) * 100}%`, width: `max(4px, ${((b - a) / ancho) * 100}%)`, background: i?.color ?? '#9aa4b1' }} onClick={() => abrir(x.r.id)} />;
              })}
              <span className="c-tira-a">{pkTexto(g.desde)}</span><span className="c-tira-b">{pkTexto(g.hasta)}</span>
            </div>}
            <details>
              <summary>Ver tramos ({g.tramos.length})</summary>
              <div className="c-tabla-env"><table className="c-tabla">
                <thead><tr><th>PK inicio</th><th>Avance</th><th>PK final</th><th>Fecha</th><th>Tipo</th><th>RMR</th><th>Q</th><th>Cobertura</th><th>Litología</th><th>Riesgo</th></tr></thead>
                <tbody>{g.tramos.map(x => { const i = infoTipo(x.tipo); return (
                  <tr key={x.r.id} onClick={() => abrir(x.r.id)}>
                    <td>{x.r.desde}</td><td>{x.avance ?? ''}</td><td>{x.r.hasta || pkTexto(x.pkFin)}</td><td>{x.r.fecha}</td>
                    <td><span className="chip" style={i ? { background: i.color, color: i.texto, borderColor: i.color } : {}}>{x.tipo ?? '—'}</span></td>
                    <td>{x.rmr ?? ''}</td><td>{x.q.CORONA ?? ''}</td><td>{x.cob ?? ''}</td><td>{x.litologia}</td><td>{x.r.nivelRiesgo}</td>
                  </tr>); })}</tbody>
              </table></div>
            </details>
          </section>
        );
      })}
    </div>
  );
}

function Barra({ partes, total, grande }: { partes: { tipo: string; m: number }[]; total: number; grande?: boolean }) {
  if (!total) return <p className="tenue">Sin avance registrado para calcular metros.</p>;
  return (
    <div className={grande ? 'c-barra grande' : 'c-barra'}>
      <div className="c-barra-pista">{partes.map(p => { const i = TIPOS.find(t => t.tipo === p.tipo)!; return <span key={p.tipo} style={{ width: `${(p.m / total) * 100}%`, background: i.color, color: i.texto }} title={`Tipo ${p.tipo}: ${Math.round(p.m * 10) / 10} m`}>{p.m / total > 0.09 ? `${Math.round((p.m / total) * 100)}%` : ''}</span>; })}</div>
      <div className="c-leyenda">{partes.map(p => { const i = TIPOS.find(t => t.tipo === p.tipo)!; return <span key={p.tipo}><i style={{ background: i.color }} />Tipo {p.tipo} <b>{Math.round(p.m * 10) / 10} m</b> ({Math.round((p.m / total) * 100)}%)</span>; })}</div>
    </div>
  );
}

/* ───────── Tabla con filtros por columna ───────── */
interface ColT { id: string; titulo: string; v: (x: Fila) => Valor; num?: boolean }
const COLS: ColT[] = [
  { id: 'fecha', titulo: 'Fecha', v: x => x.r.fecha },
  { id: 'n', titulo: 'N°', v: x => x.r.correlativo },
  { id: 'tl', titulo: 'Labor tipo', v: lab },
  { id: 'rampa', titulo: 'Rampa', v: x => x.rampa },
  { id: 'labor', titulo: 'Labor', v: x => x.r.labor },
  { id: 'ini', titulo: 'PK inicio', v: x => x.r.desde },
  { id: 'av', titulo: 'Avance (m)', v: x => x.avance, num: true },
  { id: 'fin', titulo: 'PK final', v: x => x.r.hasta || pkTexto(x.pkFin) },
  { id: 'cob', titulo: 'Cobertura (m)', v: x => x.cob, num: true },
  { id: 'tipo', titulo: 'Tipo roca', v: x => x.tipo },
  { id: 'rmr', titulo: 'RMR', v: x => x.rmr, num: true },
  { id: 'q', titulo: 'Q corona', v: x => x.q.CORONA, num: true },
  { id: 'lit', titulo: 'Litología', v: x => x.litologia },
  { id: 'riesgo', titulo: 'Riesgo', v: x => x.r.nivelRiesgo },
  { id: 'sup', titulo: 'Supervisor', v: x => x.r.supervisor },
];

export function Tabla({ filas, abrir }: { filas: Fila[]; abrir: (id: string) => void }) {
  const [orden, setOrden] = useState<{ id: string; asc: boolean }>({ id: '', asc: true });
  const [fc, setFc] = useState<Record<string, string>>({});
  const vistas = useMemo(() => {
    let l = filas.filter(x => COLS.every(c => { const q = fc[c.id]?.trim().toLowerCase(); return !q || String(c.v(x) ?? '').toLowerCase().includes(q); }));
    const c = COLS.find(k => k.id === orden.id);
    l = c ? [...l].sort((a, b) => { const va = c.v(a), vb = c.v(b); const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true }); return orden.asc ? r : -r; }) : [...l].sort(ordenPk);
    return l;
  }, [filas, fc, orden]);
  if (!filas.length) return <p className="tenue">No hay mapeos con estos filtros.</p>;
  return (
    <div className="c-card c-card-tabla">
      <p className="tenue">Toque un encabezado para ordenar; escriba bajo él para filtrar esa columna. Toque una fila para abrir el mapeo. El botón ⬇ Excel exporta lo filtrado arriba.</p>
      <div className="c-tabla-env alta"><table className="c-tabla">
        <thead>
          <tr>{COLS.map(c => <th key={c.id} onClick={() => setOrden(o => ({ id: c.id, asc: o.id === c.id ? !o.asc : true }))} className={orden.id === c.id ? 'orden' : ''}>{c.titulo}{orden.id === c.id ? (orden.asc ? ' ▲' : ' ▼') : ''}</th>)}</tr>
          <tr className="c-fc">{COLS.map(c => <th key={c.id}><input aria-label={`Filtrar ${c.titulo}`} value={fc[c.id] ?? ''} onChange={e => setFc(x => ({ ...x, [c.id]: e.target.value }))} /></th>)}</tr>
        </thead>
        <tbody>{vistas.map(x => <tr key={x.r.id} onClick={() => abrir(x.r.id)}>{COLS.map(c => {
          const v = c.v(x);
          if (c.id === 'tipo') { const i = infoTipo(x.tipo); return <td key={c.id}>{x.tipo ? <span className="chip" style={i ? { background: i.color, color: i.texto, borderColor: i.color } : {}}>{x.tipo}</span> : ''}</td>; }
          return <td key={c.id} className={c.num ? 'num' : ''}>{v ?? ''}</td>;
        })}</tr>)}</tbody>
      </table></div>
      <p className="tenue">{vistas.length} de {filas.length} fila(s).</p>
    </div>
  );
}

/* ───────── Mis herramientas ───────── */
export function Herramientas() {
  const [abierta, setAbierta] = useState<Herramienta | null>(null);
  if (abierta) return (
    <div className="c-visor">
      <div className="c-visor-barra"><button className="btn" onClick={() => setAbierta(null)}>← Volver al Centro</button><b>{abierta.icono} {abierta.nombre}</b><a className="btn mini" href={abierta.url} target="_blank" rel="noopener">Abrir aparte ↗</a></div>
      <iframe title={abierta.nombre} src={abierta.url} />
    </div>
  );
  return (
    <div className="c-herr">
      <p className="tenue">Todo en un solo lugar: la última versión de cada herramienta, sin copias repetidas. Las de Claude se abren en otra pestaña; las páginas que tenía solo en Descargas se abren aquí mismo.</p>
      {HERRAMIENTAS.map(g => (
        <section key={g.titulo} className="c-grupo">
          <h2>{g.icono} {g.titulo}</h2>
          <div className="c-herr-rej">
            {g.items.map(h => h.local
              ? <button key={h.nombre} className="c-herr-item" onClick={() => setAbierta(h)}><i>{h.icono}</i><span><b>{h.nombre}</b><small>{h.que}</small></span><em>Abrir</em></button>
              : <a key={h.nombre} className="c-herr-item" href={h.url} target="_blank" rel="noopener"><i>{h.icono}</i><span><b>{h.nombre}</b><small>{h.que}</small></span><em>↗</em></a>)}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ───────── Excel ───────── */
export async function excelDe(filas: Fila[], f: Filtro): Promise<Uint8Array> {
  const filtros = [f.tipoLabor && (f.tipoLabor === 'CAMARA' ? 'Cámaras' : 'Rampas'), f.rampa && `Rampa ${f.rampa}`, f.labor, (f.pkDesde || f.pkHasta) && `PK ${f.pkDesde || '…'} a ${f.pkHasta || '…'}`, f.tipo && `Tipo ${f.tipo}`, f.riesgo && `Riesgo ${f.riesgo}`, (f.fechaDesde || f.fechaHasta) && `Fechas ${f.fechaDesde || '…'} a ${f.fechaHasta || '…'}`, f.texto && `"${f.texto}"`].filter(Boolean).join(' · ');
  const sub = `Generado ${new Date().toLocaleString('es-PE')} · ${filtros ? `Filtros: ${filtros}` : 'Sin filtros'}`;
  const res = resumir(filas);
  const C = (titulo: string, ancho: number, num?: boolean, dec?: number): Columna => ({ titulo, ancho, num, dec });
  const tiposCols = TIPOS.map(t => C(`Tipo ${t.tipo} (m)`, 11, true));
  const resumen: Hoja = {
    nombre: 'Resumen por labor', titulo: 'CENTRO DE CONTROL LUDWIG JUSTA SUBTERRÁNEA · RESUMEN POR LABOR', subtitulo: sub,
    columnas: [C('Labor tipo', 11), C('Rampa', 9), C('Labor', 24), C('PK desde', 11), C('PK hasta', 11), C('Metros', 9, true), C('Mapeos', 9, true, 0), ...tiposCols, C('RMR prom.', 10, true, 0), C('RMR mín.', 10, true, 0), C('Q prom.', 10, true, 2), C('Cobertura mín. (m)', 12, true), C('Cobertura máx. (m)', 12, true)],
    filas: res.map(g => [g.tipoLabor === 'CAMARA' ? 'Cámara' : 'Rampa', g.rampa, g.labor, pkTexto(g.desde), pkTexto(g.hasta), g.metros, g.mapeos, ...TIPOS.map(t => g.porTipo.find(p => p.tipo === t.tipo)?.m ?? null), g.rmrProm, g.rmrMin, g.qProm, g.cobMin, g.cobMax]),
  };
  resumen.totales = ['TOTAL', '', '', '', '', Math.round(res.reduce((s, g) => s + g.metros, 0) * 10) / 10, res.reduce((s, g) => s + g.mapeos, 0), ...TIPOS.map(t => Math.round(res.reduce((s, g) => s + (g.porTipo.find(p => p.tipo === t.tipo)?.m ?? 0), 0) * 10) / 10), '', '', '', '', ''];
  const orden = [...filas].sort(ordenPk);
  const pkapk: Hoja = {
    nombre: 'PK a PK', titulo: 'CENTRO DE CONTROL LUDWIG JUSTA SUBTERRÁNEA · TRAMOS PK A PK', subtitulo: sub, colorTipo: 7,
    columnas: [C('Labor tipo', 10), C('Rampa', 8), C('Labor', 22), C('PK inicio', 11), C('Avance (m)', 9, true), C('PK final', 11), C('Cobertura (m)', 11, true), C('Tipo de roca', 10), C('RMR', 7, true, 0), C('Q corona', 9, true, 2), C('Litología', 14), C('Nivel de riesgo', 11), C('Fecha', 11), C('Turno', 8), C('N°', 8)],
    filas: orden.map(x => [lab(x), x.rampa, x.r.labor, x.r.desde, x.avance, x.r.hasta || pkTexto(x.pkFin), x.cob, x.tipo, x.rmr, x.q.CORONA, x.litologia, x.r.nivelRiesgo, x.r.fecha, x.r.turno, x.r.correlativo]),
  };
  const detalle: Hoja = {
    nombre: 'Detalle', titulo: 'CENTRO DE CONTROL LUDWIG JUSTA SUBTERRÁNEA · DETALLE DE MAPEOS', subtitulo: sub, colorTipo: 18,
    columnas: [C('Fecha', 11), C('Turno', 8), C('N°', 8), C('Labor tipo', 10), C('Rampa', 8), C('Labor', 22), C('PK rampa (empalme)', 12), C('PK inicio', 11), C('Avance (m)', 9, true), C('PK final', 11), C('Ancho (m)', 8, true), C('Alto (m)', 8, true), C('Azimut (°)', 8, true, 0), C('Cobertura (m)', 11, true), C('RMR H.I.', 8, true, 0), C('RMR Corona', 8, true, 0), C('RMR H.D.', 8, true, 0), C('RMR diseño', 8, true, 0), C('Tipo de roca', 10), C('Tipo (geólogo)', 10), C('Q H.I.', 8, true, 2), C('Q Corona', 8, true, 2), C('Q H.D.', 8, true, 2), C('Jv', 7, true), C('RQD (%)', 8, true, 0), C('Familias SD', 8, true, 0), C('Litología', 14), C('Nivel de riesgo', 11), C('Sostenimiento', 40), C('Supervisor', 22), C('Observaciones', 40), C('Subido al Centro', 16)],
    filas: orden.map(x => [x.r.fecha, x.r.turno, x.r.correlativo, lab(x), x.rampa, x.r.labor, x.r.pkRampa ?? '', x.r.desde, x.avance, x.r.hasta || pkTexto(x.pkFin), x.r.ancho, x.r.alto, x.r.azimut, x.cob, x.rmrZ.HI, x.rmrZ.CORONA, x.rmrZ.HD, x.rmr, x.tipo, x.r.tipoGeologo ?? '', x.q.HI, x.q.CORONA, x.q.HD, x.r.jv, x.rqd, x.familias, x.litologia, x.r.nivelRiesgo, (x.r.sostenimiento ?? []).join(' / '), x.r.supervisor, x.r.observaciones, x.r.panel?.subidoEn ? new Date(x.r.panel.subidoEn).toLocaleString('es-PE') : '']),
  };
  return libroExcel([resumen, pkapk, detalle], 'Centro de Control Justa Subterránea');
}

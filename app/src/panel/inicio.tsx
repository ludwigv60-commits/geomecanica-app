// Centro de Control Digital: cabecera ejecutiva y portada tipo centro de comando (MIS APLICATIVOS arriba,
// Mapeo Geomecánico destacado, KPIs reales y ecosistema de aplicativos). Todo se abre dentro del Centro.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TIPOS } from '../core/rmr';
import { EN_DESARROLLO, HERRAMIENTAS, PRINCIPALES, infoTipo, type Fila, type Herramienta } from './centro';
import { PESTANAS, type Pestana } from './vistas';

const TODAS = () => HERRAMIENTAS.flatMap(g => g.items);
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ───────── Cabecera ejecutiva ───────── */
export function Cabecera({ tab, ir, abrir, usuario, estado, aviso }: {
  tab: Pestana; ir: (t: Pestana) => void; abrir: (h: Herramienta) => void;
  usuario?: string; estado: 'ok' | 'cargando' | 'error'; aviso?: { texto: string; tipo: string } | null;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  const [q, setQ] = useState('');
  const [verAviso, setVerAviso] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    const on = () => setEnLinea(true), off = () => setEnLinea(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { clearInterval(t); removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  const res = useMemo(() => (q.trim().length < 2 ? [] : TODAS().filter(h => norm(`${h.nombre} ${h.que}`).includes(norm(q.trim()))).slice(0, 8)), [q]);
  const sistema = !enLinea ? { c: 'v-mal', t: 'Sin conexión' } : estado === 'ok' ? { c: 'v-ok', t: 'Sistema operativo' } : estado === 'cargando' ? { c: 'v-medio', t: 'Conectando…' } : { c: 'v-mal', t: 'Base sin respuesta' };
  return (
    <header className="cc-cab">
      <div className="cc-cab-fila">
        <div className="cc-marca">
          <img src="logo-lk.png" alt="" />
          <div><small>Justa Subterránea · LK Geomecánica</small><h1>CENTRO DE CONTROL <span>DIGITAL</span></h1></div>
        </div>
        <div className="cc-buscar">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Buscar aplicativo…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar aplicativo" />
          {res.length > 0 && <ul className="cc-res">{res.map(h => <li key={h.nombre}><button onClick={() => { setQ(''); abrir(h); }}><i>{h.icono}</i><span><b>{h.nombre}</b><small>{h.que}</small></span></button></li>)}</ul>}
          {q.trim().length >= 2 && !res.length && <ul className="cc-res"><li className="cc-res-vacio">Ningún aplicativo con “{q}”.</li></ul>}
        </div>
        <div className="cc-estado">
          <span className={`cc-led ${sistema.c}`} title={sistema.t}><i />{sistema.t}</span>
          <span className="cc-reloj"><b>{ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</b><small>{ahora.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</small></span>
          <button className={`cc-campana${aviso ? ' activa' : ''}`} aria-label="Notificaciones" onClick={() => setVerAviso(v => !v)}>🔔{aviso && <i />}</button>
          {verAviso && <div className="cc-noti" onClick={() => setVerAviso(false)}>{aviso ? <p className={aviso.tipo}>{aviso.texto}</p> : <p>Sin notificaciones nuevas.</p>}</div>}
          <span className="cc-usuario" title="Usuario conectado"><i>{(usuario || 'L').slice(0, 1).toUpperCase()}</i><span><b>{usuario || 'Ludwig'}</b><small>Conectado</small></span></span>
        </div>
      </div>
      <nav className="cc-tabs" role="tablist">
        {PESTANAS.map(p => <button key={p.id} role="tab" aria-selected={tab === p.id} className={tab === p.id ? 'sel' : ''} onClick={() => ir(p.id)}><span aria-hidden="true">{p.icono}</span> {p.nombre}</button>)}
      </nav>
    </header>
  );
}

/* ───────── Portada ───────── */
export function Inicio({ filas, ocultas, abrir, abrirMapeo, nuevo, recibir, recibiendo, ir, excel, alCelular, ultimoEnvio, sincro }: {
  filas: Fila[]; ocultas: string[]; abrir: (h: Herramienta) => void; abrirMapeo: (id: string) => void;
  nuevo?: () => void; recibir?: () => void; recibiendo: boolean; ir: (t: Pestana) => void; excel: () => void; alCelular?: () => void;
  ultimoEnvio?: string; sincro: { estado: string; texto: string };
}) {
  const todas = TODAS();
  const apps = PRINCIPALES.map(p => ({ ...p, h: todas.find(x => x.nombre === p.nombre) })).filter((p): p is typeof p & { h: Herramienta } => !!p.h && !ocultas.includes(p.nombre));
  const hoy = new Date();
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const dias = Array.from({ length: 14 }, (_, i) => dia(new Date(hoy.getTime() - (13 - i) * 864e5)));
  const porDia = dias.map(d => filas.filter(x => x.r.fecha === d).length);
  const max = Math.max(1, ...porDia);
  const mes = dia(hoy).slice(0, 7);
  const delMes = filas.filter(x => (x.r.fecha ?? '').startsWith(mes));
  const metros = Math.round(filas.reduce((s, x) => s + (x.avance && x.avance > 0 ? x.avance : 0), 0) * 10) / 10;
  const labores = [...new Set(filas.map(x => x.r.labor).filter(Boolean))];
  const semana = porDia.slice(7).reduce((a, b) => a + b, 0), semanaAnt = porDia.slice(0, 7).reduce((a, b) => a + b, 0);
  const tend = semana - semanaAnt;
  const porTipo = TIPOS.map(t => ({ t, m: filas.filter(x => x.tipo === t.tipo).reduce((s, x) => s + (x.avance && x.avance > 0 ? x.avance : 0), 0) })).filter(x => x.m > 0);
  const totTipo = porTipo.reduce((s, x) => s + x.m, 0);
  const activos = todas.filter(h => !/copia|versión anterior|segunda copia|juego|cv |empleo|revisión de cvs/i.test(`${h.nombre} ${h.que}`)).length;
  const sinc = sincro.estado === 'leyendo' ? { c: 'medio', t: 'Sincronizando con el celular…' } : sincro.estado === 'error' ? { c: 'mal', t: 'Sincronización con error' } : { c: 'ok', t: 'Sincronizado' };
  const pts = porDia.map((v, i) => `${(i / 13) * 100},${36 - (v / max) * 32}`).join(' ');

  const tarjeta = (p: (typeof apps)[number]) => (
    <button key={p.nombre} className="cc-app" style={{ '--c': p.color } as CSSProperties} onClick={() => abrir(p.h)}>
      <span className="cc-app-cab"><i>{p.h.icono}</i><span className="cc-pill ok"><b />Activo</span></span>
      <b>{p.corto}</b>
      <small>{p.h.que}</small>
      <span className="cc-app-pie"><span>{p.area}{p.act ? ` · ${p.act}` : ''}</span><em>Abrir →</em></span>
    </button>
  );

  return (
    <div className="cc-inicio">
      {/* MIS APLICATIVOS: todos iguales */}
      <section className="cc-sec">
        <div className="cc-sec-cab"><h2><span className="cc-dot" />MIS APLICATIVOS</h2><span>{apps.length} activos · se abren aquí dentro</span><button className="cc-link" onClick={() => ir('herramientas')}>Ver todas las herramientas →</button></div>
        <div className="cc-apps">
          {apps.map(p => tarjeta(p))}
          {EN_DESARROLLO.map(m => (
            <div key={m.nombre} className="cc-app dev">
              <span className="cc-app-cab"><i>{m.icono}</i><span className="cc-pill dev"><b />En desarrollo</span></span>
              <b>{m.nombre}</b><small>{m.que}</small>
              <span className="cc-app-pie"><span>Próximo módulo</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section>
        <div className="cc-sec-cab"><h2><span className="cc-dot" />RESUMEN EJECUTIVO</h2><span>Datos reales de la base del Centro</span></div>
        <div className="cc-kpis">
          <div><i>🧩</i><b>{apps.length}</b><span>aplicativos activos</span></div>
          <div><i>🗂️</i><b>{filas.length}</b><span>mapeos registrados</span></div>
          <div><i>⛰️</i><b>{delMes.length}</b><span>mapeos este mes</span></div>
          <div><i>📈</i><b className={tend > 0 ? 'sube' : tend < 0 ? 'baja' : ''}>{semana}<em> {tend > 0 ? '▲' : tend < 0 ? '▼' : '■'}{tend >= 0 ? '+' : ''}{tend}</em></b><span>últimos 7 días vs semana anterior</span></div>
          <div><i>📏</i><b>{metros}<em> m</em></b><span>de labor mapeada</span></div>
          <div><i>📍</i><b>{labores.length}</b><span>zonas evaluadas</span></div>
          <div><i>🔄</i><b className={`v-${sinc.c}`}>{sinc.c === 'ok' ? 'En línea' : sinc.c === 'medio' ? 'Leyendo' : 'Revisar'}</b><span>sincronización celular → Centro</span></div>
          <div><i>🛠️</i><b>{activos}</b><span>herramientas en total</span></div>
        </div>
      </section>

      {/* Actividad de mapeos */}
      <section>
        <div className="cc-sec-cab"><h2><span className="cc-dot" />ACTIVIDAD DE MAPEOS</h2><span>{ultimoEnvio && ultimoEnvio !== '—' ? `Último recibido: ${ultimoEnvio}` : 'Sin envíos todavía'}</span><button className="cc-link" onClick={() => ir('mapeos')}>Ver todos →</button></div>
        <div className="cc-actividad">
          <div className="cc-spark">
            <small>Registros por día · 14 días</small>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="ccsg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".45" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
              <polygon points={`0,40 ${pts} 100,40`} fill="url(#ccsg)" />
              <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </svg>
            {totTipo > 0 && <><small>Tipo de roca (metros)</small><div className="cc-tipos">{porTipo.map(x => <span key={x.t.tipo} style={{ width: `${(x.m / totTipo) * 100}%`, background: x.t.color }} title={`Tipo ${x.t.tipo}: ${Math.round(x.m)} m`} />)}</div>
              <div className="cc-tipos-ley">{porTipo.map(x => <span key={x.t.tipo}><i style={{ background: x.t.color }} />{x.t.tipo} {Math.round((x.m / totTipo) * 100)}%</span>)}</div></>}
          </div>
          <ul className="cc-ult">
            {filas.slice(0, 5).map(x => { const i = infoTipo(x.tipo); return (
              <li key={x.r.id}><button onClick={() => abrirMapeo(x.r.id)}>
                <span className="cc-chip" style={i ? { background: i.color, color: i.texto } : {}}>{x.tipo ?? '—'}</span>
                <span><b>{x.r.labor || 'Sin labor'}</b><small>PK {x.r.desde || '—'} · {x.r.fecha} {x.r.turno}</small></span>
                <em>RMR {x.rmr ?? '—'}</em>
              </button></li>); })}
            {!filas.length && <li className="cc-vacio">Todavía no hay mapeos.</li>}
          </ul>
          <div className="cc-acc">
            {nuevo && <button className="cc-btn" onClick={nuevo}>＋ Nuevo mapeo</button>}
            {recibir && <button className={`cc-btn${recibiendo ? ' apagado' : ''}`} onClick={recibir}>{recibiendo ? 'Recibiendo…' : '📨 Recibir del celular'}</button>}
            {filas[0] && <button className="cc-btn" onClick={() => abrirMapeo(filas[0]!.r.id)}>🧊 Cuñas 3D del último</button>}
            {alCelular && <button className="cc-btn" onClick={alCelular} disabled={!filas.length}>📲 Pasar al celular</button>}
            <button className="cc-btn" onClick={excel} disabled={!filas.length}>⬇ Excel</button>
            {sincro.estado !== 'nada' && sincro.texto && <small>📨 {sincro.texto}</small>}
          </div>
        </div>
      </section>

      {/* Ecosistema */}
      <section className="cc-eco">
        <div className="cc-sec-cab"><h2><span className="cc-dot" />ECOSISTEMA DIGITAL OPERATIVO</h2><span>Cómo viajan los datos entre sus aplicativos</span></div>
        <Ecosistema abrir={n => { const h = todas.find(x => x.nombre === n); if (h) abrir(h); }} ir={ir} />
      </section>
    </div>
  );
}

/* Diagrama: flujo real de los datos (sin inventar conexiones). */
function Ecosistema({ abrir, ir }: { abrir: (nombre: string) => void; ir: (t: Pestana) => void }) {
  type N = { id: string; x: number; y: number; t: string; s: string; i: string; c: string; on?: () => void };
  const N: N[] = [
    { id: 'cel', x: 90, y: 70, t: 'Celular en campo', s: 'APK y web · fotos + IA', i: '📱', c: '#22d3ee', on: () => abrir('App de mapeo geomecánico') },
    { id: 'mail', x: 300, y: 70, t: 'Puente Gmail', s: 'Envío 7:00 y 19:00', i: '📨', c: '#38bdf8' },
    { id: 'base', x: 510, y: 70, t: 'Base del Centro', s: 'Todos los mapeos', i: '🗄️', c: '#22d3ee', on: () => ir('mapeos') },
    { id: 'calc', x: 720, y: 70, t: 'RMR · Q · FS · Cuñas 3D', s: 'Procesamiento geomecánico', i: '🧊', c: '#2dd4bf' },
    { id: 'rep', x: 930, y: 70, t: 'Reportes PDF / Excel', s: 'Formato PRT-JS-CLD-16', i: '📑', c: '#a3e635', on: () => ir('tabla') },
    { id: 'pk', x: 720, y: 200, t: 'Resumen PK a PK', s: 'Tipo de roca por tramo', i: '📈', c: '#60a5fa', on: () => ir('resumen') },
    { id: 'malla', x: 90, y: 200, t: 'Mallas PERVOL', s: 'Diseño de malla', i: '🎯', c: '#fb923c', on: () => abrir('PERVOL Mallas Mina Justa') },
    { id: 'vale', x: 300, y: 200, t: 'Vale de explosivos', s: 'Se llena desde la malla', i: '🧨', c: '#f87171', on: () => abrir('Vale de explosivos') },
    { id: 'isure', x: 510, y: 200, t: 'Perforación iSURE 3D', s: 'Análisis del jumbo', i: '🛰️', c: '#2dd4bf', on: () => abrir('MAP · Perforación iSURE 3D') },
    { id: 'eq', x: 930, y: 200, t: 'Equipos y ciclo', s: 'Flota · simulador', i: '⛏️', c: '#a78bfa', on: () => abrir('Utilización de Equipos AESA') },
  ];
  const E: [string, string][] = [['cel', 'mail'], ['mail', 'base'], ['base', 'calc'], ['calc', 'rep'], ['base', 'pk'], ['malla', 'vale'], ['vale', 'isure'], ['isure', 'pk'], ['pk', 'eq']];
  const p = (id: string) => N.find(n => n.id === id)!;
  return (
    <div className="cc-eco-lienzo">
      <svg viewBox="0 0 1020 270" role="img" aria-label="Flujo de datos entre aplicativos">
        <defs>
          <filter id="ccbrillo"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {E.map(([a, b], k) => { const A = p(a), B = p(b); const d = A.y === B.y ? `M${A.x},${A.y} L${B.x},${B.y}` : `M${A.x},${A.y} C${A.x},${(A.y + B.y) / 2} ${B.x},${(A.y + B.y) / 2} ${B.x},${B.y}`; return (
          <g key={k}>
            <path d={d} className="cc-eco-linea" />
            <path d={d} className="cc-eco-flujo" style={{ animationDelay: `${k * 0.35}s` }} />
            <circle r="3.5" className="cc-eco-pulso" filter="url(#ccbrillo)"><animateMotion dur={`${2.6 + (k % 3) * 0.5}s`} repeatCount="indefinite" begin={`${k * 0.3}s`} path={d} /></circle>
          </g>); })}
        {N.map(n => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`cc-nodo${n.on ? ' activo' : ''}`} onClick={n.on} style={{ '--c': n.c } as CSSProperties} role={n.on ? 'button' : undefined} tabIndex={n.on ? 0 : undefined} onKeyDown={e => { if (e.key === 'Enter') n.on?.(); }}>
            <circle r="30" className="cc-nodo-halo" />
            <circle r="22" className="cc-nodo-c" />
            <text y="7" textAnchor="middle" fontSize="20">{n.i}</text>
            <text y="48" textAnchor="middle" className="cc-nodo-t">{n.t}</text>
            <text y="63" textAnchor="middle" className="cc-nodo-s">{n.s}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

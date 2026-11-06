// Centro de Control: datos derivados de cada mapeo (para filtros, resumen PK a PK, tabla y Excel)
// y el directorio de herramientas del usuario (artefactos de Claude y páginas HTML propias, sin repetidos).
import type { Listas, Reporte } from '../model';
import { calcular } from '../calc';
import { TIPOS, type TipoRoca } from '../core/rmr';
import { cobertura, esCamara, rampaDe, type Rampa } from '../core/cobertura';
import { pk } from '../ia/autollenado';

export type TipoLabor = 'RAMPA' | 'CAMARA';
type ReporteCentro = Reporte;

/** Cámara si la app lo marcó; en mapeos antiguos, según el nombre de la labor (misma regla que la app). */
export const tipoLaborDe = (r: ReporteCentro): TipoLabor => (esCamara(r) ? 'CAMARA' : 'RAMPA');

export interface Fila {
  r: Reporte;
  tipoLabor: TipoLabor;
  rampa: Rampa | '';
  pkIni: number | null; pkFin: number | null; avance: number | null;
  pkRampa: number | null;
  cob: number | null;
  rmr: number | null; tipo: TipoRoca | null;
  rmrZ: { HI: number | null; CORONA: number | null; HD: number | null };
  q: { HI: number | null; CORONA: number | null; HD: number | null };
  rqd: number | null;
  litologia: string;
  familias: number;
}

export function fila(r0: Reporte, listas?: Listas): Fila {
  const r = r0 as ReporteCentro;
  const c = calcular(r);
  const tipoLabor = tipoLaborDe(r);
  const pkIni = pk(r.desde ?? '');
  let pkFin = pk(r.hasta ?? '');
  if (pkFin == null && pkIni != null && r.avance != null) pkFin = Math.round((pkIni + r.avance) * 10) / 10;
  const avance = r.avance ?? (pkIni != null && pkFin != null ? Math.round((pkFin - pkIni) * 10) / 10 : null);
  const pkRampa = r.pkRampa ? pk(r.pkRampa) : null;
  // en cámaras la cobertura sale del PK de la rampa en el empalme; el informe muestra el PK propio de la cámara
  const cb = cobertura(r, listas?.coberturas, listas?.coberturaJusta !== false);
  const lit = r.litologia?.CORONA || r.litologia?.HI || r.litologia?.HD || '';
  return {
    r, tipoLabor, rampa: rampaDe(r), pkIni, pkFin, avance, pkRampa,
    cob: cb?.m ?? null,
    rmr: c.rmrFinal, tipo: c.tipoFinal,
    rmrZ: { HI: c.zonas.HI.total, CORONA: c.zonas.CORONA.total, HD: c.zonas.HD.total },
    q: { HI: c.zonas.HI.q, CORONA: c.zonas.CORONA.q, HD: c.zonas.HD.q },
    rqd: c.rqd != null ? Math.round(c.rqd) : null,
    litologia: lit,
    familias: (r.familias ?? []).filter(f => f.abrev === 'SD').length,
  };
}

/** "0+924.7" a partir de metros. */
export function pkTexto(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '';
  const k = Math.floor(m / 1000), r = m - k * 1000;
  return `${k}+${r.toFixed(1).padStart(5, '0')}`;
}
export const infoTipo = (t: TipoRoca | null) => (t ? TIPOS.find(x => x.tipo === t) : undefined);

export interface Filtro { texto: string; tipoLabor: '' | TipoLabor; rampa: '' | Rampa; labor: string; pkDesde: string; pkHasta: string; tipo: '' | TipoRoca; fechaDesde: string; fechaHasta: string; riesgo: string }
export const FILTRO_VACIO: Filtro = { texto: '', tipoLabor: '', rampa: '', labor: '', pkDesde: '', pkHasta: '', tipo: '', fechaDesde: '', fechaHasta: '', riesgo: '' };

export function filtrar(filas: Fila[], f: Filtro): Fila[] {
  const d = f.pkDesde ? pk(f.pkDesde) : null, h = f.pkHasta ? pk(f.pkHasta) : null;
  const s = f.texto.trim().toLowerCase();
  return filas.filter(x => {
    if (f.tipoLabor && x.tipoLabor !== f.tipoLabor) return false;
    if (f.rampa && x.rampa !== f.rampa) return false;
    if (f.labor && x.r.labor !== f.labor) return false;
    if (f.tipo && x.tipo !== f.tipo) return false;
    if (f.riesgo && x.r.nivelRiesgo !== f.riesgo) return false;
    if (f.fechaDesde && (x.r.fecha ?? '') < f.fechaDesde) return false;
    if (f.fechaHasta && (x.r.fecha ?? '') > f.fechaHasta) return false;
    // tramo PK a PK: entra todo mapeo que se cruce con el rango pedido
    if (d != null || h != null) {
      if (x.pkIni == null) return false;
      const a = x.pkIni, b = x.pkFin ?? x.pkIni;
      if (d != null && b < d) return false;
      if (h != null && a > h) return false;
    }
    return !s || [x.r.labor, x.r.desde, x.r.hasta, x.r.supervisor, x.r.fecha, x.r.correlativo, x.r.observaciones, x.litologia, x.tipo].join(' ').toLowerCase().includes(s);
  });
}

/** Orden natural de un reporte de avance: labor y luego PK. */
export const ordenPk = (a: Fila, b: Fila) => (a.r.labor ?? '').localeCompare(b.r.labor ?? '', 'es') || (a.pkIni ?? 0) - (b.pkIni ?? 0) || (a.r.fecha ?? '').localeCompare(b.r.fecha ?? '');

export interface Resumen { labor: string; tipoLabor: TipoLabor; rampa: Rampa | ''; desde: number | null; hasta: number | null; metros: number; mapeos: number; porTipo: { tipo: TipoRoca; m: number }[]; rmrProm: number | null; rmrMin: number | null; qProm: number | null; cobMin: number | null; cobMax: number | null; tramos: Fila[] }

/** Resumen por labor: metros por tipo de roca, RMR y Q promedio, cobertura. */
export function resumir(filas: Fila[]): Resumen[] {
  const g = new Map<string, Fila[]>();
  for (const x of filas) { const k = x.r.labor || 'Sin labor'; g.set(k, [...(g.get(k) ?? []), x]); }
  return [...g.entries()].map(([labor, l]) => {
    const t = [...l].sort(ordenPk);
    const m = (x: Fila) => x.avance ?? 0;
    const metros = t.reduce((s, x) => s + m(x), 0);
    const porTipo = TIPOS.map(ti => ({ tipo: ti.tipo, m: t.filter(x => x.tipo === ti.tipo).reduce((s, x) => s + m(x), 0) })).filter(x => x.m > 0);
    const rm = t.filter(x => x.rmr != null), qs = t.filter(x => x.q.CORONA != null), cs = t.map(x => x.cob).filter((x): x is number => x != null);
    // RMR promedio ponderado por los metros de cada avance (si no hay avance, cuenta 1)
    const w = (x: Fila) => (x.avance && x.avance > 0 ? x.avance : 1);
    const rmrProm = rm.length ? Math.round(rm.reduce((s, x) => s + x.rmr! * w(x), 0) / rm.reduce((s, x) => s + w(x), 0)) : null;
    const pks = t.flatMap(x => [x.pkIni, x.pkFin]).filter((x): x is number => x != null);
    return {
      labor, tipoLabor: t[0]!.tipoLabor, rampa: t[0]!.rampa,
      desde: pks.length ? Math.min(...pks) : null, hasta: pks.length ? Math.max(...pks) : null,
      metros: Math.round(metros * 10) / 10, mapeos: t.length, porTipo,
      rmrProm, rmrMin: rm.length ? Math.min(...rm.map(x => x.rmr!)) : null,
      qProm: qs.length ? Math.round((qs.reduce((s, x) => s + x.q.CORONA!, 0) / qs.length) * 100) / 100 : null,
      cobMin: cs.length ? Math.min(...cs) : null, cobMax: cs.length ? Math.max(...cs) : null,
      tramos: t,
    };
  }).sort((a, b) => (a.tipoLabor === b.tipoLabor ? a.labor.localeCompare(b.labor, 'es') : a.tipoLabor === 'RAMPA' ? -1 : 1));
}

/* ───────── Herramientas: un solo lugar para todo, sin repetidos ───────── */
export interface Herramienta { nombre: string; que: string; url: string; local?: boolean; icono: string }
export interface Grupo { titulo: string; icono: string; items: Herramienta[] }
const A = (id: string) => `https://claude.ai/artifact/${id}`;
const H = (archivo: string) => `herramientas/${archivo}`;

export const HERRAMIENTAS: Grupo[] = [
  { titulo: 'Geomecánica', icono: '⛰️', items: [
    { icono: '📱', nombre: 'App de mapeo geomecánico', que: 'Llenar el formato PRT-JS-CLD-16 en el celular', url: 'https://ludwigv60-commits.github.io/geomecanica-app/formulario/' },
    { icono: '🗂️', nombre: 'Datos Justa para la app', que: 'Descargar la base histórica privada y cargarla en la app', url: A('41NVZkPXLVcCPREzdFaRoL') },
    { icono: '🧭', nombre: 'Dip y dip dir con el celular', que: 'Medir buzamiento y dirección con los sensores', url: A('SpwTCHt9zGiVh8bFyXy6Qj') },
    { icono: '🧊', nombre: 'Medir dip en 3D', que: 'Orientación de estructuras sobre un modelo 3D', url: A('RghRytmm2cN8R9RerzGmDS') },
    { icono: '🔺', nombre: 'Ejemplo real: cuña Rampa Norte', que: 'Cuña F1+SD5 del 03/10/2026, sin y con sostenimiento', url: A('G3chjNB8aFzehweWLqGg69') },
    { icono: '📐', nombre: 'Diseño de la app', que: 'Entendimiento, riesgos y arquitectura', url: A('RXJzd7B8YSvGUysMXG3VdG') },
  ] },
  { titulo: 'Perforación y voladura', icono: '💥', items: [
    { icono: '🎯', nombre: 'PERVOL Mallas Mina Justa', que: 'Diseñador de mallas de perforación', url: A('QpHY3XzD5uZaUZ4DxwnSt8') },
    { icono: '🔍', nombre: 'Análisis crítico de mallas', que: 'Revisión de las mallas actuales', url: A('FD6NH2AaBvtF64gyVqfRxS') },
    { icono: '🧾', nombre: 'Prompt maestro PERVOL', que: 'Instrucciones del diseñador de mallas', url: A('3PxpZCa8zzrpytHArJoEA5') },
    { icono: '🛰️', nombre: 'MAP · Perforación iSURE 3D', que: 'Análisis de perforación del jumbo (versión 59)', url: H('map-perforacion-isure-3d.html'), local: true },
    { icono: '👷', nombre: 'Comparación de perforación', que: 'Dos operadores en el Frente Sur', url: H('comparacion-perforacion.html'), local: true },
    { icono: '⚡', nombre: 'Speedy Bit vs Alpha', que: 'Broca 48 mm 14 pies vs botones 12 pies', url: A('HKDCRqgW7sj7Bt1rSqaU27') },
    { icono: '💲', nombre: 'Speedy Bit: velocidad y rentabilidad', que: 'Cuánto genera y cuánto cuesta', url: A('GZUZXfmRWoTgjKmznyAeUs') },
    { icono: '🧨', nombre: 'Vale de explosivos', que: 'Llenado automático desde la malla', url: H('vale-explosivos.html'), local: true },
  ] },
  { titulo: 'Shotcrete', icono: '🏗️', items: [
    { icono: '💰', nombre: 'Valorización Shotcrete AESA', que: 'Valorización mensual (versión más reciente)', url: A('Sni5Dztb5Lqd2xixjd8rui') },
    { icono: '📘', nombre: 'Cómo se calcula la valorización', que: 'Método, setiembre 2026', url: A('Sw9ZTa2NHRNwadPjxiXGKQ') },
    { icono: '📏', nombre: 'Shotcrete por rendimiento m²/m³', que: 'Julio y agosto 2026', url: H('shotcrete-rendimiento.html'), local: true },
    { icono: '🛡️', nombre: 'Guardias Shotcrete y Calidad', que: 'Control por guardia', url: A('TBMGaYP5jajy5g5z4LoELS') },
  ] },
  { titulo: 'Equipos y ciclo', icono: '🚜', items: [
    { icono: '📊', nombre: 'Utilización de Equipos AESA', que: 'Centro de control de flota (versión del 05-nov)', url: H('utilizacion-equipos.html'), local: true },
    { icono: '⚙️', nombre: 'Rendimiento de Equipos Justa', que: 'Real vs estándar por equipo', url: A('DKmTK1wJcWX1q5jUM5gUPC') },
    { icono: '🔄', nombre: 'Ciclo operativo Rampa Sur', que: '22 de setiembre', url: A('EX6U5K9hRkk6asb2WE7Bkv') },
    { icono: '📅', nombre: 'Corrida Rampa Norte', que: 'Avance e intersección de cámaras', url: A('8UikAoJaCnu97ALLawfkSk') },
    { icono: '⏱️', nombre: 'Ventana horaria Rampa Norte', que: 'Horas disponibles del frente', url: A('MQxgh55Jrn3VMt2p3DYKU1') },
    { icono: '🪣', nombre: 'Caso de negocio: 3 cucharas', que: 'Scoop con 3 cucharas vs 2', url: A('SJy6XkxtftYch5yBxUp9xF') },
    { icono: '⌛', nombre: 'Horas de scoop: 2 vs 3 cucharas', que: 'Detalle de horas', url: A('AzFaxga8BrnXcDcDt7yWRZ') },
    { icono: '➕', nombre: 'Horas de scoop de más', que: 'Con 2 cucharas', url: A('FqzuhyhTvsWfXjQV4F4D65') },
    { icono: '🪨', nombre: 'Sobrerotura vs Scoop R2900G', que: 'Limpieza extra por 12 % de sobrerotura', url: A('FYhqg3TbtL3CEgC7JokEEC') },
    { icono: '🚚', nombre: 'Flota de volquetes', que: 'Dimensionamiento por meses', url: H('flota-volquetes.html'), local: true },
  ] },
  { titulo: 'Gestión y seguridad', icono: '🦺', items: [
    { icono: '🧑‍💼', nombre: 'Desvíos y supervisión', que: 'Horas perdidas en el ámbito del supervisor', url: A('X8hVjbxvoeZaN5sPzwMtrT') },
    { icono: '📄', nombre: 'Actualizador de PETS', que: 'Con filtro por ingeniero', url: H('actualizador-pets.html'), local: true },
    { icono: '🎤', nombre: 'Talento en Avance', que: 'Presentación del programa trainee', url: H('talento-en-avance.html'), local: true },
  ] },
  { titulo: 'Otras versiones y copias de Descargas', icono: '🗄️', items: [
    { icono: '🎯', nombre: 'PERVOL Mallas (copia de Descargas)', que: 'Versión 8 del 30-oct', url: H('mallas-pervol.html'), local: true },
    { icono: '💰', nombre: 'Valorización Shotcrete (copia de Descargas)', que: 'Versión 11 del 29-oct', url: H('valorizacion-shotcrete.html'), local: true },
    { icono: '📊', nombre: 'Valorización shotcrete julio vs agosto', que: 'Dashboard anterior', url: H('shotcrete-jul-vs-ago.html'), local: true },
    { icono: '📊', nombre: 'Valorización shotcrete jul-ago 2026', que: 'Dashboard anterior', url: H('shotcrete-jul-ago-2026.html'), local: true },
    { icono: '⚙️', nombre: 'Rendimiento de equipos (copia de Descargas)', que: 'Versión 8', url: H('rendimiento-equipos.html'), local: true },
    { icono: '📐', nombre: 'Capacidad de los equipos del ciclo', que: 'Real vs capacidad teórica', url: H('capacidades-equipos.html'), local: true },
    { icono: '🔄', nombre: 'Ciclo Rampa Sur 22-sep (copia)', que: 'Copia de Descargas', url: H('ciclo-rampa-sur.html'), local: true },
    { icono: '📅', nombre: 'Gantt Rampa Norte', que: 'Corrida de avance, cámaras 1 y 2', url: H('gantt-rampa-norte.html'), local: true },
    { icono: '🗓️', nombre: 'Cronograma en colores', que: 'Cronograma de agosto', url: H('cronograma.html'), local: true },
    { icono: '⚡', nombre: 'Speedy Bit vs Alpha (copia)', que: 'Copia de Descargas', url: H('speedy-vs-alpha.html'), local: true },
    { icono: '💲', nombre: 'Speedy Bit rentabilidad (copia)', que: 'Copia de Descargas', url: H('speedy-rentabilidad.html'), local: true },
    { icono: '🪨', nombre: 'Sobrerotura vs Scoop (copia)', que: 'Copia de Descargas', url: H('sobrerotura-scoop.html'), local: true },
    { icono: '🧑‍💼', nombre: 'Desvíos del supervisor (copia)', que: 'Versión descargable', url: H('desvios-supervisor.html'), local: true },
    { icono: '🧑‍💼', nombre: 'Desvíos del supervisor (otro artefacto)', que: 'Versión anterior en Claude', url: A('JoKgbJeWRG28fPTZWCdQgZ') },
    { icono: '⚙️', nombre: 'Rendimiento de equipos (otro artefacto)', que: 'Segunda copia en Claude', url: A('UUTWyHpGSDyNRkNVZ7nD7a') },
    { icono: '🛰️', nombre: 'MAP · Perforación iSURE (2D)', que: 'Versión anterior sin 3D', url: H('map-perforacion-isure-2d.html'), local: true },
    { icono: '💣', nombre: 'Buscaminas', que: 'Juego', url: H('buscaminas.html'), local: true },
  ] },
  { titulo: 'Personal', icono: '👤', items: [
    { icono: '🔎', nombre: 'Súper búsqueda de empleo', que: 'Minería junior', url: A('ShQov8uAZVdJgShCmaXBo6') },
    { icono: '📝', nombre: 'Revisión de CVs por puesto', que: 'Versiones del CV', url: A('TNPgJsPgJWftabJL2HhCRf') },
    { icono: '🎓', nombre: 'CV Geólogo de Modelamiento', que: 'CV listo', url: A('E1XWkynXT1U8XmWgRrEz9r') },
  ] },
];

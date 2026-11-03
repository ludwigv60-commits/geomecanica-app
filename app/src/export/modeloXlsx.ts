// Excel del REPORTE MODELO (A4 vertical, ajustado al ancho): mismas secciones que el PDF del reporte modelo.
import type { Listas, Reporte } from '../model';
import { TIPOS } from '../core/rmr';
import { datosModelo, LEYENDA, clasesLeyenda } from './modelo';
import { Libro, type Estilo } from './xlsxSimple';
import { analizarCunas, resumen } from './cunas2d';

const AZUL = '#0D2A6B', GRIS = '#E9EDF4', N = 20; // 20 columnas de ancho 5 ≈ ancho útil de un A4
const n = (v: number | null | undefined, d = 0) => (v == null ? '—' : d ? Number(v.toFixed(d)) : v);
const cTipo = (t: string | null): Estilo => { const x = TIPOS.find(k => k.tipo === t); return x ? { fondo: x.color, color: x.texto, b: true } : { b: true }; };

export interface ImagenesModelo { planta?: Uint8Array; seccion?: Uint8Array; frente?: Uint8Array }

export async function generarModeloXlsx(r: Reporte, listas?: Partial<Listas>, img: ImagenesModelo = {}): Promise<Uint8Array> {
  const d = datosModelo(r, listas);
  const L = new Libro('REPORTE MODELO', Array(N).fill(5.2));
  let f = 0;
  type C = [v: string | number | null | undefined, span: number, e?: Estilo];
  const fila = (cs: C[], alto?: number) => { let c = 0; for (const [v, s, e] of cs) { L.poner(f, c, v, e ?? {}, s > 1 ? [f, c + s - 1] : undefined); c += s; } if (alto) L.alto(f, alto); f++; };
  const titulo = (t: string) => { L.poner(f, 0, t, { b: true, color: AZUL, tam: 10, izq: true, borde: false }, [f, N - 1]); L.alto(f, 18); f++; };
  const barra = (t: string) => fila([[t, N, { b: true, color: '#FFFFFF', fondo: AZUL, tam: 11 }]], 18);
  const texto = (t: string, alto: number, negrita?: string) => fila([[negrita ? `${negrita} ${t}` : t, N, { izq: true, ajustar: true, arriba: true, borde: false }]], alto);
  const H: Estilo = { b: true, fondo: GRIS, tam: 8 }, HA: Estilo = { b: true, fondo: AZUL, color: '#FFFFFF', tam: 8.5 };
  const encabezado = () => {
    fila([[d.titulo, 10, { b: true, tam: 16, color: AZUL, izq: true, fondo: GRIS }], [d.proyecto, 10, { b: true, fondo: GRIS }]], 24);
    fila([['Mapeo geomecánico PRT-JS-CLD-16 · Ficha VG', 10, { izq: true, fondo: GRIS, tam: 8 }], ['Caracterización geomecánica y clasificación de roca', 10, { fondo: GRIS, tam: 8 }]], 14);
  };

  // ---------- Hoja 1 ----------
  encabezado(); barra(d.ficha);
  fila([['FRENTE / LABOR', 7, H], ['RAMPA', 3, H], ['N° CORRELATIVO', 3, H], ['SUP. DE GEOMECÁNICA', 7, H]]);
  fila([[d.labor || '—', 7], [d.rampa || '—', 3], [d.correlativo || '—', 3], [d.supervisor || '—', 7]]);
  fila([['PROGRESIVAS', 7, H], ['AVANCE', 3, H], ['PK DE COBERTURA', 3, H], ['COBERTURA', 7, H]]);
  fila([[d.desde || '—', 4], [d.hasta || '—', 3], [d.avance != null ? `${d.avance} m` : '—', 3], [d.cobertura ? Number(d.cobertura.pk.toFixed(1)) : '—', 3],
    [d.cobertura ? `${d.cobertura.m} m` : d.rampa ? 'falta tabla de cobertura' : 'marque la rampa', 7, { b: true, tam: 11 }]], 18);
  fila([['FECHA', 3, H], ['TURNO', 3, H], ['HORA', 2, H], ['ANCHO', 3, H], ['ALTO', 3, H], ['AZIMUT', 3, H], ['RIESGO', 3, H]]);
  fila([[d.fecha ? d.fecha.split('-').reverse().join('/') : '—', 3], [d.turno || '—', 3], [d.hora || '—', 2], [d.ancho != null ? `${d.ancho} m` : '—', 3], [d.alto != null ? `${d.alto} m` : '—', 3], [d.azimut != null ? `${Math.round(d.azimut)}° UTM` : '—', 3], [d.riesgo || '—', 3]]);
  titulo('Clasificación RMR89 (Bieniawski) por zona');
  fila([['Parámetro', 5, HA], ...d.zonas.map(z => [`${z.nombre}${z.litologia ? ` · ${z.litologia}` : ''}`, 5, HA] as C)]);
  d.zonas[0]!.params.forEach((p, i) => fila([[p.nombre, 5, { izq: true, tam: 8 }], ...d.zonas.flatMap(z => [[z.params[i]!.clase || '—', 4, { izq: true, tam: 7.5 }], [n(z.params[i]!.puntaje), 1, { b: true }]] as C[])]));
  fila([['RMR básico', 5, { ...H, izq: true }], ...d.zonas.map(z => [n(z.basico), 5, H] as C)]);
  fila([['Ajuste por orientación', 5, { izq: true }], ...d.zonas.map(z => [n(z.ajuste), 5] as C)]);
  fila([['RMR corregido (RMR c)', 5, { ...H, izq: true }], ...d.zonas.map(z => [n(z.total), 5, H] as C)]);
  fila([['Tipo de roca', 5, { b: true, izq: true }], ...d.zonas.map(z => [z.tipo ? `ST-${z.tipo}` : '—', 5, cTipo(z.tipo)] as C)]);
  titulo("Valuación del parámetro Q según Barton · Q' y GSI");
  fila([['Parámetro', 5, HA], ...d.zonas.map(z => [z.nombre, 5, HA] as C)]);
  const filasQ: [string, (z: (typeof d.zonas)[number]) => string | number, boolean?][] = [
    ['RQD (%)', z => n(z.rqd)], ['Jn', z => n(z.jn)], ['Jr', z => n(z.jr)], ['Ja', z => n(z.ja)], ['Jw', z => n(z.jw)], ['SRF', z => n(z.srf)],
    ['Q = (RQD/Jn)·(Jr/Ja)·(Jw/SRF)', z => n(z.q), true], ["Q' = (RQD/Jn)·(Jr/Ja)", z => n(z.qPrima), true], ["GSI = 9·ln(Q') + 44", z => n(z.gsi), true], ['Clase Q', z => z.claseQ ?? '—']];
  for (const [t, v, b] of filasQ) fila([[t, 5, b ? { ...H, izq: true } : { izq: true }], ...d.zonas.map(z => [v(z), 5, b ? H : {}] as C)]);
  texto('Clase I: Q>60 · II-A: 7<Q≤60 · III-A: 0,64<Q≤7 · IV-F: 0,08<Q≤0,64 · V-(E,F): Q≤0,08.   Roca tipo I/II 66≤RMRc≤100 · IIIA 57-65 · IIIB 45-56 · IV 36-44 · V 0-35.', 24);
  fila([['RMR DE DISEÑO', 5, H], [n(d.rmrFinal), 3, { b: true, tam: 12 }], ['TIPO DE SOSTENIMIENTO', 6, H], [d.tipoSostenimiento || '—', 6, { ...cTipo(d.tipoFinal), tam: 12 }]], 22);
  if (d.sostenimiento.length) texto(d.sostenimiento.map(l => `• ${l}`).join('\n'), 14 + 12 * d.sostenimiento.length, 'Indicación de sostenimiento:\n');
  L.salto(f);

  // ---------- Hoja 2 ----------
  encabezado(); barra('Levantamiento geológico y clasificación geomecánica');
  texto(d.formacion || '—', 16, 'Formación geológica / Alteración:');
  texto(d.macizo || '—', Math.max(30, Math.ceil(d.macizo.length / 120) * 12 + 6), 'Macizo rocoso:');
  texto(d.discontinuidades, 14 + 12 * (d.estructuras.length + 1), 'Discontinuidades:');
  titulo('Discontinuidades');
  const spans = [1, 2, 4, 2, 2, 2, 2, 5];
  fila(['Item', 'Código', 'Tipo', 'Dip', 'Dip Dir.', 'Espac. (m)', 'Pers. (m)', 'S-L-T-R-F-A-W'].map((t, i) => [t, spans[i]!, HA] as C));
  d.estructuras.forEach((e, i) => fila([[i + 1, 1], [e.codigo, 2, { b: true }], [e.tipo, 4, { tam: 8 }], [e.dip != null ? Math.round(e.dip) : '—', 2], [e.dipdir != null ? String(Math.round(e.dipdir)).padStart(3, '0') : '—', 2],
    [n(e.espaciamiento, 2), 2], [n(e.persistencia, 1), 2], [e.slt, 5, { b: true }]]));
  if (!d.estructuras.length) fila([['Sin estructuras medidas', N]]);
  f++;
  // leyenda: 1 col de número + 7 parámetros (spans 3,3,3,3,3,2,2 = 19)
  const sp = [3, 2, 3, 3, 3, 3, 2];
  fila([['', 1, H], ...LEYENDA.map((l, i) => [`${l.nombre} (${l.letra})`, sp[i]!, { ...H, tam: 7.5 }] as C)]);
  for (let k = 0; k < 5; k++) fila([[k + 1, 1, H], ...LEYENDA.map((l, i) => [clasesLeyenda(l.id)[k] ?? '', sp[i]!, { tam: 7.5 }] as C)]);
  titulo('Vista en planta y vista en sección');
  const r0 = f, filasV = 24;
  for (let i = 0; i < filasV; i++) { L.alto(f, 15); f++; }
  L.poner(r0, 0, img.planta ? '' : 'Faltan azimut y estructuras', { tam: 8 }, [r0 + filasV - 1, 9]); L.poner(r0, 10, '', {}, [r0 + filasV - 1, N - 1]);
  if (img.planta) L.imagen(img.planta, 'png', [0, r0, 10, r0 + filasV]);
  if (img.seccion) L.imagen(img.seccion, 'png', [10, r0, N, r0 + filasV]);
  L.salto(f);

  // ---------- Hoja 3 ----------
  encabezado(); barra(d.ficha);
  const rf = f, filasF = 26;
  for (let i = 0; i < filasF; i++) { L.alto(f, 15); f++; }
  L.poner(rf, 0, img.frente ? '' : 'Sin foto del frente', { tam: 9 }, [rf + filasF - 1, N - 1]);
  if (img.frente) L.imagen(img.frente, 'jpeg', [2, rf, N - 2, rf + filasF]);
  fila([['Frontal', N, H]]);
  const a = analizarCunas(r), rs = a && a.bloques.length ? resumen(a) : null;
  texto(rs ? `${a!.bloques.length} cuñas potenciales en la zona de influencia; ${rs.caen} caen al desatar (FS<1), ${rs.desatadas} se retiran con el desatado y quedan ${rs.quedan}; con el sostenimiento indicado el FS mínimo es ${rs.fsMin == null ? '—' : rs.fsMin > 10 ? 'mayor que 10' : rs.fsMin.toFixed(2)}.` : 'Sin cuñas potenciales con las estructuras medidas.', 30, 'Perfil de la sección de excavación:');
  texto(d.observaciones || '—', 40, 'Observaciones:');
  const verif = Object.entries(d.verificacion).filter(([, v]) => v);
  if (verif.length) texto(verif.map(([k, v]) => `${k}: ${v}`).join(' · '), 16, 'Verificación del sostenimiento:');
  if (d.adicionales.length) texto(d.adicionales.map(x => `${x.fecha} ${x.hora} ${x.nombre}: ${x.indicacion}`).join('\n'), 14 + 12 * d.adicionales.length, 'Indicaciones adicionales:\n');
  f++;
  fila(d.firmas.slice(0, 4).map(x => [x.rol, 5, { ...H, tam: 7.5 }] as C));
  fila(d.firmas.slice(0, 4).map(x => [`Nombre: ${x.nombre}`, 5, { izq: true, tam: 7.5 }] as C), 22);
  fila(d.firmas.slice(0, 4).map(x => [`Fecha: ${x.fecha ? x.fecha.split('-').reverse().join('/') : ''}`, 5, { izq: true, tam: 7.5 }] as C));
  return L.generar(`Reporte modelo ${r.labor} ${r.desde}`);
}

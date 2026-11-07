import { NumIn } from './NumIn';
import { olvidarSesion } from '../ia/onnx';
import { useEffect, useState } from 'react';
import type { Listas } from '../model';
import { RAMPAS, type ParamCobertura, type Rampa } from '../core/cobertura';
import { guardarConfig, leerConfig } from '../store';

const NOMBRES: Record<'labores' | 'supervisores' | 'litologias' | 'riesgos', string> = { labores: 'Labores', supervisores: 'Supervisores de geomecánica', litologias: 'Litologías', riesgos: 'Niveles de riesgo' };

export function EditorListas({ listas, historialBD = 0, onHistorial, onGuardar, onCancelar }: { listas: Listas; historialBD?: number; onHistorial?: () => void; onGuardar: (l: Listas) => void; onCancelar: () => void }) {
  const [l, setL] = useState<Listas>(structuredClone(listas));
  const [msgBd, setMsgBd] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<{ ok: boolean; t: string } | null>(null);
  const probar = async () => {
    setPrueba({ ok: true, t: 'Probando…' });
    try { const { probarPuente } = await import('../export/autoenvio'); setPrueba({ ok: true, t: await probarPuente(l.puenteUrl ?? '') }); }
    catch (e) { setPrueba({ ok: false, t: `✗ ${(e as Error).message}` }); }
  };
  const importar = async (f: File | undefined) => {
    if (!f) return;
    setMsgBd('Leyendo…');
    try { const { cargarDatos } = await import('../ia/paquete'); setMsgBd(await cargarDatos(f)); onHistorial?.(); }
    catch (e) { setMsgBd(`No se pudo leer: ${(e as Error).message}`); }
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
          <label className="btn mini">📥 Importar .xlsx o paquete .json<input type="file" hidden onChange={e => { importar(e.target.files?.[0]); e.target.value = ''; }} /></label>
          {historialBD > 0 && <button className="btn mini" onClick={async () => { await guardarConfig('historialBD', []); onHistorial?.(); setMsgBd('Historial quitado.'); }}>Quitar historial</button>}
          {msgBd && <p className="ayuda">{msgBd}</p>}
        </section>
        <ModeloPrivado />
        <section className="tarjeta">
          <h3>Cobertura</h3>
          <label className="interruptor"><input type="checkbox" checked={l.coberturaJusta !== false} onChange={e => setL({ ...l, coberturaJusta: e.target.checked })} />
            <span><b>Cobertura de Justa Subterránea</b><small>Rampas Norte y Sur con la tabla de los formatos VG</small></span></label>
          {l.coberturaJusta !== false
            ? <p className="ayuda">Activa: la cobertura sale sola con el PK y la rampa. Apáguela para trabajar en otra mina y escribir su tabla.</p>
            : <>
              <p className="ayuda">Otra mina: escriba la tabla de cada rampa. Cobertura = (base + PK − PK de inicio) · sen(ángulo).</p>
              {RAMPAS.map(rp => { const c = l.coberturas?.[rp]; const pon = (k: keyof ParamCobertura, v: number | null) => {
                const n: Partial<ParamCobertura> = { ...c, [k]: v ?? undefined };
                const t = { ...l.coberturas } as Partial<Record<Rampa, ParamCobertura>>;
                if (n.base == null && n.pkInicio == null && n.angulo == null) delete t[rp]; else t[rp] = { base: n.base ?? 0, pkInicio: n.pkInicio ?? 0, angulo: n.angulo ?? 0 };
                setL({ ...l, coberturas: t }); };
                return <div key={rp} className="rejilla3"><b className="campo-titulo">Rampa {rp}</b>
                  <label className="campo"><span>Base (m)</span><NumIn valor={c?.base ?? null} on={v => pon('base', v)} /></label>
                  <label className="campo"><span>PK de inicio (m)</span><NumIn valor={c?.pkInicio ?? null} on={v => pon('pkInicio', v)} /></label>
                  <label className="campo"><span>Ángulo (°)</span><NumIn valor={c?.angulo ?? null} on={v => pon('angulo', v)} /></label></div>; })}
            </>}
        </section>
        <section className="tarjeta">
          <h3>Envío automático al Centro de Control</h3>
          <p className="ayuda">Pegue la URL del puente de su cuenta Google (termina en /exec?k=SU_CLAVE). Con internet, cada mapeo nuevo o modificado se envía solo y el Centro de Control lo carga al abrirse. Vacío = envío manual con ☁️ Enviar.</p>
          <label className="campo"><span>URL del puente al Centro</span><input value={l.puenteUrl ?? ''} placeholder="https://script.google.com/macros/s/…/exec?k=SU_CLAVE" onChange={e => { setPrueba(null); setL({ ...l, puenteUrl: e.target.value.trim() || undefined }); }} /></label>
          <div className="fila-btn"><button className="btn" disabled={!l.puenteUrl} onClick={probar}>🔌 Probar conexión</button></div>
          {prueba && <p className={prueba.ok ? 'ayuda' : 'alerta'}>{prueba.t}</p>}
          {l.puenteUrl && <p className="ayuda">Recuerde tocar <b>Guardar</b> abajo para que quede activo.</p>}
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

/** Modelo de IA de trazas entrenado con las fotos del usuario: se carga desde un archivo y queda solo en el celular. */
function ModeloPrivado() {
  const [hay, setHay] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { leerConfig<ArrayBuffer>('modelo:trazas.onnx').then(x => setHay(!!x)).catch(() => setHay(false)); }, []);
  const cargar = async (f?: File) => {
    if (!f) return;
    setMsg('Leyendo…');
    try { const { cargarModelo } = await import('../ia/paquete'); setMsg(await cargarModelo(f)); setHay(true); }
    catch (e) { setMsg(`No se pudo cargar: ${(e as Error).message}`); }
  };
  return (
    <section className="tarjeta">
      <h3>IA de trazas entrenada con sus fotos</h3>
      <p className="ayuda">Cargue el archivo trazas_justa.onnx. Queda guardado solo en este celular: no se publica ni se envía a ningún lado.</p>
      <p>{hay ? 'Usando su modelo privado.' : 'Usando el modelo general de la app.'}</p>
      <label className="btn mini">🧠 Cargar modelo .onnx<input type="file" hidden onChange={e => { cargar(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {hay && <button className="btn mini" onClick={async () => { await guardarConfig('modelo:trazas.onnx', undefined); olvidarSesion('trazas.onnx'); setHay(false); setMsg('Volvió al modelo general.'); }}>Quitar modelo privado</button>}
      {msg && <p className="ayuda">{msg}</p>}
    </section>
  );
}

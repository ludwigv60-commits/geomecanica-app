// vite-node: lee mapas de probabilidad (.f32) y RGBA (.rgba) y corre el mismo código de la app.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { desdeMapa } from '../app/src/ia/modelo-trazas';
import { analizar } from '../app/src/ia/trazas';
const dir = process.argv[2]!, umbral = +(process.argv[3] ?? 0.5), hueco = +(process.argv[4] ?? 6), lmin = process.argv[5] ? +process.argv[5] : undefined;
const out: Record<string, unknown> = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('res'))) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); const base = f.replace('.json', '');
  const r: Record<string, unknown> = {};
  if (meta.f32) {
    const b = readFileSync(`${dir}/${base}.f32`); const p = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const t = desdeMapa({ w: meta.w, h: meta.h, p: Float32Array.from(p) }, { umbral, hueco, largoMin: lmin ? Math.round(lmin * Math.min(meta.w, meta.h)) : undefined, zona: meta.zona ? new Uint8Array(readFileSync(`${dir}/${base}.zona`)) : null });
    r.red = { familias: t.familias, confianza: t.confianza, nivel: t.nivel, segmentos: t.segmentos };
  }
  if (meta.rgba) {
    const b = readFileSync(`${dir}/${base}.rgba`);
    const t = analizar(new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength), meta.w, meta.h);
    r.clasico = { familias: t.familias, segmentos: t.segmentos };
  }
  out[base] = r;
}
writeFileSync(`${dir}/res_${umbral}${process.argv[6] ?? ''}.json`, JSON.stringify(out));
console.log('ok', Object.keys(out).length);

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Se publica en la carpeta libre/ del repositorio (GitHub Pages), separada de la app existente.
const SALIDA = process.env.SALIDA || '../libre';

/** Escribe sw.js con la lista de todos los archivos de la app para que funcione sin señal desde la primera apertura. */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker', apply: 'build',
    closeBundle() {
      const dir = new URL(SALIDA + '/', import.meta.url).pathname;
      const todos: string[] = [];
      const recorrer = (d: string) => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? recorrer(p) : todos.push(p); });
      recorrer(dir);
      const archivos = ['./', ...todos.map(p => './' + relative(dir, p)).filter(f => f !== './sw.js')];
      const h = createHash('sha1'); todos.forEach(p => h.update(readFileSync(p)));
      const sw = readFileSync(new URL('./sw-plantilla.js', import.meta.url), 'utf8')
        .replace('__VERSION__', h.digest('hex').slice(0, 10)).replace('__ARCHIVOS__', JSON.stringify(archivos));
      writeFileSync(join(dir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  base: './',
  build: { outDir: SALIDA, emptyOutDir: true, chunkSizeWarningLimit: 600 },
  test: { globals: true },
});

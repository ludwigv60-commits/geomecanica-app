// Panel de mapeos (artefacto privado en Claude): la misma interfaz de la app, con los mapeos guardados en la base
// del artefacto. Se compila aparte y NO se publica en GitHub Pages.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: process.env.PANEL_OUT ?? '../../panel-build', emptyOutDir: true, cssCodeSplit: false, chunkSizeWarningLimit: 4000,
    rollupOptions: { input: 'panel.html', output: { inlineDynamicImports: true, entryFileNames: 'panel.js', assetFileNames: '[name][extname]' } },
  },
});

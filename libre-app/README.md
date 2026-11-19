# Aplicativo Geomecánico Libre

App independiente (PWA) de mapeo geomecánico: RMR89, verificación con cartilla GSI, discontinuidades,
fotos con trazas y sostenimiento por rangos de RMR según la cartilla geomecánica (versión 2026-01).
Reporte PDF genérico, sin logos.

- Código: esta carpeta. Publicación: `../libre/` (GitHub Pages).
- `npm install && npm run build` compila a `../libre/`. `npm test` prueba las tablas de la cartilla.
- Las tablas de la cartilla y las lecturas tomadas donde no es explícita están en `src/cartilla.ts`.
- Los mapeos se guardan solo en el equipo (IndexedDB). Este repositorio no contiene datos.

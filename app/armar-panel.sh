#!/usr/bin/env bash
# Compila el Centro de Control (src/panel) en una carpeta lista para publicar como artefacto privado de Claude.
# Uso: ./armar-panel.sh /ruta/salida   → index.html + panel.js + logo-lk.png
# Las páginas de "Mis herramientas" (herramientas/*.html) son archivos privados del usuario: NO van en el repositorio;
# se agregan aparte al publicar (ya están en el artefacto y se conservan si no se vuelven a enviar).
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:?carpeta de salida}"; TMP="$(mktemp -d)"
PANEL_OUT="$TMP" npx vite build -c vite.panel.config.ts >/dev/null
mkdir -p "$OUT"
# el artefacto rechaza U+FFFD literal: se escribe como escape de JS (mismo valor)
python3 - "$TMP" "$OUT" <<'P'
import sys, os
t, o = sys.argv[1:]
js = open(f'{t}/panel.js', encoding='utf-8').read().replace('�', '\\uFFFD')
open(f'{o}/panel.js', 'w', encoding='utf-8').write(js)
css = open(f'{t}/style.css', encoding='utf-8').read()
pre = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'
       ':root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
       'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
       'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
html = (pre + '<title>Centro de Control Justa</title>\n<meta name="description" content="Centro de Control Ludwig Justa Subterránea: mapeos geomecánicos, resumen PK a PK, tabla con Excel y todas las herramientas en un solo lugar.">\n'
        f'<style>{css}</style>\n<div id="root"></div>\n<script type="module" src="panel.js"></script>\n</body></html>')
open(f'{o}/index.html', 'w', encoding='utf-8').write(html)
P
cp public/logo-lk.png "$OUT/"
rm -rf "$TMP"
echo "Listo en $OUT (publicar index.html con panel.js y logo-lk.png)"

# Herramientas que usan "Vincular carpeta": dentro de claude.ai el navegador bloquea showDirectoryPicker,
# así que se inyecta app/src/panel/carpetas-polyfill.js (selector clásico de carpeta) justo después de <head>.
# Uso: inyectar_carpetas <dir_herramientas>
inyectar_carpetas() {
  local poly; poly="$(dirname "$0")/src/panel/carpetas-polyfill.js"
  for f in "$1"/*.html; do
    grep -q 'showDirectoryPicker\|showOpenFilePicker' "$f" || continue
    grep -q 'data-lk="carpetas"' "$f" && continue
    python3 - "$f" "$poly" <<'PY'
import sys,re
f,p=sys.argv[1],sys.argv[2]
s=open(f,encoding='utf-8').read(); js=open(p,encoding='utf-8').read()
tag='<script data-lk="carpetas">'+js+'</script>'
m=re.search(r'<head[^>]*>',s,re.I)
s=s[:m.end()]+tag+s[m.end():] if m else tag+s
open(f,'w',encoding='utf-8').write(s)
PY
  done
}

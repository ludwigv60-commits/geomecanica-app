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

# App de mapeo completa dentro del Centro (herramientas/mapeo/): copia de ../formulario sin sw.js.
# El artefacto no sirve .onnx ni .xlsx: van como <archivo>.b64.txt y un fetch en index.html los decodifica.
# También se escapan U+FFFD y bytes de control en los .js. Uso: copiar_app_mapeo <dir_salida>
copiar_app_mapeo() {
  local d="$1/herramientas/mapeo"; rm -rf "$d"; mkdir -p "$d"; cp -r "$(dirname "$0")/../formulario/." "$d/"; rm -f "$d/sw.js"
  for f in "$d"/modelos/*.onnx "$d"/plantilla/formato.xlsx; do [ -f "$f" ] && base64 -w0 "$f" > "$f.b64.txt" && rm "$f"; done
  python3 - "$d" <<'PY'
import sys,os,re
d=sys.argv[1]
for r,_,fs in os.walk(d+'/assets'):
  for f in fs:
    if f.endswith('.js'):
      p=os.path.join(r,f); s=open(p,encoding='utf-8').read()
      t=re.sub('[\x00-\x08\x0b\x0c\x0e-\x1f�]',lambda m:'\\u%04x'%ord(m.group()),s)
      if t!=s: open(p,'w',encoding='utf-8').write(t)
shim=("<script>/* Centro LK: .onnx y .xlsx van como base64 en .b64.txt */(function(){var f0=window.fetch.bind(window);window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||String(u);var p=s.split('?')[0];"
"if(/\\.onnx$|formato\\.xlsx$/.test(p)){return f0(p+'.b64.txt',o).then(function(r){if(!r.ok)return r;return r.text().then(function(t){var b=atob(t.trim()),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Response(a,{status:200,headers:{'Content-Type':'application/octet-stream'}});});});}"
"return f0(u,o);};})();</script>")
p=d+'/index.html'; s=open(p,encoding='utf-8').read(); i=s.lower().index('<head>')+6
open(p,'w',encoding='utf-8').write(s[:i]+shim+s[i:])
PY
}

# Descargas de las herramientas: dentro de claude.ai el navegador bloquea <a download> en las páginas del Centro.
# Se inyecta app/src/panel/descargas-polyfill.js en TODAS las herramientas (y en herramientas/mapeo/index.html):
# la descarga pasa por el permiso "downloads" del Centro (window.parent.claude). Uso: inyectar_descargas <dir_herramientas>
inyectar_descargas() {
  local poly; poly="$(dirname "$0")/src/panel/descargas-polyfill.js"
  python3 - "$1" "$poly" <<'PY'
import sys,re,glob,os
d,p=sys.argv[1],sys.argv[2]
tag='<script data-lk="descargas">'+open(p,encoding='utf-8').read()+'</script>'
for f in glob.glob(d+'/*.html')+[d+'/mapeo/index.html']:
    if not os.path.exists(f): continue
    s=open(f,encoding='utf-8').read()
    if 'data-lk="descargas"' in s: s=re.sub(r'<script data-lk="descargas">.*?</script>',lambda m:tag,s,count=1,flags=re.S)
    else:
        m=re.search(r'<head[^>]*>',s,re.I); s=s[:m.end()]+tag+s[m.end():] if m else tag+s
    if not s.lstrip().lower().startswith('<!doctype'): s='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+s
    open(f,'w',encoding='utf-8').write(s)
PY
}

#!/usr/bin/env bash
# Compila el APK del Aplicativo Geomecánico Libre.
#   ./scripts-apk.sh /ruta/firma.properties /ruta/salida.apk [versionCode] [versionName] [/ruta/modelo_trazas_propio.onnx]
# El modelo propio (opcional) va solo dentro del APK, nunca al repositorio.
# Requiere JDK 21 y ANDROID_HOME con platforms;android-35 y build-tools;35.0.0.
set -euo pipefail
cd "$(dirname "$0")"
FIRMA=$1; SALIDA=$2
export LK_VERSION_CODE=${3:-1} LK_VERSION=${4:-0.1} LK_FIRMA=$FIRMA
MODELO=${5:-}
npx tsc -b
SALIDA=apk-www npx vite build
rm -f apk-www/sw.js
if [ -n "$MODELO" ]; then cp "$MODELO" apk-www/modelos/trazas_justa.onnx; fi
npx cap sync android
(cd android && ./gradlew --no-daemon -q --max-workers=1 assembleRelease)
cp android/app/build/outputs/apk/release/app-release.apk "$SALIDA"
echo "APK: $SALIDA"

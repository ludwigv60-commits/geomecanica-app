#!/usr/bin/env bash
# Compila el APK de LK Geomecánica con los datos privados ADENTRO (nunca se suben al repo).
#   scripts/apk.sh /ruta/justa_datos.json /ruta/firma.properties /ruta/salida.apk [versionCode] [versionName]
# Requiere JDK 21 y ANDROID_HOME con platforms;android-35 y build-tools;35.0.0.
set -euo pipefail
cd "$(dirname "$0")/.."
DATOS=$1; FIRMA=$2; SALIDA=$3
export LK_VERSION_CODE=${4:-1} LK_VERSION=${5:-1.0} LK_FIRMA=$FIRMA
npx tsc -b
SALIDA=../apk-www npx vite build
rm -f ../apk-www/sw.js            # en el APK no hace falta: todo ya está dentro
mkdir -p ../apk-www/datos-apk
cp "$DATOS" ../apk-www/datos-apk/justa_datos.json
sha1sum "$DATOS" | cut -c1-12 > ../apk-www/datos-apk/version.txt
npx cap sync android
(cd android && ./gradlew --no-daemon -q assembleRelease)
cp android/app/build/outputs/apk/release/app-release.apk "$SALIDA"
echo "APK: $SALIDA"

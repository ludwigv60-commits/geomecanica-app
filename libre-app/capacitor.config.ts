import type { CapacitorConfig } from '@capacitor/cli';

// APK Android del Aplicativo Geomecánico Libre (paquete distinto a cualquier otra app: se instala aparte).
// La web se compila en ./apk-www (no se sube al repo); ahí el script copia el modelo de IA entrenado.
const config: CapacitorConfig = {
  appId: 'pe.geomecanico.libre',
  appName: 'Geomecánico Libre',
  webDir: 'apk-www',
  android: { allowMixedContent: false },
};
export default config;

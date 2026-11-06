import type { CapacitorConfig } from '@capacitor/cli';

// APK Android de LK Geomecánica. La web se compila en ../apk-www (no se sube al repo):
// ahí el script de compilación del APK copia los datos privados, que solo viajan dentro del APK.
const config: CapacitorConfig = {
  appId: 'pe.lk.geomecanica',
  appName: 'LK Geomecánica',
  webDir: '../apk-www',
  android: { allowMixedContent: false },
};
export default config;

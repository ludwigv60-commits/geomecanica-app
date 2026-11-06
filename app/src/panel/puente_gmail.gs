/**
 * PUENTE LK · APK → GMAIL → CENTRO DE CONTROL LUDWIG JUSTA SUBTERRÁNEA
 * Corre gratis en TU cuenta Google. Cuando el celular tiene internet, el APK envía cada mapeo aquí;
 * este script se lo manda a tu propio Gmail (de ti para ti) y el Centro de Control lo lee y lo carga solo.
 * Nadie más recibe nada. Solo funciona con la clave secreta que va en la URL (?k=...).
 *
 * Instalación (una sola vez, 3 minutos):
 *  1. Entra a https://script.google.com con tu cuenta Google → "Nuevo proyecto". Pega TODO este archivo.
 *  2. Cambia CLAVE por una palabra secreta tuya (letras y números, sin espacios).
 *  3. Implementar → Nueva implementación → tipo "Aplicación web".
 *     Ejecutar como: "Yo". Quién tiene acceso: "Cualquier persona". → Implementar → Autorizar (acepta Gmail).
 *  4. Copia la URL que termina en /exec y agrégale ?k=TU_CLAVE  (ejemplo: https://script.google.com/macros/s/AKfy.../exec?k=justa2026)
 *  5. En el APK: ⚙️ Configuración → "URL del puente al Centro" → pega esa URL completa.
 */
const CLAVE = 'CAMBIA_ESTA_CLAVE';
const PARTE = 300000;          // caracteres por correo (los mapeos con fotos se parten en varios correos del mismo hilo)
const ASUNTO = '[MAPEO-LK]';

function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.k !== CLAVE) return salida({ ok: false, error: 'clave' });
    const texto = e.postData && e.postData.contents;
    const p = JSON.parse(texto);
    if (!p || p.formato !== 'mapeos-geomecanica/1' || !Array.isArray(p.reportes)) return salida({ ok: false, error: 'formato' });
    const r = p.reportes[0] || {};
    // base64 para que ningún salto de línea ni acento se dañe en el correo
    const b64 = Utilities.base64Encode(texto, Utilities.Charset.UTF_8);
    const id = Utilities.getUuid().slice(0, 8);
    const n = Math.ceil(b64.length / PARTE);
    const yo = Session.getEffectiveUser().getEmail();
    const asunto = `${ASUNTO} ${id} · ${r.labor || 'labor'} ${r.desde || ''} ${r.fecha || ''}`.trim();
    for (let i = 0; i < n; i++) {
      const cuerpo = `MAPEO-LK|${id}|${i + 1}|${n}\n` + b64.slice(i * PARTE, (i + 1) * PARTE);
      GmailApp.sendEmail(yo, asunto, cuerpo);
    }
    return salida({ ok: true, id: id, partes: n });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  }
}

/** Para probar en el navegador que la URL está bien: abre la URL /exec?k=TU_CLAVE y debe decir {"ok":true,"puente":"LK"}. */
function doGet(e) {
  return salida(e && e.parameter && e.parameter.k === CLAVE ? { ok: true, puente: 'LK' } : { ok: false, error: 'clave' });
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

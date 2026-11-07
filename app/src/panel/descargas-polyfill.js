/* Centro LK: dentro de Claude el navegador bloquea las descargas que una herramienta hace por su cuenta
   (enlace <a download> con blob: o data:). Este reemplazo las pasa por el permiso "downloads" del Centro
   (window.claude en esta página o en la página del Centro que la contiene). Si no hay permiso, se usa la descarga normal. */
(function () {
  if (window.__lkDescargas) return; window.__lkDescargas = true;
  // ventana que tiene el permiso (esta o la del Centro); los datos se crean en SU contexto para que los reconozca
  function duena() {
    try { if (window.parent && window.parent !== window && typeof window.parent.lkGuardar === 'function') return window.parent; } catch (e) {}
    try { if (typeof window.lkGuardar === 'function') return window; } catch (e) {}
    try { if (window.claude && window.claude.use) return window; } catch (e) {}
    try { if (window.parent && window.parent !== window && window.parent.claude && window.parent.claude.use) return window.parent; } catch (e) {}
    try { if (window.top && window.top.claude && window.top.claude.use) return window.top; } catch (e) {}
    return null;
  }
  function claude() { var w = duena(); return w ? (w.lkGuardar || w.claude) : null; }
  function aviso(t, mal) {
    try {
      var d = document.createElement('div');
      d.textContent = t;
      d.setAttribute('style', 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:10px 14px;border-radius:10px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px #0005;color:#fff;background:' + (mal ? '#b3261e' : '#1f7a3f'));
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function () { d.remove(); }, 4500);
    } catch (e) {}
  }
  var clicOriginal = HTMLAnchorElement.prototype.click;
  var despachoOriginal = HTMLAnchorElement.prototype.dispatchEvent;
  function esDescarga(a) {
    var h = a && a.getAttribute && a.getAttribute('href');
    return a && a.hasAttribute && a.hasAttribute('download') && h && /^(blob:|data:)/i.test(h);
  }
  function guardar(a) {
    var w = duena(); if (!w) return false; var c = w.claude;
    var guardarEn = typeof w.lkGuardar === 'function'
      ? function (d) { return w.lkGuardar(nombre, d); }
      : function (d) { return c.use('downloads').then(function (dl) { if (!dl) throw new Error('sin permiso de descargas'); return dl.save({ filename: nombre, data: d }); }); };
    var nombre = a.getAttribute('download') || 'archivo';
    var href = a.href;
    fetch(href).then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) {
        var datos = new w.Uint8Array(ab.byteLength); datos.set(new Uint8Array(ab));
        return guardarEn(datos);
      })
      .then(function () { aviso('⬇ Descargado: ' + nombre); })
      .catch(function (e) { aviso(e && e.code === 'declined' ? 'Descarga cancelada.' : 'No se pudo descargar ' + nombre + ': ' + ((e && (e.message || e.code)) || e), !(e && e.code === 'declined')); });
    return true;
  }
  HTMLAnchorElement.prototype.click = function () { if (esDescarga(this) && guardar(this)) return; return clicOriginal.apply(this, arguments); };
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && esDescarga(this) && guardar(this)) return false;
    return despachoOriginal.apply(this, arguments);
  };
  // enlaces de descarga que la persona toca con el dedo o el mouse
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
    if (a && esDescarga(a) && guardar(a)) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  // window.open de un blob (algunas herramientas abren el PDF así)
  var abrirOriginal = window.open;
  window.open = function (u) {
    if (typeof u === 'string' && /^blob:/i.test(u) && claude()) {
      var a = document.createElement('a'); a.href = u; a.setAttribute('download', 'documento'); guardar(a); return null;
    }
    return abrirOriginal.apply(window, arguments);
  };
})();

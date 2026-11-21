/* Centro LK: carga perezosa de librerías grandes embebidas.
   Algunas herramientas traen dentro librerías de varios MB guardadas como <script type="text/plain" id="…">
   (lector de fotos, PDF, Word…) que solo se usan al tocar un botón. En el Centro se sacan a archivos aparte
   (herramientas/lib/*.txt) y la herramienta abre mucho más rápido. Cuando el código pide el texto de ese bloque
   (textContent / text / innerHTML / innerText), se trae en ese momento del archivo (queda en la caché del navegador). */
(function () {
  if (window.lkPerezoso) return;
  var cache = {};
  function traer(url) {
    if (cache[url] != null) return cache[url];
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send(null);
      cache[url] = x.status === 200 || x.status === 0 ? x.responseText : '';
    } catch (e) { cache[url] = ''; }
    return cache[url];
  }
  window.lkPerezoso = function (id) {
    var el = document.getElementById(id);
    if (!el || el.__lkPerezoso) return;
    var url = el.getAttribute('data-lk-src');
    if (!url) return;
    el.__lkPerezoso = true;
    var leer = function () { return traer(url); };
    ['textContent', 'text', 'innerHTML', 'innerText'].forEach(function (p) {
      try { Object.defineProperty(el, p, { configurable: true, get: leer, set: function () { } }); } catch (e) { }
    });
    // también por si alguien lee el nodo de texto hijo
    try { Object.defineProperty(el, 'firstChild', { configurable: true, get: function () { return document.createTextNode(leer()); } }); } catch (e) { }
    try { Object.defineProperty(el, 'childNodes', { configurable: true, get: function () { return [document.createTextNode(leer())]; } }); } catch (e) { }
  };
  // precarga en segundo plano cuando la página ya está quieta, para que el primer uso sea instantáneo
  window.addEventListener('load', function () {
    setTimeout(function () {
      var els = document.querySelectorAll('script[data-lk-src]');
      Array.prototype.forEach.call(els, function (el) {
        var u = el.getAttribute('data-lk-src');
        if (cache[u] == null && window.fetch) fetch(u).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) { if (t != null && cache[u] == null) cache[u] = t; }).catch(function () { });
      });
    }, 4000);
  });
})();

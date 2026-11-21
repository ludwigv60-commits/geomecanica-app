/* Centro LK: memoria de las herramientas dentro del Centro de Control.
   Una herramienta abierta dentro del Centro no tiene window.claude propio, así que no podía guardar nada
   para el equipo (Excel vinculados, meses, configuración) y lo que guardaba en el navegador se perdía al
   cambiar de equipo o borrar datos. Este puente:
   1) le da a la herramienta un window.claude que usa la base del Centro, en su propia carpeta lk/<herramienta>/
      (db), la identidad del Centro (user) y las descargas del Centro (downloads);
   2) copia lo que la herramienta guarda en localStorage a la base del Centro y lo devuelve en otro navegador. */
(function () {
  if (window.__lkNube) return; window.__lkNube = true;
  var P;
  try { P = window.parent && window.parent !== window && window.parent.claude && typeof window.parent.claude.use === 'function' ? window.parent : null; } catch (e) { P = null; }
  if (!P) return;
  var slug = (decodeURIComponent(location.pathname.split('/').pop() || 'herramienta').replace(/\.html?$/i, '').replace(/[^A-Za-z0-9_\-.~]/g, '_')) || 'herramienta';
  var BASE = 'lk/' + slug + '/';
  function limpia(p) { return String(p).replace(/^\/+|\/+$/g, ''); }
  function envolverDb(db) {
    if (!db) return null;
    var w = {};
    for (var k in db) { try { if (typeof db[k] === 'function') w[k] = db[k].bind(db); } catch (e) { } }
    w.doc = function (p) { return db.doc(BASE + limpia(p)); };
    w.collection = function (p) { return db.collection(BASE + limpia(p)); };
    return w;
  }
  function aBytes(data) {
    if (data == null) return Promise.resolve(new Uint8Array(0));
    if (typeof data === 'string') return Promise.resolve(new TextEncoder().encode(data));
    if (data instanceof ArrayBuffer || Object.prototype.toString.call(data) === '[object ArrayBuffer]') return Promise.resolve(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return Promise.resolve(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (data && typeof data.arrayBuffer === 'function') return data.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return Promise.resolve(new TextEncoder().encode(String(data)));
  }
  // La descarga se hace con un enlace: el reemplazo de descargas del Centro la pasa por su permiso
  // (y muestra el botón "Descargar" si el clic ya venció).
  var descargas = {
    save: function (o) {
      o = o || {};
      return aBytes(o.data).then(function (u8) {
        var url = URL.createObjectURL(new Blob([u8], { type: o.mimeType || o.type || 'application/octet-stream' }));
        var a = document.createElement('a'); a.href = url; a.download = o.filename || 'archivo';
        (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        return { ok: true };
      });
    }
  };
  var memo = {};
  var puente = {
    use: function (name) {
      if (memo[name]) return memo[name];
      var r;
      if (name === 'db') r = P.claude.use('db').then(envolverDb, function () { return null; });
      else if (name === 'downloads') r = Promise.resolve(descargas);
      else if (name === 'user' || name === 'permissions') r = P.claude.use(name).catch(function () { return null; });
      else r = P.claude.use(name).catch(function () { return null; });
      return (memo[name] = r);
    }
  };
  if (!window.claude || typeof window.claude.use !== 'function') {
    try { Object.defineProperty(window, 'claude', { value: puente, configurable: true }); } catch (e) { window.claude = puente; }
  }

  /* ---- localStorage de la herramienta → base del Centro (lk/<herramienta>/ls/…) ---- */
  var LS = window.localStorage; if (!LS) return;
  var MARCA = 'lk.ls.' + slug, CLAVES = 'lk.lsk.' + slug, TAM = 200000;
  var proto = Object.getPrototypeOf(LS), setO = proto.setItem, remO = proto.removeItem;
  function leerJSON(k, d) { try { var v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  var claves = leerJSON(CLAVES, {});
  var propias = function (k) { return k !== MARCA && k !== CLAVES && !/^lk\.(ls|lsk)\./.test(k); };
  var timer = null, dbP = null;
  function db() { return dbP || (dbP = P.claude.use('db').catch(function () { return null; })); }
  function programar() { clearTimeout(timer); timer = setTimeout(subir, 2500); }
  proto.setItem = function (k, v) {
    var r = setO.apply(this, arguments);
    if (this === LS && propias(String(k)) && !claves[k]) { claves[k] = 1; setO.call(LS, CLAVES, JSON.stringify(claves)); }
    if (this === LS && propias(String(k))) programar();
    return r;
  };
  proto.removeItem = function (k) {
    var r = remO.apply(this, arguments);
    if (this === LS && claves[k]) programar();
    return r;
  };
  function foto() {
    var kv = {};
    Object.keys(claves).forEach(function (k) { var v = LS.getItem(k); if (v != null) kv[k] = v; });
    return kv;
  }
  var ultimaFirma = null;
  function subir() {
    var kv = foto(), txt = JSON.stringify(kv), firma = Object.keys(kv).length + '|' + txt.length + '|' + hash(txt);
    if (firma === ultimaFirma) return;
    db().then(function (d) {
      if (!d) return;
      var partes = []; for (var i = 0; i < txt.length; i += TAM) partes.push(txt.slice(i, i + TAM));
      var cuando = new Date().toISOString(), p = Promise.resolve();
      partes.forEach(function (t, i) { p = p.then(function () { return d.doc(BASE + 'lsp/p' + i).set({ firma: firma, i: i, txt: t }); }); });
      return p.then(function () { return d.doc(BASE + 'ls/meta').set({ firma: firma, partes: partes.length, cuando: cuando }); })
        .then(function () { ultimaFirma = firma; setO.call(LS, MARCA, cuando); });
    }).catch(function () { });
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  // Al abrir: si la base del Centro tiene algo más nuevo que este navegador, se copia y se recarga una vez.
  db().then(function (d) {
    if (!d) return;
    return d.doc(BASE + 'ls/meta').get().then(function (sn) {
      if (!sn.exists) { if (Object.keys(claves).length) programar(); return; }
      var meta = sn.data(), local = LS.getItem(MARCA);
      ultimaFirma = null;
      if (local && local >= meta.cuando) return;
      var lect = []; for (var i = 0; i < meta.partes; i++) lect.push(d.doc(BASE + 'lsp/p' + i).get());
      return Promise.all(lect).then(function (ps) {
        if (!ps.every(function (x) { return x.exists && x.data().firma === meta.firma; })) return;
        var kv = JSON.parse(ps.map(function (x) { return x.data().txt; }).join('')), cambio = false;
        Object.keys(kv).forEach(function (k) {
          if (!claves[k]) claves[k] = 1;
          if (LS.getItem(k) !== kv[k]) { try { setO.call(LS, k, kv[k]); cambio = true; } catch (e) { } }
        });
        setO.call(LS, CLAVES, JSON.stringify(claves));
        setO.call(LS, MARCA, meta.cuando);
        ultimaFirma = meta.firma;
        var g = 'lk.recarga.' + slug;
        if (cambio && !sessionStorage.getItem(g)) { sessionStorage.setItem(g, '1'); location.reload(); }
      });
    });
  }).catch(function () { });
  window.addEventListener('pagehide', function () { if (timer) { clearTimeout(timer); subir(); } });
})();

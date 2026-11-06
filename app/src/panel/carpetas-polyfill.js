/* Centro LK: dentro de Claude el navegador no deja usar showDirectoryPicker/showOpenFilePicker (marcos de otro origen).
   Este reemplazo usa el selector de archivos clásico (input file / webkitdirectory) y entrega "handles" de solo lectura.
   Guardar en la carpeta (createWritable) se convierte en una descarga del archivo. */
(function () {
  function abortar() { return new DOMException('Selección cancelada', 'AbortError'); }
  function elegir(carpeta, opts) {
    return new Promise(function (ok, mal) {
      var i = document.createElement('input');
      i.type = 'file'; i.style.display = 'none';
      if (carpeta) { i.webkitdirectory = true; i.setAttribute('webkitdirectory', ''); i.multiple = true; }
      else {
        i.multiple = !!(opts && opts.multiple);
        if (opts && opts.types) { var a = []; opts.types.forEach(function (t) { var ac = t.accept || {}; Object.keys(ac).forEach(function (k) { a.push(k); a = a.concat(ac[k]); }); }); i.accept = a.join(','); }
      }
      var fin = function () { i.remove(); };
      i.addEventListener('change', function () { var f = Array.prototype.slice.call(i.files || []); fin(); f.length ? ok(f) : mal(abortar()); });
      i.addEventListener('cancel', function () { fin(); mal(abortar()); });
      (document.body || document.documentElement).appendChild(i);
      i.click();
    });
  }
  function bajar(nombre, partes) {
    var b = new Blob(partes), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nombre; (document.body || document.documentElement).appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function FH(f) { this.kind = 'file'; this.name = f.name; this._f = f; }
  FH.prototype.getFile = function () { return Promise.resolve(this._f); };
  FH.prototype.queryPermission = FH.prototype.requestPermission = function () { return Promise.resolve('granted'); };
  FH.prototype.isSameEntry = function (o) { return Promise.resolve(o === this); };
  FH.prototype.createWritable = function () {
    var yo = this, partes = [];
    return Promise.resolve({
      write: function (d) { if (d && typeof d === 'object' && 'type' in d && d.type === 'write') d = d.data; partes.push(d); return Promise.resolve(); },
      seek: function () { return Promise.resolve(); }, truncate: function () { return Promise.resolve(); },
      close: function () { yo._f = new File(partes, yo.name); bajar(yo.name, partes); return Promise.resolve(); },
      abort: function () { return Promise.resolve(); }
    });
  };
  function DH(n) { this.kind = 'directory'; this.name = n; this._c = new Map(); }
  DH.prototype.queryPermission = DH.prototype.requestPermission = function () { return Promise.resolve('granted'); };
  DH.prototype.isSameEntry = function (o) { return Promise.resolve(o === this); };
  DH.prototype.entries = async function* () { for (var e of this._c) yield e; };
  DH.prototype.values = async function* () { for (var v of this._c.values()) yield v; };
  DH.prototype.keys = async function* () { for (var k of this._c.keys()) yield k; };
  DH.prototype[Symbol.asyncIterator] = function () { return this.entries(); };
  DH.prototype.getFileHandle = function (n, o) {
    var h = this._c.get(n);
    if (h && h.kind === 'file') return Promise.resolve(h);
    if (o && o.create) { h = new FH(new File([], n)); this._c.set(n, h); return Promise.resolve(h); }
    return Promise.reject(new DOMException('No existe ' + n, 'NotFoundError'));
  };
  DH.prototype.getDirectoryHandle = function (n, o) {
    var h = this._c.get(n);
    if (h && h.kind === 'directory') return Promise.resolve(h);
    if (o && o.create) { h = new DH(n); this._c.set(n, h); return Promise.resolve(h); }
    return Promise.reject(new DOMException('No existe ' + n, 'NotFoundError'));
  };
  DH.prototype.removeEntry = function (n) { this._c.delete(n); return Promise.resolve(); };
  DH.prototype.resolve = function () { return Promise.resolve(null); };
  window.showDirectoryPicker = function () {
    return elegir(true).then(function (fs) {
      var raiz = new DH(((fs[0].webkitRelativePath || '').split('/')[0]) || 'carpeta');
      fs.forEach(function (f) {
        var p = (f.webkitRelativePath || f.name).split('/').slice(1); if (!p.length) p = [f.name];
        var d = raiz;
        p.slice(0, -1).forEach(function (s) { if (!d._c.has(s)) d._c.set(s, new DH(s)); d = d._c.get(s); });
        d._c.set(p[p.length - 1], new FH(f));
      });
      return raiz;
    });
  };
  window.showOpenFilePicker = function (o) { return elegir(false, o).then(function (fs) { return fs.map(function (f) { return new FH(f); }); }); };
  window.showSaveFilePicker = function (o) { return Promise.resolve(new FH(new File([], (o && o.suggestedName) || 'archivo'))); };
})();

// Rumbo de la cámara guardado por el celular en la foto (EXIF GPSImgDirection). El iPhone lo guarda si la
// Cámara tiene permiso de ubicación; muchos Android también. Sirve para llenar el azimut con fotos de galería.
export interface RumboFoto { dir: number; ref: 'T' | 'M' }

export function rumboExif(buf: ArrayBuffer): RumboFoto | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const m = v.getUint16(o); if ((m & 0xff00) !== 0xff00) return null;
    const len = v.getUint16(o + 2);
    if (m === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return leerTiff(v, o + 10);  // "Exif"
    if (m === 0xffda) return null;
    o += 2 + len;
  }
  return null;
}

function leerTiff(v: DataView, t: number): RumboFoto | null {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le), u32 = (p: number) => v.getUint32(p, le);
  const ifd = (p: number) => { const n = u16(p); const out = new Map<number, { tipo: number; cnt: number; val: number }>(); for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; out.set(u16(e), { tipo: u16(e + 2), cnt: u32(e + 4), val: e + 8 }); } return out; };
  const ifd0 = ifd(t + u32(t + 4)), gpsPtr = ifd0.get(0x8825);
  if (!gpsPtr) return null;
  const gps = ifd(t + u32(gpsPtr.val)), d = gps.get(0x11), r = gps.get(0x10);
  if (!d || d.tipo !== 5) return null;
  const p = t + u32(d.val), num = u32(p), den = u32(p + 4);
  if (!den) return null;
  const ref = r ? String.fromCharCode(v.getUint8(r.val)) : 'T';
  return { dir: ((num / den) % 360 + 360) % 360, ref: ref === 'M' ? 'M' : 'T' };
}

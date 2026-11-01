import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { rumboExif } from './exif';

describe('rumboExif', () => {
  it('lee GPSImgDirection de una foto', () => {
    const b = readFileSync(new URL('./exif-prueba.jpg', import.meta.url));
    const r = rumboExif(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    expect(r?.ref).toBe('T'); expect(r?.dir).toBeCloseTo(331.5, 1);
  });
  it('sin EXIF devuelve null', () => { expect(rumboExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull(); });
});

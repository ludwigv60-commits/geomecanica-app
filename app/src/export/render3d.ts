// Dibuja la escena 3D (escena3d.ts) con three.js: el visor interactivo de la app (girar, zoom y mover con el
// dedo o el mouse) y las imágenes fijas que van en el PDF y el Excel. Se carga solo cuando hace falta.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { Capa, Escena3 } from './escena3d';

export type Tema = 'claro' | 'oscuro';
export type Preset = 'lateral' | 'frente' | 'planta' | 'contra';

const OSCURO: Record<string, string> = { '#111111': '#E8ECF1', '#333333': '#C9D1DA', '#444444': '#AEB7C2', '#2B1B12': '#1A0F0A', '#0D2A6B': '#9CC3F0', '#1F4E8C': '#8DB7EA', '#2F6FB3': '#5FA0E6', '#9AA0A6': '#56606B', '#8A939C': '#6B7480', '#333': '#C9D1DA' };
const tono = (c: string, t: Tema) => (t === 'oscuro' ? OSCURO[c] ?? c : c);

function textoSprite(s: string, color: string, fondo: string | undefined, tema: Tema, alto: number): THREE.Sprite {
  const px = 64, pad = 18, cv = document.createElement('canvas'), ctx = cv.getContext('2d')!;
  ctx.font = `700 ${px}px Helvetica, Arial, sans-serif`;
  const w = Math.ceil(ctx.measureText(s).width) + pad * 2, h = px + pad * 1.4;
  cv.width = w; cv.height = h;
  ctx.font = `700 ${px}px Helvetica, Arial, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  if (fondo) {
    ctx.fillStyle = tema === 'oscuro' ? 'rgba(18,24,32,.82)' : 'rgba(255,255,255,.9)';
    const r = 14; ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, r); ctx.fill();
    ctx.strokeStyle = tono(color, tema); ctx.lineWidth = 3; ctx.stroke();
  } else {
    ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.strokeStyle = tema === 'oscuro' ? 'rgba(10,14,20,.85)' : 'rgba(255,255,255,.92)'; ctx.strokeText(s, w / 2, h / 2 + 2);
  }
  ctx.fillStyle = tono(color, tema); ctx.fillText(s, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set((alto * w) / h, alto, 1); sp.renderOrder = 10;
  return sp;
}

export interface Vista3D {
  canvas: HTMLCanvasElement;
  capa(c: Capa, visible: boolean): void;
  preset(p: Preset, animar?: boolean): void;
  girar(si: boolean): void;
  interactivo(si: boolean): void;
  tamano(w: number, h: number): void;
  /** Corre el encuadre (fracción del ancho / alto) y acerca: para dejar sitio a un recuadro en la imagen. */
  encuadre(correr: [number, number], zoom: number): void;
  render(): void;
  destruir(): void;
}

/** Arma la escena de three.js. `canvas` puede no estar en la página (imágenes para el reporte). */
export function crearVista(canvas: HTMLCanvasElement, esc: Escena3, o: { tema?: Tema; interactivo?: boolean; w: number; h: number; pr?: number; rotulos?: number }): Vista3D {
  const tema = o.tema ?? 'oscuro';
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !o.interactivo, alpha: false });
  ren.setPixelRatio(o.pr ?? 1); ren.setSize(o.w, o.h, false);
  ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(tema === 'oscuro' ? '#161C24' : '#FFFFFF');
  const cam = new THREE.PerspectiveCamera(32, o.w / o.h, 0.05, 400);
  scene.add(new THREE.HemisphereLight('#FFFFFF', tema === 'oscuro' ? '#3A3430' : '#9C9284', 1.25));
  const sol = new THREE.DirectionalLight('#FFFFFF', 1.9); sol.position.set(-6, 14, -8); scene.add(sol);
  const rel = new THREE.DirectionalLight('#DDE8FF', 0.55); rel.position.set(8, 4, 12); scene.add(rel);
  scene.add(new THREE.AmbientLight('#FFFFFF', 0.25));

  const grupos = new Map<Capa, THREE.Group>();
  const grupo = (c: Capa) => { let g = grupos.get(c); if (!g) { g = new THREE.Group(); g.name = c; grupos.set(c, g); scene.add(g); } return g; };
  const lineMats: LineMaterial[] = [];
  for (const m of esc.mallas) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3)); geo.computeVertexNormals();
    const solido = m.opac >= 0.9;
    const mat = new THREE.MeshStandardMaterial({
      color: m.color, transparent: !solido, opacity: m.opac, side: THREE.DoubleSide, depthWrite: solido, roughness: solido ? 0.55 : 0.92, metalness: 0.04,
      emissive: new THREE.Color(m.color), emissiveIntensity: m.brillo ?? (solido ? 0 : 0.08), flatShading: solido, polygonOffset: true, polygonOffsetFactor: solido ? 1 : 2, polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = solido ? 0 : 2;
    grupo(m.capa).add(mesh);
    if (m.capa === 'cunas') { // aristas de los bloques
      const ar = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: tema === 'oscuro' ? '#1A0F0A' : '#3B1A12', transparent: true, opacity: 0.55 }));
      ar.renderOrder = 1; grupo(m.capa).add(ar);
    }
  }
  for (const l of esc.lineas) {
    if (l.pts.length < 2) continue;
    const g = new LineGeometry(); g.setPositions(l.pts.flat());
    const mat = new LineMaterial({ color: new THREE.Color(tono(l.color, tema)).getHex(), linewidth: l.ancho * (o.pr ?? 1) * (o.interactivo ? Math.min(1, Math.max(0.55, Math.min(o.w, o.h) / 700)) : 1.25), transparent: (l.opac ?? 1) < 1 || !!l.trazos, opacity: l.opac ?? 1, dashed: !!l.trazos, dashSize: 0.22, gapSize: 0.16, worldUnits: false });
    mat.resolution.set(o.w * (o.pr ?? 1), o.h * (o.pr ?? 1)); lineMats.push(mat);
    const ln = new Line2(g, mat); if (l.trazos) ln.computeLineDistances(); ln.renderOrder = 4;
    grupo(l.capa).add(ln);
  }
  const k = esc.radio / 6.2;
  for (const t of esc.rotulos) { const sp = textoSprite(t.s, t.color, t.fondo, tema, 0.3 * (t.tam ?? 1) * Math.max(0.8, k) * (o.rotulos ?? 1)); sp.position.set(...t.p); grupo(t.capa).add(sp); }

  const centro = new THREE.Vector3(...esc.centro);
  let controles: OrbitControls | null = null;
  if (o.interactivo) {
    controles = new OrbitControls(cam, canvas);
    controles.target.copy(centro); controles.enableDamping = true; controles.dampingFactor = 0.09;
    controles.minDistance = esc.radio * 0.4; controles.maxDistance = esc.radio * 7; controles.screenSpacePanning = true;
    controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controles.autoRotateSpeed = 1.6;
  }
  const dirs: Record<Preset, THREE.Vector3> = {
    lateral: new THREE.Vector3(1, 0.78, -0.58), frente: new THREE.Vector3(0.18, 0.32, 1), contra: new THREE.Vector3(-1, 0.55, 0.55), planta: new THREE.Vector3(0.0001, 1, 0.0001),
  };
  let anim: { t0: number; p0: THREE.Vector3; p1: THREE.Vector3; u0: THREE.Vector3; u1: THREE.Vector3; c0: THREE.Vector3 } | null = null;
  const destino = (p: Preset) => {
    const d = dirs[p].clone().normalize(), fov = (cam.fov * Math.PI) / 180, asp = Math.min(1, cam.aspect);
    const dist = (esc.radio / Math.sin((fov * asp) / 2)) * (p === 'planta' ? 0.92 : 0.86);
    const up = p === 'planta' ? new THREE.Vector3(esc.norte[0], 0, esc.norte[1]) : new THREE.Vector3(0, 1, 0);
    return { pos: centro.clone().add(d.multiplyScalar(dist)), up };
  };
  const ponerPreset = (p: Preset, animar = false) => {
    const { pos, up } = destino(p);
    if (animar && controles) { anim = { t0: performance.now(), p0: cam.position.clone(), p1: pos, u0: cam.up.clone(), u1: up, c0: controles.target.clone() }; return; }
    cam.position.copy(pos); cam.up.copy(up); cam.lookAt(centro); if (controles) { controles.target.copy(centro); controles.update(); }
  };
  ponerPreset('lateral');
  let vivo = true, raf = 0;
  const render = () => ren.render(scene, cam);
  const bucle = () => {
    if (!vivo) return;
    raf = requestAnimationFrame(bucle);
    if (anim && controles) {
      const t = Math.min(1, (performance.now() - anim.t0) / 650), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      cam.position.lerpVectors(anim.p0, anim.p1, e); cam.up.lerpVectors(anim.u0, anim.u1, e).normalize(); controles.target.lerpVectors(anim.c0, centro, e);
      if (t >= 1) anim = null;
    }
    controles?.update(); render();
  };
  if (o.interactivo) bucle(); else render();
  return {
    canvas,
    capa: (c, v) => { const g = grupos.get(c); if (g) g.visible = v; if (!o.interactivo) render(); },
    preset: (p, a) => { ponerPreset(p, a); if (!o.interactivo) render(); },
    girar: si => { if (controles) controles.autoRotate = si; },
    interactivo: si => { if (controles) controles.enabled = si; },
    tamano: (w, h) => { ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); lineMats.forEach(m => m.resolution.set(w * (o.pr ?? 1), h * (o.pr ?? 1))); if (!o.interactivo) render(); },
    render,
    encuadre: ([fx, fy], z) => {
      const w = o.w, h = o.h, ww = w / z, hh = h / z;
      cam.setViewOffset(w, h, (w - ww) / 2 - fx * w, (h - hh) / 2 - fy * h, ww, hh); cam.updateProjectionMatrix();
    },
    destruir: () => {
      vivo = false; cancelAnimationFrame(raf); controles?.dispose();
      scene.traverse(ob => { const m = ob as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => { (x as THREE.SpriteMaterial).map?.dispose(); x.dispose(); }); });
      ren.dispose(); ren.forceContextLoss();
    },
  };
}

/** Imagen fija (JPEG) de la escena para el PDF / Excel. Devuelve null si el equipo no tiene WebGL. */
export async function imagen3d(esc: Escena3, o: { w: number; h: number; preset?: Preset; tema?: Tema; capas?: Partial<Record<Capa, boolean>>; correr?: [number, number]; zoom?: number; rotulos?: number }): Promise<Uint8Array | null> {
  const cv = document.createElement('canvas');
  let v: Vista3D;
  try { v = crearVista(cv, esc, { tema: o.tema ?? 'claro', w: o.w, h: o.h, rotulos: o.rotulos }); } catch { return null; }
  try {
    for (const [c, on] of Object.entries(o.capas ?? {})) v.capa(c as Capa, !!on);
    v.preset(o.preset ?? 'lateral');
    v.encuadre(o.correr ?? [0, 0], o.zoom ?? 1);
    v.render();
    const b = await new Promise<Blob | null>(ok => cv.toBlob(ok, 'image/jpeg', 0.92));
    let out: Uint8Array | null = null;
    if (b) out = new Uint8Array(await b.arrayBuffer());
    else { const u = cv.toDataURL('image/jpeg', 0.92).split(',')[1]; out = u ? Uint8Array.from(atob(u), c => c.charCodeAt(0)) : null; }
    return out && out.length > 2000 ? out : null;
  } catch { return null; } finally { v.destruir(); }
}

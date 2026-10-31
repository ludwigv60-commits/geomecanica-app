# Corre el modelo ONNX en las fotos limpias de Justa y deja .f32/.rgba/.json para eval/familias.ts
import sys, json, cv2, numpy as np, onnxruntime as ort, os
from gt_justa import FOTOS, D
onnxp, dst, lado = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 640
os.makedirs(dst, exist_ok=True); s = ort.InferenceSession(onnxp); sz = ort.InferenceSession('/home/user/ml/zona.onnx')
for f in FOTOS + ['frente_311026']:
    p = D + f + ('_limpia.jpg' if os.path.exists(D + f + '_limpia.jpg') else '_limpia.png')
    a = cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB); k = lado / max(a.shape[:2])
    w, h = max(16, round(a.shape[1] * k / 16) * 16), max(16, round(a.shape[0] * k / 16) * 16)
    r = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)
    if os.environ.get('MEJORAR'):  # igual que mejorar() de la app: percentiles 1-99 % + gamma si es oscura
        g = (0.299 * r[..., 0] + 0.587 * r[..., 1] + 0.114 * r[..., 2]) / 255; lo, hi = np.quantile(g, .01), np.quantile(g, .99); hi = max(hi, lo + .05)
        gm = .7 if g.mean() < .35 else 1; nv = np.clip((g - lo) / (hi - lo), 0, 1) ** gm; k = np.where(g > .004, nv / np.maximum(g, 1e-6), 0)
        r = np.clip(r * k[..., None], 0, 255).astype(np.uint8)
    x = r.astype(np.float32).transpose(2, 0, 1)[None] / 255
    pr = s.run(None, {'img': x})[0][0, 0].astype(np.float32)
    pr.tofile(f'{dst}/{f}.f32'); np.dstack([r, np.full(r.shape[:2], 255, np.uint8)]).tofile(f'{dst}/{f}.rgba')
    cv2.imwrite(f'{dst}/{f}_prob.png', (pr * 255).astype(np.uint8))
    k2 = 384 / max(a.shape[:2]); w2, h2 = max(16, round(a.shape[1] * k2 / 16) * 16), max(16, round(a.shape[0] * k2 / 16) * 16)
    z = sz.run(None, {'img': cv2.resize(a, (w2, h2), interpolation=cv2.INTER_AREA).astype(np.float32).transpose(2, 0, 1)[None] / 255})[0][0].argmax(0)
    yy = np.minimum(h2 - 1, (np.arange(h) * h2 // h)); xx = np.minimum(w2 - 1, (np.arange(w) * w2 // w))
    roca = np.isin(z[yy][:, xx], [1, 2]).astype(np.uint8); roca.tofile(f'{dst}/{f}.zona')
    json.dump(dict(w=w, h=h, f32=True, rgba=True, zona=bool(roca.mean() > .15)), open(f'{dst}/{f}.json', 'w'))
    print(f, w, h, float(pr.mean()), float((pr > .5).mean()))

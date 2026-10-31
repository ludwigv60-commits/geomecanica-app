# Evaluación independiente: 65 fotos de taludes rocosos con fracturas marcadas (repo nicekwow, sin licencia: solo medir).
import sys, glob, cv2, numpy as np, onnxruntime as ort
from skimage.morphology import skeletonize
D = '/home/user/data/gh/Edge-Weighting-Driven-Rock-Slope-Fracture-Detection-and-Scale-Effect-Analysis/data/slope_fracture'
s = ort.InferenceSession(sys.argv[1]); L = int(sys.argv[2]) if len(sys.argv) > 2 else 640; tol = 4
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * tol + 1, 2 * tol + 1)); tp = fp = fn = npos = 0
for f in sorted(glob.glob(f'{D}/img_dir/val/*.jpg')):
    a = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB); m = (cv2.imread(f.replace('img_dir', 'ann_dir').replace('.jpg', '.png'), 0) > 0).astype(np.uint8)
    kk = L / max(a.shape[:2]); w, h = round(a.shape[1] * kk / 16) * 16, round(a.shape[0] * kk / 16) * 16
    r = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA); m = (cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8)
    p = (s.run(None, {'img': r.astype(np.float32).transpose(2, 0, 1)[None] / 255})[0][0, 0] > .5)
    ps = skeletonize(p).astype(np.uint8); ms = skeletonize(m.astype(bool)).astype(np.uint8)
    tp += (ps & cv2.dilate(ms, k)).sum(); fp += (ps & (1 - cv2.dilate(ms, k))).sum(); fn += (ms & (1 - cv2.dilate(ps, k))).sum(); npos += ms.sum()
P = tp / max(tp + fp, 1); R = 1 - fn / max(npos, 1); print(f'{sys.argv[1]} L={L}: precisión {P:.2f} recall {R:.2f} F1 {2*P*R/max(P+R,1e-9):.2f}')

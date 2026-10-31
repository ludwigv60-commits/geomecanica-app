# Evaluación independiente: 23 fotos de roca con fracturas marcadas (repo Montherapy, sin licencia: solo para medir).
import sys, glob, cv2, numpy as np, onnxruntime as ort
from PIL import Image
s = ort.InferenceSession(sys.argv[1]); L = int(sys.argv[2]) if len(sys.argv) > 2 else 640; tol = 4
tp = fp = fn = npos = 0
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * tol + 1, 2 * tol + 1))
for f in sorted(glob.glob('/home/user/data/mont/images/img_label_*/img.png')):
    a = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB); m = (np.array(Image.open(f.replace('img.png', 'label.png'))) > 0).astype(np.uint8)
    r = cv2.resize(a, (L, L), interpolation=cv2.INTER_AREA); m = (cv2.resize(m, (L, L), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8)
    p = (s.run(None, {'img': r.astype(np.float32).transpose(2, 0, 1)[None] / 255})[0][0, 0] > .5).astype(np.uint8)
    from skimage.morphology import skeletonize
    ps = skeletonize(p).astype(np.uint8); ms = skeletonize(m).astype(np.uint8)
    tp += (ps & cv2.dilate(ms, k)).sum(); fp += (ps & (1 - cv2.dilate(ms, k))).sum(); fn += (ms & (1 - cv2.dilate(ps, k))).sum(); npos += ms.sum()
P = tp / max(tp + fp, 1); R = 1 - fn / max(npos, 1); print(f'{sys.argv[1]} L={L}: precisión {P:.2f} recall {R:.2f} F1 {2*P*R/max(P+R,1e-9):.2f}')

# Zonas de la foto de una labor: 1 frente (roca expuesta), 2 roca de contorno, 3 shotcrete/revestimiento, 4 piso, 0 otro.
# Datos: Zenodo 10.5281/zenodo.10261105 (CC-BY 4.0, Chen Baolin), 101 fotos de frentes de túnel.
import glob, random, sys, time, numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F
from modelo import TrazasNet
torch.set_num_threads(int(sys.argv[2]) if len(sys.argv) > 2 else 4); random.seed(0); torch.manual_seed(0)
fs = sorted(glob.glob('/home/user/data/zona/*_m.png'))
secs = sorted({f.split('/')[-1].split('_')[0] for f in fs}); random.shuffle(secs)
val_secs = set(secs[:max(2, len(secs) // 6)])
datos = [(cv2.cvtColor(cv2.imread(f.replace('_m.png', '.jpg')), cv2.COLOR_BGR2RGB), cv2.imread(f, 0), f.split('/')[-1].split('_')[0]) for f in fs]
tr = [(a, m) for a, m, s in datos if s not in val_secs]; va = [(a, m) for a, m, s in datos if s in val_secs]
print('train', len(tr), 'val', len(va), flush=True)

def aum(a, m, H=256, W=384):
    a = a.astype(np.float32) / 255
    s = random.uniform(.8, 1.25); hh, ww = int(320 * s), int(480 * s)
    a = cv2.resize(a, (ww, hh)); m = cv2.resize(m, (ww, hh), interpolation=cv2.INTER_NEAREST)
    # recorte con relleno (fotos con el frente descentrado o más cerca)
    y = random.randint(min(0, hh - H), max(0, hh - H)); x = random.randint(min(0, ww - W), max(0, ww - W))
    A = np.zeros((H, W, 3), np.float32); M = np.zeros((H, W), np.uint8)
    ys, xs = max(0, y), max(0, x); ye, xe = min(hh, y + H), min(ww, x + W)
    A[ys - y:ye - y, xs - x:xe - x] = a[ys:ye, xs:xe]; M[ys - y:ye - y, xs - x:xe - x] = m[ys:ye, xs:xe]
    if random.random() < .5: A, M = A[:, ::-1], M[:, ::-1]
    if random.random() < .5: g = A.mean(2, keepdims=True); t = random.uniform(.3, 1); A = A * (1 - t) + g * t
    A = A * random.uniform(.15, 1.2) * np.random.uniform(.8, 1.2, 3).astype(np.float32)
    if random.random() < .6:
        yy, xx = np.mgrid[0:H, 0:W]; cy, cx = random.uniform(0, H), random.uniform(0, W); r = random.uniform(30, 160)
        A = A + random.uniform(.2, 1) * np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * r * r))[..., None]
    if random.random() < .3: A = cv2.GaussianBlur(A, (0, 0), random.uniform(.5, 2))
    return np.clip(A, 0, 1).transpose(2, 0, 1).astype(np.float32).copy(), M.astype(np.int64).copy()

net = TrazasNet(); net.sal = nn.Conv2d(16, 5, 1)
opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4)
E = int(sys.argv[1]) if len(sys.argv) > 1 else 40; B = 8; pasos = E * (len(tr) // B)
sch = torch.optim.lr_scheduler.OneCycleLR(opt, 1e-3, total_steps=pasos); t0 = time.time()
def val():
    net.eval(); I = np.zeros(5); U = np.zeros(5)
    with torch.no_grad():
        for a, m in va:
            x = torch.from_numpy(cv2.resize(a, (384, 256)).astype(np.float32).transpose(2, 0, 1)[None] / 255)
            p = net(x).argmax(1)[0].numpy(); mm = cv2.resize(m, (384, 256), interpolation=cv2.INTER_NEAREST)
            for c in range(5): I[c] += ((p == c) & (mm == c)).sum(); U[c] += ((p == c) | (mm == c)).sum()
    net.train(); return np.round(I / np.maximum(U, 1), 3)
for ep in range(E):
    random.shuffle(tr)
    for i in range(0, len(tr) - B + 1, B):
        xs, ms = zip(*(aum(a, m) for a, m in tr[i:i+B]))
        lo = net(torch.from_numpy(np.stack(xs))); l = F.cross_entropy(lo, torch.from_numpy(np.stack(ms)))
        opt.zero_grad(); l.backward(); opt.step(); sch.step()
    if ep % 5 == 4 or ep == E - 1: print(ep, round(l.item(), 3), 'IoU [otro,frente,contorno,shotcrete,piso]', val(), f'{time.time()-t0:.0f}s', flush=True)
torch.save(net.state_dict(), '/home/user/ml/zona.pt')

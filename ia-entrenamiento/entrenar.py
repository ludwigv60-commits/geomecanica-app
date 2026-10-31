# Entrena TrazasNet con GeoCrack (CC0) [+ otros pares imagen/máscara]. CPU.
import glob, os, random, sys, time, numpy as np, cv2, torch, torch.nn.functional as F
from modelo import TrazasNet
torch.set_num_threads(4); random.seed(0); np.random.seed(0); torch.manual_seed(0)
GC = '/home/user/data/gc/patched_images'
VAL_IMGS = {'0V5A3736', 'DJI_0065', 'DJI_0226', 'DJI_0413', 'DJI_0796'}  # imágenes completas reservadas para validar

def cargar_gc():
    tr, va = [], []
    for f in sorted(glob.glob(f'{GC}/*_original_patch*.png')):
        src = os.path.basename(f).split('_original_')[0]
        m = cv2.imread(f.replace('_original_', '_binarymask_'), 0)
        if m is None: continue
        a = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
        (va if src in VAL_IMGS else tr).append((a, (m > 127).astype(np.uint8)))
    return tr, va

def extra():
    # pares adicionales en /home/user/data/extra/{img,mask}/*.png (si existen)
    out = []
    for f in sorted(glob.glob('/home/user/data/extra/img/*.png')) + sorted(glob.glob('/home/user/data/extra2/img/*.png')):
        m = cv2.imread(f.replace('/img/', '/mask/'), 0)
        if m is None: continue
        out.append((cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB), (m > 127).astype(np.uint8)))
    return out

TR = None  # lista de entrenamiento (para mosaicos)
def aumentar(a, m, S=224):
    if TR is not None and random.random() < .45:
        n = random.choice([2, 2, 3]); ps = [(a, m)] + [random.choice(TR) for _ in range(n * n - 1)]
        A = np.vstack([np.hstack([ps[i * n + j][0] for j in range(n)]) for i in range(n)])
        M = np.vstack([np.hstack([ps[i * n + j][1] for j in range(n)]) for i in range(n)])
        a = cv2.resize(A, (S, S), interpolation=cv2.INTER_AREA)
        m = (cv2.resize(M.astype(np.float32), (S, S), interpolation=cv2.INTER_AREA) > 0.2).astype(np.uint8)
    a = a.astype(np.float32) / 255
    # escala (fotos de celular de frentes: trazas de grosor variable)
    s = random.uniform(0.6, 1.4)
    if abs(s - 1) > 0.05:
        a = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
        m = cv2.resize(m, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
    if a.shape[0] < S:
        p = S - a.shape[0]; a = cv2.copyMakeBorder(a, 0, p, 0, p, cv2.BORDER_REFLECT); m = cv2.copyMakeBorder(m, 0, p, 0, p, cv2.BORDER_REFLECT)
    y, x = random.randint(0, a.shape[0] - S), random.randint(0, a.shape[1] - S)
    a, m = a[y:y+S, x:x+S], m[y:y+S, x:x+S]
    k = random.randint(0, 3); a, m = np.rot90(a, k), np.rot90(m, k)
    if random.random() < .5: a, m = a[:, ::-1], m[:, ::-1]
    a = np.ascontiguousarray(a); m = np.ascontiguousarray(m)
    # color/luz: frentes subterráneos (oscuros, grises, luz de lámpara, polvo, desenfoque)
    if random.random() < .5: g = a.mean(2, keepdims=True); t = random.uniform(.3, 1); a = a * (1 - t) + g * t
    a = a * random.uniform(.25, 1.3) + random.uniform(-.1, .1)
    a = a * np.random.uniform(.85, 1.15, 3).astype(np.float32)
    if random.random() < .4:  # foco de lámpara
        yy, xx = np.mgrid[0:S, 0:S]; cy, cx = random.uniform(0, S), random.uniform(0, S); r = random.uniform(40, 150)
        a = a + random.uniform(.2, .8) * np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * r * r))[..., None]
    if random.random() < .3: a = cv2.GaussianBlur(a, (0, 0), random.uniform(.5, 1.5))
    if random.random() < .3: f = random.uniform(.35, .7); sm = cv2.resize(a, None, fx=f, fy=f, interpolation=cv2.INTER_AREA); a = cv2.resize(sm, (S, S))
    if random.random() < .4: a = a + np.random.normal(0, random.uniform(.01, .05), a.shape).astype(np.float32)
    return np.clip(a, 0, 1).transpose(2, 0, 1).astype(np.float32), m.astype(np.float32)

def perdida(lo, m):
    bce = F.binary_cross_entropy_with_logits(lo, m, pos_weight=torch.tensor(3.0))
    p = torch.sigmoid(lo); i = (p * m).sum((1, 2, 3)); d = 1 - (2 * i + 1) / (p.sum((1, 2, 3)) + m.sum((1, 2, 3)) + 1)
    return bce + d.mean()

def evaluar(net, va, tol=2):
    net.eval(); tp = fp = fn = 0; I = U = 0
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * tol + 1, 2 * tol + 1))
    with torch.no_grad():
        for i in range(0, len(va), 64):
            b = va[i:i+64]
            x = torch.from_numpy(np.stack([a.transpose(2, 0, 1) for a, _ in b]).astype(np.float32) / 255)
            p = (torch.sigmoid(net(x))[:, 0].numpy() > .5).astype(np.uint8)
            for pi, (_, m) in zip(p, b):
                I += (pi & m).sum(); U += (pi | m).sum()
                tp += (pi & cv2.dilate(m, k)).sum(); fp += (pi & (1 - cv2.dilate(m, k))).sum(); fn += (m & (1 - cv2.dilate(pi, k))).sum()
    P = tp / max(tp + fp, 1); R = 1 - fn / max((sum(m.sum() for _, m in va)), 1)
    net.train(); return dict(IoU=I / max(U, 1), P=P, R=R, F1=2 * P * R / max(P + R, 1e-9))

if __name__ == '__main__':
    epocas = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    tr, va = cargar_gc(); ex = extra(); tr += ex; TR = tr
    print('train', len(tr), 'val', len(va), 'extra', len(ex), flush=True)
    net = TrazasNet()
    if len(sys.argv) > 2: net.load_state_dict(torch.load(sys.argv[2])); print('desde', sys.argv[2])
    pref = sys.argv[3] if len(sys.argv) > 3 else 'trazas'
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4)
    B = 16; pasos = epocas * (len(tr) // B); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 1e-3, total_steps=pasos)
    paso = 0; t0 = time.time(); mejor = -1
    for ep in range(epocas):
        random.shuffle(tr)
        for i in range(0, len(tr) - B + 1, B):
            xs, ms = zip(*(aumentar(a, m) for a, m in tr[i:i+B]))
            x = torch.from_numpy(np.stack(xs)); m = torch.from_numpy(np.stack(ms))[:, None]
            l = perdida(net(x), m); opt.zero_grad(); l.backward(); opt.step(); sch.step(); paso += 1
            if paso % 100 == 0: print(f'ep{ep} paso {paso}/{pasos} loss {l.item():.3f} {time.time()-t0:.0f}s', flush=True)
        r = evaluar(net, va); print('VAL', ep, {k: round(float(v), 3) for k, v in r.items()}, flush=True)
        torch.save(net.state_dict(), f'/home/user/ml/{pref}_ep{ep}.pt')
        if r['F1'] > mejor: mejor = r['F1']; torch.save(net.state_dict(), f'/home/user/ml/{pref}_mejor.pt')

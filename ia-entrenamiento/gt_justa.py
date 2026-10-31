# Extrae las rectas dibujadas por el geomecánico (amarillo/rojo) en las fotos anotadas.
import cv2, numpy as np, json
D = '/mnt/project-files/dataset/'
FOTOS = ['CMB660SE_021026', 'CMB660SE_041026', 'RPNORTE_270926', 'RPSUR_131026', 'frente4']
def rectas(nombre):
    a = cv2.imread(D + nombre + '_anotada.png'); h, w = a.shape[:2]
    hsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV)
    am = cv2.inRange(hsv, (22, 120, 150), (38, 255, 255)); ro = cv2.inRange(hsv, (0, 150, 150), (8, 255, 255)) | cv2.inRange(hsv, (172, 150, 150), (180, 255, 255))
    out = []
    for color, m in (('amarillo', am), ('rojo', ro)):
        L = cv2.HoughLinesP(m, 1, np.pi / 360, 60, minLineLength=int(0.30 * min(w, h)), maxLineGap=25)
        for x1, y1, x2, y2 in ([] if L is None else L.reshape(-1, 4)):
            ang = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
            # ¿ya existe una recta casi igual?
            dup = False
            for o in out:
                da = abs((o['ang'] - ang + 90) % 180 - 90)
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                t = np.radians(o['ang']); dist = abs(-(cx - o['x1']) * np.sin(t) + (cy - o['y1']) * np.cos(t))
                if da < 6 and dist < 15: dup = True; break
            if not dup: out.append(dict(color=color, ang=float(ang), x1=int(x1), y1=int(y1), x2=int(x2), y2=int(y2)))
    return out, (w, h)
if __name__ == '__main__':
    res = {}; vis = []
    for f in FOTOS:
        r, wh = rectas(f); res[f] = dict(rectas=r, wh=wh)
        a = cv2.imread(D + f + '_anotada.png')
        for l in r: cv2.line(a, (l['x1'], l['y1']), (l['x2'], l['y2']), (255, 0, 255), 3)
        vis.append(cv2.resize(a, (400, 340)))
        print(f, [(l['color'][0], round(l['ang'])) for l in r])
    json.dump(res, open('/home/user/ml/gt_justa.json', 'w'), indent=1)
    vis.append(np.zeros_like(vis[0]))
    cv2.imwrite('/home/user/ml/gt_vis.jpg', np.vstack([np.hstack(vis[:3]), np.hstack(vis[3:])]))

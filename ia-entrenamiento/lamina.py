# Lámina por foto: [anotación del geomecánico | lo que propone la IA (estructuras 1-5 por importancia + zonas)]
import sys, json, cv2, numpy as np, os
from gt_justa import FOTOS, D
dst = sys.argv[1]; res = json.load(open(sys.argv[2])); out = sys.argv[3]; os.makedirs(out, exist_ok=True)
COL = [(0, 230, 255), (255, 229, 0), (216, 79, 255), (79, 255, 124), (0, 138, 255)]  # BGR
NOM = {'red': 'IA'}
for f in FOTOS + ['frente_311026']:
    m = json.load(open(f'{dst}/{f}.json')); w, h = m['w'], m['h']
    a = np.fromfile(f'{dst}/{f}.rgba', np.uint8).reshape(h, w, 4)[..., :3][..., ::-1].copy()
    z = np.fromfile(f'{dst}/{f}.zona', np.uint8).reshape(h, w) if os.path.exists(f'{dst}/{f}.zona') else None
    o = a.copy()
    if z is not None:
        cnt, _ = cv2.findContours(z, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); cv2.drawContours(o, cnt, -1, (255, 255, 255), 1)
    r = res[f]['red']
    for s in r['segmentos']:
        if s['familia'] < 0: continue
        cv2.line(o, (int(s['x1']), int(s['y1'])), (int(s['x2']), int(s['y2'])), COL[s['familia'] % 5], 3, cv2.LINE_AA)
    y = 22
    cv2.rectangle(o, (0, 0), (w, 26 + 22 * len(r['familias'])), (0, 0, 0), -1)
    cv2.putText(o, f"IA: {len(r['familias'])} estructuras - confianza {r['nivel']} ({int(r['confianza']*100)}%)", (8, y), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 1, cv2.LINE_AA)
    for fa in r['familias']:
        y += 22; cv2.putText(o, f"E{fa['id']+1}: traza a {fa['ang']} grados en la foto, {fa['segmentos']} trazas", (8, y), cv2.FONT_HERSHEY_SIMPLEX, .55, COL[fa['id'] % 5], 1, cv2.LINE_AA)
    an = D + f + '_anotada.png'
    izq = cv2.resize(cv2.imread(an), (w, h)) if os.path.exists(an) else a.copy()
    cv2.putText(izq, 'Geomecanico' if os.path.exists(an) else 'Foto original (sin anotar)', (8, h - 12), cv2.FONT_HERSHEY_SIMPLEX, .7, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(f'{out}/{f}.jpg', np.hstack([izq, o]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print('ok')

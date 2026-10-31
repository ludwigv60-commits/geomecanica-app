# Compara familias propuestas (app) con las rectas del geomecánico. Ángulos convención app: 0°=horizontal, antihorario.
import json, sys, numpy as np
gt = json.load(open('/home/user/ml/gt_justa.json')); res = json.load(open(sys.argv[1])); TOL = float(sys.argv[2]) if len(sys.argv) > 2 else 15
dif = lambda a, b: min(abs(a - b) % 180, 180 - abs(a - b) % 180)
tot = {}
for f, g in gt.items():
    rect = [(180 - l['ang']) % 180 for l in g['rectas']]   # imagen (y hacia abajo) -> app
    ref = rect + [0.0]   # + familia subhorizontal (el arco amarillo D3 que dibuja en todas las fotos)
    for met in ('red', 'clasico'):
        if met not in res.get(f, {}): continue
        fam = [x['ang'] for x in res[f][met]['familias']]
        hit = sum(any(dif(r, a) <= TOL for a in fam) for r in rect)
        hit_sub = any(dif(0, a) <= 20 for a in fam)
        ok = sum(any(dif(a, r) <= TOL for r in ref) for a in fam)
        t = tot.setdefault(met, [0, 0, 0, 0, 0]); t[0] += hit; t[1] += len(rect); t[2] += ok; t[3] += len(fam); t[4] += hit_sub
        extra = f" conf={res[f][met].get('confianza')}({res[f][met].get('nivel')})" if met == 'red' else ''
        print(f'{f:16s} {met:8s} geomecánico={[round(r) for r in rect]} IA={fam} recall {hit}/{len(rect)} precisión {ok}/{len(fam)} subhoriz={hit_sub}{extra}')
for m, t in tot.items():
    print(f'TOTAL {m}: rectas encontradas {t[0]}/{t[1]} ({t[0]/max(t[1],1):.0%}), familias IA correctas {t[2]}/{t[3]} ({t[2]/max(t[3],1):.0%}), subhorizontal {t[4]}/5')
# Línea base de AZAR: mismas cantidades de familias pero con ángulos al azar (10 000 repeticiones).
rng = np.random.default_rng(0)
for m in tot:
    hs = []; ps = []
    for _ in range(2000):
        h = n = o = k = 0
        for f, g in gt.items():
            if m not in res.get(f, {}): continue
            rect = [(180 - l['ang']) % 180 for l in g['rectas']]; nf = len(res[f][m]['familias'])
            fam = list(rng.uniform(0, 180, nf))
            h += sum(any(dif(r, a) <= TOL for a in fam) for r in rect); n += len(rect)
            o += sum(any(dif(a, r) <= TOL for r in rect + [0.0]) for a in fam); k += nf
        hs.append(h / max(n, 1)); ps.append(o / max(k, 1))
    print(f'AZAR {m}: rectas {np.mean(hs):.0%}, familias correctas {np.mean(ps):.0%}')

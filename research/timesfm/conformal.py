import csv, json, numpy as np, timesfm
from pathlib import Path

from calibration import conformal_quantile

DATA = Path(__file__).resolve().parent / 'data'
rows=list(csv.reader(open(DATA / 'csu_food_xl.csv'))); months=rows[0][2:]
series=[(r[1],np.array([float(v) for v in r[2:]])) for r in rows[1:]]
N=len(months); H=12; ALPHA=0.20            # target 80% coverage
# Rolling origins, one per year. Calibration for a given test origin uses only
# origins strictly BEFORE it — no peeking at the future.
ORIGINS=[N-72,N-60,N-48,N-36,N-24,N-12]
m=timesfm.TimesFM_2p5_200M_torch.from_pretrained('google/timesfm-2.5-200m-pytorch')
m.compile(timesfm.ForecastConfig(max_context=168,max_horizon=H,normalize_inputs=True,
  use_continuous_quantile_head=True,infer_is_positive=True,fix_quantile_crossing=True))

# One forecast per (origin, series). q channels: 0=mean, 1..9 = deciles.
F={}
for O in ORIGINS:
    pt,q=m.forecast(horizon=H,inputs=[list(s[max(O-120,0):O]) for _,s in series])
    act=np.array([s[O:O+H] for _,s in series])
    F[O]=dict(point=np.array(pt), lo=np.array(q)[:,:,1], hi=np.array(q)[:,:,9], act=act)
    print(f'  forecast at {months[O]} done')

def report(name, rows_):
    cov=np.mean([r['cov'] for r in rows_])*100
    wid=np.mean([r['wid'] for r in rows_])
    rel=np.mean([r['rel'] for r in rows_])*100
    print(f'  {name:34s} coverage {cov:5.1f}%   mean width {wid:7.2f} Kč  ({rel:4.1f}% of price)')
    return cov,wid,rel

out={}
for mode in ['raw','split-pooled','split-perstep','cqr-pooled','cqr-perstep','cqr-relative','cqr-rel-perstep']:
    rows_=[]
    for ti,O in enumerate(ORIGINS):
        cal=[ORIGINS[j] for j in range(ti)]          # strictly earlier origins
        if mode!='raw' and not cal: continue          # need calibration data
        d=F[O]; pt,lo,hi,act=d['point'],d['lo'],d['hi'],d['act']
        if mode=='raw':
            L,U=lo,hi
        else:
            # residual scores from calibration origins
            if mode.startswith('split'):
                sc=[np.abs(F[c]['act']-F[c]['point']) for c in cal]
            elif mode.startswith('cqr-rel'):
                # Same CQR score, divided by the series' own level so one
                # correction serves 13 Kč potatoes and 240 Kč butter alike.
                sc=[np.maximum(F[c]['lo']-F[c]['act'], F[c]['act']-F[c]['hi'])
                    / F[c]['point'] for c in cal]
            else:                                      # CQR score, absolute Kč
                sc=[np.maximum(F[c]['lo']-F[c]['act'], F[c]['act']-F[c]['hi']) for c in cal]
            S=np.concatenate(sc,axis=0)                # (n_cal*series, H)
            if mode.endswith('perstep'):
                e=np.array([conformal_quantile(S[:,h],ALPHA) for h in range(H)])[None,:]
            else:
                e=np.full((1,H), conformal_quantile(S,ALPHA))
            if mode.startswith('cqr-rel'): L,U=lo-e*pt, hi+e*pt
            elif mode.startswith('split'): L,U=pt-e, pt+e
            else:                          L,U=lo-e, hi+e
        for i in range(len(series)):
            inside=((act[i]>=L[i])&(act[i]<=U[i])).mean()
            w=(U[i]-L[i]).mean()
            rows_.append(dict(cov=inside, wid=w, rel=w/act[i].mean()))
    out[mode]=report(mode, rows_)
print()
print('  target coverage 80%.  Calibration always uses only origins earlier than the test origin.')
json.dump({k:[float(x) for x in v] for k,v in out.items()}, open(DATA.parent / 'conformal.json','w'))

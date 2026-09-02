import json, numpy as np, timesfm
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'
d=json.load(open(DATA / 'cen02_series.json')); E=d['months'].index('2026-05')+1
M=d['months'][:E]; D={k:v[:E] for k,v in d['data'].items()}
N=len(M); H=12
PAIRS=[('613716',['660504','627706'],'Milk'),('613717',['660505','627706'],'Butter'),
 ('613718',['660506','627706'],'Edam cheese'),('613719',['627707'],'Eggs'),
 ('613720',['660507','660508','627708'],'Wheat flour'),('613721',['627709'],'Potatoes'),
 ('613722',['627711'],'Apples'),('613712',['660501','627701','627702'],'Beef'),
 ('613714',['660502','627703','627704'],'Pork'),('613715',['660503','627705'],'Chicken')]
def arr(c):
    s=np.array([np.nan if v is None else v for v in D[c]],float)
    if np.isnan(s).any():
        i=np.arange(len(s)); ok=~np.isnan(s); s=np.interp(i,i[ok],s[ok])
    return s
S={c:arr(c) for c in {t for t,_,_ in PAIRS}|{c for _,cs,_ in PAIRS for c in cs}}
m=timesfm.TimesFM_2p5_200M_torch.from_pretrained('google/timesfm-2.5-200m-pytorch')
m.compile(timesfm.ForecastConfig(max_context=160,max_horizon=H,normalize_inputs=True,
 use_continuous_quantile_head=True,infer_is_positive=True,fix_quantile_crossing=True,return_backcast=True))
mape=lambda a,f: float(np.mean(np.abs((a-f)/a))*100)
ORIGINS=[N-48,N-36,N-24,N-12]
KEYS=['plain','oracle','lag12','frozen','naive']
res={k:[] for k in KEYS}; detail=[]
for O in ORIGINS:
    for t,cs,name in PAIRS:
        y=S[t]; ctx=[list(y[:O])]; a=y[O:O+H]
        pt,_=m.forecast(horizon=H,inputs=ctx); plain=np.array(pt)[0][-H:]
        mk=lambda f:{c:[list(f(S[c]))] for c in cs}
        co=mk(lambda x: x[:O+H])                                              # oracle
        cl=mk(lambda x: np.concatenate([np.repeat(x[0],12), x[:O+H-12]]))      # lagged 12mo
        cf=mk(lambda x: np.concatenate([x[:O], np.repeat(x[O-1],H)]))          # frozen at last known
        def run(cov): 
            o,_=m.forecast_with_covariates(inputs=ctx,dynamic_numerical_covariates=cov,
                xreg_mode='xreg + timesfm',ridge=1.0,force_on_cpu=True)
            return np.array(o)[0][-H:]
        v=dict(plain=mape(a,plain),oracle=mape(a,run(co)),lag12=mape(a,run(cl)),
               frozen=mape(a,run(cf)),naive=mape(a,np.repeat(y[O-1],H)))
        for k in KEYS: res[k].append(v[k])
        detail.append((M[O],name,v))
print(f'{"period":8s} {"item":12s} '+' '.join(f'{k:>7s}' for k in KEYS))
for per,name,v in detail:
    b=min(v.values())
    print(f'{per:8s} {name:12s} '+' '.join(f'{v[k]:6.1f}'+('*' if v[k]==b else ' ') for k in KEYS))
print(f'\npooled over {len(detail)} forecasts:')
for k in KEYS:
    x=np.array(res[k]); print(f'  {k:7s} mean MAPE {x.mean():6.2f}  median {np.median(x):6.2f}')
p=np.array(res['plain']); nv=np.array(res['naive'])
for k in ['oracle','lag12','frozen']:
    for base,bn in [(p,'plain'),(nv,'naive')]:
        dd=np.array(res[k])-base; se=dd.std(ddof=1)/np.sqrt(len(dd))
        print(f'  {k:7s} vs {bn:6s}: {dd.mean():+6.2f} pp (se {se:.2f}, t {dd.mean()/se:+.2f})')
json.dump(res,open(DATA.parent / 'cov3_res.json','w'))

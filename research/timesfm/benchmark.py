import csv, json, numpy as np, timesfm
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'
rows=list(csv.reader(open(DATA / 'csu_food_xl.csv'))); months=rows[0][2:]
series=[(r[1],np.array([float(v) for v in r[2:]])) for r in rows[1:]]
N=len(months); H=12
ORIGINS=[N-48,N-36,N-24,N-12]                 # 2022,2023,2024,2025
LENS=[12,24,36,48,60,72,96,120,144,168,192]
m=timesfm.TimesFM_2p5_200M_torch.from_pretrained('google/timesfm-2.5-200m-pytorch')
m.compile(timesfm.ForecastConfig(max_context=200,max_horizon=H,normalize_inputs=True,
  use_continuous_quantile_head=True,infer_is_positive=True,fix_quantile_crossing=True))
mape=lambda a,f: float(np.mean(np.abs((a-f)/a))*100)
E={}; C={}
for L in LENS:
    e=[]; c=[]
    for O in ORIGINS:
        pt,q=m.forecast(horizon=H,inputs=[s[O-L:O] for _,s in series])
        act=np.array([s[O:O+H] for _,s in series])
        e+=[mape(act[i],pt[i]) for i in range(len(series))]
        c.append(np.mean((act>=q[:,:,1])&(act<=q[:,:,9]))*100)
    E[L]=np.array(e); C[L]=float(np.mean(c))
    print(f'context {L:3d} mo ({L/12:4.1f} yr)  mean MAPE {E[L].mean():6.2f}  median {np.median(E[L]):6.2f}  80%-cov {C[L]:4.0f}%')
nb=[];sb=[];db=[]
for O in ORIGINS:
    for _,s in series:
        a=s[O:O+H]; c=s[:O]
        nb.append(mape(a,np.repeat(c[-1],H))); sb.append(mape(a,c[O-12:O]))
        db.append(mape(a,c[-1]+((c[-1]-c[-37])/36)*np.arange(1,H+1)))
print(f'\nbaselines: naive {np.mean(nb):.2f}  seasonal-naive {np.mean(sb):.2f}  drift {np.mean(db):.2f}')
best=min(LENS,key=lambda L:E[L].mean())
d=E[best]-E[12]; se=d.std(ddof=1)/np.sqrt(len(d))
print(f'best context {best} mo: {E[best].mean():.2f}  vs 12 mo {E[12].mean():.2f}  paired diff {d.mean():+.2f} pp (se {se:.2f}, t {d.mean()/se:.2f})')
dn=E[best]-np.array(nb); sen=dn.std(ddof=1)/np.sqrt(len(dn))
print(f'best context vs naive: paired diff {dn.mean():+.2f} pp (se {sen:.2f}, t {dn.mean()/sen:.2f})')
json.dump({'mape':{str(L):E[L].mean() for L in LENS},'cov':{str(L):C[L] for L in LENS},
           'naive':float(np.mean(nb)),'snaive':float(np.mean(sb)),'drift':float(np.mean(db))},
          open(DATA.parent / 'sweep_xl.json','w'),indent=1)

# TimesFM on Czech food prices — benchmark

Does Google's [TimesFM](https://github.com/google-research/timesfm) time-series
foundation model beat a naive baseline on Czech food prices?

**No.** It ties with "repeat last month's price" at every context length from
1 to 16 years. It wins only when given the farm-gate or producer price of the
same commodity as a covariate, and even then the win is fragile in production.
Its prediction intervals are badly calibrated out of the box, but that part is
fixable and the fix is here.

These scripts exist so the conclusion is reproducible rather than asserted. The
settled version lives in the project `CLAUDE.md` under "Forecasting"; don't
re-litigate it from memory, re-run it.

## Results

All figures: 12 Czech staples, 12-month horizon, rolling annual origins,
TimesFM 2.5 (200M, Apache-2.0), MAPE unless stated.

| Configuration | Error | Baseline |
|---|---|---|
| TimesFM, no covariates, best context (96 mo) | 9.86% | naive 9.55% |
| TimesFM, 12-month context | 11.21% | — |
| TimesFM, 192-month context | 10.02% | — |
| Seasonal naive | 15.05% | — |
| Linear drift | 11.67% | — |
| **+ own chain covariates, frozen, `xreg + timesfm`** | **10.44%** | **naive 12.07%** |
| + own chain covariates, oracle future values | 6.56% | naive 12.07% |
| + energy/fertiliser/fuel covariates | 11.67% | no better than none |

Three things worth carrying forward:

- **Accuracy plateaus at ~8 years of history.** 96 months is the best point on
  the curve; 120, 144, 168 and 192 are all slightly worse. More history does not
  help and the curve is not monotonic.
- **`xreg_mode` decides everything.** `'xreg + timesfm'` scores 6.56% and
  `'timesfm + xreg'` scores 17.77% on identical inputs — the latter is worse
  than using no covariates at all. Google publishes no guidance on which to use.
- **Macro covariates add nothing.** Energy, fertiliser and fuel are already
  contained in the farm-gate price; a retrospective regression put their
  incremental adjusted R² at ≈0 while the farm-gate price added +0.13.

### Interval calibration

TimesFM's quantile head is uncalibrated. Correcting it empirically works:

| Method | Coverage (target 80%) | Mean width |
|---|---|---|
| Raw TimesFM quantiles | 71.6% | 22.7% of price |
| Split conformal, pooled | 75.0% | 49.0% of price |
| CQR, pooled | 77.8% | 27.6% of price |
| **CQR, scale-relative** | **79.0%** | **27.7% of price** |

Split conformal applies one absolute Kč width to every series, which is far too
wide for 13 Kč potatoes and too narrow for 240 Kč butter — hence the 49%. Dividing
the correction by each series' own level fixes it. Per-horizon-step calibration
made things worse in every variant, most likely because the calibration sets are
too small to split twelve ways.

The residual 1-point shortfall is an exchangeability failure: the calibration
windows contain the 2021–23 inflation shock and the test windows mostly don't.
Adaptive conformal prediction is the standard remedy; untested here.

## Files

| File | What it does |
|---|---|
| `fetch_csu.py` | Rebuilds `data/` from the ČSÚ API. Only needed for fresher months. |
| `benchmark.py` | Context-length sweep against naive, seasonal-naive and drift. |
| `covariates.py` | Farm-gate/producer covariates: oracle, lagged and frozen. |
| `conformal.py` | Interval calibration — split conformal and CQR variants. |
| `calibration.py` | The conformal maths, extracted so it is testable. |
| `test_calibration.py` | Tests for that maths. |

`data/csu_food_xl.csv` is 12 series × 240 months (2006-01…2025-12), spliced from
three ČSÚ vintages. `data/cen02_series.json` is farm-gate, producer and consumer
prices for the same commodities, 2013-01 onward — the covariate source.

## Running it

```bash
cd research/timesfm && uv sync && uv run pytest
```

```bash
cd research/timesfm && uv run python conformal.py
```

The first TimesFM run downloads ~800 MB of weights and takes about 80 seconds to
load. `benchmark.py` takes a few minutes; `conformal.py` about one.

## Caveats

The ČSÚ series are monthly national averages: weakly seasonal, near random walk
in levels, and only twelve of them. Independent evaluation
([arXiv 2602.12147](https://arxiv.org/abs/2602.12147)) finds foundation models
separate from naive baselines on *non-stationary* series with *strong* seasonality
and cluster indistinguishably otherwise — so this result is what that literature
predicts, not a surprise, and it does **not** transfer to daily per-product shelf
prices, which are many more series, higher frequency and genuinely non-stationary.
That case is untested.

Note also that published TSFM leaderboards are measurably contaminated: only ~6%
of 401 datasets across the literature were never used in some model's pretraining
([arXiv 2510.13654](https://arxiv.org/abs/2510.13654)). Fresh national statistics
like these are a more trustworthy test than a leaderboard placement.

"""Conformal calibration of prediction intervals.

TimesFM's quantile head is not calibrated: on the ČSÚ data its nominal 80% band
covered 71.6% of actuals. These helpers correct that empirically — measure how
wrong the model was on data it did not see, then resize the interval by that
measured amount.

Only `conformal_quantile` is subtle enough to need a test; the rest is arithmetic
in `conformal.py`.
"""

import numpy as np


def conformal_quantile(scores, alpha: float) -> float:
    """The (1-alpha) conformal quantile of `scores`.

    Uses the finite-sample correction ceil((n+1)(1-alpha))/n rather than the
    plain empirical quantile. Without it coverage is biased low on small
    calibration sets, which is exactly the regime here — a handful of forecast
    origins, not thousands of exchangeable points.

    Returns +inf when there is nothing to calibrate on, so an uncalibrated
    interval is infinitely wide rather than silently wrong.
    """
    x = np.sort(np.asarray(scores, dtype=float).ravel())
    n = x.size
    if n == 0:
        return float("inf")
    k = int(np.ceil((n + 1) * (1 - alpha)))
    if k > n:
        return float("inf")  # too few points to certify this level
    return float(x[k - 1])


def split_conformal_score(actual, point):
    """Absolute residual. One width for every series, so it behaves badly when
    series differ in scale — 13 Kč potatoes and 240 Kč butter get the same band."""
    return np.abs(np.asarray(actual) - np.asarray(point))


def cqr_score(actual, lo, hi):
    """Conformalized quantile regression score: how far outside the model's own
    band the truth fell, negative when comfortably inside. Preserves the model's
    per-series width, unlike `split_conformal_score`."""
    actual, lo, hi = np.asarray(actual), np.asarray(lo), np.asarray(hi)
    return np.maximum(lo - actual, actual - hi)


def relative_cqr_score(actual, lo, hi, point):
    """`cqr_score` divided by the series' own level, so one correction serves
    series of very different price scales. This is the variant that worked:
    79.0% coverage against a nominal 80%, versus 71.6% uncalibrated."""
    return cqr_score(actual, lo, hi) / np.asarray(point)

import numpy as np

from calibration import conformal_quantile, cqr_score, relative_cqr_score, split_conformal_score


def test_conformal_quantile_uses_the_finite_sample_correction():
    # n=9, alpha=0.2 -> k = ceil(10 * 0.8) = 8, so the 8th smallest, not the 7th
    # that a plain 80th-percentile would give. The correction is what keeps
    # coverage honest on small calibration sets.
    scores = list(range(1, 10))
    assert conformal_quantile(scores, 0.20) == 8.0
    assert float(np.quantile(scores, 0.80)) == 7.4  # what we deliberately don't use


def test_conformal_quantile_is_infinite_when_it_cannot_certify():
    # Nothing to calibrate on, and too few points for the requested level:
    # widen to infinity rather than return a band that isn't earned.
    assert conformal_quantile([], 0.20) == float("inf")
    assert conformal_quantile([1.0, 2.0], 0.05) == float("inf")


def test_conformal_quantile_grows_as_alpha_shrinks():
    scores = np.arange(1, 101)
    assert conformal_quantile(scores, 0.20) < conformal_quantile(scores, 0.05)


def test_split_score_is_the_absolute_residual():
    assert split_conformal_score([10.0, 10.0], [8.0, 13.0]).tolist() == [2.0, 3.0]


def test_cqr_score_is_negative_inside_the_band_and_positive_outside():
    # inside -> negative (band could shrink); above -> positive by the overshoot
    assert cqr_score([10.0], [8.0], [12.0])[0] == -2.0
    assert cqr_score([15.0], [8.0], [12.0])[0] == 3.0
    assert cqr_score([5.0], [8.0], [12.0])[0] == 3.0


def test_relative_score_puts_different_price_scales_on_one_footing():
    # Potatoes miss by 2 Kč on a 20 Kč band, butter by 24 Kč on a 240 Kč one.
    # Absolute scores say butter is 12x worse; relative says they're identical,
    # which is why the relative variant is the one that calibrated correctly.
    cheap = relative_cqr_score([22.0], [18.0], [20.0], [20.0])[0]
    dear = relative_cqr_score([264.0], [216.0], [240.0], [240.0])[0]
    assert np.isclose(cheap, dear)
    assert np.isclose(cheap, 0.1)

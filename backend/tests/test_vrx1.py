"""VRX-1 unit tests — synthetic fixtures ONLY (never real satellite truth)."""
import numpy as np

from app.vrx1 import indices as IX
from app.vrx1 import masks as MX
from app.vrx1 import change as CH
from app.vrx1 import alerts as AL


def test_ndvi_known_values():
    nir = np.array([[0.5, 0.3], [0.1, 0.0]])
    red = np.array([[0.1, 0.1], [0.1, 0.0]])
    out = IX.ndvi(nir, red)
    assert abs(out[0, 0] - (0.4 / 0.6)) < 1e-6
    assert abs(out[0, 1] - (0.2 / 0.4)) < 1e-6
    assert abs(out[1, 0] - 0.0) < 1e-6
    assert np.isnan(out[1, 1])  # 0/0 -> NaN, not fake zero


def test_all_indices_range():
    rng = np.random.default_rng(0)
    a = rng.uniform(0.05, 0.6, (8, 8))
    b = rng.uniform(0.05, 0.6, (8, 8))
    for f in (lambda: IX.ndvi(a, b), lambda: IX.ndmi(a, b), lambda: IX.ndbi(a, b),
              lambda: IX.ndwi(a, b), lambda: IX.mndwi(a, b),
              lambda: IX.bsi(a, b, a, b)):
        v = f()
        assert np.nanmin(v) >= -1.01 and np.nanmax(v) <= 1.01


def test_scl_masks():
    scl = np.array([[0, 3, 4], [5, 6, 9], [11, 2, 7]])
    strict = MX.scl_clear_mask(scl, strict=True)
    assert strict.tolist() == [[False, False, True], [True, True, False], [False, False, False]]
    relaxed = MX.scl_clear_mask(scl, strict=False)
    assert relaxed[1, 2] == False and relaxed[2, 1] == True  # DARK allowed in relaxed


def test_median_composite_needs_min_clear():
    stack = np.full((2, 4, 4), np.nan)
    stack[0] = 0.5
    comp, count = CH.median_composite(stack, count_min=3)
    assert np.isnan(comp).all()  # only 1-2 clear < 3 -> NaN (GRAY path)


def test_binary_change_and_alert_levels():
    d = np.zeros((20, 20))
    d[5:15, 5:15] = -0.4  # 100 px = 1.0 ha strong loss
    m = CH.binary_change(d, 0.15, "decrease")
    assert m.sum() == 100
    res = AL.decide(m, d, valid_fraction=0.9, n_clear=6,
                    thresholds={"min_region_px": 50, "amber_total_ha": 0.5,
                                "red_total_ha": 5.0, "red_region_ha": 2.0})
    assert res.level == "AMBER" and res.n_events == 1
    # gray when blind
    g = AL.decide(m, d, valid_fraction=0.1, n_clear=1, thresholds={})
    assert g.level == "GRAY"


def test_gray_never_green_when_blind():
    d = np.zeros((10, 10))
    m = CH.binary_change(d, 0.15, "decrease")
    res = AL.decide(m, d, valid_fraction=0.0, n_clear=0, thresholds={})
    assert res.level == "GRAY"

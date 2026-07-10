from __future__ import annotations

# Modelled midday stem water potential (MSWP) equivalent. Growers manage RDI by
# pressure-bomb MPa, not depletion fraction, so the engine maps its fraction to a
# stage-dependent MPa band by piecewise-linear interpolation between literature
# anchors (see app/data/mswp_map.json, marked modelled). One real reading anchors
# the block; there is no universal conversion.


def _interp(anchors: list[list[float]], f: float) -> float:
    pts = sorted((float(a[0]), float(a[1])) for a in anchors)
    if f <= pts[0][0]:
        return pts[0][1]
    if f >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= f <= x1:
            if x1 == x0:
                return y1
            return y0 + (f - x0) / (x1 - x0) * (y1 - y0)
    return pts[-1][1]


def _anchors_for(mswp_map: dict, stage: str) -> list[list[float]]:
    anchors = mswp_map.get("anchors", {})
    return anchors.get(stage) or anchors.get("veraison") or [[0.0, -0.5], [1.0, -1.6]]


def estimate_mpa(mswp_map: dict, stage: str, depletion_fraction: float) -> float:
    return round(_interp(_anchors_for(mswp_map, stage), depletion_fraction), 2)


def band_mpa(mswp_map: dict, stage: str, band_lo: float, band_hi: float) -> list[float]:
    """MPa range for the stage's target depletion band. More-negative = drier, so
    the drier band edge (hi) is the lower MPa bound."""
    anchors = _anchors_for(mswp_map, stage)
    at_lo = _interp(anchors, band_lo)
    at_hi = _interp(anchors, band_hi)
    return [round(min(at_lo, at_hi), 2), round(max(at_lo, at_hi), 2)]

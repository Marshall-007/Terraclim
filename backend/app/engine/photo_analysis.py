"""Deterministic canopy screening from a phone photo: a published-method
heuristic, not ML. Computes the Green Leaf Index over HSV-segmented canopy
pixels, plus canopy cover and yellowing percentages. Honest framing:
corroborates the water-balance model, does not replace a pressure bomb.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

MAX_DIM = 1600           # downscale ceiling for re-encode + analysis
ANALYSIS_DIM = 512       # analysis works on a smaller copy for speed/determinism

# Pillow HSV channels are 0-255. Hue 0-255 maps onto 0-360 deg.
GREEN_HUE = (45, 115)    # ~63-162 deg
YELLOW_HUE = (28, 45)    # ~40-63 deg
SAT_MIN = 40
VAL_MIN = 40


class InvalidImage(ValueError):
    """Raised when the uploaded bytes cannot be decoded as a real image."""
    pass


def process_upload(raw: bytes) -> tuple[bytes, dict]:
    """Validate the upload is a real image, re-encode to clean JPEG (strips EXIF /
    any polyglot payload), and analyse it. Returns (jpeg_bytes, analysis)."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()  # detree malformed / non-image content
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # Pillow raises a range of types on bad input
        raise InvalidImage("not a decodable image") from exc

    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    jpeg_bytes = buf.getvalue()

    analysis = analyze(img)
    return jpeg_bytes, analysis


def analyze(img: Image.Image) -> dict:
    """Compute canopy cover, Green Leaf Index, and yellowing percentage for one
    photo, and derive a coarse stress hint from them. Pixel classification runs
    in HSV (hue/saturation/value) rather than raw RGB because hue separates
    green-vs-yellow foliage far more cleanly than RGB thresholds would."""
    small = img.copy()
    small.thumbnail((ANALYSIS_DIM, ANALYSIS_DIM))
    rgb = np.asarray(small, dtype=np.float64)
    hsv = np.asarray(small.convert("HSV"), dtype=np.float64)

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    # "Lit" excludes near-black/near-grey pixels (shadow, sky, hardware) before
    # hue is trusted to classify green vs. yellow, since hue is noisy at low
    # saturation/value.
    lit = (s >= SAT_MIN) & (v >= VAL_MIN)
    canopy = lit & (h >= GREEN_HUE[0]) & (h <= GREEN_HUE[1])
    yellow = lit & (h >= YELLOW_HUE[0]) & (h < YELLOW_HUE[1])

    total = float(r.size)
    canopy_n = float(canopy.sum())
    yellow_n = float(yellow.sum())

    canopy_cover_pct = round(canopy_n / total * 100.0, 1)

    if canopy_n > 0:
        # Green Leaf Index: (2G - R - B) / (2G + R + B), a standard RGB-only
        # vegetation greenness index. Computed only over canopy-classified
        # pixels, so background/soil never dilutes the score.
        denom = 2 * g[canopy] + r[canopy] + b[canopy]
        gli = np.where(denom != 0, (2 * g[canopy] - r[canopy] - b[canopy]) / denom, 0.0)
        gli_mean = round(float(gli.mean()), 3)
    else:
        gli_mean = 0.0

    veg = canopy_n + yellow_n
    yellowing_pct = round(yellow_n / veg * 100.0, 1) if veg > 0 else 0.0

    stress_hint = _stress_hint(gli_mean, yellowing_pct, canopy_cover_pct)
    return {
        "gli_mean": gli_mean,
        "canopy_cover_pct": canopy_cover_pct,
        "yellowing_pct": yellowing_pct,
        "stress_hint": stress_hint,
    }


def _stress_hint(gli_mean: float, yellowing_pct: float, canopy_cover_pct: float) -> str:
    # Healthy canopy: high GLI, little yellowing. Degradation on either axis raises
    # the hint. Thresholds are heuristic and documented as such.
    if gli_mean >= 0.12 and yellowing_pct < 12.0:
        return "none"
    if gli_mean < 0.02 or yellowing_pct >= 30.0 or canopy_cover_pct < 12.0:
        return "visible"
    return "mild"


def agrees_with_model(stress_hint: str, model_status: str, model_score: int) -> bool:
    """Does the visual read corroborate the water-balance verdict? The model is
    'stressed' when a block is out of band (notably too dry) with a high score."""
    model_stressed = model_status == "too_dry" and model_score >= 50
    photo_stressed = stress_hint == "visible"
    photo_ok = stress_hint == "none"
    if model_stressed:
        return stress_hint in ("mild", "visible")
    if not model_stressed and model_status == "on_track":
        return photo_ok or stress_hint == "mild"
    # too_wet or low-score off-band: agreement if the photo isn't screaming stress.
    return not photo_stressed

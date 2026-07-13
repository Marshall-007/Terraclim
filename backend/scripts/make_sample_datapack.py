"""Generate a SYNTHETIC sample data pack so the DataPackProvider is testable.

Run from the backend directory: `python -m scripts.make_sample_datapack`

Writes CSV per-block series plus a manifest to app/data/datapack/ (gitignored). The
data is deterministic synthetic weather from the fixture model. It is NOT TerraClim
/ ET-GEO data and must never be presented as such. Its only purpose is to exercise
the CSV data-pack code path (ETo/ETa/NDVI per block, per day) without the real,
IP-restricted pack. The real pack drops into the same folder on Day 0.
"""
import csv
from datetime import date, timedelta
from pathlib import Path

from app.providers.fixture import synthetic_daily
from app.services import load_blocks, season_start

OUT_DIR = Path(__file__).resolve().parent.parent / "app" / "data" / "datapack"
SERIES_DIR = OUT_DIR / "series"
AS_OF = date(2026, 1, 20)

FIELDS = ["date", "et0", "eta", "ndvi", "rain", "tmax", "tmin"]


def build() -> None:
    """Write one CSV per block (synthetic daily weather for the season to date)
    plus a datapack.json manifest tying each block id to its CSV and lat/lon,
    matching the shape DataPackProvider expects to load."""
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    start = season_start(AS_OF)
    blocks_meta = []

    for block in load_blocks():
        rel = f"series/{block.id}.csv"
        rows = []
        d = start
        while d <= AS_OF:
            w = synthetic_daily(block.lat, block.lon, d)
            rows.append({
                "date": d.isoformat(), "et0": w.et0, "eta": w.eta, "ndvi": w.ndvi,
                "rain": w.rain, "tmax": w.tmax, "tmin": w.tmin,
            })
            d += timedelta(days=1)
        with open(OUT_DIR / rel, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        blocks_meta.append({
            "block_id": block.id, "lat": round(block.lat, 4), "lon": round(block.lon, 4),
            "csv": rel,
        })

    manifest = {
        "name": "SYNTHETIC sample pack (NOT TerraClim data)",
        "synthetic": True,
        "source": "scripts/make_sample_datapack.py (fixture weather model)",
        "generated_for": AS_OF.isoformat(),
        "layers": ["et0", "eta", "ndvi", "rain", "tmax", "tmin"],
        "format": "csv",
        "blocks": blocks_meta,
    }
    import json
    (OUT_DIR / "datapack.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote sample datapack for {len(blocks_meta)} blocks to {OUT_DIR}")


if __name__ == "__main__":
    build()

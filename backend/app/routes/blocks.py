from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_provider_dep, parse_as_of
from ..engine.scoring import band_for
from ..schemas import NewBlock
from ..services import (
    blocks_geojson,
    centroid,
    evaluate_block,
    kc_curves,
    load_blocks,
    next_user_block_id,
    polygon_area_ha,
    read_user_blocks,
    stress_targets,
    write_user_blocks,
)

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


def _find_block(block_id: str):
    for b in load_blocks():
        if b.id == block_id:
            return b
    raise HTTPException(status_code=404, detail=f"block '{block_id}' not found")


def _validate_polygon(geometry: dict) -> dict:
    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        raise HTTPException(status_code=400, detail="geometry must be a GeoJSON Polygon")
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or not coords or not isinstance(coords[0], list):
        raise HTTPException(status_code=400, detail="geometry.coordinates malformed")
    ring = coords[0]
    pts = []
    for p in ring:
        if (not isinstance(p, (list, tuple)) or len(p) < 2
                or not all(isinstance(c, (int, float)) for c in p[:2])):
            raise HTTPException(status_code=400, detail="polygon vertex must be [lon, lat]")
        lon, lat = float(p[0]), float(p[1])
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            raise HTTPException(status_code=400, detail="polygon vertex out of lon/lat range")
        pts.append([lon, lat])
    distinct = {tuple(p) for p in pts}
    if len(distinct) < 3:
        raise HTTPException(status_code=400, detail="polygon needs at least 3 distinct vertices")
    if pts[0] != pts[-1]:
        pts.append(list(pts[0]))  # close the ring for point-in-polygon
    return {"type": "Polygon", "coordinates": [pts]}


@router.get("")
def list_blocks():
    return blocks_geojson()


@router.post("", status_code=201)
def create_block(body: NewBlock):
    geometry = _validate_polygon(body.geometry)
    area_ha = polygon_area_ha(geometry)
    if area_ha <= 0:
        raise HTTPException(status_code=400, detail="polygon has zero area")
    block_id = next_user_block_id()
    feature = {
        "type": "Feature",
        "geometry": geometry,
        "properties": {
            "id": block_id,
            "name": body.name.strip(),
            "variety": body.variety.strip(),
            "wine_style": body.wine_style,
            "area_ha": area_ha,
            "application_rate_mm_h": body.application_rate_mm_h,
            "taw_mm": body.taw_mm,
            "user_created": True,
        },
    }
    store = read_user_blocks()
    store["features"].append(feature)
    write_user_blocks(store)
    lon, lat = centroid(geometry)
    return {"ok": True, "id": block_id, "feature": feature, "centroid": [round(lon, 6), round(lat, 6)]}


@router.delete("/{block_id}")
def delete_block(block_id: str):
    if not block_id.startswith("U"):
        raise HTTPException(status_code=400, detail="only user-created blocks (U*) can be deleted")
    store = read_user_blocks()
    remaining = [f for f in store["features"] if f["properties"].get("id") != block_id]
    if len(remaining) == len(store["features"]):
        raise HTTPException(status_code=404, detail=f"user block '{block_id}' not found")
    store["features"] = remaining
    write_user_blocks(store)
    return {"ok": True, "deleted": block_id}


@router.get("/{block_id}/status")
def block_status(block_id: str, as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    block = _find_block(block_id)
    ev = evaluate_block(block, as_of, provider, stress_targets(), kc_curves())
    return ev.response


@router.get("/{block_id}/timeseries")
def block_timeseries(
    block_id: str,
    days: int = Query(default=45, gt=0, le=200),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    block = _find_block(block_id)
    targets = stress_targets()
    ev = evaluate_block(block, as_of, provider, targets, kc_curves())

    history = []
    for bd in ev.balance[-days:]:
        lo, hi = band_for(targets, bd.stage, block.wine_style)
        row = {
            "date": bd.date.isoformat(),
            "et0": bd.et0,
            "etc": bd.etc,
            "rain": bd.rain,
            "irrigation_mm": bd.irrigation_mm,
            "depletion_fraction": bd.depletion_fraction,
            "band_lo": lo,
            "band_hi": hi,
            "stage": bd.stage,
        }
        if bd.eta is not None:
            row["eta"] = bd.eta
        if bd.ndvi is not None:
            row["ndvi"] = bd.ndvi
        history.append(row)

    forecast = [
        {
            "date": e["date"],
            "et0": e["et0"],
            "etc": e["etc"],
            "rain": e["rain"],
            "depletion_fraction_projected": e["depletion_fraction_projected"],
            "band_lo": e["band_lo"],
            "band_hi": e["band_hi"],
        }
        for e in ev.forecast
    ]
    return {"block_id": block.id, "history": history, "forecast": forecast}

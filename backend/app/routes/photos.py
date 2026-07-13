"""Field-photo upload and canopy-stress screening API.

Growers upload a phone photo of a block's canopy; the engine re-encodes it,
runs a deterministic colour-based stress heuristic (no ML), and cross-checks
the visual read against the water-balance model's current verdict for the block.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from ..deps import get_provider_dep, parse_as_of
from ..engine import photo_analysis
from ..services import (
    evaluate_block,
    kc_curves,
    load_blocks,
    photo_path,
    photo_record,
    photos_for_block,
    store_photo,
    stress_targets,
)

router = APIRouter(prefix="/api/photos", tags=["photos"])

MAX_BYTES = 10 * 1024 * 1024  # 10 MB upload ceiling


def _find_block(block_id: str):
    """Fetch a block by id or raise 404."""
    block = next((b for b in load_blocks() if b.id == block_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail=f"block '{block_id}' not found")
    return block


def _public(record: dict) -> dict:
    """Shape a stored photo record for API responses: drops internal storage
    fields (e.g. filename) and adds the client-facing file URL."""
    return {
        "photo_id": record["photo_id"],
        "block_id": record["block_id"],
        "date": record["date"],
        "url": f"/api/photos/file/{record['photo_id']}",
        "note": record.get("note"),
        "analysis": record["analysis"],
    }


@router.post("")
async def upload_photo(
    block_id: str = Form(...),
    image: UploadFile = File(...),
    note: str | None = Form(default=None),
    date_str: str | None = Form(default=None, alias="date"),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    """Upload and analyse a canopy photo for a block. Validates size/type, re-encodes
    to a clean JPEG (strips EXIF and any embedded payload), runs the colour-based
    stress heuristic, and flags whether it agrees with the block's current
    water-balance verdict. Side effect: writes the JPEG and its metadata to disk
    under app/data/photos/ (see services.store_photo)."""
    block = _find_block(block_id)
    # content_type is a client-supplied header and easily spoofed; this is just a
    # fast, best-effort reject. process_upload() below does the real validation by
    # attempting to decode the bytes as an image.
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="uploaded file is not an image")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image exceeds 10 MB limit")

    try:
        jpeg_bytes, analysis = photo_analysis.process_upload(raw)
    except photo_analysis.InvalidImage:
        raise HTTPException(status_code=400, detail="file is not a decodable image")

    ev = evaluate_block(block, as_of, provider, stress_targets(), kc_curves())
    analysis["agrees_with_model"] = photo_analysis.agrees_with_model(
        analysis["stress_hint"], ev.response["status"], ev.response["score"]
    )

    try:
        # A malformed client-supplied date is a cosmetic problem, not a reason to
        # fail the whole upload; fall back to the app's as_of "today" instead.
        photo_date = date.fromisoformat(date_str).isoformat() if date_str else as_of.isoformat()
    except ValueError:
        photo_date = as_of.isoformat()

    photo_id = uuid.uuid4().hex
    # Form fields aren't schema-validated like the JSON-body models, so the note's
    # length cap is enforced manually here (matches ValidationReading.note).
    note_clean = (note or "").strip()[:500] or None
    record = store_photo(
        photo_id,
        jpeg_bytes,
        {
            "block_id": block.id,
            "date": photo_date,
            "note": note_clean,
            "analysis": analysis,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return _public(record)


@router.get("/{block_id}")
def list_photos(block_id: str):
    """Photos logged for a block, newest first."""
    _find_block(block_id)
    return [_public(r) for r in photos_for_block(block_id)]


@router.get("/file/{photo_id}")
def get_photo_file(photo_id: str):
    """Stream a stored photo's JPEG bytes. X-Content-Type-Options blocks MIME
    sniffing on the served image, and a short private cache avoids re-reading the
    file from disk on every view without caching it anywhere shared."""
    record = photo_record(photo_id)
    if record is None:
        raise HTTPException(status_code=404, detail="photo not found")
    path = photo_path(record)
    if not path.exists():
        raise HTTPException(status_code=404, detail="photo file missing")
    return Response(
        content=path.read_bytes(),
        media_type="image/jpeg",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"},
    )

from __future__ import annotations

import json
import logging
from pathlib import Path

log = logging.getLogger("vino.settings_store")

# Runtime overrides written by the Settings panel. Gitignored (may hold a token).
# Layered over the .env defaults by config.get_settings().
STORE_PATH = Path(__file__).resolve().parent / "data" / "settings.json"

ALLOWED_KEYS = {"provider", "terraclim_token", "demo_date"}


def load() -> dict:
    try:
        data = json.loads(STORE_PATH.read_text())
        return {k: v for k, v in data.items() if k in ALLOWED_KEYS}
    except (ValueError, OSError):
        return {}


def save(updates: dict) -> dict:
    data = load()
    data.update({k: v for k, v in updates.items() if k in ALLOWED_KEYS})
    try:
        STORE_PATH.write_text(json.dumps(data, indent=2))
    except OSError as exc:
        log.warning("settings persist failed: %s", exc)
    return data

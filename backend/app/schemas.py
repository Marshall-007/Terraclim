"""Pydantic request-body models for the API routes.

FastAPI turns any Field() constraint violation here into an automatic 422
response before a route handler ever runs. Several bounds below encode real
domain knowledge (a plausible MPa range, a drip-line application rate, ...)
rather than being generic API hygiene; those are commented with the reasoning.
Response shapes are built ad hoc as dicts in the routes/services layer, not
modelled here.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

# The four wine styles the engine's per-stage target depletion bands are tuned
# for; premium reds are flown driest for concentration, fresh whites kept the
# most comfortable. Drives which column of stress_targets.json/mswp_map.json applies.
WineStyle = Literal["premium_red", "red", "white", "fresh_white"]


class BattlePlanRequest(BaseModel):
    """Inputs to the battle-plan scheduler: how many pump-hours are available
    each day, and how many days ahead to schedule."""
    available_hours_per_day: float = Field(gt=0, le=24)  # can't exceed a physical day
    horizon_days: int = Field(gt=0, le=14)  # matches the engine's forward-weather window


class ScenarioRequest(BaseModel):
    """A what-if perturbation applied to the forward weather forecast (see
    app/engine/scenario.py); `type` selects the perturbation and `days` how many
    leading days of the forecast it covers."""
    type: Literal["heatwave", "drought", "rain_event", "cool_spell"]
    # Capped generously above the ~14-day forward-weather window the engine
    # actually has; a large value just perturbs every available forecast day
    # rather than erroring.
    days: int = Field(gt=0, le=30, default=7)


class IrrigationEvent(BaseModel):
    """One manually logged irrigation application for a block (POST /api/irrigation)."""
    block_id: str
    date: date
    # A single logged application; bounded to a sane vineyard range (mm/day).
    mm: float = Field(ge=0, le=500)


class ValidationReading(BaseModel):
    """A field-measured midday stem water potential (pressure-bomb) reading,
    logged to check the model's MSWP estimate against reality."""
    block_id: str
    date: date
    # MSWP is a negative pressure: 0.0 is the physical ceiling (no tension) and
    # -5.0 comfortably bounds even extreme vine-stress readings.
    mswp_mpa: float = Field(ge=-5.0, le=0.0)
    note: str | None = Field(default=None, max_length=500)


class ProviderSwitch(BaseModel):
    """Request to switch the active weather provider (see routes/settings.py)."""
    provider: Literal["open-meteo", "terraclim", "datapack"]
    token: str | None = Field(default=None, max_length=512)  # generous ceiling; no provider mandates a format


class DemoDate(BaseModel):
    """New simulated "today" for the demo (see routes/settings.py set_demo_date)."""
    as_of: date


class InsightRequest(BaseModel):
    """Ask the insight engine to explain one subject (a block, a score, a driver,
    a battle-plan entry, ...). See app.engine.insight.VALID_SUBJECTS for the full
    set of subject_type values and what block_id/subject_id/context mean for each."""
    # subject_type is validated in the engine so the 422 can list the valid set.
    subject_type: str = Field(min_length=1, max_length=40)
    block_id: str | None = Field(default=None, max_length=20)
    subject_id: str | None = Field(default=None, max_length=80)
    context: dict = Field(default_factory=dict)


class NewBlock(BaseModel):
    """A hand-drawn vineyard block submitted via POST /api/blocks; geometry is
    validated separately in the route (must be a well-formed GeoJSON Polygon)."""
    name: str = Field(min_length=1, max_length=80)
    variety: str = Field(min_length=1, max_length=60)
    wine_style: WineStyle
    # Drip/micro-sprinkler systems rarely exceed a few mm/h; 50 generously bounds
    # even high-rate micro-sprinklers while catching an obviously wrong entry.
    application_rate_mm_h: float = Field(gt=0, le=50)
    # Total available water for a vineyard root zone typically runs ~80-200 mm;
    # 120 is a reasonable default and 400 bounds an implausibly deep/retentive soil.
    taw_mm: float = Field(default=120, gt=0, le=400)
    geometry: dict

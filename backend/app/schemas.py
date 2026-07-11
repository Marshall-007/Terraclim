from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

WineStyle = Literal["premium_red", "red", "white", "fresh_white"]


class BattlePlanRequest(BaseModel):
    available_hours_per_day: float = Field(gt=0, le=24)
    horizon_days: int = Field(gt=0, le=14)


class ScenarioRequest(BaseModel):
    type: Literal["heatwave", "drought", "rain_event", "cool_spell"]
    days: int = Field(gt=0, le=30, default=7)


class IrrigationEvent(BaseModel):
    block_id: str
    date: date
    # A single logged application; bounded to a sane vineyard range (mm/day).
    mm: float = Field(ge=0, le=500)


class ValidationReading(BaseModel):
    block_id: str
    date: date
    mswp_mpa: float = Field(ge=-5.0, le=0.0)
    note: str | None = Field(default=None, max_length=500)


class ProviderSwitch(BaseModel):
    provider: Literal["open-meteo", "terraclim", "datapack"]
    token: str | None = Field(default=None, max_length=512)


class DemoDate(BaseModel):
    as_of: date


class InsightRequest(BaseModel):
    # subject_type is validated in the engine so the 422 can list the valid set.
    subject_type: str = Field(min_length=1, max_length=40)
    block_id: str | None = Field(default=None, max_length=20)
    subject_id: str | None = Field(default=None, max_length=80)
    context: dict = Field(default_factory=dict)


class NewBlock(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    variety: str = Field(min_length=1, max_length=60)
    wine_style: WineStyle
    application_rate_mm_h: float = Field(gt=0, le=50)
    taw_mm: float = Field(default=120, gt=0, le=400)
    geometry: dict

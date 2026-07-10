from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class BattlePlanRequest(BaseModel):
    available_hours_per_day: float = Field(gt=0, le=24)
    horizon_days: int = Field(gt=0, le=14)


class ScenarioRequest(BaseModel):
    type: Literal["heatwave", "drought", "rain_event", "cool_spell"]
    days: int = Field(gt=0, le=30, default=7)


class IrrigationEvent(BaseModel):
    block_id: str
    date: date
    mm: float = Field(ge=0)

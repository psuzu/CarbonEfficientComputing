"""Layer 1 – Carbon signal helpers (standalone, no inputs package dependency)."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "carbon_signal_48h.csv"


@dataclass(frozen=True)
class CarbonSignalPoint:
    hour_index: int
    timestamp: datetime
    carbon_signal_gco2_per_kwh: float
    signal_type: str = "marginal_proxy"

    @classmethod
    def from_dict(cls, row: dict) -> "CarbonSignalPoint":
        return cls(
            hour_index=int(row["hour_index"]),
            timestamp=datetime.fromisoformat(str(row["datetime"])),
            carbon_signal_gco2_per_kwh=float(row["carbon_signal_gco2_per_kwh"]),
            signal_type=str(row.get("signal_type", "marginal_proxy")),
        )


def load_carbon_signal_csv(path: str | Path = DEFAULT_OUTPUT_PATH) -> list[CarbonSignalPoint]:
    with Path(path).open(newline="", encoding="utf-8") as f:
        return [CarbonSignalPoint.from_dict(row) for row in csv.DictReader(f)]


def signal_values(points: list[CarbonSignalPoint]) -> list[float]:
    return [p.carbon_signal_gco2_per_kwh for p in points]


__all__ = [
    "CarbonSignalPoint",
    "DEFAULT_OUTPUT_PATH",
    "load_carbon_signal_csv",
    "signal_values",
]

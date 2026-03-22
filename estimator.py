"""Carbon-cost calculator for the MVP scheduling prototype.

This module implements the focused estimator described in ``local.md``:

    CO2e = sum((C * P) * I_t for each scheduled hour t)

Where:
    ``C`` is requested CPUs
    ``P`` is ``POWER_PER_CPU_KW``
    ``I_t`` is grid carbon intensity in gCO2e / kWh at hour ``t``

The result is returned in grams of CO2 equivalent (gCO2e).
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Sequence, runtime_checkable

POWER_PER_CPU_KW: float = 0.15

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CARBON_SIGNAL_PATH = PROJECT_ROOT / "data" / "carbon_signal_48h.csv"


@runtime_checkable
class JobLike(Protocol):
    """Minimal job contract required by the estimator."""

    requested_cpus: int
    runtime_hours: int


@dataclass(frozen=True)
class EstimateJob:
    requested_cpus: int
    runtime_hours: int


def _coerce_grid_forecast(grid_forecast_array: Sequence[object]) -> list[float]:
    values: list[float] = []
    for index, value in enumerate(grid_forecast_array):
        if not isinstance(value, (int, float)):
            raise TypeError(
                "grid_forecast_array must contain only numeric hourly carbon "
                f"intensity values, found {type(value).__name__} at index {index}"
            )
        values.append(float(value))
    return values


def _validate_job(job: JobLike) -> None:
    if not isinstance(job.requested_cpus, int) or job.requested_cpus < 1:
        raise ValueError(
            f"job.requested_cpus must be a positive int, got {job.requested_cpus!r}"
        )
    if not isinstance(job.runtime_hours, int) or job.runtime_hours < 1:
        raise ValueError(
            f"job.runtime_hours must be a positive int, got {job.runtime_hours!r}"
        )


def calculate_job_emissions(
    job: JobLike,
    proposed_start_hour: int,
    grid_forecast_array: Sequence[object],
) -> float:
    """Estimate the total carbon cost for a scheduled job window.

    Args:
        job: Any object with ``requested_cpus`` and ``runtime_hours`` fields.
        proposed_start_hour: 0-based hour index where the job would start.
        grid_forecast_array: Hourly carbon intensity values in gCO2e / kWh.

    Returns:
        Total emissions for the full run in grams of CO2 equivalent.
    """
    _validate_job(job)

    if not isinstance(proposed_start_hour, int) or proposed_start_hour < 0:
        raise ValueError(
            "proposed_start_hour must be a non-negative int, "
            f"got {proposed_start_hour!r}"
        )

    signal_values = _coerce_grid_forecast(grid_forecast_array)
    end_hour = proposed_start_hour + job.runtime_hours
    if end_hour > len(signal_values):
        raise ValueError(
            f"Job window [{proposed_start_hour}, {end_hour}) exceeds the "
            f"grid forecast horizon of {len(signal_values)} hours."
        )

    energy_per_hour_kwh = job.requested_cpus * POWER_PER_CPU_KW
    return sum(
        energy_per_hour_kwh * signal_values[hour]
        for hour in range(proposed_start_hour, end_hour)
    )


def load_grid_forecast(path: str | Path = DEFAULT_CARBON_SIGNAL_PATH) -> list[float]:
    """Load the carbon forecast values from the project CSV."""
    signal_path = Path(path)
    with signal_path.open(encoding="utf-8", newline="") as handle:
        header = handle.readline().strip().split(",")
        try:
            value_index = header.index("carbon_signal_gco2_per_kwh")
        except ValueError as exc:
            raise ValueError(
                "carbon signal CSV must include a carbon_signal_gco2_per_kwh column"
            ) from exc

        values: list[float] = []
        for line_number, line in enumerate(handle, start=2):
            columns = line.strip().split(",")
            if len(columns) <= value_index:
                raise ValueError(f"Missing carbon signal value on line {line_number}")
            values.append(float(columns[value_index]))

    if not values:
        raise ValueError(f"No carbon signal rows found in {signal_path}")
    return values


def _allowed_delay_hours(flexibility_class: str) -> int:
    delay_map = {
        "rigid": 0,
        "semi-flexible": 6,
        "flexible": 24,
    }
    try:
        return delay_map[flexibility_class]
    except KeyError as exc:
        raise ValueError(
            "flexibility_class must be one of rigid, semi-flexible, or flexible"
        ) from exc


def estimate_submission(payload: dict[str, object]) -> dict[str, float | int | str]:
    """Estimate baseline and optimized carbon cost for a submitted job."""
    requested_cpus = int(payload["cpus"])
    runtime_hours = int(payload["runtime_hours"])
    submit_hour = int(payload["submit_hour"])
    flexibility_class = str(payload["flexibility_class"])

    forecast_values = load_grid_forecast()
    job = EstimateJob(requested_cpus=requested_cpus, runtime_hours=runtime_hours)
    baseline_emissions = calculate_job_emissions(job, submit_hour, forecast_values)

    latest_start_hour = min(
        submit_hour + _allowed_delay_hours(flexibility_class),
        len(forecast_values) - runtime_hours,
    )
    if latest_start_hour < submit_hour:
        raise ValueError(
            "runtime_hours exceeds the available forecast horizon for this submission"
        )

    best_start_hour = submit_hour
    best_emissions = baseline_emissions
    for candidate_start in range(submit_hour, latest_start_hour + 1):
        candidate_emissions = calculate_job_emissions(job, candidate_start, forecast_values)
        if candidate_emissions < best_emissions:
            best_start_hour = candidate_start
            best_emissions = candidate_emissions

    return {
        "requested_cpus": requested_cpus,
        "runtime_hours": runtime_hours,
        "submit_hour": submit_hour,
        "flexibility_class": flexibility_class,
        "baseline_emissions_gco2e": round(baseline_emissions, 2),
        "optimized_emissions_gco2e": round(best_emissions, 2),
        "scheduled_start_hour": best_start_hour,
        "delay_hours": best_start_hour - submit_hour,
        "carbon_saved_gco2e": round(baseline_emissions - best_emissions, 2),
    }


def main() -> None:
    payload = json.load(sys.stdin)
    result = estimate_submission(payload)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()


__all__ = [
    "DEFAULT_CARBON_SIGNAL_PATH",
    "POWER_PER_CPU_KW",
    "calculate_job_emissions",
    "estimate_submission",
    "load_grid_forecast",
]

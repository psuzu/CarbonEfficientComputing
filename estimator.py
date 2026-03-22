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

from typing import Protocol, Sequence, runtime_checkable

POWER_PER_CPU_KW: float = 0.15


@runtime_checkable
class JobLike(Protocol):
    """Minimal job contract required by the estimator."""

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


__all__ = ["POWER_PER_CPU_KW", "calculate_job_emissions"]

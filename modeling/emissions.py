"""Energy and CO2 estimation helpers for Layer 2."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Sequence

from inputs.generate_workload import Job


@dataclass(frozen=True)
class PowerModel:
    """Simple MVP power model for CPU/GPU-backed workloads."""

    base_watts: float = 60.0
    cpu_watts: float = 12.0
    gpu_watts: float = 225.0
    pue: float = 1.2


@dataclass(frozen=True)
class JobEmissionEstimate:
    """Estimated energy and emissions for one scheduled job window."""

    job_id: int
    start_hour: int
    runtime_hours: int
    power_watts: float
    energy_kwh: float
    avg_carbon_intensity_gco2_per_kwh: float
    emissions_kgco2e: float
    emissions_rate_kgco2e_per_hour: float


DEFAULT_POWER_MODEL = PowerModel()


def _coerce_signal_values(carbon_signal: Sequence[object]) -> list[float]:
    values: list[float] = []
    for point in carbon_signal:
        if isinstance(point, (int, float)):
            values.append(float(point))
        elif hasattr(point, "carbon_signal_gco2_per_kwh"):
            values.append(float(point.carbon_signal_gco2_per_kwh))
        else:
            raise TypeError(
                "carbon_signal must contain numeric values or objects with "
                "carbon_signal_gco2_per_kwh"
            )
    return values


def _validate_window(signal_values: Sequence[float], start_hour: int, runtime_hours: int) -> None:
    if not isinstance(start_hour, int) or start_hour < 0:
        raise ValueError(f"start_hour must be a non-negative int, got {start_hour}")
    if not isinstance(runtime_hours, int) or runtime_hours < 1:
        raise ValueError(f"runtime_hours must be a positive int, got {runtime_hours}")
    end_hour = start_hour + runtime_hours
    if end_hour > len(signal_values):
        raise ValueError(
            f"Requested window [{start_hour}, {end_hour}) exceeds "
            f"carbon signal horizon of {len(signal_values)} hours"
        )


def estimate_power_watts(job: Job, power_model: PowerModel = DEFAULT_POWER_MODEL) -> float:
    return (
        power_model.base_watts
        + job.requested_cpus * power_model.cpu_watts
        + job.requested_gpus * power_model.gpu_watts
    ) * power_model.pue


def estimate_energy_kwh(job: Job, power_model: PowerModel = DEFAULT_POWER_MODEL) -> float:
    return estimate_power_watts(job, power_model=power_model) * job.runtime_hours / 1000.0


def average_carbon_intensity(
    carbon_signal: Sequence[object],
    start_hour: int,
    runtime_hours: int,
) -> float:
    signal_values = _coerce_signal_values(carbon_signal)
    _validate_window(signal_values, start_hour, runtime_hours)
    window = signal_values[start_hour : start_hour + runtime_hours]
    return sum(window) / len(window)


def estimate_job_emissions(
    job: Job,
    carbon_signal: Sequence[object],
    start_hour: int | None = None,
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> JobEmissionEstimate:
    scheduled_start = job.submit_hour if start_hour is None else start_hour
    avg_intensity = average_carbon_intensity(
        carbon_signal,
        start_hour=scheduled_start,
        runtime_hours=job.runtime_hours,
    )
    power_watts = estimate_power_watts(job, power_model=power_model)
    energy_kwh = estimate_energy_kwh(job, power_model=power_model)
    emissions_kgco2e = energy_kwh * avg_intensity / 1000.0
    return JobEmissionEstimate(
        job_id=job.job_id,
        start_hour=scheduled_start,
        runtime_hours=job.runtime_hours,
        power_watts=power_watts,
        energy_kwh=energy_kwh,
        avg_carbon_intensity_gco2_per_kwh=avg_intensity,
        emissions_kgco2e=emissions_kgco2e,
        emissions_rate_kgco2e_per_hour=emissions_kgco2e / job.runtime_hours,
    )


def score_job(
    job: Job,
    carbon_signal: Sequence[object],
    start_hour: int | None = None,
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> float:
    estimate = estimate_job_emissions(
        job,
        carbon_signal=carbon_signal,
        start_hour=start_hour,
        power_model=power_model,
    )
    return round(estimate.emissions_rate_kgco2e_per_hour, 6)


def annotate_jobs_with_carbon_scores(
    jobs: Sequence[Job],
    carbon_signal: Sequence[object],
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> list[Job]:
    scored_jobs: list[Job] = []
    for job in jobs:
        scored_jobs.append(
            replace(
                job,
                carbon_score=score_job(
                    job,
                    carbon_signal=carbon_signal,
                    start_hour=job.submit_hour,
                    power_model=power_model,
                ),
            )
        )
    return scored_jobs


__all__ = [
    "DEFAULT_POWER_MODEL",
    "JobEmissionEstimate",
    "PowerModel",
    "annotate_jobs_with_carbon_scores",
    "average_carbon_intensity",
    "estimate_energy_kwh",
    "estimate_job_emissions",
    "estimate_power_watts",
    "score_job",
]

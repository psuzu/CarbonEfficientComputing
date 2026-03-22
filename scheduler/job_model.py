"""Layer 2 – Job Model: enriches jobs with carbon scores and scheduling windows."""

from __future__ import annotations

from dataclasses import dataclass, replace

from inputs.generate_workload import Job
from inputs.carbonsignal import CarbonSignalPoint, signal_values


@dataclass(frozen=True)
class ScoredJob:
    """A Job annotated with its carbon score and valid scheduling window."""

    job: Job
    carbon_score: float          # avg gCO2/kWh over the job's execution window
    earliest_start: int          # == job.submit_hour
    latest_start: int            # == job.get_latest_start_hour()
    scheduled_start: int | None = None


def score_job(job: Job, carbon_signal: list[CarbonSignalPoint]) -> ScoredJob:
    """Compute the average carbon intensity for every valid start hour and pick the best."""
    values = signal_values(carbon_signal)
    horizon = len(values)

    best_start = job.submit_hour
    best_score = float("inf")

    for start in range(job.submit_hour, min(job.get_latest_start_hour() + 1, horizon)):
        end = start + job.runtime_hours
        if end > horizon:
            break
        avg = sum(values[start:end]) / job.runtime_hours
        if avg < best_score:
            best_score = avg
            best_start = start

    return ScoredJob(
        job=job,
        carbon_score=round(best_score, 4),
        earliest_start=job.submit_hour,
        latest_start=job.get_latest_start_hour(),
        scheduled_start=best_start,
    )


def score_all(jobs: list[Job], carbon_signal: list[CarbonSignalPoint]) -> list[ScoredJob]:
    return [score_job(job, carbon_signal) for job in jobs]

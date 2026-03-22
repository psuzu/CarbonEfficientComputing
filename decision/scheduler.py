"""Layer 3: Carbon-aware greedy scheduler."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from inputs.carbonsignal import load_carbon_signal_csv, signal_values, DEFAULT_OUTPUT_PATH
from inputs.generate_workload import Job
from modeling.timeslots import check_fit, allocate, make_capacity_array, DEFAULT_CAPACITY_PER_HOUR
from modeling.emissions import (
    estimate_job_emissions,
    score_job,
    DEFAULT_POWER_MODEL,
    PowerModel,
)


@dataclass(frozen=True)
class ScheduleResult:
    """Outcome of scheduling one job."""

    job_id: int
    baseline_start: int
    scheduled_start: int
    delay_hours: int
    baseline_emissions_kgco2e: float
    scheduled_emissions_kgco2e: float
    savings_kgco2e: float
    savings_pct: float


def _fits_in_horizon(job: Job, horizon: int) -> bool:
    """True when the job can start at submit_hour and finish within horizon."""
    return job.submit_hour + job.runtime_hours <= horizon


def annotate_within_horizon(
    jobs: list[Job],
    carbon_signal: list[float],
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> list[Job]:
    """
    Like modeling.emissions.annotate_jobs_with_carbon_scores, but clamps the
    scoring window so jobs that submit near the end of the horizon don't crash.
    Jobs whose runtime overflows the horizon entirely get carbon_score=None.
    """
    horizon = len(carbon_signal)
    scored: list[Job] = []
    for job in jobs:
        if not _fits_in_horizon(job, horizon):
            # Try starting at the latest possible hour that still fits
            clamped_start = horizon - job.runtime_hours
            if clamped_start < job.submit_hour:
                # Job cannot fit anywhere — keep score as None
                scored.append(job)
                continue
            cs = score_job(job, carbon_signal, start_hour=clamped_start, power_model=power_model)
        else:
            cs = score_job(job, carbon_signal, start_hour=job.submit_hour, power_model=power_model)
        scored.append(replace(job, carbon_score=cs))
    return scored


def schedule_job(
    job: Job,
    carbon_signal: list[float],
    capacity: list[int],
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> ScheduleResult | None:
    """
    Schedule a single job in its greenest feasible window.
    Searches [submit_hour, min(submit_hour + allowed_delay, horizon - runtime)]
    and allocates capacity at the lowest-emission slot found.
    Returns None if no feasible slot exists.
    """
    horizon = len(carbon_signal)
    latest_possible = min(job.get_latest_start_hour(), horizon - job.runtime_hours)

    if latest_possible < job.submit_hour:
        return None  # Job cannot fit in the horizon at all

    best_start: int | None = None
    best_emissions = float("inf")

    for start in range(job.submit_hour, latest_possible + 1):
        if not check_fit(start, job.runtime_hours, job.requested_cpus, capacity=capacity):
            continue
        est = estimate_job_emissions(job, carbon_signal, start_hour=start, power_model=power_model)
        if est.emissions_kgco2e < best_emissions:
            best_emissions = est.emissions_kgco2e
            best_start = start

    if best_start is None:
        return None

    allocate(best_start, job.runtime_hours, job.requested_cpus, capacity=capacity)

    baseline_est = estimate_job_emissions(
        job, carbon_signal, start_hour=job.submit_hour, power_model=power_model
    )
    savings = baseline_est.emissions_kgco2e - best_emissions
    savings_pct = (savings / baseline_est.emissions_kgco2e * 100) if baseline_est.emissions_kgco2e > 0 else 0.0

    return ScheduleResult(
        job_id=job.job_id,
        baseline_start=job.submit_hour,
        scheduled_start=best_start,
        delay_hours=best_start - job.submit_hour,
        baseline_emissions_kgco2e=round(baseline_est.emissions_kgco2e, 6),
        scheduled_emissions_kgco2e=round(best_emissions, 6),
        savings_kgco2e=round(savings, 6),
        savings_pct=round(savings_pct, 2),
    )


def schedule_all(
    jobs: list[Job],
    carbon_signal_path: str | Path = DEFAULT_OUTPUT_PATH,
    capacity_cpus: int = DEFAULT_CAPACITY_PER_HOUR,
    power_model: PowerModel = DEFAULT_POWER_MODEL,
) -> tuple[list[ScheduleResult], list[int]]:
    """
    Greedily schedule all jobs, highest carbon-score first so the biggest
    emitters get first pick of the cleanest windows.
    Returns (results, unscheduled_job_ids).
    """
    points = load_carbon_signal_csv(carbon_signal_path)
    sig = signal_values(points)
    capacity = make_capacity_array(horizon_hours=len(sig), capacity=capacity_cpus)

    annotated = annotate_within_horizon(jobs, sig, power_model)

    sorted_jobs = sorted(
        annotated,
        key=lambda j: j.carbon_score if j.carbon_score is not None else 0.0,
        reverse=True,
    )

    results: list[ScheduleResult] = []
    unscheduled: list[int] = []

    for job in sorted_jobs:
        result = schedule_job(job, sig, capacity, power_model)
        if result:
            results.append(result)
        else:
            unscheduled.append(job.job_id)

    return results, unscheduled


def aggregate_savings(results: list[ScheduleResult]) -> dict[str, float]:
    """Summarise total carbon savings across all scheduled jobs."""
    if not results:
        return {"total_jobs": 0, "jobs_delayed": 0, "baseline_kgco2e": 0.0,
                "scheduled_kgco2e": 0.0, "saved_kgco2e": 0.0, "savings_pct": 0.0}
    total_baseline = sum(r.baseline_emissions_kgco2e for r in results)
    total_scheduled = sum(r.scheduled_emissions_kgco2e for r in results)
    total_saved = total_baseline - total_scheduled
    pct = (total_saved / total_baseline * 100) if total_baseline > 0 else 0.0
    delayed = sum(1 for r in results if r.delay_hours > 0)
    return {
        "total_jobs": len(results),
        "jobs_delayed": delayed,
        "baseline_kgco2e": round(total_baseline, 4),
        "scheduled_kgco2e": round(total_scheduled, 4),
        "saved_kgco2e": round(total_saved, 4),
        "savings_pct": round(pct, 2),
    }


if __name__ == "__main__":
    from inputs.generate_workload import generate_jobs

    points = load_carbon_signal_csv()
    sig = signal_values(points)

    jobs = generate_jobs(n=100, horizon_hours=48, seed=42)
    results, unscheduled = schedule_all(jobs)
    stats = aggregate_savings(results)

    print("=" * 50)
    print("CARBON-AWARE SCHEDULER RESULTS")
    print("=" * 50)
    print(f"  Jobs scheduled:  {stats['total_jobs']}")
    print(f"  Jobs delayed:    {stats['jobs_delayed']}")
    print(f"  Unscheduled:     {len(unscheduled)}")
    print(f"  Baseline CO2e:   {stats['baseline_kgco2e']:.3f} kg")
    print(f"  Scheduled CO2e:  {stats['scheduled_kgco2e']:.3f} kg")
    print(f"  Saved:           {stats['saved_kgco2e']:.3f} kg ({stats['savings_pct']:.1f}%)")
    print("=" * 50)

    print("\nTop 10 savings by job:")
    top = sorted(results, key=lambda r: r.savings_kgco2e, reverse=True)[:10]
    for r in top:
        print(f"  Job {r.job_id:3d}: delayed {r.delay_hours}h → "
              f"saved {r.savings_kgco2e*1000:.1f}g CO2e ({r.savings_pct:.1f}%)")


__all__ = [
    "ScheduleResult",
    "annotate_within_horizon",
    "schedule_job",
    "schedule_all",
    "aggregate_savings",
]
"""
JSON entry point for the Next.js API route.
Accepts optional CLI args for single-job estimation,
or runs the full batch simulation when called with no args.

Usage:
  python -m decision.scheduler_api               -> full batch results
  python -m decision.scheduler_api 16 4 semi-flexible  -> single job estimate
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[0]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inputs.carbonsignal import load_carbon_signal_csv, signal_values, DEFAULT_OUTPUT_PATH
from inputs.generate_workload import generate_jobs, Job
from modeling.timeslots import make_capacity_array, DEFAULT_CAPACITY_PER_HOUR
from decision.scheduler import (
    schedule_job,
    schedule_all,
    aggregate_savings,
    annotate_within_horizon,
)


def _carbon_signal():
    points = load_carbon_signal_csv(DEFAULT_OUTPUT_PATH)
    return signal_values(points), points


def run_batch() -> dict:
    """Run the full 100-job simulation and return aggregate + per-job data."""
    sig, points = _carbon_signal()
    jobs = generate_jobs(n=100, horizon_hours=48, seed=42)
    results, unscheduled = schedule_all(jobs)
    stats = aggregate_savings(results)

    per_job = [
        {
            "job_id": r.job_id,
            "baseline_start": r.baseline_start,
            "scheduled_start": r.scheduled_start,
            "delay_hours": r.delay_hours,
            "baseline_kgco2e": r.baseline_emissions_kgco2e,
            "scheduled_kgco2e": r.scheduled_emissions_kgco2e,
            "savings_kgco2e": r.savings_kgco2e,
            "savings_pct": r.savings_pct,
        }
        for r in sorted(results, key=lambda r: r.job_id)
    ]

    # 48-hour carbon signal for chart
    carbon_forecast = [
        {
            "hour": p.hour_index,
            "intensity": round(p.carbon_signal_gco2_per_kwh, 2),
            "datetime": p.timestamp.isoformat(),
        }
        for p in points
    ]

    return {
        "summary": stats,
        "jobs": per_job,
        "unscheduled": unscheduled,
        "carbon_forecast": carbon_forecast,
    }


def run_single(cpus: int, runtime: int, flexibility: str) -> dict:
    """
    Estimate emissions for a single submitted job.
    Returns baseline vs scheduled breakdown plus the 48h carbon forecast.
    """
    if flexibility not in ("rigid", "semi-flexible", "flexible"):
        raise ValueError(f"Unknown flexibility class: {flexibility}")

    sig, points = _carbon_signal()

    job = Job(
        job_id=9999,
        submit_hour=0,
        requested_cpus=cpus,
        runtime_hours=runtime,
        flexibility_class=flexibility,
        workload_class="submitted",
    )

    capacity = make_capacity_array(horizon_hours=len(sig), capacity=DEFAULT_CAPACITY_PER_HOUR)
    result = schedule_job(job, sig, capacity)

    carbon_forecast = [
        {
            "hour": p.hour_index,
            "intensity": round(p.carbon_signal_gco2_per_kwh, 2),
            "datetime": p.timestamp.isoformat(),
        }
        for p in points
    ]

    if result is None:
        return {
            "error": "No feasible scheduling window found — cluster at capacity.",
            "carbon_forecast": carbon_forecast,
        }

    return {
        "job_id": result.job_id,
        "cpus": cpus,
        "runtime_hours": runtime,
        "flexibility": flexibility,
        "baseline_start": result.baseline_start,
        "scheduled_start": result.scheduled_start,
        "delay_hours": result.delay_hours,
        "baseline_kgco2e": result.baseline_emissions_kgco2e,
        "scheduled_kgco2e": result.scheduled_emissions_kgco2e,
        "savings_kgco2e": result.savings_kgco2e,
        "savings_pct": result.savings_pct,
        # Convert to grams for display
        "baseline_gco2e": round(result.baseline_emissions_kgco2e * 1000, 1),
        "scheduled_gco2e": round(result.scheduled_emissions_kgco2e * 1000, 1),
        "savings_gco2e": round(result.savings_kgco2e * 1000, 1),
        "carbon_forecast": carbon_forecast,
    }


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4:
            cpus = int(sys.argv[1])
            runtime = int(sys.argv[2])
            flexibility = sys.argv[3]
            output = run_single(cpus, runtime, flexibility)
        else:
            output = run_batch()
        print(json.dumps(output))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
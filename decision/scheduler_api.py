"""
JSON entry point for the Next.js API route.
Accepts optional CLI args for single-job estimation,
or runs the full batch simulation when called with no args.

Usage:
  python -m decision.scheduler_api
  python -m decision.scheduler_api 16 4 semi-flexible
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from decision.scheduler import aggregate_savings, schedule_all, schedule_job
from inputs.carbonsignal import DEFAULT_OUTPUT_PATH, load_carbon_signal_csv, signal_values
from inputs.generate_workload import Job, generate_jobs
from modeling.timeslots import DEFAULT_CAPACITY_PER_HOUR, make_capacity_array


def _carbon_signal() -> tuple[list[float], list]:
    """Load both the raw carbon points and their float intensity values."""

    points = load_carbon_signal_csv(DEFAULT_OUTPUT_PATH)
    return signal_values(points), points


def run_batch() -> dict:
    """Run the full 100-job simulation and return aggregate and per-job data."""

    _, points = _carbon_signal()
    jobs = generate_jobs(n=100, horizon_hours=48, seed=42)
    results, unscheduled = schedule_all(jobs)
    stats = aggregate_savings(results)

    per_job = [
        {
            "job_id": result.job_id,
            "baseline_start": result.baseline_start,
            "scheduled_start": result.scheduled_start,
            "delay_hours": result.delay_hours,
            "baseline_kgco2e": result.baseline_emissions_kgco2e,
            "scheduled_kgco2e": result.scheduled_emissions_kgco2e,
            "savings_kgco2e": result.savings_kgco2e,
            "savings_pct": result.savings_pct,
        }
        for result in sorted(results, key=lambda item: item.job_id)
    ]

    carbon_forecast = [
        {
            "hour": point.hour_index,
            "intensity": round(point.carbon_signal_gco2_per_kwh, 2),
            "datetime": point.timestamp.isoformat(),
        }
        for point in points
    ]

    return {
        "summary": stats,
        "jobs": per_job,
        "unscheduled": unscheduled,
        "carbon_forecast": carbon_forecast,
    }


def run_single(cpus: int, runtime: int, flexibility: str) -> dict:
    """Estimate baseline versus carbon-aware scheduling for one submitted job."""

    if flexibility not in ("rigid", "semi-flexible", "flexible"):
        raise ValueError(f"Unknown flexibility class: {flexibility}")

    signal, points = _carbon_signal()
    job = Job(
        job_id=9999,
        submit_hour=0,
        requested_cpus=cpus,
        runtime_hours=runtime,
        flexibility_class=flexibility,
        workload_class="submitted",
    )

    capacity = make_capacity_array(
        horizon_hours=len(signal),
        capacity=DEFAULT_CAPACITY_PER_HOUR,
    )
    result = schedule_job(job, signal, capacity)

    carbon_forecast = [
        {
            "hour": point.hour_index,
            "intensity": round(point.carbon_signal_gco2_per_kwh, 2),
            "datetime": point.timestamp.isoformat(),
        }
        for point in points
    ]

    if result is None:
        return {
            "error": "No feasible scheduling window found; cluster at capacity.",
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
        "baseline_gco2e": round(result.baseline_emissions_kgco2e * 1000, 1),
        "scheduled_gco2e": round(result.scheduled_emissions_kgco2e * 1000, 1),
        "savings_gco2e": round(result.savings_kgco2e * 1000, 1),
        "carbon_forecast": carbon_forecast,
    }


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4:
            cli_cpus = int(sys.argv[1])
            cli_runtime = int(sys.argv[2])
            cli_flexibility = sys.argv[3]
            output = run_single(cli_cpus, cli_runtime, cli_flexibility)
        else:
            output = run_batch()
        print(json.dumps(output))
    except Exception as exc:  # pragma: no cover - CLI guardrail
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

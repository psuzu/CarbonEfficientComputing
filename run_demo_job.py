"""Run one sample job and estimate its carbon impact.

The formula-based estimator is the core scheduling signal.
CodeCarbon measurement is an optional demo add-on enabled with ``--measure``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from estimator import calculate_job_emissions, load_grid_forecast
from inputs.generate_workload import load_jobs_csv
from modeling.execution import make_job_tracker_factory, measure_job_with_codecarbon, run_real_job

PROJECT_ROOT = Path(__file__).resolve().parent
SAMPLE_JOB_CSV = PROJECT_ROOT / "data" / "sample_job_submission.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--measure",
        action="store_true",
        help="Optional demo add-on: measure emissions with CodeCarbon in addition to the core scheduler estimate.",
    )
    args = parser.parse_args()

    job = load_jobs_csv(SAMPLE_JOB_CSV)[0]
    measurement_note: str | None = None
    if args.measure:
        try:
            execution = measure_job_with_codecarbon(
                job,
                duration_seconds=1.0,
                iterations=100_000,
                tracker_factory=make_job_tracker_factory(job),
            )
        except Exception as exc:
            execution = run_real_job(job, duration_seconds=1.0, iterations=100_000)
            measurement_note = (
                "CodeCarbon measurement was skipped; using the estimator-only path "
                f"for this run ({exc})."
            )
    else:
        execution = run_real_job(job, duration_seconds=1.0, iterations=100_000)
    emissions_gco2e = calculate_job_emissions(job, proposed_start_hour=0, grid_forecast_array=load_grid_forecast())

    print(f"Ran job {job.job_id} using workload '{execution.workload_name}'")
    print(f"Requested CPUs: {job.requested_cpus}")
    print(f"Wall time: {execution.wall_time_seconds:.4f} seconds")
    print(f"Estimated emissions at hour 0: {emissions_gco2e:.2f} gCO2e")
    if execution.measured_emissions_kgco2e is not None:
        print(f"Measured emissions: {execution.measured_emissions_kgco2e:.6f} kgCO2e")
    if measurement_note is not None:
        print(measurement_note)


if __name__ == "__main__":
    main()

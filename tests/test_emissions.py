"""Tests for the modeling-layer emissions estimator."""

from datetime import datetime

import pytest

from inputs.carbonsignal import CarbonSignalPoint
from inputs.generate_workload import Job
from modeling.emissions import (
    DEFAULT_POWER_MODEL,
    annotate_jobs_with_carbon_scores,
    average_carbon_intensity,
    estimate_energy_kwh,
    estimate_job_emissions,
    estimate_power_watts,
    score_job,
)


def test_estimate_power_and_energy():
    job = Job(
        job_id=1,
        submit_hour=0,
        requested_cpus=10,
        requested_gpus=1,
        runtime_hours=2,
        flexibility_class="rigid",
        workload_class="training",
    )
    assert estimate_power_watts(job) == pytest.approx(
        (DEFAULT_POWER_MODEL.base_watts + 10 * 12 + 1 * 225) * DEFAULT_POWER_MODEL.pue
    )
    assert estimate_energy_kwh(job) == pytest.approx(estimate_power_watts(job) * 2 / 1000.0)


def test_average_carbon_intensity_accepts_point_objects():
    signal = [
        CarbonSignalPoint(0, datetime(2026, 2, 20, 0, 0), 100.0),
        CarbonSignalPoint(1, datetime(2026, 2, 20, 1, 0), 200.0),
        CarbonSignalPoint(2, datetime(2026, 2, 20, 2, 0), 300.0),
    ]
    assert average_carbon_intensity(signal, start_hour=0, runtime_hours=2) == 150.0


def test_estimate_job_emissions_and_score():
    job = Job(1, 0, 10, 2, "rigid", requested_gpus=1, workload_class="training")
    signal = [100.0, 200.0, 300.0]
    estimate = estimate_job_emissions(job, carbon_signal=signal, start_hour=1)
    assert estimate.avg_carbon_intensity_gco2_per_kwh == 250.0
    assert estimate.emissions_kgco2e > 0
    assert score_job(job, carbon_signal=signal, start_hour=1) == pytest.approx(
        round(estimate.emissions_rate_kgco2e_per_hour, 6)
    )


def test_annotate_jobs_with_carbon_scores():
    jobs = [
        Job(1, 0, 4, 1, "rigid"),
        Job(2, 1, 8, 2, "semi-flexible", requested_gpus=1, workload_class="training"),
    ]
    scored_jobs = annotate_jobs_with_carbon_scores(
        jobs,
        carbon_signal=[100.0, 200.0, 300.0, 400.0],
    )
    assert all(job.carbon_score is not None for job in scored_jobs)
    assert jobs[0].carbon_score is None

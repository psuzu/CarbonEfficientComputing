"""Tests for the focused carbon estimator MVP helper."""

from pathlib import Path
import sys

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from estimator import POWER_PER_CPU_KW, calculate_job_emissions, estimate_submission
from inputs.generate_workload import Job


def test_calculate_job_emissions_matches_discrete_sum():
    job = Job(
        job_id=1,
        submit_hour=0,
        requested_cpus=10,
        runtime_hours=3,
        flexibility_class="flexible",
    )
    signal = [100.0, 200.0, 300.0, 400.0, 500.0]

    emissions = calculate_job_emissions(job, proposed_start_hour=1, grid_forecast_array=signal)

    expected = (10 * POWER_PER_CPU_KW) * (200.0 + 300.0 + 400.0)
    assert emissions == pytest.approx(expected)


def test_same_job_has_different_emissions_at_different_start_hours():
    job = Job(
        job_id=2,
        submit_hour=0,
        requested_cpus=8,
        runtime_hours=2,
        flexibility_class="flexible",
    )
    signal = [500.0] * 2 + [120.0] * 12 + [650.0] * 2 + [120.0] * 10

    start_at_hour_2 = calculate_job_emissions(job, proposed_start_hour=2, grid_forecast_array=signal)
    start_at_hour_14 = calculate_job_emissions(job, proposed_start_hour=14, grid_forecast_array=signal)

    assert start_at_hour_2 != start_at_hour_14
    assert start_at_hour_14 > start_at_hour_2


def test_calculate_job_emissions_rejects_window_beyond_forecast():
    job = Job(
        job_id=3,
        submit_hour=0,
        requested_cpus=4,
        runtime_hours=4,
        flexibility_class="rigid",
    )

    with pytest.raises(ValueError, match="exceeds the grid forecast horizon"):
        calculate_job_emissions(job, proposed_start_hour=1, grid_forecast_array=[100.0, 200.0, 300.0])


def test_estimate_submission_picks_cleaner_window(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "estimator.load_grid_forecast",
        lambda: [600.0, 550.0, 300.0, 200.0, 150.0, 100.0, 400.0, 450.0],
    )

    estimate = estimate_submission(
        {
            "cpus": 10,
            "runtime_hours": 2,
            "submit_hour": 0,
            "flexibility_class": "semi-flexible",
        }
    )

    assert estimate["scheduled_start_hour"] == 4
    assert estimate["delay_hours"] == 4
    assert estimate["optimized_emissions_gco2e"] < estimate["baseline_emissions_gco2e"]

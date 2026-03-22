"""Tests for real workload execution helpers."""

from __future__ import annotations

from inputs.generate_workload import Job
import pytest

from modeling.execution import (
    JobExecutionResult,
    create_emissions_tracker,
    cpu_burn,
    make_job_tracker_factory,
    measure_job_with_codecarbon,
    parallel_cpu_job,
    run_real_job,
)


class FakePool:
    def __init__(self, processes: int):
        self.processes = processes

    def __enter__(self) -> "FakePool":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def map(self, func, items):
        return [func(item) for item in items]


def test_cpu_burn_runs_and_returns_work():
    result = cpu_burn(duration_seconds=0.01, chunk_size=100)
    assert result > 0


def test_parallel_cpu_job_respects_worker_count():
    results = parallel_cpu_job(num_workers=3, iterations=10, pool_factory=FakePool)
    assert len(results) == 3
    assert all(result > 0 for result in results)


def test_run_real_job_uses_parallel_for_training_jobs():
    job = Job(
        job_id=1,
        submit_hour=0,
        requested_cpus=4,
        runtime_hours=1,
        flexibility_class="flexible",
        workload_class="training",
    )

    result = run_real_job(job, iterations=10, pool_factory=FakePool)

    assert isinstance(result, JobExecutionResult)
    assert result.workload_name == "parallel_cpu_job"
    assert result.requested_cpus == 4
    assert result.completed is True


def test_run_real_job_uses_single_process_for_interactive_jobs():
    job = Job(
        job_id=2,
        submit_hour=0,
        requested_cpus=1,
        runtime_hours=1,
        flexibility_class="rigid",
        workload_class="interactive",
    )

    result = run_real_job(job, duration_seconds=0.01)

    assert result.workload_name == "cpu_burn"
    assert result.wall_time_seconds >= 0


class FakeTracker:
    def start(self) -> None:
        return None

    def stop(self) -> float:
        return 0.0123


def test_measure_job_with_codecarbon_includes_measured_value():
    job = Job(
        job_id=3,
        submit_hour=0,
        requested_cpus=2,
        runtime_hours=1,
        flexibility_class="flexible",
        workload_class="training",
    )

    result = measure_job_with_codecarbon(
        job,
        iterations=10,
        pool_factory=FakePool,
        tracker_factory=FakeTracker,
    )

    assert result.workload_name == "parallel_cpu_job"
    assert result.measured_emissions_kgco2e == pytest.approx(0.0123)


def test_create_emissions_tracker_uses_safe_defaults(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    class FakeEmissionsTracker:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    class FakeModule:
        OfflineEmissionsTracker = FakeEmissionsTracker

    monkeypatch.setattr("modeling.execution.import_module", lambda name: FakeModule())

    create_emissions_tracker(project_name="demo")

    assert captured["country_iso_code"] == "USA"
    assert captured["project_name"] == "demo"
    assert captured["save_to_file"] is False
    assert captured["log_level"] == "error"
    assert captured["tracking_mode"] == "process"
    assert captured["force_cpu_power"] == 60
    assert captured["force_mode_cpu_load"] is True
    assert captured["allow_multiple_runs"] is False
    assert captured["api_call_interval"] == -1


def test_make_job_tracker_factory_scales_for_requested_cpus(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    def fake_create_emissions_tracker(**kwargs):
        captured.update(kwargs)
        return FakeTracker()

    job = Job(
        job_id=4,
        submit_hour=0,
        requested_cpus=16,
        runtime_hours=1,
        flexibility_class="flexible",
        workload_class="training",
    )

    monkeypatch.setattr("modeling.execution.create_emissions_tracker", fake_create_emissions_tracker)

    factory = make_job_tracker_factory(job)
    factory()

    assert captured["force_cpu_power"] == 252

"""Tests for the demo runner script behavior."""

from __future__ import annotations

from argparse import Namespace

import run_demo_job


def test_demo_runner_falls_back_when_measurement_errors(
    monkeypatch,
    capsys,
):
    monkeypatch.setattr(
        "run_demo_job.argparse.ArgumentParser.parse_args",
        lambda self: Namespace(measure=True),
    )
    monkeypatch.setattr("run_demo_job.load_jobs_csv", lambda path: [type("JobObj", (), {
        "job_id": 1001,
        "requested_cpus": 4,
        "runtime_hours": 1,
    })()])
    monkeypatch.setattr(
        "run_demo_job.measure_job_with_codecarbon",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("measurement failed")),
    )
    monkeypatch.setattr(
        "run_demo_job.run_real_job",
        lambda *args, **kwargs: type("ExecObj", (), {
            "workload_name": "parallel_cpu_job",
            "wall_time_seconds": 0.25,
            "measured_emissions_kgco2e": None,
        })(),
    )
    monkeypatch.setattr("run_demo_job.load_grid_forecast", lambda: [100.0, 100.0, 100.0])
    monkeypatch.setattr("run_demo_job.calculate_job_emissions", lambda *args, **kwargs: 42.0)
    monkeypatch.setattr("run_demo_job.make_job_tracker_factory", lambda job: lambda: None)

    run_demo_job.main()

    output = capsys.readouterr().out
    assert "Estimated emissions at hour 0: 42.00 gCO2e" in output
    assert "CodeCarbon measurement was skipped" in output

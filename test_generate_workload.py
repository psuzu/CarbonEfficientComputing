"""
Tests for generate_workload.py

Covers:
    - Job dataclass construction and validation
    - Flexibility model helpers
    - CSV round-trip (write -> load)
    - Workload generator constraints
"""

import os
import tempfile
from pathlib import Path

import pytest

from generate_workload import (
    FLEXIBILITY_CLASSES,
    FLEXIBILITY_DELAY,
    Job,
    generate_jobs,
    load_jobs_csv,
    write_jobs_csv,
)


# Job construction

class TestJobConstruction:
    """Valid Job creation and field access."""

    def test_create_rigid_job(self):
        job = Job(job_id=1, submit_hour=0, requested_cpus=4, runtime_hours=2, flexibility_class="rigid")
        assert job.job_id == 1
        assert job.submit_hour == 0
        assert job.requested_cpus == 4
        assert job.runtime_hours == 2
        assert job.flexibility_class == "rigid"

    def test_create_semi_flexible_job(self):
        job = Job(job_id=2, submit_hour=10, requested_cpus=16, runtime_hours=5, flexibility_class="semi-flexible")
        assert job.flexibility_class == "semi-flexible"

    def test_create_flexible_job(self):
        job = Job(job_id=3, submit_hour=47, requested_cpus=128, runtime_hours=24, flexibility_class="flexible")
        assert job.flexibility_class == "flexible"

    def test_job_is_immutable(self):
        job = Job(job_id=1, submit_hour=0, requested_cpus=4, runtime_hours=2, flexibility_class="rigid")
        with pytest.raises(AttributeError):
            job.submit_hour = 5  # frozen dataclass


# Job construction — validation errors

class TestJobValidation:
    """Ensure __post_init__ rejects bad data."""

    def test_invalid_job_id_type(self):
        with pytest.raises(TypeError, match="job_id must be int"):
            Job(job_id="abc", submit_hour=0, requested_cpus=1, runtime_hours=1, flexibility_class="rigid")

    def test_negative_submit_hour(self):
        with pytest.raises(ValueError, match="submit_hour"):
            Job(job_id=1, submit_hour=-1, requested_cpus=1, runtime_hours=1, flexibility_class="rigid")

    def test_zero_cpus(self):
        with pytest.raises(ValueError, match="requested_cpus"):
            Job(job_id=1, submit_hour=0, requested_cpus=0, runtime_hours=1, flexibility_class="rigid")

    def test_negative_cpus(self):
        with pytest.raises(ValueError, match="requested_cpus"):
            Job(job_id=1, submit_hour=0, requested_cpus=-5, runtime_hours=1, flexibility_class="rigid")

    def test_zero_runtime(self):
        with pytest.raises(ValueError, match="runtime_hours"):
            Job(job_id=1, submit_hour=0, requested_cpus=1, runtime_hours=0, flexibility_class="rigid")

    def test_invalid_flexibility_class(self):
        with pytest.raises(ValueError, match="flexibility_class"):
            Job(job_id=1, submit_hour=0, requested_cpus=1, runtime_hours=1, flexibility_class="ultra-flex")


# Flexibility model helpers

class TestFlexibilityHelpers:
    """Tests for allowed_delay and get_latest_start_hour."""

    def test_rigid_delay_is_zero(self):
        job = Job(job_id=1, submit_hour=5, requested_cpus=4, runtime_hours=2, flexibility_class="rigid")
        assert job.allowed_delay == 0
        assert job.get_latest_start_hour() == 5

    def test_semi_flexible_delay(self):
        job = Job(job_id=2, submit_hour=5, requested_cpus=4, runtime_hours=2, flexibility_class="semi-flexible")
        assert job.allowed_delay == 6
        assert job.get_latest_start_hour() == 11  # acceptance criterion from local.md

    def test_flexible_delay(self):
        job = Job(job_id=3, submit_hour=10, requested_cpus=4, runtime_hours=2, flexibility_class="flexible")
        assert job.allowed_delay == 24
        assert job.get_latest_start_hour() == 34

    def test_flexibility_delay_map_complete(self):
        """Every flexibility class has a mapping."""
        for cls in FLEXIBILITY_CLASSES:
            assert cls in FLEXIBILITY_DELAY


# Serialisation (to_dict / from_dict)

class TestSerialisation:
    """Round-trip through dict representation."""

    def test_to_dict_keys(self):
        job = Job(job_id=1, submit_hour=0, requested_cpus=4, runtime_hours=2, flexibility_class="rigid")
        d = job.to_dict()
        assert set(d.keys()) == {"job_id", "submit_hour", "requested_cpus", "runtime_hours", "flexibility_class"}

    def test_round_trip_via_dict(self):
        original = Job(job_id=42, submit_hour=13, requested_cpus=64, runtime_hours=8, flexibility_class="flexible")
        rebuilt = Job.from_dict(original.to_dict())
        assert rebuilt == original

    def test_from_dict_with_string_values(self):
        """CSV readers return strings — from_dict must handle that."""
        row = {
            "job_id": "7",
            "submit_hour": "3",
            "requested_cpus": "16",
            "runtime_hours": "4",
            "flexibility_class": "semi-flexible",
        }
        job = Job.from_dict(row)
        assert job.job_id == 7
        assert isinstance(job.job_id, int)

    def test_from_dict_missing_field(self):
        row = {"job_id": "1", "submit_hour": "0"}  # missing fields
        with pytest.raises(ValueError, match="Missing required field"):
            Job.from_dict(row)

    def test_from_dict_invalid_value(self):
        row = {
            "job_id": "not_a_number",
            "submit_hour": "0",
            "requested_cpus": "4",
            "runtime_hours": "2",
            "flexibility_class": "rigid",
        }
        with pytest.raises(ValueError, match="Invalid data"):
            Job.from_dict(row)


# CSV round-trip (write -> load)

class TestCSVRoundTrip:
    """Write jobs to CSV, reload, and verify equality."""

    def _make_jobs(self):
        return [
            Job(job_id=1, submit_hour=0, requested_cpus=2, runtime_hours=1, flexibility_class="rigid"),
            Job(job_id=2, submit_hour=12, requested_cpus=64, runtime_hours=10, flexibility_class="flexible"),
            Job(job_id=3, submit_hour=5, requested_cpus=8, runtime_hours=3, flexibility_class="semi-flexible"),
        ]

    def test_round_trip_preserves_data(self, tmp_path):
        csv_file = tmp_path / "test_jobs.csv"
        original_jobs = self._make_jobs()

        write_jobs_csv(original_jobs, csv_file)
        loaded_jobs = load_jobs_csv(csv_file)

        assert len(loaded_jobs) == len(original_jobs)
        for orig, loaded in zip(original_jobs, loaded_jobs):
            assert orig == loaded

    def test_csv_has_correct_header(self, tmp_path):
        csv_file = tmp_path / "test_jobs.csv"
        write_jobs_csv(self._make_jobs(), csv_file)

        with csv_file.open() as f:
            header = f.readline().strip()
        assert header == "job_id,submit_hour,requested_cpus,runtime_hours,flexibility_class"

    def test_empty_job_list(self, tmp_path):
        csv_file = tmp_path / "empty.csv"
        write_jobs_csv([], csv_file)
        loaded = load_jobs_csv(csv_file)
        assert loaded == []


# Workload generator

class TestGenerateJobs:
    """Tests for the generate_jobs function."""

    def test_generates_correct_count(self):
        jobs = generate_jobs(n=50, seed=1)
        assert len(jobs) == 50

    def test_default_generates_100(self):
        jobs = generate_jobs(seed=99)
        assert len(jobs) == 100

    def test_job_ids_are_sequential(self):
        jobs = generate_jobs(n=20, seed=1)
        ids = [j.job_id for j in jobs]
        assert ids == list(range(1, 21))

    def test_submit_hours_within_horizon(self):
        horizon = 48
        jobs = generate_jobs(n=100, horizon_hours=horizon, seed=1)
        for job in jobs:
            assert 0 <= job.submit_hour < horizon

    def test_all_flexibility_classes_valid(self):
        jobs = generate_jobs(n=200, seed=1)
        for job in jobs:
            assert job.flexibility_class in FLEXIBILITY_CLASSES

    def test_cpus_are_positive(self):
        jobs = generate_jobs(n=100, seed=1)
        for job in jobs:
            assert job.requested_cpus >= 1

    def test_runtime_is_positive(self):
        jobs = generate_jobs(n=100, seed=1)
        for job in jobs:
            assert job.runtime_hours >= 1

    def test_seed_gives_reproducible_output(self):
        jobs_a = generate_jobs(n=50, seed=123)
        jobs_b = generate_jobs(n=50, seed=123)
        assert jobs_a == jobs_b

    def test_different_seeds_give_different_output(self):
        jobs_a = generate_jobs(n=50, seed=1)
        jobs_b = generate_jobs(n=50, seed=2)
        assert jobs_a != jobs_b

    def test_mix_of_flexibility_classes(self):
        """With enough jobs we should see all three classes represented."""
        jobs = generate_jobs(n=200, seed=42)
        classes_seen = {j.flexibility_class for j in jobs}
        assert classes_seen == set(FLEXIBILITY_CLASSES)

    def test_no_missing_values(self):
        """Acceptance criterion: no missing values, all types enforced."""
        jobs = generate_jobs(n=100, seed=42)
        for job in jobs:
            assert job.job_id is not None
            assert job.submit_hour is not None
            assert job.requested_cpus is not None
            assert job.runtime_hours is not None
            assert job.flexibility_class is not None


# Full integration: generate -> CSV -> reload

class TestIntegration:
    """End-to-end: generate jobs, write CSV, reload, validate."""

    def test_full_pipeline(self, tmp_path):
        csv_file = tmp_path / "integration_jobs.csv"

        jobs = generate_jobs(n=100, seed=42)
        write_jobs_csv(jobs, csv_file)
        reloaded = load_jobs_csv(csv_file)

        assert len(reloaded) == 100
        for orig, loaded in zip(jobs, reloaded):
            assert orig == loaded

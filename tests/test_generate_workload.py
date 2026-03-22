"""Tests for workload generation and the input-layer job model."""

from dataclasses import replace

import pytest

from inputs.generate_workload import (
    CSV_COLUMNS,
    DEFAULT_JOBS_PATH,
    FLEXIBILITY_CLASSES,
    FLEXIBILITY_DELAY,
    Job,
    generate_jobs,
    load_jobs_csv,
    write_jobs_csv,
)


class TestJobConstruction:
    def test_create_valid_job(self):
        job = Job(
            job_id=1,
            submit_hour=0,
            requested_cpus=4,
            runtime_hours=2,
            flexibility_class="rigid",
            requested_gpus=1,
            workload_class="training",
        )
        assert job.job_id == 1
        assert job.requested_gpus == 1
        assert job.workload_class == "training"
        assert job.source_archive is None
        assert job.carbon_score is None
        assert job.requires_accelerator is True

    def test_job_is_immutable(self):
        job = Job(1, 0, 4, 2, "rigid")
        with pytest.raises(AttributeError):
            job.submit_hour = 5

    def test_update_carbon_score_via_replace(self):
        original = Job(1, 0, 4, 2, "rigid")
        updated = replace(original, carbon_score=99.9)
        assert original.carbon_score is None
        assert updated.carbon_score == 99.9


class TestJobValidation:
    def test_invalid_job_id_type(self):
        with pytest.raises(TypeError, match="job_id must be int"):
            Job("abc", 0, 1, 1, "rigid")

    def test_invalid_values(self):
        with pytest.raises(ValueError, match="submit_hour"):
            Job(1, -1, 1, 1, "rigid")
        with pytest.raises(ValueError, match="requested_cpus"):
            Job(1, 0, 0, 1, "rigid")
        with pytest.raises(ValueError, match="requested_gpus"):
            Job(1, 0, 1, 1, "rigid", requested_gpus=-1)
        with pytest.raises(ValueError, match="runtime_hours"):
            Job(1, 0, 1, 0, "rigid")
        with pytest.raises(ValueError, match="flexibility_class"):
            Job(1, 0, 1, 1, "ultra-flex")
        with pytest.raises(ValueError, match="workload_class"):
            Job(1, 0, 1, 1, "rigid", workload_class="  ")
        with pytest.raises(ValueError, match="source_archive"):
            Job(1, 0, 1, 1, "rigid", source_archive="submission.tar")


class TestFlexibilityHelpers:
    def test_delay_map_is_complete(self):
        for flexibility_class in FLEXIBILITY_CLASSES:
            assert flexibility_class in FLEXIBILITY_DELAY

    def test_latest_start_hour(self):
        job = Job(2, 5, 4, 2, "semi-flexible")
        assert job.allowed_delay == 6
        assert job.get_latest_start_hour() == 11


class TestSerialisation:
    def test_to_dict_keys(self):
        job = Job(1, 0, 4, 2, "rigid")
        assert set(job.to_dict().keys()) == set(CSV_COLUMNS)

    def test_round_trip_via_dict(self):
        original = Job(
            42,
            13,
            64,
            8,
            "flexible",
            requested_gpus=2,
            workload_class="training",
            source_archive="data/sample_jobs/demo_research_job.zip",
        )
        rebuilt = Job.from_dict(original.to_dict())
        assert rebuilt == original

    def test_from_dict_backfills_new_optional_fields(self):
        row = {
            "job_id": "7",
            "submit_hour": "3",
            "requested_cpus": "16",
            "runtime_hours": "4",
            "flexibility_class": "semi-flexible",
        }
        job = Job.from_dict(row)
        assert job.requested_gpus == 0
        assert job.workload_class == "generic"
        assert job.source_archive is None

    def test_from_dict_missing_field(self):
        with pytest.raises(ValueError, match="Missing required field"):
            Job.from_dict({"job_id": "1", "submit_hour": "0"})


class TestCsvRoundTrip:
    def test_round_trip_preserves_data(self, tmp_path):
        csv_file = tmp_path / "jobs" / "test_jobs.csv"
        original_jobs = [
            Job(1, 0, 2, 1, "rigid"),
            Job(
                2,
                12,
                64,
                10,
                "flexible",
                requested_gpus=2,
                workload_class="training",
                source_archive="data/sample_jobs/demo_research_job.zip",
            ),
            Job(3, 5, 8, 3, "semi-flexible", workload_class="dev-test"),
        ]

        write_jobs_csv(original_jobs, csv_file)
        loaded_jobs = load_jobs_csv(csv_file)
        assert loaded_jobs == original_jobs

    def test_csv_has_correct_header(self, tmp_path):
        csv_file = tmp_path / "test_jobs.csv"
        write_jobs_csv([Job(1, 0, 2, 1, "rigid")], csv_file)
        with csv_file.open() as handle:
            header = handle.readline().strip()
        assert header == ",".join(CSV_COLUMNS)

    def test_default_path_points_into_data_directory(self):
        assert DEFAULT_JOBS_PATH.name == "jobs_input.csv"
        assert DEFAULT_JOBS_PATH.parent.name == "data"


class TestGenerateJobs:
    def test_generates_correct_count(self):
        assert len(generate_jobs(n=50, seed=1)) == 50

    def test_job_ids_are_sequential(self):
        jobs = generate_jobs(n=20, seed=1)
        assert [job.job_id for job in jobs] == list(range(1, 21))

    def test_submit_hours_within_horizon(self):
        horizon = 48
        jobs = generate_jobs(n=100, horizon_hours=horizon, seed=1)
        assert all(0 <= job.submit_hour < horizon for job in jobs)

    def test_seed_gives_reproducible_output(self):
        assert generate_jobs(n=50, seed=123) == generate_jobs(n=50, seed=123)

    def test_generated_jobs_have_layer_two_fields(self):
        jobs = generate_jobs(n=50, seed=42)
        assert all(job.requested_gpus >= 0 for job in jobs)
        assert all(job.workload_class for job in jobs)
        assert all(job.carbon_score is None for job in jobs)

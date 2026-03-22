"""Validate that sample upload bundles match the sample submission CSV."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from zipfile import ZipFile

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_CSV = PROJECT_ROOT / "data" / "sample_job_submission.csv"


def _load_manifest_from_zip(zip_path: Path) -> dict[str, object]:
    with ZipFile(zip_path) as archive:
        manifest_name = next(
            name for name in archive.namelist() if name.endswith("job_manifest.json")
        )
        with archive.open(manifest_name) as handle:
            return json.load(handle)


def test_sample_submission_rows_match_zip_manifests():
    with SAMPLE_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    assert len(rows) == 3

    for row in rows:
        zip_path = PROJECT_ROOT / row["source_archive"]
        assert zip_path.exists(), f"Missing sample archive: {zip_path}"

        manifest = _load_manifest_from_zip(zip_path)
        assert int(row["job_id"]) == manifest["job_id"]
        assert int(row["submit_hour"]) == manifest["submit_hour"]
        assert int(row["requested_cpus"]) == manifest["requested_cpus"]
        assert int(row["requested_gpus"]) == manifest["requested_gpus"]
        assert int(row["runtime_hours"]) == manifest["runtime_hours"]
        assert row["flexibility_class"] == manifest["flexibility_class"]
        assert row["workload_class"] == manifest["workload_class"]
        assert row["source_archive"] == manifest["source_archive"]

"""Tests for uploaded job archive analysis."""

from __future__ import annotations

from pathlib import Path
from zipfile import ZipFile

from job_analyzer import analyze_job_archive

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_analyze_job_archive_uses_manifest_for_sample_zip():
    result = analyze_job_archive(
        PROJECT_ROOT / "data" / "sample_jobs" / "parallel_batch_job.zip",
        requested_cpus=2,
        runtime_hours=1,
    )

    assert result["analysis_source"] == "manifest"
    assert result["recommended_cpus"] == 4
    assert result["estimated_runtime_hours"] == 1
    assert result["workload_class"] == "batch"
    assert result["warnings"]


def test_analyze_job_archive_falls_back_to_heuristics(tmp_path: Path):
    archive_path = tmp_path / "heuristic_job.zip"
    source_dir = tmp_path / "heuristic_job"
    source_dir.mkdir()
    (source_dir / "run.py").write_text(
        "from multiprocessing import Pool\n\n"
        "def work(_):\n"
        "    return sum(i*i for i in range(1000))\n\n"
        "with Pool(4) as p:\n"
        "    p.map(work, range(4))\n",
        encoding="utf-8",
    )
    with ZipFile(archive_path, "w") as archive:
        archive.write(source_dir / "run.py", arcname="heuristic_job/run.py")

    result = analyze_job_archive(archive_path, requested_cpus=1, runtime_hours=1)

    assert result["analysis_source"] == "heuristic"
    assert result["recommended_cpus"] == 4
    assert result["workload_class"] == "batch"
    assert result["warnings"]

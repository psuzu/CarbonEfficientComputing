"""Analyze uploaded job archives to recommend CPUs and runtime."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from zipfile import ZipFile


def _load_manifest(archive: ZipFile) -> dict[str, Any] | None:
    manifest_name = next(
        (name for name in archive.namelist() if name.endswith("job_manifest.json")),
        None,
    )
    if manifest_name is None:
        return None
    with archive.open(manifest_name) as handle:
        return json.load(handle)


def _read_python_sources(archive: ZipFile) -> str:
    parts: list[str] = []
    for name in archive.namelist():
        if not name.endswith((".py", ".txt", ".md", ".json")):
            continue
        with archive.open(name) as handle:
            try:
                parts.append(handle.read().decode("utf-8", errors="ignore"))
            except Exception:
                continue
    return "\n".join(parts)


def _heuristic_analysis(source_text: str) -> dict[str, Any]:
    normalized = source_text.lower()

    if (
        "multiprocessing" in normalized
        or "from multiprocessing import pool" in normalized
        or " pool(" in normalized
        or ".map(" in normalized
    ):
        return {
            "analysis_source": "heuristic",
            "workload_class": "batch",
            "intensity_label": "parallel_cpu",
            "recommended_cpus": 4,
            "estimated_runtime_hours": 1,
        }

    if (
        "import numpy" in normalized
        or "from numpy" in normalized
        or "np.dot" in normalized
        or "matmul" in normalized
    ):
        return {
            "analysis_source": "heuristic",
            "workload_class": "dev-test",
            "intensity_label": "matrix_compute",
            "recommended_cpus": 2,
            "estimated_runtime_hours": 1,
        }

    if re.search(r"for\s+\w+\s+in\s+range\(", normalized):
        return {
            "analysis_source": "heuristic",
            "workload_class": "interactive",
            "intensity_label": "cpu_burn",
            "recommended_cpus": 1,
            "estimated_runtime_hours": 1,
        }

    return {
        "analysis_source": "heuristic",
        "workload_class": "dev-test",
        "intensity_label": "generic_compute",
        "recommended_cpus": 1,
        "estimated_runtime_hours": 1,
    }


def analyze_job_archive(
    archive_path: str | Path,
    requested_cpus: int | None = None,
    runtime_hours: int | None = None,
) -> dict[str, Any]:
    path = Path(archive_path)
    warnings: list[str] = []

    with ZipFile(path) as archive:
        manifest = _load_manifest(archive)
        if manifest is not None:
            result = {
                "analysis_source": "manifest",
                "workload_class": str(manifest["workload_class"]),
                "intensity_label": str(manifest["workload_class"]),
                "recommended_cpus": int(manifest["requested_cpus"]),
                "estimated_runtime_hours": int(manifest["runtime_hours"]),
            }
        else:
            result = _heuristic_analysis(_read_python_sources(archive))

    if requested_cpus is not None and requested_cpus < result["recommended_cpus"]:
        warnings.append(
            f"Requested CPUs ({requested_cpus}) may be too low for this job. "
            f"Recommended minimum is {result['recommended_cpus']}."
        )

    if runtime_hours is not None and runtime_hours < result["estimated_runtime_hours"]:
        warnings.append(
            f"Requested runtime ({runtime_hours}h) may be too short. "
            f"Estimated minimum runtime is {result['estimated_runtime_hours']}h."
        )

    result["warnings"] = warnings
    result["archive_name"] = path.name
    return result


def main() -> None:
    payload = json.load(sys.stdin)
    result = analyze_job_archive(
        payload["archive_path"],
        requested_cpus=payload.get("requested_cpus"),
        runtime_hours=payload.get("runtime_hours"),
    )
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

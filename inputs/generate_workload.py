"""Workload generation and job-model helpers for Layers 1 and 2."""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JOBS_PATH = PROJECT_ROOT / "data" / "jobs_input.csv"

FLEXIBILITY_DELAY = {
    "rigid": 0,
    "semi-flexible": 6,
    "flexible": 24,
}

FLEXIBILITY_CLASSES = list(FLEXIBILITY_DELAY.keys())

CSV_COLUMNS = [
    "job_id",
    "submit_hour",
    "requested_cpus",
    "requested_gpus",
    "runtime_hours",
    "flexibility_class",
    "workload_class",
    "carbon_score",
]


@dataclass(frozen=True)
class Job:
    """Immutable description of one schedulable HPC workload."""

    job_id: int
    submit_hour: int
    requested_cpus: int
    runtime_hours: int
    flexibility_class: str
    requested_gpus: int = 0
    workload_class: str = "generic"
    carbon_score: float | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.job_id, int):
            raise TypeError(f"job_id must be int, got {type(self.job_id).__name__}")
        if not isinstance(self.submit_hour, int) or self.submit_hour < 0:
            raise ValueError(f"submit_hour must be a non-negative int, got {self.submit_hour}")
        if not isinstance(self.requested_cpus, int) or self.requested_cpus < 1:
            raise ValueError(f"requested_cpus must be a positive int, got {self.requested_cpus}")
        if not isinstance(self.requested_gpus, int) or self.requested_gpus < 0:
            raise ValueError(f"requested_gpus must be a non-negative int, got {self.requested_gpus}")
        if not isinstance(self.runtime_hours, int) or self.runtime_hours < 1:
            raise ValueError(f"runtime_hours must be a positive int, got {self.runtime_hours}")
        if self.flexibility_class not in FLEXIBILITY_CLASSES:
            raise ValueError(
                f"flexibility_class must be one of {FLEXIBILITY_CLASSES}, "
                f"got '{self.flexibility_class}'"
            )
        if not isinstance(self.workload_class, str) or not self.workload_class.strip():
            raise ValueError("workload_class must be a non-empty string")
        if self.carbon_score is not None and not isinstance(self.carbon_score, (int, float)):
            raise TypeError(
                "carbon_score must be a float, int, or None, "
                f"got {type(self.carbon_score).__name__}"
            )

    @property
    def allowed_delay(self) -> int:
        return FLEXIBILITY_DELAY[self.flexibility_class]

    @property
    def requires_accelerator(self) -> bool:
        return self.requested_gpus > 0

    def get_latest_start_hour(self) -> int:
        return self.submit_hour + self.allowed_delay

    def to_dict(self) -> dict[str, int | str | float | None]:
        return {
            "job_id": self.job_id,
            "submit_hour": self.submit_hour,
            "requested_cpus": self.requested_cpus,
            "requested_gpus": self.requested_gpus,
            "runtime_hours": self.runtime_hours,
            "flexibility_class": self.flexibility_class,
            "workload_class": self.workload_class,
            "carbon_score": self.carbon_score,
        }

    @classmethod
    def from_dict(cls, row: dict[str, Any]) -> "Job":
        try:
            raw_score = row.get("carbon_score")
            if raw_score is None or str(raw_score).strip() == "":
                carbon_score = None
            else:
                carbon_score = float(raw_score)

            requested_gpus = row.get("requested_gpus", 0)
            workload_class = row.get("workload_class", "generic")

            return cls(
                job_id=int(row["job_id"]),
                submit_hour=int(row["submit_hour"]),
                requested_cpus=int(row["requested_cpus"]),
                requested_gpus=int(requested_gpus),
                runtime_hours=int(row["runtime_hours"]),
                flexibility_class=str(row["flexibility_class"]).strip(),
                workload_class=str(workload_class).strip() or "generic",
                carbon_score=carbon_score,
            )
        except KeyError as exc:
            raise ValueError(f"Missing required field: {exc}") from exc
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid data in row {row}: {exc}") from exc


JOB_PROFILES = [
    {
        "name": "interactive",
        "cpu_range": (1, 4),
        "gpu_range": (0, 0),
        "runtime_range": (1, 3),
        "weight": 20,
        "flex_weights": {"rigid": 0.85, "semi-flexible": 0.10, "flexible": 0.05},
    },
    {
        "name": "dev-test",
        "cpu_range": (4, 32),
        "gpu_range": (0, 1),
        "runtime_range": (1, 6),
        "weight": 30,
        "flex_weights": {"rigid": 0.20, "semi-flexible": 0.50, "flexible": 0.30},
    },
    {
        "name": "training",
        "cpu_range": (32, 128),
        "gpu_range": (1, 4),
        "runtime_range": (4, 24),
        "weight": 30,
        "flex_weights": {"rigid": 0.05, "semi-flexible": 0.25, "flexible": 0.70},
    },
    {
        "name": "batch",
        "cpu_range": (64, 256),
        "gpu_range": (0, 2),
        "runtime_range": (12, 48),
        "weight": 20,
        "flex_weights": {"rigid": 0.02, "semi-flexible": 0.18, "flexible": 0.80},
    },
]


def _pick_profile(rng: random.Random) -> dict[str, Any]:
    weights = [profile["weight"] for profile in JOB_PROFILES]
    return rng.choices(JOB_PROFILES, weights=weights, k=1)[0]


def _pick_flexibility(rng: random.Random, flex_weights: dict[str, float]) -> str:
    classes = list(flex_weights.keys())
    weights = list(flex_weights.values())
    return rng.choices(classes, weights=weights, k=1)[0]


def write_jobs_csv(jobs: list[Job], path: str | Path = DEFAULT_JOBS_PATH) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for job in jobs:
            writer.writerow(job.to_dict())
    return output_path


def load_jobs_csv(path: str | Path = DEFAULT_JOBS_PATH) -> list[Job]:
    jobs: list[Job] = []
    with Path(path).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            jobs.append(Job.from_dict(row))
    return jobs


def generate_jobs(
    n: int = 100,
    horizon_hours: int = 48,
    seed: int | None = 42,
) -> list[Job]:
    if not isinstance(n, int) or n < 0:
        raise ValueError(f"n must be a non-negative int, got {n}")
    if not isinstance(horizon_hours, int) or horizon_hours < 1:
        raise ValueError(f"horizon_hours must be a positive int, got {horizon_hours}")

    rng = random.Random(seed)
    jobs: list[Job] = []
    for job_id in range(1, n + 1):
        profile = _pick_profile(rng)
        cpu_lo, cpu_hi = profile["cpu_range"]
        gpu_lo, gpu_hi = profile["gpu_range"]
        runtime_lo, runtime_hi = profile["runtime_range"]
        jobs.append(
            Job(
                job_id=job_id,
                submit_hour=rng.randint(0, horizon_hours - 1),
                requested_cpus=rng.randint(cpu_lo, cpu_hi),
                requested_gpus=rng.randint(gpu_lo, gpu_hi),
                runtime_hours=rng.randint(runtime_lo, runtime_hi),
                flexibility_class=_pick_flexibility(rng, profile["flex_weights"]),
                workload_class=profile["name"],
            )
        )
    return jobs


def main() -> None:
    print("Generating 100 realistic dummy jobs...")
    jobs = generate_jobs(n=100, horizon_hours=48, seed=42)
    output = write_jobs_csv(jobs, DEFAULT_JOBS_PATH)
    print(f"Wrote {len(jobs)} jobs to {output}")

    reloaded = load_jobs_csv(output)
    assert len(reloaded) == len(jobs), "Round-trip row count mismatch"
    for original, loaded in zip(jobs, reloaded):
        assert original == loaded, f"Mismatch on job {original.job_id}"
    print("Round-trip validation passed.")


if __name__ == "__main__":
    main()


__all__ = [
    "CSV_COLUMNS",
    "DEFAULT_JOBS_PATH",
    "FLEXIBILITY_CLASSES",
    "FLEXIBILITY_DELAY",
    "JOB_PROFILES",
    "Job",
    "generate_jobs",
    "load_jobs_csv",
    "write_jobs_csv",
]

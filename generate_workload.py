"""
generate_workload.py

Defines the Job data model and generates 100 realistic dummy jobs into jobs_input.csv.

Job Model (Layer 2):
    - job_id        : Unique identifier (int)
    - submit_hour   : Hour index when the job is submitted (0 - 47)
    - requested_cpus: Number of CPUs the job requires
    - runtime_hours : Duration of the job in whole hours
    - flexibility_class: "rigid", "semi-flexible", or "flexible"
"""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass, fields
from pathlib import Path
from typing import List

# Flexibility Model

FLEXIBILITY_DELAY = {
    "rigid": 0,           # must start immediately
    "semi-flexible": 6,   # can be delayed up to 6 hours
    "flexible": 24,       # can be delayed up to 24 hours
}

FLEXIBILITY_CLASSES = list(FLEXIBILITY_DELAY.keys())


# Job Model (Layer 2 dataclass)

@dataclass(frozen=True)
class Job:
    """Immutable data structure representing a single computational workload."""

    job_id: int
    submit_hour: int
    requested_cpus: int
    runtime_hours: int
    flexibility_class: str

    def __post_init__(self) -> None:
        """Validate field types and values on construction."""
        if not isinstance(self.job_id, int):
            raise TypeError(f"job_id must be int, got {type(self.job_id).__name__}")
        if not isinstance(self.submit_hour, int) or self.submit_hour < 0:
            raise ValueError(f"submit_hour must be a non-negative int, got {self.submit_hour}")
        if not isinstance(self.requested_cpus, int) or self.requested_cpus < 1:
            raise ValueError(f"requested_cpus must be a positive int, got {self.requested_cpus}")
        if not isinstance(self.runtime_hours, int) or self.runtime_hours < 1:
            raise ValueError(f"runtime_hours must be a positive int, got {self.runtime_hours}")
        if self.flexibility_class not in FLEXIBILITY_CLASSES:
            raise ValueError(
                f"flexibility_class must be one of {FLEXIBILITY_CLASSES}, "
                f"got '{self.flexibility_class}'"
            )

    # Flexibility helpers

    @property
    def allowed_delay(self) -> int:
        """Maximum hours this job can be delayed past its submit_hour."""
        return FLEXIBILITY_DELAY[self.flexibility_class]

    def get_latest_start_hour(self) -> int:
        """Return the absolute latest hour_index the job can begin."""
        return self.submit_hour + self.allowed_delay

    # Serialisation helpers

    def to_dict(self) -> dict:
        """Convert to a plain dictionary (useful for CSV / DataFrame rows)."""
        return {
            "job_id": self.job_id,
            "submit_hour": self.submit_hour,
            "requested_cpus": self.requested_cpus,
            "runtime_hours": self.runtime_hours,
            "flexibility_class": self.flexibility_class,
        }

    @classmethod
    def from_dict(cls, row: dict) -> "Job":
        """Construct a Job from a dictionary (e.g. a csv.DictReader row).

        Strictly enforces types — no missing or malformed values allowed.
        """
        try:
            return cls(
                job_id=int(row["job_id"]),
                submit_hour=int(row["submit_hour"]),
                requested_cpus=int(row["requested_cpus"]),
                runtime_hours=int(row["runtime_hours"]),
                flexibility_class=str(row["flexibility_class"]).strip(),
            )
        except KeyError as exc:
            raise ValueError(f"Missing required field: {exc}") from exc
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid data in row {row}: {exc}") from exc


# CSV I/O helpers

CSV_COLUMNS = ["job_id", "submit_hour", "requested_cpus", "runtime_hours", "flexibility_class"]


def write_jobs_csv(jobs: List[Job], path: str | Path = "jobs_input.csv") -> Path:
    """Write a list of Job objects to a CSV file."""
    path = Path(path)
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for job in jobs:
            writer.writerow(job.to_dict())
    return path


def load_jobs_csv(path: str | Path = "jobs_input.csv") -> List[Job]:
    """Parse a CSV file into a list of validated Job objects.

    Raises ValueError if any row has missing or invalid data.
    """
    path = Path(path)
    jobs: List[Job] = []
    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            jobs.append(Job.from_dict(row))
    return jobs


# Workload Generator

# Job "profiles" that mimic real HPC workloads.
# Each profile is a dict of (cpu_range, runtime_range, weight, flex_weights).
JOB_PROFILES = [
    {
        # Small interactive / notebook session
        "name": "interactive",
        "cpu_range": (1, 4),
        "runtime_range": (1, 3),
        "weight": 20,
        "flex_weights": {"rigid": 0.85, "semi-flexible": 0.10, "flexible": 0.05},
    },
    {
        # Medium dev / test job
        "name": "dev-test",
        "cpu_range": (4, 32),
        "runtime_range": (1, 6),
        "weight": 30,
        "flex_weights": {"rigid": 0.20, "semi-flexible": 0.50, "flexible": 0.30},
    },
    {
        # Large training / simulation job
        "name": "training",
        "cpu_range": (32, 128),
        "runtime_range": (4, 24),
        "weight": 30,
        "flex_weights": {"rigid": 0.05, "semi-flexible": 0.25, "flexible": 0.70},
    },
    {
        # Massive batch / overnight job
        "name": "batch",
        "cpu_range": (64, 256),
        "runtime_range": (12, 48),
        "weight": 20,
        "flex_weights": {"rigid": 0.02, "semi-flexible": 0.18, "flexible": 0.80},
    },
]


def _pick_profile() -> dict:
    """Weighted-random selection of a job profile."""
    profiles = JOB_PROFILES
    weights = [p["weight"] for p in profiles]
    return random.choices(profiles, weights=weights, k=1)[0]


def _pick_flexibility(flex_weights: dict) -> str:
    """Weighted-random selection of a flexibility class."""
    classes = list(flex_weights.keys())
    weights = list(flex_weights.values())
    return random.choices(classes, weights=weights, k=1)[0]


def generate_jobs(
    n: int = 100,
    horizon_hours: int = 48,
    seed: int | None = 42,
) -> List[Job]:
    """Generate *n* realistic dummy jobs spread across a *horizon_hours* window.

    Parameters
    ----------
    n : int
        Number of jobs to generate (default 100).
    horizon_hours : int
        The scheduling horizon in hours (default 48).
    seed : int or None
        Random seed for reproducibility.

    Returns
    -------
    list[Job]
        A list of validated Job dataclass instances.
    """
    if seed is not None:
        random.seed(seed)

    jobs: List[Job] = []
    for i in range(1, n + 1):
        profile = _pick_profile()
        cpu_lo, cpu_hi = profile["cpu_range"]
        rt_lo, rt_hi = profile["runtime_range"]

        job = Job(
            job_id=i,
            submit_hour=random.randint(0, horizon_hours - 1),
            requested_cpus=random.randint(cpu_lo, cpu_hi),
            runtime_hours=random.randint(rt_lo, rt_hi),
            flexibility_class=_pick_flexibility(profile["flex_weights"]),
        )
        jobs.append(job)

    return jobs


# Main entry point

def main() -> None:
    output = Path(__file__).resolve().parent / "jobs_input.csv"

    print("Generating 100 realistic dummy jobs …")
    jobs = generate_jobs(n=100, horizon_hours=48, seed=42)
    write_jobs_csv(jobs, output)
    print(f"Wrote {len(jobs)} jobs to {output}")

    # Round-trip validation: reload and verify
    reloaded = load_jobs_csv(output)
    assert len(reloaded) == len(jobs), "Round-trip row count mismatch!"
    for orig, loaded in zip(jobs, reloaded):
        assert orig == loaded, f"Mismatch on job {orig.job_id}"
    print("Round-trip validation passed — all 100 jobs parse cleanly.")

    # Print a sample
    print("\nSample jobs:")
    print(f"{'ID':>4}  {'Submit':>6}  {'CPUs':>5}  {'Hours':>5}  {'Flexibility'}")
    print("-" * 45)
    for j in jobs[:10]:
        print(f"{j.job_id:>4}  {j.submit_hour:>6}  {j.requested_cpus:>5}  "
              f"{j.runtime_hours:>5}  {j.flexibility_class}")

    # Quick flexibility model demo
    demo = jobs[0]
    print(f"\nFlexibility demo for job {demo.job_id} "
          f"(submit_hour={demo.submit_hour}, class={demo.flexibility_class}):")
    print(f"  allowed_delay  = {demo.allowed_delay} hours")
    print(f"  latest_start   = hour {demo.get_latest_start_hour()}")


if __name__ == "__main__":
    main()

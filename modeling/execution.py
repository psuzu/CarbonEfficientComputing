"""Real workload execution helpers for demoing scheduler decisions.

These helpers let the project run a small, real CPU-bound workload tied to the
existing ``Job`` model. They are intentionally lightweight so the repo remains
easy to run without extra system setup.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from importlib import import_module
from multiprocessing import Pool
from typing import Callable, Protocol

from inputs.generate_workload import Job

DEFAULT_FORCE_CPU_POWER_WATTS = 60


class TrackerLike(Protocol):
    def start(self) -> None: ...
    def stop(self) -> float | None: ...


def cpu_burn(duration_seconds: float = 1.0, chunk_size: int = 100_000) -> int:
    """Run a single-process CPU-bound loop for roughly ``duration_seconds``."""
    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")

    deadline = time.perf_counter() + duration_seconds
    accumulator = 0
    while time.perf_counter() < deadline:
        for value in range(chunk_size):
            accumulator += value * value
    return accumulator


def _parallel_worker(iterations: int) -> int:
    total = 0
    for value in range(iterations):
        total += value * value
    return total


def parallel_cpu_job(
    num_workers: int = 4,
    iterations: int = 1_000_000,
    pool_factory: Callable[..., Pool] = Pool,
) -> list[int]:
    """Run a real parallel CPU workload using multiple processes."""
    if not isinstance(num_workers, int) or num_workers < 1:
        raise ValueError(f"num_workers must be a positive int, got {num_workers}")
    if not isinstance(iterations, int) or iterations < 1:
        raise ValueError(f"iterations must be a positive int, got {iterations}")

    with pool_factory(processes=num_workers) as pool:
        return pool.map(_parallel_worker, [iterations] * num_workers)


@dataclass(frozen=True)
class JobExecutionResult:
    """Summary of one real workload execution."""

    job_id: int
    workload_name: str
    requested_cpus: int
    wall_time_seconds: float
    measured_emissions_kgco2e: float | None = None
    completed: bool = True


def create_emissions_tracker(
    project_name: str = "carbon-efficient-computing",
    force_cpu_power: int = DEFAULT_FORCE_CPU_POWER_WATTS,
) -> TrackerLike:
    """Create an offline CodeCarbon tracker with macOS-friendly defaults.

    These defaults aim to avoid admin prompts and reduce noisy output during
    demos:
    - use offline mode with a fixed country code
    - disable local CSV logging
    - suppress logger output
    - keep the tracker process local to this run
    """
    try:
        module = import_module("codecarbon")
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "CodeCarbon is not installed. Run `pip install codecarbon` to enable measured emissions."
        ) from exc

    tracker_class = getattr(module, "OfflineEmissionsTracker")
    return tracker_class(
        country_iso_code="USA",
        project_name=project_name,
        save_to_file=False,
        log_level="error",
        tracking_mode="process",
        force_cpu_power=force_cpu_power,
        force_mode_cpu_load=True,
        allow_multiple_runs=False,
        api_call_interval=-1,
    )


def run_real_job(
    job: Job,
    duration_seconds: float = 1.0,
    iterations: int = 1_000_000,
    pool_factory: Callable[..., Pool] = Pool,
) -> JobExecutionResult:
    """Execute a demo workload based on the Job's shape.

    Mapping:
    - ``interactive`` and ``dev-test`` run a single-process CPU burn.
    - ``training`` and ``batch`` run a multi-process workload sized by
      ``job.requested_cpus``.
    """
    start = time.perf_counter()
    if job.workload_class in {"training", "batch"}:
        parallel_cpu_job(
            num_workers=job.requested_cpus,
            iterations=iterations,
            pool_factory=pool_factory,
        )
        workload_name = "parallel_cpu_job"
    else:
        cpu_burn(duration_seconds=duration_seconds)
        workload_name = "cpu_burn"

    return JobExecutionResult(
        job_id=job.job_id,
        workload_name=workload_name,
        requested_cpus=job.requested_cpus,
        wall_time_seconds=round(time.perf_counter() - start, 4),
    )


def measure_job_with_codecarbon(
    job: Job,
    duration_seconds: float = 1.0,
    iterations: int = 1_000_000,
    pool_factory: Callable[..., Pool] = Pool,
    tracker_factory: Callable[[], TrackerLike] = create_emissions_tracker,
) -> JobExecutionResult:
    """Run a real workload and measure emissions with CodeCarbon."""
    tracker = tracker_factory()
    tracker.start()
    result = run_real_job(
        job,
        duration_seconds=duration_seconds,
        iterations=iterations,
        pool_factory=pool_factory,
    )
    measured_emissions = tracker.stop()
    return JobExecutionResult(
        job_id=result.job_id,
        workload_name=result.workload_name,
        requested_cpus=result.requested_cpus,
        wall_time_seconds=result.wall_time_seconds,
        measured_emissions_kgco2e=None if measured_emissions is None else float(measured_emissions),
        completed=result.completed,
    )


def make_job_tracker_factory(job: Job) -> Callable[[], TrackerLike]:
    """Build a tracker factory that avoids privileged hardware probes.

    We provide a forced CPU max-power estimate based on the repo's simple power
    model so CodeCarbon can stay in a no-sudo demo path.
    """
    force_cpu_power = max(DEFAULT_FORCE_CPU_POWER_WATTS, 60 + job.requested_cpus * 12)
    return lambda: create_emissions_tracker(force_cpu_power=force_cpu_power)


__all__ = [
    "JobExecutionResult",
    "create_emissions_tracker",
    "cpu_burn",
    "make_job_tracker_factory",
    "measure_job_with_codecarbon",
    "parallel_cpu_job",
    "run_real_job",
]

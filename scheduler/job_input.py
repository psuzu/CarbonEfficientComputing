"""Layer 1 – Job Input: ingests raw job submissions and normalises them."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from inputs.generate_workload import Job, load_jobs_csv
from inputs.carbonsignal import CarbonSignalPoint, load_carbon_signal_csv
from inputs.cluster_state import ClusterState, default_cluster


@dataclass
class SchedulerInput:
    """Everything the scheduler needs to make decisions."""

    jobs: list[Job]
    carbon_signal: list[CarbonSignalPoint]
    cluster: ClusterState


def load_scheduler_input(
    jobs_path: str | None = None,
    carbon_path: str | None = None,
    cluster: ClusterState | None = None,
) -> SchedulerInput:
    """Load jobs and carbon signal from disk; fall back to defaults."""
    jobs = load_jobs_csv(jobs_path) if jobs_path else []
    signal = load_carbon_signal_csv(carbon_path) if carbon_path else []
    return SchedulerInput(
        jobs=jobs,
        carbon_signal=signal,
        cluster=cluster or default_cluster(),
    )

"""Layer 2 – Constraint Handler: filters ScoredJobs against cluster capacity and deadlines."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from inputs.cluster_state import ClusterState
from scheduler.job_model import ScoredJob


class RejectionReason(str, Enum):
    DEADLINE_EXCEEDED = "deadline_exceeded"
    INSUFFICIENT_CPUS = "insufficient_cpus"
    INSUFFICIENT_GPUS = "insufficient_gpus"
    INSUFFICIENT_NODES = "insufficient_nodes"


@dataclass
class ConstraintResult:
    scored_job: ScoredJob
    feasible: bool
    rejection_reason: RejectionReason | None = None


def check_constraints(scored_job: ScoredJob, cluster: ClusterState, horizon: int) -> ConstraintResult:
    """Return whether a ScoredJob can be scheduled given current cluster state."""
    job = scored_job.job
    start = scored_job.scheduled_start

    # Deadline: job must finish within the horizon
    if start is None or (start + job.runtime_hours) > horizon:
        return ConstraintResult(scored_job, feasible=False, rejection_reason=RejectionReason.DEADLINE_EXCEEDED)

    if not cluster.can_allocate(
        requested_cpus=job.requested_cpus,
        requested_gpus=job.requested_gpus,
    ):
        if job.requested_cpus > cluster.processors_available:
            reason = RejectionReason.INSUFFICIENT_CPUS
        elif job.requested_gpus > cluster.gpus_available:
            reason = RejectionReason.INSUFFICIENT_GPUS
        else:
            reason = RejectionReason.INSUFFICIENT_NODES
        return ConstraintResult(scored_job, feasible=False, rejection_reason=reason)

    return ConstraintResult(scored_job, feasible=True)


def filter_feasible(
    scored_jobs: list[ScoredJob],
    cluster: ClusterState,
    horizon: int,
) -> tuple[list[ConstraintResult], list[ConstraintResult]]:
    """Split scored jobs into (feasible, rejected) lists."""
    feasible, rejected = [], []
    for sj in scored_jobs:
        result = check_constraints(sj, cluster, horizon)
        (feasible if result.feasible else rejected).append(result)
    return feasible, rejected

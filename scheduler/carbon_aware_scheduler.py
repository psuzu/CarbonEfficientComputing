"""Layer 3 – Carbon-Aware Scheduler: orchestrates all components."""

from __future__ import annotations

from dataclasses import dataclass

from inputs.cluster_state import ClusterState
from inputs.carbonsignal import CarbonSignalPoint
from inputs.generate_workload import Job

from scheduler.job_model import ScoredJob, score_all
from scheduler.constraint_handler import ConstraintResult, filter_feasible
from scheduler.policy_mode import PolicyMode, select_policy, sort_by_policy


@dataclass
class ScheduleResult:
    scheduled: list[ConstraintResult]
    rejected: list[ConstraintResult]
    policy_used: PolicyMode


class CarbonAwareScheduler:
    """
    Orchestrates job scoring, constraint checking, and policy-based ordering
    to produce a carbon-efficient schedule.
    """

    def __init__(
        self,
        carbon_threshold_gco2: float = 300.0,
        horizon_hours: int = 48,
    ) -> None:
        self.carbon_threshold_gco2 = carbon_threshold_gco2
        self.horizon_hours = horizon_hours

    def schedule(
        self,
        jobs: list[Job],
        carbon_signal: list[CarbonSignalPoint],
        cluster: ClusterState,
    ) -> ScheduleResult:
        # 1. Score each job against the carbon signal (job model)
        scored = score_all(jobs, carbon_signal)

        # 2. Select policy based on current carbon intensity
        current_carbon = carbon_signal[0].carbon_signal_gco2_per_kwh if carbon_signal else 0.0
        policy = select_policy(self.carbon_threshold_gco2, current_carbon)

        # 3. Sort by policy priority
        sorted_jobs = sort_by_policy(scored, policy)

        # 4. Apply constraints
        feasible, rejected = filter_feasible(sorted_jobs, cluster, self.horizon_hours)

        return ScheduleResult(
            scheduled=feasible,
            rejected=rejected,
            policy_used=policy,
        )

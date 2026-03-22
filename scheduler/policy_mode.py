"""Layer 3 – Policy Mode Selector: chooses the scheduling strategy."""

from __future__ import annotations

from enum import Enum

from scheduler.job_model import ScoredJob


class PolicyMode(str, Enum):
    CARBON_AWARE = "carbon_aware"       # minimise carbon at all costs
    BALANCED = "balanced"               # trade-off carbon vs. latency
    PERFORMANCE = "performance"         # minimise wait time, ignore carbon


def select_policy(
    carbon_threshold_gco2: float,
    current_carbon: float,
) -> PolicyMode:
    """Pick a policy based on how the current carbon intensity compares to a threshold."""
    ratio = current_carbon / carbon_threshold_gco2 if carbon_threshold_gco2 > 0 else 1.0
    if ratio <= 0.75:
        return PolicyMode.CARBON_AWARE
    elif ratio <= 1.25:
        return PolicyMode.BALANCED
    else:
        return PolicyMode.PERFORMANCE


def sort_by_policy(jobs: list[ScoredJob], mode: PolicyMode) -> list[ScoredJob]:
    """Return jobs sorted according to the active policy."""
    if mode == PolicyMode.CARBON_AWARE:
        return sorted(jobs, key=lambda sj: sj.carbon_score)
    elif mode == PolicyMode.PERFORMANCE:
        return sorted(jobs, key=lambda sj: sj.earliest_start)
    else:  # BALANCED
        return sorted(jobs, key=lambda sj: (sj.carbon_score, sj.earliest_start))

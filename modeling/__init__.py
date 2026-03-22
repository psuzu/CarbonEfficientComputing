"""Layer 2 modeling package."""

from .emissions import (
    DEFAULT_POWER_MODEL,
    JobEmissionEstimate,
    PowerModel,
    annotate_jobs_with_carbon_scores,
    average_carbon_intensity,
    estimate_energy_kwh,
    estimate_job_emissions,
    estimate_power_watts,
    score_job,
)
from .timeslots import (
    DEFAULT_CAPACITY_PER_HOUR,
    DEFAULT_HORIZON_HOURS,
    allocate,
    capacity_array,
    check_fit,
    make_capacity_array,
    reset_capacity,
)

__all__ = [
    "DEFAULT_CAPACITY_PER_HOUR",
    "DEFAULT_HORIZON_HOURS",
    "DEFAULT_POWER_MODEL",
    "JobEmissionEstimate",
    "PowerModel",
    "allocate",
    "annotate_jobs_with_carbon_scores",
    "average_carbon_intensity",
    "capacity_array",
    "check_fit",
    "estimate_energy_kwh",
    "estimate_job_emissions",
    "estimate_power_watts",
    "make_capacity_array",
    "reset_capacity",
    "score_job",
]
